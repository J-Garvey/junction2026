import { randomUUID } from "node:crypto";
import type { WhatsAppConversation, WhatsAppWebStatus } from "@aimo/contracts";
import { kvGet, kvSet } from "../db.js";
import { resolveToken, type Person } from "../identity.js";
import { sha256 } from "../util.js";
import type { WhatsAppHandler } from "./routes.js";
import { createWhatsAppBrowser, encodePairingQr, type WhatsAppBrowserClient, type WebInboundMessage } from "./web-client.js";

export class WhatsAppWebError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Selection = { account: string; groupId: string; revision: string; since: number };
type Options = { createClient?: () => Promise<WhatsAppBrowserClient>; encodeQr?: (value: string) => Promise<string>; clock?: () => number };
const freshState = (): WhatsAppWebStatus => ({ phase: "disconnected", qrDataUrl: null, accountName: null, ownerName: null, groups: [], selectedGroupId: null, busy: false, lastError: null, lastMessageAt: null, handledMessages: 0 });

/** One explicitly linked account per API process. The sender and destination come
 * from WhatsApp events, never from an HTTP message body or the model. */
export class WhatsAppWebBridge {
  private state = freshState();
  private owner: { person: Person; token: string } | null = null;
  private client: WhatsAppBrowserClient | null = null;
  private account: string | null = null;
  private epoch = 0;
  private runId = "";
  private readyAt = Infinity;
  private pendingCount = 0;
  private queue: Promise<void> = Promise.resolve();
  private clock: () => number;
  constructor(private handler: WhatsAppHandler, private options: Options = {}) { this.clock = options.clock ?? Date.now; }

  private assertOwner(person: Person) {
    if (this.owner && this.owner.person.id !== person.id) throw new WhatsAppWebError(403, `WhatsApp Web is controlled by ${this.owner.person.name}. Switch to that person to manage it.`);
  }
  private selection(): Selection | null {
    const saved = kvGet<Selection>("whatsapp-web:group");
    return saved?.account === this.account && this.state.groups.some((g) => g.id === saved.groupId) ? saved : null;
  }
  status(person: Person): WhatsAppWebStatus {
    this.assertOwner(person);
    this.state.selectedGroupId = this.selection()?.groupId ?? null;
    return structuredClone(this.state);
  }
  async connect(person: Person, token: string): Promise<WhatsAppWebStatus> {
    this.assertOwner(person);
    if (this.owner && !["disconnected", "error"].includes(this.state.phase)) {
      this.owner = { person, token };
      return this.status(person);
    }
    const epoch = ++this.epoch;
    this.owner = { person, token };
    this.runId = randomUUID();
    this.readyAt = Infinity;
    this.account = null;
    this.state = { ...freshState(), phase: "starting", ownerName: person.name };
    try {
      if (this.client) await this.client.destroy().catch(() => {});
      const client = await (this.options.createClient ?? createWhatsAppBrowser)();
      if (epoch !== this.epoch) { await client.destroy().catch(() => {}); return this.status(person); }
      this.client = client;
      let qrGeneration = 0;
      client.on("qr", (value: string) => {
        const generation = ++qrGeneration;
        if (epoch !== this.epoch || typeof value !== "string") return;
        this.state.phase = "qr";
        this.state.qrDataUrl = null;
        void (this.options.encodeQr ?? encodePairingQr)(value).then((data) => {
          if (epoch === this.epoch && generation === qrGeneration && this.state.phase === "qr") this.state.qrDataUrl = data;
        }).catch(() => { if (epoch === this.epoch) this.state.lastError = "The pairing QR could not be rendered. Reconnect to try again."; });
      });
      client.on("authenticated", () => { if (epoch === this.epoch) { this.state.phase = "authenticated"; this.state.qrDataUrl = null; } });
      client.on("ready", () => { void this.onReady(epoch, client).catch(() => this.failed(epoch, "WhatsApp account details could not be loaded. Reconnect to try again.")); });
      client.on("auth_failure", () => {
        this.failed(epoch, "WhatsApp rejected this linked-device session. Disconnect and pair again.");
        if (epoch === this.epoch) void client.destroy().catch(() => {});
      });
      client.on("disconnected", () => { if (epoch === this.epoch) { this.state.phase = "disconnected"; this.state.qrDataUrl = null; this.state.groups = []; this.state.selectedGroupId = null; } });
      client.on("message_create", (message: WebInboundMessage) => {
        if (epoch === this.epoch) void this.receive(message).catch(() => { this.state.lastError = "The message could not be recorded. Check the server and order before retrying."; });
      });
      void client.initialize().catch(() => {
        if (epoch === this.epoch) {
          this.failed(epoch, "WhatsApp Web could not start. Check Chrome is installed or set WHATSAPP_CHROME_PATH, then reconnect.");
          void client.destroy().catch(() => {});
        }
      });
    } catch { this.failed(epoch, "The WhatsApp browser could not be created. Check the server setup and reconnect."); }
    return this.status(person);
  }
  private failed(epoch: number, message: string) {
    if (epoch !== this.epoch) return;
    this.state.phase = "error"; this.state.qrDataUrl = null; this.state.lastError = message;
  }
  private async onReady(epoch: number, client: WhatsAppBrowserClient) {
    if (epoch !== this.epoch || this.state.phase === "error" || this.state.phase === "disconnected") return;
    const account = client.getAccount();
    if (!account) { this.failed(epoch, "WhatsApp did not provide an account identity. Reconnect before enabling a group."); return; }
    try {
      const groups = await client.getGroups();
      if (epoch !== this.epoch) return;
      this.account = sha256(account.id);
      this.state.groups = groups.filter((g) => g.id.endsWith("@g.us"));
      this.state.accountName = account.name;
      this.state.phase = "ready";
      this.state.qrDataUrl = null;
      this.state.lastError = null;
      this.readyAt = Math.floor(this.clock() / 1000);
      this.state.selectedGroupId = this.selection()?.groupId ?? null;
    } catch { this.failed(epoch, "WhatsApp connected, but its groups could not be loaded. Reconnect to try again."); }
  }
  async refreshGroups(person: Person): Promise<WhatsAppWebStatus> {
    this.assertOwner(person);
    if (this.pendingCount) throw new WhatsAppWebError(409, "Wait for the current group message to finish before refreshing groups.");
    if (this.state.phase !== "ready" || !this.client) throw new WhatsAppWebError(409, "Pair WhatsApp Web before loading groups.");
    const epoch = this.epoch;
    try {
      const groups = await this.client.getGroups();
      if (epoch === this.epoch) this.state.groups = groups.filter((g) => g.id.endsWith("@g.us"));
    } catch { throw new WhatsAppWebError(502, "Could not refresh WhatsApp groups. Try again."); }
    return this.status(person);
  }
  selectGroup(person: Person, groupId: string | null): WhatsAppWebStatus {
    this.assertOwner(person);
    if (this.state.phase !== "ready" || !this.account) throw new WhatsAppWebError(409, "Pair WhatsApp Web before selecting a group.");
    if (this.pendingCount) throw new WhatsAppWebError(409, "Wait for the current group message to finish before changing groups.");
    if (groupId !== null && !this.state.groups.some((g) => g.id === groupId && g.id.endsWith("@g.us"))) throw new WhatsAppWebError(400, "Select a group from the linked WhatsApp account.");
    if (groupId === null) kvSet("whatsapp-web:group", null);
    else if (this.selection()?.groupId !== groupId) kvSet("whatsapp-web:group", { account: this.account, groupId, revision: randomUUID(), since: Math.floor(this.clock() / 1000) });
    return this.status(person);
  }
  async disconnect(person: Person): Promise<WhatsAppWebStatus> {
    this.assertOwner(person);
    if (this.pendingCount) throw new WhatsAppWebError(409, "Wait for the current group message to finish before disconnecting.");
    await this.close(true);
    return this.status(person);
  }
  /** Server shutdown closes the dedicated browser but keeps the linked-device profile. */
  async close(logout = false): Promise<void> {
    ++this.epoch;
    const client = this.client;
    this.client = null;
    this.state = freshState(); this.owner = null; this.account = null; this.readyAt = Infinity;
    if (client) {
      if (logout) await client.logout().catch(() => {});
      await client.destroy().catch(() => {});
    }
  }

  async receive(message: WebInboundMessage): Promise<void> {
    const selection = this.selection();
    const groupId = message.fromMe ? message.to : message.from;
    const sender = message.fromMe ? "linked-account" : message.author;
    const outboundKey = `whatsapp-web:outbound:${sha256(`${this.account}:${groupId}:${message.body ?? ""}`)}`;
    // No reply, interpretation, read receipt or model call for any other chat,
    // history sync, bot reply, status, attachment or missing group sender.
    if (this.state.phase !== "ready" || !selection || groupId !== selection.groupId || !groupId.endsWith("@g.us") || message.isStatus || message.hasMedia || message.type !== "chat" || !sender || !message.id?._serialized || !message.body?.trim() || message.body.length > 8000 || !Number.isFinite(message.timestamp) || message.timestamp < Math.max(this.readyAt, selection.since)) return;
    // Support a person typing from the linked phone, without reacting to our
    // own sendMessage echo (which may arrive before sendText resolves).
    if (message.fromMe && (message.body.startsWith("Aimo Copilot · demo orders\n") || kvGet(outboundKey))) return;
    const epoch = this.epoch;
    this.pendingCount++;
    this.state.busy = true;
    const task = this.queue.then(async () => {
      const owner = this.owner;
      const identity = owner ? resolveToken(owner.token) : null;
      if (epoch !== this.epoch || !owner || identity?.kind !== "person" || identity.person.id !== owner.person.id || this.selection()?.revision !== selection.revision || !this.client) return;
      const messageKey = `whatsapp-web:delivery:${sha256(`${this.account}:${message.id._serialized}`)}`;
      // Any interrupted/uncertain delivery fails closed. Replayed messages never
      // repeat a purchase or resend a reply with an uncertain outcome.
      if (kvGet(messageKey)) return;
      kvSet(messageKey, { state: "processing" });
      const conversationKey = `whatsapp-web:conversation:${sha256(`${this.account}:${this.runId}:${selection.revision}:${sender}`)}`;
      const conversation = kvGet<WhatsAppConversation>(conversationKey) ?? { activeOrderId: null, pending: null };
      try {
        const handled = await this.handler({ person: identity.person, token: owner.token, conversation, text: message.body, messageId: message.id._serialized, channel: "web" });
        if (epoch !== this.epoch || this.selection()?.revision !== selection.revision || !resolveToken(owner.token) || !this.client) return;
        kvSet(conversationKey, handled.conversation);
        kvSet(messageKey, { state: "sending" });
        kvSet(`whatsapp-web:outbound:${sha256(`${this.account}:${selection.groupId}:${handled.reply.text}`)}`, true);
        await this.client.sendText(selection.groupId, handled.reply.text);
        kvSet(messageKey, { state: "sent" });
        this.state.lastMessageAt = new Date(this.clock()).toISOString();
        this.state.handledMessages++;
        this.state.lastError = null;
      } catch {
        // A failed request or uncertain reply must not leave an old or unseen
        // proposal actionable. Never restore context after reset/reconnection.
        if (epoch === this.epoch && this.selection()?.revision === selection.revision && resolveToken(owner.token)) {
          const latest = kvGet<WhatsAppConversation>(conversationKey) ?? conversation;
          kvSet(conversationKey, { ...latest, pending: null });
        }
        // Never echo arbitrary upstream errors or message contents into a group.
        this.state.lastError = "A group message could not be completed or its reply confirmed. Check the order and group before sending a new request.";
      }
    });
    this.queue = task.catch(() => {});
    try { await task; } finally { this.pendingCount--; this.state.busy = this.pendingCount > 0; }
  }
}
