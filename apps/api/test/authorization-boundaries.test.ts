import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WhatsAppConversation } from "@aimo/contracts";
import type { WhatsAppBrowserClient } from "../src/whatsapp/web-client.js";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const temporary = mkdtempSync(join(tmpdir(), "aimo-authorization-"));
process.env.GATEWAY_SIGNING_KEY_FILE = join(temporary, "signing.pem");
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getDb } = await import("../src/db.js");
const { getPerson, resolveToken } = await import("../src/identity.js");
const { getPlan, newPlan, savePlan } = await import("../src/agent/plan.js");
const { getEvent, saveEvent } = await import("../src/agent/events.js");
const { makeQuestion, saveQuestion, getQuestion } = await import("../src/agent/questions.js");
const { handleWhatsAppMessage } = await import("../src/whatsapp/service.js");
const { WhatsAppWebBridge } = await import("../src/whatsapp/web.js");
const { placeOrder, amendOrder, createBuilderConsent } = await import("../src/gateway/service.js");
let server: Server;
let base: string;
let mikko: string;
let aino: string;
let sanna: string;
let sequence = 0;
const agent = "agent_demo_hotel_aurora";

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  server.keepAliveTimeout = 60_000;
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(temporary, { recursive: true, force: true });
});
async function call(path: string, token = aino, body?: unknown, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
beforeEach(async () => {
  expect((await call("/api/reset", "", {})).status).toBe(200);
  const login = async (personId: string) => (await call("/api/session", "", { personId })).body.token;
  mikko = await login("p-mikko"); aino = await login("p-aino"); sanna = await login("p-sanna");
  await call("/api/clock", aino, { time: "2026-11-14T10:00:00Z" });
});
const quoteBody = (outlets = ["banquet"], productId = "469672") => ({
  siteId: "site-aurora", deliveryDate: "2026-11-16",
  lines: outlets.map((outletId) => ({ outletId, productId, quantity: 5 })),
});
async function quote(outlets = ["banquet"], productId = "469672") {
  const response = await call("/gateway/v1/quotes", agent, quoteBody(outlets, productId));
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body;
}
async function order(q: any, token = agent, extra: Record<string, unknown> = {}, key = `authorization-${sequence++}`) {
  return call("/gateway/v1/orders", token, { quoteId: q.id, ...extra }, "POST", { "idempotency-key": key });
}
function plan(outletId = "banquet") {
  const p = newPlan("single", { personId: "p-aino", name: "Aino" }, outletId, {});
  p.tooLate = { neededBy: "2026-11-15", earliestDelivery: "2026-11-16" } as any;
  savePlan(p);
  return p;
}

describe("person outlet authorization", () => {
  it("refuses any out-of-scope quote line before saving a quote", async () => {
    const response = await call("/gateway/v1/quotes", mikko, quoteBody(["bar", "banquet"]));
    expect(response.status).toBe(403);
    expect(response.body.rules[0].ruleId).toBe("MAN-03");
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM quotes").get()).toMatchObject({ n: 0 });
  });
  it("checks a quote's outlets at order time, including same-key replays", async () => {
    const q = await quote();
    expect((await order(q, mikko)).status).toBe(403);
    const key = `shared-${sequence++}`;
    expect((await order(q, aino, {}, key)).status).toBe(201);
    expect((await order(q, mikko, {}, key)).status).toBe(403);
  });
  it("keeps own-outlet, all-authorized-outlet and external agent orders available", async () => {
    expect((await call("/gateway/v1/quotes", mikko, quoteBody(["bar"]))).status).toBe(201);
    expect((await order(await quote(["bar"]), mikko)).status).toBe(201);
    expect((await order(await quote(["bar", "banquet"]), aino)).status).toBe(201);
    expect((await order(await quote(), agent)).status).toBe(201);
  });
  it("refuses an out-of-scope request before creating a plan", async () => {
    const parsed = await call("/api/messages", aino, { text: "5 kg salmon 469672 by Monday" });
    const request = { ...parsed.body.request, outletId: "banquet", neededBy: "2026-11-16" };
    expect((await call("/api/requests", mikko, { request, reviewing: true })).status).toBe(403);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM plans").get()).toMatchObject({ n: 0 });
    expect((await call("/api/requests", aino, { request, reviewing: true })).status).toBe(200);
  });
  it("refuses a cross-outlet amendment without changing the existing order", async () => {
    const placed = await order(await quote());
    expect(placed.status).toBe(201);
    const response = await call(`/gateway/v1/orders/${placed.body.id}/amendments`, mikko, { changes: [{ productId: "469672", outletId: "banquet", quantity: 6 }] });
    expect(response.status).toBe(403);
    expect((await call(`/gateway/v1/orders/${placed.body.id}`, aino)).body.version).toBe(1);
  });
  it("protects plan details and the too-late choice without mutating it", async () => {
    const p = plan();
    expect((await call(`/api/plans/${p.id}`, mikko)).status).toBe(403);
    expect((await call(`/api/plans/${p.id}/too-late`, mikko, { choice: "remove" })).status).toBe(403);
    expect(getPlan(p.id)!.tooLateChoice).toBeFalsy();
    expect((await call(`/api/plans/${p.id}`, aino)).status).toBe(200);
    expect((await call(`/api/plans/${p.id}/too-late`, aino, { choice: "review" })).status).toBe(200);
  });
  it.each([
    ["POST", "guests", { guests: 181, version: 1 }],
    ["POST", "change", { guests: 181, version: 1 }],
    ["POST", "diet-groups", { group: { id: "test", label: "Milk", count: 1, constraints: { claims: [], avoidAllergens: ["AM"], labels: [] }, standing: false }, version: 1 }],
    ["POST", "remove-need", { needId: "missing", version: 1 }],
    ["POST", "order", {}], ["POST", "viability", {}],
    ["POST", "menu/order", { version: 1 }],
    ["POST", "final-check", {}], ["POST", "cutoff", {}],
    ["PUT", "menu", { version: 1, guests: 180, dietsConfirmed: true, dietGroups: [], dishes: [] }],
  ])("protects event %s %s before mutation", async (method, path, body) => {
    const before = getEvent("evt-wedding");
    expect((await call(`/api/events/evt-wedding/${path}`, mikko, body, method)).status).toBe(403);
    expect(getEvent("evt-wedding")).toEqual(before);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM plans").get()).toMatchObject({ n: 0 });
  });
  it("protects detailed event/basket reads and permits a chef authorized for every outlet", async () => {
    for (const path of ["/api/baskets/evt-wedding", "/api/events/evt-wedding", "/api/events/evt-wedding/menu"]) {
      expect((await call(path, mikko)).status, path).toBe(403);
      expect((await call(path, aino)).status, path).toBe(200);
    }
    // Aino covers both outlets without hotelScope; multi-outlet is not a manager-only policy.
    expect((await call("/api/events/evt-wedding/guests", aino, { guests: 181, version: getEvent("evt-wedding")!.version })).status).toBe(200);
  });
  it("checks staged and placed basket outlets even when an event has no dishes", async () => {
    const e = getEvent("evt-wedding")!; e.dishes = []; saveEvent(e);
    const p = plan(); p.eventId = e.id; p.basketedAt = "2026-11-14T10:00:00Z";
    p.lines = [{ outletId: "banquet", removed: false }] as any; savePlan(p);
    expect((await call(`/api/events/${e.id}/cutoff`, mikko, {})).status).toBe(403);
    p.lines = []; savePlan(p);
    const q = await call("/gateway/v1/quotes", agent, { ...quoteBody(), eventId: e.id });
    expect((await order(q.body)).status).toBe(201);
    expect((await call(`/api/events/${e.id}/cutoff`, mikko, {})).status).toBe(403);
    expect((await call(`/api/baskets/${e.id}`, aino)).status).toBe(200);
  });
  it("cannot save a menu that introduces an unauthorized outlet", async () => {
    const e = getEvent("evt-wedding")!; const dishes = structuredClone(e.dishes);
    e.dishes = []; saveEvent(e);
    expect((await call(`/api/events/${e.id}/menu`, mikko, { version: e.version, guests: e.guests, dietsConfirmed: true, dietGroups: [], dishes }, "PUT")).status).toBe(403);
    expect(getEvent(e.id)!.dishes).toEqual([]);
  });
  it("matches basket authorization without letting an unstaged preview take away outlet access", async () => {
    const e = getEvent("evt-wedding")!; e.dishes = []; saveEvent(e);
    const p = plan(); p.eventId = e.id; p.reviewing = true;
    p.lines = [{ outletId: "banquet", removed: false }] as any; savePlan(p);
    expect((await call(`/api/events/${e.id}`, mikko)).status).toBe(200);
    p.reviewing = false; savePlan(p);
    // Basket detail also includes visible, unstaged request records: those
    // remain private even though they do not authorize an event mutation.
    expect((await call(`/api/baskets/${e.id}`, mikko)).status).toBe(403);
    p.basketedAt = "2026-11-14T10:00:00Z"; savePlan(p);
    expect((await call(`/api/events/${e.id}`, mikko)).status).toBe(403);
  });

  it("keeps private draft records out of successful contribution and submission responses", async () => {
    const e = getEvent("evt-wedding")!; e.dishes = []; saveEvent(e);
    const other = plan(); other.eventId = e.id; other.status = "rejected"; other.tooLate = null;
    // Rejected history stays private but does not block the active order's review.
    other.lines = [{ outletId: "banquet", removed: false }] as any; savePlan(other);
    const parsed = await call("/api/messages", mikko, { text: "5 l lactose-free milk 469363 by Monday" });
    const created = await call("/api/requests", mikko, {
      eventId: e.id, reviewing: true,
      request: { ...parsed.body.request, outletId: "bar", neededBy: "2026-11-16" },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const own = created.body.plan;
    const staged = await call(`/api/plans/${own.id}/basket`, mikko, { continueWithWarnings: true });
    expect(staged.status, JSON.stringify(staged.body)).toBe(200);
    expect(getPlan(own.id)!.basketedAt).toBeTruthy();
    expect(Boolean(staged.body.basket)).toBe(false);
    const submitted = await call(`/api/baskets/${e.id}/submit-review`, mikko, {});
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.review.eventId).toBe(e.id);
    expect(Boolean(submitted.body.basket)).toBe(false);
    expect(JSON.stringify(submitted.body)).not.toContain(other.id);
    expect((await call(`/api/baskets/${e.id}`, mikko)).status).toBe(403);
    expect(getPlan(other.id)!.basketedAt).toBeFalsy();
  });
});

describe("stock decision attribution", () => {
  it.each(["person", "agent"])("attributes %s decisions honestly on orders and amendments", async (kind) => {
    const token = kind === "person" ? mikko : agent;
    const q = await quote(["bar"], "464306");
    expect(q.unconfirmedStock).toContain("464306");
    expect((await order(q, token, { continueWithUnconfirmedStock: ["464306"], decidedBy: "Aino" })).body.error).toBe("stock_unconfirmed");
    const consent = await call("/gateway/v1/builder-consents", mikko, { quoteId: q.id, fingerprint: q.fingerprint, productIds: ["464306"] });
    expect(consent.status).toBe(201);
    const placed = await order(q, token, { continueWithUnconfirmedStock: ["464306"], builderConsentId: consent.body.id, decidedBy: "Aino" });
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    const expected = "Mikko";
    expect(placed.body.lines[0].riskAccepted.by).toBe(expected);
    const changes = [{ productId: "464306", outletId: "bar", quantity: 6 }];
    const reviewed = await call(`/gateway/v1/orders/${placed.body.id}/amendments`, token, { changes, quoteOnly: true });
    expect(reviewed.status).toBe(200);
    const amendment = reviewed.body.quote;
    const freshConsent = await call("/gateway/v1/builder-consents", mikko, { quoteId: amendment.id, fingerprint: amendment.fingerprint, productIds: ["464306"] });
    expect(freshConsent.status).toBe(201);
    const amended = await call(`/gateway/v1/orders/${placed.body.id}/amendments`, token, { changes, continueWithUnconfirmedStock: ["464306"], builderConsentId: freshConsent.body.id, decidedBy: "Aino" });
    expect(amended.status, JSON.stringify(amended.body)).toBe(200);
    expect(amended.body.order.lines[0].riskAccepted.by).toBe(expected);
  });
  it("does not let an optional audit actor impersonate the authenticated risk decision maker", async () => {
    const identity = resolveToken(mikko)!;
    const actor = { kind: "person" as const, id: "p-aino", name: "Aino", role: "chef", outletId: "bar", testSession: true };
    const q = await quote(["bar"], "464306");
    const consent = createBuilderConsent(identity, { quoteId: q.id, fingerprint: q.fingerprint, productIds: ["464306"] });
    const placed = await placeOrder(identity, q.id, `actor-${sequence++}`, undefined, actor, { continueWith: ["464306"], builderConsentId: consent.id, decidedBy: "Aino" });
    expect(placed.order.lines[0].riskAccepted!.by).toBe("Mikko");
    const changes = [{ productId: "464306", outletId: "bar", quantity: 6 }];
    const reviewed = await amendOrder(identity, placed.order.id, { changes, quoteOnly: true }, actor);
    const amendment = reviewed.quote!;
    const freshConsent = createBuilderConsent(identity, { quoteId: amendment.id, fingerprint: amendment.fingerprint, productIds: ["464306"] });
    const amended = await amendOrder(identity, placed.order.id, { changes, continueWithUnconfirmedStock: ["464306"], builderConsentId: freshConsent.id, decidedBy: "Aino" }, actor);
    expect(amended.order.lines[0].riskAccepted!.by).toBe("Mikko");
  });
});

describe("WhatsApp financial approval boundary", () => {
  it("does not transfer the linking approver's authority through the real Web bridge", async () => {
    const q = makeQuestion({ eventId: "evt-wedding", planId: "finance-fixture", quoteId: null, fingerprint: null, deadline: null, ruleIds: ["MAN-01"], type: "spend_cap", forRole: "approver", outletId: null, title: "Approve order?", body: "Review finance", facts: {}, options: [{ id: "approve", label: "Approve", primary: true }, { id: "reject", label: "Refuse", primary: false }] });
    saveQuestion(q);
    const group = "authorization-fixture@g.us";
    const browser = new EventEmitter() as EventEmitter & WhatsAppBrowserClient;
    browser.initialize = browser.destroy = browser.logout = async () => {};
    browser.getAccount = () => ({ id: "authorization-fixture@c.us", name: "Synthetic account" });
    browser.getGroups = async () => [{ id: group, name: "Synthetic group" }];
    const sendText = vi.fn(async (_destination: string, _text: string) => {});
    browser.sendText = sendText;
    const bridge = new WhatsAppWebBridge(handleWhatsAppMessage, { createClient: async () => browser });
    const person = getPerson("p-sanna")!;
    try {
      await bridge.connect(person, sanna);
      browser.emit("ready");
      await vi.waitFor(() => expect(bridge.status(person).phase).toBe("ready"));
      bridge.selectGroup(person, group);
      for (const fromMe of [false, true]) {
        for (const text of ["evt-wedding", "approve", "confirm approval", "refuse: too much", "confirm refusal"]) {
          await bridge.receive({ id: { _serialized: `group-${sequence++}` }, from: group, to: group, author: "untrusted-member@lid", body: text, fromMe, timestamp: Math.floor(Date.now() / 1000), type: "chat" });
          expect(getQuestion(q.id)!.state).toBe("open");
          if (text === "approve" || text.startsWith("refuse:")) expect(sendText.mock.calls.at(-1)![1]).toContain("app");
        }
      }
      expect(getDb().prepare("SELECT COUNT(*) AS n FROM approvals").get()).toMatchObject({ n: 0 });
      // The same authenticated approver can still decide through the app.
      expect((await call(`/api/questions/${q.id}/answer`, sanna, { optionId: "approve" })).status).toBe(200);
      expect(getQuestion(q.id)!.answeredBy).toEqual({ personId: "p-sanna", name: "Sanna" });
    } finally { await bridge.close(); }
  });

  it("keeps finance in the app for Web, including old pending confirmations; preserves the authenticated simulator", async () => {
    const e = getEvent("evt-wedding")!;
    const q = makeQuestion({ eventId: e.id, planId: "finance-fixture", quoteId: null, fingerprint: null, deadline: null, ruleIds: ["MAN-01"], type: "spend_cap", forRole: "approver", outletId: null, title: "Approve order?", body: "Review finance", facts: {}, options: [{ id: "approve", label: "Approve", primary: true }, { id: "reject", label: "Refuse", primary: false }] });
    saveQuestion(q);
    let conversation: WhatsAppConversation = { activeOrderId: e.id, pending: null };
    const send = async (text: string, channel: "web" | "simulator") => {
      const out = await handleWhatsAppMessage({ person: getPerson("p-sanna")!, token: sanna, conversation, text, messageId: `finance-${sequence++}`, channel });
      conversation = out.conversation; return out.reply;
    };
    expect((await send("approve", "web")).status).toBe("blocked");
    expect((await send("refuse: too much", "web")).status).toBe("blocked");
    expect(getQuestion(q.id)!.state).toBe("open");
    // An old simulator proposal (or a persisted pre-fix Web proposal) cannot authorize Web.
    expect((await send("approve", "simulator")).status).toBe("proposal");
    expect(conversation.pending?.kind).toBe("answer_question");
    const blocked = await send("confirm approval", "web");
    expect(blocked.status).toBe("blocked");
    expect(blocked.text).toContain("app");
    expect(conversation.pending).toBeNull();
    expect(getQuestion(q.id)!.state).toBe("open");
    expect((await send("approve", "simulator")).status).toBe("proposal");
    await send("confirm approval", "simulator");
    expect(getQuestion(q.id)!.state).toBe("answered");
    expect(getQuestion(q.id)!.answeredBy).toEqual({ personId: "p-sanna", name: "Sanna" });
  });
});
