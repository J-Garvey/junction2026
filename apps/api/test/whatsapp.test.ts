/** Transport tests use real person sessions/SQLite and an injected scripted handler. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { WhatsAppSession, WhatsAppGroupConfig } from "@aimo/contracts";
import type { WhatsAppHandler } from "../src/whatsapp/routes.js";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { whatsappRouter } = await import("../src/whatsapp/routes.js");
const { getDb, kvGet, kvSet } = await import("../src/db.js");
const { issueToken } = await import("../src/identity.js");
const { seedReset } = await import("../src/seed.js");
const { nowIso } = await import("../src/clock.js");
const { config } = await import("../src/config.js");
const GROUP = "demo-hotel-orders";
const OTHER_GROUP = "demo-conference-kitchen";

let base: string;
let server: Server;
let aino: string;
let sanna: string;
let script: WhatsAppHandler;
const handler = vi.fn<WhatsAppHandler>((input) => script(input));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/whatsapp", whatsappRouter(handler));
  return app;
}
beforeAll(async () => {
  server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())));
beforeEach(() => {
  seedReset();
  aino = issueToken({ kind: "person", personId: "p-aino", testSession: true });
  sanna = issueToken({ kind: "person", personId: "p-sanna", testSession: true });
  handler.mockClear();
  script = async ({ conversation, text }) => ({
    conversation: { ...conversation, activeOrderId: "evt-wedding" },
    reply: { text: `*Demo reply*\n${text}`, status: "summary", actions: [{ label: "Show order", text: "summary" }] },
  });
});

async function call(path: string, body?: unknown, token: string | null = aino, cookie = false) {
  const requestBody = path === "/messages" && body && typeof body === "object" ? { groupId: GROUP, ...body } : body;
  const response = await fetch(`${base}/api/whatsapp${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? cookie ? { cookie: `aimo_session=${encodeURIComponent(token)}` } : { authorization: `Bearer ${token}` } : {}),
    },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
  });
  return { status: response.status, body: await response.json() as WhatsAppSession & WhatsAppGroupConfig & { ignored?: string; error?: string }, headers: response.headers };
}
const connect = (token = aino) => call("/connect", {}, token);
function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("synthetic WhatsApp person transport", () => {
  it("requires existing person credentials on every endpoint and never issues credentials", async () => {
    const agent = issueToken({ kind: "agent", hotelId: "hotel-demo", name: "agent" });
    const valio = issueToken({ kind: "valio", name: "viewer" });
    for (const token of [null, "invalid", agent, valio]) {
      for (const [path, body] of [["/session", undefined], ["/connect", {}], ["/disconnect", {}], ["/messages", { id: "m1", text: "hello" }]] as const) {
        expect((await call(path, body, token)).status).toBe(401);
      }
    }
    expect((await fetch(`${base}/api/whatsapp/session`, { headers: { cookie: "aimo_session=%invalid" } })).status).toBe(401);
    const before = getDb().prepare("SELECT COUNT(*) AS n FROM tokens").get();
    const session = await call("/session", undefined, aino, true);
    expect(session.status).toBe(200);
    expect(session.body).toEqual({ connected: false, simulated: true, displayName: "Aino", groupId: GROUP, messages: [], conversation: { activeOrderId: null, pending: null } });
    expect(session.headers.get("cache-control")).toBe("no-store");
    for (const result of [await connect(), await call("/messages", { id: "hello", text: "hello" }), await call("/disconnect", {})]) {
      expect(result.status).toBe(200);
      expect(result.headers.get("set-cookie")).toBeNull();
      expect(result.body).not.toHaveProperty("token");
      expect(JSON.stringify(result.body)).not.toContain(aino);
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM tokens").get()).toEqual(before);
  });

  it("validates bodies, refuses a disconnected send, and forwards exact action text and resolved identity", async () => {
    expect((await call("/messages", { id: "m1", text: "hello" })).status).toBe(409);
    for (const body of [{ displayName: " " }, { displayName: "x".repeat(81) }, { personId: "p-sanna" }]) {
      expect((await call("/connect", body)).status).toBe(400);
    }
    expect((await call("/connect", { displayName: "  Conference kitchen  " })).body.displayName).toBe("Conference kitchen");
    for (const body of [{}, { id: " ", text: "hello" }, { id: "ok", text: " " }, { id: "ok", text: "x".repeat(8001) }, { id: "ok", text: "hello", personId: "p-sanna" }]) {
      expect((await call("/messages", body)).status).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();
    const text = "  Confirm this order\nexactly  ";
    const sent = await call("/messages", { id: "m1", text });
    expect(sent.status).toBe(200);
    expect(handler).toHaveBeenCalledWith({ person: expect.objectContaining({ id: "p-aino", name: "Aino" }), token: aino, conversation: { activeOrderId: null, pending: null }, text, messageId: "m1" });
    expect(sent.body.messages).toEqual([
      { id: "m1", direction: "inbound", text, at: nowIso() },
      { id: "m1:reply", direction: "outbound", text: `*Demo reply*\n${text}`, at: nowIso(), reply: { text: `*Demo reply*\n${text}`, status: "summary", actions: [{ label: "Show order", text: "summary" }] } },
    ]);
    expect((await call("/session")).body).toEqual(sent.body);
  });

  it("scopes persisted connection, context, history and idempotency to person.id, across different tokens", async () => {
    await connect();
    const first = await call("/messages", { id: "same-id", text: "Aino's order" });
    const secondAinoToken = issueToken({ kind: "person", personId: "p-aino", testSession: false });
    expect((await call("/session", undefined, secondAinoToken)).body).toEqual(first.body);
    expect((await call("/messages", { id: "same-id", text: "Aino's order" }, secondAinoToken)).body).toEqual(first.body);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await call("/session", undefined, sanna)).body).toMatchObject({ connected: false, displayName: "Sanna", messages: [], conversation: { activeOrderId: null, pending: null } });
    await connect(sanna);
    const other = await call("/messages", { id: "same-id", text: "Sanna's order" }, sanna);
    expect(other.status).toBe(200);
    expect(other.body.messages[0].text).toBe("Sanna's order");
    expect((await call("/session")).body).toEqual(first.body);
  });

  it("serializes distinct messages for a person and preserves completed responses on retry", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async ({ conversation, text }) => {
      if (text === "first") { entered.resolve(); await release.promise; }
      return { conversation: { activeOrderId: `${conversation.activeOrderId ?? ""}/${text}`, pending: null }, reply: { text, status: "updated", actions: [] } };
    };
    const first = call("/messages", { id: "one", text: "first" });
    await entered.promise;
    const second = call("/messages", { id: "two", text: "second" });
    release.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a.body.conversation.activeOrderId).toBe("/first");
    expect(b.body.conversation.activeOrderId).toBe("/first/second");
    expect(b.body.messages).toHaveLength(4);
    expect((await call("/messages", { id: "one", text: "first" })).body).toEqual(a.body);
    expect((await call("/session")).body).toEqual(b.body);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent retries and rejects concurrent reuse with different text", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async () => {
      entered.resolve();
      await release.promise;
      return { conversation: { activeOrderId: "evt-wedding", pending: null }, reply: { text: "Once", status: "ordered", actions: [] } };
    };
    const first = call("/messages", { id: "once", text: "confirm" });
    await entered.promise;
    const duplicate = call("/messages", { id: "once", text: "confirm" });
    const conflict = call("/messages", { id: "once", text: "different" });
    release.resolve();
    const [a, b, c] = await Promise.all([first, duplicate, conflict]);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(c.status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await call("/session")).body.messages).toHaveLength(2);
  });

  it("does not make another person wait for a slow handler", async () => {
    await connect();
    await connect(sanna);
    const entered = latch();
    const release = latch();
    script = async ({ person, conversation }) => {
      if (person.id === "p-aino") { entered.resolve(); await release.promise; }
      return { conversation, reply: { text: person.name, status: "summary", actions: [] } };
    };
    const slow = call("/messages", { id: "slow", text: "hello" });
    await entered.promise;
    try {
      const other = await call("/messages", { id: "fast", text: "hello" }, sanna);
      expect(other.body.messages.at(-1)?.text).toBe("Sanna");
    } finally { release.resolve(); }
    expect((await slow).status).toBe(200);
  });

  it("shares a failed outcome with concurrent retries, then permits a later explicit retry", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async () => {
      entered.resolve();
      await release.promise;
      throw new Error("scripted failure");
    };
    const first = call("/messages", { id: "concurrent-failure", text: "hello" });
    await entered.promise;
    const duplicate = call("/messages", { id: "concurrent-failure", text: "hello" });
    // This response also proves the server is still accepting requests while the
    // first handler awaits and a second copy of the same message is in flight.
    expect((await call("/messages", { id: "concurrent-failure", text: "different" })).status).toBe(409);
    release.resolve();
    const [a, b] = await Promise.all([first, duplicate]);
    expect(a.status).toBe(502);
    expect(b).toMatchObject({ status: 502, body: a.body });
    expect(handler).toHaveBeenCalledTimes(1);
    script = async ({ conversation }) => ({ conversation, reply: { text: "Recovered", status: "summary", actions: [] } });
    expect((await call("/messages", { id: "concurrent-failure", text: "hello" })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("keeps connect idempotent, clears context on disconnect, and starts a fresh chat on reconnect", async () => {
    await connect();
    script = async () => ({ conversation: { activeOrderId: "evt-wedding", pending: { kind: "confirm_order", orderId: "evt-wedding", fingerprint: "reviewed" } }, reply: { text: "Confirm?", status: "proposal", actions: [] } });
    const first = await call("/messages", { id: "old", text: "order" });
    expect((await connect()).body).toEqual(first.body);
    const disconnected = await call("/disconnect", {});
    expect(disconnected.body).toMatchObject({ connected: false, conversation: { activeOrderId: null, pending: null }, messages: first.body.messages });
    expect((await call("/messages", { id: "old", text: "order" })).status).toBe(409);
    const reconnected = await connect();
    expect(reconnected.body).toMatchObject({ connected: true, messages: [], conversation: { activeOrderId: null, pending: null } });
    expect((await call("/messages", { id: "old", text: "order" })).status).toBe(409);
    expect((await call("/messages", { id: "old", text: "other" })).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await call("/messages", { id: "new", text: "order" })).status).toBe(200);
  });

  it("queues disconnect with sends so the final state stays disconnected with no active context", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async () => {
      entered.resolve();
      await release.promise;
      return { conversation: { activeOrderId: "evt-wedding", pending: null }, reply: { text: "Done", status: "summary", actions: [] } };
    };
    const sending = call("/messages", { id: "working", text: "hello" });
    await entered.promise;
    const disconnecting = call("/disconnect", {});
    release.resolve();
    await sending;
    expect((await disconnecting).body).toMatchObject({ connected: false, conversation: { activeOrderId: null, pending: null } });
    expect((await call("/messages", { id: "next", text: "hello" })).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("retains the id/text binding on failure, hides handler errors, and allows a retry with the same id", async () => {
    await connect();
    script = async ({ conversation }) => {
      conversation.activeOrderId = "must-not-leak";
      throw new Error("upstream credential must-not-leak");
    };
    const failed = await call("/messages", { id: "retry", text: "hello" });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain("must-not-leak");
    expect((await call("/session")).body).toMatchObject({ messages: [], conversation: { activeOrderId: null, pending: null } });
    expect((await call("/messages", { id: "retry", text: "other" })).status).toBe(409);
    script = async ({ conversation }) => ({ conversation, reply: { text: "Recovered", status: "summary", actions: [] } });
    const recovered = await call("/messages", { id: "retry", text: "hello" });
    expect(recovered.status).toBe(200);
    expect(recovered.body.messages).toHaveLength(2);
    expect((await call("/messages", { id: "retry", text: "hello" })).body).toEqual(recovered.body);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("persists results for a new router and refuses uncertain deliveries left by an interrupted server", async () => {
    await connect();
    const completed = await call("/messages", { id: "persisted", text: "hello" });
    const otherServer = makeApp().listen(0, "127.0.0.1");
    await new Promise<void>((r) => otherServer.once("listening", r));
    try {
      const response = await fetch(`http://127.0.0.1:${(otherServer.address() as { port: number }).port}/api/whatsapp/messages`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${aino}` }, body: JSON.stringify({ id: "persisted", text: "hello", groupId: GROUP }) });
      expect(await response.json()).toEqual(completed.body);
      expect(handler).toHaveBeenCalledTimes(1);
    } finally { await new Promise<void>((r) => otherServer.close(() => r())); }
    const stored = kvGet<{ connectionId: string; deliveries: unknown[] }>("whatsapp:person:p-aino")!;
    stored.deliveries.push({ id: "interrupted", text: "confirm", connectionId: stored.connectionId, status: "processing" });
    kvSet("whatsapp:person:p-aino", stored);
    expect((await call("/messages", { id: "interrupted", text: "confirm" })).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("lets demo reset clear persisted chats and prevents an in-flight handler restoring them", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async ({ conversation }) => {
      entered.resolve();
      await release.promise;
      return { conversation, reply: { text: "Stale", status: "summary", actions: [] } };
    };
    const sending = call("/messages", { id: "reset", text: "hello" });
    await entered.promise;
    seedReset();
    release.resolve();
    expect((await sending).status).toBe(409);
    expect(kvGet("whatsapp:person:p-aino")).toBeNull();
    expect((await call("/session")).status).toBe(401);
    aino = issueToken({ kind: "person", personId: "p-aino" });
    expect((await call("/session")).body).toMatchObject({ connected: false, messages: [], conversation: { activeOrderId: null, pending: null } });
  });

  it("ignores every other group and direct messages before handling, caching or changing context", async () => {
    await connect();
    const allowed = await call("/messages", { id: "selected", text: "hello" });
    for (const groupId of [OTHER_GROUP, "unrecognised-group", "Demo Hotel · Orders", null, undefined]) {
      // Even a cached message must not produce an agent reply in another chat.
      const ignored = await call("/messages", { id: "selected", text: "hello", groupId });
      expect(ignored.status).toBe(200);
      expect(ignored.body.ignored).toBe(groupId == null ? "direct_message" : "other_group");
      expect(ignored.body).not.toHaveProperty("messages");
      expect(ignored.body).not.toHaveProperty("conversation");
      expect(ignored.body).not.toHaveProperty("reply");
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await call("/session")).body).toEqual(allowed.body);
  });

  it("exposes fixed demo group choices before person selection and validates configuration", async () => {
    const initial = await call("/config", undefined, null);
    expect(initial.body.selectedGroupId).toBe(GROUP);
    expect(initial.body.groups).toHaveLength(3);
    for (const groupId of ["", "unknown", "Demo Hotel · Orders"]) expect((await call("/config", { groupId }, null)).status).toBe(400);
    expect((await call("/config", { groupId: OTHER_GROUP }, null)).body.selectedGroupId).toBe(OTHER_GROUP);
    expect((await call("/config", undefined, null)).body.selectedGroupId).toBe(OTHER_GROUP);
    seedReset();
    expect((await call("/config", undefined, null)).body.selectedGroupId).toBe(GROUP);
  });

  it("clears old group history and pending confirmations and rejects old deliveries in a new group", async () => {
    await connect();
    script = async () => ({ conversation: { activeOrderId: "evt-wedding", pending: { kind: "confirm_order", orderId: "evt-wedding", fingerprint: "old-group" } }, reply: { text: "Confirm?", status: "proposal", actions: [] } });
    const old = await call("/messages", { id: "old", text: "order" });
    expect((await call("/config", { groupId: GROUP })).status).toBe(200);
    expect((await call("/session")).body).toEqual(old.body);
    await call("/config", { groupId: OTHER_GROUP });
    expect((await call("/session")).body).toMatchObject({ connected: true, groupId: OTHER_GROUP, messages: [], conversation: { activeOrderId: null, pending: null } });
    expect((await call("/messages", { id: "old", text: "order" })).body.ignored).toBe("other_group");
    expect((await call("/messages", { id: "old", text: "order", groupId: OTHER_GROUP })).status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await call("/messages", { id: "new", text: "hello", groupId: OTHER_GROUP })).status).toBe(200);
    // Switching away and back before reading must still invalidate old context.
    await call("/config", { groupId: GROUP });
    await call("/config", { groupId: OTHER_GROUP });
    expect((await call("/session")).body).toMatchObject({ messages: [], conversation: { activeOrderId: null, pending: null } });
    expect((await call("/messages", { id: "new", text: "hello", groupId: OTHER_GROUP })).status).toBe(409);
  });

  it("does not change group authorization while any person's message is running", async () => {
    await connect();
    const entered = latch();
    const release = latch();
    script = async ({ conversation }) => { entered.resolve(); await release.promise; return { conversation, reply: { text: "Done", status: "summary", actions: [] } }; };
    const sending = call("/messages", { id: "active", text: "hello" });
    await entered.promise;
    try {
      expect((await call("/config", { groupId: OTHER_GROUP }, null)).status).toBe(409);
      expect((await call("/config")).body.selectedGroupId).toBe(GROUP);
    } finally { release.resolve(); }
    expect((await sending).status).toBe(200);
    expect((await call("/config", { groupId: OTHER_GROUP }, null)).status).toBe(200);
  });

  it("disables group changes outside test mode", async () => {
    const before = config.testMode;
    config.testMode = false;
    try {
      expect((await call("/config", { groupId: OTHER_GROUP })).status).toBe(403);
      expect((await call("/config")).body.selectedGroupId).toBe(GROUP);
    } finally { config.testMode = before; }
  });
});
