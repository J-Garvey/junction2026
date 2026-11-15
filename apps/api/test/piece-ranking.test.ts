import { beforeEach, describe, expect, it } from "vitest";
import type { LookupLine, Need, Product } from "@aimo/contracts";
process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.OPENAI_API_KEY = "";
const { getProduct } = await import("../src/catalog.js");
const { lookup } = await import("../src/aimo/lookup.js");
const { rankNeed, packRound } = await import("../src/agent/match.js");
const { setClock } = await import("../src/clock.js");
const { MANDATE, seedReset } = await import("../src/seed.js");

function need(value = 194): Need {
  return { id: "cake", label: "cake", text: "cake", query: "cake", dishId: null, dishName: null, ingredientId: null,
    groupId: "regular", groupLabel: "guests", guests: value, perPortion: null, outletId: "kitchen",
    amount: { value, unit: "pcs" }, constraints: { claims: [], avoidAllergens: ["AN"], labels: [] },
    pinnedProductId: null, productType: null, category: "41763", neededBy: "2026-11-16", frozen: true,
    candidates: [], candidateCount: 0, excluded: [], rules: [], judgements: [], substituteFor: null };
}
let pool: Map<string, LookupLine>;
beforeEach(async () => {
  seedReset();
  setClock({ time: "2026-10-30T08:00:00Z" });
  const result = await lookup(["473522", "466509"], "2026-11-16", { mode: "fixture", overlay: null });
  pool = new Map(result.lines.map((l) => [l.productId, l]));
});
function synthetic(id: string, pieces: number, price: number, reliability = 1) {
  const product: Product = { ...getProduct("473522")!, id, name: `Cake 1kg ${pieces}pcs`, reliability };
  const line: LookupLine = { ...pool.get("473522")!, productId: id, price: { ...pool.get("473522")!.price!, value: price, comparisonPrice: price } };
  pool.set(id, line);
  return product;
}
describe("D36 whole-pack cost for piece requests", () => {
  it("ranks the exact 194-guest cakes by event total despite inverse kg prices", async () => {
    const n = need();
    expect(pool.get("466509")!.price!.comparisonPrice).toBeLessThan(pool.get("473522")!.price!.comparisonPrice!);
    await rankNeed(n, [getProduct("466509")!, getProduct("473522")!], pool);
    expect(n.candidates.map((c) => [c.productId, c.costToCover])).toEqual([
      ["473522", { need: 194, quantity: 5, totalExVat: 310.60 }],
      ["466509", { need: 194, quantity: 13, totalExVat: 316.42 }],
    ]);
    expect(n.candidates[0].rankStep).toBe("cost to cover the piece need after whole-pack rounding");
    for (const c of n.candidates) expect(packRound(c.name, 194, "pcs", c, MANDATE.preAnswers).quantity).toBe(c.costToCover!.quantity);
  });
  it("lets rounding reverse a cheaper per-piece price and keeps exact boundaries stable", async () => {
    const cheapPerPiece = synthetic("large", 10, 9);
    const small = synthetic("small", 6, 6);
    const n = need(11);
    await rankNeed(n, [cheapPerPiece, small], pool);
    expect(n.candidates.map((c) => [c.productId, c.costToCover!.totalExVat])).toEqual([["small", 12], ["large", 18]]);
    n.amount.value = 10 + 1e-10;
    await rankNeed(n, [cheapPerPiece, small], pool);
    expect(n.candidates[0]).toMatchObject({ productId: "large", costToCover: { quantity: 1, totalExVat: 9 } });
  });
  it("rounds a combined need once instead of adding per-need rounded totals", async () => {
    const options = [synthetic("large", 10, 9), synthetic("small", 6, 6)];
    const n = need(6);
    await rankNeed(n, options, pool, { combinedPieceNeed: 12 });
    expect(n.candidates[0]).toMatchObject({ productId: "small", costToCover: { need: 12, quantity: 2, totalExVat: 12 } });
  });
  it("never makes an unchecked count or a count per ordered kg an authoritative cheap total", async () => {
    const unchecked = synthetic("unchecked", 1000, 0.01);
    pool.get(unchecked.id)!.price!.comparisonPrice = null;
    const byKg = synthetic("weight", 1000, 0.01);
    pool.get(byKg.id)!.salesUnit = "KG";
    const n = need();
    await rankNeed(n, [unchecked, byKg, getProduct("473522")!], pool);
    expect(n.candidates[0].productId).toBe("473522");
    for (const c of n.candidates.slice(1)) {
      expect(c.costToCover).toBeNull();
      expect(c.pricePerBase).toBeNull();
      expect(packRound(c.name, 194, "pcs", c, MANDATE.preAnswers)).toMatchObject({ quantity: 0, rules: [expect.objectContaining({ ruleId: "QTY-03" })] });
    }
  });
  it("preserves priced recipe choices, missing-price ordering, reliability and stable ID ties", async () => {
    const options = [synthetic("3", 10, 9, 0.5), synthetic("2", 10, 9), synthetic("1", 10, 9)];
    pool.get("2")!.stock = { kind: "known", amount: 100 };
    const n = need(11);
    await rankNeed(n, options, pool);
    expect(n.candidates.map((c) => c.productId)).toEqual(["1", "2", "3"]);
    await rankNeed(n, options.reverse(), pool);
    expect(n.candidates.map((c) => c.productId)).toEqual(["1", "2", "3"]);
    pool.get("3")!.price!.value = 10;
    pool.get("3")!.price!.comparisonPrice = 10;
    n.pinnedProductId = "3";
    await rankNeed(n, options, pool);
    expect(n.candidates[0]).toMatchObject({ productId: "3", rankStep: "recipe-approved product" });
    pool.get("3")!.price = null;
    await rankNeed(n, options, pool);
    expect(n.candidates.at(-1)!.productId).toBe("3");
  });
  it.each(["kg", "l"] as const)("preserves D34 normalized %s ranking even when whole-pack total is higher", async (unit) => {
    const large = synthetic("large", 10, 9), small = synthetic("small", 6, 6);
    for (const [p, size] of [[large, 10], [small, 6]] as const) {
      p.packContent = { value: size, unit };
      pool.get(p.id)!.price!.comparisonUnit = unit === "kg" ? "KG" : "L";
      pool.get(p.id)!.price!.comparisonPrice = pool.get(p.id)!.price!.value / size;
    }
    const n = need(11); n.amount.unit = unit;
    await rankNeed(n, [small, large], pool);
    expect(n.candidates[0]).toMatchObject({ productId: "large", rankStep: "price per kg or L after rounding" });
    expect(n.candidates[0].costToCover).toBeUndefined();
  });
});
