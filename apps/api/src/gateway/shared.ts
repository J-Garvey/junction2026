import type { Order, Quote } from "@aimo/contracts";

/** Allowlisted trade facts: no mandate, dietary context, names or signatures. */
const tradeLines = (o: Quote | Order) => o.lines.map(l => ({
  productId: l.productId, productName: l.productName, outletId: l.outletId,
  quantity: l.quantity, salesUnit: l.salesUnit, unitPrice: l.unitPrice, lineTotal: l.lineTotal,
  availableDate: l.availableDate, closingTime: l.closingTime, stock: l.stock,
  ...("removed" in l ? { removed: l.removed } : {}),
}));
export const sharedQuote = (q: Quote) => ({ id: q.id, hotelId: q.hotelId, siteId: q.siteId, deliveryDate: q.deliveryDate, expiresAt: q.expiresAt, totalExVat: q.totalExVat, totalVat: q.totalVat, currency: "EUR", lines: tradeLines(q) });
export const sharedOrder = (o: Order) => ({ id: o.id, hotelId: o.hotelId, siteId: o.siteId, quoteId: o.quoteId, version: o.version, state: o.state, deliveryDate: o.deliveryDate, placedAt: o.placedAt, approvalId: o.approvalId, totalExVat: o.totalExVat, totalVat: o.totalVat, currency: "EUR", lines: tradeLines(o) });
