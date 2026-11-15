/** D35/B23, saved Junction evidence only; no live supplier or model calls. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { Constraints, Plan, QuoteCreateBody } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { resolveToken, getPerson } = await import("../src/identity.js");
const { getProduct } = await import("../src/catalog.js");
const { createQuote, createApproval, acknowledgeAllergenData, placeOrder, amendOrder } = await import("../src/gateway/service.js");
const { auditView, verifyChain } = await import("../src/audit.js");
const { getDb } = await import("../src/db.js");
const { loadFixture } = await import("../src/aimo/lookup.js");
const { isConfirmedOrder } = await import("../src/agent/basketSummary.js");
const { allergenQuestionText, missingAllergenProducts } = await import("../src/agent/allergenData.js");
const potato = getProduct("460541")!;
const original = structuredClone(potato);
const allergy: Constraints = { claims: [], avoidAllergens: ["AN"], labels: [] };
const identity = () => resolveToken(OUTSIDE_AGENT_TOKEN)!;
const chef = () => ({ kind: "person" as const, token: "synthetic-chef", hotelId: "hotel-aurora", person: getPerson("p-aino")!, testSession: true });
const finance = () => ({ ...chef(), person: getPerson("p-sanna")! });
const terms = (): QuoteCreateBody => ({ siteId: "site-aurora", eventId: "evt-wedding", deliveryDate: "2026-11-16", lines: [{ productId: potato.id, outletId: "banquet", quantity: 3, requires: allergy, allergenScope: "synthetic-digest-for-one-guest" }] });
const acknowledge = (q: Awaited<ReturnType<typeof createQuote>>) => acknowledgeAllergenData(chef(), { quoteId: q.id, fingerprint: q.fingerprint, productIds: [potato.id] });
const stock = { continueWith: ["460541"], decidedBy: "Aino" };

let server: Server;
let base = "";
let token = "";
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: `aimo_session=${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, ...await r.json() };
}
async function signIn(personId = "p-aino") { token = (await call("POST", "/session", { personId })).token; }
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  server.keepAliveTimeout = 60_000; // Cold catalogue loading on a busy Windows host can exceed Node's 5s default.
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(() => { seedReset(); setClock({ scene: "2" }); });
afterEach(() => Object.assign(potato, structuredClone(original)));

describe("gateway chef continuation", () => {
  it("keeps consent specific to the reviewed outlet when the same SKU serves kitchen and bar", async () => {
    const body = terms();
    body.lines.push({ ...body.lines[0], outletId: "bar", quantity: 1 });
    const q = await createQuote(identity(), body);
    // Synthetic hotel context: different guest groups eat at each outlet.
    const questionPlan = { lines: q.lines.map((l) => ({ ...l, needIds: [l.outletId] })), needs: [
      { id: "bar", groupId: "bar-guests", guests: 2, constraints: allergy },
      { id: "banquet", groupId: "kitchen-guests", guests: 5, constraints: { ...allergy, avoidAllergens: ["AP"] } },
    ] } as unknown as Plan;
    expect(allergenQuestionText(questionPlan, [potato.id], "bar")).toContain("2 guests must avoid tree nuts");
    expect(allergenQuestionText(questionPlan, [potato.id], "bar")).not.toContain("peanuts");
    const barChef = { ...chef(), person: getPerson("p-mikko")! };
    const request = { quoteId: q.id, fingerprint: q.fingerprint, productIds: [potato.id] };
    expect(() => acknowledgeAllergenData(barChef, request)).toThrow(/scope/);
    expect(() => acknowledgeAllergenData(barChef, { ...request, outletId: "banquet" })).toThrow(/scope/);
    const bar = acknowledgeAllergenData(barChef, { ...request, outletId: "bar" });
    expect(missingAllergenProducts(q, [bar]).map((l) => l.outletId)).toEqual(["banquet"]);
    await expect(placeOrder(identity(), q.id, "bar-consent-only", undefined, undefined, { ...stock, allergenAcknowledgements: [bar.token] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    // Even the head chef, who can act in both outlets, answers only the displayed outlet.
    const headChefBar = acknowledgeAllergenData(chef(), { ...request, outletId: "bar" });
    await expect(placeOrder(identity(), q.id, "head-chef-bar-only", undefined, undefined, { ...stock, allergenAcknowledgements: [headChefBar.token] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    const banquet = acknowledgeAllergenData(chef(), { ...request, outletId: "banquet" });
    const result = await placeOrder(identity(), q.id, "two-outlet-consent", undefined, undefined, { ...stock, allergenAcknowledgements: [bar.token, banquet.token] });
    expect(result.order.lines.find((l) => l.outletId === "bar")?.allergenDataAcknowledgement?.by).toBe("Mikko");
    expect(result.order.lines.find((l) => l.outletId === "banquet")?.allergenDataAcknowledgement?.by).toBe("Aino");
  });

  it("retains missing-data concern separately from stock acceptance and replays one order", async () => {
    const q = await createQuote(identity(), terms());
    expect(q.outcome).toBe("ask_chef");
    expect(q.lines[0].rules).toContainEqual(expect.objectContaining({ ruleId: "ALG-03", outcome: "ask_chef" }));
    await expect(placeOrder(identity(), q.id, "no-chef", undefined, undefined, stock)).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    const a = acknowledge(q);
    await expect(placeOrder(identity(), q.id, "no-stock", undefined, undefined, { allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "stock_unconfirmed" } });
    const body = { ...stock, allergenAcknowledgements: [a.token] };
    const result = await placeOrder(identity(), q.id, "d35-order", undefined, undefined, body);
    expect(result.order.lines[0]).toMatchObject({ productId: "460541", stock: { kind: "unknown" }, riskAccepted: { by: "Aino" }, allergenDataAcknowledgement: { personId: "p-aino", fingerprint: q.fingerprint } });
    expect(result.order.lines[0].rules.some((r) => r.ruleId === "ALG-03")).toBe(true);
    expect(isConfirmedOrder(result.order)).toBe(false);
    expect((await placeOrder(identity(), q.id, "d35-order", undefined, undefined, body))).toMatchObject({ replay: true, order: { id: result.order.id } });
    expect(auditView("hotel").some((e) => /allergen data not confirmed/i.test(e.summary) && e.orderId === result.order.id)).toBe(true);
    expect(JSON.stringify(auditView("valio"))).not.toMatch(/tree nut|allergen|avoidAllergens|ALG-03|guest/i);
    expect(verifyChain().ok).toBe(true);
  });

  it("finance approval, an agent assertion and a forged acknowledgement cannot waive missing data", async () => {
    const q = await createQuote(identity(), terms());
    const body = { quoteId: q.id, fingerprint: q.fingerprint, productIds: [potato.id] };
    expect(() => acknowledgeAllergenData(finance(), body)).toThrow(/Only the chef/);
    expect(() => acknowledgeAllergenData(identity(), body)).toThrow(/Only the chef/);
    const approval = await createApproval(finance(), { quoteId: q.id, fingerprint: q.fingerprint, grants: [] });
    await expect(placeOrder(identity(), q.id, "finance-is-not-chef", approval.id, undefined, { ...stock, allergenAcknowledgements: ["forged"] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
  });

  it.each(["quantity", "requirements", "affected guests", "delivery", "total"])("invalidates acknowledgement when %s changes", async (field) => {
    const q = await createQuote(identity(), terms());
    const a = acknowledge(q);
    const next = terms();
    if (field === "quantity") next.lines[0].quantity++;
    if (field === "requirements") next.lines[0].requires = { ...allergy, avoidAllergens: ["AN", "AP"] };
    if (field === "affected guests") next.lines[0].allergenScope = "synthetic-digest-for-two-guests";
    if (field === "delivery") next.deliveryDate = "2026-11-17";
    if (field === "total") next.lines.push({ productId: "469672", outletId: "banquet", quantity: 1 });
    const fresh = await createQuote(identity(), next);
    await expect(placeOrder(identity(), fresh.id, `changed-${field}`, undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
  });

  it("rejects expired acknowledgements and rechecks new declaration evidence at commit", async () => {
    const q = await createQuote(identity(), terms());
    const a = acknowledge(q);
    setClock({ time: "2026-08-15T09:00:00Z" });
    const fresh = await createQuote(identity(), terms());
    await expect(placeOrder(identity(), fresh.id, "expired-chef", undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    setClock({ scene: "2" });
    potato.contains = ["AN"]; // Explicit in-memory catalogue-change fixture; catalogue files stay untouched.
    await expect(placeOrder(identity(), q.id, "new-conflict", undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "hard_rule" } });
  });

  it.each(["contains", "mayContain", "allergenUndeclared", "diet", "contradiction"])("keeps %s unapprovable even with chef consent", async (kind) => {
    const q = await createQuote(identity(), terms());
    const a = acknowledge(q);
    const next = terms();
    if (kind === "diet") next.lines[0].requires = { ...allergy, claims: ["VEGAN"] };
    else if (kind === "contradiction") {
      potato.claims = ["FREE_FROM_LACTOSE"]; potato.contains = ["ML"];
      next.lines[0].requires = { ...allergy, claims: ["FREE_FROM_LACTOSE"] };
    } else potato[kind as "contains" | "mayContain" | "allergenUndeclared"] = ["AN"];
    const blocked = await createQuote(identity(), next);
    expect(blocked.outcome).toBe("block");
    expect(() => acknowledge(blocked)).toThrow(/cannot be acknowledged/);
    await expect(createApproval(finance(), { quoteId: blocked.id, fingerprint: blocked.fingerprint, grants: [] })).rejects.toMatchObject({ body: { error: "hard_rule" } });
    await expect(placeOrder(identity(), blocked.id, `hard-${kind}`, undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "hard_rule" } });
  });

  it("rejects older snapshots without acknowledgement or current declaration evidence gracefully", async () => {
    const q = await createQuote(identity(), terms());
    delete q.lines[0].allergenEvidence;
    q.lines[0].rules = [];
    getDb().prepare("UPDATE quotes SET json = ? WHERE id = ?").run(JSON.stringify(q), q.id);
    await expect(placeOrder(identity(), q.id, "legacy-missing", undefined, undefined, stock)).rejects.toMatchObject({ status: 409 });
  });

  it("rechecks supplier price changes before accepting an earlier chef decision", async () => {
    const q = await createQuote(identity(), terms());
    const a = acknowledge(q);
    const fixture = loadFixture("base")!;
    const saved = structuredClone(fixture.price[potato.id]);
    try {
      // Explicit in-memory price-change fixture, derived from the saved Junction response.
      fixture.price[potato.id].catalogPrice.value += 1;
      await expect(placeOrder(identity(), q.id, "price-recheck", undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "quote_stale" } });
      const fresh = await createQuote(identity(), terms());
      await expect(placeOrder(identity(), fresh.id, "new-price-old-chef", undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    } finally { fixture.price[potato.id] = saved; }
  });

  it("requires a fresh chef decision when an amendment changes quantities or dietary scope", async () => {
    const q = await createQuote(identity(), terms());
    const a = acknowledge(q);
    const { order } = await placeOrder(identity(), q.id, "original-amend", undefined, undefined, { ...stock, allergenAcknowledgements: [a.token] });
    const changes = [{ ...terms().lines[0], quantity: 4, allergenScope: "synthetic-changed-guest-scope" }];
    const reviewed = await amendOrder(identity(), order.id, { changes, quoteOnly: true });
    await expect(amendOrder(identity(), order.id, { changes, allergenAcknowledgements: [a.token], continueWithUnconfirmedStock: [potato.id] })).rejects.toMatchObject({ body: { error: "allergen_data_unconfirmed" } });
    const fresh = acknowledge(reviewed.quote);
    const changed = await amendOrder(identity(), order.id, { changes, allergenAcknowledgements: [fresh.token], continueWithUnconfirmedStock: [potato.id], decidedBy: "Aino" });
    expect(changed.order.lines[0]).toMatchObject({ quantity: 4, allergenDataAcknowledgement: { fingerprint: reviewed.quote.fingerprint } });
  });
});

async function weddingMissingQuestion() {
  await signIn();
  await call("POST", "/events/evt-wedding/order");
  const chefQ = (await call("GET", "/home")).questions.find((q: any) => q.type === "unknown_stock");
  await call("POST", `/questions/${chefQ.id}/answer`, { optionId: "continue" });
  await signIn("p-sanna");
  const financeQ = (await call("GET", "/home")).questions.find((q: any) => q.forRole === "approver");
  expect((await call("POST", `/questions/${financeQ.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
  await signIn();
  setClock({ scene: "3" });
  const event = (await call("GET", "/events/evt-wedding")).event;
  await call("POST", "/events/evt-wedding/change", { guests: 194, group: { id: "onni", label: "Tree nuts (Onni)", count: 1, constraints: allergy, standing: false }, version: event.version });
  const conflicts = (await call("GET", "/home")).questions.filter((q: any) => q.type === "allergy_conflict");
  const cake = conflicts.find((q: any) => q.facts.productId === "467767");
  expect(cake.facts.productId).toBe("467767");
  expect(cake.options.some((o: any) => o.id === "continue")).toBe(false);
  for (const conflict of conflicts) expect((await call("POST", `/questions/${conflict.id}/answer`, { optionId: conflict.options[0].id })).error).toBeUndefined();
  return (await call("GET", "/home")).questions.find((q: any) => q.type === "missing_allergen_data");
}

describe("wedding potato chef question", () => {
  it("names the product, tree nuts and one guest; retains the concern on event, order, result and hotel audit", async () => {
    const q = await weddingMissingQuestion();
    expect(q).toMatchObject({ forRole: "chef", facts: { productIds: ["460541"] } });
    expect(q.body).toContain(potato.name);
    expect(q.body).toMatch(/1 guest must avoid tree nuts/);
    expect((await call("GET", "/events/evt-wedding")).coverage.text).toMatch(/allergen data not confirmed/);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${q.id}/answer`, { optionId: "continue" })).status).toBe(409);
    await signIn();
    expect((await call("POST", `/questions/${q.id}/answer`, { optionId: "continue" })).error).toBeUndefined();
    for (let step = 0; step < 8; step++) {
      await signIn();
      let pending = (await call("GET", "/home")).questions.find((x: any) => x.state === "open");
      if (!pending) { await signIn("p-sanna"); pending = (await call("GET", "/home")).questions.find((x: any) => x.state === "open"); }
      if (!pending) break;
      await signIn(pending.forRole === "approver" ? "p-sanna" : "p-aino");
      expect((await call("POST", `/questions/${pending.id}/answer`, { optionId: pending.forRole === "approver" ? "approve" : "continue" })).error).toBeUndefined();
    }
    const view = await call("GET", "/events/evt-wedding");
    const order = (await call("GET", "/orders?eventId=evt-wedding")).orders[0];
    expect(order.lines.find((l: any) => l.productId === "460541" && !l.removed).allergenDataAcknowledgement.personId).toBe("p-aino");
    expect(view.event.dishes.flatMap((d: any) => d.ingredients).some((i: any) => i.productId === "460541")).toBe(true);
    expect(view.orderPlan.lines.find((l: any) => l.productId === "460541").allergenDataAcknowledgement).toBeTruthy();
    expect(view.orderPlan.summary).toMatch(/allergen data not confirmed/);
    expect(view.coverage.text).toMatch(/allergen data not confirmed/);
    expect(JSON.stringify(auditView("hotel"))).toMatch(/allergen data not confirmed/);
    expect(JSON.stringify(auditView("valio"))).not.toMatch(/Onni|tree nut|almond|avoidAllergens|allergen_data/i);
  });

  it("holds the change and offers replacements when the chef chooses another product", async () => {
    const q = await weddingMissingQuestion();
    expect((await call("POST", `/questions/${q.id}/answer`, { optionId: "others" })).error).toBeUndefined();
    const next = (await call("GET", "/home")).questions.find((q: any) => q.facts.kind === "missing_allergen_replacement");
    expect(next.options.length).toBeGreaterThan(0);
    const order = (await call("GET", "/orders?eventId=evt-wedding")).orders[0];
    expect(order.version).toBe(1);
  });

  it("rejects stale guest-scope answers before recording consent", async () => {
    const q = await weddingMissingQuestion();
    const event = (await call("GET", "/events/evt-wedding")).event;
    event.dietGroups.find((g: any) => g.id === "onni").count = 2;
    getDb().prepare("UPDATE events SET json = ? WHERE id = ?").run(JSON.stringify(event), event.id);
    expect((await call("POST", `/questions/${q.id}/answer`, { optionId: "continue" }))).toMatchObject({ status: 409, question: { state: "replaced" } });
  });
});

describe("item review and final basket", () => {
  async function draft(productId: string, amount: number, avoidAllergens: string[]) {
    const basket = (await call("POST", "/baskets", { name: "Synthetic D35 basket", deliveryDate: "2026-11-16" })).basket;
    const response = await call("POST", "/requests", { eventId: basket.id, reviewing: true, itemReview: true, request: {
      kind: "single", originalText: "Synthetic D35 regression request", siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16", neededByText: null, parsedBy: "rules",
      lines: [{ id: "potato-request", text: "Potatoes", query: productId, productId, productType: null, category: null, quantity: { amount, unit: "kg" }, constraints: { claims: [], avoidAllergens, labels: [] } }],
    } });
    expect(response.status).toBe(200);
    return { basket, ...response };
  }

  it("requires explicit chef acknowledgement before item approval, retains it through finance and shows the ordered concern", async () => {
    await signIn();
    const d = await draft("460541", 45, ["AN"]);
    expect(d.plan.itemReviews[0].canApprove).toBe(false);
    expect((await call("POST", `/plans/${d.plan.id}/items/potato-request/approve`, { fingerprint: d.plan.itemReviews[0].fingerprint })).status).toBe(409);
    expect((await call("POST", `/plans/${d.plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);
    const question = (await call("GET", `/plans/${d.plan.id}`)).questions.find((q: any) => q.type === "missing_allergen_data" && q.state === "open");
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${question.id}/answer`, { optionId: "continue" })).status).toBe(409);
    await signIn();
    const continued = await call("POST", `/questions/${question.id}/answer`, { optionId: "continue" });
    expect(continued.error).toBeUndefined();
    expect(continued.plan.itemReviews[0].canApprove).toBe(true);
    expect(continued.plan.lines[0].allergenDataAcknowledgement).toBeTruthy();
    expect(continued.plan.summary).toMatch(/allergen data not confirmed/);
    const approved = await call("POST", `/plans/${d.plan.id}/items/potato-request/approve`, { fingerprint: continued.plan.itemReviews[0].fingerprint });
    expect(approved.status).toBe(200);
    expect((await call("POST", `/plans/${d.plan.id}/basket`)).status).toBe(200);
    const submitted = await call("POST", `/baskets/${d.basket.id}/submit-review`);
    expect(submitted.status).toBe(200);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    const placed = await call("GET", `/baskets/${d.basket.id}`);
    expect(placed.orders[0].lines[0].allergenDataAcknowledgement.personId).toBe("p-aino");
    expect(placed.requests[0].summary).toMatch(/allergen data not confirmed/);
    expect(placed.confirmed).toBe(false);
  });

  it("invalidates an item acknowledgement after a quantity edit and asks again", async () => {
    await signIn();
    const d = await draft("460541", 45, ["AN"]);
    const question = d.questions.find((q: any) => q.type === "missing_allergen_data" && q.state === "open");
    const accepted = await call("POST", `/questions/${question.id}/answer`, { optionId: "continue" });
    const request = accepted.plan.request;
    request.lines[0].quantity.amount = 60;
    const edited = await call("POST", `/plans/${d.plan.id}/requote`, { request });
    expect(edited.plan.lines[0].allergenDataAcknowledgement).toBeUndefined();
    expect(edited.plan.itemReviews[0].canApprove).toBe(false);
    expect(edited.questions.some((q: any) => q.type === "missing_allergen_data" && q.state === "open")).toBe(true);
  });
});
