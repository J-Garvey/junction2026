/** D35: hotel context stays private; only an opaque digest crosses the gateway. */
import type { AllergenAcknowledgement, Constraints, EventSpec, Plan, PlanLine, Quote } from "@aimo/contracts";
import { now } from "../clock.js";
import { allergenName } from "../rules/checks.js";
import { sha256, stableStringify } from "../util.js";

export function eventAllergenScope(event: EventSpec): string {
  return sha256(stableStringify([event.siteId, event.serviceDate, event.guests, event.dietGroups, event.dishes]));
}

export function constraintsForLine(plan: Plan, line: PlanLine): Constraints {
  const needs = plan.needs.filter((n) => line.needIds.includes(n.id));
  return {
    claims: [...new Set(needs.flatMap((n) => n.constraints.claims))],
    avoidAllergens: [...new Set(needs.flatMap((n) => n.constraints.avoidAllergens))],
    labels: [...new Set(needs.flatMap((n) => n.constraints.labels))],
    ...(needs.find((n) => n.constraints.origin) ? { origin: needs.find((n) => n.constraints.origin)!.constraints.origin } : {}),
  };
}

export function lineAllergenScope(plan: Plan & { event?: EventSpec | null }, line: PlanLine): string | undefined {
  const needs = plan.needs.filter((n) => line.needIds.includes(n.id));
  if (!needs.some((n) => n.constraints.avoidAllergens.length)) return undefined;
  return sha256(stableStringify([plan.eventId, plan.event ? eventAllergenScope(plan.event) : null,
    needs.map((n) => [n.id, n.amount, n.guests, n.groupId, n.dishId, n.constraints, n.neededBy])]));
}

export function currentAllergenAcknowledgements(acknowledgements: AllergenAcknowledgement[] | undefined, quote: Pick<Quote, "fingerprint">) {
  return (acknowledgements ?? []).filter((a) => a.fingerprint === quote.fingerprint && new Date(a.expiresAt) > now());
}

export function missingAllergenProducts(quote: Quote, acknowledgements?: AllergenAcknowledgement[]) {
  const accepted = new Set(currentAllergenAcknowledgements(acknowledgements, quote).flatMap((a) => a.productIds));
  return quote.lines.filter((l) => l.rules.some((r) => r.ruleId === "ALG-03") && !accepted.has(l.productId));
}

export function allergenQuestionText(plan: Plan, productIds: string[]): string {
  return productIds.map((id) => {
    const lines = plan.lines.filter((l) => l.productId === id && !l.removed);
    const needs = plan.needs.filter((n) => n.constraints.avoidAllergens.length && lines.some((l) => l.needIds.includes(n.id)));
    const groups = new Map(needs.map((n) => [n.groupId, n.guests]));
    const count = [...groups.values()].every((n) => n !== null) ? [...groups.values()].reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
    const allergens = [...new Set(needs.flatMap((n) => n.constraints.avoidAllergens))].map(allergenName).join(", ");
    return `${lines[0]?.productName ?? id}: allergen data not confirmed. ${count === null ? "Guest count not supplied; this request must avoid" : `${count} guest${count === 1 ? "" : "s"} must avoid`} ${allergens}.`;
  }).join(" ") + " Continue with missing data or pick another product. Continuing does not confirm safety.";
}

export function applyAllergenAcknowledgements(plan: Plan & { overrides: { allergenAcknowledgements?: AllergenAcknowledgement[] } }, quote: Quote) {
  const current = currentAllergenAcknowledgements(plan.overrides.allergenAcknowledgements, quote);
  plan.overrides.allergenAcknowledgements = current;
  for (const line of plan.lines) {
    delete line.allergenDataAcknowledgement;
    const a = current.find((a) => a.productIds.includes(line.productId ?? ""));
    if (a && line.rules.some((r) => r.ruleId === "ALG-03")) {
      const { token: _token, productIds: _ids, expiresAt: _expiry, ...decision } = a;
      line.allergenDataAcknowledgement = decision;
    }
  }
}
