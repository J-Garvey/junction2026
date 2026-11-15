import { EventEmitter } from "node:events";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import express from "express";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppHandler } from "../src/whatsapp/routes.js";
import type { WhatsAppBrowserClient, WebInboundMessage } from "../src/whatsapp/web-client.js";

// Reuse createApp (the existing campaign host's production factory), routing and
// browser test interface. Nothing is added to the production HTTP surface.
const artifacts = process.env.E2_ARTIFACT_DIR
  ? resolve(process.env.E2_ARTIFACT_DIR)
  : mkdtempSync(resolve(tmpdir(), "aimo-campaign-E2-"));
mkdirSync(artifacts, { recursive: true });
const runtime = mkdtempSync(resolve(artifacts, "runtime-"));
const testSource = readFileSync(fileURLToPath(import.meta.url), "utf8");
writeFileSync(resolve(artifacts, "campaign-whatsapp-baseline.test.ts.snapshot"), testSource);
const NOW = Date.parse("2026-11-14T10:00:00Z");
const GROUP = "120300002@g.us";
const OTHER = "120300003@g.us";
const SIM = "demo-hotel-orders";
const nativeFetch = globalThis.fetch;
process.env.AIMO_DB = resolve(runtime, "aimo.db");
process.env.WHATSAPP_AUTH_DIR = resolve(runtime, "whatsapp-unused");
process.env.OPENAI_API_KEY = "";
process.env.AIMO_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_SEARCH_LOG = "off";
process.env.PREVIEW_PASSWORD = "";
process.env.AIMO_TEST_MODE = "1";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { getPerson, issueToken } = await import("../src/identity.js");
const { getDb } = await import("../src/db.js");
const { WhatsAppWebBridge } = await import("../src/whatsapp/web.js");
const { whatsappWebRouter } = await import("../src/whatsapp/web-routes.js");
const { handleWhatsAppMessage } = await import("../src/whatsapp/service.js");
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
let sequence = 0;
let base = "";
let server: Server;
let bridge: InstanceType<typeof WhatsAppWebBridge>;
let browser: Browser;
let tokens: Record<string, string>;
function spyReceive(target: InstanceType<typeof WhatsAppWebBridge>) { return vi.spyOn(target, "receive"); }
let received: ReturnType<typeof spyReceive>;
let calls = 0;
let blocked = 0;
let hold: { text: string; entered: () => void; release: Promise<void> } | null = null;
const owner = () => getPerson("p-aino")!;
const log = (kind: string, details: unknown) => appendFileSync(resolve(artifacts, "observations.jsonl"), JSON.stringify({
  at: new Date().toISOString(), sha, test: expect.getState().currentTestName ?? "setup",
  clock: new Date(NOW).toISOString(), mode: "fixture-fallback-fake-browser", kind, details,
}, (_key, value) => typeof value === "number" && !Number.isFinite(value) ? { nonFiniteNumber: String(value) } : value) + "\n");
function state() {
  return {
    whatsapp: getDb().prepare("SELECT key, value FROM kv WHERE key LIKE 'whatsapp%' ORDER BY key").all()
      .map((r) => ({ key: String(r.key), value: JSON.parse(r.value as string) })),
    tables: Object.fromEntries(["events", "plans", "questions", "orders", "approvals", "quotes"].map((table) => [table,
      getDb().prepare(`SELECT json FROM ${table} ORDER BY id`).all().map((r) => JSON.parse(r.json as string)),
    ])),
    status: bridge.status(owner()), calls,
  };
}
class Browser extends EventEmitter implements WhatsAppBrowserClient {
  failNext = false;
  initialize = vi.fn(async () => {});
  destroy = vi.fn(async () => {});
  logout = vi.fn(async () => {});
  getAccount = () => ({ id: "E2-fake-account@c.us", name: "E2 fake browser" });
  getGroups = vi.fn(async () => [
    { id: GROUP, name: "E2 kitchen" }, { id: OTHER, name: "E2 other" }, { id: "private@c.us", name: "Direct" },
  ]);
  sendText = vi.fn(async (group: string, text: string) => {
    const failed = this.failNext;
    this.failNext = false;
    log("fake-browser-outbound", { group, text, outcome: failed ? "injected-uncertain-failure" : "fake-delivered" });
    // Model the real adapter's outgoing echo, including arrival before resolution.
    const echo = message({ fromMe: true, from: "E2-fake-account@c.us", to: group, author: undefined, body: text });
    log("fake-browser-echo", echo);
    this.emit("message_create", echo);
    if (failed) throw new Error("E2 injected outbound uncertainty");
  });
}
const handler: WhatsAppHandler = async (input) => {
  calls++;
  const { token: _credential, ...safeInput } = input;
  log("coordinator-input", safeInput);
  if (hold?.text === input.text) { hold.entered(); await hold.release; }
  const output = await handleWhatsAppMessage(input);
  log("coordinator-output", output);
  return output;
};
function makeBridge() {
  browser = new Browser();
  bridge = new WhatsAppWebBridge(handler, {
    createClient: async () => browser, clock: () => NOW,
    encodeQr: async () => "data:image/png;base64,RTItZmFrZS1xci1vbmx5",
  });
  received = spyReceive(bridge);
}
beforeEach(async () => {
  seedReset(); setClock({ time: new Date(NOW).toISOString() });
  calls = 0; hold = null;
  tokens = Object.fromEntries(["p-aino", "p-mikko", "p-sanna"].map((personId) => [personId, issueToken({ kind: "person", personId })]));
  makeBridge();
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // The existing Web router receives an injected fake bridge before the shared
  // production host. Only browser events inject messages; there is no HTTP hook.
  app.use("/api/whatsapp/web", (req, res, next) => whatsappWebRouter(bridge)(req, res, next));
  app.use(createApp());
  server = app.listen(Number(process.env.E2_PORT ?? 8892), "127.0.0.1");
  await new Promise<void>((r, reject) => { server.once("listening", r); server.once("error", reject); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== base) {
      blocked++;
      log("network-blocked", { origin: url.origin, path: url.pathname });
      return new Response(JSON.stringify({ error: "E2_fixture_only_no_external_network" }), { status: 503 });
    }
    // Every case owns a fresh server on the same isolated port. Do not retain
    // Undici sockets to the previous server between cases (ECONNRESET on reuse).
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("connection", "close");
    return nativeFetch(input, { ...init, headers });
  };
  log("initial-state", state());
});
afterEach(async () => {
  log("final-state", state());
  // Assertion counts are observations; Vitest's JSON report is the pass verdict.
  log("test-assertion-count", { assertions: expect.getState().assertionCalls });
  await bridge.close();
  await new Promise<void>((r) => server.close(() => r()));
  globalThis.fetch = nativeFetch;
});
afterAll(() => {
  writeFileSync(resolve(artifacts, "run.json"), JSON.stringify({ sha, runtime, port: process.env.E2_PORT ?? 8892,
    testSourceSha256: createHash("sha256").update(testSource).digest("hex"),
    clock: new Date(NOW).toISOString(), mode: "fixture-fallback-fake-browser", blockedExternalRequests: blocked,
    notes: "No model, real supplier, phone pairing or real browser. Results in Vitest JSON, observations append-only."
  }, null, 2));
});
async function http(path: string, body?: unknown, person: string | null = "p-aino") {
  const response = await fetch(`${base}/api${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(person ? { authorization: `Bearer ${tokens[person] ?? person}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let output: any; try { output = JSON.parse(text); } catch { output = text; }
  const result = { status: response.status, body: output, cacheControl: response.headers.get("cache-control") };
  log("http", { method: body === undefined ? "GET" : "POST", path, body, person: person && (tokens[person] ? person : "non-person-or-invalid"), output: result });
  return result;
}
async function ok(path: string, body?: unknown, person = "p-aino") {
  const r = await http(path, body, person);
  expect(r.status, `${path}: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body;
}
const sim = (text: string, id = `E2-sim-${sequence++}`, person = "p-aino", groupId: string | null = SIM) =>
  http("/whatsapp/messages", { id, text, groupId }, person);
const lastReply = (r: any) => r.body.messages.at(-1).reply;
async function basket(name = "E2 conference") {
  return (await ok("/baskets", { name, deliveryDate: "2026-11-16" })).basket.id as string;
}
async function connectSim(person = "p-aino") { return ok("/whatsapp/connect", { displayName: "Sanna cosmetic name" }, person); }
function message(overrides: Partial<WebInboundMessage> = {}): WebInboundMessage {
  return { id: { _serialized: `E2-web-${sequence++}` }, from: GROUP, author: "E2-sender-A@lid", body: "summary",
    fromMe: false, timestamp: NOW / 1000, type: "chat", ...overrides };
}
async function event(text: string, overrides: Partial<WebInboundMessage> = {}) {
  const input = message({ body: text, ...overrides });
  const before = received.mock.calls.length;
  const sends = browser.sendText.mock.calls.length;
  const beforeState = state();
  browser.emit("message_create", input);
  expect(received.mock.calls[before]?.[0]).toEqual(input); // Proves event binding, not direct receive().
  await received.mock.results[before].value;
  const output = { inputs: input, outbound: browser.sendText.mock.calls.slice(sends), before: beforeState, after: state() };
  log("browser-event", output);
  return output;
}
async function ready(select = true) {
  expect((await http("/whatsapp/web/connect", {})).status).toBe(200);
  browser.emit("ready");
  await vi.waitFor(() => expect(bridge.status(owner()).phase).toBe("ready"));
  if (select) await ok("/whatsapp/web/group", { groupId: GROUP });
}
async function restart() {
  await bridge.close();
  makeBridge();
  expect(await bridge.restore()).toBe(true);
  browser.emit("ready");
  await vi.waitFor(() => expect(bridge.status(owner()).phase).toBe("ready"));
  log("bridge-restored", state());
}
const pending = (s = state()) => s.whatsapp.filter((r) => r.key.startsWith("whatsapp-web:conversation:"))
  .map((r) => r.value.conversation.pending);
const latch = () => { let release!: () => void; return { promise: new Promise<void>((r) => { release = r; }), release: () => release() }; };

describe("E2 WhatsApp production channel baseline", () => {
  it("E2-01 authenticates synthetic chat and filters source IDs without exposing history", async () => {
    for (const [path, body] of [["/session", undefined], ["/connect", {}], ["/disconnect", {}], ["/messages", { id: "anon", text: "help", groupId: SIM }]] as const) {
      expect((await http(`/whatsapp${path}`, body, null)).status).toBe(401);
      expect((await http(`/whatsapp${path}`, body, "agent_demo_hotel_aurora")).status).toBe(401);
    }
    expect((await http("/whatsapp/config", undefined, null)).status).toBe(200);
    await connectSim();
    const before = await ok("/whatsapp/session");
    for (const groupId of [null, "demo-conference-kitchen", "Demo Hotel · Orders", "unrecognised-group"]) {
      const ignored = await sim("new order E2 ignored on 16 Nov", "filtered-id", "p-aino", groupId);
      expect(ignored.body).toEqual({ ignored: groupId === null ? "direct_message" : "other_group" });
      expect(ignored.cacheControl).toBe("no-store");
    }
    expect(await ok("/whatsapp/session")).toEqual(before);
    expect((await sim("help", "filtered-id")).status).toBe(200);
    config.testMode = false;
    try { expect((await http("/whatsapp/config", { groupId: "demo-conference-kitchen" })).status).toBe(403); }
    finally { config.testMode = true; }
  });

  it("E2-02 separates people and enforces bar-only scope despite cosmetic identity", async () => {
    await connectSim(); await connectSim("p-mikko");
    await sim("evt-wedding");
    expect((await ok("/whatsapp/session")).conversation.activeOrderId).toBe("evt-wedding");
    const scoped = await sim("evt-wedding", undefined, "p-mikko");
    expect(scoped.status).toBe(200);
    expect(scoped.body.conversation.activeOrderId).toBeNull();
    expect(JSON.stringify(lastReply(scoped))).not.toContain("Emma and Lauri");
    await sim("confirm change", undefined, "p-mikko");
    expect((await ok("/whatsapp/session")).conversation.activeOrderId).toBe("evt-wedding");
    expect((await ok("/orders")).orders).toHaveLength(0);
  });

  it("E2-03 gates actual staging and purchase and binds retries to ID/text and current context", async () => {
    await connectSim(); const id = await basket(); await sim(id);
    const proposal = await sim("add 10 kg salmon 469672", "E2-first-preview");
    expect(lastReply(proposal).status).toBe("proposal");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    const [first, duplicate] = await Promise.all([sim("confirm change", "E2-confirm-edit"), sim("confirm change", "E2-confirm-edit")]);
    expect(first.status).toBe(200); expect(duplicate.body).toEqual(first.body);
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(1);
    expect((await sim("cancel", "E2-confirm-edit")).status).toBe(409);
    const preview = await sim("confirm order"); expect(lastReply(preview).status).toBe("proposal");
    expect((await ok("/orders")).orders).toHaveLength(0);
    expect((await sim("add 10 kg salmon 469672", "E2-first-preview")).body).toEqual(preview.body);
    const placed = await sim("confirm order", "E2-final-order"); expect(lastReply(placed).status).toBe("ordered");
    expect((await sim("confirm order", "E2-final-order")).body).toEqual(placed.body);
    expect((await ok(`/orders?eventId=${id}`)).orders).toHaveLength(1);
  });

  it("E2-04 invalidates simulator context on group change and reconnect", async () => {
    await connectSim(); const id = await basket(); await sim(id, "E2-old-selection");
    await sim("add 10 kg salmon 469672");
    await ok("/whatsapp/config", { groupId: "demo-conference-kitchen" });
    expect((await ok("/whatsapp/session")).conversation).toEqual({ activeOrderId: null, pending: null });
    expect((await sim(id, "E2-old-selection", "p-aino", "demo-conference-kitchen")).status).toBe(409);
    await ok("/whatsapp/disconnect", {}); await connectSim();
    expect((await ok("/whatsapp/session")).messages).toEqual([]);
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
  });

  it("E2-05 rejects oversized synthetic input and requires a fresh preview (E2-F02)", async () => {
    await connectSim(); const id = await basket(); await sim(id);
    expect((await sim("help".padEnd(8000), "i".repeat(128))).status).toBe(200);
    expect((await sim("help", "i".repeat(129))).status).toBe(400);
    expect((await sim(" ", "blank")).status).toBe(400);
    await sim("add 10 kg salmon 469672");
    const before = await ok("/whatsapp/session"); expect(before.conversation.pending).not.toBeNull();
    const rejected = await sim("cancel".padEnd(8001), "E2-too-long");
    expect(rejected.status).toBe(400); expect(rejected.body.error).toMatch(/too long.*8,000.*cancelled/);
    expect(await ok("/whatsapp/session")).toEqual({ ...before, conversation: { ...before.conversation, pending: null } });
    await sim("confirm change");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    expect((await ok("/orders")).orders).toHaveLength(0);
    log("boundary-observation", { codeUnits: 8001, response: 400, pendingSurvivesRejectedInput: false, subsequentConfirmStagesEarlierPreview: false });
  });

  it("E2-06 protects every Web control and QR with owner identity and has no injection endpoint", async () => {
    const controls = [["/status", undefined], ["/connect", {}], ["/disconnect", {}], ["/groups/refresh", {}], ["/group", { groupId: GROUP }]] as const;
    for (const [path, body] of controls) {
      expect((await http(`/whatsapp/web${path}`, body, null)).status).toBe(401);
      expect((await http(`/whatsapp/web${path}`, body, "agent_demo_hotel_aurora")).status).toBe(401);
    }
    await ok("/whatsapp/web/connect", {});
    browser.emit("qr", "E2-fake-QR-input");
    await vi.waitFor(() => expect(bridge.status(owner()).qrDataUrl).not.toBeNull());
    for (const [path, body] of controls) {
      const denied = await http(`/whatsapp/web${path}`, body, "p-sanna");
      expect(denied.status).toBe(403); expect(JSON.stringify(denied.body)).not.toContain("data:image");
    }
    const status = await http("/whatsapp/web/status");
    expect(status.cacheControl).toBe("no-store"); expect(status.body.phase).toBe("qr");
    expect((await http("/whatsapp/web/messages", { text: "help", groupId: GROUP })).status).toBe(404);
    expect(browser.initialize).toHaveBeenCalledTimes(1);
  });

  it("E2-07 filters actual browser events and ignores own reply echoes", async () => {
    await ready(false); await event("help"); expect(calls).toBe(0);
    await ok("/whatsapp/web/group", { groupId: GROUP });
    for (const overrides of [
      { from: "private@c.us" }, { from: OTHER }, { from: "E2 kitchen" }, { timestamp: NOW / 1000 - 1 },
      { timestamp: NaN }, { isStatus: true }, { hasMedia: true }, { type: "image" }, { author: undefined }, { body: " " },
    ]) { await event("help", overrides); }
    expect(calls).toBe(0); expect(browser.sendText).not.toHaveBeenCalled();
    await event("help"); expect(calls).toBe(1); expect(browser.sendText).toHaveBeenCalledTimes(1);
    await event("help", { fromMe: true, from: "E2-fake-account@c.us", to: GROUP, author: undefined });
    expect(calls).toBe(2); expect(browser.sendText).toHaveBeenCalledTimes(2);
    expect(browser.sendText.mock.calls.every(([destination]) => destination === GROUP)).toBe(true);
  });

  it("E2-08 separates real sender confirmations and applies the current controlling scope", async () => {
    const id = await basket(); await ready();
    await event(id); await event("add 10 kg salmon 469672");
    await event(id, { author: "E2-sender-B@lid" });
    const denied = await event("confirm change", { author: "E2-sender-B@lid" });
    expect(denied.outbound[0][1]).toMatch(/no (pending item|basket) change/);
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    await event("confirm change");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(1);
    const restricted = { ...owner(), outlets: ["bar"], hotelScope: false };
    getDb().prepare("UPDATE people SET json = ? WHERE id = ?").run(JSON.stringify(restricted), restricted.id);
    const scoped = await event("summary");
    expect(scoped.outbound[0][1]).not.toContain("Salmon fillet");
    expect(scoped.after.whatsapp.filter((r) => r.key.startsWith("whatsapp-web:conversation:")).some((r) => r.value.conversation.activeOrderId === null)).toBe(true);
  });

  it("E2-09 deduplicates concurrent Web events and conflicting upstream IDs without mutations", async () => {
    await ready();
    const id = { _serialized: "E2-upstream-duplicate" };
    await Promise.all([event("new order E2 duplicate on 16 Nov", { id }), event("new order E2 duplicate on 16 Nov", { id })]);
    const after = state(); expect(calls).toBe(1);
    await event("new order E2 conflicting on 16 Nov", { id });
    expect(calls).toBe(1); expect(state().tables.events).toEqual(after.tables.events);
    expect(browser.sendText).toHaveBeenCalledTimes(1);
    expect(bridge.status(owner()).lastError).toBeNull();
    log("conflicting-ID-observation", { response: "silent-deduplication", conflictExecuted: false });
  });

  it("E2-10 restores order selection, clears pending and prevents delivery replay across restart/group change", async () => {
    const id = await basket(); await ready(); await event(id);
    await event("add 10 kg salmon 469672", { id: { _serialized: "E2-before-restart" } });
    expect(pending().some(Boolean)).toBe(true);
    const oldToken = tokens["p-aino"];
    getDb().prepare("DELETE FROM tokens WHERE token = ?").run(oldToken);
    await restart();
    tokens["p-aino"] = issueToken({ kind: "person", personId: "p-aino" });
    expect(bridge.status(owner()).selectedGroupId).toBe(GROUP);
    await event("confirm change");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    const count = calls;
    await event("add 10 kg salmon 469672", { id: { _serialized: "E2-before-restart" } }); expect(calls).toBe(count);
    await event("summary");
    expect(state().whatsapp.filter((r) => r.key.startsWith("whatsapp-web:conversation:")).some((r) => r.value.conversation.activeOrderId === id)).toBe(true);
    await ok("/whatsapp/web/group", { groupId: OTHER });
    const switched = await event("confirm change", { from: OTHER });
    expect(switched.outbound[0][1]).not.toContain("Added to your basket");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
  });

  it("E2-11 clears failed outbound previews and never reexecutes a committed order with a lost receipt", async () => {
    const id = await basket(); await ready(); await event(id);
    browser.failNext = true;
    await event("add 10 kg salmon 469672", { id: { _serialized: "E2-lost-preview" } });
    expect(pending().every((p) => p === null)).toBe(true);
    expect(bridge.status(owner()).lastError).toContain("could not be completed");
    const failedCalls = calls;
    await event("add 10 kg salmon 469672", { id: { _serialized: "E2-lost-preview" } }); expect(calls).toBe(failedCalls);
    await event("confirm change"); expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    await event("add 10 kg salmon 469672"); await event("confirm change"); await event("confirm order");
    expect((await ok("/orders")).orders).toHaveLength(0);
    browser.failNext = true;
    await event("confirm order", { id: { _serialized: "E2-lost-receipt" } });
    expect((await ok(`/orders?eventId=${id}`)).orders).toHaveLength(1);
    const committedCalls = calls;
    await event("confirm order", { id: { _serialized: "E2-lost-receipt" } }); expect(calls).toBe(committedCalls);
    await restart();
    await event("confirm order", { id: { _serialized: "E2-lost-receipt" } }); expect(calls).toBe(committedCalls);
    expect(browser.sendText).not.toHaveBeenCalled();
    expect((await ok(`/orders?eventId=${id}`)).orders).toHaveLength(1);
  });

  it("E2-12 visibly rejects oversized Web input and requires a fresh preview (E2-F01)", async () => {
    const id = await basket(); await ready(); await event(id);
    await event("help".padEnd(8000)); expect(calls).toBe(2);
    await event("add 10 kg salmon 469672");
    const before = state(); expect(pending().some(Boolean)).toBe(true);
    const rejected = await event("cancel".padEnd(8001), { id: { _serialized: "E2-long-web" } });
    expect(rejected.outbound).toEqual([[GROUP, expect.stringMatching(/too long.*8,000.*cancelled/)]]);
    expect(rejected.outbound[0][1].length).toBeLessThan(250);
    expect(pending().every((p) => p === null)).toBe(true);
    expect(state().tables).toEqual(before.tables); expect(calls).toBe(before.calls);
    await event("confirm change"); expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    expect((await ok("/orders")).orders).toHaveLength(0);
    log("boundary-observation", { codeUnits: 8001, response: "visible-bounded-rejection", pendingSurvivesRejectedInput: false, subsequentConfirmStagesEarlierPreview: false });
  });

  it("E2-13 refuses Web reconfiguration while a production coordinator request is active", async () => {
    await ready(); const entered = latch(); const release = latch();
    hold = { text: "help", entered: entered.release, release: release.promise };
    const sending = event("help"); await entered.promise;
    try {
      expect(bridge.status(owner()).busy).toBe(true);
      expect((await http("/whatsapp/web/group", { groupId: OTHER })).status).toBe(409);
      expect((await http("/whatsapp/web/groups/refresh", {})).status).toBe(409);
      expect((await http("/whatsapp/web/disconnect", {})).status).toBe(409);
    } finally { release.release(); }
    await sending;
    await ok("/whatsapp/web/groups/refresh", {});
    await ok("/whatsapp/web/disconnect", {});
    expect(browser.logout).toHaveBeenCalledTimes(1);
    expect(await bridge.restore()).toBe(false);
  });

  it("E2-14 clears earlier synthetic confirmation after a real offline butter-planning failure", async () => {
    await connectSim(); const id = await basket(); await sim(id);
    expect(lastReply(await sim("add 10 kg salmon 469672")).status).toBe("proposal");
    expect((await ok("/whatsapp/session")).conversation.pending).not.toBeNull();
    // Existing whatsapp-orders.test.ts also fails at this input offline. Keep
    // the complete response/state and verify the failure does not authorize an
    // earlier proposal. This intentionally characterizes the 0cb5841 baseline.
    const failed = await sim("add 2 kg butter", "E2-offline-butter");
    expect(failed.status).toBe(502);
    expect((await ok("/whatsapp/session")).conversation.pending).toBeNull();
    expect((await sim("add 3 kg salmon 469672", "E2-offline-butter")).status).toBe(409);
    await sim("confirm change");
    expect((await ok(`/baskets/${id}`)).requests).toHaveLength(0);
    expect((await ok("/orders")).orders).toHaveLength(0);
    log("offline-planning-limitation", { input: "add 2 kg butter", status: failed.status, earlierConfirmationCleared: true });
  });

  it.each(["simulator", "web"] as const)("E2-15 %s oversized rejection invalidates final checkout without placing an order", async (channel) => {
    const id = await basket();
    if (channel === "web") await ready(); else await connectSim();
    const send = async (text: string) => {
      if (channel === "simulator") {
        const r = await sim(text);
        return { status: r.status, text: r.status === 200 ? lastReply(r).text : r.body.error };
      }
      const r = await event(text);
      return { status: 200, text: r.outbound[0][1] };
    };
    await send(id); await send("add 10 kg salmon 469672"); await send("confirm change");
    const basketBefore = await ok(`/baskets/${id}`);
    expect((await send("confirm order")).text).toContain("Confirm this final order?");
    const rejected = await send("cancel".padEnd(8001));
    expect(rejected.text).toContain("pending confirmation was cancelled");
    expect(rejected.status).toBe(channel === "simulator" ? 400 : 200);
    expect((await send("confirm order")).text).toContain("Confirm this final order?");
    expect((await ok("/orders")).orders).toHaveLength(0);
    expect(await ok(`/baskets/${id}`)).toEqual(basketBefore);
  });
});
