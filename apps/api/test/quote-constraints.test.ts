import { afterEach, beforeEach, describe, expect, it } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { resolveToken } = await import("../src/identity.js");
const { createQuote, placeOrder, fingerprintOf } = await import("../src/gateway/service.js");
const { getProduct } = await import("../src/catalog.js");
const product = getProduct("469363")!;
const originalOrigin = product.origin;
beforeEach(() => { seedReset(); setClock({ time: "2026-11-14T10:00:00Z" }); });
afterEach(() => { product.origin = originalOrigin; });

async function constrainedQuote() {
  return createQuote(resolveToken(OUTSIDE_AGENT_TOKEN)!, {
    siteId: "site-aurora", deliveryDate: "2026-11-16",
    lines: [{ productId: "469363", quantity: 5, outletId: "banquet", requires: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [], origin: "fi" } }],
  });
}

describe("gateway carries the quoted hard constraints to commit", () => {
  it("persists the origin requirement in the quoted line", async () => {
    const quote = await constrainedQuote();
    expect((quote.lines[0] as any).requires).toMatchObject({ origin: "fi" });
  });

  it("binds the hard constraints into the quote fingerprint", async () => {
    const quote = await constrainedQuote();
    const changed = structuredClone(quote);
    (changed.lines[0] as any).requires = { claims: [], avoidAllergens: [], labels: [], origin: "no" };
    expect(fingerprintOf(changed)).not.toBe(fingerprintOf(quote));
  });

  it("rechecks unknown provenance at commit instead of waiving the required origin", async () => {
    const quote = await constrainedQuote();
    product.origin = null; // Explicit catalog-change fixture after the initial quote.
    await expect(placeOrder(resolveToken(OUTSIDE_AGENT_TOKEN)!, quote.id, "synthetic-origin-recheck"))
      .rejects.toMatchObject({ body: { error: "hard_rule", rules: expect.arrayContaining([expect.objectContaining({ ruleId: "ORG-01" })]) } });
  });

  it("checks combined supplier stock for repeated product lines", async () => {
    const quote = await createQuote(resolveToken(OUTSIDE_AGENT_TOKEN)!, {
      siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: ["first", "second"].map((ref) => ({ productId: "469363", quantity: 300, outletId: "banquet", ref })),
    });
    expect(quote.outcome).toBe("block");
    expect(quote.lines[0].rules).toContainEqual(expect.objectContaining({ ruleId: "STK-04" }));
  });
});

