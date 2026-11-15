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

/** Latest proven full-quantity option per item, then the earliest cutoff across items.
 * Schedule amounts are alternatives, never assumed to be additive inventory.
 * Earlier supplier availability is valid for delivery by the intended date; its cutoff is never shifted.
 */
export function orderDeadline(items: DeadlineItem[], deliveryDate: string, at: Date): OrderDeadline {
  const usesFixtures = items.some((item) => item.source === "fixture");
  const result = (state: OrderDeadline["state"], reason: string): OrderDeadline => ({ state, at: null, reason, usesFixtures });
  if (!validDate(deliveryDate)) return result("unknown", "The order delivery date is missing or invalid.");
  if (!items.length) return result("unknown", "Add items to establish an ordering deadline.");
  const groups = new Map<string, DeadlineItem[]>();
  for (const item of items) {
    if (!item.productId || !item.salesUnit || !Number.isInteger(item.quantity) || item.quantity <= 0 || !validDate(item.deliveryDate))
      return result("unknown", "An item is missing its product, sales quantity or intended delivery date.");
    if (item.deliveryDate > deliveryDate) return result("unavailable", "Some items are scheduled after the order delivery date.");
    const key = `${item.productId}:${item.salesUnit}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const cutoffs: number[] = [];
  let unknown = false;
  for (const group of groups.values()) {
    const quantity = group.reduce((sum, item) => sum + item.quantity, 0);
    const neededBy = group.map((item) => item.deliveryDate!).sort()[0];
    // Each saved snapshot must support the combined quantity. Never pick an older,
    // more optimistic snapshot over a conflicting one in another basket request.
    for (const item of group) {
      const evidence = item.availabilityEvidence;
      if (!evidence) { unknown = true; continue; }
      if (evidence.salesBlock || !evidence.schedules.length)
        return result("unavailable", "A supplier has blocked an item or offered no delivery schedules.");
      const feasible: number[] = [];
      let incomplete = false;
      for (const schedule of evidence.schedules) {
        if (schedule.salesBlock) continue;
        if (!validDate(schedule.availableDate) || !schedule.salesUnit) { incomplete = true; continue; }
        if (schedule.availableDate > neededBy || schedule.salesUnit !== item.salesUnit) continue;
        if (schedule.stock.kind !== "known") { incomplete = true; continue; }
        if (!Number.isFinite(schedule.stock.amount) || schedule.stock.amount < 0) { incomplete = true; continue; }
        if (schedule.stock.amount < quantity) continue;
        // Explicit offsets avoid interpreting a supplier's local time in the server's timezone.
        const cutoff = schedule.closingTime && validDate(schedule.closingTime.slice(0, 10)) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(schedule.closingTime)
          ? parseAimoTime(schedule.closingTime) : null;
        if (!cutoff) { incomplete = true; continue; }
        const cutoffDate = helsinkiDate.format(cutoff);
        if (cutoffDate > neededBy) { incomplete = true; continue; }
        feasible.push(cutoff.getTime());
      }
      if (feasible.length) cutoffs.push(Math.max(...feasible));
      else if (incomplete) unknown = true;
      else return result("unavailable", "No supplier schedule covers the full quantity in its sales unit by the delivery date.");
    }
  }
  if (unknown || !cutoffs.length) return result("unknown", "Supplier stock, schedules or cutoffs are not confirmed for every item. Refresh the item terms before ordering.");
  const deadline = Math.min(...cutoffs);
  return { state: deadline <= at.getTime() ? "expired" : "known", at: new Date(deadline).toISOString(), reason: null, usesFixtures };
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
  return !!placedAt && ["placed", "amended", "checked", "locked"].includes(order.state) && validDate(order.deliveryDate) && !order.flags.length && lines.length > 0
    && lines.every((line) => line.outcome !== "block" && !!line.salesUnit && Number.isInteger(line.quantity) && line.quantity > 0
      && validDate(line.availableDate) && line.availableDate <= order.deliveryDate
      && line.stock.kind === "known" && Number.isFinite(line.stock.amount) && line.stock.amount >= order.lines
        .filter((other) => !other.removed && other.productId === line.productId && other.salesUnit === line.salesUnit)
        .reduce((sum, other) => sum + other.quantity, 0))
    && orderDeadline(lines.map((line) => ({ ...line, deliveryDate: order.deliveryDate })), order.deliveryDate, placedAt).state === "known";
}

export function basketStatus(deliveryDate: string, orders: Order[], plans: Plan[], questions: Question[], at: Date, hasWarnings = false): BasketStatus {
  const live = orders.filter((order) => order.state !== "rejected");
  const active = plans.filter((plan) => plan.status !== "rejected" && plan.tooLateChoice !== "removed" && !plan.reviewing);
  const pending = active.filter((plan) => !plan.orderIds.length);
  const items: DeadlineItem[] = [
    ...live.flatMap((order) => order.lines.filter((line) => !line.removed).map((line) => ({ ...line, deliveryDate: order.deliveryDate }))),
    ...pending.flatMap((plan) => plan.lines.filter((line) => !line.removed).map((line) => ({ ...line, deliveryDate: plan.deliveryDate }))),
  ];
  const ids = new Set(live.map((order) => order.id));
  const confirmed = validDate(deliveryDate) && live.length > 0 && live.every((order) => order.deliveryDate <= deliveryDate && isConfirmedOrder(order))
    && !pending.length && !pendingQuestions(questions, at).length
    && !hasWarnings && active.every((plan) => plan.status === "ordered" && plan.orderIds.every((id) => ids.has(id)));
  const orderBy = pending.some((plan) => !plan.lines.some((line) => !line.removed))
    ? { state: "unknown" as const, at: null, reason: "Some requested items have no supplier terms yet.", usesFixtures: items.some((item) => item.source === "fixture") }
    : orderDeadline(items, deliveryDate, at);
  return { orderBy, confirmed };
}
