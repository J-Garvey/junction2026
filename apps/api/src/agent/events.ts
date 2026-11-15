/**
 * Events through the four scenes (D4, D8): viability months ahead, the order,
 * the change ~2–3 weeks out and the final check before the cut-off. Chunk 07:
 * ORDER-DIFF, CHANGE-APPLY, ALLERGY-RECHECK, FINAL-CHECK, SHORTFALL-RESOLVE,
 * SUBSTITUTE-FIND, SILENCE-RESOLVE, COVERAGE-SUMMARY. EDIT-GUARD for events.
 */
import { hasUnconfirmedAllergenData, type EventSpec, type Order, type PlanLine, type Question, type WarningRecord, type DietGroup, type Need, type Quote, type AmendmentBody, type StageProcessing } from "@aimo/contracts";
import { getDb, getJson, allJson } from "../db.js";
import { now, nowIso } from "../clock.js";
import { getProduct, getRaw, searchProducts } from "../catalog.js";
import { audit, AGENT, decisionCount } from "../audit.js";
import { fire, outcomeOf } from "../rules/catalogue.js";
import { policyParams } from "../rules/policy.js";
import { dietRules, allergenName, packContent } from "../rules/checks.js";
import { typeCheck } from "./judge.js";
import { newId, round2, fmtHelsinki, parseAimoTime, eur, shortName } from "../util.js";
import { gw, GatewayError } from "./gatewayClient.js";
import { makeQuestion, saveQuestion, allQuestions } from "./questions.js";
import { newPlan, quoteAndDecide, viability, savePlan, getPlan, runPipeline, mandate, type StoredPlan, emptyOverrides } from "./plan.js";
import { recallSubstitute } from "./memory.js";
import { specCompare } from "./sidebyside.js";
import { pieceCostToCover } from "./match.js";
import { toBase } from "./parse.js";
import type { Person } from "../identity.js";
import { allergenQuestionText, constraintsForLine, eventAllergenScope, lineAllergenScope, missingAllergenProducts } from "./allergenData.js";

export type StoredEvent = EventSpec & {
  processing?: StageProcessing;
  version: number;
  removedNeeds: string[];
  viabilityPlanId: string | null;
  orderPlanId: string | null;
  orderedGuests: number | null;
  lastDiff: DiffLine[] | null;
  finalCheck: { at: string; summary: string; lines: { productId: string; productName: string; result: string; detail: string }[] } | null;
  changes: { at: string; by: string; what: string }[];
};
export type DiffLine = { productId: string; productName: string; outletId: string; was: number; now: number; unit: string | null; change: "added" | "removed" | "up" | "down" | "unchanged" | "needs_substitute" };

export class EditConflict extends Error {
  constructor(public current: StoredEvent) {
    super("The event changed since you opened it");
  }
}

export const getEvent = (id: string) => getJson<StoredEvent>("events", id);
export const listEvents = () => allJson<StoredEvent>("SELECT json FROM events ORDER BY id");
export function saveEvent(e: StoredEvent) {
  getDb().prepare("INSERT INTO events (id, json, version) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, version = excluded.version").run(e.id, JSON.stringify(e), e.version);
}

/** EDIT-GUARD (TM-07): an edit made against an old version is refused with what changed. */
export function editEvent(id: string, baseVersion: number, by: string, what: string, mutate: (e: StoredEvent) => void): StoredEvent {
  const e = getEvent(id);
  if (!e) throw new Error("No such event");
  if (e.version !== baseVersion) throw new EditConflict(e);
  const previousAllergenScope = eventAllergenScope(e);
  mutate(e);
  if (eventAllergenScope(e) !== previousAllergenScope) {
    for (const q of allQuestions().filter((q) => q.eventId === id && (q.state === "open" || q.state === "waiting") &&
      (q.type === "missing_allergen_data" || Array.isArray(q.facts.allergenAcknowledgements) && q.facts.allergenAcknowledgements.length))) {
      q.state = "replaced";
      saveQuestion(q);
    }
  }
  e.version += 1;
  e.changes.push({ at: nowIso(), by, what });
  saveEvent(e);
  return e;
}

const by = (p: Person) => ({ personId: p.id, name: p.name });

// ---------- scene 1 and 2 ----------

export async function runViability(eventId: string, p: Person) {
  const e = getEvent(eventId)!;
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds } });
  await viability(plan);
  e.viabilityPlanId = plan.id;
  saveEvent(e);
  return plan;
}

export async function orderEvent(eventId: string, p: Person) {
  const e = getEvent(eventId)!;
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds } });
  audit({ actor: personActor(p), action: "request_received", summary: `${p.name} asked to order ${e.name}`, eventId, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
  await quoteAndDecide(plan);
  e.orderPlanId = plan.id;
  e.orderedGuests = e.guests;
  saveEvent(e);
  return plan;
}

/** Remove a red line for one group: the chef fixes or removes it before ordering (Q05.3). */
export function removeNeed(eventId: string, needId: string, baseVersion: number, p: Person) {
  return editEvent(eventId, baseVersion, p.name, `Removed ${needId}`, (e) => {
    if (!e.removedNeeds.includes(needId)) e.removedNeeds.push(needId);
  });
}

export const personActor = (p: Person) => ({ kind: "person" as const, id: p.id, name: p.name, role: p.role, outletId: p.outlets[0] ?? null, testSession: true });

// ---------- scene 3: changes ----------

function orderedLines(e: StoredEvent): { order: Order; plan: StoredPlan } | null {
  const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
  return plan ? ({ plan, order: null as unknown as Order }) : null;
}

async function currentOrders(eventId: string): Promise<Order[]> {
  return (await gw.orders(eventId)).orders;
}

/** ORDER-DIFF: per product and outlet, compared by product ID. */
export function orderDiff(order: Order, plan: StoredPlan): DiffLine[] {
  const out: DiffLine[] = [];
  const next = new Map<string, { qty: number; name: string; unit: string | null; red: boolean }>();
  for (const l of plan.lines.filter((x) => !x.removed)) {
    if (!l.productId) {
      for (const n of l.needIds) out.push({ productId: n, productName: l.productName, outletId: l.outletId, was: 0, now: 0, unit: null, change: "needs_substitute" });
      continue;
    }
    const k = `${l.productId}|${l.outletId}`;
    const prev = next.get(k);
    next.set(k, { qty: (prev?.qty ?? 0) + l.quantity, name: l.productName, unit: l.salesUnit, red: l.verdict === "red" });
  }
  const seen = new Set<string>();
  for (const ol of order.lines.filter((x) => !x.removed)) {
    const k = `${ol.productId}|${ol.outletId}`;
    seen.add(k);
    const n = next.get(k);
    const nowQ = n?.qty ?? 0;
    out.push({ productId: ol.productId, productName: ol.productName, outletId: ol.outletId, was: ol.quantity, now: nowQ, unit: ol.salesUnit, change: nowQ === ol.quantity ? "unchanged" : nowQ === 0 ? "removed" : nowQ > ol.quantity ? "up" : "down" });
  }
  for (const [k, n] of next) if (!seen.has(k)) {
    const [productId, outletId] = k.split("|");
    out.push({ productId, productName: n.name, outletId, was: 0, now: n.qty, unit: n.unit, change: "added" });
  }
  return out;
}

/** CHANGE-APPLY (AP-08): inside the hotel's tolerance, amend with no human; otherwise one Approver question. */
export async function changeGuests(eventId: string, guests: number, baseVersion: number, p: Person) {
  return changeEvent(eventId, { guests }, baseVersion, p);
}

/**
 * Scene 3: a new guest count and a new allergy arrive together. The allergy is checked
 * first (D28); while a conflict is open the change waits, so the Approver sees one card
 * for the whole change, not one per step.
 */
export async function changeEvent(eventId: string, change: { guests?: number; group?: DietGroup }, baseVersion: number, p: Person) {
  const before = getEvent(eventId)!;
  const what = [change.guests !== undefined && change.guests !== before.guests ? `Guests ${before.guests} → ${change.guests}` : null, change.group ? `${change.group.label} (${change.group.count})` : null].filter(Boolean).join(", ");
  const e = editEvent(eventId, baseVersion, p.name, what || "No change", (x) => {
    if (change.guests !== undefined) x.guests = change.guests;
    if (change.group && !x.dietGroups.some((g) => g.id === change.group!.id)) x.dietGroups.push(change.group);
  });
  const created = change.group ? await allergyRecheck(e, change.group) : [];
  if (warnings(eventId).some((w) => w.state === "open")) {
    return { applied: false, held: true, reason: "Allergy first", warnings: created, diff: [] as DiffLine[], event: getEvent(eventId)! };
  }
  return { ...(await applyChange(getEvent(eventId)!, p, what)), warnings: created, event: getEvent(eventId)! };
}

async function applyChange(e: StoredEvent, p: Person, what: string) {
  const m = mandate();
  const orders = await currentOrders(e.id);
  const order = orders.find((o) => o.state !== "rejected");
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId: e.id, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds, stockBlind: true } });
  await runPipeline(plan);
  savePlan(plan);
  if (!order) {
    e.lastDiff = null;
    saveEvent(e);
    return { applied: false, reason: "No order placed yet; the next order uses the new numbers.", diff: [] as DiffLine[] };
  }
  const diff = orderDiff(order, plan);
  e.lastDiff = diff;
  saveEvent(e);
  const base = e.orderedGuests ?? e.guests;
  const pct = base ? ((e.guests - base) / base) * 100 : 100;
  const changes: AmendmentBody["changes"] = diff.filter((d) => d.change !== "needs_substitute").map((d) => {
    const line = plan.lines.find((l) => l.productId === d.productId && l.outletId === d.outletId);
    return { productId: d.productId, outletId: d.outletId, quantity: d.now, ...(line ? { requires: constraintsForLine(plan, line), allergenScope: lineAllergenScope(plan, line) } : {}) };
  });
  // A product added by a person's choice (a replacement) carries that person's D31 decision on its stock.
  const continueWith = diff.filter((d) => d.change === "added" && plan.lines.some((l) => l.productId === d.productId && l.stock?.kind === "unknown")).map((d) => d.productId);
  (e as StoredEvent & { latestPlanId?: string }).latestPlanId = plan.id;
  saveEvent(e);
  const facts = { from: base, to: e.guests, pct: `${pct >= 0 ? "+" : ""}${round2(pct)}%`, tolerance: `±${m.preAnswers.guestChangeMaxPct}%` };
  const allergyChanged = changes.some((c) => {
    const previous = order.lines.find((l) => !l.removed && l.productId === c.productId && l.outletId === c.outletId);
    return previous?.allergenScope !== c.allergenScope;
  });
  if (diff.every((d) => d.change === "unchanged") && !allergyChanged) {
    audit({ actor: AGENT, action: "order_amended", summary: `${what}: pack rounding means no line changes`, eventId: e.id, ruleIds: ["CHG-01"], details: { diff }, visibility: "hotel" });
    return { applied: true, reason: "No change: pack rounding absorbs it.", diff };
  }
  const within = Math.abs(pct) <= m.preAnswers.guestChangeMaxPct && !diff.some((d) => d.change === "needs_substitute");
  // RULE-POLICY: CHG-01 may be set to always ask, and CHG-02 to refuse changes over tolerance.
  if (!within && outcomeOf("CHG-02") === "block") {
    const reason = `${fire("CHG-02", facts).message} The hotel refuses such changes; the order stays as it is.`;
    audit({ actor: AGENT, action: "order_amended", summary: reason, eventId: e.id, orderId: order.id, ruleIds: ["CHG-02"], details: { diff, refused: true }, visibility: "hotel" });
    return { applied: false, reason, diff };
  }
  // Review the exact amendment before finance sees it. The gateway identifies
  // which unknown lines need fresh consent, preserving unchanged decisions.
  const review = await gw.amend(order.id, { changes, quoteOnly: true });
  plan.quoteId = review.quote.id;
  plan.fingerprint = review.quote.fingerprint;
  savePlan(plan);
  const reviewFacts = { orderId: order.id, changes, diff, continueWith, decidedBy: p.name, ...facts,
    requiresFinance: !within || outcomeOf("CHG-01") !== "order", financeRuleId: within ? "CHG-01" : "CHG-02" };
  const question = askChangeAllergens(e, plan, reviewFacts, review.quote)
    ?? (review.stockReviewRequired.length ? await askChangeStock(e, plan.id, reviewFacts, review.quote.id) : null);
  if (question) return { applied: false, reason: question.body, diff, questionId: question.id };
  if (within && outcomeOf("CHG-01") === "order") {
    try {
      const r = await gw.amend(order.id, { changes, continueWithUnconfirmedStock: continueWith, decidedBy: p.name });
      completeChange(e, plan.id, r.order, r.quote);
      audit({ actor: AGENT, action: "order_amended", summary: fire("CHG-01", facts).message, eventId: e.id, orderId: order.id, ruleIds: ["CHG-01"], details: { diff, version: r.order.version }, visibility: "hotel" });
      return { applied: true, reason: fire("CHG-01", facts).message, diff };
    } catch (err) {
      if (err instanceof GatewayError && err.body.error === "stock_unconfirmed" && err.body.newQuoteId) {
        const question = await askChangeStock(e, plan.id, reviewFacts, err.body.newQuoteId);
        return { applied: false, reason: question.body, diff, questionId: question.id };
      }
      if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation") throw err;
      // Falls through to a question: the gateway needs an approval for this amendment.
    }
  }
  const q = askChangeFinance(e, plan.id, reviewFacts, review.quote);
  return { applied: false, reason: q.body, diff, questionId: q.id };
}

function askChangeFinance(e: StoredEvent, planId: string, facts: Record<string, any>, quote: Quote) {
  const q = makeQuestion({
    planId, eventId: e.id, type: "change_outside_tolerance", forRole: "approver", outletId: null,
    quoteId: quote.id, fingerprint: quote.fingerprint, deadline: quote.expiresAt,
    title: facts.from === facts.to ? "Approve the change?" : `${facts.from} → ${facts.to} guests?`,
    body: `${facts.pct} · ${eur(quote.totalExVat)} ex VAT · the chef has reviewed the product concerns.`,
    facts: { ...facts, kind: "change" }, ruleIds: [facts.financeRuleId ?? "CHG-02"],
    options: [{ id: "approve", label: "Approve the change", primary: true }, { id: "keep", label: "Keep the order as is", primary: false }],
  });
  saveQuestion(q);
  audit({ actor: AGENT, action: "question_asked", summary: `Approver asked: ${q.title}`, eventId: e.id, quoteId: quote.id, questionId: q.id, ruleIds: q.ruleIds, details: { diff: facts.diff }, visibility: "hotel" });
  return q;
}

function askChangeAllergens(e: StoredEvent, plan: StoredPlan, facts: Record<string, unknown>, quote: Quote) {
  const missing = missingAllergenProducts(quote, plan.overrides.allergenAcknowledgements);
  if (!missing.length) return null;
  const outletId = missing[0].outletId;
  const productIds = [...new Set(missing.filter((l) => l.outletId === outletId).map((l) => l.productId))];
  const question = makeQuestion({ planId: plan.id, eventId: e.id, type: "missing_allergen_data", forRole: "chef", outletId,
    quoteId: quote.id, fingerprint: quote.fingerprint, deadline: quote.expiresAt,
    title: "Continue with allergen data not confirmed?", body: allergenQuestionText(plan, productIds, outletId),
    facts: { ...facts, kind: "change_allergens", productIds, eventScope: eventAllergenScope(e), allergenAcknowledgements: plan.overrides.allergenAcknowledgements ?? [] }, ruleIds: ["ALG-03"],
    options: [{ id: "continue", label: "Continue with missing allergen data", primary: true }, { id: "others", label: "Pick another product", primary: false }],
  });
  saveQuestion(question);
  audit({ actor: AGENT, action: "question_asked", summary: question.body, eventId: e.id, quoteId: quote.id, questionId: question.id, ruleIds: ["ALG-03"], details: { planId: plan.id }, visibility: "hotel" });
  return question;
}

type SubstitutionAllocation = { original: string; productId: string; outletId: string; needAmount: PlanLine["needAmount"]; packContent: PlanLine["packContent"] };

function completeChange(e: StoredEvent, planId: string, order: Order, quote?: Quote, substitution?: SubstitutionAllocation) {
  const plan = getPlan(planId);
  if (plan) {
    if (substitution) {
      const added = order.lines.find((l) => !l.removed && l.productId === substitution.productId && l.outletId === substitution.outletId);
      const original = plan.lines.find((l) => l.productId === substitution.original && l.outletId === added?.outletId);
      if (added && original && !plan.lines.some((l) => l.productId === added.productId && l.outletId === added.outletId)) {
        plan.lines.push({ ...original, ...added, id: newId("line"), needAmount: substitution.needAmount, packContent: substitution.packContent,
          overshoot: null, rankStep: null, allocation: "partial", reliability: getProduct(added.productId)?.reliability ?? null,
          verdict: added.stock.kind === "unknown" ? "amber" : "green", status: added.stock.kind === "unknown" ? "unknown_stock" : "covered",
          allergenDataAcknowledgement: added.allergenDataAcknowledgement, carbonBasis: added.carbonBasis ?? null, co2Kg: null,
          shares: original.shares.map((s) => ({ ...s, amount: original.needAmount.value ? round2(s.amount * substitution.needAmount.value / original.needAmount.value) : 0 })),
        });
      }
    }
    plan.orderIds = [order.id];
    plan.approvalId = order.approvalId;
    plan.status = "ordered";
    plan.totalExVat = order.totalExVat;
    plan.totalVat = order.totalVat;
    plan.approvalsNeeded = [];
    if (quote) { plan.quoteId = quote.id; plan.fingerprint = quote.fingerprint; }
    plan.summary = `Changed · ${eur(order.totalExVat)}${order.lines.some((l) => !l.removed && hasUnconfirmedAllergenData(l)) ? " · allergen data not confirmed" : ""}`;
    for (const line of plan.lines) {
      const ordered = order.lines.find((l) => !l.removed && l.productId === line.productId && l.outletId === line.outletId);
      line.allergenDataAcknowledgement = ordered?.allergenDataAcknowledgement;
      line.riskAccepted = ordered?.riskAccepted ?? null;
      if (ordered) {
        line.quantity = ordered.quantity;
        line.unitPrice = ordered.unitPrice;
        line.lineTotal = ordered.lineTotal;
        line.stock = ordered.stock;
      }
    }
    savePlan(plan);
    e.orderPlanId = plan.id;
  }
  e.orderedGuests = e.guests;
  e.finalCheck = null;
  saveEvent(e);
}

async function askChangeStock(e: StoredEvent, planId: string, facts: Record<string, any>, quoteId: string) {
  const reviewed = await gw.getQuote(quoteId);
  const lines = reviewed.lines.filter((l) => reviewed.unconfirmedStock.includes(l.productId));
  const question = makeQuestion({
    planId, eventId: e.id, type: "unknown_stock", forRole: "chef", outletId: lines[0]?.outletId ?? null,
    quoteId: reviewed.id, fingerprint: reviewed.fingerprint, deadline: reviewed.expiresAt,
    title: "Continue with changed unconfirmed stock?",
    body: `Stock not confirmed: ${lines.map((l) => `${l.quantity} ${l.salesUnit} ${shortName(l.productName)}`).join(", ")}`,
    facts: { ...facts, kind: "change_stock", stockQuoteId: reviewed.id, continueWith: reviewed.unconfirmedStock, lines }, ruleIds: ["STK-01"],
    options: [{ id: "continue", label: "Continue with these quantities", primary: true }, { id: "keep", label: "Keep the current order", primary: false }],
  });
  saveQuestion(question);
  audit({ actor: AGENT, action: "question_asked", summary: question.title, eventId: e.id, orderId: facts.orderId, quoteId, questionId: question.id, ruleIds: ["STK-01"], details: { fingerprint: reviewed.fingerprint }, visibility: "hotel" });
  return question;
}

export async function answerChange(q: Question, p: Person, token: string) {
  const f = q.facts as any;
  const e = getEvent(q.eventId!)!;
  if (f.allergenAcknowledgements?.length && f.eventScope && eventAllergenScope(e) !== f.eventScope)
    throw new Error("The affected guests or menu changed. The chef must review the missing allergen data again.");
  if (f.kind === "change_allergens") {
    if (eventAllergenScope(e) !== f.eventScope) throw new Error("The affected guests or menu changed. Review the missing allergen data again.");
    if (q.answer === "others") {
      const plan = getPlan(q.planId)!;
      for (const id of f.productIds as string[]) {
        const line = plan.lines.find((l) => l.productId === id)!;
        const need = plan.needs.find((n) => line.needIds.includes(n.id) && n.constraints.avoidAllergens.length);
        const group = e.dietGroups.find((g) => g.id === need?.groupId);
        const ing = e.dishes.flatMap((d) => d.ingredients).find((i) => i.id === need?.ingredientId);
        const replacements = ing && group ? await findReplacements(e, id, ing, group, e.serviceDate) : [];
        const next = makeQuestion({ planId: q.planId, eventId: q.eventId, forRole: "chef", outletId: q.outletId, quoteId: null, fingerprint: null, deadline: q.deadline, ruleIds: ["ALG-03"], title: `Choose another product: ${line.productName}`, body: "The change is held. Choose a replacement or give the affected guests another dish.",
          type: "substitute", facts: { kind: "missing_allergen_replacement", productId: id, groupId: group?.id, replacements, dishes: e.dishes.filter((d) => d.ingredients.some((i) => i.productId === id)).map((d) => d.id) },
          options: [...replacements.map((r, i) => ({ id: `replace_${i}`, label: replacementLabel(r), primary: i === 0 })), { id: "other_dish", label: "Give affected guests another dish", primary: false }] });
        saveQuestion(next);
      }
      return;
    }
    const acknowledgement = await gw.acknowledgeAllergens(token, q.quoteId!, q.fingerprint!, f.productIds, q.outletId ?? undefined);
    const plan = getPlan(q.planId)!;
    plan.overrides.allergenAcknowledgements = [...(plan.overrides.allergenAcknowledgements ?? []), acknowledgement];
    savePlan(plan);
    f.allergenAcknowledgements = plan.overrides.allergenAcknowledgements;
    const review = await gw.amend(f.orderId, { changes: f.changes, quoteOnly: true });
    const reviewed = review.quote;
    if (askChangeAllergens(e, plan, f, reviewed)) return;
    if (review.stockReviewRequired.length) {
      await askChangeStock(e, q.planId, f, reviewed.id);
      return;
    }
    if (f.requiresFinance) {
      askChangeFinance(e, q.planId, f, reviewed);
      return;
    }
  }
  if (q.answer === "keep") {
    audit({ actor: personActor(p), action: "order_amended", summary: `${p.name} kept the order as is (${f.from} guests ordered, event now ${f.to})`, eventId: e.id, ruleIds: ["CHG-02"], details: {}, visibility: "hotel" });
    return;
  }
  const builderConsentId = f.kind === "change_stock" && q.answer === "continue"
    ? (await gw.consent(token, await gw.getQuote(f.stockQuoteId), f.continueWith)).id : f.builderConsentId;
  if (f.kind === "change_stock" && f.requiresFinance) {
    askChangeFinance(e, q.planId, { ...f, builderConsentId }, await gw.getQuote(f.stockQuoteId));
    return;
  }
  // Record every finance decision against the reviewed quote, even when a
  // guest-count policy asks for approval inside the gateway's spend mandate.
  const body: AmendmentBody = { builderConsentId, changes: f.changes, continueWithUnconfirmedStock: f.continueWith ?? [],
    stockQuoteId: f.stockQuoteId, decidedBy: f.kind === "change_stock" ? p.name : f.decidedBy ?? undefined,
    allergenAcknowledgements: (f.allergenAcknowledgements ?? []).map((a: { token: string }) => a.token) };
  let changedOrder: Order;
  let changedQuote: Quote;
  try {
    if (f.kind === "change" && p.role === "approver" && q.quoteId) {
      const reviewed = await gw.getQuote(q.quoteId);
      body.approvalId = (await gw.approve(token, reviewed.id, q.fingerprint ?? reviewed.fingerprint, reviewed.mandateCheck.approvalsNeeded)).id;
    }
    try { const result = await gw.amend(f.orderId, body); changedOrder = result.order; changedQuote = result.quote; }
    catch (err) {
      if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation" || !err.body.newQuoteId || p.role !== "approver" || body.approvalId) throw err;
      const nq = await gw.getQuote(err.body.newQuoteId);
      const a = await gw.approve(token, nq.id, nq.fingerprint, nq.mandateCheck.approvalsNeeded);
      const result = await gw.amend(f.orderId, { ...body, approvalId: a.id });
      changedOrder = result.order;
      changedQuote = result.quote;
    }
  } catch (err) {
    if (err instanceof GatewayError && (err.body.error === "allergen_data_unconfirmed" || err.body.error === "quote_stale") && err.body.newQuoteId) {
      const plan = getPlan(q.planId)!;
      const reviewed = await gw.getQuote(err.body.newQuoteId);
      if (askChangeAllergens(e, plan, f, reviewed)) return;
    }
    if (err instanceof GatewayError && err.body.error === "stock_unconfirmed" && err.body.newQuoteId) {
      await askChangeStock(e, q.planId, f, err.body.newQuoteId);
      return;
    }
    if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation" || !err.body.newQuoteId) throw err;
    const finance = makeQuestion({
      planId: q.planId, eventId: e.id, type: "spend_cap", forRole: "approver", outletId: null,
      quoteId: err.body.newQuoteId, fingerprint: null, deadline: q.deadline,
      title: "Approve the changed order?", body: "The chef reviewed the product concerns. Finance approval is still required.",
      facts: { ...f, kind: "change", builderConsentId, decidedBy: body.decidedBy }, ruleIds: ["MAN-01"],
      options: [{ id: "approve", label: "Approve the change", primary: true }, { id: "keep", label: "Keep the current order", primary: false }],
    });
    saveQuestion(finance);
    return;
  }
  completeChange(e, q.planId, changedOrder!, changedQuote!, f.substitution);
  if (f.recheckFinal) await finalCheck(e.id);
}

export async function answerMissingAllergenReplacement(q: Question, p: Person) {
  const f = q.facts as any;
  const e = getEvent(q.eventId!)!;
  editEvent(e.id, e.version, p.name, "Chose another product after missing allergen data", (x) => {
    if (q.answer === "other_dish") {
      for (const d of x.dishes) if (f.dishes.includes(d.id) && !d.excludesGroups.includes(f.groupId)) d.excludesGroups.push(f.groupId);
    } else {
      const replacement = f.replacements[Number(String(q.answer).slice(8))];
      for (const d of x.dishes) for (const i of d.ingredients) if (i.productId === f.productId) { i.productId = replacement.productId; i.variants = undefined; }
    }
  });
  return applyChange(getEvent(e.id)!, p, "Changed product");
}

// ---------- late allergy (CH-13, D28) ----------

export const warnings = (eventId?: string) => !eventId
  ? allJson<WarningRecord>("SELECT json FROM warnings ORDER BY rowid")
  : allJson<WarningRecord>("SELECT json FROM warnings WHERE event_id = ? ORDER BY rowid", eventId);
function saveWarning(w: WarningRecord) {
  getDb().prepare("INSERT INTO warnings (id, event_id, state, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, json = excluded.json").run(w.id, w.eventId, w.state, JSON.stringify(w));
}

export async function addDietGroup(eventId: string, group: DietGroup, baseVersion: number, p: Person) {
  return changeEvent(eventId, { group }, baseVersion, p);
}

/** ALLERGY-RECHECK: warn at once; never remove a line by itself (D28). */
async function allergyRecheck(e: StoredEvent, group: DietGroup): Promise<WarningRecord[]> {
  const eventId = e.id;
  const orders = await currentOrders(eventId);
  const created: WarningRecord[] = [];
  for (const o of orders) {
    for (const l of o.lines.filter((x) => !x.removed)) {
      const prod = getProduct(l.productId);
      if (!prod) continue;
      // Diet groups don't overlap (Q01.4): the new group's guests came out of the unrestricted guests,
      // so only lines that serve unrestricted guests in a dish this group eats can conflict.
      const dishes = e.dishes.filter((d) => !d.excludesGroups.includes(group.id) && orderPlanServes(e, l.productId, d.id));
      if (!dishes.length) continue;
      const fails = dietRules(prod, group.constraints, group.label).filter((r) => r.outcome === "block");
      if (!fails.length) continue;
      const allergen = String(fails[0].facts.allergen ?? group.label);
      const what = fails[0].ruleId === "ALG-01" ? `contains ${allergen}` : fails[0].ruleId === "ALG-02" ? `may contain ${allergen}` : fails[0].ruleId === "ALG-04" ? `lists ${allergen} as UNDECLARED` : "has no allergen data";
      const text = `${shortName(prod.name)} ${what}. ${group.count} guest${group.count === 1 ? "" : "s"} must avoid it. Still in the order.`;
      const w: WarningRecord = { id: newId("warn"), eventId, kind: "allergy", text, productId: l.productId, productName: prod.name, allergen, groupId: group.id, count: group.count, orderId: o.id, state: "open", resolvedBy: null, resolution: null, createdAt: nowIso() };
      saveWarning(w);
      created.push(w);
      const dish = dishes[0];
      const ing = dish.ingredients.find((i) => i.productId === l.productId);
      const replacements = ing ? await findReplacements(e, l.productId, ing, group, o.deliveryDate) : [];
      const q = makeQuestion({
        planId: e.orderPlanId ?? "none", eventId, type: "allergy_conflict", forRole: "chef", outletId: l.outletId, quoteId: null, fingerprint: null,
        title: `Allergy: ${shortName(prod.name)}`,
        body: `${what[0].toUpperCase()}${what.slice(1)} · ${group.count} guest${group.count === 1 ? "" : "s"} · still in the order`,
        facts: { kind: "allergy", warningId: w.id, orderId: o.id, productId: l.productId, outletId: l.outletId, groupId: group.id, dishes: dishes.map((d) => d.id), dishNames: dishes.map((d) => d.name), ingredientId: ing?.id ?? null, replacements, sideBySide: replacements[0] ? specCompare(l.productId, replacements[0].productId) : [] },
        ruleIds: ["ALG-10", fails[0].ruleId], deadline: l.closingTime ? parseAimoTime(l.closingTime)!.toISOString() : null,
        options: [
          ...replacements.slice(0, 2).map((r, i) => ({ id: `replace_${i}`, label: replacementLabel(r), primary: i === 0 })),
          { id: "other_dish", label: `Give ${group.count === 1 ? "this guest" : "these guests"} another dish`, primary: replacements.length === 0 },
          { id: "remove", label: "Remove the line", primary: false },
        ],
      });
      saveQuestion(q);
      audit({ actor: AGENT, action: "allergy_warning", summary: text, eventId, orderId: o.id, questionId: q.id, ruleIds: ["ALG-10", fails[0].ruleId], details: { productId: l.productId, guests: group.count }, visibility: "hotel" });
    }
  }
  return created;
}

function replacementLabel(r: { name: string; salesUnit: string | null; costToCover: ReturnType<typeof pieceCostToCover> }) {
  return `Replace for everyone: ${shortName(r.name)}${r.costToCover ? ` · ${r.costToCover.quantity} ${r.salesUnit} · ${eur(r.costToCover.totalExVat)} ex VAT to cover ${r.costToCover.need} pcs (whole packs)` : ""}`;
}

/** Replacements for everyone: same category, safe for every group at the event including the new one. */
async function findReplacements(e: StoredEvent, productId: string, ing: EventSpec["dishes"][number]["ingredients"][number], group: DietGroup, deliveryDate: string) {
  const orig = getProduct(productId)!;
  const avoid = [...new Set([...e.dietGroups.flatMap((g) => g.constraints.avoidAllergens ?? []), ...(group.constraints.avoidAllergens ?? [])])];
  const amount = ing.total ? toBase(ing.total) : ing.perPortion ? toBase(ing.perPortion) : null;
  const unit = amount?.unit === "pcs" ? "pcs" : null;
  // Replacement is for everyone eating this dish, at the proposed headcount.
  const dish = e.dishes.find((d) => d.ingredients.includes(ing));
  const guests = e.guests - e.dietGroups.filter((g) => dish?.excludesGroups.includes(g.id)).reduce((sum, g) => sum + g.count, 0);
  const pieceNeed = amount ? amount.value * (ing.total ? 1 : guests) : 0;
  const type = (ing.productType ?? ing.text).toLowerCase();
  const typeWord = type.split(/\s+/).pop() ?? type;
  // Bound the shortlist by product type before its limit; category-only truncation
  // omitted later cake IDs (including 473522) behind unrelated pastries.
  const list = searchProducts({ q: unit ? typeWord : undefined, category: orig.category, excludeAllergens: avoid, claims: ing.claims, origin: ing.origin, limit: 50 }).filter((p) => p.id !== productId);
  if (!list.length) return [];
  const fresh = await gw.lookup(list.map((p) => p.id), deliveryDate);
  const at = now();
  const out: { productId: string; name: string; pricePerUnit: number | null; stock: string; origin: string | null; reliability: number | null; salesUnit: string | null; costToCover: ReturnType<typeof pieceCostToCover> }[] = [];
  for (const l of fresh.lines) {
    const p = getProduct(l.productId)!;
    if (!l.deliverable || !l.price) continue;
    const cut = parseAimoTime(l.closingTime);
    if (cut && cut.getTime() <= at.getTime()) continue;
    if (dietRules(p, { claims: ing.claims ?? [], avoidAllergens: avoid, labels: [], origin: ing.origin }, group.label).some((r) => r.outcome === "block")) continue;
    const content = packContent(p, l, unit ?? undefined);
    // This one-click event action has no sales-quantity input: only offer checked counts.
    if (unit && (!content?.verified || content.value <= 0)) continue;
    const costToCover = unit ? pieceCostToCover(p.name, pieceNeed, content, l.price.value, mandate().preAnswers) : undefined;
    out.push({ productId: p.id, name: p.name, pricePerUnit: content ? round2(l.price.value / content.value) : null, costToCover, salesUnit: l.salesUnit, stock: l.stock.kind === "unknown" ? "not confirmed" : `${l.stock.kind === "known" ? l.stock.amount : 0}`, origin: p.origin, reliability: p.reliability });
  }
  // Same type of product: the model's type check drops clear mismatches (a pastry for a cake);
  // a name that carries the type word ranks first. The person still chooses.
  const judged = await typeCheck(type, out.map((r) => getProduct(r.productId)!));
  for (let k = out.length - 1; k >= 0; k--) if (judged.get(out[k].productId)?.verdict === "no") out.splice(k, 1);
  const named = (id: string) => (`${getProduct(id)?.name ?? ""} ${getProduct(id)?.nameFi ?? ""}`.toLowerCase().includes(typeWord) ? 0 : 1);
  // Safety first: a product that declares itself free from every avoided allergen beats one that
  // merely doesn't list it. D36 compares whole-pack totals for a piece need.
  const declared = (id: string) => {
    const ff: string[] = getRaw(id)?.free_from ?? [];
    return avoid.every((a) => ff.includes(a)) ? 0 : 1;
  };
  const band = (r: number | null) => (r === null ? 1 : r >= 0.95 ? 0 : 2);
  return out
    .sort((a, b) => declared(a.productId) - declared(b.productId) || named(a.productId) - named(b.productId) || (unit ? (a.costToCover?.totalExVat ?? 1e9) - (b.costToCover?.totalExVat ?? 1e9) : (a.pricePerUnit ?? 1e9) - (b.pricePerUnit ?? 1e9)) || band(a.reliability) - band(b.reliability) || a.productId.localeCompare(b.productId))
    .slice(0, 3)
    .map((r) => ({ ...r, declaredFree: declared(r.productId) === 0 }));
}

function orderPlanServes(e: StoredEvent, productId: string, dishId: string): boolean {
  const id = (e as StoredEvent & { latestPlanId?: string }).latestPlanId ?? e.orderPlanId;
  const plan = id ? getPlan(id) : null;
  if (!plan) return false;
  return plan.lines.some((l) => l.productId === productId && l.needIds.some((n) => n.startsWith(`${dishId}:`) && n.endsWith(":regular")));
}

export async function answerAllergy(q: Question, p: Person) {
  const f = q.facts as any;
  const w = warnings(q.eventId!).find((x) => x.id === f.warningId);
  if (!w || w.state === "resolved") return;
  const e = getEvent(q.eventId!)!;
  if (q.answer === "remove") {
    editEvent(e.id, e.version, p.name, `Removed ${shortName(w.productName)} from ${(f.dishNames ?? []).join(", ")}`, (x) => {
      for (const d of x.dishes) if (f.dishes.includes(d.id)) d.ingredients = d.ingredients.filter((i) => i.productId !== f.productId);
    });
    w.resolution = "Line removed";
  } else if (String(q.answer).startsWith("replace_")) {
    const r = f.replacements[Number(String(q.answer).slice(8))];
    editEvent(e.id, e.version, p.name, `Replaced ${shortName(w.productName)} with ${shortName(r.name)} for everyone`, (x) => {
      for (const d of x.dishes) for (const i of d.ingredients) if (i.productId === f.productId) {
        i.productId = r.productId;
        i.variants = undefined;
      }
    });
    w.resolution = `Replaced with ${r.name} for everyone`;
    audit({ actor: personActor(p), action: "substitute_applied", summary: `${p.name} replaced ${shortName(w.productName)} with ${shortName(r.name)} for everyone${r.stock === "not confirmed" ? "; its stock is not confirmed, and choosing it is the decision to continue (D31)" : ""}`, eventId: e.id, ruleIds: ["ALG-10", "SUB-01"], details: { from: f.productId, to: r.productId }, visibility: "hotel" });
  } else {
    editEvent(e.id, e.version, p.name, `${w.count} guest${w.count === 1 ? "" : "s"} (${f.groupId}) get another dish instead of ${(f.dishNames ?? []).join(", ")}`, (x) => {
      for (const d of x.dishes) if (f.dishes.includes(d.id) && !d.excludesGroups.includes(f.groupId)) d.excludesGroups.push(f.groupId);
    });
    w.resolution = `${w.count === 1 ? "This guest gets" : "These guests get"} another dish; the line stays for everyone else`;
  }
  w.state = "resolved";
  w.resolvedBy = p.name;
  saveWarning(w);
  audit({ actor: personActor(p), action: "allergy_resolved", summary: `${shortName(w.productName)}: ${w.resolution}`, eventId: e.id, orderId: f.orderId, ruleIds: ["ALG-10"], details: {}, visibility: "hotel" });
  // When the last conflict is settled, the held change goes ahead as one change (one Approver card at most).
  if (!warnings(e.id).some((x) => x.state === "open")) await applyChange(getEvent(e.id)!, p, "Change");
}

// ---------- scene 4: final check ----------

/** FINAL-CHECK: lookup, stock, cut-off and price validity for every ordered line. */
export async function finalCheck(eventId: string) {
  const e = getEvent(eventId)!;
  const orders = (await currentOrders(eventId)).filter((o) => o.state !== "rejected");
  const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
  const results: NonNullable<StoredEvent["finalCheck"]>["lines"] = [];
  const m = mandate();
  for (const o of orders) {
    const live = o.lines.filter((l) => !l.removed);
    let fresh;
    try {
      fresh = await gw.lookup(live.map((l) => l.productId), o.deliveryDate);
    } catch (err) {
      e.finalCheck = { at: nowIso(), summary: `Check failed, retrying. Nothing is marked covered.`, lines: [] };
      saveEvent(e);
      return e.finalCheck;
    }
    for (const l of live) {
      const f = fresh.lines.find((x) => x.productId === l.productId)!;
      const name = l.productName;
      const cut = parseAimoTime(f.closingTime);
      if (f.price && l.unitPrice !== null && f.price.value !== l.unitPrice) {
        const pct = ((f.price.value - l.unitPrice) / l.unitPrice) * 100;
        if (pct > m.preAnswers.priceRiseMaxPct) {
          results.push({ productId: l.productId, productName: name, result: "price_changed", detail: fire("PRC-03", { product: name, newPrice: eur(f.price.value), oldPrice: eur(l.unitPrice), pct: `${round2(pct)}%` }).message });
          continue;
        }
      }
      if (f.stock.kind === "unknown") {
        results.push({ productId: l.productId, productName: name, result: "covered_at_risk", detail: `Stock not confirmed; ${l.riskAccepted?.by ?? "a pre-answer"} chose to continue${l.riskAccepted ? ` on ${fmtHelsinki(l.riskAccepted.at, false)}` : ""}.${hasUnconfirmedAllergenData(l) ? " Allergen data not confirmed." : ""}` });
        continue;
      }
      if (f.stock.kind !== "known" || f.stock.amount < l.quantity) {
        const stock = f.stock.kind === "known" ? f.stock.amount : 0;
        const detail = fire("FIN-02", { product: name, stock: `${stock} ${l.salesUnit ?? ""}`, quantity: `${l.quantity} ${l.salesUnit ?? ""}`, cutoff: cut ? fmtHelsinki(cut) : "the cut-off" }).message;
        results.push({ productId: l.productId, productName: name, result: "short", detail });
        await resolveShortfall(e, o, l, stock, plan);
        continue;
      }
      results.push({ productId: l.productId, productName: name, result: hasUnconfirmedAllergenData(l) ? "allergen_data_unconfirmed" : "covered", detail: `${fire("FIN-01", { product: name }).message}${hasUnconfirmedAllergenData(l) ? " Allergen data not confirmed; chef continuation does not establish safety." : ""}` });
    }
  }
  const fc = { at: nowIso(), summary: "", lines: results };
  e.finalCheck = fc;
  saveEvent(e);
  fc.summary = coverageSummary(eventId).text;
  e.finalCheck = fc;
  saveEvent(e);
  audit({ actor: AGENT, action: "final_check_run", summary: `Final check: ${fc.summary}`, eventId, ruleIds: results.map((r) => (r.result === "short" ? "FIN-02" : r.result === "price_changed" ? "PRC-03" : r.result === "covered_at_risk" ? "STK-03" : "FIN-01")), details: { results }, usesFixture: true, visibility: /allergen data not confirmed/i.test(fc.summary) || results.some((r) => /allergen data not confirmed/i.test(r.detail)) ? "hotel" : "shared" });
  return fc;
}

/**
 * Try an amendment; if the gateway needs an approval for it (for example unknown
 * stock on a substitute), raise one Approver card instead of failing.
 */
export async function amendOrAsk(e: StoredEvent, orderId: string, changes: AmendmentBody["changes"], title: string, why: string, stock?: { continueWith: string[]; decidedBy: string }, substitution?: SubstitutionAllocation): Promise<"applied" | "asked"> {
  try {
    const result = await gw.amend(orderId, { changes, continueWithUnconfirmedStock: stock?.continueWith, decidedBy: stock?.decidedBy });
    if (e.orderPlanId) completeChange(e, e.orderPlanId, result.order, result.quote, substitution);
    return "applied";
  } catch (err) {
    if (err instanceof GatewayError && err.body.newQuoteId && (err.body.error === "allergen_data_unconfirmed" || err.body.error === "stock_unconfirmed")) {
      const facts = { recheckFinal: true, orderId, changes, continueWith: stock?.continueWith ?? [], decidedBy: stock?.decidedBy ?? null, substitution };
      if (err.body.error === "stock_unconfirmed") await askChangeStock(e, e.orderPlanId ?? "none", facts, err.body.newQuoteId);
      else {
        const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
        if (!plan || !askChangeAllergens(e, plan, facts, await gw.getQuote(err.body.newQuoteId))) throw err;
      }
      return "asked";
    }
    if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation") throw err;
    const q = makeQuestion({
      planId: e.orderPlanId ?? "none", eventId: e.id, type: "unknown_stock", forRole: "approver", outletId: null, quoteId: err.body.newQuoteId ?? null, fingerprint: null,
      title, body: why,
      facts: { kind: "change", orderId, changes, continueWith: stock?.continueWith ?? [], decidedBy: stock?.decidedBy ?? null, substitution }, ruleIds: ["MAN-01"],
      options: [{ id: "approve", label: "Approve the change", primary: true }, { id: "keep", label: "Keep the order as is", primary: false }],
      deadline: null,
    });
    saveQuestion(q);
    audit({ actor: AGENT, action: "question_asked", summary: `Approver asked: ${title}`, eventId: e.id, orderId, questionId: q.id, ruleIds: q.ruleIds, details: {}, visibility: "hotel" });
    return "asked";
  }
}

type SubCandidate = { productId: string; name: string; quantity: number; stock: string; listed: boolean; pricePerBase: number | null; totalExVat: number | null; unknown: boolean; packContent: PlanLine["packContent"] };

/** SUBSTITUTE-FIND (Q07.4): listed substitutes first, every candidate passing the need's rules and TYPE-CHECK, on fresh stock. */
async function findSubstitutes(line: Order["lines"][number], need: Need | undefined, deliveryDate: string, needAmount: { value: number; unit: string }): Promise<SubCandidate[]> {
  const prod = getProduct(line.productId)!;
  const listed = prod.substitutes;
  const ids = [...new Set([...listed, ...(need?.candidates ?? []).map((c) => c.productId)])].filter((id) => id !== line.productId);
  if (!ids.length) return [];
  const fresh = await gw.lookup(ids, deliveryDate);
  const at = now();
  const pass: { p: NonNullable<ReturnType<typeof getProduct>>; l: (typeof fresh.lines)[number] }[] = [];
  for (const l of fresh.lines) {
    const p = getProduct(l.productId);
    if (!p || !l.deliverable || !l.price) continue;
    const cut = parseAimoTime(l.closingTime);
    if (cut && cut.getTime() <= at.getTime()) continue;
    if (need && dietRules(p, need.constraints, need.groupLabel).some((r) => r.outcome === "block")) continue;
    pass.push({ p, l });
  }
  const type = (need?.text ?? prod.name).toLowerCase();
  const judged = await typeCheck(type, pass.map((x) => x.p));
  const out: SubCandidate[] = [];
  for (const { p, l } of pass) {
    if (judged.get(p.id)?.verdict === "no") continue;
    const content = packContent(p, l, needAmount.unit as any);
    if (!content || content.unit !== needAmount.unit || (needAmount.unit === "pcs" && !content.verified)) continue;
    const quantity = Math.ceil(needAmount.value / content.value - 1e-9);
    const unknown = l.stock.kind === "unknown";
    if (l.stock.kind === "known" && l.stock.amount < quantity) continue;
    out.push({ productId: p.id, name: p.name, quantity, stock: unknown ? "unknown stock" : `${l.stock.kind === "known" ? l.stock.amount : 0} in stock`, listed: listed.includes(p.id), pricePerBase: l.price ? round2(l.price.value / content.value) : null, totalExVat: needAmount.unit === "pcs" ? pieceCostToCover(p.name, needAmount.value, content, l.price?.value ?? null, mandate().preAnswers)?.totalExVat ?? null : null, unknown, packContent: content });
  }
  // Names that share more words with the type asked for ("whipping cream") rank first. The model's
  // type check already dropped clear mismatches; this keeps the order sensible when it can't be reached.
  const words = type.split(/[^a-zåäö]+/i).filter((w) => w.length > 2);
  const overlap = (id: string) => {
    const n = `${getProduct(id)?.name ?? ""} ${getProduct(id)?.nameFi ?? ""}`.toLowerCase();
    return -words.filter((w) => n.includes(w)).length;
  };
  // Listed substitutes and product identity first, then price, reliability and id; stock is disclosed separately.
  const band = (id: string) => {
    const r = getProduct(id)?.reliability ?? null;
    return r === null ? 1 : r >= 0.95 ? 0 : 2;
  };
  const price = (c: SubCandidate) => (needAmount.unit === "pcs" ? c.totalExVat : c.pricePerBase) ?? 1e9;
  return out.sort((a, b) => Number(b.listed) - Number(a.listed) || overlap(a.productId) - overlap(b.productId) || price(a) - price(b) || band(a.productId) - band(b.productId) || a.productId.localeCompare(b.productId)).slice(0, 3);
}

/** SHORTFALL-RESOLVE (Q07.3): remembered substitute first, then up to three candidates for the chef. */
async function resolveShortfall(e: StoredEvent, o: Order, line: Order["lines"][number], stock: number, plan: StoredPlan | null) {
  const pl = plan?.lines.find((x) => x.productId === line.productId && x.outletId === line.outletId);
  const need = plan?.needs.find((n) => pl?.needIds.includes(n.id));
  const dishId = need?.dishId ?? "request";
  const prod = getProduct(line.productId)!;
  const unit = pl?.packContent?.unit ?? "l";
  const perPack = pl?.packContent?.value ?? 1;
  // Keep what is in stock of the original; substitutes only fill the gap (Q07.3, step 4 before step 3's full swap).
  const keep = Math.max(0, Math.floor(stock));
  const gap = { value: round2((line.quantity - keep) * perPack), unit };
  if (allQuestions().some((q) => (q.state === "open" || q.state === "waiting") && (q.facts as any).kind === "final_substitute" && (q.facts as any).original === line.productId)) return;
  const ordered = await findSubstitutes(line, need, o.deliveryDate, gap);
  const changesFor = (c: { productId: string; quantity: number }) => [
    { productId: line.productId, outletId: line.outletId, quantity: keep },
    { productId: c.productId, outletId: line.outletId, quantity: c.quantity, requires: line.requires, allergenScope: line.allergenScope },
  ];
  for (const c of ordered) {
    const r = recallSubstitute(dishId, line.productId, c.productId);
    if (r) {
      const msg = fire("SUB-02", { substitute: c.name, original: prod.name, dish: need?.dishName ?? "this request", by: r.by, at: fmtHelsinki(r.at, false) }).message;
      const res = await amendOrAsk(e, o.id, changesFor(c), "Approve the change?", `${c.quantity} × ${shortName(c.name)} fills the gap`, { continueWith: c.unknown ? [c.productId] : [], decidedBy: r.by }, { original: line.productId, productId: c.productId, outletId: line.outletId, needAmount: gap, packContent: c.packContent });
      audit({ actor: AGENT, action: "substitute_applied", summary: res === "applied" ? msg : `${msg} Waiting for the Approver.`, eventId: e.id, orderId: o.id, ruleIds: ["SUB-02"], details: { rememberedAt: r.at }, visibility: "hotel" });
      return;
    }
  }
  if (!ordered.length) {
    audit({ actor: AGENT, action: "question_asked", summary: `${prod.name} is short and no substitute passes the event's rules; unresolved`, eventId: e.id, orderId: o.id, ruleIds: ["FIN-02"], details: {}, visibility: "hotel" });
    return;
  }
  const cut = parseAimoTime(line.closingTime);
  const options = ordered.slice(0, 2);
  const q = makeQuestion({
    planId: plan?.id ?? "none", eventId: e.id, type: "substitute", forRole: "chef", outletId: line.outletId, quoteId: null, fingerprint: null,
    title: `Short: ${shortName(prod.name)}`,
    body: `${keep} of ${line.quantity} in stock · ${gap.value} ${gap.unit} to fill`,
    facts: {
      kind: "final_substitute", orderId: o.id, original: line.productId, originalQty: line.quantity, keep, outletId: line.outletId, dishId, dishName: need?.dishName ?? null, gap, requires: line.requires, allergenScope: line.allergenScope,
      candidates: options.map((c) => ({ productId: c.productId, name: c.name, quantity: c.quantity, stock: c.stock, pricePerBase: c.pricePerBase, totalExVat: c.totalExVat, packContent: c.packContent })),
      sideBySide: specCompare(line.productId, options[0].productId, { originalPrice: line.unitPrice !== null ? round2(line.unitPrice / perPack) : null, subPrice: options[0].pricePerBase }),
      stock,
    },
    ruleIds: ["FIN-02", "SUB-01"],
    options: [
      ...options.map((c, i) => ({ id: `use_${i}`, label: `${c.quantity} × ${shortName(c.name)} (${unit === "pcs" ? `${c.totalExVat === null ? "cost unknown" : eur(c.totalExVat)} ex VAT to cover ${gap.value} pcs (whole packs)` : c.pricePerBase !== null ? `€${c.pricePerBase.toFixed(2)}/${unit}` : "no unit price"})`, primary: i === 0 })),
      { id: "none", label: "None of these", primary: false },
    ],
    deadline: cut?.toISOString() ?? null,
  });
  saveQuestion(q);
  audit({ actor: AGENT, action: "question_asked", summary: `Chef asked: ${q.title}`, eventId: e.id, orderId: o.id, questionId: q.id, ruleIds: q.ruleIds, details: {}, visibility: "hotel" });
}

export async function answerFinalSubstitute(q: Question, p: Person) {
  const f = q.facts as any;
  if (q.answer === "none") {
    audit({ actor: personActor(p), action: "question_answered", summary: `${p.name}: none of the substitutes work; the line stays short and unresolved`, eventId: q.eventId, questionId: q.id, ruleIds: ["FIN-02"], details: {}, visibility: "hotel" });
    return;
  }
  const c = f.candidates[Number(String(q.answer).replace("use_", ""))];
  const { rememberSubstitute } = await import("./memory.js");
  rememberSubstitute(f.dishId, f.original, c.productId, p.name, nowIso());
  const e = getEvent(q.eventId!)!;
  const applied = await amendOrAsk(
    e,
    f.orderId,
    [
      { productId: f.original, outletId: f.outletId, quantity: f.keep ?? 0 },
      { productId: c.productId, outletId: f.outletId, quantity: c.quantity, requires: f.requires, allergenScope: f.allergenScope },
    ],
    "Approve the change?",
    `${c.quantity} × ${shortName(c.name)} fills the gap`,
    { continueWith: c.stock === "unknown stock" ? [c.productId] : [], decidedBy: p.name },
    f.gap ? { original: f.original, productId: c.productId, outletId: f.outletId, needAmount: f.gap, packContent: c.packContent ?? null } : undefined,
  );
  if (applied === "applied") await finalCheck(e.id);
  audit({ actor: personActor(p), action: "substitute_applied", summary: `${p.name} kept ${f.keep} × ${shortName(getProduct(f.original)?.name ?? f.original)} and added ${c.quantity} × ${shortName(c.name)} for ${f.dishName ?? "the dish"}; remembered for next time`, eventId: q.eventId, orderId: f.orderId, questionId: q.id, ruleIds: ["SUB-01"], details: { dish: f.dishName }, visibility: "hotel" });
}

/** SILENCE-RESOLVE (D9): at the cut-off an unanswered line stays as last approved and both sides are told. */
export function runCutoff(eventId: string) {
  const at = now();
  const flags: string[] = [];
  for (const q of allQuestions().filter((x) => x.eventId === eventId && (x.state === "open" || x.state === "waiting"))) {
    if (q.deadline && new Date(q.deadline).getTime() > at.getTime()) continue;
    q.state = "expired";
    saveQuestion(q);
    const f = q.facts as any;
    const msg = q.type === "allergy_conflict" ? "Hotel has an unresolved product decision; the order remains as last approved." : fire("SIL-01", { cutoff: q.deadline ? fmtHelsinki(q.deadline) : "the cut-off", told: policyParams().silenceFlagsValioAimo ? " and Valio Aimo has been told" : "" }).message;
    flags.push(msg);
    audit({ actor: AGENT, action: "question_expired", summary: `Unanswered at the cut-off: ${q.title}`, eventId, questionId: q.id, ruleIds: ["SIL-01"], details: {}, visibility: "hotel" });
    if (q.type === "allergy_conflict" || policyParams().silenceFlagsValioAimo) audit({ actor: AGENT, action: "flag_sent_to_valio_aimo", summary: `Unresolved at cut-off: ${msg}`, eventId, orderId: f.orderId ?? null, ruleIds: ["SIL-01"], details: { productId: f.productId ?? f.original ?? null, askedAt: q.createdAt }, visibility: "shared" });
  }
  return flags;
}

/** COVERAGE-SUMMARY (Q07.7): never "covered" alone while anything is at risk or carries a warning. */
export function coverageSummary(eventId: string): { level: "covered" | "at_risk" | "not_covered" | "warning" | "none"; text: string } {
  const e = getEvent(eventId);
  const latestPlanId = (e as (StoredEvent & { latestPlanId?: string }) | null)?.latestPlanId;
  const latestPlan = latestPlanId ? getPlan(latestPlanId) : null;
  const concerned = new Set([
    ...allJson<Order>("SELECT json FROM orders WHERE event_id = ?", eventId).filter((o) => o.state !== "rejected").flatMap((o) => o.lines),
    ...(latestPlan?.lines ?? []),
  ].filter((l) => !l.removed && hasUnconfirmedAllergenData(l)).map((l) => `${l.productId}|${l.outletId}`));
  const allergenConcerns = concerned.size;
  const concern = allergenConcerns ? ` · ${allergenConcerns} allergen data not confirmed` : "";
  const ws = warnings(eventId).filter((w) => w.state === "open");
  if (ws.length) return { level: "warning", text: `Allergy warning · ${ws.length} line${ws.length > 1 ? "s" : ""}` };
  const open = allQuestions(eventId).filter((q) => q.state === "open" || q.state === "waiting");
  if (open.length) {
    const d = open.map((q) => q.deadline).filter(Boolean).sort()[0];
    return { level: "not_covered", text: `${open.length} open question${open.length > 1 ? "s" : ""}${d ? ` · by ${fmtHelsinki(d!)}` : ""}${concern}` };
  }
  const plan = e?.orderPlanId ? getPlan(e.orderPlanId) : null;
  if (plan && !plan.orderIds.length && plan.status === "blocked") {
    const red = plan.lines.filter((l) => l.verdict === "red" && !l.removed).length;
    return { level: "not_covered", text: `Blocked · ${red || 1} line${red === 1 ? "" : "s"}` };
  }
  if (plan && !plan.orderIds.length && plan.status === "rejected") return { level: "not_covered", text: "Rejected" };
  if (!plan || !plan.orderIds.length) return { level: "none", text: "Not ordered" };
  const fc = e?.finalCheck;
  const atRisk = fc ? fc.lines.filter((l) => l.result === "covered_at_risk").length : plan.lines.filter((l) => l.riskAccepted).length;
  const short = fc ? fc.lines.filter((l) => l.result === "short" || l.result === "price_changed").length : 0;
  if (short) return { level: "not_covered", text: `${short} short${concern}` };
  if (atRisk || allergenConcerns) return { level: "at_risk", text: `Ready${atRisk ? ` · ${atRisk} stock not confirmed` : ""}${concern}` };
  return { level: "covered", text: "Ready" };
}

export function eventView(eventId: string) {
  const e = getEvent(eventId)!;
  return {
    event: e,
    viability: e.viabilityPlanId ? getPlan(e.viabilityPlanId) : null,
    orderPlan: e.orderPlanId ? getPlan(e.orderPlanId) : null,
    warnings: warnings(eventId),
    coverage: coverageSummary(eventId),
    decisions: decisionCount(eventId),
    questions: allQuestions(eventId),
  };
}
