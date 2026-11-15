import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppHandler } from "../src/whatsapp/routes.js";
import type { WhatsAppBrowserClient, WebInboundMessage } from "../src/whatsapp/web-client.js";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset } = await import("../src/seed.js");
const { getPerson, issueToken } = await import("../src/identity.js");
const { WhatsAppWebBridge } = await import("../src/whatsapp/web.js");
const { whatsappWebRouter } = await import("../src/whatsapp/web-routes.js");
const GROUP = "120300001@g.us";
const OTHER = "120300002@g.us";
const NOW = 1_800_000_000_000;
class Browser extends EventEmitter implements WhatsAppBrowserClient {
  initialize = vi.fn(async () => {});
  destroy = vi.fn(async () => {});
  logout = vi.fn(async () => {});
  getAccount = vi.fn(() => ({ id: "111111@c.us", name: "Test account" }));
  getGroups = vi.fn(async () => [{ id: GROUP, name: "Kitchen" }, { id: OTHER, name: "Conference" }, { id: "111@c.us", name: "Private" }]);
  sendText = vi.fn(async (_group: string, _text: string) => {});
}
function message(overrides: Partial<WebInboundMessage> = {}): WebInboundMessage {
  return { id: { _serialized: "message-1" }, from: GROUP, author: "sender-one@lid", body: "summary", fromMe: false, timestamp: NOW / 1000, type: "chat", ...overrides };
}
let browser: Browser;
let bridge: InstanceType<typeof WhatsAppWebBridge>;
let handler: ReturnType<typeof vi.fn<WhatsAppHandler>>;
let createClient: ReturnType<typeof vi.fn<() => Promise<WhatsAppBrowserClient>>>;
let token: string;
const person = () => getPerson("p-aino")!;
beforeEach(() => {
  seedReset();
  token = issueToken({ kind: "person", personId: "p-aino" });
  browser = new Browser();
  handler = vi.fn<WhatsAppHandler>(async ({ conversation, text }) => ({ conversation: { ...conversation, activeOrderId: "evt-wedding" }, reply: { text: `Reply: ${text}`, status: "summary", actions: [] } }));
  createClient = vi.fn(async () => browser);
  bridge = new WhatsAppWebBridge(handler, { createClient, encodeQr: async () => "data:image/png;base64,dGVzdA==", clock: () => NOW });
});
afterEach(async () => { await bridge.close(); });
async function ready(select = true) {
  await bridge.connect(person(), token);
  browser.emit("ready");
  await vi.waitFor(() => expect(bridge.status(person()).phase).toBe("ready"));
  if (select) bridge.selectGroup(person(), GROUP);
}
function latch() { let release!: () => void; return { promise: new Promise<void>((r) => { release = r; }), release: () => release() }; }

describe("regular WhatsApp Web bridge", () => {
  it("starts only on explicit connect, renders pairing QR privately and connects idempotently", async () => {
    expect(bridge.status(person()).phase).toBe("disconnected");
    expect(createClient).not.toHaveBeenCalled();
    expect((await bridge.connect(person(), token)).phase).toBe("starting");
    await bridge.connect(person(), token);
    expect(createClient).toHaveBeenCalledTimes(1);
    browser.emit("qr", "test-only-pairing-data");
    await vi.waitFor(() => expect(bridge.status(person()).qrDataUrl).toMatch(/^data:image\/png/));
    expect(JSON.stringify(bridge.status(person()))).not.toContain("test-only-pairing-data");
    expect(() => bridge.status(getPerson("p-sanna")!)).toThrow("controlled by Aino");
    browser.emit("authenticated");
    expect(bridge.status(person())).toMatchObject({ phase: "authenticated", qrDataUrl: null });
  });

  it("loads only real groups and starts paused until a group is explicitly selected", async () => {
    await ready(false);
    expect(bridge.status(person()).groups.map((g) => g.id)).toEqual([GROUP, OTHER]);
    expect(bridge.status(person()).selectedGroupId).toBeNull();
    await bridge.receive(message());
    expect(handler).not.toHaveBeenCalled();
    expect(() => bridge.selectGroup(person(), "Kitchen")).toThrow("Select a group");
    expect(() => bridge.selectGroup(person(), "111@c.us")).toThrow("Select a group");
    expect(bridge.selectGroup(person(), GROUP).selectedGroupId).toBe(GROUP);
  });

  it("ignores DMs, other groups, unaddressed outgoing messages, history, statuses, attachments and missing sender IDs", async () => {
    await ready();
    const ignored = [message({ from: "123@c.us" }), message({ from: OTHER }), message({ fromMe: true }), message({ timestamp: NOW / 1000 - 1 }), message({ timestamp: NaN }), message({ isStatus: true }), message({ hasMedia: true }), message({ type: "image" }), message({ author: undefined }), message({ body: " " })];
    for (const item of ignored) await bridge.receive(item);
    expect(handler).not.toHaveBeenCalled();
    expect(browser.sendText).not.toHaveBeenCalled();
    expect(bridge.status(person()).handledMessages).toBe(0);
  });

  it("routes one selected-group event through the existing handler and deduplicates concurrent/replayed deliveries", async () => {
    await ready();
    await Promise.all([bridge.receive(message()), bridge.receive(message())]);
    await bridge.receive(message());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ person: person(), token, conversation: { activeOrderId: null, pending: null }, text: "summary", messageId: "message-1", channel: "web" });
    expect(browser.sendText).toHaveBeenCalledExactlyOnceWith(GROUP, "Reply: summary");
    expect(bridge.status(person())).toMatchObject({ busy: false, handledMessages: 1, lastError: null });
  });

  it("accepts a request typed on the linked phone but never handles its own reply echo", async () => {
    await ready();
    browser.sendText.mockImplementation(async (to, body) => {
      browser.emit("message_create", message({ id: { _serialized: "bot-echo" }, fromMe: true, from: "account@c.us", to, author: undefined, body }));
    });
    await bridge.receive(message({ fromMe: true, from: "account@c.us", to: GROUP, author: undefined }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(browser.sendText).toHaveBeenCalledTimes(1);
    expect(bridge.status(person()).handledMessages).toBe(1);
    await bridge.receive(message({ id: { _serialized: "bot-marked-echo" }, fromMe: true, to: GROUP, body: "Aimo Copilot · demo orders\nMock order placed" }));
    await bridge.receive(message({ id: { _serialized: "own-private" }, fromMe: true, to: "private@c.us" }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps pending confirmations and order selection separate for every group sender", async () => {
    await ready();
    handler.mockImplementation(async ({ conversation }) => ({ conversation: { activeOrderId: "evt-wedding", pending: { kind: "confirm_order", orderId: "evt-wedding", fingerprint: "reviewed" } }, reply: { text: conversation.pending ? "Your pending order" : "Fresh context", status: "summary", actions: [] } }));
    await bridge.receive(message({ id: { _serialized: "a-first" } }));
    await bridge.receive(message({ id: { _serialized: "b-first" }, author: "sender-two@lid", body: "confirm order" }));
    expect(handler.mock.calls[1][0].conversation.pending).toBeNull();
    await bridge.receive(message({ id: { _serialized: "a-second" }, body: "confirm order" }));
    expect(handler.mock.calls[2][0].conversation.pending?.fingerprint).toBe("reviewed");
  });

  it("invalidates context across selected-group changes and can pause replies", async () => {
    await ready();
    await bridge.receive(message());
    bridge.selectGroup(person(), OTHER);
    await bridge.receive(message({ id: { _serialized: "old-group" } }));
    expect(handler).toHaveBeenCalledTimes(1);
    await bridge.receive(message({ id: { _serialized: "other-group" }, from: OTHER }));
    expect(handler.mock.calls[1][0].conversation.activeOrderId).toBeNull();
    bridge.selectGroup(person(), GROUP);
    await bridge.receive(message({ id: { _serialized: "back-to-first" } }));
    expect(handler.mock.calls[2][0].conversation.activeOrderId).toBeNull();
    bridge.selectGroup(person(), null);
    await bridge.receive(message({ id: { _serialized: "paused" } }));
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("refuses group reconfiguration and disconnect while an order request is running", async () => {
    await ready();
    const entered = latch(); const release = latch();
    handler.mockImplementation(async ({ conversation }) => { entered.release(); await release.promise; return { conversation, reply: { text: "Done", status: "updated", actions: [] } }; });
    const sending = bridge.receive(message());
    await entered.promise;
    try {
      expect(bridge.status(person()).busy).toBe(true);
      expect(() => bridge.selectGroup(person(), OTHER)).toThrow("Wait for the current");
      await expect(bridge.refreshGroups(person())).rejects.toMatchObject({ status: 409 });
      await expect(bridge.disconnect(person())).rejects.toMatchObject({ status: 409 });
    } finally { release.release(); }
    await sending;
    expect(bridge.status(person()).busy).toBe(false);
  });

  it.each(["handler", "send"])("fails closed after an uncertain %s result without exposing private errors", async (failure) => {
    await ready();
    if (failure === "handler") handler.mockRejectedValue(new Error("secret-private-error"));
    else browser.sendText.mockRejectedValue(new Error("secret-private-error"));
    await bridge.receive(message());
    await bridge.receive(message());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(browser.sendText).toHaveBeenCalledTimes(failure === "handler" ? 0 : 1);
    expect(bridge.status(person()).lastError).toContain("could not be completed");
    expect(JSON.stringify(bridge.status(person()))).not.toContain("secret-private-error");
  });

  it("stops when the demo identity is reset and never processes messages with expired credentials", async () => {
    await ready();
    seedReset();
    await bridge.receive(message());
    expect(handler).not.toHaveBeenCalled();
    expect(bridge.status(person()).selectedGroupId).toBeNull();
  });

  it("closes browsers on shutdown, logs out on disconnect and rejects stale client events", async () => {
    await ready();
    await bridge.close();
    expect(browser.destroy).toHaveBeenCalledTimes(1);
    expect(browser.logout).not.toHaveBeenCalled();
    browser.emit("qr", "stale"); browser.emit("ready");
    expect(bridge.status(person()).phase).toBe("disconnected");
    await ready();
    await bridge.disconnect(person());
    expect(browser.logout).toHaveBeenCalledTimes(1);
    expect(bridge.status(person()).phase).toBe("disconnected");
  });

  it("does not carry the selected group into a different linked account", async () => {
    await ready();
    await bridge.close();
    browser.getAccount.mockReturnValue({ id: "different@c.us", name: "Different account" });
    await ready(false);
    expect(bridge.status(person()).selectedGroupId).toBeNull();
  });

  it("reports browser startup failures without exposing arbitrary provider messages", async () => {
    browser.initialize.mockRejectedValue(new Error("private-browser-details"));
    await bridge.connect(person(), token);
    await vi.waitFor(() => expect(bridge.status(person()).phase).toBe("error"));
    expect(bridge.status(person()).qrDataUrl).toBeNull();
    expect(bridge.status(person()).lastError).toContain("WHATSAPP_CHROME_PATH");
  });

  it("requires the controlling person's session for every pairing and group endpoint", async () => {
    const app = express(); app.use(express.json()); app.use(whatsappWebRouter(bridge));
    const server: Server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    async function call(path: string, method = "GET", auth?: string, body?: unknown) {
      return fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    }
    try {
      for (const [path, method] of [["/status", "GET"], ["/connect", "POST"], ["/disconnect", "POST"], ["/group", "POST"], ["/groups/refresh", "POST"]]) expect((await call(path, method)).status).toBe(401);
      expect((await call("/connect", "POST", token)).status).toBe(200);
      browser.emit("qr", "private-test-code");
      const other = issueToken({ kind: "person", personId: "p-sanna" });
      const forbidden = await call("/status", "GET", other);
      expect(forbidden.status).toBe(403);
      expect(await forbidden.text()).not.toContain("data:image");
      const status = await call("/status", "GET", token);
      expect(status.headers.get("cache-control")).toBe("no-store");
      expect((await call("/group", "POST", token, { groupId: GROUP })).status).toBe(409);
    } finally { await new Promise<void>((r) => server.close(() => r())); }
  });
});
