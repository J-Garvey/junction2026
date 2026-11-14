import { describe, it, expect, beforeAll } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
const { getProduct } = await import("../src/catalog.js");
const { dietRules, stockCheck, cutoffRule, earliestDelivery, packContent, mandateRules } = await import("../src/rules/checks.js");
const { resolveOutcome, fire, RULES } = await import("../src/rules/catalogue.js");
const { packRound } = await import("../src/agent/match.js");
const { rulesParse, quantitySanity, toBase } = await import("../src/agent/parse.js");
const { MANDATE } = await import("../src/seed.js");
const { audit, verifyChain, SYSTEM } = await import("../src/audit.js");
const { getDb } = await import("../src/db.js");
const { normalise } = await import("../src/aimo/lookup.js");

const look = (o: Partial<Record<string, any>> = {}) =>
  normalise("469363", { productId: "469363", closingTime: "2026-11-15T17:00:00+0200", logisticModel: "Stock", scheduleLines: [{ availableAmount: 384, availableDate: "2026-11-16", salesUnit: "ST" }], ...o }, { catalogPrice: { value: 2.48, validTo: "9999-12-31T00:00:00+0200" }, comparisonPrice: { value: 2.48 }, comparisonUnit: "L", tax: { taxRate: 13.5 } }, "fixture", "test", "now");

describe("rule catalogue (SF-03)", () => {
  it("every rule has a unique stable id and a template", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RULES) expect(r.template.length).toBeGreaterThan(5);
  });
  it("OUTCOME-RESOLVE: block beats ask-chef beats ask-approver beats order", () => {
    expect(resolveOutcome([fire("REL-01", {}), fire("STK-01", {}), fire("TYP-01", {})])).toBe("ask_chef");
    expect(resolveOutcome([fire("STK-01", {}), fire("ALG-01", {})])).toBe("block");
    expect(resolveOutcome([fire("QTY-06", {})])).toBe("order");
  });
});

describe("DIET-FILTER", () => {
  it("lactose-free passes on the claim, never on the name", () => {
    expect(dietRules(getProduct("469363")!, { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] }, "g").filter((r) => r.outcome === "block")).toHaveLength(0);
    expect(dietRules(getProduct("475797")!, { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] }, "g")[0].ruleId).toBe("DIET-01");
  });
  it("a lactose-free claim with lactose contained fails (DIET-02)", () => {
    expect(dietRules(getProduct("465346")!, { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] }, "g")[0].ruleId).toBe("DIET-02");
  });
  it("no allergen declaration is never safe for an allergy (ALG-03)", () => {
    expect(dietRules(getProduct("460643")!, { claims: [], avoidAllergens: ["AF"], labels: [] }, "g")[0].ruleId).toBe("ALG-03");
  });
  it("a tree-nut allergy catches almond, and 'free from' never outweighs 'contains'", () => {
    // 467767 lists AN as free-from and SA (almond) as contains.
    const r = dietRules(getProduct("467767")!, { claims: [], avoidAllergens: ["AN"], labels: [] }, "g");
    expect(r[0]).toMatchObject({ ruleId: "ALG-01" });
    expect(r[0].facts.allergen).toBe("almond");
  });
  it("contains fish blocks a fish allergy (ALG-01)", () => {
    expect(dietRules(getProduct("471555")!, { claims: [], avoidAllergens: ["AF"], labels: [] }, "g")[0].ruleId).toBe("ALG-01");
  });
});

describe("STOCK-CHECK and CUTOFF-CHECK", () => {
  it("both sentinels are unknown, never available", () => {
    expect(look({ logisticModel: "Terminal", scheduleLines: [{ availableAmount: 999999, availableDate: "2026-11-16", salesUnit: "KI" }] }).stock.kind).toBe("unknown");
    expect(look({ scheduleLines: [{ availableAmount: 833333333, availableDate: "2026-11-16", salesUnit: "KI" }] }).stock.kind).toBe("unknown");
    expect(stockCheck({ name: "x" }, look({ logisticModel: "Terminal", scheduleLines: [{ availableAmount: 999999, availableDate: "2026-11-16", salesUnit: "KI" }] }), 5, true, "KI").rules[0].ruleId).toBe("STK-01");
  });
  it("empty schedule lines means not deliverable", () => {
    expect(look({ scheduleLines: [], logisticModel: undefined }).deliverable).toBe(false);
  });
  it("months ahead stock is information only; urgent it counts", () => {
    expect(stockCheck({ name: "x" }, look(), 500, false, "ST").kind).toBe("info");
    expect(stockCheck({ name: "x" }, look(), 500, true, "ST").kind).toBe("partial");
  });
  it("a passed cut-off is caught even though the mock still shows Monday", () => {
    expect(cutoffRule({ name: "x" }, look(), new Date("2026-11-15T16:00:00Z"))?.ruleId).toBe("CUT-01");
    expect(cutoffRule({ name: "x" }, look(), new Date("2026-11-15T14:00:00Z"))).toBeNull();
  });
  it("earliest delivery keeps the offered date, or moves past a passed cut-off (DLV-06)", () => {
    const days = [1, 2, 3, 4, 5];
    expect(earliestDelivery(look(), new Date("2026-11-15T14:00:00Z"), days, [])).toBe("2026-11-16");
    // Sun 17:00 cut-off passed: Tuesday's cut-off is Mon 17:00, still ahead.
    expect(earliestDelivery(look(), new Date("2026-11-15T16:00:00Z"), days, [])).toBe("2026-11-17");
    expect(earliestDelivery(look(), new Date("2026-11-15T16:00:00Z"), days, ["2026-11-17"])).toBe("2026-11-18");
  });
});

describe("quantities (D25)", () => {
  it("pack content prefers the price API and verifies it", () => {
    const pc = packContent(getProduct("469363")!, look())!;
    expect(pc.verified).toBe(true);
    expect(pc.value).toBeCloseTo(1, 3);
  });
  it("rounds up once, never down; asks only above both overshoot limits", () => {
    const c: any = { packContent: { value: 1, unit: "l", verified: true }, unitPrice: 2, salesUnit: "ST" };
    expect(packRound("milk", 1.5, "l", c, MANDATE.preAnswers).quantity).toBe(2);
    expect(packRound("milk", 1.5, "l", c, MANDATE.preAnswers).rules.map((r) => r.ruleId)).toEqual(["QTY-06"]);
    const big: any = { packContent: { value: 20, unit: "l", verified: true }, unitPrice: 100, salesUnit: "CS" };
    expect(packRound("cream", 21, "l", big, MANDATE.preAnswers).rules[0].ruleId).toBe("QTY-01");
    expect(packRound("cream", 40, "l", big, MANDATE.preAnswers).overshoot).toBeNull();
  });
  it("never converts weight to volume", () => {
    const c: any = { packContent: { value: 1, unit: "l", verified: true }, unitPrice: 2, salesUnit: "ST" };
    expect(packRound("milk", 2, "kg", c, MANDATE.preAnswers).rules[0].ruleId).toBe("QTY-05");
  });
  it("QUANTITY-SANITY names a likely unit slip and never corrects it", () => {
    expect(quantitySanity("cream", { amount: 10, unit: "l" }, 500)[0].ruleId).toBe("QTY-02");
    expect(quantitySanity("cream", { amount: 1, unit: "dl" }, 500)).toHaveLength(0);
    expect(toBase({ amount: 5, unit: "dl" })).toEqual({ value: 0.5, unit: "l" });
  });
});

describe("REQUEST-PARSE (built-in parser)", () => {
  it("reads the brief's milk sentence", () => {
    const r = rulesParse("I need 1,000 litres of lactose-free milk by Monday");
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].quantity).toEqual({ amount: 1000, unit: "l" });
    expect(r.lines[0].constraints.claims).toEqual(["FREE_FROM_LACTOSE"]);
    expect(r.lines[0].productType).toBe("plain drinking milk");
  });
  it("splits two items and defaults a missing number to one piece", () => {
    const r = rulesParse("milk and cream by Monday");
    expect(r.lines).toHaveLength(2);
    expect(r.lines.every((l) => l.quantity?.amount === 1 && l.quantity.unit === "pcs")).toBe(true);
  });
  it("reads a bare count as pieces and keeps the number out of the product", () => {
    for (const [text, amount, query] of [
      ["10 cheese", 10, "cheese"],
      ["12 birthday cakes", 12, "birthday cakes"],
      ["12 x birthday cakes by Monday", 12, "birthday cakes"],
      ["birthday cake x 3", 3, "birthday cake"],
      ["birthday cake", 1, "birthday cake"],
    ] as const) {
      const l = rulesParse(text).lines[0];
      expect(l.quantity).toEqual({ amount, unit: "pcs" });
      expect(l.query).toBe(query);
    }
  });
  it("doesn't read a date or product code as a count", () => {
    expect(rulesParse("cheese by 2026-11-16").lines[0].quantity).toEqual({ amount: 1, unit: "pcs" });
    expect(rulesParse("cheese for 16 Nov").lines[0].quantity).toEqual({ amount: 1, unit: "pcs" });
    expect(rulesParse("4 x 464306").lines[0]).toMatchObject({ productId: "464306", quantity: { amount: 4, unit: "pcs" } });
  });
});

describe("MANDATE-CHECK", () => {
  it("the cap is inclusive, ex VAT, and a zero cap asks on every order", () => {
    const m = { ...MANDATE, spendCapEur: 5000 };
    expect(mandateRules(m, 5000, [], "site-aurora").approvalsNeeded).toEqual([]);
    expect(mandateRules(m, 5000.01, [], "site-aurora").approvalsNeeded).toEqual(["spend_cap"]);
    expect(mandateRules({ ...MANDATE, spendCapEur: 0 }, 1, [], "site-aurora").approvalsNeeded).toEqual(["spend_cap"]);
  });
});

describe("AUDIT-APPEND (Q09.3)", () => {
  it("detects an edited entry", () => {
    audit({ actor: SYSTEM, action: "seed_reset", summary: "a", visibility: "shared" });
    audit({ actor: SYSTEM, action: "seed_reset", summary: "b", visibility: "shared" });
    expect(verifyChain().ok).toBe(true);
    const row = getDb().prepare("SELECT seq, json FROM audit ORDER BY seq LIMIT 1").get() as any;
    const j = JSON.parse(row.json);
    j.summary = "tampered";
    getDb().prepare("UPDATE audit SET json = ? WHERE seq = ?").run(JSON.stringify(j), row.seq);
    expect(verifyChain().ok).toBe(false);
  });
});
