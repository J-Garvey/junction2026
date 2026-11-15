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
    const lines = body.lines.map((line, index) => ({ ...fixture.lines.find((l) => l.productId === line.productId)!, ...line, lineNo: index + 1, ref: line.ref ?? null, unitPrice: line.productId === "462150" ? 14.11 : 2.48, lineTotal: +(line.quantity * (line.productId === "462150" ? 14.11 : 2.48)).toFixed(2), rules: [] }));
    return { id: "synthetic-quote", fingerprint: "synthetic-fingerprint", expiresAt: "2026-11-14T11:00:00Z", unconfirmedStock: [], lines, totalExVat: +lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2), totalVat: 0, mandateCheck: { approvalsNeeded: [], rules: [] }, outcome: "order" } as unknown as Quote;
  });
});
afterEach(() => vi.restoreAllMocks());

async function planFor(text: string, neededBy = "2026-11-16") {
  const request = { ...rulesParse(text), siteId: "site-main", outletId: "banquet", neededBy };
  const plan = newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { request, reviewing: true });
  await quoteAndDecide(plan);
  return plan;
}

describe("purchasing plan line integrity", () => {
  it.each(["same", "quantity", "policy"])("reuses a builder stock decision only for the reviewed terms (%s)", async (change) => {
    const quote = vi.mocked(gw.quote).getMockImplementation()!;
    let changed = false;
    vi.mocked(gw.quote).mockImplementation(async (body) => {
      const result = await quote(body);
      return { ...result, stockPolicy: changed && change === "policy" ? "policy-v2" : "policy-v1",
        fingerprint: changed && change === "quantity" ? "new-quantity" : "reviewed-quantity",
        unconfirmedStock: ["469363"], lines: result.lines.map((l) => ({ ...l, stock: { kind: "unknown", reason: "stock_sentinel" } })) };
    });
    const order = vi.spyOn(gw, "order").mockResolvedValue({ id: "I3-mock-order", lines: [] } as any);
    const plan = await planFor("5 l lactose-free milk 469363");
    plan.overrides.accepted = true;
    plan.overrides.stockContinued = ["469363"];
    plan.overrides.stockDecidedBy = "reviewing builder";
    if (change === "quantity") plan.request!.lines[0].quantity!.amount = 6;
    changed = true;
    await quoteAndDecide(plan);
    expect(plan.lines[0].stock?.kind).toBe("unknown");
    if (change === "same") {
      expect(plan.overrides.stockContinued).toEqual(["469363"]);
      expect(order).toHaveBeenCalledOnce();
    } else {
      expect(plan.overrides.stockContinued).toEqual([]);
      expect(order).not.toHaveBeenCalled();
      expect(plan.status).toBe("waiting");
    }
  });

  it("keeps litres and kilograms separate when the same product is requested ahead", async () => {
    const plan = await planFor("5 l lactose-free milk 469363 and 5 kg lactose-free milk 469363", "2027-03-01");
    expect(plan.lines.some((line) => line.rules.some((rule) => rule.ruleId === "QTY-05"))).toBe(true);
    expect(plan.lines.filter((line) => line.needAmount.unit === "l").reduce((sum, line) => sum + line.quantity, 0)).toBe(5);
  });

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
