/** Synthetic browser chat only: normal person sessions, no WhatsApp credentials or delivery. */
import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import type { WhatsAppConversation, WhatsAppReply, WhatsAppSession, WhatsAppMessageResult } from "@aimo/contracts";
import { config } from "../config.js";
import { DEMO_GROUPS, groupConfig, groupSelection, selectGroup } from "./groups.js";
import { nowIso } from "../clock.js";
import { kvGet, kvSet } from "../db.js";
import { resolveToken, tokenFrom, type Person } from "../identity.js";
import { sha256, stableStringify } from "../util.js";

/** Completed deliveries are deduplicated. A rejected handler can be retried in
 * its original context, so mutations before throwing must also be idempotent. */
export type WhatsAppHandler = (arg: {
  person: Person;
  token: string;
  conversation: WhatsAppConversation;
  text: string;
  messageId: string;
  channel?: "web" | "simulator";
}) => Promise<{ conversation: WhatsAppConversation; reply: WhatsAppReply }>;

interface Delivery {
  id: string;
  text: string;
  connectionId: string;
  status: "processing" | "failed" | "complete";
  contextFingerprint?: string;
  result?: WhatsAppSession;
}
interface StoredSession {
  connectionId: string;
  groupRevision: string;
  session: WhatsAppSession;
  deliveries: Delivery[];
}
type MessageResult = { status: number; body: WhatsAppMessageResult | { error: string; code?: "stale_message_context" } };
type MessageFlight = { text: string; result: Promise<MessageResult> };
const result = (status: number, body: MessageResult["body"]): MessageResult => ({ status, body });
const inFlight = new Map<string, Map<string, MessageFlight>>();

const ConnectBody = z.object({ displayName: z.string().trim().min(1).max(80).optional() }).strict();
const MessageBody = z.object({
  id: z.string().min(1).max(128).refine((s) => s.trim().length > 0),
  text: z.string().min(1).max(8000).refine((s) => s.trim().length > 0),
  groupId: z.string().max(128).nullable().optional(),
}).strict();
const emptyConversation = (): WhatsAppConversation => ({ activeOrderId: null, pending: null });
const key = (person: Person) => `whatsapp:person:${person.id}`;
function initial(person: Person): StoredSession {
  const selection = groupSelection();
  return {
    connectionId: randomUUID(),
    groupRevision: selection.revision,
    session: { connected: false, simulated: true, displayName: person.name, groupId: selection.groupId, messages: [], conversation: emptyConversation() },
    deliveries: [],
  };
}
function read(person: Person): StoredSession {
  const stored = kvGet<StoredSession>(key(person)) ?? initial(person);
  const selection = groupSelection();
  if (stored.groupRevision !== selection.revision || stored.session.groupId !== selection.groupId) {
    stored.groupRevision = selection.revision;
    stored.session.groupId = selection.groupId;
    stored.connectionId = randomUUID();
    stored.session.messages = [];
    stored.session.conversation = emptyConversation();
    kvSet(key(person), stored);
  }
  return stored;
}

function ignoredMessage(groupId: string | null): MessageResult | null {
  if (groupId === groupSelection().groupId) return null;
  return result(200, { ignored: groupId === null ? "direct_message" : "other_group" });
}

// All router instances in this Node service share the queue. Connect and disconnect
// join it too, so a queued message cannot send after a completed disconnect.
const queues = new Map<string, Promise<void>>();
async function serialized<T>(personId: string, fn: () => Promise<T> | T): Promise<T> {
  const task = (queues.get(personId) ?? Promise.resolve()).then(fn);
  const tail = task.then(() => {}, () => {});
  queues.set(personId, tail);
  try {
    return await task;
  } finally {
    if (queues.get(personId) === tail) queues.delete(personId);
  }
}

function authenticate(req: Request) {
  try {
    const identity = resolveToken(tokenFrom(req));
    return identity?.kind === "person" ? identity : null;
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

export function whatsappRouter(handler: WhatsAppHandler): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Like the existing demo clock, this is available on the person picker.
  // The preview gate still applies; changes are disabled outside test mode.
  router.get("/config", (_req, res) => res.json(groupConfig()));
  router.post("/config", (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const body = z.object({ groupId: z.string().refine((id) => DEMO_GROUPS.some((g) => g.id === id)) }).strict().safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "Choose one of the configured demo groups" });
    // Do not change message authorization while any handler or queued send is running.
    if (inFlight.size) return res.status(409).json({ error: "Finish sending current messages before changing the WhatsApp group" });
    res.json(selectGroup(body.data.groupId));
  });
  router.use((req, res, next) => {
    if (!authenticate(req)) return res.status(401).json({ error: "Pick who you are viewing as" });
    next();
  });

  router.get("/session", (req, res) => {
    const identity = authenticate(req)!;
    res.json(read(identity.person).session);
  });

  router.post("/connect", async (req, res) => {
    const parsed = ConnectBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Use an optional display name of 1–80 characters" });
    const identity = authenticate(req)!;
    await serialized(identity.person.id, () => {
      if (!authenticate(req)) return res.status(401).json({ error: "Pick who you are viewing as" });
      const stored = read(identity.person);
      if (!stored.session.connected) {
        // Reconnect starts a new chat. Keep delivery records to reject replay of
        // messages from a previous connection rather than repeat an order action.
        stored.connectionId = randomUUID();
        stored.session.messages = [];
        stored.session.conversation = emptyConversation();
      }
      stored.session.connected = true;
      stored.session.displayName = parsed.data.displayName ?? stored.session.displayName;
      kvSet(key(identity.person), stored);
      return res.json(stored.session);
    });
  });

  router.post("/disconnect", async (req, res) => {
    const identity = authenticate(req)!;
    await serialized(identity.person.id, () => {
      if (!authenticate(req)) return res.status(401).json({ error: "Pick who you are viewing as" });
      const stored = read(identity.person);
      stored.session.connected = false;
      stored.session.conversation = emptyConversation();
      kvSet(key(identity.person), stored);
      return res.json(stored.session);
    });
  });

  router.post("/messages", async (req, res) => {
    const parsed = MessageBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A message id (1–128 characters) and text (1–8000 characters) are required" });
    const identity = authenticate(req)!;
    const { id, text } = parsed.data;
    const groupId = parsed.data.groupId ?? null;
    const ignored = ignoredMessage(groupId);
    if (ignored) return res.status(ignored.status).json(ignored.body);
    const personFlights = inFlight.get(identity.person.id) ?? new Map<string, MessageFlight>();
    const flight = personFlights.get(id);
    if (flight) {
      if (flight.text !== text) return res.status(409).json({ error: "This message id was already used with different text" });
      const response = await flight.result;
      return res.status(response.status).json(response.body);
    }
    const task = serialized(identity.person.id, async (): Promise<MessageResult> => {
      if (!authenticate(req)) return result(401, { error: "Pick who you are viewing as" });
      const ignored = ignoredMessage(groupId);
      if (ignored) return ignored;
      const stored = read(identity.person);
      if (!stored.session.connected) return result(409, { error: "Connect the simulated chat before sending" });
      let delivery = stored.deliveries.find((d) => d.id === id);
      if (delivery && delivery.text !== text) return result(409, { error: "This message id was already used with different text" });
      if (delivery && delivery.connectionId !== stored.connectionId) return result(409, { error: "This message belongs to an earlier chat. Start a new message." });
      // The simulator replaces its displayed session with this response. An
      // older cached preview could show one proposal while "confirm change"
      // accepts a newer one. Return current context without repeating delivery.
      if (delivery?.status === "complete") return result(200, stored.session);
      // A persisted in-flight record after a server restart has an uncertain
      // outcome. Do not invoke the handler again and risk repeating a purchase.
      if (delivery?.status === "processing") return result(409, { error: "This message has an unknown outcome. Check the order before starting a new message." });
      const contextFingerprint = sha256(stableStringify(stored.session.conversation));
      if (delivery?.status === "failed" && delivery.contextFingerprint !== contextFingerprint) {
        return result(409, { error: "The chat changed after this message failed. Review the latest basket and send a new request.", code: "stale_message_context" });
      }
      if (!delivery) {
        delivery = { id, text, connectionId: stored.connectionId, status: "processing", contextFingerprint };
        stored.deliveries.push(delivery);
      }
      delivery.status = "processing";
      kvSet(key(identity.person), stored);
      const at = nowIso();
      // A demo reset deletes both the session and credentials. Never restore the
      // old history if it happens while the handler is awaiting a lookup/model.
      const stillCurrent = () => authenticate(req) && kvGet<StoredSession>(key(identity.person))?.connectionId === stored.connectionId;
      let handled: Awaited<ReturnType<WhatsAppHandler>>;
      try {
        handled = await handler({
          person: identity.person,
          token: identity.token,
          conversation: structuredClone(stored.session.conversation),
          text,
          messageId: id,
        });
      } catch {
        if (!stillCurrent()) return result(409, { error: "The demo session changed. Reload the chat." });
        // The last instruction did not produce a reviewed replacement. Do not
        // leave an older proposal actionable after this failure.
        stored.session.conversation.pending = null;
        delivery.status = "failed";
        kvSet(key(identity.person), stored);
        // Handler errors may contain upstream credentials; never send them to the browser.
        return result(502, { error: "The message could not be completed. Retry with the same message id." });
      }
      if (!stillCurrent()) return result(409, { error: "The demo session changed. Reload the chat." });
      stored.session.conversation = handled.conversation;
      stored.session.messages.push(
        { id, direction: "inbound", text, at },
        { id: `${id}:reply`, direction: "outbound", text: handled.reply.text, at: nowIso(), reply: handled.reply },
      );
      delivery.status = "complete";
      delivery.result = structuredClone(stored.session);
      kvSet(key(identity.person), stored);
      return result(200, stored.session);
    });
    // Share the full outcome, including failures, with concurrent retries. A
    // later explicit retry can retry a failed handler without duplicating a
    // concurrent failed attempt.
    personFlights.set(id, { text, result: task });
    inFlight.set(identity.person.id, personFlights);
    try {
      const response = await task;
      return res.status(response.status).json(response.body);
    } finally {
      personFlights.delete(id);
      if (!personFlights.size && inFlight.get(identity.person.id) === personFlights) inFlight.delete(identity.person.id);
    }
  });

  return router;
}
