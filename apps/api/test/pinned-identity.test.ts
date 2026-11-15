import { describe, expect, it } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
const { rulesParse } = await import("../src/agent/parse.js");
const { needsFromSingle } = await import("../src/agent/plan.js");
const { shortlist, rankNeed } = await import("../src/agent/match.js");
const { normalise } = await import("../src/aimo/lookup.js");
const { setClock } = await import("../src/clock.js");

describe("explicit product requests preserve primary and secondary identity", () => {
  it("keeps the named plain-milk identity alongside its product ID", () => {
    expect(rulesParse("10 l lactose-free milk 469363").lines[0]).toMatchObject({
      query: "milk", productId: "469363", productType: "plain drinking milk", category: "10400",
    });
  });

  it("excludes coffee and sour milk from secondary candidates (AUD-MAIN-005)", async () => {
    setClock({ time: "2026-11-14T10:00:00Z" });
    const request = { ...rulesParse("10 l lactose-free milk 469363"), siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16" };
    const need = needsFromSingle(request)[0];
    const list = shortlist(need);
    // Identity-only supply fixture: never contact a supplier for catalogue-wide alternatives.
    const pool = new Map(list.map((p) => [p.id, normalise(p.id, {
      productId: p.id, closingTime: "2026-11-15T17:00:00+0200", logisticModel: "Stock",
      scheduleLines: [{ availableAmount: 100, availableDate: "2026-11-16", salesUnit: "ST" }],
    }, { catalogPrice: { value: 2, validTo: "9999-12-31T00:00:00+0200" }, comparisonPrice: { value: 2 }, comparisonUnit: "L", tax: { taxRate: 13.5 } }, "fixture", "synthetic identity-only fixture", "2026-11-14T10:00:00Z")]));
    await rankNeed(need, list, pool);
    expect(need.candidates[0].productId).toBe("469363");
    expect(need.candidates.length).toBeGreaterThan(1);
    expect(need.candidates.map((c) => c.productId)).not.toEqual(expect.arrayContaining(["463380", "464237", "477050", "476957"]));
    expect(need.candidates.every((c) => !/coffee|caf[eè]|sour milk|piimä/i.test(c.name))).toBe(true);
  });

  it("does not infer arbitrary substitutes from a bare product ID", () => {
    // With an amount: a bare id alone leaves the amount to ask for (REQ-02), so there's no need yet.
    const request = { ...rulesParse("4 x 469363"), siteId: "site-aurora", outletId: "banquet" };
    expect(shortlist(needsFromSingle(request)[0]).map((p) => p.id)).toEqual(["469363"]);
  });
});
