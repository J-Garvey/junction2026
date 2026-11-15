/** Product-level evidence only. No quantities, buying state or projected delivery promises. */
import type { LookupLine, ProductInspection } from "@aimo/contracts";
import { cutoffRule, priceValidityRule } from "../rules/checks.js";
import { fire } from "../rules/catalogue.js";
import { isCalendarDate, parseAimoTime } from "../util.js";

export function inspectDelivery(product: { name: string }, line: LookupLine, requestedDate: string, at: Date): ProductInspection["delivery"] {
  const evidence = line.availabilityEvidence;
  const rules = line.price ? [] : [fire("PRC-01", { product: product.name, productId: line.productId })];
  const validity = priceValidityRule(product, line, requestedDate);
  if (validity) rules.push(validity);
  const result = (state: ProductInspection["delivery"]["state"], message: string): ProductInspection["delivery"] => ({ state, message, rules });
  const blocked = () => {
    rules.push(fire("DLV-02", { product: product.name, productId: line.productId }));
    return result("sales_blocked", "The supplier has blocked this product from sale.");
  };
  if (evidence ? evidence.salesBlock : line.salesBlock) return blocked();
  if (!evidence) return result("unknown", "Original supplier schedules were not saved. Delivery eligibility is unknown; check supplier terms again.");
  if (!evidence.schedules.length) {
    rules.push(fire("DLV-01", { product: product.name, productId: line.productId }));
    return result("not_available", "No supplier delivery dates were returned. A price alone does not establish availability.");
  }
  const unblocked = evidence.schedules.filter((schedule) => !schedule.salesBlock);
  if (!unblocked.length) return blocked();
  const dated = unblocked.filter((schedule) => schedule.availableDate && isCalendarDate(schedule.availableDate));
  const onTime = dated.filter((schedule) => schedule.availableDate! <= requestedDate);
  if (!onTime.length) {
    if (dated.length === unblocked.length) {
      const earliest = [...dated].sort((a, b) => a.availableDate!.localeCompare(b.availableDate!))[0];
      rules.push(fire("DLV-03", { product: product.name, available: earliest.availableDate, neededBy: requestedDate }));
      return result("after_requested_date", "The supplier's original delivery dates are after the requested date.");
    }
    return result("unknown", "The supplier has not supplied a valid delivery date for this request.");
  }
  // Schedule amounts are alternatives, never added together. This inspection has no requested quantity.
  const withStock = onTime.filter((schedule) => schedule.stock.kind !== "known" || schedule.stock.amount > 0);
  if (!withStock.length) return result("out_of_stock", "The supplier reports zero stock on the delivery schedules for this date.");
  const cutoff = (value: string | null) => value && isCalendarDate(value.slice(0, 10)) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? parseAimoTime(value) : null;
  const open = withStock.filter((schedule) => (cutoff(schedule.closingTime)?.getTime() ?? -Infinity) > at.getTime());
  if (!open.length) {
    if (withStock.some((schedule) => !cutoff(schedule.closingTime))) return result("unknown", "An original supplier cutoff is missing or invalid. Delivery eligibility is unknown.");
    const schedule = withStock[0];
    const rule = cutoffRule(product, { ...line, availableDate: schedule.availableDate, closingTime: schedule.closingTime }, at);
    if (rule) rules.push(rule);
    return result("cutoff_passed", "The original supplier ordering cutoff has passed. Projected demo dates do not extend it.");
  }
  if (!open.some((schedule) => schedule.stock.kind === "known")) {
    rules.push(fire("STK-01", { product: product.name, productId: line.productId }));
    return result("stock_unconfirmed", "Supplier delivery dates exist and the cutoff is open. Stock is not confirmed.");
  }
  return result("scheduled", "An original supplier schedule has an open cutoff. Quantity and terms still need checking when ordering.");
}
