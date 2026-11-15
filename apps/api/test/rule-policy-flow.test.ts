/** RULE-POLICY in a real request: a rule switched to "ask the chef" raises a chef card; switched back, it doesn't. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@aimo/contracts";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { newPlan, quoteAndDecide } = await import("../src/agent/plan.js");
const { buildQuestions } = await import("../src/agent/questions.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { lookup, normalise } = await import("../src/aimo/lookup.js");
const { getPerson } = await import("../src/identity.js");
const { editRules } = await import("../src/rules/editor.js");

const quote = { id: "q-policy", fingerprint: "fp-policy", unconfirmedStock: [], lines: [], totalExVat: 14.11, totalVat: 0, mandateCheck: { approvalsNeeded: [], rules: [] }, outcome: "order" } as unknown as Quote;

beforeEach(async () => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
  const fixture = await lookup(["462150"], "2026-11-16", { mode: "fixture", overlay: null });
  vi.spyOn(gw, "lookup").mockImplementation(async (ids) => ({ ...fixture, lines: ids.map((id) => fixture.lines.find((l) => l.productId === id) ?? normalise(id, {}, {}, "fixture", "unavailable", "2026-11-14T10:00:00Z")) }));
  vi.spyOn(gw, "quote").mockImplementation(async (body) => ({ ...quote, lines: body.lines.map((l, i) => ({ ...l, lineNo: i + 1, ref: l.ref ?? null, unitPrice: 14.11, lineTotal: +(l.quantity * 14.11).toFixed(2), rules: [] })) }) as unknown as Quote);
});
afterEach(() => vi.restoreAllMocks());

async function salmonPlan() {
  const request = { ...rulesParse("0.2 kg salmon"), siteId: "site-main", outletId: "banquet", neededBy: "2026-11-16" };
  const plan = newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { request, reviewing: true });
  await quoteAndDecide(plan);
  return plan;
}

describe("rule policy in a request", () => {
  it("rounding up stays silent by default and asks the chef once QTY-06 is set to ask", async () => {
    const quiet = await salmonPlan();
    expect(quiet.lines.flatMap((l) => l.rules).find((r) => r.ruleId === "QTY-06")?.outcome).toBe("order");
    expect(buildQuestions(quiet as any, quote).filter((q) => q.ruleIds.includes("QTY-06"))).toHaveLength(0);

    editRules(getPerson("p-sanna")!, { outcomes: { "QTY-06": "ask_chef" } });
    const asked = await salmonPlan();
    const qs = buildQuestions(asked as any, quote).filter((q) => q.ruleIds.includes("QTY-06"));
    expect(qs).toHaveLength(1);
    expect(qs[0]).toMatchObject({ forRole: "chef", type: "quantity_sanity" });
  });

  it("a raised reliability threshold with REL-01 set to ask the approver puts it on the approver's card", async () => {
    // Salmon 462150 is delivered as ordered 96.2% of the time: under 97%, so REL-01 fires.
    editRules(getPerson("p-sanna")!, { outcomes: { "REL-01": "ask_approver" }, params: { reliabilityAmber: 0.97 } });
    const plan = await salmonPlan();
    expect(plan.lines.flatMap((l) => l.rules).find((r) => r.ruleId === "REL-01")?.outcome).toBe("ask_approver");
    const qs = buildQuestions(plan as any, quote);
    expect(qs.find((q) => q.forRole === "approver")?.ruleIds).toContain("REL-01");
  });
});
