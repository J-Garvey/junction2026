/** RULE-POLICY and RULE-EDIT: every rule has a control, safety floors stay locked, and edits reach the checks. */
import { describe, it, expect, beforeEach } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
const { seedReset } = await import("../src/seed.js");
const { getPerson } = await import("../src/identity.js");
const { getProduct } = await import("../src/catalog.js");
const { RULES, fire, outcomeOf, rulesView, FIXED } = await import("../src/rules/catalogue.js");
const { CONTROLS, PARAMS } = await import("../src/rules/policy.js");
const { editRules, resetRules, RuleEditError } = await import("../src/rules/editor.js");
const { dietRules, mandateRules, reliabilityRules } = await import("../src/rules/checks.js");
const { getMandate } = await import("../src/gateway/service.js");
const { quantitySanity } = await import("../src/agent/parse.js");
const { allJson } = await import("../src/db.js");

const sanna = () => getPerson("p-sanna")!;
const aino = () => getPerson("p-aino")!;

beforeEach(() => seedReset());

describe("rule controls", () => {
  it("every rule has a control whose first choice is the catalogue default", () => {
    for (const r of RULES) {
      const c = CONTROLS[r.id];
      expect(c, r.id).toBeDefined();
      expect(c.choices[0], r.id).toBe(r.outcome);
      if (c.choices.length === 1) expect(c.lock, `${r.id} needs a lock reason`).toBeTruthy();
      for (const k of c.params ?? []) expect(PARAMS[k], `${r.id} param ${k}`).toBeDefined();
    }
  });

  it("safety floors can't be relaxed", () => {
    for (const id of ["ALG-01", "ALG-02", "ALG-04", "ALG-10", "DIET-01", "DIET-02", "DLV-01", "DLV-06", "CUT-01", "CUT-02", "PRC-01", "MAN-04"])
      expect(CONTROLS[id].choices, id).toEqual(["block"]);
    expect(CONTROLS["ALG-03"].choices).toEqual(["ask_chef"]);
    expect(() => editRules(sanna(), { outcomes: { "ALG-03": "order" } })).toThrow(RuleEditError);
    expect(() => editRules(sanna(), { outcomes: { "ALG-02": "ask_chef" } })).toThrow(RuleEditError);
  });

  it("defaults are unchanged until someone edits", () => {
    for (const r of rulesView()) expect(r.outcome).toBe(r.defaultOutcome);
    expect(FIXED.reliabilityAsk).toBe(0.8);
  });
});

describe("RULE-EDIT", () => {
  it("only an approver can change rules", () => {
    expect(() => editRules(aino(), { outcomes: { "MAN-01": "block" } })).toThrow(/Only an approver/);
    expect(outcomeOf("MAN-01")).toBe("ask_approver");
  });

  it("rejects values out of range, and nothing is saved", () => {
    expect(() => editRules(sanna(), { outcomes: { "MAN-01": "block" }, params: { spendCapEur: -5 } })).toThrow(RuleEditError);
    expect(() => editRules(sanna(), { params: { typeNoMax: 0.5, typeYesMin: 0.5 } })).toThrow(/lower/);
    expect(() => editRules(sanna(), { params: { deliveryDays: [] } })).toThrow(/at least one/);
    expect(outcomeOf("MAN-01")).toBe("ask_approver");
    expect(getMandate("hotel-aurora").spendCapEur).toBe(1950);
  });

  it("a spend cap set to block stops the order instead of asking, and the mandate is re-signed", () => {
    const before = getMandate("hotel-aurora");
    const changes = editRules(sanna(), { outcomes: { "MAN-01": "block" }, params: { spendCapEur: 1000 } });
    expect(changes).toHaveLength(2);
    const m = getMandate("hotel-aurora");
    expect(m.spendCapEur).toBe(1000);
    expect(m.version).toBe(before.version + 1);
    expect(m.signature).not.toBe(before.signature);
    const mc = mandateRules(m, 1200, [], m.sites[0].id);
    expect(mc.rules[0]).toMatchObject({ ruleId: "MAN-01", outcome: "block", overridable: false });
    expect(mc.approvalsNeeded).toEqual([]);
    const log = allJson<{ action: string; summary: string }>("SELECT json FROM audit").filter((a) => a.action === "mandate_changed");
    expect(log.at(-1)!.summary).toContain("Sanna");
  });

  it("a diet met by declaration can be made to require the claim", () => {
    const base = getProduct("469363")!;
    const p = { ...base, claims: [], contains: [], mayContain: [], hasAllergenData: true };
    const c = { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] };
    expect(dietRules(p, c, "g").map((r) => [r.ruleId, r.outcome])).toEqual([["DIET-05", "order"]]);
    editRules(sanna(), { outcomes: { "DIET-05": "block" } });
    expect(dietRules(p, c, "g").map((r) => [r.ruleId, r.outcome])).toEqual([["DIET-05", "block"]]);
  });

  it("a soft rule turned into a question becomes answerable", () => {
    editRules(sanna(), { outcomes: { "QTY-06": "ask_chef" } });
    expect(fire("QTY-06", {})).toMatchObject({ outcome: "ask_chef", overridable: true });
  });

  it("thresholds reach the checks", () => {
    const p = { ...getProduct("469363")!, reliability: 0.85 };
    expect(reliabilityRules(p)[0].ruleId).toBe("REL-01");
    editRules(sanna(), { params: { reliabilityAsk: 0.9 } });
    expect(reliabilityRules(p)[0].ruleId).toBe("REL-02");
    expect(quantitySanity("cream", { amount: 1.5, unit: "l" }, 10)).toHaveLength(1);
    editRules(sanna(), { params: { perGuestMaxKg: 2 } });
    expect(quantitySanity("cream", { amount: 1.5, unit: "l" }, 10)).toHaveLength(0);
  });

  it("reset puts every rule and limit back", () => {
    editRules(sanna(), { outcomes: { "SUB-01": "block", "CHG-01": "ask_approver" }, params: { urgentDays: 10, guestChangeMaxPct: 12, holidays: [] } });
    expect(outcomeOf("SUB-01")).toBe("block");
    resetRules(sanna());
    for (const r of rulesView()) expect(r.outcome, r.id).toBe(r.defaultOutcome);
    expect(FIXED.urgentDays).toBe(4);
    const m = getMandate("hotel-aurora");
    expect(m.preAnswers.guestChangeMaxPct).toBe(5);
    expect(m.holidays).toHaveLength(4);
  });
});
