/**
 * The Aimo Agent Gateway: Valio Aimo's side (chunk 08). Quotes, approvals,
 * orders and amendments. It enforces the hotel's mandate and the hard rules
 * itself, so Valio Aimo never has to trust the agent's code (D11).
 */
import type { AllergenAcknowledgement, AllergenAcknowledgementBody, Approval, ApprovalBody, FiredRule, Mandate, Order, OrderLine, Quote, QuoteCreateBody, QuoteLine, Refusal, AmendmentBody, LookupLine } from "@aimo/contracts";
import { getDb, getJson, allJson, tx } from "../db.js";
import { now, nowIso } from "../clock.js";
import { getProduct } from "../catalog.js";
import { carbonBasisFor } from "../carbon.js";
import { lookup, UpstreamError } from "../aimo/lookup.js";
import { fire, resolveOutcome, FIXED, outcomeOf } from "../rules/catalogue.js";
import { cutoffRule, productRules, mandateRules, priceValidityRule, stockCheck, supplyRules } from "../rules/checks.js";
import { supplierDelivery } from "../rules/delivery.js";
import { audit, GATEWAY, type Actor } from "../audit.js";
import { newId, round2, sha256, stableStringify, parseAimoTime, eur, isCalendarDate } from "../util.js";
import { signJwt, verifyJwt, jcs, checkoutHash } from "./keys.js";
import type { Identity } from "../identity.js";
import { actorOf, getPerson } from "../identity.js";
import { allowsOutlets } from "../authorization.js";

export class GatewayRefusal extends Error {
  constructor(public status: number, public body: Refusal) {
    super(body.message);
  }
}

// ---------- mandate (AP-06, MANDATE-SIGN) ----------

/** Approvals are valid only with a JWS this gateway signed that names the same quote, fingerprint and grants. */
export function approvalValid(a: Approval): boolean {
  const c = verifyJwt(a.signature, "aimo-approval+jwt");
  const q = getJson<Quote>("quotes", a.quoteId);
  return Boolean(c && q && c.sub === q.hotelId && c.exp > now().getTime() / 1000 && c.nbf <= now().getTime() / 1000 &&
    c.vct === "mandate.checkout.1" && c.quote_id === a.quoteId && c.checkout_hash === a.checkoutHash &&
    a.checkoutHash === q.checkoutHash && a.fingerprint === q.fingerprint && c.fingerprint === a.fingerprint &&
    Array.isArray(c.grants) && jcs([...c.grants].sort()) === jcs([...a.grants].sort()));
}

const quoteClaims = (q: Quote) => ({
  quote_id: q.id,
  fingerprint: q.fingerprint,
  site: q.siteId,
  delivery_date: q.deliveryDate,
  currency: "EUR",
  total_ex_vat: q.totalExVat,
  approvals_needed: q.mandateCheck.approvalsNeeded,
  lines: q.lines.map((l) => ({ product_id: l.productId, outlet: l.outletId, quantity: l.quantity, sales_unit: l.salesUnit, unit_price: l.unitPrice, cutoff: l.closingTime, stock: l.stock.kind, source: l.source, requires: l.requires ?? null, allergen_scope: l.allergenScope ?? null, allergen_evidence: l.allergenEvidence ?? null })),
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
  lines: o.lines.filter((l) => !l.removed).map((l) => ({ product_id: l.productId, outlet: l.outletId, quantity: l.quantity, sales_unit: l.salesUnit, unit_price: l.unitPrice, risk_accepted: Boolean(l.riskAccepted), allergen_data_acknowledgement: l.allergenDataAcknowledgement ?? null })),
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
      lines: q.lines.map((l) => [l.productId, l.outletId, l.quantity, l.salesUnit, l.unitPrice, l.taxRate, l.availableDate, l.closingTime, l.priceValidTo,
        l.stock.kind === "unknown" ? l.stock : l.stock.kind, l.logisticModel, l.requires ?? null, l.allergenScope ?? null, l.allergenEvidence ?? null]),
    }),
  );
}

type StoredQuote = Quote & { amendsOrderId?: string; amendmentVersion?: number; stockPolicy?: string };
type StoredOrder = Order & { stockPolicy?: string };
const stockPolicy = (m: Mandate) => sha256(stableStringify({ version: m.version, preAnswers: m.preAnswers }));
const supplierTime = (value: string | null | undefined) => value && isCalendarDate(value.slice(0, 10)) ? parseAimoTime(value) : null;
type BuildOpts = { hotelId: string; body: QuoteCreateBody; lookups: Map<string, LookupLine>; amendsOrderId?: string; fixedPrices?: Map<string, number> };

function buildQuote({ hotelId, body, lookups, amendsOrderId, fixedPrices }: BuildOpts): StoredQuote {
  const mandate = getMandate(hotelId);
  const at = now();
  const urgent = isUrgent(body.deliveryDate, at);
  const quantities = new Map<string, number>();
  for (const line of body.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  const lines: QuoteLine[] = body.lines.map((li, i) => {
    const p = getProduct(li.productId);
    const delivery = supplierDelivery(lookups.get(li.productId)!, body.deliveryDate, mandate, quantities.get(li.productId)!, at);
    const l = delivery.line;
    const name = p?.name ?? li.productId;
    const rules: FiredRule[] = [...delivery.rules];
    if (!p) rules.push(fire("REQ-04", { product: li.productId }));
    rules.push(...supplyRules({ name }, l));
    // An incomplete supplier response is not permission to order. These facts
    // are mandatory even when the hotel's policy allows unknown stock.
    if (!isCalendarDate(l.availableDate ?? "") || !supplierTime(l.closingTime) || !l.salesUnit?.trim())
      rules.push(fire("DLV-01", { product: name, productId: li.productId, reason: "missing or invalid delivery terms" }));
    const from = supplierTime(l.price?.validFrom), to = supplierTime(l.price?.validTo);
    if (l.price && (!Number.isFinite(l.price.value) || l.price.value <= 0 || l.price.currency !== "EUR" ||
      !Number.isSafeInteger(Math.round(l.price.value * li.quantity * 100)) ||
      // The price API's pricingDate is the requested delivery date. A future
      // price can cover that delivery even when the hotel orders months ahead.
      !from || !to || (l.price.validFrom ?? "").slice(0, 10) > body.deliveryDate || to <= at || from > to ||
      (l.price.taxRate !== null && (!Number.isFinite(l.price.taxRate) || l.price.taxRate < 0 || l.price.taxRate > 100))))
      rules.push(fire("PRC-01", { product: name, productId: li.productId, reason: "invalid price or validity" }));
    const cut = cutoffRule({ name }, l, at);
    if (cut) rules.push(cut);
    if (p) rules.push(...productRules(p, li.requires, "this line", mandate).filter((r) => r.outcome === "block" || r.ruleId === "ALG-03"));
    if (l.deliverable) rules.push(...stockCheck({ name }, l, quantities.get(li.productId)!, urgent, l.salesUnit ?? "units").rules.filter((r) => r.ruleId !== "STK-05"));
    if (l.deliverable && l.stock.kind === "none" && !urgent)
      rules.push(fire("STK-04", { product: name, productId: li.productId, quantity: li.quantity, unit: l.salesUnit ?? "units", stock: 0, date: l.availableDate ?? "" }));
    const pv = priceValidityRule({ name }, l, body.deliveryDate);
    if (pv) rules.push(pv);
    const rawPrice = fixedPrices?.get(`${li.productId}|${li.outletId}`) ?? l.price?.value;
    const unitPrice = typeof rawPrice === "number" && rawPrice > 0 && Number.isSafeInteger(Math.round(rawPrice * li.quantity * 100)) ? rawPrice : null;
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
      taxRate: typeof l.price?.taxRate === "number" && Number.isFinite(l.price.taxRate) && l.price.taxRate >= 0 ? l.price.taxRate : null,
      stock: l.stock,
      availableDate: l.availableDate,
      closingTime: l.closingTime,
      availabilityEvidence: l.availabilityEvidence,
      carbonBasis: carbonBasisFor(p, l),
      priceValidTo: l.price?.validTo ?? null,
      logisticModel: l.logisticModel,
      source: l.source,
      rules,
      outcome: resolveOutcome(rules),
      ...(li.requires ? { requires: li.requires } : {}),
      ...(li.allergenScope ? { allergenScope: li.allergenScope } : {}),
      ...(p && li.requires?.avoidAllergens.length ? { allergenEvidence: sha256(stableStringify([p.hasAllergenData, p.contains, p.mayContain, p.allergenUndeclared ?? [], p.claims])) } : {}),
    };
  });
  const totalExVat = round2(lines.reduce((s, l) => s + (l.lineTotal ?? 0), 0));
  const totalVat = round2(lines.reduce((s, l) => s + ((l.lineTotal ?? 0) * (l.taxRate ?? 0)) / 100, 0));
  const mc = mandateRules(mandate, totalExVat, lines.map((l) => ({ id: l.productId, name: l.productName })), body.siteId);
  // D31: unconfirmed stock is the hotel's call, made by the person building the order, not an Approver's.
  // The order must name each such product, unless a pre-answer covers the line.
  const cap = mandate.preAnswers.unknownStockMaxLineEur;
  // RULE-POLICY: a hotel that set STK-01 to "Continue" has pre-answered every line.
  const continueAll = outcomeOf("STK-01") === "order";
  const unconfirmedStock = continueAll ? [] : [...new Set(lines.filter((l) => l.stock.kind === "unknown" && (cap === null || (l.lineTotal ?? Infinity) > cap)).map((l) => l.productId))];
  const approvalsNeeded = [...mc.approvalsNeeded];
  if (lines.some((l) => l.rules.some((r) => r.ruleId === "PRC-02" && r.outcome === "ask_approver"))) approvalsNeeded.push("price_change");
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
    outcome: blocked ? "block" : lines.some((l) => l.rules.some((r) => r.ruleId === "ALG-03")) ? "ask_chef" : approvalsNeeded.length ? "ask_approver" : "order",
    usesFixtures: lines.some((l) => l.source === "fixture"),
    unconfirmedStock,
    stockPolicy: stockPolicy(mandate),
    ...(amendsOrderId ? { amendsOrderId } : {}),
  };
}

const quoteBody = (q: Quote): QuoteCreateBody => ({ siteId: q.siteId, deliveryDate: q.deliveryDate, eventId: q.eventId ?? undefined,
  lines: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, outletId: l.outletId, ref: l.ref ?? undefined, requires: l.requires, allergenScope: l.allergenScope })) });

function preserveSpendApproval(q: Quote, order: Order) {
  if (q.totalExVat <= order.totalExVat) {
    q.mandateCheck.approvalsNeeded = q.mandateCheck.approvalsNeeded.filter((n) => n !== "spend_cap");
    q.mandateCheck.rules = q.mandateCheck.rules.filter((r) => r.ruleId !== "MAN-01");
  }
}

function saveQuote(q: StoredQuote): StoredQuote {
  q.jws = signJwt("aimo-quote+jwt", quoteClaims(q), { sub: q.hotelId, expiresAt: q.expiresAt, jti: q.id });
  q.checkoutHash = checkoutHash(q.jws);
  getDb().prepare("INSERT INTO quotes (id, json, created_at) VALUES (?, ?, ?)").run(q.id, JSON.stringify(q), q.createdAt);
  return q;
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

function requireOutletScope(id: Identity, hotelId: string, lines: readonly { outletId: string }[]) {
  if (id.kind === "person" && !allowsOutlets(id.person, hotelId, lines.map((line) => line.outletId)))
    throw new GatewayRefusal(403, { error: "forbidden", message: "This order is outside your hotel or outlet scope", rules: [fire("MAN-03", { actor: id.person.name, site: "the requested outlets" })] });
}

/** Agent-mediated builder names remain useful, but are not authenticated people. */
function riskDecisionBy(id: Identity, claimed?: string): string {
  if (id.kind === "person") return id.person.name;
  if (id.kind === "agent") return claimed ? `${id.name} on behalf of ${claimed} (unverified)` : id.name;
  return id.name;
}

export async function createQuote(id: Identity, body: QuoteCreateBody, actor?: Actor): Promise<Quote> {
  const hotelId = requireHotel(id);
  requireOutletScope(id, hotelId, body.lines);
  if (!isCalendarDate(body.deliveryDate))
    throw new GatewayRefusal(400, { error: "invalid", message: "Choose a valid delivery date (YYYY-MM-DD)." });
  const mandate = getMandate(hotelId);
  if (!mandate.sites.some((s) => s.id === body.siteId))
    throw new GatewayRefusal(403, { error: "forbidden", message: `Site ${body.siteId} is not one of this hotel's delivery sites`, rules: [fire("DLV-05", { site: body.siteId })] });
  const { map, fallback } = await lookupMap(body.lines.map((l) => l.productId), body.deliveryDate);
  const q = buildQuote({ hotelId, body, lookups: map });
  saveQuote(q);
  audit({
    actor: actor ?? actorOf(id),
    action: "quote_created",
    summary: `Quote ${q.id}: ${q.lines.length} lines, ${eur(q.totalExVat)} ex VAT, outcome ${q.outcome}${fallback ? ` (${fallback})` : ""}`,
    eventId: q.eventId,
    quoteId: q.id,
    ruleIds: [...q.lines.flatMap((l) => l.rules.map((r) => r.ruleId)), ...q.mandateCheck.rules.map((r) => r.ruleId)].filter((r) => !dietaryRule(r)),
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

const missingAllergenLines = (q: Quote) => q.lines.filter((l) => l.rules.some((r) => r.ruleId === "ALG-03"));
const dietaryRule = (id: string) => id.startsWith("ALG-") || id.startsWith("DIET-");

/** D35 is an authenticated chef decision, never a finance grant or an agent's assertion. */
export function acknowledgeAllergenData(id: Identity, body: AllergenAcknowledgementBody): AllergenAcknowledgement {
  if (id.kind !== "person" || id.person.role !== "chef")
    throw new GatewayRefusal(403, { error: "forbidden", message: "Only the chef can continue with allergen data not confirmed" });
  const q = getQuote(body.quoteId);
  const reviewedLines = q.lines.filter((l) => body.productIds.includes(l.productId) && (!body.outletId || l.outletId === body.outletId));
  if (q.hotelId !== id.hotelId || reviewedLines.some((l) => !id.person.hotelScope && !id.person.outlets.includes(l.outletId)))
    throw new GatewayRefusal(403, { error: "forbidden", message: "These terms are outside the chef's hotel or outlet scope" });
  if (q.fingerprint !== body.fingerprint || new Date(q.expiresAt) <= now())
    throw new GatewayRefusal(409, { error: "quote_stale", message: "Review the current terms before continuing with missing allergen data" });
  const hard = [...(q.outcome === "block" ? q.lines.flatMap((l) => l.rules).filter((r) => r.outcome === "block") : []), ...q.lines.flatMap((l) => {
    const p = getProduct(l.productId);
    return (p ? productRules(p, l.requires, "this line", getMandate(q.hotelId)) : []).filter((r) => r.outcome === "block");
  })];
  if (hard.length) throw new GatewayRefusal(409, { error: "hard_rule", message: "Blocked dietary or supplier terms cannot be acknowledged", rules: hard });
  const productIds = [...new Set(body.productIds)].sort();
  if (productIds.some((p) => !missingAllergenLines(q).some((l) => l.productId === p && (!body.outletId || l.outletId === body.outletId))))
    throw new GatewayRefusal(422, { error: "invalid", message: "Acknowledge only products with missing allergen declarations on this quote" });
  const result = { fingerprint: q.fingerprint, productIds, ...(body.outletId ? { outletId: body.outletId } : {}), personId: id.person.id, by: id.person.name, at: nowIso(), expiresAt: q.expiresAt };
  const token = signJwt("aimo-allergen-ack+jwt", { ...result, eventId: q.eventId }, { sub: q.hotelId, expiresAt: q.expiresAt });
  audit({ actor: actorOf(id), action: "line_verdict_set", summary: `${id.person.name} continued: allergen data not confirmed for ${q.lines.filter((l) => productIds.includes(l.productId)).map((l) => l.productName).join(", ")}. Safety is not confirmed.`, eventId: q.eventId, quoteId: q.id, ruleIds: ["ALG-03"], details: { kind: "allergen_data_acknowledgement", ...result }, visibility: "hotel", usesFixture: q.usesFixtures });
  return { ...result, token };
}

/** Verify the signature, person, scope, expiry and exact rechecked terms at commit. */
function allergenDecisions(q: Quote, tokens: string[] = []): Map<string, NonNullable<OrderLine["allergenDataAcknowledgement"]>> {
  const decisions = new Map<string, NonNullable<OrderLine["allergenDataAcknowledgement"]>>();
  for (const token of tokens) {
    const c = verifyJwt(token, "aimo-allergen-ack+jwt");
    const person = c && typeof c.personId === "string" ? getPerson(c.personId) : null;
    if (!c || c.sub !== q.hotelId || c.eventId !== q.eventId || c.fingerprint !== q.fingerprint || !(c.exp > now().getTime() / 1000) || !(c.nbf <= now().getTime() / 1000) ||
      !person || person.hotelId !== q.hotelId || person.role !== "chef" || !Array.isArray(c.productIds)) continue;
    for (const l of missingAllergenLines(q)) if (c.productIds.includes(l.productId) && (!c.outletId || c.outletId === l.outletId) && (person.hotelScope || person.outlets.includes(l.outletId)))
      decisions.set(`${l.productId}|${l.outletId}`, { fingerprint: c.fingerprint, personId: person.id, by: person.name, at: c.at });
  }
  return decisions;
}

function requireAllergenDecisions(q: Quote, tokens?: string[]) {
  const decisions = allergenDecisions(q, tokens);
  if (missingAllergenLines(q).some((l) => !decisions.has(`${l.productId}|${l.outletId}`)))
    throw new GatewayRefusal(409, { error: "allergen_data_unconfirmed", message: "Allergen data not confirmed. The chef must explicitly continue with these exact terms or choose another product.", newQuoteId: q.id });
  return decisions;
}

function auditAllergenConcerns(q: Quote, order: Order, actor: Actor) {
  const lines = order.lines.filter((l) => !l.removed && l.allergenDataAcknowledgement);
  if (lines.length) audit({ actor, action: "line_verdict_set", summary: `Allergen data not confirmed: ${lines.map((l) => l.productName).join(", ")}. Chef continuation retained; safety is not confirmed.`, eventId: q.eventId, quoteId: q.id, orderId: order.id, ruleIds: ["ALG-03"], details: { lines: lines.map((l) => ({ productId: l.productId, requires: l.requires, acknowledgement: l.allergenDataAcknowledgement })) }, visibility: "hotel", usesFixture: q.usesFixtures });
}

// ---------- approvals (AP-07, AP2-style CartMandate) ----------

export async function createApproval(id: Identity, body: ApprovalBody): Promise<Approval> {
  if (id.kind !== "person" || id.person.role !== "approver")
    throw new GatewayRefusal(403, { error: "forbidden", message: "Only a person with the Approver role can approve" });
  const q = getQuote(body.quoteId);
  if (q.hotelId !== id.hotelId) throw new GatewayRefusal(403, { error: "forbidden", message: "Quote belongs to another hotel" });
  requireOutletScope(id, q.hotelId, q.lines);
  if (q.fingerprint !== body.fingerprint)
    throw new GatewayRefusal(409, { error: "mandate_violation", message: "The approval doesn't match this quote version", rules: [fire("MAN-04", {})] });
  if (q.outcome === "block") {
    const hard = q.lines.flatMap((l) => l.rules).filter((r) => r.outcome === "block");
    throw new GatewayRefusal(409, { error: "hard_rule", message: "A blocked line can't be approved. Fix or remove it first.", rules: hard });
  }
  if (new Date(q.expiresAt).getTime() <= now().getTime())
    throw new GatewayRefusal(409, { error: "quote_stale", message: "The quote has expired; request a new one" });
  const context = q as StoredQuote;
  const { map } = await lookupMap(q.lines.map((l) => l.productId), q.deliveryDate);
  if (new Date(q.expiresAt).getTime() <= now().getTime())
    throw new GatewayRefusal(409, { error: "quote_stale", message: "The quote expired before approval; request a new one" });
  const order = context.amendsOrderId ? getOrder(context.amendsOrderId) : undefined;
  if (order && (order.hotelId !== q.hotelId || order.version !== context.amendmentVersion))
    throw new GatewayRefusal(409, { error: "quote_stale", message: "The order changed before amendment approval" });
  const fixedPrices = new Map<string, number>();
  if (order) for (const line of q.lines) {
    const previous = order.lines.find((l) => !l.removed && l.productId === line.productId && l.outletId === line.outletId && l.quantity === line.quantity);
    if (previous?.unitPrice != null) fixedPrices.set(`${line.productId}|${line.outletId}`, previous.unitPrice);
  }
  const fresh = buildQuote({ hotelId: q.hotelId, body: quoteBody(q), lookups: map, fixedPrices, amendsOrderId: context.amendsOrderId });
  if (order) { fresh.amendmentVersion = order.version; preserveSpendApproval(fresh, order); }
  const changes = recheck(q, fresh, now(), order);
  if (changes.length) throw new GatewayRefusal(409, { error: "quote_stale", message: "Terms changed before approval", changes, newQuoteId: saveQuote(fresh).id });
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

/** Compare a fresh rule evaluation, not just a subset of the old snapshot. */
function recheck(q: Quote, fresh: Quote, at: Date, amending?: Order): Record<string, unknown>[] {
  const changes: Record<string, unknown>[] = [];
  const quantities = new Map<string, number>();
  for (const line of q.lines) quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity);
  for (const [i, l] of q.lines.entries()) {
    const f = fresh.lines[i];
    const previous = amending?.lines.find((line) => !line.removed && line.productId === l.productId && line.outletId === l.outletId);
    const changed = !previous || previous.quantity !== l.quantity;
    const grew = !previous || previous.quantity < l.quantity;
    for (const field of ["unitPrice", "taxRate", "availableDate", "closingTime", "salesUnit", "priceValidTo", "logisticModel", "allergenEvidence"] as const)
      if (f[field] !== l[field]) changes.push({ productId: l.productId, field, was: l[field], now: f[field] });
    if (f.stock.kind !== l.stock.kind || (f.stock.kind === "unknown" && l.stock.kind === "unknown" && f.stock.reason !== l.stock.reason) ||
      (grew && fresh.urgent && f.stock.kind === "known" && f.stock.amount < quantities.get(l.productId)!))
      changes.push({ productId: l.productId, field: "stock", was: l.stock, now: f.stock });
    const c = supplierTime(f.closingTime);
    if (changed && c && c.getTime() <= at.getTime()) changes.push({ productId: l.productId, field: "cutoff", now: f.closingTime, passed: true });
    for (const rule of f.rules.filter((r) => r.outcome === "block" && (r.ruleId === "CUT-01" ? changed : r.ruleId === "STK-04" ? grew : true)))
      changes.push({ productId: l.productId, field: "rule", ruleId: rule.ruleId, now: rule.message });
  }
  if (stableStringify(fresh.mandateCheck) !== stableStringify(q.mandateCheck) ||
    stableStringify(fresh.unconfirmedStock) !== stableStringify(q.unconfirmedStock) ||
    (q as StoredQuote).stockPolicy !== (fresh as StoredQuote).stockPolicy) changes.push({ field: "policy", now: fresh.mandateCheck });
  return changes;
}

function approvalCovers(q: Quote, approvalId: string | undefined): { ok: boolean; reason?: string } {
  const needed = q.mandateCheck.approvalsNeeded;
  if (!needed.length) return { ok: true };
  if (!approvalId) return { ok: false, reason: "no approval presented" };
  const a = getJson<Approval>("approvals", approvalId);
  if (!a) return { ok: false, reason: "approval not found" };
  if (!approvalValid(a)) return { ok: false, reason: "approval signature invalid" };
  if (a.quoteId !== q.id || a.fingerprint !== q.fingerprint) return { ok: false, reason: "approval is for a different quote version" };
  const missing = needed.filter((n) => !a.grants.includes(n));
  if (missing.length) return { ok: false, reason: `approval doesn't cover ${missing.join(", ")}` };
  return { ok: true };
}

export async function placeOrder(id: Identity, quoteId: string, idemKey: string, approvalId?: string, actor?: Actor, stock: { continueWith?: string[]; decidedBy?: string; allergenAcknowledgements?: string[] } = {}): Promise<{ order: Order; replay: boolean }> {
  const hotelId = requireHotel(id);
  if (!idemKey) throw new GatewayRefusal(400, { error: "invalid", message: "Idempotency-Key header is required" });
  const continued = [...new Set(stock.continueWith ?? [])].sort();
  const bodyHash = sha256(stableStringify({ quoteId, approvalId: approvalId ?? null, hotelId, continued, ...(stock.allergenAcknowledgements?.length ? { allergenAcknowledgements: [...stock.allergenAcknowledgements].sort() } : {}) }));
  const existing = getDb().prepare("SELECT json, body_hash FROM orders WHERE idem_key = ?").get(idemKey) as { json: string; body_hash: string } | undefined;
  if (existing) {
    if (existing.body_hash !== bodyHash) throw new GatewayRefusal(422, { error: "idempotency_conflict", message: "This Idempotency-Key was used with a different body; the first order is untouched" });
    const order = JSON.parse(existing.json) as Order;
    // Replaying another caller's order must still respect this person's scope.
    requireOutletScope(id, hotelId, order.lines);
    return { order, replay: true };
  }
  const q = getQuote(quoteId);
  if (q.hotelId !== hotelId) throw new GatewayRefusal(403, { error: "forbidden", message: "Quote belongs to another hotel" });
  requireOutletScope(id, hotelId, q.lines);
  if ((q as StoredQuote).amendsOrderId)
    throw new GatewayRefusal(409, { error: "invalid", message: "Use this amendment quote only to amend its existing order" });
  const by = actor ?? actorOf(id);
  const refuse = (status: number, r: Refusal): never => {
    audit({ actor: by, action: "order_refused", summary: `Order on ${q.id} refused: ${r.error}: ${r.message}`, eventId: q.eventId, quoteId: q.id, ruleIds: r.rules?.map((x) => x.ruleId), details: { error: r.error, approvalsNeeded: r.approvalsNeeded, changes: r.changes }, visibility: r.error === "allergen_data_unconfirmed" || r.rules?.some((x) => dietaryRule(x.ruleId)) || r.changes?.some((c) => c.field === "allergenEvidence" || dietaryRule(String(c.ruleId))) ? "hotel" : "shared", usesFixture: q.usesFixtures });
    throw new GatewayRefusal(status, r);
  };
  let at = now();
  // Hard rules first: no approval can push a blocked line through (AP-04).
  const hard = q.lines.flatMap((l) => l.rules).filter((r) => r.outcome === "block");
  for (const line of q.lines) {
    const product = getProduct(line.productId);
    if (product) hard.push(...productRules(product, line.requires, "this line", getMandate(hotelId)).filter((r) => r.outcome === "block"));
  }
  if (hard.length) refuse(409, { error: hard.some((r) => r.ruleId === "CUT-01") ? "cutoff_passed" : "hard_rule", message: hard.map((r) => r.message).join(" "), rules: hard });
  if (new Date(q.expiresAt).getTime() <= at.getTime()) refuse(409, { error: "quote_stale", message: "The quote has expired; request a new one" });
  const { map } = await lookupMap(q.lines.map((l) => l.productId), q.deliveryDate);
  at = now(); // Supplier I/O may cross the quote expiry or a cut-off.
  if (new Date(q.expiresAt).getTime() <= at.getTime()) refuse(409, { error: "quote_stale", message: "The quote has expired; request a new one" });
  const fresh = buildQuote({ hotelId, body: quoteBody(q), lookups: map });
  const changes = recheck(q, fresh, at);
  if (changes.length) {
    const nq = saveQuote(fresh);
    const cutoff = changes.some((c) => c.field === "cutoff");
    refuse(409, { error: cutoff ? "cutoff_passed" : "quote_stale", message: cutoff ? "A cut-off passed since the quote" : "Terms changed since the quote", changes, newQuoteId: nq.id });
  }
  let allergenData: ReturnType<typeof requireAllergenDecisions>;
  try { allergenData = requireAllergenDecisions(fresh, stock.allergenAcknowledgements); }
  catch (err) { if (err instanceof GatewayRefusal) refuse(err.status, { ...err.body, newQuoteId: q.id }); throw err; }
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
  const order: StoredOrder = {
    id: newId("ord"),
    quoteId: q.id,
    hotelId,
    siteId: q.siteId,
    eventId: q.eventId,
    deliveryDate: q.deliveryDate,
    state: "placed",
    lines: fresh.lines.map(
      (l): OrderLine => ({
        ...l,
        removed: false,
        riskAccepted: l.stock.kind === "unknown" ? { by: continued.includes(l.productId) ? riskDecisionBy(id, stock.decidedBy) : "pre-answer", at: at.toISOString() } : null,
        ...(allergenData.get(`${l.productId}|${l.outletId}`) ? { allergenDataAcknowledgement: allergenData.get(`${l.productId}|${l.outletId}`)! } : {}),
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
    stockPolicy: fresh.stockPolicy,
  };
  // Two requests may both finish their supplier lookup before either writes.
  // Resolve same-key retries and consume each quote once inside the transaction.
  const raced = tx(() => {
    const row = getDb().prepare("SELECT json, body_hash FROM orders WHERE idem_key = ?").get(idemKey) as { json: string; body_hash: string } | undefined;
    if (row) {
      if (row.body_hash !== bodyHash) refuse(422, { error: "idempotency_conflict", message: "This Idempotency-Key was used with a different body; the first order is untouched" });
      const previous = JSON.parse(row.json) as Order;
      requireOutletScope(id, hotelId, previous.lines);
      return previous;
    }
    if (getDb().prepare("SELECT id FROM orders WHERE quote_id = ?").get(q.id))
      refuse(409, { error: "quote_consumed", message: "This quote already has an order. Retry with the original Idempotency-Key to retrieve it, or request a new quote for another order." });
    Object.assign(order, signOrder(order));
    getDb().prepare("INSERT INTO orders (id, quote_id, event_id, idem_key, body_hash, json) VALUES (?, ?, ?, ?, ?, ?)").run(order.id, q.id, q.eventId, idemKey, bodyHash, JSON.stringify(order));
    return null;
  });
  if (raced) return { order: raced, replay: true };
  auditAllergenConcerns(q, order, by);
  audit({
    actor: by,
    action: "order_placed",
    summary: `Order ${order.id} placed: ${order.lines.length} lines, ${eur(order.totalExVat)} ex VAT, delivery ${order.deliveryDate}${approval ? `, approved by ${approval.approvedBy.name}` : ", inside the mandate"}`,
    eventId: q.eventId,
    quoteId: q.id,
    orderId: order.id,
    ruleIds: q.lines.flatMap((l) => l.rules.map((r) => r.ruleId)).filter((r) => !dietaryRule(r)),
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
  requireOutletScope(id, hotelId, [...o.lines.filter((line) => !line.removed), ...body.changes]);
  const by = actor ?? actorOf(id);
  let at = now();
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
    const change = body.changes.find((c) => key(c.productId, c.outletId) === k);
    return { productId, outletId, quantity: qty, ref: current.get(k)?.ref ?? undefined, requires: change?.requires ?? current.get(k)?.requires, allergenScope: change?.allergenScope ?? current.get(k)?.allergenScope };
  });
  if (!lines.length) throw new GatewayRefusal(422, { error: "invalid", message: "An amendment can't remove every line; cancel the order instead" });
  const { map } = await lookupMap(lines.map((l) => l.productId), o.deliveryDate);
  at = now();
  if (getOrder(o.id).version !== o.version)
    throw new GatewayRefusal(409, { error: "quote_stale", message: "The order changed during the amendment; reload it before retrying" });
  for (const change of body.changes) {
    const previous = current.get(key(change.productId, change.outletId));
    const cutoff = supplierTime(previous?.closingTime);
    if (previous && previous.quantity !== change.quantity && cutoff && cutoff <= at && next.get(key(change.productId, change.outletId)) !== previous.quantity)
      throw new GatewayRefusal(409, { error: "cutoff_passed", message: "A changed line's cut-off passed during the amendment" });
  }
  const q = buildQuote({ hotelId, body: { siteId: o.siteId, deliveryDate: o.deliveryDate, eventId: o.eventId ?? undefined, lines }, lookups: map, amendsOrderId: o.id, fixedPrices });
  q.amendmentVersion = o.version;
  // A spend-cap approval already covers the order up to its current total: an amendment that
  // doesn't raise the total needs no new one (edge case in chunk 05: only going over asks again).
  preserveSpendApproval(q, o);
  // D31: carry the builder's decision only for the same line, quantity,
  // supplier terms and hotel policy. Consent for a SKU is not consent for more.
  const sameReview = (a: QuoteLine, b: QuoteLine) => stableStringify([
    a.quantity, a.salesUnit, a.unitPrice, a.taxRate, a.availableDate, a.closingTime, a.priceValidTo, a.stock, a.logisticModel, a.requires,
  ]) === stableStringify([
    b.quantity, b.salesUnit, b.unitPrice, b.taxRate, b.availableDate, b.closingTime, b.priceValidTo, b.stock, b.logisticModel, b.requires,
  ]);
  const inherited = new Map(q.lines.flatMap((l) => {
    const previous = current.get(key(l.productId, l.outletId));
    return previous?.riskAccepted && (o as StoredOrder).stockPolicy === q.stockPolicy && sameReview(previous, l)
      ? [[key(l.productId, l.outletId), previous.riskAccepted] as const] : [];
  }));
  const continued = new Set(body.continueWithUnconfirmedStock ?? []);
  const missingStock = q.unconfirmedStock.filter((p) => !continued.has(p) && q.lines.some((l) => l.productId === p && !inherited.has(key(l.productId, l.outletId))));
  // A past cut-off blocks only the lines this amendment changes or adds; locked lines stay as they are.
  const touched = new Set(body.changes.filter((c) => current.get(key(c.productId, c.outletId))?.quantity !== c.quantity).map((c) => key(c.productId, c.outletId)));
  // Stock is checked only where the amendment asks for more than before; a decrease never makes a shortage worse.
  const grew = (l: QuoteLine) => (current.get(key(l.productId, l.outletId))?.quantity ?? 0) < l.quantity;
  const blocked = [...q.mandateCheck.rules.filter((r) => r.outcome === "block"), ...q.lines.flatMap((l) =>
    l.rules.filter((r) => r.outcome === "block" && (r.ruleId === "CUT-01" ? touched.has(key(l.productId, l.outletId)) : r.ruleId === "STK-04" ? grew(l) : true)),
  )];
  q.outcome = blocked.length ? "block" : missingAllergenLines(q).length ? "ask_chef" : q.mandateCheck.approvalsNeeded.length ? "ask_approver" : "order";
  saveQuote(q);
  if (blocked.length) throw new GatewayRefusal(409, { error: "hard_rule", message: blocked.map((r) => r.message).join(" "), rules: blocked });
  if (body.quoteOnly) return { order: o, quote: q };
  let allergenData: ReturnType<typeof requireAllergenDecisions>;
  try { allergenData = requireAllergenDecisions(q, body.allergenAcknowledgements); }
  catch (err) {
    audit({ actor: by, action: "order_refused", summary: "Amendment refused: allergen data not confirmed. The chef must review the current terms.", eventId: o.eventId, orderId: o.id, quoteId: q.id, ruleIds: ["ALG-03"], details: {}, visibility: "hotel" });
    throw err;
  }
  if (body.stockQuoteId && continued.size) {
    const reviewed = getJson<StoredQuote>("quotes", body.stockQuoteId);
    if (!reviewed || reviewed.hotelId !== hotelId || reviewed.amendsOrderId !== o.id || reviewed.amendmentVersion !== o.version ||
      reviewed.fingerprint !== q.fingerprint || reviewed.stockPolicy !== q.stockPolicy || new Date(reviewed.expiresAt).getTime() <= at.getTime())
      throw new GatewayRefusal(409, { error: "stock_unconfirmed", message: "The amendment changed since the builder reviewed its unconfirmed stock. Review the current terms again.", newQuoteId: q.id });
  }
  if (missingStock.length)
    throw new GatewayRefusal(409, { error: "stock_unconfirmed", message: `Valio Aimo can't confirm stock for ${missingStock.join(", ")}. List them in continueWithUnconfirmedStock to change the order anyway.`, newQuoteId: q.id });
  if (q.mandateCheck.approvalsNeeded.length) {
    const a = body.approvalId ? getJson<Approval>("approvals", body.approvalId) : null;
    const approvedQuote = a ? getJson<StoredQuote>("quotes", a.quoteId) : null;
    const ok = a && approvedQuote && approvedQuote.hotelId === hotelId && approvedQuote.amendsOrderId === o.id &&
      approvedQuote.amendmentVersion === o.version && approvedQuote.stockPolicy === q.stockPolicy &&
      approvalValid(a) && a.fingerprint === q.fingerprint && q.mandateCheck.approvalsNeeded.every((n) => a.grants.includes(n));
    if (!ok) {
      audit({ actor: by, action: "order_refused", summary: `Amendment to ${o.id} needs an approval (${q.mandateCheck.approvalsNeeded.join(", ")})`, eventId: o.eventId, orderId: o.id, quoteId: q.id, ruleIds: q.mandateCheck.rules.map((r) => r.ruleId), details: { approvalsNeeded: q.mandateCheck.approvalsNeeded }, visibility: "shared" });
      throw new GatewayRefusal(409, { error: "mandate_violation", message: `The amendment needs an approval bound to quote ${q.id}`, approvalsNeeded: q.mandateCheck.approvalsNeeded, rules: q.mandateCheck.rules, newQuoteId: q.id });
    }
  }
  const prevLines = new Map(o.lines.map((l) => [key(l.productId, l.outletId), l]));
  const newLines: OrderLine[] = q.lines.map((l) => {
    return {
      ...l,
      removed: false,
      riskAccepted: l.stock.kind === "unknown" ? inherited.get(key(l.productId, l.outletId)) ?? { by: continued.has(l.productId) ? riskDecisionBy(id, body.decidedBy) : "pre-answer", at: at.toISOString() } : null,
      ...(allergenData.get(key(l.productId, l.outletId)) ? { allergenDataAcknowledgement: allergenData.get(key(l.productId, l.outletId))! } : {}),
    };
  });
  for (const [k, l] of prevLines) if (!next.has(k) && !l.removed) newLines.push({ ...l, removed: true });
  const updated: StoredOrder = { ...o, lines: newLines, totalExVat: q.totalExVat, totalVat: q.totalVat, state: "amended", version: o.version + 1, stockPolicy: q.stockPolicy };
  Object.assign(updated, signOrder(updated));
  saveOrder(updated);
  auditAllergenConcerns(q, updated, by);
  audit({
    actor: by,
    action: "order_amended",
    summary: `Order ${o.id} amended to v${updated.version}: ${body.changes.map((c) => `${c.productId} → ${c.quantity}`).join(", ")}; total ${eur(updated.totalExVat)}`,
    eventId: o.eventId,
    orderId: o.id,
    quoteId: q.id,
    ruleIds: [...refusedLines.map((r) => r.ruleId), ...q.mandateCheck.rules.map((r) => r.ruleId)],
    details: { changes: body.changes.map(({ productId, outletId, quantity }) => ({ productId, outletId, quantity })), refused: refusedLines.map((r) => r.facts), approvalId: body.approvalId ?? null },
    visibility: "shared",
  });
  return { order: updated, quote: q };
}
