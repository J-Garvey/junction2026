import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { carbonEstimateKg, Order } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset, HOTEL_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { getProduct } = await import("../src/catalog.js");
const { loadFixture, normalise, lookup } = await import("../src/aimo/lookup.js");
const { carbonBasisFor } = await import("../src/carbon.js");
const { resolveToken } = await import("../src/identity.js");
const { createQuote, placeOrder, getOrder, amendOrder, fingerprintOf } = await import("../src/gateway/service.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { newPlan, quoteAndDecide } = await import("../src/agent/plan.js");
const { rulesParse } = await import("../src/agent/parse.js");

beforeEach(() => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
  // Bound the pipeline to saved responses; unmatched shortlist items are unavailable.
  const fixture = loadFixture("base")!;
  vi.spyOn(gw, "lookup").mockImplementation(async (ids) => ({ fallback: null, lines: ids.map((id) =>
    normalise(id, fixture.availability[id], fixture.price[id], "fixture", "base", "2026-11-14T10:00:00Z")) }));
  vi.spyOn(gw, "quote").mockImplementation((body) => createQuote(resolveToken(HOTEL_AGENT_TOKEN)!, body));
});
afterEach(() => vi.restoreAllMocks());

async function savedLookup(id: string) {
  return (await lookup([id], "2026-11-16", { mode: "fixture", overlay: null })).lines[0];
}
async function planFor(text: string, productId: string) {
  const request = { ...rulesParse(text), siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16" };
  request.lines[0].productId = productId;
  const plan = newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { request, reviewing: true });
  await quoteAndDecide(plan);
  return plan;
}

describe("informational carbon mass evidence", () => {
  it("uses kilograms sold, rather than the catalogue's nominal salmon piece weight", async () => {
    const plan = await planFor("1.1 kg salmon", "469672");
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]).toMatchObject({ quantity: 2, salesUnit: "KG", carbonBasis: { kgPerSalesUnit: 1, co2KgPerKg: 6.245 } });
    expect(plan.lines[0].co2Kg).toBeCloseTo(12.49);
    expect(plan.totalExVat).toBe(59.68);
  });

  it("includes the whole checked sales pack after rounding", async () => {
    const plan = await planFor("1.8 kg coffee", "460617");
    const line = plan.lines.find((line) => line.productId === "460617")!;
    expect(line).toMatchObject({ quantity: 1, carbonBasis: { kgPerSalesUnit: 4.4, co2KgPerKg: 7.12 } });
    expect(line.co2Kg).toBeCloseTo(4.4 * 7.12);
    expect(line.co2Kg).not.toBeCloseTo(1.8 * 7.12);
  });

  it("uses separate mass evidence for a piece-based cake request", async () => {
    // This saved Terminal response closes on 12 Nov; keep the fixture clock before it.
    setClock({ time: "2026-11-11T10:00:00Z" });
    const plan = await planFor("16 pcs cake", "467767");
    const line = plan.lines.find((line) => line.productId === "467767")!;
    expect(line.packContent?.unit).toBe("pcs");
    expect(line.quantity).toBe(2);
    expect(line.carbonBasis?.kgPerSalesUnit).toBeGreaterThan(1.4);
    expect(line.co2Kg).toBeCloseTo(line.quantity * line.carbonBasis!.kgPerSalesUnit * 2.11);
  });

  it("does not substitute litres for kilograms, including liquids with a catalogue weight", async () => {
    const plan = await planFor("40 l lactose-free milk", "469363");
    expect(plan.lines[0]).toMatchObject({ quantity: 40, packContent: { unit: "l" }, carbonBasis: null, co2Kg: null });
    expect(carbonBasisFor(getProduct("477125"), await savedLookup("477125"))).toBeNull();
  });

  it("returns unknown for a missing factor, missing conversion, and unverified catalogue weight", async () => {
    const product = getProduct("460617")!;
    const saved = await savedLookup(product.id);
    expect(carbonBasisFor({ ...product, co2KgPerKg: null }, saved)).toBeNull();
    // Explicit modified-response fixtures: neither case establishes checked mass.
    const noComparison = { ...saved, price: { ...saved.price!, comparisonPrice: null } };
    expect(carbonBasisFor(product, noComparison)).toBeNull();
    expect(carbonBasisFor({ ...product, packContent: { value: 44, unit: "pcs" } }, noComparison)).toBeNull();
    expect(carbonBasisFor(product, { ...saved, salesUnit: null })).toBeNull();
  });

  it("keeps absent, zero and invalid inputs distinct", () => {
    const basis = { kgPerSalesUnit: 4.4, co2KgPerKg: 0, massSource: "checked mass fixture" };
    expect(carbonEstimateKg(2, basis)).toBe(0);
    expect(carbonEstimateKg(2, undefined)).toBeNull();
    for (const quantity of [0, -1, NaN, Infinity]) expect(carbonEstimateKg(quantity, basis)).toBeNull();
    for (const value of [0, -1, NaN, Infinity]) expect(carbonEstimateKg(2, { ...basis, kgPerSalesUnit: value })).toBeNull();
    for (const value of [-1, NaN, Infinity]) expect(carbonEstimateKg(2, { ...basis, co2KgPerKg: value })).toBeNull();
    expect(carbonEstimateKg(2, { ...basis, massSource: "" })).toBeNull();
  });

  it("persists mass evidence in receipts, recalculates for amendments and accepts older snapshots", async () => {
    const agent = resolveToken(HOTEL_AGENT_TOKEN)!;
    const quote = await createQuote(agent, { siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: [{ productId: "469672", quantity: 2, outletId: "banquet" }, { productId: "469363", quantity: 3, outletId: "banquet" }] });
    const { order } = await placeOrder(agent, quote.id, "carbon-receipt-fixture");
    expect(getOrder(order.id).lines[0].carbonBasis).toEqual(quote.lines[0].carbonBasis);
    expect(getOrder(order.id).lines[1].carbonBasis).toBeNull();
    const amended = await amendOrder(agent, order.id, { changes: [
      { productId: "469672", outletId: "banquet", quantity: 1 }, { productId: "469363", outletId: "banquet", quantity: 0 },
    ] });
    const salmon = amended.order.lines.find((line) => line.productId === "469672")!;
    expect(carbonEstimateKg(salmon.quantity, salmon.carbonBasis)).toBeCloseTo(6.245);
    expect(amended.order.lines.find((line) => line.productId === "469363")?.removed).toBe(true);
    const older = structuredClone(order);
    older.lines.forEach((line) => { delete line.carbonBasis; });
    expect(Order.safeParse(older).success).toBe(true);
  });

  it("leaves product rank, decisions, prices and approval binding unchanged when carbon is missing", async () => {
    const plan = await planFor("1.1 kg salmon", "469672");
    const product = getProduct("469672")!;
    const previous = product.co2KgPerKg;
    try {
      product.co2KgPerKg = null; // Catalogue-change fixture: only informational carbon changes.
      const without = await planFor("1.1 kg salmon", "469672");
      expect(without.needs[0].candidates.map((candidate) => candidate.productId)).toEqual(plan.needs[0].candidates.map((candidate) => candidate.productId));
      expect(without.lines[0].rules).toEqual(plan.lines[0].rules);
      expect(without.totalExVat).toBe(plan.totalExVat);
      expect(without.status).toBe(plan.status);
      expect(without.approvalsNeeded).toEqual(plan.approvalsNeeded);
      const quote = await createQuote(resolveToken(HOTEL_AGENT_TOKEN)!, { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469672", quantity: 2, outletId: "banquet" }] });
      expect(fingerprintOf({ ...quote, lines: quote.lines.map((line) => ({ ...line, carbonBasis: plan.lines[0].carbonBasis })) })).toBe(quote.fingerprint);
    } finally { product.co2KgPerKg = previous; }
  });
});
