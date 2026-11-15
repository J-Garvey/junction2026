import type { Need, Plan } from "@aimo/contracts";
import { now } from "../clock.js";
import { parseAimoTime, sha256, stableStringify } from "../util.js";

/** A manual sales quantity belongs to this exact request, not a later edit. */
export function quantityScope(need: Need): string {
  return sha256(stableStringify([need.amount, need.constraints, need.query, need.pinnedProductId, need.neededBy]));
}

/** Recalculate after every lookup/edit; retain decisions only while their terms match. */
export function refreshItemReviews(plan: Plan): void {
  if (!plan.itemReviews || !plan.request) return;
  plan.itemReviews = plan.request.lines.map((request) => {
    const need = plan.needs.find((n) => n.id === request.id);
    const lines = plan.lines.filter((line) => !line.removed && line.needIds.includes(request.id));
    const rules = [...(need?.rules ?? []), ...lines.flatMap((line) => line.rules)];
    const hard = [...plan.inputRules, ...rules].find((r) => r.outcome !== "order" && (r.outcome === "block" || !r.overridable));
    const quantityRequired = lines.some((line) => !!line.productId && line.quantity <= 0 && !!line.salesUnit);
    const reason = hard?.message ?? (lines.some((line) => line.rules.some((r) => r.ruleId === "ALG-03") && !line.allergenDataAcknowledgement)
      ? "The chef must explicitly continue with allergen data not confirmed or pick another product."
      : !need || !lines.length || lines.some((line) => !line.productId) ? "Refine or discard this item to find a matching product."
      : lines.some((line) => !line.availableDate || !line.closingTime || (parseAimoTime(line.closingTime)?.getTime() ?? 0) <= now().getTime()) ? "Delivery or the order cutoff needs checking."
      : lines.some((line) => line.unitPrice === null) ? "A price is required before approving this item."
      : quantityRequired ? "Enter the number of sales units to order, then check the quantity."
      : lines.some((line) => line.quantity <= 0) ? "A sales quantity is required before approving this item."
      : plan.error);
    const fingerprint = sha256(stableStringify({
      siteId: plan.siteId, outletId: plan.outletId, deliveryDate: plan.deliveryDate, neededBy: plan.neededBy,
      request, rules, lines: lines.map((line) => ({
        productId: line.productId, outletId: line.outletId, needIds: line.needIds, quantity: line.quantity,
        unitPrice: line.unitPrice, lineTotal: line.lineTotal, salesUnit: line.salesUnit, packContent: line.packContent,
        stock: line.stock, availableDate: line.availableDate, closingTime: line.closingTime, availabilityEvidence: line.availabilityEvidence,
      })),
    }));
    const prior = plan.itemReviews!.find((item) => item.needId === request.id);
    const previous = prior?.fingerprint === fingerprint ? prior : undefined;
    const exactMatch = !reason && !!need && lines.length === 1
      && [...plan.inputRules, ...rules].every((rule) => rule.outcome === "order")
      && lines.every((line) => line.status === "covered" && line.needIds.length === 1
        && line.stock?.kind === "known" && line.stock.amount >= line.quantity
        && !!line.availableDate && line.availableDate <= (plan.neededBy ?? plan.deliveryDate ?? "")
        && !!line.packContent?.verified && line.packContent.unit === need.amount.unit
        && Math.abs(line.packContent.value * line.quantity - need.amount.value) < 1e-6
        && (!line.overshoot || line.overshoot.amount === 0));
    // A changed quote needs a fresh decision even if the product still matches.
    // Keep that requirement across save/recheck until its current terms are approved.
    const requiresApproval = !exactMatch || (!!prior?.canApprove && (!previous || previous.requiresApproval !== false));
    return {
      needId: request.id, fingerprint, canApprove: !reason, quantityRequired, reason: reason ?? null,
      requiresApproval,
      approvedBy: !reason ? previous?.approvedBy ?? null : null,
      approvedAt: !reason ? previous?.approvedAt ?? null : null,
    };
  });
}

export function allItemsResolved(plan: Plan): boolean {
  refreshItemReviews(plan);
  return !!plan.itemReviews?.length && plan.itemReviews.every((item) => item.canApprove && (item.requiresApproval === false || item.approvedAt));
}
