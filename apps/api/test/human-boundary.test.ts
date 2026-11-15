import { beforeAll, beforeEach, afterAll, afterEach, describe, it, expect } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { issueToken } = await import("../src/identity.js");
const { getMandate, putMandate } = await import("../src/gateway/service.js");
let server: Server, base: string, chef: string, finance: string, bar: string;
const agent = "agent_demo_hotel_aurora";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(() => {
  config.testMode = true;
  seedReset(); setClock({ time: "2026-11-14T10:00:00Z" });
  chef = issueToken({ kind: "person", personId: "p-aino", testSession: false });
  finance = issueToken({ kind: "person", personId: "p-sanna", testSession: false });
  bar = issueToken({ kind: "person", personId: "p-mikko", testSession: false });
});
afterEach(() => { config.testMode = true; });
async function http(path: string, body?: unknown, token = agent, key = "order") {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": key }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json() as any };
}
const gw = (path: string, body?: unknown, token?: string, key?: string) => http(`/gateway/v1${path}`, body, token, key);
async function quote(quantity = 1, outletId = "banquet") {
  const r = await gw("/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "464306", quantity, outletId }] });
  expect(r.status).toBe(201); return r.body;
}
const consent = (q: any, token = chef) => gw("/builder-consents", { quoteId: q.id, fingerprint: q.fingerprint, productIds: ["464306"] }, token);
const place = (q: any, id?: string, key?: string) => gw("/orders", { quoteId: q.id, continueWithUnconfirmedStock: ["464306"], decidedBy: "SPOOF", builderConsentId: id }, agent, key);
describe("authenticated builder boundary over HTTP", () => {
  it("refuses agent self-consent, chef name spoofing and finance substitution", async () => {
    const q = await quote();
    expect((await place(q)).body.error).toBe("stock_unconfirmed");
    expect((await consent(q, agent)).status).toBe(403);
    expect((await consent(q, finance)).status).toBe(403);
    expect((await consent(q, bar)).status).toBe(403);
    expect((await place(q, "invented")).body.error).toBe("stock_unconfirmed");
  });
  it("accepts genuine chef consent, records authenticated identity and replays once", async () => {
    const q = await quote(), c = await consent(q);
    expect(c.status).toBe(201);
    const r = await place(q, c.body.id);
    expect(r.status).toBe(201);
    expect(r.body.lines[0].riskAccepted.by).toBe("Aino");
    const retry = await place(q, c.body.id);
    expect(retry.status).toBe(200); expect(retry.body.id).toBe(r.body.id);
  });
  it("rejects another quote, changed quantity, expired consent and policy changes", async () => {
    const q = await quote(), c = (await consent(q)).body;
    expect((await place(await quote(), c.id)).status).toBe(409);
    expect((await place(await quote(2), c.id)).status).toBe(409);
    const m = getMandate(q.hotelId);
    putMandate({ ...m, version: m.version + 1 });
    expect((await place(q, c.id)).status).toBe(409);
    putMandate(m);
    setClock({ time: q.expiresAt });
    expect((await consent(q)).status).toBe(409);
    expect((await place(q, c.id)).status).toBe(409);
  });
  it("rechecks the consenting chef's current scope", async () => {
    const q = await quote(), c = (await consent(q)).body;
    const { getDb } = await import("../src/db.js");
    const { getPerson } = await import("../src/identity.js");
    getDb().prepare("UPDATE people SET json = ? WHERE id = ?").run(JSON.stringify({ ...getPerson("p-aino"), outlets: ["bar"] }), "p-aino");
    expect((await place(q, c.id)).body.error).toBe("stock_unconfirmed");
  });
  it("requires new authenticated consent for changed amendment quantities", async () => {
    const q = await quote(), c = (await consent(q)).body;
    const order = (await place(q, c.id)).body;
    const path = `/orders/${order.id}/amendments`;
    const body = { changes: [{ productId: "464306", outletId: "banquet", quantity: 2 }], continueWithUnconfirmedStock: ["464306"], decidedBy: "Aino" };
    const refused = await gw(path, body);
    expect(refused.body.error).toBe("stock_unconfirmed");
    const r = await fetch(`${base}/gateway/v1/quotes/${refused.body.newQuoteId}`, { headers: { Authorization: `Bearer ${agent}` } });
    const amendedQuote = await r.json();
    expect((await consent(amendedQuote, finance)).status).toBe(403);
    const ac = (await consent(amendedQuote)).body;
    expect((await gw(path, { ...body, changes: [{ ...body.changes[0], quantity: 3 }], builderConsentId: ac.id })).status).toBe(409);
    expect((await gw(path, { ...body, builderConsentId: c.id })).status).toBe(409);
    const accepted = await gw(path, { ...body, builderConsentId: ac.id });
    expect(accepted.status).toBe(200); expect(accepted.body.order.lines[0].riskAccepted.by).toBe("Aino");
  });
  it("preserves standing pre-answers without agent-supplied consent", async () => {
    const m = getMandate("hotel-aurora");
    putMandate({ ...m, preAnswers: { ...m.preAnswers, unknownStockMaxLineEur: 100 } });
    const q = await quote();
    const r = await gw("/orders", { quoteId: q.id });
    expect(r.status).toBe(201); expect(r.body.lines[0].riskAccepted.by).toBe("pre-answer");
  });
  it("does not treat a shared preview password as a person credential", async () => {
    config.testMode = false; process.env.PREVIEW_PASSWORD = "synthetic-preview-test";
    try {
      const r = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json", "X-Preview-Password": "synthetic-preview-test" }, body: JSON.stringify({ personId: "p-sanna" }) });
      expect(r.status).toBe(403);
    } finally { process.env.PREVIEW_PASSWORD = ""; }
  });
  it("disables anonymous, preview-only and agent persona switching outside explicit demo mode", async () => {
    const demo = (await http("/api/session", { personId: "p-sanna" })).body.token;
    config.testMode = false;
    for (const token of ["", agent, chef, demo])
      expect((await http("/api/session", { personId: "p-sanna" }, token)).status).toBe(403);
    expect((await http("/api/session", { personId: "p-sanna" }, finance)).status).toBe(200);
    expect((await consent(await quote(), demo)).status).toBe(401);
  });
});
