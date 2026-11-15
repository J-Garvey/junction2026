/** Read-only basket presentation, using saved supplier evidence and committed state. */
import type { AvailabilityEvidence, BasketStatus, Order, OrderDeadline, Plan, Question } from "@aimo/contracts";
import { isCalendarDate, parseAimoTime } from "../util.js";

export interface DeadlineItem {
  productId: string | null;
  quantity: number;
  salesUnit: string | null;
  deliveryDate: string | null;
  source: string | null;
  availabilityEvidence?: AvailabilityEvidence;
}

const validDate = (date: string | null): date is string => !!date && isCalendarDate(date);
const helsinkiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" });

/** Latest full-quantity option per item, then the earliest cutoff across dated items.
 * Schedule amounts are alternatives, never assumed to be additive inventory.
 * Earlier supplier availability is valid for delivery by the intended date; its cutoff is never shifted.
 * Unknown stock can supply timing evidence, but never confirms availability or fulfillment.
 */
export function orderDeadline(items: DeadlineItem[], deliveryDate: string, at: Date): OrderDeadline {
  const usesFixtures = items.some((item) => item.source === "fixture");
  let excludedItems = 0;
  let unconfirmedStockItems = 0;
  const result = (state: OrderDeadline["state"], reason: string): OrderDeadline => ({ state, at: null, reason, usesFixtures, excludedItems, unconfirmedStockItems });
  if (!validDate(deliveryDate)) return result("unknown", "The order delivery date is missing or invalid.");
  if (!items.length) return result("unknown", "Add items to establish an ordering deadline.");
  const groups = new Map<string, DeadlineItem[]>();
  let unavailable: string | null = null;
  for (const [index, item] of items.entries()) {
    if (validDate(item.deliveryDate) && item.deliveryDate > deliveryDate)
      unavailable = "Some items are scheduled after the order delivery date.";
    const key = item.productId && item.salesUnit ? `${item.productId}:${item.salesUnit}` : `unresolved:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const cutoffs: number[] = [];
  for (const group of groups.values()) {
    const quantity = group.reduce((sum, item) => sum + item.quantity, 0);
    const neededBy = group.map((item) => item.deliveryDate).filter(validDate).sort()[0] ?? deliveryDate;
    // Each saved snapshot must support the combined quantity. Never pick an older,
    // more optimistic snapshot over a conflicting one in another basket request.
    for (const item of group) {
      const evidence = item.availabilityEvidence;
      if (!evidence) { excludedItems++; continue; }
      if (evidence.salesBlock || !evidence.schedules.length) {
        unavailable = "A supplier has blocked an item or offered no delivery schedules.";
        continue;
      }
      const feasible: number[] = [];
      const unconfirmedStock: number[] = [];
      let incomplete = false;
      for (const schedule of evidence.schedules) {
        if (schedule.salesBlock) continue;
        // Known incompatibilities still count even if another field is missing.
        if (validDate(schedule.availableDate) && schedule.availableDate > neededBy) continue;
        if (schedule.salesUnit && item.salesUnit && schedule.salesUnit !== item.salesUnit) continue;
        const stockKnown = schedule.stock.kind === "known" && Number.isFinite(schedule.stock.amount) && schedule.stock.amount >= 0;
        if (stockKnown && schedule.stock.kind === "known" && schedule.stock.amount < quantity) continue;
        if (!validDate(schedule.availableDate) || !schedule.salesUnit) { incomplete = true; continue; }
        // Explicit offsets avoid interpreting a supplier's local time in the server's timezone.
        const cutoff = schedule.closingTime && validDate(schedule.closingTime.slice(0, 10)) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(schedule.closingTime)
          ? parseAimoTime(schedule.closingTime) : null;
        if (!cutoff) { incomplete = true; continue; }
        const cutoffDate = helsinkiDate.format(cutoff);
        if (cutoffDate > neededBy) continue;
        (stockKnown ? feasible : unconfirmedStock).push(cutoff.getTime());
      }
      // Prefer the existing proven full-quantity options. Only use stock-unknown
      // timing when no proven option exists, and keep that uncertainty explicit.
      const options = feasible.length ? feasible : unconfirmedStock;
      const completeItem = item.productId && item.salesUnit && Number.isInteger(item.quantity) && item.quantity > 0 && validDate(item.deliveryDate);
      if (options.length && completeItem) {
        cutoffs.push(Math.max(...options));
        if (!feasible.length) unconfirmedStockItems++;
      } else if (options.length || incomplete) excludedItems++;
      else unavailable = "No supplier schedule covers the full quantity in its sales unit by the delivery date.";
    }
  }
  if (unavailable) return result("unavailable", unavailable);
  if (!cutoffs.length) return result("unknown", "No ordering deadline can be calculated: delivery dates, schedules or cutoffs are unknown for all items. Their delivery remains unconfirmed. Refresh the item terms before ordering.");
  const deadline = Math.min(...cutoffs);
  const reason = unconfirmedStockItems ? `Stock is unconfirmed for ${unconfirmedStockItems} scheduled ${unconfirmedStockItems === 1 ? "item" : "items"}. The ordering deadline does not confirm stock or delivery; terms are rechecked when ordering.` : null;
  return { state: deadline <= at.getTime() ? "expired" : "known", at: new Date(deadline).toISOString(), reason, usesFixtures, excludedItems, unconfirmedStockItems };
}

export function pendingQuestions(questions: Question[], at: Date): Question[] {
  return questions.filter((q) => (q.state === "open" || q.state === "waiting")
    && (!q.deadline || (parseAimoTime(q.deadline)?.getTime() ?? 0) > at.getTime()));
}

export function approvalLevels(questions: Question[]) {
  return (["chef", "approver"] as const).map((role) => ({ role, count: questions.filter((q) => q.forRole === role).length })).filter((level) => level.count > 0);
}

/** Committing an unknown-stock line records a purchase, never confirmed fulfillment. */
export function isConfirmedOrder(order: Order): boolean {
  const lines = order.lines.filter((line) => !line.removed);
  const placedAt = parseAimoTime(order.placedAt);
  const deadline = placedAt && orderDeadline(lines.map((line) => ({ ...line, deliveryDate: order.deliveryDate })), order.deliveryDate, placedAt);
  return !!placedAt && ["placed", "amended", "checked", "locked"].includes(order.state) && validDate(order.deliveryDate) && !order.flags.length && lines.length > 0
    && lines.every((line) => line.outcome !== "block" && !!line.salesUnit && Number.isInteger(line.quantity) && line.quantity > 0
      && validDate(line.availableDate) && line.availableDate <= order.deliveryDate
      && !line.allergenDataAcknowledgement && !line.rules?.some((r) => r.ruleId === "ALG-03")
      && line.stock.kind === "known" && Number.isFinite(line.stock.amount) && line.stock.amount >= order.lines
        .filter((other) => !other.removed && other.productId === line.productId && other.salesUnit === line.salesUnit)
        .reduce((sum, other) => sum + other.quantity, 0))
    && !!deadline && deadline.state === "known" && !deadline.excludedItems && !deadline.unconfirmedStockItems;
}

export function basketStatus(deliveryDate: string, orders: Order[], plans: Plan[], questions: Question[], at: Date, hasWarnings = false): BasketStatus {
  const live = orders.filter((order) => order.state !== "rejected");
  const active = plans.filter((plan) => plan.status !== "rejected" && plan.tooLateChoice !== "removed" && !plan.reviewing);
  const pending = active.filter((plan) => !plan.orderIds.length);
  const items: DeadlineItem[] = [
    ...live.flatMap((order) => order.lines.filter((line) => !line.removed).map((line) => ({ ...line, deliveryDate: order.deliveryDate }))),
    ...pending.flatMap((plan) => plan.lines.filter((line) => !line.removed).map((line) => ({ ...line, deliveryDate: plan.deliveryDate }))),
    // Unresolved requests have no line terms yet, but must not hide other items' cutoffs.
    ...pending.filter((plan) => !plan.lines.some((line) => !line.removed)).flatMap((plan) =>
      Array.from({ length: Math.max(plan.needs?.length ?? 0, 1) }, () => ({ productId: null, quantity: 0, salesUnit: null, deliveryDate: plan.deliveryDate, source: null }))),
  ];
  const ids = new Set(live.map((order) => order.id));
  const confirmed = validDate(deliveryDate) && live.length > 0 && live.every((order) => order.deliveryDate <= deliveryDate && isConfirmedOrder(order))
    && !pending.length && !pendingQuestions(questions, at).length
    && !hasWarnings && active.every((plan) => plan.status === "ordered" && plan.orderIds.every((id) => ids.has(id)));
  const orderBy = orderDeadline(items, deliveryDate, at);
  return { orderBy, confirmed: confirmed && !orderBy.excludedItems && !orderBy.unconfirmedStockItems && (orderBy.state === "known" || orderBy.state === "expired") };
}
