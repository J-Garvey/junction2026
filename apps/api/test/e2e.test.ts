/**
 * The three test cases the PRD requires (prd-context "Test cases"), run against the
 * real HTTP stack on fixtures, from a fresh reset, twice in a row with the same result.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");

let BASE = "";
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  server.keepAliveTimeout = 60_000; // Leave room for cold catalogue work on a busy local host.
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  BASE = `http://127.0.0.1:${port}`;
  config.gatewayUrl = `${BASE}/gateway/v1`;
});
afterAll(() => server.close());

class Client {
  cookie = "";
  constructor(public person: string) {}
  async login() {
    const r = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: this.person }) });
    this.cookie = r.headers.get("set-cookie")!.split(";")[0];
    return this;
  }
  async call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  }
}
async function gateway(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${BASE}/gateway/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer agent_demo_hotel_aurora", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
}

async function fresh() {
  await fetch(`${BASE}/api/reset`, { method: "POST" });
  const anna = await new Client("p-aino").login();
  const mikko = await new Client("p-mikko").login();
  const sara = await new Client("p-sanna").login();
  const jonas = await new Client("p-jonas").login();
  return { anna, mikko, sara, jonas };
}

async function milkCase(choice: "continue" | "confirmed") {
  const { anna, sara, jonas } = await fresh();
  await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  await anna.call("POST", "/data-mode", { mode: "fixture", overlay: null });
  const m = await anna.call("POST", "/messages", { text: "I need 1,000 litres of lactose-free milk by Monday" });
  const proposed = await anna.call("POST", "/requests", { request: m.request });
  // Nothing is quoted on until the chef approves adding the products.
  expect(proposed.plan.proposal).toBe(true);
  expect(proposed.questions.filter((q: any) => q.state === "open")).toHaveLength(0);
  const r = await anna.call("POST", `/plans/${proposed.plan.id}/accept`);
  const stockQ = r.questions.find((x: any) => x.type === "unknown_stock");
  const approverTry = await sara.call("POST", `/questions/${stockQ.id}/answer`, { optionId: "continue" });
  const a = await anna.call("POST", `/questions/${stockQ.id}/answer`, { optionId: choice });
  let after = a.plan;
  let approval: any = null;
  if (after.status === "waiting") {
    const pq = (await sara.call("GET", "/home")).questions.find((x: any) => x.forRole === "approver");
    approval = await sara.call("POST", `/questions/${pq.id}/answer`, { optionId: "approve" });
    after = approval.plan;
  }
  const second = await jonas.call("POST", `/questions/${stockQ.id}/answer`, { optionId: "others" });
  const orders = (await anna.call("GET", "/orders")).orders;
  return { plan: r.plan, stockQ, approverTry, a, after, approval, second, orders };
}

async function eventCase() {
  const { anna, mikko, sara, jonas } = await fresh();
  const aino = anna;
  const sanna = sara;
  const v = async () => (await aino.call("GET", "/events/evt-wedding")).event.version;
  const out: Record<string, any> = {};
  await aino.call("POST", "/clock", { scene: "1" });
  out.viability = (await aino.call("POST", "/events/evt-wedding/viability")).plan;
  await aino.call("POST", "/clock", { scene: "2" });
  out.order = (await aino.call("POST", "/events/evt-wedding/order")).plan;
  out.ainoQs = (await aino.call("GET", "/home")).questions;
  out.sannaBefore = (await sanna.call("GET", "/home")).questions.filter((q: any) => q.state === "open");
  const wedding = async (c: Client) => (await c.call("GET", "/baskets")).baskets.find((b: any) => b.id === "evt-wedding");
  out.ainoBasket = await wedding(aino);
  out.sannaBasket = await wedding(sanna);
  out.sannaAll = (await sanna.call("GET", "/home")).questions.filter((q: any) => q.eventId === "evt-wedding");
  out.mikkoQs = (await mikko.call("GET", "/home")).questions;
  out.cont = await aino.call("POST", `/questions/${out.ainoQs[0].id}/answer`, { optionId: "continue" });
  out.sannaQs = (await sanna.call("GET", "/home")).questions;
  out.approved = await sanna.call("POST", `/questions/${out.sannaQs[0].id}/answer`, { optionId: "approve" });
  out.late = await jonas.call("POST", `/questions/${out.sannaQs[0].id}/answer`, { optionId: "reject" });
  out.staleEdit = await aino.call("POST", "/events/evt-wedding/change", { guests: 200, version: 0 });
  await aino.call("POST", "/clock", { scene: "3" });
  out.change = await aino.call("POST", "/events/evt-wedding/change", { guests: 194, group: { id: "onni", label: "Tree nuts (Onni)", count: 1, constraints: { claims: [], avoidAllergens: ["AN"], labels: [] }, standing: false }, version: await v() });
  out.allergyQs = (await aino.call("GET", "/home")).questions.filter((q: any) => q.type === "allergy_conflict");
  for (const q of out.allergyQs) await aino.call("POST", `/questions/${q.id}/answer`, { optionId: q.options[0].id });
  out.missingAllergen = (await aino.call("GET", "/home")).questions.find((q: any) => q.type === "missing_allergen_data");
  out.missingAllergenAnswer = await aino.call("POST", `/questions/${out.missingAllergen.id}/answer`, { optionId: "continue" });
  out.changeQs = (await sanna.call("GET", "/home")).questions.filter((q: any) => q.type === "change_outside_tolerance");
  out.changeOk = await sanna.call("POST", `/questions/${out.changeQs[0].id}/answer`, { optionId: "approve" });
  // A finance decision cannot extend the builder's earlier unknown-stock
  // decision to changed quantities. Review the fresh amendment before retrying.
  out.changeStock = (await aino.call("GET", "/home")).questions.filter((q: any) => q.facts.kind === "change_stock");
  out.beforeStockDecision = (await aino.call("GET", "/orders?eventId=evt-wedding")).orders;
  for (const q of out.changeStock) {
    out.financeStockTry = await sanna.call("POST", `/questions/${q.id}/answer`, { optionId: "continue" });
    out.changeStockAnswer = await aino.call("POST", `/questions/${q.id}/answer`, { optionId: "continue" });
  }
  const reviewedChanges = (await sanna.call("GET", "/home")).questions.filter((q: any) => q.facts.kind === "change" && q.facts.stockQuoteId);
  for (const q of reviewedChanges) out.reviewedChangeOk = await sanna.call("POST", `/questions/${q.id}/answer`, { optionId: "approve" });
  await aino.call("POST", "/clock", { scene: "4" });
  out.g188 = await aino.call("POST", "/events/evt-wedding/change", { guests: 188, version: await v() });
  async function finishChangedConcerns() {
    for (let step = 0; step < 12; step++) {
      const qs = [...(await aino.call("GET", "/home")).questions, ...(await sanna.call("GET", "/home")).questions];
      const q = qs.find((q: any) => q.state === "open" && ["change", "change_stock", "change_allergens"].includes(q.facts.kind));
      if (!q) return;
      const client = q.forRole === "chef" ? aino : sanna;
      const result = await client.call("POST", `/questions/${q.id}/answer`, { optionId: q.forRole === "chef" ? "continue" : "approve" });
      expect(result.error).toBeUndefined();
    }
    throw new Error("Changed product concerns did not settle");
  }
  await finishChangedConcerns();
  out.final = (await aino.call("POST", "/events/evt-wedding/final-check")).finalCheck;
  out.subQ = (await aino.call("GET", "/home")).questions.find((q: any) => q.type === "substitute");
  const pick = out.subQ.facts.candidates.findIndex((c: any) => c.productId === "464194");
  out.useSub = await aino.call("POST", `/questions/${out.subQ.id}/answer`, { optionId: `use_${Math.max(0, pick)}` });
  await finishChangedConcerns();
  await aino.call("POST", "/events/evt-wedding/final-check");
  out.view = await sanna.call("GET", "/events/evt-wedding");
  out.orders = (await aino.call("GET", "/orders?eventId=evt-wedding")).orders;
  out.valio = await sanna.call("GET", "/audit?viewer=valio");
  return out;
}

describe("Test case 2: the brief's milk request (price first, D31)", () => {
  it("picks the cheapest milk, discloses unknown stock and asks the chef before ordering", async () => {
    const r = await milkCase("continue");
    expect(r.plan.urgent).toBe(true);
    expect(r.plan.lines).toHaveLength(1);
    expect(r.plan.needs[0].candidates[0]).toMatchObject({ productId: "464306", rankStep: "price per kg or L after rounding", stock: { kind: "unknown" } });
    expect(r.plan.lines[0]).toMatchObject({ productId: "464306", quantity: 1000, status: "unknown_stock" });
    expect(r.plan.lines[0].rules).toContainEqual(expect.objectContaining({ ruleId: "STK-01" }));
    expect(r.stockQ).toMatchObject({ forRole: "chef", ruleIds: ["STK-01"] });
    expect(r.stockQ.options.map((o: any) => o.id)).toEqual(["continue", "confirmed", "others"]);
    expect(r.approverTry.status).toBe(409);
    expect(r.after.status).toBe("ordered");
    expect(r.after.totalExVat).toBe(1010);
    expect(r.approval).toBeNull(); // The cheaper order is inside the mandate.
    expect(r.second.status).toBe(409);
    expect(r.second.reason).toMatch(/Answered by Aino/);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].lines.find((l: any) => l.stock.kind === "unknown").riskAccepted.by).toBe("Aino");
  });
  it("offers the confirmed-stock split instead: 435 of 1,000 L, approved as a partial fill", async () => {
    const r = await milkCase("confirmed");
    const lines = r.after.lines.filter((l: any) => l.productId);
    expect(lines.map((l: any) => l.productId).sort()).toEqual(["462775", "469363"]);
    expect(lines.reduce((s: number, l: any) => s + l.quantity, 0)).toBe(435);
    expect(r.approval.ok).toBe(true);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].lines.every((l: any) => l.stock.kind === "known")).toBe(true);
  });
});

describe("Not in time (DLV-06)", () => {
  async function tooLate(time: string, neededBy: string, quantity = 1000) {
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time });
    await anna.call("POST", "/data-mode", { mode: "fixture", overlay: null });
    const m = await anna.call("POST", "/messages", { text: "I need 1,000 litres of lactose-free milk by Monday" });
    return anna.call("POST", "/requests", { request: { ...m.request, neededBy, lines: m.request.lines.map((line: any) => ({ ...line, quantity: { amount: quantity, unit: "l" } })) } });
  }
  it("needed before anything arrives: one message with the earliest date, no basket or questions", async () => {
    const r = await tooLate("2026-11-14T10:00:00Z", "2026-11-15");
    expect(r.plan.status).toBe("blocked");
    expect(r.plan.tooLate).toEqual({ neededBy: "2026-11-15", earliest: "2026-11-16" });
    expect(r.plan.summary).toMatch(/No products available for delivery in time/);
    expect(r.questions).toHaveLength(0);
    expect(r.plan.needs[0].rules.map((x: any) => x.ruleId)).toContain("DLV-06");
    expect(r.plan.needs[0].lateDeliveryOptions).toEqual([]); // No confirmed 1,000 L option.
  });
  it("returns full-quantity later options for display without creating a quote or order", async () => {
    const r = await tooLate("2026-11-14T10:00:00Z", "2026-11-15", 40);
    expect(r.plan.status).toBe("blocked");
    expect(r.plan.quoteId).toBeNull();
    expect(r.plan.orderIds).toEqual([]);
    const options = r.plan.needs[0].lateDeliveryOptions;
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThanOrEqual(2);
    for (const c of options) {
      expect(c.availableDate > "2026-11-15").toBe(true);
      expect(c.stock.kind).toBe("known");
      expect(c.stock.amount).toBeGreaterThanOrEqual(c.quantity);
      expect(c.quantity * c.packContent.value).toBeGreaterThanOrEqual(40);
    }
  });
  it("cut-off passed for Monday: the earliest date moves to the next delivery day", async () => {
    const r = await tooLate("2026-11-15T16:00:00Z", "2026-11-16");
    expect(r.plan.tooLate?.earliest).toBe("2026-11-17");
  });
});

describe("Test case 1: the wedding through four scenes (docs/demo-plan.md)", () => {
  let a: Record<string, any>;
  let b: Record<string, any>;
  beforeAll(async () => {
    a = await eventCase();
    b = await eventCase();
  });
  it("scene 1: verdicts months ahead; stock is information only", () => {
    expect(a.viability.lines).toHaveLength(7);
    expect(a.viability.lines.find((l: any) => l.productId === "469672").verdict).toBe("green");
    expect(a.viability.lines.find((l: any) => l.productId === "467767").status).toBe("unknown_stock");
    const milk = a.viability.lines.find((l: any) => l.needIds.includes("coffee:milk:regular"));
    expect(milk.productId).toBe("464306"); // Price wins; unknown stock remains visible.
  });
  it("scene 2: the plan's quantities and €2,003.37; Aino continues with 4 lines, then one card for Sanna", () => {
    const q = (id: string) => a.order.lines.find((l: any) => l.productId === id)?.quantity;
    expect([q("469672"), q("460541"), q("464727"), q("467767"), q("460617"), q("464306"), q("477125")]).toEqual([31, 3, 45, 12, 1, 40, 5]);
    expect(a.order.totalExVat).toBe(2003.37);
    expect(a.ainoQs).toHaveLength(1);
    expect(a.ainoQs[0]).toMatchObject({ type: "unknown_stock", forRole: "chef" });
    expect(a.ainoQs[0].facts.lines).toHaveLength(4);
    expect(a.sannaBefore).toHaveLength(0); // the chef answers first (D6)
    // Each person's basket counts only what they can answer; the rest shows as waiting for others.
    expect(a.ainoBasket).toMatchObject({ waiting: 1, waitingOthers: a.sannaAll.length });
    expect(a.sannaBasket).toMatchObject({ waiting: a.sannaAll.length, waitingOthers: 1 });
    expect(a.ainoBasket.approvalLevels).toEqual([
      { role: "chef", count: 1 },
      { role: "approver", count: a.sannaAll.length },
    ]);
    expect(a.sannaQs).toHaveLength(1);
    expect(a.sannaQs[0].ruleIds).toContain("MAN-01");
    expect(a.approved.plan.status).toBe("ordered");
    expect(a.late.status).toBe(409);
    expect(a.staleEdit.status).toBe(409);
  });
  it("scene 3: the allergy is checked first; almond counts as a tree nut; one card for Sanna", () => {
    expect(a.change.held).toBe(true);
    const cake = a.allergyQs.find((q: any) => q.facts.productId === "467767");
    expect(cake.body).toMatch(/Contains almond/);
    expect(cake.options[0].id).toBe("replace_0");
    expect(a.missingAllergen.facts.productIds).toContain("460541");
    expect(a.missingAllergenAnswer.error).toBeUndefined();
    expect(a.changeQs).toHaveLength(1);
    expect(a.changeQs[0].ruleIds).toContain("CHG-02");
    expect(a.changeOk.ok).toBe(true);
    expect(a.changeStock).toHaveLength(1);
    expect(a.changeStock[0]).toMatchObject({ forRole: "chef", quoteId: expect.any(String), fingerprint: expect.any(String) });
    expect(a.financeStockTry.status).toBe(409);
    expect(a.changeStockAnswer.error).toBeUndefined();
    if (a.reviewedChangeOk) expect(a.reviewedChangeOk.error).toBeUndefined(); // A lower total can stay inside the existing spend authority.
  });
  it("scene 4: changed dietary scope needs fresh chef consent; the final check keeps 37 L and fills 10 L", () => {
    expect(a.g188.applied).toBe(false);
    expect(a.g188.reason).toMatch(/allergen data not confirmed/);
    expect(a.final.lines.find((l: any) => l.productId === "464727").result).toBe("short");
    expect(a.subQ.body).toMatch(/37 of 47 in stock · 10 l to fill/);
    expect(a.subQ.facts.candidates.map((c: any) => c.productId)).toContain("464194");
    const o = a.orders[0];
    const qty = (id: string) => o.lines.find((l: any) => l.productId === id && !l.removed)?.quantity;
    expect(qty("464727")).toBe(37);
    expect(qty("464194")).toBe(10);
    expect(qty("469672")).toBe(32);
    expect(a.view.coverage).toMatchObject({ level: "at_risk", text: "Ready · 4 stock not confirmed · 1 allergen data not confirmed" });
  });
  it("Valio Aimo sees the sale and the flags, never the allergy or the guests", () => {
    const shared = a.valio.entries;
    expect(shared.every((e: any) => e.visibility === "shared")).toBe(true);
    expect(shared.some((e: any) => e.action === "order_placed")).toBe(true);
    expect(JSON.stringify(shared)).not.toMatch(/Onni|tree nut|almond/i);
    expect(a.valio.chain.ok).toBe(true);
  });
  it("repeats: two runs from a fresh reset give the same result", () => {
    const shape = (x: any) => ({
      v: x.viability.lines.map((l: any) => [l.productId, l.quantity, l.verdict]),
      o: x.orders[0].lines.map((l: any) => [l.productId, l.quantity, l.removed]),
      f: x.final.lines.map((l: any) => [l.productId, l.result]),
      c: x.view.coverage,
    });
    expect(shape(b)).toEqual(shape(a));
  });
});

describe("Signatures anyone can verify (RFC 7515 / 7517, ES256, AP2 v0.2 shapes)", () => {
  it("quotes and orders verify against the published JWKS; a changed payload does not", async () => {
    const { createPublicKey, verify } = await import("node:crypto");
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const jwks = (await (await fetch(`${BASE}/.well-known/jwks.json`)).json()) as { keys: any[] };
    expect(jwks.keys[0]).toMatchObject({ kty: "EC", crv: "P-256", alg: "ES256", use: "sig" });
    const check = (token: string, typ: string) => {
      const [h, p, sig] = token.split(".");
      const header = JSON.parse(Buffer.from(h, "base64url").toString());
      const jwk = jwks.keys.find((k) => k.kid === header.kid);
      const pub = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, format: "jwk" });
      return header.alg === "ES256" && header.typ === typ && verify("sha256", Buffer.from(`${h}.${p}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    };
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469363", quantity: 10, outletId: "banquet" }] });
    expect(check(q.body.jws, "aimo-quote+jwt")).toBe(true);
    expect(check(q.body.jws, "aimo-order+jwt")).toBe(false);
    const [h, p, sig] = q.body.jws.split(".");
    const forged = { ...JSON.parse(Buffer.from(p, "base64url").toString()), total_ex_vat: 1 };
    expect(check(`${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, "aimo-quote+jwt")).toBe(false);
    const o = await gateway("POST", "/orders", { quoteId: q.body.id }, { "Idempotency-Key": "sig-1" });
    expect(check(o.body.jws, "aimo-order+jwt")).toBe(true);
    const claims = JSON.parse(Buffer.from(o.body.jws.split(".")[1], "base64url").toString());
    expect(claims.quote_jti).toBe(q.body.id);
    const { createHash } = await import("node:crypto");
    expect(q.body.checkoutHash).toBe(createHash("sha256").update(q.body.jws).digest("base64url"));
    expect(claims).toMatchObject({ status: "Success", reference: q.body.checkoutHash, order_id: o.body.id });
    const cat = await fetch(`${BASE}/.well-known/api-catalog`);
    expect(cat.headers.get("content-type")).toContain("application/linkset+json");
    expect(((await cat.json()) as any).linkset[0]["service-desc"][0].href).toMatch(/openapi\.json$/);
  });
});

describe("Test case 3: blocked paths no approval can push through", () => {
  it("a past cut-off is refused at the gateway even though the mock shows Monday", async () => {
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "463038", quantity: 5, outletId: "banquet" }] });
    expect(q.body.outcome).toBe("block");
    const o = await gateway("POST", "/orders", { quoteId: q.body.id }, { "Idempotency-Key": "k1" });
    expect(o.status).toBe(409);
    expect(o.body.error).toBe("cutoff_passed");
  });
  it("a diet failure on the quote can't be approved by the Approver", async () => {
    const { anna, sara } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "475797", quantity: 5, outletId: "banquet", requires: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] } }] });
    expect(q.body.lines[0].rules.map((r: any) => r.ruleId)).toContain("DIET-01");
    const token = (await (await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-sanna" }) })).json()).token;
    const ap = await fetch(`${BASE}/gateway/v1/approvals`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }) });
    expect(ap.status).toBe(409);
    expect(((await ap.json()) as any).error).toBe("hard_rule");
  });
  it("over the cap is refused without an approval, accepted with one; a retry is one order", async () => {
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469363", quantity: 380, outletId: "banquet" }, { productId: "471555", quantity: 400, outletId: "banquet" }] });
    expect(q.body.mandateCheck.approvalsNeeded).toEqual(["spend_cap"]);
    const refused = await gateway("POST", "/orders", { quoteId: q.body.id }, { "Idempotency-Key": "cap-1" });
    expect(refused.body.error).toBe("mandate_violation");
    const login = await (await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-sanna" }) })).json();
    const ap = (await (await fetch(`${BASE}/gateway/v1/approvals`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${(login as any).token}` }, body: JSON.stringify({ quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }) })).json()) as any;
    const ok = await gateway("POST", "/orders", { quoteId: q.body.id, approvalId: ap.id }, { "Idempotency-Key": "cap-2" });
    expect(ok.status).toBe(201);
    const again = await gateway("POST", "/orders", { quoteId: q.body.id, approvalId: ap.id }, { "Idempotency-Key": "cap-2" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(ok.body.id);
  });
});
