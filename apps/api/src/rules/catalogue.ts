/**
 * SF-03: every hard rule and hotel policy check as code with a stable ID.
 * Converted from docs/human-approval-rules.md (Q05.1, Q05.10). The message
 * templates are the floor for every explanation (Q09.4): the model may only
 * rephrase them.
 */
import type { FiredRule, Outcome } from "@aimo/contracts";
import { CONTROLS, chosenOutcome, policyParams } from "./policy.js";

export type RuleDef = {
  id: string;
  /** One to three words, shown on screen; the template is the full sentence behind it. */
  label: string;
  area: string;
  outcome: Outcome;
  /** Hard rules can never be approved through (AP-04). */
  hard: boolean;
  who: "chef" | "approver" | "nobody";
  trigger: string;
  template: string;
};

const R = (id: string, area: string, outcome: Outcome, hard: boolean, trigger: string, template: string): RuleDef => ({
  id,
  label: LABELS[id] ?? id,
  area,
  outcome,
  hard,
  who: outcome === "ask_chef" ? "chef" : outcome === "ask_approver" ? "approver" : "nobody",
  trigger,
  template,
});

const LABELS: Record<string, string> = {
  "ALG-01": "Contains allergen",
  "ALG-02": "May contain allergen",
  "ALG-03": "Allergen data not confirmed",
  "ALG-04": "Allergen undeclared",
  "ALG-10": "Allergy conflict",
  "DIET-01": "Diet not met",
  "DIET-02": "Claim contradicts",
  "DIET-03": "Diet count too high",
  "DIET-04": "Nothing passes",
  "DIET-05": "Diet by declaration",
  "ORG-01": "Wrong origin",
  "LBL-01": "Label missing",
  "TYP-01": "Type unsure",
  "TYP-02": "Wrong type",
  "STK-01": "Stock not confirmed",
  "STK-02": "Partial stock",
  "STK-03": "Continued",
  "STK-04": "Not enough stock",
  "STK-05": "Stock info only",
  "DLV-01": "Not deliverable",
  "DLV-02": "Sales block",
  "DLV-03": "Arrives late",
  "DLV-04": "Date moved",
  "DLV-05": "Site not allowed",
  "DLV-06": "Not in time",
  "CUT-01": "Cut-off passed",
  "CUT-02": "Locked",
  "PRC-01": "No price",
  "PRC-02": "Price expires",
  "PRC-03": "Price changed",
  "QTY-01": "Overshoot",
  "QTY-02": "Odd quantity",
  "QTY-03": "Pack size guessed",
  "QTY-04": "Pack size checked",
  "QTY-05": "Unit mismatch",
  "QTY-06": "Rounded up",
  "REL-01": "Reliability",
  "REL-02": "Low reliability",
  "SUB-01": "Substitute",
  "SUB-02": "Remembered swap",
  "SUB-03": "Same product",
  "REQ-01": "Which product?",
  "REQ-02": "How much?",
  "REQ-03": "When?",
  "REQ-04": "Unknown product",
  "REQ-05": "Diets?",
  "REQ-06": "How many guests?",
  "MAN-01": "Over spend cap",
  "MAN-02": "Blocked product",
  "MAN-03": "Not allowed",
  "MAN-04": "Approval mismatch",
  "CHG-01": "Within tolerance",
  "CHG-02": "Over tolerance",
  "FIN-01": "Covered",
  "FIN-02": "Short",
  "SIL-01": "Unanswered",
};

export const RULES: RuleDef[] = [
  // Allergens: block, always
  R("ALG-01", "Allergens", "block", true, "Product contains an allergen the line must avoid", "{product} contains {allergen}, which {group} must avoid."),
  R("ALG-02", "Allergens", "block", true, "Product may contain an allergen the line must avoid", "{product} may contain {allergen}, which {group} must avoid."),
  R("ALG-03", "Allergens", "ask_chef", false, "No allergen declaration on a line with an allergy (D35)", "{product}: allergen data not confirmed for {allergen}. The chef must decide whether to continue; this does not confirm safety for {group}."),
  R("ALG-04", "Allergens", "block", true, "Product explicitly lists a requested allergen as UNDECLARED (Q02.3)", "{product} lists {allergen} as UNDECLARED, which does not meet the allergy requirements for {group}."),
  R("ALG-10", "Allergens", "block", true, "A new allergy makes an ordered line unsafe (D28)", "{product} contains {allergen}. {count} guests at {event} must avoid it. This line is still in the order."),
  // Diets
  R("DIET-01", "Diets", "block", true, "Product lacks a required diet claim and its declaration can't confirm it", "{product} has no {claim} claim, and its allergen declaration can't confirm it."),
  R("DIET-02", "Diets", "block", true, "Lactose-free claim, but lactose listed as contained", "{product} claims lactose-free but lists lactose as an ingredient."),
  R("DIET-03", "Diets", "block", true, "Diet counts add up to more than the guest total", "Diet groups add up to {dietTotal} guests, more than the {guests} guests at the event."),
  R("DIET-04", "Diets", "block", true, "No candidate passes the line's diet and allergen rules", "No product for {need} passes {rules}. The last candidates were removed by {filter}."),
  R("DIET-05", "Diets", "order", true, "Diet met by declaration, not by claim", "{product} has no {claim} claim; its allergen declaration lists none of {codes}."),
  R("ORG-01", "Sourcing", "block", true, "Required origin not met", "{product} is from {origin}, not {required}."),
  R("LBL-01", "Sourcing", "block", true, "Required label missing", "{product} lacks the required label {label}."),
  // Product type (model judgement)
  R("TYP-01", "Product type", "ask_chef", false, "Model unsure whether the product is the type asked for", "Is {product} the {type} you need? The check was unsure ({probability})."),
  R("TYP-02", "Product type", "order", false, "Model says the product is not the type asked for", "{product} is not {type} ({probability}); left out."),
  // Stock
  R("STK-01", "Stock", "ask_chef", false, "Stock reported as unknown (sentinel); the person building the order decides (D31)", "Valio Aimo can't confirm stock for {product}. Continue with it?"),
  R("STK-02", "Stock", "ask_approver", false, "Suitable products together don't cover the need", "Real stock covers {covered} of {need}. {short} would be short."),
  R("STK-03", "Stock", "order", false, "Hotel chose to continue with unconfirmed stock", "{by} chose to continue with {product} on {at}; its stock is still not confirmed."),
  R("STK-04", "Stock", "block", true, "Ordered quantity exceeds real stock on an urgent delivery", "{product}: {quantity} {unit} ordered, {stock} in stock for {date}."),
  R("STK-05", "Stock", "order", false, "Stock shown as information only, months ahead (D8)", "Today's stock, not a promise for your date: {stock}."),
  // Delivery
  R("DLV-01", "Delivery", "block", true, "Product has no delivery dates (empty scheduleLines)", "{product} can't be delivered: Valio Aimo returned no delivery dates."),
  R("DLV-02", "Delivery", "block", true, "Sales block", "{product} is blocked from sale."),
  R("DLV-03", "Delivery", "ask_approver", false, "Offered delivery date is after the needed-by date", "{product} arrives {available}, after it is needed on {neededBy}."),
  R("DLV-04", "Delivery", "order", false, "Needed-by date moved to an agreed delivery day", "Needed by {neededBy}: moved back from {original}, which isn't a delivery day."),
  R("DLV-05", "Delivery", "block", true, "Delivery site not in the hotel's mandate", "Site {site} is not one of the hotel's delivery sites."),
  R("DLV-06", "Delivery", "block", true, "Every product that passes the other checks misses the needed-by date (arrives late or its cut-off has passed)", "No products available for delivery by {neededByText}. The earliest delivery is {earliestText}."),
  // Cut-off
  R("CUT-01", "Cut-off", "block", true, "Order cut-off has passed, whatever date the mock shows", "The cut-off for {product} was {cutoff}. It has passed, although the mock still shows {available}."),
  R("CUT-02", "Cut-off", "block", true, "Change requested after the line's cut-off", "{product} can't change: its cut-off was {cutoff}."),
  // Price
  R("PRC-01", "Price", "block", true, "No price (price lookup error)", "{product} has no price, so it can't be ordered."),
  R("PRC-02", "Price", "ask_approver", false, "Price expires before the delivery date", "The price of {product} is valid until {validTo}, before delivery on {date}."),
  R("PRC-03", "Price", "ask_approver", false, "Price changed since the quote", "{product} now costs {newPrice}, was {oldPrice} ({pct})."),
  // Quantity
  R("QTY-01", "Quantity", "ask_approver", false, "Rounding overshoot above the hotel's tolerance", "Rounding {product} up to {packs} {unit} gives {overshoot} more than needed ({pct}, {eurOver})."),
  R("QTY-02", "Quantity", "ask_chef", false, "Quantity implausible for the guest count", "{amount} per guest of {need} looks like a unit slip. Did you mean {suggest}?"),
  R("QTY-03", "Quantity", "ask_chef", false, "Pack content guessed from the name and not verified", "The pack content of {product} comes from its name only ({content}); the price API can't confirm it."),
  R("QTY-04", "Quantity", "order", false, "Pack content formula and price API disagree by more than 5%", "Pack content of {product}: the catalogue says {formula}, the price API {api}. Using the API figure."),
  R("QTY-05", "Quantity", "ask_chef", false, "Recipe unit can't be converted to the product's unit", "{need} is given in {from}, but {product} is sold by {to}. Please restate the amount."),
  R("QTY-06", "Quantity", "order", false, "Rounded up to whole sales units within tolerance", "{need} rounded up to {packs} × {product} ({overshoot} over)."),
  // Reliability
  R("REL-01", "Reliability", "order", false, "Delivery reliability unknown or below 0.95", "{product} delivery reliability: {reliability}."),
  R("REL-02", "Reliability", "ask_approver", false, "Delivery reliability below 0.80", "{product} was delivered as ordered only {reliability} of the time. Order it anyway?"),
  // Substitutes
  R("SUB-01", "Substitutes", "ask_chef", false, "A substitute is a different product", "Will {dish} still work with {substitute} instead of {original}?"),
  R("SUB-02", "Substitutes", "order", false, "A remembered substitute approval applied", "{substitute} replaces {original} in {dish}, as {by} approved on {at}."),
  R("SUB-03", "Substitutes", "order", false, "Same product in a different pack", "{substitute} is {original} in a different pack."),
  // Request
  R("REQ-01", "Request", "ask_chef", false, "Product word covers several types", "\"{word}\" covers several products. Which one do you need?"),
  R("REQ-02", "Request", "ask_chef", false, "Missing quantity or unit", "How much {need} do you need?"),
  R("REQ-03", "Request", "ask_chef", false, "Missing, past or same-day date", "When do you need {need}?"),
  R("REQ-04", "Request", "ask_chef", false, "Unknown product code", "Product {product} is not in the Valio Aimo catalogue."),
  R("REQ-05", "Request", "ask_chef", false, "Allergies and diets not stated", "Are there allergies or diets for {event}? \"None\" has to be stated, not assumed."),
  R("REQ-06", "Request", "ask_chef", false, "Guest count missing or zero", "How many guests will {event} have?"),
  // Mandate
  R("MAN-01", "Mandate", "ask_approver", false, "Order total above the per-order spend cap", "The order totals {total} ex VAT, above the {cap} spend cap."),
  R("MAN-02", "Mandate", "ask_approver", false, "Product on the hotel's block list", "{product} is on the hotel's blocked list."),
  R("MAN-03", "Mandate", "block", true, "Caller not allowed for this hotel or site", "{actor} can't order for {site}."),
  R("MAN-04", "Mandate", "block", true, "Approval doesn't match the quote", "The approval was given for a different quote or quote version."),
  // Changes
  R("CHG-01", "Changes", "order", false, "Guest change within tolerance", "Guests {from} → {to} ({pct}), within the {tolerance} the hotel allows."),
  R("CHG-02", "Changes", "ask_approver", false, "Guest change outside tolerance", "Guests {from} → {to} ({pct}), more than the {tolerance} the hotel allows."),
  // Final check and silence
  R("FIN-01", "Final check", "order", false, "Final check passed", "{product}: stock, delivery date, price and cut-off rechecked."),
  R("FIN-02", "Final check", "ask_chef", false, "Short at the final check", "{product}: {stock} in stock, {quantity} ordered. Answer by {cutoff}."),
  R("SIL-01", "Silence", "order", false, "Unanswered at the cut-off: order stays as last approved (D9)", "Nobody answered by {cutoff}. The line stays as last approved{told}."),
];

export const RULE_INDEX = new Map(RULES.map((r) => [r.id, r]));

export function fill(template: string, facts: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (facts[k] === undefined || facts[k] === null ? `{${k}}` : String(facts[k])));
}

/** Fire one rule: its outcome, the filled template and the facts it tested. */
export function fire(id: string, facts: Record<string, unknown>): FiredRule {
  const def = RULE_INDEX.get(id);
  if (!def) throw new Error(`Unknown rule ${id}`);
  const outcome = outcomeOf(id);
  // A hotel that turns a rule into a question can answer it; a block never can.
  const overridable = outcome !== "block" && (!def.hard || outcome !== def.outcome);
  return { ruleId: id, label: def.label, outcome, message: fill(def.template, facts), facts, overridable };
}

/** The outcome this hotel set for a rule (RULE-POLICY), else the catalogue default. */
export function outcomeOf(id: string): Outcome {
  const def = RULE_INDEX.get(id);
  if (!def) throw new Error(`Unknown rule ${id}`);
  return chosenOutcome(id, def.outcome);
}

/** The catalogue as the hotel has set it: each rule's current outcome, its default and its controls. */
export function rulesView() {
  return RULES.map((r) => ({ ...r, outcome: outcomeOf(r.id), defaultOutcome: r.outcome, control: CONTROLS[r.id] ?? { choices: [r.outcome] } }));
}

const RANK: Record<Outcome, number> = { order: 0, ask_approver: 1, ask_chef: 2, block: 3 };

/** OUTCOME-RESOLVE: block beats ask-the-chef, which beats ask-the-approver, which beats order (Q05.2). */
export function resolveOutcome(rules: FiredRule[]): Outcome {
  let o: Outcome = "order";
  for (const r of rules) if (RANK[r.outcome] > RANK[o]) o = r.outcome;
  return o;
}

/** Hotel parameters vs product-fixed ones (Q05.10). */
export const FIXED = {
  // Hotel-tunable thresholds (RULE-POLICY): read live, so a change applies to the next check.
  get decisionFact() { return policyParams().typeYesMin; },
  get decisionReject() { return policyParams().typeNoMax; },
  get reliabilityAmber() { return policyParams().reliabilityAmber; },
  get reliabilityAsk() { return policyParams().reliabilityAsk; },
  get urgentDays() { return policyParams().urgentDays; },
  get packDisagreePct() { return policyParams().packDisagreePct; },
  get perGuestMax() { return policyParams().perGuestMaxKg; }, // kg or L
  get perGuestMin() { return policyParams().perGuestMinG / 1000; },
  finalCheckHoursBefore: 24,
  quoteMaxHours: 24,
  searchLimit: 50,
  candidatesShown: 3,
  lookupBatch: 1000,
};
