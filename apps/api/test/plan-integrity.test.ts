import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote, QuoteCreateBody } from "@aimo/contracts";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { newPlan, quoteAndDecide, mandate } = await import("../src/agent/plan.js");
const { putMandate } = await import("../src/gateway/service.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { lookup, normalise } = await import("../src/aimo/lookup.js");
const { submitBasketForReview } = await import("../src/agent/baskets.js");
const { savePlan } = await import("../src/agent/plan.js");
const { getPerson } = await import("../src/identity.js");

let quoted: QuoteCreateBody | undefined;
beforeEach(async () => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
  quoted = undefined;
  const fixture = await lookup(["462150", "469363"], "2026-11-16", { mode: "fixture", overlay: null });
  // Bound every shortlist lookup to these saved fixtures. Other products are explicitly
  // unavailable; no supplier/model calls are used for these pipeline regressions.
  vi.spyOn(gw, "lookup").mockImplementation(async (ids) => ({ ...fixture, lines: ids.map((id) => fixture.lines.find((l) => l.productId === id) ?? normalise(id, {}, {}, "fixture", "unavailable identity fixture", "2026-11-14T10:00:00Z")) }));
  vi.spyOn(gw, "quote").mockImplementation(async (body) => {
    quoted = body;
    const lines = body.lines.map((line, index) => ({ ...line, lineNo: index + 1, ref: line.ref ?? null, unitPrice: line.productId === "462150" ? 14.11 : 2.48, lineTotal: +(line.quantity * (line.productId === "462150" ? 14.11 : 2.48)).toFixed(2), rules: [] }));
    return { id: "synthetic-quote", fingerprint: "synthetic-fingerprint", expiresAt: "2026-11-14T11:00:00Z", unconfirmedStock: [], lines, totalExVat: +lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2), totalVat: 0, mandateCheck: { approvalsNeeded: [], rules: [] }, outcome: "order" } as unknown as Quote;
  });
});
afterEach(() => vi.restoreAllMocks());

async function planFor(text: string) {
  const request = { ...rulesParse(text), siteId: "site-main", outletId: "banquet", neededBy: "2026-11-16" };
  const plan = newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { request, reviewing: true });
  await quoteAndDecide(plan);
  return plan;
}

describe("purchasing plan line integrity", () => {
  it("keeps repeated salmon line refs unique and totals correct (AUD-MAIN-007)", async () => {
    const plan = await planFor("10 kg salmon and 5 kg salmon");
    expect(new Set(plan.lines.map((line) => line.id)).size).toBe(plan.lines.length);
    for (const line of plan.lines) expect(line.lineTotal).toBe(+(line.quantity * line.unitPrice!).toFixed(2));
    expect(plan.totalExVat).toBe(211.65);
    expect(plan.lines.reduce((sum, line) => sum + line.lineTotal!, 0)).toBeCloseTo(211.65, 2);
  });

  it("does not count the same confirmed stock twice across repeated needs", async () => {
    const plan = await planFor("300 l lactose-free milk 469363 and 300 l lactose-free milk 469363");
    const total = plan.lines.filter((line) => line.productId === "469363").reduce((sum, line) => sum + line.quantity, 0);
    expect(total).toBeLessThanOrEqual(384);
    expect(plan.status).not.toBe("ordered");
    expect(plan.shortfall).not.toBeNull();
    expect(quoted?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0).toBeLessThanOrEqual(384);
  });

  it("rounds a repeated fractional need once for the combined product", async () => {
    const policy = mandate();
    policy.preAnswers.overshootMaxEur = 0;
    putMandate(policy);
    const plan = await planFor("0.2 kg salmon and 0.3 kg salmon");
    expect(plan.lines.filter((line) => line.productId === "462150").reduce((sum, line) => sum + line.quantity, 0)).toBe(1);
    expect(plan.lines[0].rules.map((rule) => rule.ruleId)).toContain("QTY-01");
  });

  it("propagates a hard origin requirement into the gateway quote", async () => {
    await planFor("5 l Finnish lactose-free milk 469363");
    expect(quoted?.lines[0].requires).toMatchObject({ origin: "fi", claims: ["FREE_FROM_LACTOSE"] });
  });

  it("retains origin in the combined basket finance quote", async () => {
    const plan = await planFor("5 l Finnish lactose-free milk 469363");
    plan.eventId = "evt-wedding";
    plan.basketedAt = "2026-11-14T10:00:00Z";
    savePlan(plan);
    vi.spyOn(gw, "orders").mockResolvedValue({ orders: [] });
    await submitBasketForReview("evt-wedding", getPerson("p-aino")!);
    expect(quoted?.eventId).toBe("evt-wedding");
    expect(quoted?.lines[0].requires?.origin).toBe("fi");
  });
});
