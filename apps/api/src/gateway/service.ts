/**
 * The Aimo Agent Gateway: Valio Aimo's side (chunk 08). Quotes, approvals,
 * orders and amendments. It enforces the hotel's mandate and the hard rules
 * itself, so Valio Aimo never has to trust the agent's code (D11).
 */
import type { Approval, ApprovalBody, FiredRule, Mandate, Order, OrderLine, Quote, QuoteCreateBody, QuoteLine, Refusal, AmendmentBody, LookupLine } from "@aimo/contracts";
import { getDb, getJson, allJson, tx } from "../db.js";
import { now, nowIso } from "../clock.js";
import { getProduct } from "../catalog.js";
import { lookup, UpstreamError } from "../aimo/lookup.js";
import { fire, resolveOutcome, FIXED } from "../rules/catalogue.js";
import { cutoffRule, dietRules, mandateRules, priceValidityRule, stockCheck, supplyRules } from "../rules/checks.js";
import { audit, GATEWAY, type Actor } from "../audit.js";
import { newId, round2, sha256, stableStringify, parseAimoTime, eur } from "../util.js";
import { signJwt, verifyJwt, jcs, checkoutHash } from "./keys.js";
import type { Identity } from "../identity.js";
import { actorOf } from "../identity.js";

export class GatewayRefusal extends Error {
  constructor(public status: number, public body: Refusal) {
    super(body.message);
  }
}

// ---------- mandate (AP-06, MANDATE-SIGN) ----------

/** Approvals are valid only with a JWS this gateway signed that names the same quote, fingerprint and grants. */
export function approvalValid(a: Approval): boolean {
  const c = verifyJwt(a.signature, "aimo-approval+jwt");
  return Boolean(c && c.vct === "mandate.checkout.1" && c.quote_id === a.quoteId && c.checkout_hash === a.checkoutHash && c.fingerprint === a.fingerprint && jcs([...c.grants].sort()) === jcs([...a.grants].sort()));
}

const quoteClaims = (q: Quote) => ({
  quote_id: q.id,
  fingerprint: q.fingerprint,
  site: q.siteId,
  delivery_date: q.deliveryDate,
  currency: "EUR",
  total_ex_vat: q.totalExVat,
  approvals_needed: q.mandateCheck.approvalsNeeded,
  lines: q.lines.map((l) => ({ product_id: l.productId, outlet: l.outletId, quantity: l.quantity, sales_unit: l.salesUnit, unit_price: l.unitPrice, cutoff: l.closingTime, stock: l.stock.kind, source: l.source, requires: l.requires ?? null })),
});
const orderClaims = (o: Order) => ({
  // AP2 v0.2 Checkout Receipt fields: status, reference (the quote's checkout_hash), order_id.
  status: "Success",
  reference: (getJson<Quote>("quotes", o.quoteId)?.checkoutHash) ?? null,
  order_id: o.id,
  version: o.version,
  quote_jti: o.quoteId,
  approval_id: o.approvalId,
  site: o.siteId,
  delivery_date: o.deliveryDate,
  currency: "EUR",
  total_ex_vat: o.totalExVat,
  lines: o.lines.filter((l) => !l.removed).map((l) => ({ product_id: l.productId, outlet: l.outletId, quantity: l.quantity, sales_unit: l.salesUnit, unit_price: l.unitPrice, risk_accepted: Boolean(l.riskAccepted) })),
});
export const signOrder = (o: Order): Order => ({ ...o, jws: signJwt("aimo-order+jwt", orderClaims({ ...o, jws: undefined }), { sub: o.hotelId, jti: `${o.id}.v${o.version}` }) });

export function getMandate(hotelId: string): Mandate {
  const m = getJson<Mandate>("mandates", hotelId, "hotel_id");
  if (!m) throw new GatewayRefusal(404, { error: "not_found", message: `No mandate for hotel ${hotelId}` });
  return m;
}
export function putMandate(m: Mandate): Mandate {
  const { signature: _old, ...body } = m;
  const signed = { ...body, signature: signJwt("aimo-mandate+jwt", { mandate: body }, { sub: m.hotelId, jti: `${m.id}.v${m.version}` }) } as Mandate;
  getDb().prepare("INSERT INTO mandates (hotel_id, json) VALUES (?, ?) ON CONFLICT(hotel_id) DO UPDATE SET json = excluded.json").run(m.hotelId, JSON.stringify(signed));
  return signed;
}

// ---------- quotes (QUOTE-CREATE, APPROVAL-BIND) ----------

export function isUrgent(deliveryDate: string, at: Date): boolean {
  const d = new Date(`${deliveryDate}T00:00:00Z`).getTime();
  return (d - at.getTime()) / 86_400_000 <= FIXED.urgentDays;
}

/** APPROVAL-BIND: any change to site, lines, quantities, prices, total or dates gives a new fingerprint. */
export function fingerprintOf(q: Pick<Quote, "siteId" | "deliveryDate" | "lines" | "totalExVat">): string {
  return sha256(
    stableStringify({
      siteId: q.siteId,
      deliveryDate: q.deliveryDate,
      total: q.totalExVat,
      lines: q.lines.map((l) => [l.productId, l.outletId, l.quantity, l.unitPrice, l.availableDate, l.closingTime, l.requires ?? null]),
    }),
  );
}

type BuildOpts = { hotelId: string; body: QuoteCreateBody; lookups: Map<string, LookupLine>; amendsOrderId?: string; fixedPrices?: Map<string, number> };

function buildQuote({ hotelId, body, lookups, amendsOrderId, fixedPrices }: BuildOpts): Quote {
  const mandate = getMandate(hotelId);
  const at = now();
  const urgent = isUrgent(body.deliveryDate, at);
  const quantities = new Map<string, number>();
  for (const line of body.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  const lines: QuoteLine[] = body.lines.map((li, i) => {
    const p = getProduct(li.productId);
    const l = lookups.get(li.productId)!;
    const name = p?.name ?? li.productId;
    const rules: FiredRule[] = [];
    if (!p) rules.push(fire("REQ-04", { product: li.productId }));
    rules.push(...supplyRules({ name }, l));
    const cut = cutoffRule({ name }, l, at);
    if (cut) rules.push(cut);
    if (p && li.requires) rules.push(...dietRules(p, li.requires, "this line").filter((r) => r.outcome === "block"));
    if (l.deliverable) rules.push(...stockCheck({ name }, l, quantities.get(li.productId)!, urgent, l.salesUnit ?? "units").rules.filter((r) => r.ruleId !== "STK-05"));
    const pv = priceValidityRule({ name }, l, body.deliveryDate);
    if (pv) rules.push(pv);
    const unitPrice = fixedPrices?.get(`${li.productId}|${li.outletId}`) ?? l.price?.value ?? null;
    return {
      lineNo: i + 1,
      ref: li.ref ?? null,
      productId: li.productId,
      productName: name,
      outletId: li.outletId,
      quantity: li.quantity,
      salesUnit: l.salesUnit,
      unitPrice,
      lineTotal: unitPrice === null ? null : round2(unitPrice * li.quantity),
      taxRate: l.price?.taxRate ?? null,
      stock: l.stock,
      availableDate: l.availableDate,
      closingTime: l.closingTime,
      priceValidTo: l.price?.validTo ?? null,
      logisticModel: l.logisticModel,
      source: l.source,
      rules,
      outcome: resolveOutcome(rules),
      ...(li.requires ? { requires: li.requires } : {}),
    };
  });
  const totalExVat = round2(lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
  const totalVat = round2(lines.reduce((s, l) => s + ((l.lineTotal ?? 0) * (l.taxRate ?? 0)) / 100, 0));
  const mc = mandateRules(mandate, totalExVat, lines.map((l) => ({ id: l.productId, name: l.productName })), body.siteId);
  // D31: unconfirmed stock is the hotel's call, made by the person building the order, not an Approver's.
  // The order must name each such product, unless a pre-answer covers the line.
  const cap = mandate.preAnswers.unknownStockMaxLineEur;
  const unconfirmedStock = [...new Set(lines.filter((l) => l.stock.kind === "unknown" && (cap === null || (l.lineTotal ?? Infinity) > cap)).map((l) => l.productId))];
  const approvalsNeeded = [...mc.approvalsNeeded];
  if (lines.some((l) => l.rules.some((r) => r.ruleId === "PRC-02"))) approvalsNeeded.push("price_change");
  const allRules = [...lines.flatMap((l) => l.rules), ...mc.rules];
  const blocked = allRules.some((r) => r.outcome === "block");
  const cutoffs = lines.map((l) => parseAimoTime(l.closingTime)?.getTime()).filter((t): t is number => typeof t === "number" && t > at.getTime());
  const expires = Math.min(at.getTime() + FIXED.quoteMaxHours * 3_600_000, ...cutoffs);
  const base = { siteId: body.siteId, deliveryDate: body.deliveryDate, lines, totalExVat };
  return {
    id: newId("q"),
    hotelId,
    siteId: body.siteId,
    eventId: body.eventId ?? null,
    deliveryDate: body.deliveryDate,
    createdAt: at.toISOString(),
    expiresAt: new Date(expires).toISOString(),
    urgent,
    lines,
    totalExVat,
    totalVat,
    fingerprint: fingerprintOf(base),
    mandateCheck: { pass: mc.rules.length === 0, rules: mc.rules, approvalsNeeded },
    outcome: blocked ? "block" : approvalsNeeded.length ? "ask_approver" : "order",
    usesFixtures: lines.some((l) => l.source === "fixture"),
    unconfirmedStock,
    ...(amendsOrderId ? { amendsOrderId } : {}),
  } as Quote;
}

async function lookupMap(ids: string[], date: string): Promise<{ map: Map<string, LookupLine>; fallback: string | null }> {
  try {
    const r = await lookup(ids, date);
    return { map: new Map(r.lines.map((l) => [l.productId, l])), fallback: r.fallback };
  } catch (e) {
    if (e instanceof UpstreamError) throw new GatewayRefusal(503, { error: "upstream_unavailable", message: `Can't check prices right now. Nothing has been ordered. (${e.message})` });
    throw e;
  }
}

function requireHotel(id: Identity): string {
  if (id.kind === "valio") throw new GatewayRefusal(403, { error: "forbidden", message: "Valio Aimo viewer tokens can't quote or order" });
  return id.hotelId;
}

export async function createQuote(id: Identity, body: QuoteCreateBody, actor?: Actor): Promise<Quote> {
  const hotelId = requireHotel(id);
  const mandate = getMandate(hotelId);
  if (!mandate.sites.some((s) => s.id === body.siteId))
    throw new GatewayRefusal(403, { error: "forbidden", message: `Site ${body.siteId} is not one of this hotel's delivery sites`, rules: [fire("DLV-05", { site: body.siteId })] });
  const { map, fallback } = await lookupMap(body.lines.map((l) => l.productId), body.deliveryDate);
  const q = buildQuote({ hotelId, body, lookups: map });
  q.jws = signJwt("aimo-quote+jwt", quoteClaims(q), { sub: q.hotelId, expiresAt: q.expiresAt, jti: q.id });
  q.checkoutHash = checkoutHash(q.jws);
  getDb().prepare("INSERT INTO quotes (id, json, created_at) VALUES (?, ?, ?)").run(q.id, JSON.stringify(q), q.createdAt);
  audit({
    actor: actor ?? actorOf(id),
    action: "quote_created",
    summary: `Quote ${q.id}: ${q.lines.length} lines, ${eur(q.totalExVat)} ex VAT, outcome ${q.outcome}${fallback ? ` (${fallback})` : ""}`,
    eventId: q.eventId,
    quoteId: q.id,
    ruleIds: [...q.lines.flatMap((l) => l.rules.map((r) => r.ruleId)), ...q.mandateCheck.rules.map((r) => r.ruleId)],
    details: { deliveryDate: q.deliveryDate, approvalsNeeded: q.mandateCheck.approvalsNeeded, fingerprint: q.fingerprint, urgent: q.urgent },
    usesFixture: q.usesFixtures,
    visibility: "shared",
  });
  return q;
}

export function getQuote(id: string): Quote {
  const q = getJson<Quote>("quotes", id);
  if (!q) throw new GatewayRefusal(404, { error: "not_found", message: `No quote ${id}` });
  return q;
}

// ---------- approvals (AP-07, AP2-style CartMandate) ----------

export function createApproval(id: Identity, body: ApprovalBody): Approval {
  if (id.kind !== "person" || id.person.role !== "approver")
    throw new GatewayRefusal(403, { error: "forbidden", message: "Only a person with the Approver role can approve" });
  const q = getQuote(body.quoteId);
  if (q.hotelId !== id.hotelId) throw new GatewayRefusal(403, { error: "forbidden", message: "Quote belongs to another hotel" });
  if (q.fingerprint !== body.fingerprint)
    throw new GatewayRefusal(409, { error: "mandate_violation", message: "The approval doesn't match this quote version", rules: [fire("MAN-04", {})] });
  if (q.outcome === "block") {
    const hard = q.lines.flatMap((l) => l.rules).filter((r) => r.outcome === "block");
    throw new GatewayRefusal(409, { error: "hard_rule", message: "A blocked line can't be approved. Fix or remove it first.", rules: hard });
  }
  const a: Approval = {
    id: newId("apr"),
    type: "mandate.checkout.1",
    quoteId: q.id,
    checkoutHash: q.checkoutHash ?? checkoutHash(q.jws ?? ""),
    fingerprint: q.fingerprint,
    grants: [...body.grants].sort(),
    approvedBy: { personId: id.person.id, name: id.person.name, role: "approver" },
    createdAt: nowIso(),
    signature: "",
  };
  // AP2 v0.2 closed Checkout Mandate. In AP2 the user signs it on a trusted surface; here the gateway signs it
  // as the record of the approver's authenticated decision (production path: the approver's own passkey).
  a.signature = signJwt(
    "aimo-approval+jwt",
    { vct: "mandate.checkout.1", checkout_jwt: q.jws, checkout_hash: a.checkoutHash, approval_id: a.id, quote_id: a.quoteId, fingerprint: a.fingerprint, grants: a.grants, approved_by: a.approvedBy },
    { sub: q.hotelId, expiresAt: q.expiresAt, jti: a.id },
  );
  getDb().prepare("INSERT INTO approvals (id, quote_id, json) VALUES (?, ?, ?)").run(a.id, q.id, JSON.stringify(a));
  audit({
    actor: actorOf(id),
    action: "approval_granted",
    summary: `${id.person.name} approved quote ${q.id} for: ${a.grants.join(", ")}`,
    eventId: q.eventId,
    quoteId: q.id,
    details: { approvalId: a.id, grants: a.grants, fingerprint: q.fingerprint },
    visibility: "shared",
  });
  return a;
}

// ---------- orders (ORDER-PLACE, QUOTE-RECHECK, idempotency) ----------

/** QUOTE-RECHECK (Q08.7): any price change, stock now short, cut-off passed or date moved. */
function recheck(q: Quote, fresh: Map<string, LookupLine>, at: Date): Record<string, unknown>[] {
  const changes: Record<string, unknown>[] = [];
  const quantities = new Map<string, number>();
  for (const line of q.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  for (const l of q.lines) {
    const f = fresh.get(l.productId)!;
    if ((f.price?.value ?? null) !== l.unitPrice) changes.push({ productId: l.productId, field: "price", was: l.unitPrice, now: f.price?.value ?? null });
    if (f.availableDate !== l.availableDate) changes.push({ productId: l.productId, field: "availableDate", was: l.availableDate, now: f.availableDate });
    if (q.urgent && f.stock.kind === "known" && f.stock.amount < quantities.get(l.productId)!) changes.push({ productId: l.productId, field: "stock", was: l.stock, now: f.stock });
    const c = parseAimoTime(f.closingTime);
    if (c && c.getTime() <= at.getTime()) changes.push({ productId: l.productId, field: "cutoff", now: f.closingTime, passed: true });
  }
  return changes;
}

function approvalCovers(q: Quote, approvalId: string | undefined): { ok: boolean; reason?: string } {
  const needed = q.mandateCheck.approvalsNeeded;
  if (!needed.length) return { ok: true };
  if (!approvalId) return { ok: false, reason: "no approval presented" };
  const a = getJson<Approval>("approvals", approvalId);
  if (!a) return { ok: false, reason: "approval not found" };
  if (!approvalValid(a)) return { ok: false, reason: "approval signature invalid" };
  if (a.fingerprint !== q.fingerprint) return { ok: false, reason: "approval is for a different quote version" };
  const missing = needed.filter((n) => !a.grants.includes(n));
  if (missing.length) return { ok: false, reason: `approval doesn't cover ${missing.join(", ")}` };
  return { ok: true };
}

export async function placeOrder(id: Identity, quoteId: string, idemKey: string, approvalId?: string, actor?: Actor, stock: { continueWith?: string[]; decidedBy?: string } = {}): Promise<{ order: Order; replay: boolean }> {
  const hotelId = requireHotel(id);
  if (!idemKey) throw new GatewayRefusal(400, { error: "invalid", message: "Idempotency-Key header is required" });
  const continued = [...new Set(stock.continueWith ?? [])].sort();
  const bodyHash = sha256(stableStringify({ quoteId, approvalId: approvalId ?? null, hotelId, continued }));
  const existing = getDb().prepare("SELECT json, body_hash FROM orders WHERE idem_key = ?").get(idemKey) as { json: string; body_hash: string } | undefined;
  if (existing) {
    if (existing.body_hash !== bodyHash) throw new GatewayRefusal(422, { error: "idempotency_conflict", message: "This Idempotency-Key was used with a different body; the first order is untouched" });
    return { order: JSON.parse(existing.json), replay: true };
  }
  const q = getQuote(quoteId);
  if (q.hotelId !== hotelId) throw new GatewayRefusal(403, { error: "forbidden", message: "Quote belongs to another hotel" });
  const by = actor ?? actorOf(id);
  const refuse = (status: number, r: Refusal): never => {
    audit({ actor: by, action: "order_refused", summary: `Order on ${q.id} refused: ${r.error}: ${r.message}`, eventId: q.eventId, quoteId: q.id, ruleIds: r.rules?.map((x) => x.ruleId), details: { error: r.error, approvalsNeeded: r.approvalsNeeded, changes: r.changes }, visibility: "shared", usesFixture: q.usesFixtures });
    throw new GatewayRefusal(status, r);
  };
  const at = now();
  // Hard rules first: no approval can push a blocked line through (AP-04).
  const hard = q.lines.flatMap((l) => l.rules).filter((r) => r.outcome === "block");
  for (const line of q.lines) {
    const product = getProduct(line.productId);
    if (product && line.requires) hard.push(...dietRules(product, line.requires, "this line").filter((r) => r.outcome === "block"));
  }
  if (hard.length) refuse(409, { error: hard.some((r) => r.ruleId === "CUT-01") ? "cutoff_passed" : "hard_rule", message: hard.map((r) => r.message).join(" "), rules: hard });
  if (new Date(q.expiresAt).getTime() <= at.getTime()) refuse(409, { error: "quote_stale", message: "The quote has expired; request a new one" });
  const { map } = await lookupMap(q.lines.map((l) => l.productId), q.deliveryDate);
  const changes = recheck(q, map, at);
  if (changes.length) {
    const nq = await createQuote(id, { siteId: q.siteId, deliveryDate: q.deliveryDate, eventId: q.eventId ?? undefined, lines: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, outletId: l.outletId, ref: l.ref ?? undefined, requires: l.requires })) }, by);
    const cutoff = changes.some((c) => c.field === "cutoff");
    refuse(409, { error: cutoff ? "cutoff_passed" : "quote_stale", message: cutoff ? "A cut-off passed since the quote" : "Terms changed since the quote", changes, newQuoteId: nq.id });
  }
  const missingStock = (q.unconfirmedStock ?? []).filter((p) => !continued.includes(p));
  if (missingStock.length)
    refuse(409, {
      error: "stock_unconfirmed",
      message: `Valio Aimo can't confirm stock for ${missingStock.join(", ")}. List them in continueWithUnconfirmedStock to order anyway.`,
      rules: q.lines.filter((l) => missingStock.includes(l.productId)).flatMap((l) => l.rules.filter((r) => r.ruleId === "STK-01")),
    });
  const cover = approvalCovers(q, approvalId);
  if (!cover.ok)
    refuse(409, { error: "mandate_violation", message: `This order needs an approval bound to quote ${q.id} (${cover.reason})`, rules: q.mandateCheck.rules, approvalsNeeded: q.mandateCheck.approvalsNeeded });
  const approval = approvalId ? getJson<Approval>("approvals", approvalId) : null;
  const order: Order = {
    id: newId("ord"),
    quoteId: q.id,
    hotelId,
    siteId: q.siteId,
    eventId: q.eventId,
    deliveryDate: q.deliveryDate,
    state: "placed",
    lines: q.lines.map(
      (l): OrderLine => ({
        ...l,
        removed: false,
        riskAccepted: l.stock.kind === "unknown" ? { by: continued.includes(l.productId) ? stock.decidedBy ?? by.name : "pre-answer", at: at.toISOString() } : null,
      }),
    ),
    totalExVat: q.totalExVat,
    totalVat: q.totalVat,
    placedAt: at.toISOString(),
    placedBy: by.name,
    approvalId: approvalId ?? null,
    idempotencyKey: idemKey,
    version: 1,
    flags: [],
  };
  tx(() => {
    Object.assign(order, signOrder(order));
    getDb().prepare("INSERT INTO orders (id, quote_id, event_id, idem_key, body_hash, json) VALUES (?, ?, ?, ?, ?, ?)").run(order.id, q.id, q.eventId, idemKey, bodyHash, JSON.stringify(order));
  });
  audit({
    actor: by,
    action: "order_placed",
    summary: `Order ${order.id} placed: ${order.lines.length} lines, ${eur(order.totalExVat)} ex VAT, delivery ${order.deliveryDate}${approval ? `, approved by ${approval.approvedBy.name}` : ", inside the mandate"}`,
    eventId: q.eventId,
    quoteId: q.id,
    orderId: order.id,
    ruleIds: q.lines.flatMap((l) => l.rules.map((r) => r.ruleId)),
    details: { approvalId: approvalId ?? null, outlets: [...new Set(order.lines.map((l) => l.outletId))] },
    usesFixture: q.usesFixtures,
    visibility: "shared",
  });
  return { order, replay: false };
}

export function getOrder(id: string): Order {
  const o = getJson<Order>("orders", id);
  if (!o) throw new GatewayRefusal(404, { error: "not_found", message: `No order ${id}` });
  return o;
}
export function listOrders(hotelId: string, eventId?: string): Order[] {
  const all = allJson<Order>("SELECT json FROM orders ORDER BY rowid");
  return all.filter((o) => o.hotelId === hotelId && (!eventId || o.eventId === eventId));
}
export function saveOrder(o: Order) {
  getDb().prepare("UPDATE orders SET json = ? WHERE id = ?").run(JSON.stringify(o), o.id);
}

// ---------- amendments (ORDER-AMEND, VA-09) ----------

/**
 * Applies changes until each line's cut-off. Unchanged lines keep their fixed
 * price; changed and new lines take today's price. The mandate is re-checked on
 * the new total; when it needs an approval the refusal carries the amendment
 * quote to approve, and the retry with that approval goes through.
 */
export async function amendOrder(id: Identity, orderId: string, body: AmendmentBody, actor?: Actor): Promise<{ order: Order; quote: Quote }> {
  const hotelId = requireHotel(id);
  const o = getOrder(orderId);
  if (o.hotelId !== hotelId) throw new GatewayRefusal(403, { error: "forbidden", message: "Order belongs to another hotel" });
  const by = actor ?? actorOf(id);
  const at = now();
  const key = (p: string, out: string) => `${p}|${out}`;
  const current = new Map(o.lines.filter((l) => !l.removed).map((l) => [key(l.productId, l.outletId), l]));
  const refusedLines: FiredRule[] = [];
  const next = new Map<string, number>([...current].map(([k, l]) => [k, l.quantity]));
  for (const c of body.changes) {
    const k = key(c.productId, c.outletId);
    const cur = current.get(k);
    if (cur) {
      const cut = parseAimoTime(cur.closingTime);
      if (cut && cut.getTime() <= at.getTime() && cur.quantity !== c.quantity) {
        refusedLines.push(fire("CUT-02", { product: cur.productName, productId: cur.productId, cutoff: cur.closingTime }));
        continue;
      }
    }
    if (c.quantity === 0) next.delete(k);
    else next.set(k, c.quantity);
  }
  if (refusedLines.length === body.changes.length)
    throw new GatewayRefusal(409, { error: "cutoff_passed", message: refusedLines.map((r) => r.message).join(" "), rules: refusedLines });
  const fixedPrices = new Map<string, number>();
  for (const [k, l] of current) if (next.get(k) === l.quantity && l.unitPrice !== null) fixedPrices.set(k, l.unitPrice);
  const lines = [...next].map(([k, qty]) => {
    const [productId, outletId] = k.split("|");
    return { productId, outletId, quantity: qty, ref: current.get(k)?.ref ?? undefined, requires: current.get(k)?.requires };
  });
  if (!lines.length) throw new GatewayRefusal(422, { error: "invalid", message: "An amendment can't remove every line; cancel the order instead" });
  const { map } = await lookupMap(lines.map((l) => l.productId), o.deliveryDate);
  const q = buildQuote({ hotelId, body: { siteId: o.siteId, deliveryDate: o.deliveryDate, eventId: o.eventId ?? undefined, lines }, lookups: map, amendsOrderId: o.id, fixedPrices });
  // A spend-cap approval already covers the order up to its current total: an amendment that
  // doesn't raise the total needs no new one (edge case in chunk 05: only going over asks again).
  if (q.totalExVat <= o.totalExVat) {
    q.mandateCheck.approvalsNeeded = q.mandateCheck.approvalsNeeded.filter((n) => n !== "spend_cap");
    q.mandateCheck.rules = q.mandateCheck.rules.filter((r) => r.ruleId !== "MAN-01");
  }
  // D31: a product the hotel already chose to continue with stays continued (Q04.6); only new ones need the choice.
  const alreadyContinued = new Set(o.lines.filter((l) => l.riskAccepted).map((l) => l.productId));
  const continued = new Set([...(body.continueWithUnconfirmedStock ?? []), ...alreadyContinued]);
  q.unconfirmedStock = (q.unconfirmedStock ?? []).filter((p) => !alreadyContinued.has(p));
  // A past cut-off blocks only the lines this amendment changes or adds; locked lines stay as they are.
  const touched = new Set(body.changes.map((c) => key(c.productId, c.outletId)));
  // Stock is checked only where the amendment asks for more than before; a decrease never makes a shortage worse.
  const grew = (l: QuoteLine) => (current.get(key(l.productId, l.outletId))?.quantity ?? 0) < l.quantity;
  const blocked = q.lines.flatMap((l) =>
    l.rules.filter((r) => r.outcome === "block" && (r.ruleId === "CUT-01" ? touched.has(key(l.productId, l.outletId)) : r.ruleId === "STK-04" ? grew(l) : true)),
  );
  q.outcome = blocked.length ? "block" : q.mandateCheck.approvalsNeeded.length ? "ask_approver" : "order";
  q.jws = signJwt("aimo-quote+jwt", quoteClaims(q), { sub: q.hotelId, expiresAt: q.expiresAt, jti: q.id });
  q.checkoutHash = checkoutHash(q.jws);
  getDb().prepare("INSERT INTO quotes (id, json, created_at) VALUES (?, ?, ?)").run(q.id, JSON.stringify(q), q.createdAt);
  if (blocked.length) throw new GatewayRefusal(409, { error: "hard_rule", message: blocked.map((r) => r.message).join(" "), rules: blocked });
  const missingStock = q.unconfirmedStock.filter((p) => !continued.has(p));
  if (missingStock.length)
    throw new GatewayRefusal(409, { error: "stock_unconfirmed", message: `Valio Aimo can't confirm stock for ${missingStock.join(", ")}. List them in continueWithUnconfirmedStock to change the order anyway.`, newQuoteId: q.id });
  if (q.mandateCheck.approvalsNeeded.length) {
    const a = body.approvalId ? getJson<Approval>("approvals", body.approvalId) : null;
    const ok = a && approvalValid(a) && a.fingerprint === q.fingerprint && q.mandateCheck.approvalsNeeded.every((n) => a.grants.includes(n));
    if (!ok) {
      audit({ actor: by, action: "order_refused", summary: `Amendment to ${o.id} needs an approval (${q.mandateCheck.approvalsNeeded.join(", ")})`, eventId: o.eventId, orderId: o.id, quoteId: q.id, ruleIds: q.mandateCheck.rules.map((r) => r.ruleId), details: { approvalsNeeded: q.mandateCheck.approvalsNeeded }, visibility: "shared" });
      throw new GatewayRefusal(409, { error: "mandate_violation", message: `The amendment needs an approval bound to quote ${q.id}`, approvalsNeeded: q.mandateCheck.approvalsNeeded, rules: q.mandateCheck.rules, newQuoteId: q.id });
    }
  }
  const prevLines = new Map(o.lines.map((l) => [key(l.productId, l.outletId), l]));
  const newLines: OrderLine[] = q.lines.map((l) => {
    const prev = prevLines.get(key(l.productId, l.outletId));
    const earlier = o.lines.find((x) => x.productId === l.productId && x.riskAccepted)?.riskAccepted ?? null;
    return {
      ...l,
      removed: false,
      riskAccepted: l.stock.kind === "unknown" ? prev?.riskAccepted ?? earlier ?? { by: continued.has(l.productId) ? body.decidedBy ?? by.name : "pre-answer", at: at.toISOString() } : null,
    };
  });
  for (const [k, l] of prevLines) if (!next.has(k) && !l.removed) newLines.push({ ...l, removed: true });
  const updated: Order = { ...o, lines: newLines, totalExVat: q.totalExVat, totalVat: q.totalVat, state: "amended", version: o.version + 1 };
  Object.assign(updated, signOrder(updated));
  saveOrder(updated);
  audit({
    actor: by,
    action: "order_amended",
    summary: `Order ${o.id} amended to v${updated.version}: ${body.changes.map((c) => `${c.productId} → ${c.quantity}`).join(", ")}; total ${eur(updated.totalExVat)}`,
    eventId: o.eventId,
    orderId: o.id,
    quoteId: q.id,
    ruleIds: [...refusedLines.map((r) => r.ruleId), ...q.mandateCheck.rules.map((r) => r.ruleId)],
    details: { changes: body.changes, refused: refusedLines.map((r) => r.facts), approvalId: body.approvalId ?? null },
    visibility: "shared",
  });
  return { order: updated, quote: q };
}
