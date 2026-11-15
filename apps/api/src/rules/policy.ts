/**
 * RULE-POLICY: what a hotel may change about each rule, and what it changed.
 *
 * Every rule in the catalogue has a control spec here: the outcomes it may be
 * set to (one choice = locked, with the reason), and the numbers or lists that
 * decide when it fires. Safety floors stay locked: allergen and diet failures,
 * missing delivery dates, passed cut-offs, missing prices and approval
 * mismatches are never relaxed (AGENTS.md, "Decide when to stop for a human").
 *
 * Outcome choices and agent thresholds live in the kv store ("rulePolicy").
 * Money, calendar and tolerance numbers stay in the signed standing mandate, so
 * an outside agent reading /gateway/v1/mandate sees the same limits.
 */
import type { Outcome } from "@aimo/contracts";
import { kvGet, kvSet } from "../db.js";

export type ParamKind = "pct" | "fraction" | "eur" | "days" | "number" | "grams" | "bool" | "weekdays" | "dates" | "products";

export type ParamDef = {
  key: string;
  /** Where the value lives: the signed mandate or the agent policy. */
  scope: "mandate" | "policy";
  label: string;
  help?: string;
  kind: ParamKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** A null value is allowed and means this (e.g. "Always ask"). */
  nullLabel?: string;
};

export const PARAMS: Record<string, ParamDef> = {
  // Mandate (signed, visible to outside agents)
  spendCapEur: { key: "spendCapEur", scope: "mandate", label: "Spend cap per order", unit: "€ ex VAT", kind: "eur", min: 0, max: 1_000_000, step: 50 },
  blockedProducts: { key: "blockedProducts", scope: "mandate", label: "Blocked product codes", kind: "products" },
  deliveryDays: { key: "deliveryDays", scope: "mandate", label: "Delivery days", kind: "weekdays" },
  holidays: { key: "holidays", scope: "mandate", label: "No delivery on", kind: "dates" },
  unknownStockMaxLineEur: { key: "unknownStockMaxLineEur", scope: "mandate", label: "Continue without asking up to", unit: "€ a line", kind: "eur", min: 0, max: 100_000, step: 10, nullLabel: "Always ask" },
  partialFillMaxShortPct: { key: "partialFillMaxShortPct", scope: "mandate", label: "Accept a short order up to", unit: "% short", kind: "pct", min: 0, max: 100, step: 1, nullLabel: "Always ask" },
  overshootMaxPct: { key: "overshootMaxPct", scope: "mandate", label: "Extra from pack rounding up to", unit: "%", kind: "pct", min: 0, max: 100, step: 1, help: "Asks only when both limits are passed." },
  overshootMaxEur: { key: "overshootMaxEur", scope: "mandate", label: "or extra cost up to", unit: "€", kind: "eur", min: 0, max: 10_000, step: 5 },
  priceRiseMaxPct: { key: "priceRiseMaxPct", scope: "mandate", label: "Accept price rises up to", unit: "%", kind: "pct", min: 0, max: 100, step: 1 },
  guestChangeMaxPct: { key: "guestChangeMaxPct", scope: "mandate", label: "Apply guest changes up to", unit: "± %", kind: "pct", min: 0, max: 100, step: 1 },
  // Agent policy
  typeYesMin: { key: "typeYesMin", scope: "policy", label: "Count as the right type from", unit: "% sure", kind: "fraction", min: 0.5, max: 0.99, step: 0.01 },
  typeNoMax: { key: "typeNoMax", scope: "policy", label: "Leave out below", unit: "% sure", kind: "fraction", min: 0.01, max: 0.5, step: 0.01 },
  urgentDays: { key: "urgentDays", scope: "policy", label: "Stock is binding within", unit: "days of delivery", kind: "days", min: 0, max: 60, step: 1 },
  packDisagreePct: { key: "packDisagreePct", scope: "policy", label: "Flag pack-size disagreement above", unit: "%", kind: "pct", min: 1, max: 50, step: 1 },
  perGuestMaxKg: { key: "perGuestMaxKg", scope: "policy", label: "Ask above", unit: "kg or L a guest", kind: "number", min: 0.1, max: 20, step: 0.1 },
  perGuestMinG: { key: "perGuestMinG", scope: "policy", label: "Ask below", unit: "g or ml a guest", kind: "grams", min: 0.1, max: 100, step: 0.1 },
  reliabilityAmber: { key: "reliabilityAmber", scope: "policy", label: "Note reliability below", unit: "%", kind: "fraction", min: 0.5, max: 1, step: 0.01 },
  reliabilityAsk: { key: "reliabilityAsk", scope: "policy", label: "Ask when reliability is below", unit: "%", kind: "fraction", min: 0, max: 1, step: 0.01 },
  silenceFlagsValioAimo: { key: "silenceFlagsValioAimo", scope: "policy", label: "Also flag the line to Valio Aimo", kind: "bool" },
};

export type PolicyParams = {
  typeYesMin: number;
  typeNoMax: number;
  urgentDays: number;
  packDisagreePct: number;
  perGuestMaxKg: number;
  perGuestMinG: number;
  reliabilityAmber: number;
  reliabilityAsk: number;
  silenceFlagsValioAimo: boolean;
};

export const DEFAULT_PARAMS: PolicyParams = {
  typeYesMin: 0.9,
  typeNoMax: 0.1,
  urgentDays: 4,
  packDisagreePct: 5,
  perGuestMaxKg: 1,
  perGuestMinG: 1,
  reliabilityAmber: 0.95,
  reliabilityAsk: 0.8,
  silenceFlagsValioAimo: true,
};

export type Control = {
  /** Outcomes the hotel may pick. The first is the default. One entry = locked. */
  choices: Outcome[];
  /** Why the outcome can't change. */
  lock?: string;
  /** Numbers and lists that decide when the rule fires. */
  params?: string[];
  /** Plain-language name of each choice for this rule, when the generic one reads badly. */
  names?: Partial<Record<Outcome, string>>;
  /** False when nothing in this build fires the rule yet. */
  active?: boolean;
};

const SAFETY = "Safety floor: never ordered and never approved through.";
const NEED_ANSWER = "The agent can't continue without this answer.";
const RECORD = "Records what already happened; there is nothing to decide.";

export const CONTROLS: Record<string, Control> = {
  "ALG-01": { choices: ["block"], lock: SAFETY },
  "ALG-02": { choices: ["block"], lock: SAFETY },
  "ALG-03": { choices: ["ask_chef"], lock: "D35: only the chef can explicitly continue with missing data. The concern remains; safety is never confirmed." },
  "ALG-04": { choices: ["block"], lock: SAFETY },
  "ALG-10": { choices: ["block"], lock: SAFETY },
  "DIET-01": { choices: ["block"], lock: SAFETY },
  "DIET-02": { choices: ["block"], lock: "The product data contradicts itself." },
  "DIET-03": { choices: ["block"], lock: "Diet counts must be fixed before anything is ordered." },
  "DIET-04": { choices: ["block"], lock: "No product is left to order." },
  "DIET-05": { choices: ["order", "ask_chef", "block"], names: { order: "Accept", ask_chef: "Ask chef", block: "Require claim" } },
  "ORG-01": { choices: ["block", "ask_chef"] },
  "LBL-01": { choices: ["block", "ask_chef"] },
  "TYP-01": { choices: ["ask_chef", "order", "block"], params: ["typeYesMin", "typeNoMax"], names: { order: "Use it", block: "Leave out" } },
  "TYP-02": { choices: ["order"], lock: "A product the check rejects is left out; set the threshold instead.", params: ["typeNoMax"], names: { order: "Leave out" } },
  "STK-01": { choices: ["ask_chef", "order", "block"], params: ["unknownStockMaxLineEur"], names: { order: "Continue" } },
  "STK-02": { choices: ["ask_approver", "order", "block"], params: ["partialFillMaxShortPct"], names: { order: "Accept short" } },
  "STK-03": { choices: ["order"], lock: RECORD },
  "STK-04": { choices: ["block"], lock: "An urgent delivery can't exceed real stock.", params: ["urgentDays"] },
  "STK-05": { choices: ["order"], lock: "Information only: today's stock is no promise months ahead.", params: ["urgentDays"] },
  "DLV-01": { choices: ["block"], lock: "No delivery date exists." },
  "DLV-02": { choices: ["block"], lock: "Valio Aimo blocks the sale." },
  "DLV-03": { choices: ["ask_approver", "ask_chef", "block"] },
  "DLV-04": { choices: ["order", "ask_chef"], params: ["deliveryDays", "holidays"] },
  "DLV-05": { choices: ["block"], lock: "Delivery sites are part of the signed mandate." },
  "DLV-06": { choices: ["block"], lock: "Nothing can arrive in time." },
  "CUT-01": { choices: ["block"], lock: "Valio Aimo can't take the order after its cut-off." },
  "CUT-02": { choices: ["block"], lock: "Valio Aimo can't change the line after its cut-off." },
  "PRC-01": { choices: ["block"], lock: "Fixed prices only: no price, no order." },
  "PRC-02": { choices: ["ask_approver", "ask_chef", "order", "block"] },
  "PRC-03": { choices: ["ask_approver"], lock: "A rise above the limit always goes to an approver; set the limit.", params: ["priceRiseMaxPct"] },
  "QTY-01": { choices: ["ask_approver", "ask_chef", "block"], params: ["overshootMaxPct", "overshootMaxEur"] },
  "QTY-02": { choices: ["ask_chef", "order"], params: ["perGuestMaxKg", "perGuestMinG"], names: { order: "Trust it" } },
  "QTY-03": { choices: ["ask_chef", "order", "block"], names: { order: "Trust name" } },
  "QTY-04": { choices: ["order", "ask_chef"], params: ["packDisagreePct"], names: { order: "Use API figure" } },
  "QTY-05": { choices: ["ask_chef", "block"] },
  "QTY-06": { choices: ["order", "ask_chef"], params: ["overshootMaxPct", "overshootMaxEur"] },
  "REL-01": { choices: ["order", "ask_chef", "ask_approver"], params: ["reliabilityAmber"], names: { order: "Note it" } },
  "REL-02": { choices: ["ask_approver", "ask_chef", "order", "block"], params: ["reliabilityAsk"] },
  "SUB-01": { choices: ["ask_chef", "ask_approver", "order", "block"], names: { order: "Accept swap", block: "Never swap" } },
  "SUB-02": { choices: ["order", "ask_chef"], names: { order: "Reuse", ask_chef: "Ask again" } },
  "SUB-03": { choices: ["order", "ask_chef"], active: false },
  "REQ-01": { choices: ["ask_chef"], lock: NEED_ANSWER, active: false },
  "REQ-02": { choices: ["ask_chef"], lock: NEED_ANSWER },
  "REQ-03": { choices: ["ask_chef"], lock: NEED_ANSWER },
  "REQ-04": { choices: ["ask_chef"], lock: "The code isn't in the catalogue." },
  "REQ-05": { choices: ["ask_chef"], lock: "\"None\" has to be stated, not assumed." },
  "REQ-06": { choices: ["ask_chef"], lock: NEED_ANSWER },
  "MAN-01": { choices: ["ask_approver", "block"], params: ["spendCapEur"] },
  "MAN-02": { choices: ["ask_approver", "block"], params: ["blockedProducts"] },
  "MAN-03": { choices: ["block"], lock: "Access is set per person, not per rule.", active: false },
  "MAN-04": { choices: ["block"], lock: "An approval is bound to one exact quote." },
  "CHG-01": { choices: ["order", "ask_approver"], params: ["guestChangeMaxPct"], names: { order: "Apply", ask_approver: "Always ask" } },
  "CHG-02": { choices: ["ask_approver", "block"], params: ["guestChangeMaxPct"], names: { block: "Refuse" } },
  "FIN-01": { choices: ["order"], lock: RECORD },
  "FIN-02": { choices: ["ask_chef"], lock: "The person building the order must answer before the cut-off." },
  "SIL-01": { choices: ["order"], lock: "The order stays as last approved; nothing is added or removed.", params: ["silenceFlagsValioAimo"], names: { order: "Keep as approved" } },
};

export type StoredPolicy = {
  outcomes: Record<string, Outcome>;
  params: Partial<PolicyParams>;
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

const KEY = "rulePolicy";
const empty = (): StoredPolicy => ({ outcomes: {}, params: {}, version: 0, updatedBy: null, updatedAt: null });

export function storedPolicy(): StoredPolicy {
  return { ...empty(), ...(kvGet<StoredPolicy>(KEY) ?? {}) };
}

export function savePolicy(p: StoredPolicy) {
  kvSet(KEY, p);
}

export function policyParams(): PolicyParams {
  return { ...DEFAULT_PARAMS, ...storedPolicy().params };
}

/** The hotel's chosen outcome, if it is one of the rule's allowed choices. */
export function chosenOutcome(id: string, fallback: Outcome): Outcome {
  const c = CONTROLS[id];
  const o = storedPolicy().outcomes[id];
  return o && c && c.choices.includes(o) ? o : fallback;
}
