/** Select original supplier terms, never a requested-date projection. */
import type { FiredRule, LookupLine, Mandate } from "@aimo/contracts";
import { fire } from "./catalogue.js";
import { isCalendarDate, parseAimoTime } from "../util.js";

export function supplierDelivery(line: LookupLine, neededBy: string, mandate: Pick<Mandate, "deliveryDays" | "holidays">, quantity: number, at: Date): { line: LookupLine; rules: FiredRule[] } {
  const evidence = line.availabilityEvidence;
  const rules: FiredRule[] = [];
  if (!evidence?.schedules.length) return { line: { ...line, deliverable: false }, rules };
  const unblocked = evidence.schedules.filter((s) => !s.salesBlock);
  const dated = unblocked.filter((s) => s.availableDate && isCalendarDate(s.availableDate));
  const onCalendar = dated.filter((s) => mandate.deliveryDays.includes(new Date(`${s.availableDate}T12:00:00Z`).getUTCDay())
    && !mandate.holidays.includes(s.availableDate!));
  const eligible = onCalendar.filter((s) => s.availableDate! <= neededBy);
  if (!eligible.length) rules.push(fire("DLV-06", {
    productId: line.productId, neededByText: neededBy,
    earliestText: onCalendar.map((s) => s.availableDate).sort()[0] ?? "not confirmed on the hotel's agreed delivery calendar",
    reason: "No original supplier schedule meets the needed-by date and the hotel's delivery calendar",
  }));
  const cutoff = (s: typeof evidence.schedules[number]) => s.closingTime && isCalendarDate(s.closingTime.slice(0, 10))
    && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s.closingTime) ? parseAimoTime(s.closingTime)?.getTime() ?? -Infinity : -Infinity;
  const open = eligible.filter((s) => cutoff(s) > at.getTime());
  // Alternative schedules are never added together. Prefer a full known amount,
  // then unconfirmed stock; the existing stock rules still govern the latter.
  const options = open.length ? open : eligible.length ? eligible : unblocked;
  const full = options.filter((s) => s.stock.kind === "known" && s.stock.amount >= quantity);
  const unknown = options.filter((s) => s.stock.kind === "unknown");
  const selected = [...(full.length ? full : unknown.length ? unknown : options)].sort((a, b) => cutoff(b) - cutoff(a))[0] ?? evidence.schedules[0];
  if (!Number.isFinite(cutoff(selected))) rules.push(fire("DLV-01", { product: line.productId, productId: line.productId, reason: "missing or invalid original supplier cutoff" }));
  return { line: {
    ...line, availableDate: selected.availableDate, closingTime: selected.closingTime,
    stock: selected.stock, salesUnit: selected.salesUnit,
    salesBlock: evidence.salesBlock || selected.salesBlock,
    deliverable: !evidence.salesBlock && !selected.salesBlock,
  }, rules };
}
