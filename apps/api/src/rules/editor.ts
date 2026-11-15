/**
 * RULE-EDIT: an approver changes the hotel's rules from the Rules screen.
 * Outcome choices and agent thresholds go to the policy store; money, calendar
 * and tolerance numbers go into the standing mandate, which is re-signed with a
 * new version so outside agents and old approvals see the change.
 */
import type { Mandate, Outcome } from "@aimo/contracts";
import { audit } from "../audit.js";
import { nowIso } from "../clock.js";
import { getMandate, putMandate } from "../gateway/service.js";
import { MANDATE } from "../seed.js";
import { RULE_INDEX } from "./catalogue.js";
import { CONTROLS, PARAMS, DEFAULT_PARAMS, policyParams, savePolicy, storedPolicy, type PolicyParams } from "./policy.js";
import type { Person } from "../identity.js";

export class RuleEditError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type RuleEdit = { outcomes?: Record<string, string>; params?: Record<string, unknown> };

const PRE_KEYS = ["unknownStockMaxLineEur", "partialFillMaxShortPct", "overshootMaxPct", "overshootMaxEur", "priceRiseMaxPct", "guestChangeMaxPct"] as const;
const OUTCOME_NAME: Record<Outcome, string> = { order: "order", ask_chef: "ask the chef", ask_approver: "ask an approver", block: "block" };

function checkValue(key: string, v: unknown): unknown {
  const d = PARAMS[key];
  if (!d) throw new RuleEditError(`Unknown setting ${key}`);
  switch (d.kind) {
    case "bool":
      if (typeof v !== "boolean") throw new RuleEditError(`${d.label}: on or off`);
      return v;
    case "weekdays": {
      if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x >= 0 && x <= 6)) throw new RuleEditError(`${d.label}: days 0–6`);
      const days = [...new Set(v as number[])].sort();
      if (!days.length) throw new RuleEditError("Pick at least one delivery day");
      return days;
    }
    case "dates": {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))) throw new RuleEditError(`${d.label}: dates as YYYY-MM-DD`);
      return [...new Set(v as string[])].sort();
    }
    case "products": {
      if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && /^[0-9A-Za-z-]{1,20}$/.test(x.trim()))) throw new RuleEditError(`${d.label}: product codes`);
      return [...new Set((v as string[]).map((x) => x.trim()))];
    }
    default: {
      if (v === null) {
        if (!d.nullLabel) throw new RuleEditError(`${d.label} needs a number`);
        return null;
      }
      if (typeof v !== "number" || !Number.isFinite(v)) throw new RuleEditError(`${d.label} needs a number`);
      if ((d.min !== undefined && v < d.min) || (d.max !== undefined && v > d.max)) throw new RuleEditError(`${d.label}: between ${d.min} and ${d.max}`);
      return v;
    }
  }
}

const show = (v: unknown) => (v === null ? "always ask" : Array.isArray(v) ? (v.length ? v.join(", ") : "none") : String(v));

/** Apply one edit. Nothing is saved unless every value passes. Returns what changed, in words. */
export function editRules(by: Person, edit: RuleEdit): string[] {
  if (by.role !== "approver") throw new RuleEditError("Only an approver can change the hotel's rules");
  const policy = storedPolicy();
  const current = getMandate(by.hotelId);
  const mandate: Mandate = { ...current, preAnswers: { ...current.preAnswers } };
  const params: Partial<PolicyParams> = { ...policy.params };
  const outcomes = { ...policy.outcomes };
  const changes: string[] = [];
  const ruleIds = new Set<string>();
  let mandateChanged = false;

  for (const [id, raw] of Object.entries(edit.outcomes ?? {})) {
    const def = RULE_INDEX.get(id);
    const c = CONTROLS[id];
    if (!def || !c) throw new RuleEditError(`Unknown rule ${id}`);
    const o = raw as Outcome;
    if (!c.choices.includes(o)) throw new RuleEditError(c.choices.length === 1 ? `${id} is locked. ${c.lock ?? ""}`.trim() : `${id} can't be set to ${raw}`);
    const before = outcomes[id] ?? def.outcome;
    if (before === o) continue;
    if (o === def.outcome) delete outcomes[id];
    else outcomes[id] = o;
    changes.push(`${id} ${def.label}: ${OUTCOME_NAME[before]} → ${OUTCOME_NAME[o]}`);
    ruleIds.add(id);
  }

  for (const [key, raw] of Object.entries(edit.params ?? {})) {
    const v = checkValue(key, raw);
    const d = PARAMS[key];
    const users = Object.entries(CONTROLS).filter(([, c]) => c.params?.includes(key)).map(([id]) => id);
    if (d.scope === "mandate") {
      const pre = (PRE_KEYS as readonly string[]).includes(key);
      const before = pre ? (mandate.preAnswers as Record<string, unknown>)[key] : (mandate as Record<string, unknown>)[key];
      if (JSON.stringify(before) === JSON.stringify(v)) continue;
      if (pre) (mandate.preAnswers as Record<string, unknown>)[key] = v;
      else (mandate as Record<string, unknown>)[key] = v;
      mandateChanged = true;
      changes.push(`${d.label}: ${show(before)} → ${show(v)}`);
    } else {
      const before = (policyParams() as Record<string, unknown>)[key];
      if (before === v) continue;
      if (v === (DEFAULT_PARAMS as Record<string, unknown>)[key]) delete (params as Record<string, unknown>)[key];
      else (params as Record<string, unknown>)[key] = v;
      changes.push(`${d.label}: ${show(before)} → ${show(v)}`);
    }
    users.forEach((id) => ruleIds.add(id));
  }

  const eff = { ...DEFAULT_PARAMS, ...params };
  if (eff.typeNoMax >= eff.typeYesMin) throw new RuleEditError("\"Leave out below\" must be lower than \"Count as the right type from\"");
  if (eff.reliabilityAsk > eff.reliabilityAmber) throw new RuleEditError("The ask threshold for reliability can't be above the note threshold");

  if (!changes.length) return [];
  const at = nowIso();
  if (mandateChanged) putMandate({ ...mandate, version: current.version + 1 });
  savePolicy({ outcomes, params, version: policy.version + 1, updatedBy: by.name, updatedAt: at });
  audit({
    actor: { kind: "person", id: by.id, name: by.name, role: by.role, outletId: by.outlets[0] ?? null, testSession: true },
    action: "mandate_changed",
    summary: `${by.name} changed the hotel's rules: ${changes.join("; ")}`,
    ruleIds: [...ruleIds],
    details: { changes, mandateVersion: mandateChanged ? current.version + 1 : current.version, policyVersion: policy.version + 1 },
    visibility: "hotel",
  });
  return changes;
}

/** Back to the catalogue defaults and the seeded mandate values. */
export function resetRules(by: Person): string[] {
  const back: Record<string, unknown> = { spendCapEur: MANDATE.spendCapEur, blockedProducts: MANDATE.blockedProducts, deliveryDays: MANDATE.deliveryDays, holidays: MANDATE.holidays, ...MANDATE.preAnswers, ...DEFAULT_PARAMS };
  const outcomes = Object.fromEntries([...RULE_INDEX.values()].map((r) => [r.id, r.outcome]));
  return editRules(by, { outcomes, params: back });
}
