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
const { whatsappRouter } = await import("../src/whatsapp/routes.js");
const { saveFixture } = await import("../src/aimo/lookup.js");
const lookupAdapter = await import("../src/aimo/lookup.js");
const { getMandate, putMandate } = await import("../src/gateway/service.js");
const { gw, GatewayError } = await import("../src/agent/gatewayClient.js");
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
let simArrivals: string[] = [];
let hold: { text: string; entered: () => void; release: Promise<void> } | null = null;
const owner = () => getPerson("p-aino")!;
const log = (kind: string, details: unknown) => appendFileSync(resolve(artifacts, "observations.jsonl"), JSON.stringify({
  at: new Date().toISOString(), sha, test: expect.getState().currentTestName ?? "setup",
  clock: new Date(NOW).toISOString(), mode: expect.getState().currentTestName?.includes("I3 current supplier") ? "fixture-gateway" : "fixture-fallback-fake-browser", kind, details,
}, (_key, value) => typeof value === "number" && !Number.isFinite(value) ? { nonFiniteNumber: String(value) } : value) + "\n");
function state() {
  return {
    clock: getDb().prepare("SELECT value FROM kv WHERE key = 'clock'").get()?.value,
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
  calls = 0; hold = null; simArrivals = [];
  tokens = Object.fromEntries(["p-aino", "p-mikko", "p-sanna"].map((personId) => [personId, issueToken({ kind: "person", personId })]));
  makeBridge();
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // The existing Web router receives an injected fake bridge before the shared
  // production host. Only browser events inject messages; there is no HTTP hook.
  app.use("/api/whatsapp/web", (req, res, next) => whatsappWebRouter(bridge)(req, res, next));
  // Same production simulator router/coordinator, with the existing observation
  // wrapper shared by A3's deterministic queue tests. No new HTTP interface.
  app.use("/api/whatsapp", (req, _res, next) => {
    if (req.path === "/messages") { simArrivals.push(req.body?.id); log("sim-router-arrival", { id: req.body?.id }); }
    next();
  }, whatsappRouter(handler));
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
  vi.restoreAllMocks();
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
    clock: new Date(NOW).toISOString(), mode: process.env.E2_EVIDENCE_MODE ?? "fixture-fallback-fake-browser", blockedExternalRequests: blocked,
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

// A3 independently authored acceptance tests. Policy sources: E2-01..05,
// E2-08/10/11/12, E1 smoke and docs/human-approval-rules.md. Assertions inspect
// SQLite rows; natural-language replies alone never establish an order result.
const stagedPlans = (eventId: string) => state().tables.plans.filter((p) => p.eventId === eventId && p.basketedAt && !p.reviewing && !p.orderIds.length);
const simConversation = async () => (await ok("/whatsapp/session")).conversation;
const A3_LONG = "cancel" + "🧀".repeat(3997) + "x"; // exactly 8,001 UTF-16 units
type AuditChannel = "simulator" | "web";
async function auditSetup(channel: AuditChannel) {
  const id = await basket("A3 independent conference");
  if (channel === "web") { await ready(); await event(id); }
  else { await connectSim(); await sim(id); }
  return id;
}
async function auditSend(channel: AuditChannel, text: string, id = `A3-${sequence++}`) {
  return channel === "web" ? event(text, { id: { _serialized: id } }) : sim(text, id);
}
async function auditPending(channel: AuditChannel) {
  return channel === "web" ? pending().filter(Boolean) : [(await simConversation()).pending].filter(Boolean);
}
async function gatewayAudit(path: string, body: unknown, person = "agent", idem?: string) {
  const r = await fetch(`${base}/gateway/v1${path}`, { method: "POST", headers: {
    "content-type": "application/json", authorization: `Bearer ${person === "agent" ? "agent_demo_hotel_aurora" : tokens[person] ?? person}`,
    ...(idem ? { "Idempotency-Key": idem } : {}),
  }, body: JSON.stringify(body) });
  const output = { status: r.status, body: await r.json() as any };
  log("A3-gateway", { path, body, person, idem, output });
  return output;
}
const auditQuote = (productId: string, quantity = 1, requires?: unknown) => gatewayAudit("/quotes", {
  siteId: "site-aurora", deliveryDate: "2026-11-16",
  lines: [{ productId, quantity, outletId: "banquet", ...(requires ? { requires } : {}) }],
});

describe("A3 independent persisted-state authorization audit", () => {
  it.each(["simulator", "web"] as const)("A3-01 %s counts Unicode as UTF-16 and preserves new proposals on rejected-ID replay/conflict", async (channel) => {
    const id = await auditSetup(channel);
    const accepted = "help" + "\u2003".repeat(7996);
    expect(accepted.length).toBe(8000); expect(A3_LONG.length).toBe(8001);
    const atLimit = await auditSend(channel, accepted);
    if (channel === "simulator") expect((atLimit as any).status).toBe(200);
    else expect((atLimit as any).outbound[0][1]).not.toContain("Message too long");
    await auditSend(channel, "add 10 kg salmon 469672");
    expect(await auditPending(channel)).toHaveLength(1);
    const before = state().tables;
    await auditSend(channel, A3_LONG, "A3-rejected-id");
    expect(await auditPending(channel)).toHaveLength(0);
    expect(state().tables).toEqual(before);
    await auditSend(channel, "confirm change"); expect(stagedPlans(id)).toHaveLength(0);
    await auditSend(channel, "add 12 kg salmon 469672");
    const fresh = await auditPending(channel); expect(fresh).toHaveLength(1);
    const tables = state().tables;
    await auditSend(channel, A3_LONG, "A3-rejected-id");
    expect(await auditPending(channel)).toEqual(fresh);
    const conflict = await auditSend(channel, "cancel", "A3-rejected-id");
    if (channel === "simulator") expect((conflict as any).status).toBe(409);
    expect(await auditPending(channel)).toEqual(fresh); expect(state().tables).toEqual(tables);
    await auditSend(channel, "confirm change");
    const staged = stagedPlans(id); expect(staged).toHaveLength(1);
    expect(staged[0].lines).toEqual([expect.objectContaining({ productId: "469672", quantity: 12 })]);
    expect(state().tables.orders).toHaveLength(0); expect(state().tables.approvals).toHaveLength(0);
    expect(JSON.stringify(state().whatsapp)).not.toContain(A3_LONG);
  });

  it("A3-02 malformed envelopes, unknown identity/group and another person cannot clear the simulator proposal", async () => {
    const id = await auditSetup("simulator"); await sim("add 10 kg salmon 469672");
    const before = await simConversation(); const tables = state().tables;
    for (const body of [
      { id: "bad", text: A3_LONG, groupId: SIM, extra: true },
      { id: "i".repeat(129), text: A3_LONG, groupId: SIM },
      { id: null, text: A3_LONG, groupId: SIM }, { id: "bad", text: 42, groupId: SIM },
      { id: "bad", text: A3_LONG, groupId: {} }, { id: "bad", text: " ", groupId: SIM },
    ]) expect((await http("/whatsapp/messages", body)).status).toBe(400);
    expect((await sim(A3_LONG, "A3-no-identity", "unknown-person")).status).toBe(401);
    for (const group of [null, "unknown-group", "demo-conference-kitchen"]) await sim(A3_LONG, "A3-wrong-group", "p-aino", group);
    await connectSim("p-mikko"); expect((await sim(A3_LONG, "A3-other-person", "p-mikko")).status).toBe(400);
    expect(await simConversation()).toEqual(before); expect(state().tables).toEqual(tables);
    await sim("confirm change"); expect(stagedPlans(id)).toHaveLength(1);
  });

  it("A3-03 malformed browser fields and other sender/group never clear sender A's proposal", async () => {
    const id = await auditSetup("web"); await event("add 10 kg salmon 469672");
    const before = pending().filter(Boolean); const tables = state().tables;
    for (const overrides of [
      { body: 42 }, { body: null }, { id: { _serialized: 7 } }, { id: null },
      { author: {} }, { author: " " }, { from: {} }, { timestamp: "1794650400" },
    ] as unknown as Partial<WebInboundMessage>[]) await event(A3_LONG, overrides);
    await event(A3_LONG, { from: OTHER }); await event(A3_LONG, { from: "unknown@g.us" });
    await event(A3_LONG, { author: "unknown-person@lid" });
    expect(pending().filter(Boolean)).toEqual(before); expect(state().tables).toEqual(tables);
    await event("confirm change", { author: "unknown-person@lid" }); expect(stagedPlans(id)).toHaveLength(0);
    await event("confirm change"); expect(stagedPlans(id)).toHaveLength(1);
  });

  it.each(["simulator", "web"] as const)("A3-04 %s serializes concurrent pending/reject/confirm and deduplicates rejection", async (channel) => {
    const id = await auditSetup(channel); const entered = latch(), released = latch();
    hold = { text: "add 10 kg salmon 469672", entered: entered.release, release: released.promise };
    const proposal = auditSend(channel, "add 10 kg salmon 469672"); await entered.promise;
    let rejecting!: Promise<unknown>, duplicate!: Promise<unknown>, confirming!: Promise<unknown>;
    try {
      // For simulator HTTP, wait until both rejections entered the real router's
      // serialization queue; for Web, receive synchronously appends to its queue.
      rejecting = auditSend(channel, A3_LONG, "A3-queued-reject");
      duplicate = auditSend(channel, A3_LONG, "A3-queued-reject");
      if (channel === "simulator") await vi.waitFor(() => expect(simArrivals.filter((id) => id === "A3-queued-reject")).toHaveLength(2));
      confirming = auditSend(channel, "confirm change", "A3-queued-confirm");
    } finally { released.release(); }
    await Promise.all([proposal, rejecting, duplicate, confirming]);
    expect(await auditPending(channel)).toHaveLength(0); expect(stagedPlans(id)).toHaveLength(0);
    expect(state().tables.orders).toHaveLength(0); expect(state().tables.approvals).toHaveLength(0);
    const deliveries = state().whatsapp.filter((r) => r.key.startsWith("whatsapp:person:"));
    if (channel === "simulator") expect(deliveries[0].value.deliveries.filter((d: any) => d.id === "A3-queued-reject")).toHaveLength(1);
  });

  it.each(["simulator", "web"] as const)("A3-05 %s disconnect/reconnect and reset require fresh confirmation", async (channel) => {
    const id = await auditSetup(channel); await auditSend(channel, "add 10 kg salmon 469672");
    await auditSend(channel, A3_LONG, "A3-old-reject");
    await auditSend(channel, "add 12 kg salmon 469672");
    if (channel === "simulator") { await ok("/whatsapp/disconnect", {}); await connectSim(); }
    else { await ok("/whatsapp/web/disconnect", {}); await ready(); }
    await auditSend(channel, "confirm change"); expect(stagedPlans(id)).toHaveLength(0);
    await auditSend(channel, id); await auditSend(channel, "add 14 kg salmon 469672");
    const fresh = await auditPending(channel); expect(fresh).toHaveLength(1);
    await auditSend(channel, A3_LONG, "A3-old-reject"); expect(await auditPending(channel)).toEqual(fresh);
    await auditSend(channel, "confirm change"); expect(stagedPlans(id)[0].lines[0].quantity).toBe(14);
    await ok("/reset", {});
    expect(state().tables.plans).toHaveLength(0); expect(state().tables.orders).toHaveLength(0);
    expect(state().whatsapp).toHaveLength(0);
    expect((await http("/whatsapp/messages", { id: "after-reset", text: "confirm change", groupId: SIM })).status).toBe(401);
    if (channel === "web") {
      const count = calls; await event("confirm change"); expect(calls).toBe(count);
      await bridge.close(); makeBridge(); expect(await bridge.restore()).toBe(false);
    }
  });

  it("A3-06 uncertain rejected Web reply stays deduplicated across fresh proposals and restart", async () => {
    const id = await auditSetup("web"); await event("add 10 kg salmon 469672");
    browser.failNext = true;
    await event(A3_LONG, { id: { _serialized: "A3-uncertain-rejection" } });
    expect(pending().every((p) => p === null)).toBe(true); expect(stagedPlans(id)).toHaveLength(0);
    const sent = browser.sendText.mock.calls.length;
    await event("add 12 kg salmon 469672"); const fresh = pending().filter(Boolean);
    await event(A3_LONG, { id: { _serialized: "A3-uncertain-rejection" } });
    expect(browser.sendText.mock.calls.length).toBe(sent + 1); expect(pending().filter(Boolean)).toEqual(fresh);
    await event("confirm change"); expect(stagedPlans(id)[0].lines[0].quantity).toBe(12);
    await restart(); await event(A3_LONG, { id: { _serialized: "A3-uncertain-rejection" } });
    expect(browser.sendText).not.toHaveBeenCalled(); expect(state().tables.orders).toHaveLength(0);
  });

  it("A3-07 milk allergy is distinct from lactose freedom; 1000 L unknown stock cannot be confirmed", async () => {
    const blocked = await auditQuote("469363", 1, { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: ["AM"], labels: [] });
    expect(blocked.status).toBe(201); expect(blocked.body.outcome).toBe("block");
    const ap = await gatewayAudit("/approvals", { quoteId: blocked.body.id, fingerprint: blocked.body.fingerprint, grants: [] }, "p-sanna");
    expect(ap.status).toBe(409);
    expect((await gatewayAudit("/orders", { quoteId: blocked.body.id }, "agent", "A3-diet")).status).toBe(409);
    const unknown = await auditQuote("464306", 1000, { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] });
    expect(unknown.body.lines[0].stock.kind).toBe("unknown"); expect(unknown.body.unconfirmedStock).toContain("464306");
    expect((await gatewayAudit("/orders", { quoteId: unknown.body.id }, "agent", "A3-stock")).body.error).toBe("stock_unconfirmed");
    expect(state().tables.orders).toHaveLength(0); expect(state().tables.approvals).toHaveLength(0);
  });

  it("A3-08 persisted approval binds quantity/total; wrong role and fingerprint cannot approve; commit expires and retries once", async () => {
    const q = await auditQuote("469672", 100); expect(q.body.mandateCheck.approvalsNeeded).toContain("spend_cap");
    const approvalBody = { quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] };
    expect((await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "A3-cap")).status).toBe(409);
    expect((await gatewayAudit("/approvals", approvalBody, "agent")).status).toBe(403);
    expect((await gatewayAudit("/approvals", approvalBody, "p-aino")).status).toBe(403);
    expect((await gatewayAudit("/approvals", { ...approvalBody, fingerprint: "wrong" }, "p-sanna")).status).toBe(409);
    const a = await gatewayAudit("/approvals", approvalBody, "p-sanna"); expect(a.status).toBe(201);
    const changed = await auditQuote("469672", 101);
    expect(changed.body.fingerprint).not.toBe(q.body.fingerprint);
    expect((await gatewayAudit("/orders", { quoteId: changed.body.id, approvalId: a.body.id }, "agent", "A3-wrong-approval")).body.error).toBe("mandate_violation");
    expect(state().tables.orders).toHaveLength(0); expect(state().tables.approvals).toHaveLength(1);
    expect(state().tables.approvals[0]).toMatchObject({ quoteId: q.body.id, fingerprint: q.body.fingerprint });
    const first = await gatewayAudit("/orders", { quoteId: q.body.id, approvalId: a.body.id }, "agent", "A3-approved");
    const retry = await gatewayAudit("/orders", { quoteId: q.body.id, approvalId: a.body.id }, "agent", "A3-approved");
    expect(first.status).toBe(201); expect(retry.status).toBe(200); expect(retry.body.id).toBe(first.body.id);
    expect(state().tables.orders).toHaveLength(1); expect(state().tables.orders[0].lines[0].quantity).toBe(100);
    expect((await gatewayAudit("/orders", { quoteId: changed.body.id }, "agent", "A3-approved")).body.error).toBe("idempotency_conflict");
    const fresh = await auditQuote("469672", 1); setClock({ time: fresh.body.expiresAt });
    expect((await gatewayAudit("/orders", { quoteId: fresh.body.id }, "agent", "A3-expired")).body.error).toBe("quote_stale");
    expect(state().tables.orders).toHaveLength(1);
  });

  it.each(["price", "stock_short", "date", "cutoff"] as const)("A3-09 commit rechecks changed supplier %s in an explicit external overlay", async (field) => {
    const q = await auditQuote("469672", 1); expect(q.status).toBe(201);
    const originalDir = config.fixturesDir;
    const name = `A3-${field}-${sequence++}`;
    config.fixturesDir = resolve(runtime, "explicit-fixture-overlays");
    try {
      const availability: Record<string, any> = {}, price: Record<string, any> = {};
      if (field === "price") price["469672"] = { catalogPrice: { value: 30.84 } };
      if (field === "stock_short") availability["469672"] = { scheduleLines: [{ salesBlock: false, availableAmount: 0, availableDate: "2026-11-16", salesUnit: "KG" }] };
      if (field === "date") availability["469672"] = { scheduleLines: [{ salesBlock: false, availableAmount: 311, availableDate: "2026-11-17", salesUnit: "KG" }] };
      if (field === "cutoff") availability["469672"] = { closingTime: "2026-11-14T09:59:00Z" };
      saveFixture({ name: `overlay-${name}`, recordedAt: new Date(NOW).toISOString(), timeNow: new Date(NOW).toISOString(), availability, price });
      log("A3-explicit-overlay", { name, availability, price, baselineQuoteId: q.body.id });
      await ok("/data-mode", { mode: "fixture", overlay: name });
      const commit = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", `A3-changed-${field}`);
      expect(commit.status).toBe(409); expect(commit.body.error).toBe(field === "cutoff" ? "cutoff_passed" : "quote_stale");
      expect(state().tables.orders).toHaveLength(0);
    } finally { config.fixturesDir = originalDir; }
  });

  // Independent A3-F01 reproductions are acceptance checks after the gateway fix.
  it.each(["stock_unknown", "sales_block"] as const)("A3-10 A3-F01 commit must refuse newly unsafe supplier %s", async (field) => {
    const q = await auditQuote("469672", 1); expect(q.body.lines[0].stock.kind).toBe("known");
    const originalDir = config.fixturesDir, name = `A3-${field}-${sequence++}`;
    config.fixturesDir = resolve(runtime, "explicit-fixture-overlays");
    try {
      const patch = field === "sales_block" ? { salesBlock: true } : {
        scheduleLines: [{ salesBlock: false, availableAmount: 9999999999, availableDate: "2026-11-16", salesUnit: "KG" }],
      };
      saveFixture({ name: `overlay-${name}`, recordedAt: new Date(NOW).toISOString(), timeNow: new Date(NOW).toISOString(), availability: { "469672": patch }, price: {} });
      await ok("/data-mode", { mode: "fixture", overlay: name });
      const fresh = await gatewayAudit("/lookup", { productIds: ["469672"], requestedDate: "2026-11-16" });
      const freshQuote = await auditQuote("469672", 1);
      if (field === "sales_block") expect(freshQuote.body.outcome).toBe("block");
      else expect(freshQuote.body.unconfirmedStock).toContain("469672");
      const commit = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", `A3-unsafe-${field}`);
      log("A3-F01-reproduction", { field, patch, initialQuote: q.body, fresh, freshQuote: freshQuote.body, commit, persisted: state().tables });
      expect(commit.status).toBe(409);
      expect(state().tables.orders).toHaveLength(0);
    } finally { config.fixturesDir = originalDir; }
  });
});

// Reuse the existing production HTTP harness and append-only evidence journal.
// These I3 cases are fixture-only gateway checks; they do not use the fake browser.
describe("I3 current supplier facts authorize commit", () => {
  const schedule = (patch: Record<string, unknown> = {}) => ({ salesBlock: false, availableAmount: 311, availableDate: "2026-11-16", salesUnit: "KG", ...patch });
  async function overlay(availability: Record<string, unknown> = {}, price: Record<string, unknown> = {}) {
    const originalDir = config.fixturesDir, name = `I3-${sequence++}`;
    config.fixturesDir = resolve(runtime, "explicit-fixture-overlays");
    saveFixture({ name: `overlay-${name}`, recordedAt: new Date(NOW).toISOString(), timeNow: new Date(NOW).toISOString(),
      availability: { "469672": availability }, price: { "469672": price } });
    lookupAdapter.loadFixture(`overlay-${name}`);
    log("I3-explicit-overlay", { name, availability, price });
    await ok("/data-mode", { mode: "fixture", overlay: name });
    config.fixturesDir = originalDir; // loadFixture cached only this unique, external overlay.
  }
  const mutations: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["unknown stock", { scheduleLines: [schedule({ availableAmount: 9999999999 })] }, {}],
    ["top-level sales block", { salesBlock: true }, {}],
    ["schedule sales block", { scheduleLines: [schedule({ salesBlock: true })] }, {}],
    ["no schedules", { scheduleLines: [] }, {}],
    ["missing delivery date", { scheduleLines: [schedule({ availableDate: null })] }, {}],
    ["invalid delivery date", { scheduleLines: [schedule({ availableDate: "2026-02-30" })] }, {}],
    ["missing cutoff", { closingTime: null }, {}],
    ["invalid cutoff", { closingTime: "invalid" }, {}],
    ["non-string cutoff", { closingTime: 123 }, {}],
    ["rolled cutoff date", { closingTime: "2026-02-30T12:00:00Z" }, {}],
    ["changed future cutoff", { closingTime: "2026-11-15T14:00:00Z" }, {}],
    ["missing sales unit", { scheduleLines: [schedule({ salesUnit: null })] }, {}],
    ["changed sales unit", { scheduleLines: [schedule({ salesUnit: "KI" })] }, {}],
    ["zero price", {}, { catalogPrice: { value: 0 } }],
    ["negative price", {}, { catalogPrice: { value: -1 } }],
    ["NaN price", {}, { catalogPrice: { value: "NaN" } }],
    ["infinite price", {}, { catalogPrice: { value: "Infinity" } }],
    ["overflowing price", {}, { catalogPrice: { value: 1e308 } }],
    ["null price", {}, { catalogPrice: { value: null } }],
    ["missing price", {}, { error: true }],
    ["missing price end", {}, { catalogPrice: { validTo: null } }],
    ["missing price start", {}, { catalogPrice: { validFrom: null } }],
    ["invalid price end", {}, { catalogPrice: { validTo: "invalid" } }],
    ["price starts after delivery", {}, { catalogPrice: { validFrom: "2026-11-17T10:00:00Z" } }],
    ["expired price", {}, { catalogPrice: { validTo: "2026-11-14T09:00:00Z" } }],
    ["changed tax", {}, { tax: { taxRate: 25.5 } }],
  ];
  it.each(mutations)("I3-01 refuses stale %s for both order and approval", async (_name, availability, price) => {
    const q = await auditQuote("469672", 1);
    expect(q.body.outcome).toBe("order");
    await overlay(availability, price);
    const fresh = await auditQuote("469672", 1);
    const commit = await gatewayAudit("/orders", { quoteId: q.body.id, continueWithUnconfirmedStock: ["469672"] }, "agent", `I3-stale-${sequence++}`);
    expect(commit.status).toBe(409);
    expect(commit.body.error).toBe("quote_stale");
    expect(commit.body.newQuoteId).toBeTruthy();
    const approval = await gatewayAudit("/approvals", { quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }, "p-sanna");
    expect(approval.status).toBe(409);
    expect(state().tables.orders).toHaveLength(0);
    expect(state().tables.approvals).toHaveLength(0);
    log("I3-freshness-acceptance", { mutation: _name, fresh: fresh.body, commit, approval });
  });

  it("I3-02 requires a fresh unknown-stock quote and explicit builder choice, then preserves the disclosure", async () => {
    const old = await auditQuote("469672", 1);
    await overlay({ scheduleLines: [schedule({ availableAmount: 9999999999 })] });
    const stale = await gatewayAudit("/orders", { quoteId: old.body.id, continueWithUnconfirmedStock: ["469672"] }, "agent", "I3-old-extra-consent");
    expect(stale.status).toBe(409);
    const quote = state().tables.quotes.find((q) => q.id === stale.body.newQuoteId);
    expect(quote.unconfirmedStock).toEqual(["469672"]);
    expect((await gatewayAudit("/orders", { quoteId: quote.id }, "agent", "I3-needs-choice")).body.error).toBe("stock_unconfirmed");
    const body = { quoteId: quote.id, continueWithUnconfirmedStock: ["469672"], decidedBy: "I3 builder" };
    const accepted = await gatewayAudit("/orders", body, "agent", "I3-reviewed-choice");
    expect(accepted.status).toBe(201);
    expect(accepted.body.lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "I3 builder" } });
    const same = await gatewayAudit(`/orders/${accepted.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity: 1 }] });
    expect(same.status).toBe(200);
    expect(same.body.order.lines[0].riskAccepted).toEqual(accepted.body.lines[0].riskAccepted);
    for (const change of [{ outletId: "banquet", quantity: 2 }, { outletId: "bar", quantity: 1 }]) {
      const increased = await gatewayAudit(`/orders/${accepted.body.id}/amendments`, { changes: [{ productId: "469672", ...change }] });
      expect(increased.body.error).toBe("stock_unconfirmed");
      expect(state().tables.orders[0].version).toBe(2);
    }
    const increased = await gatewayAudit(`/orders/${accepted.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity: 2 }], continueWithUnconfirmedStock: ["469672"], decidedBy: "I3 new decision" });
    expect(increased.status).toBe(200);
    expect(increased.body.order.lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "I3 new decision" } });
    const retry = await gatewayAudit("/orders", body, "agent", "I3-reviewed-choice");
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(accepted.body.id);
    expect(state().tables.orders).toHaveLength(1);
  });

  it("I3-03 reevaluates current policy and does not reuse a cheap-line pre-answer after it is withdrawn", async () => {
    const mandate = getMandate("hotel-aurora");
    putMandate({ ...mandate, preAnswers: { ...mandate.preAnswers, unknownStockMaxLineEur: 40 } });
    await overlay({ scheduleLines: [schedule({ availableAmount: 9999999999 })] });
    const q = await auditQuote("469672", 1);
    expect(q.body.unconfirmedStock).toEqual([]);
    const placed = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-pre-answer");
    expect(placed.status).toBe(201);
    putMandate({ ...mandate, version: mandate.version + 1 });
    const change = await gatewayAudit(`/orders/${placed.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity: 1 }] });
    expect(change.body.error).toBe("stock_unconfirmed");
    expect((await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-withdrawn-policy")).body.error).toBe("quote_stale");
    expect(state().tables.orders).toHaveLength(1);
  });

  it.each(["unknown", "sales block"])("I3-04 signed finance approval cannot waive new %s facts", async (mutation) => {
    const q = await auditQuote("469672", 100);
    const approval = await gatewayAudit("/approvals", { quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }, "p-sanna");
    expect(approval.status).toBe(201);
    await overlay(mutation === "unknown" ? { scheduleLines: [schedule({ availableAmount: 9999999999 })] } : { salesBlock: true });
    const commit = await gatewayAudit("/orders", { quoteId: q.body.id, approvalId: approval.body.id }, "agent", "I3-approved-stale");
    expect(commit.body.error).toBe("quote_stale");
    if (mutation === "sales block") {
      const replacement = state().tables.quotes.find((x) => x.id === commit.body.newQuoteId);
      expect((await gatewayAudit("/approvals", { quoteId: replacement.id, fingerprint: replacement.fingerprint, grants: ["spend_cap"] }, "p-sanna")).body.error).toBe("hard_rule");
    }
    expect(state().tables.orders).toHaveLength(0);
  });

  it("I3-05 binds approvals to a quote and amendment approvals to the actual order version", async () => {
    const q = await auditQuote("469672", 100);
    const approval = await gatewayAudit("/approvals", { quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }, "p-sanna");
    const sameTerms = await auditQuote("469672", 100);
    expect((await gatewayAudit("/orders", { quoteId: sameTerms.body.id, approvalId: approval.body.id }, "agent", "I3-other-quote")).body.error).toBe("mandate_violation");
    const order = await gatewayAudit("/orders", { quoteId: q.body.id, approvalId: approval.body.id }, "agent", "I3-approved");
    expect(order.status).toBe(201);
    const changes = [{ productId: "469672", outletId: "banquet", quantity: 101 }];
    const needs = await gatewayAudit(`/orders/${order.body.id}/amendments`, { changes, approvalId: approval.body.id });
    expect(needs.body.error).toBe("mandate_violation");
    const aq = state().tables.quotes.find((x) => x.id === needs.body.newQuoteId);
    expect((await gatewayAudit("/orders", { quoteId: aq.id, approvalId: approval.body.id }, "agent", "I3-amendment-is-not-new-order")).body.error).toBe("invalid");
    const aa = await gatewayAudit("/approvals", { quoteId: aq.id, fingerprint: aq.fingerprint, grants: ["spend_cap"] }, "p-sanna");
    expect(aa.status).toBe(201);
    const amended = await gatewayAudit(`/orders/${order.body.id}/amendments`, { changes, approvalId: aa.body.id });
    expect(amended.status).toBe(200);
    expect(amended.body.order.version).toBe(2);
    await overlay({ salesBlock: true });
    const blockedChange = await gatewayAudit(`/orders/${order.body.id}/amendments`, { changes: [{ ...changes[0], quantity: 102 }], approvalId: aa.body.id, continueWithUnconfirmedStock: ["469672"] });
    expect(blockedChange.body.error).toBe("hard_rule");
    expect(state().tables.orders[0].version).toBe(2);
  });

  it.each([false, true])("I3-06 concurrent same-key submissions are atomic (conflict=%s)", async (conflict) => {
    const q = await auditQuote("469672", 1);
    const other = conflict ? await auditQuote("469672", 2) : q;
    const realLookup = lookupAdapter.lookup;
    let arrived = 0, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.spyOn(lookupAdapter, "lookup").mockImplementation(async (...args) => {
      const value = await realLookup(...args); arrived++; await gate; return value;
    });
    const calls = [q, other].map((quote) => gatewayAudit("/orders", { quoteId: quote.body.id }, "agent", "I3-concurrent"));
    try { await vi.waitFor(() => expect(arrived).toBe(2)); } finally { release(); }
    const result = await Promise.all(calls);
    expect(result.map((r) => r.status).sort()).toEqual(conflict ? [201, 422] : [200, 201]);
    if (!conflict) expect(new Set(result.map((r) => r.body.id)).size).toBe(1);
    else expect(result.find((r) => r.status === 422)?.body.error).toBe("idempotency_conflict");
    expect(state().tables.orders).toHaveLength(1);
  });

  it("I3-07 rechecks the clock after supplier I/O", async () => {
    const q = await auditQuote("469672", 1);
    const realLookup = lookupAdapter.lookup;
    vi.spyOn(lookupAdapter, "lookup").mockImplementation(async (...args) => {
      const value = await realLookup(...args); setClock({ time: q.body.expiresAt }); return value;
    });
    expect((await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-clock-crossing")).body.error).toBe("quote_stale");
    expect(state().tables.orders).toHaveLength(0);
  });

  it("I3-08 accepts sufficient known-stock changes and records the actual fresh stock", async () => {
    const q = await auditQuote("469672", 1);
    await overlay({ scheduleLines: [schedule({ availableAmount: 300 })] });
    const commit = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-sufficient-current-stock");
    expect(commit.status).toBe(201);
    expect(commit.body.lines[0]).toMatchObject({ unitPrice: 29.84, stock: { kind: "known", amount: 300 }, riskAccepted: null });
  });

  it("I3-09 unknown-stock consent expires when supplier terms change", async () => {
    await overlay({ scheduleLines: [schedule({ availableAmount: 9999999999 })] });
    const q = await auditQuote("469672", 1);
    const placed = await gatewayAudit("/orders", { quoteId: q.body.id, continueWithUnconfirmedStock: ["469672"] }, "agent", "I3-initial-risk");
    expect(placed.status).toBe(201);
    await overlay({ closingTime: "2026-11-15T18:00:00+0200", scheduleLines: [schedule({ availableAmount: 9999999999 })] });
    const changed = await gatewayAudit(`/orders/${placed.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity: 1 }] });
    expect(changed.body.error).toBe("stock_unconfirmed");
    expect(state().tables.orders[0].version).toBe(1);
    await overlay({ closingTime: "2026-11-15T19:00:00+0200", scheduleLines: [schedule({ availableAmount: 9999999999 })] });
    const staleDecision = await gatewayAudit(`/orders/${placed.body.id}/amendments`, {
      changes: [{ productId: "469672", outletId: "banquet", quantity: 1 }],
      continueWithUnconfirmedStock: ["469672"], stockQuoteId: changed.body.newQuoteId,
    });
    expect(staleDecision.body.error).toBe("stock_unconfirmed");
    expect(state().tables.orders[0].version).toBe(1);
  });

  it("I3-10 rechecks site authorization for new orders and amendments", async () => {
    const q = await auditQuote("469672", 1);
    const placed = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-original-site");
    const m = getMandate("hotel-aurora"); putMandate({ ...m, sites: [], version: m.version + 1 });
    expect((await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-site-revoked")).body.error).toBe("quote_stale");
    const change = await gatewayAudit(`/orders/${placed.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity: 2 }] });
    expect(change.body.error).toBe("hard_rule");
    expect(change.body.rules).toContainEqual(expect.objectContaining({ ruleId: "DLV-05" }));
    expect(state().tables.orders[0].version).toBe(1);
  });

  it("I3-11 concurrent amendments cannot overwrite a newer order version", async () => {
    const q = await auditQuote("469672", 1);
    const placed = await gatewayAudit("/orders", { quoteId: q.body.id }, "agent", "I3-amend-race");
    const realLookup = lookupAdapter.lookup;
    let arrived = 0, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.spyOn(lookupAdapter, "lookup").mockImplementation(async (...args) => {
      const value = await realLookup(...args); arrived++; await gate; return value;
    });
    const calls = [2, 3].map((quantity) => gatewayAudit(`/orders/${placed.body.id}/amendments`, { changes: [{ productId: "469672", outletId: "banquet", quantity }] }));
    try { await vi.waitFor(() => expect(arrived).toBe(2)); } finally { release(); }
    const result = await Promise.all(calls);
    expect(result.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(result.find((r) => r.status === 409)?.body.error).toBe("quote_stale");
    expect(state().tables.orders[0].version).toBe(2);
  });

  it("I3-12 preserves upstream unavailability status through the app", async () => {
    vi.spyOn(gw, "orders").mockRejectedValue(new GatewayError(503, { error: "upstream_unavailable", message: "I3 synthetic upstream failure" }));
    const result = await http("/orders");
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("upstream_unavailable");
    expect(state().tables.orders).toHaveLength(0);
  });
});

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
