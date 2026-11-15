/** Final hotel order handoff: one finance decision bound to the submitted basket. */
import type { Constraints, Order, Question, QuoteLine } from "@aimo/contracts";
import { audit } from "../audit.js";
import { now } from "../clock.js";
import { tx } from "../db.js";
import type { Person } from "../identity.js";
import { eur, parseAimoTime, round2, sha256, stableStringify } from "../util.js";
import { getEvent, personActor } from "./events.js";
import { gw, GatewayError } from "./gatewayClient.js";
import { HOTEL_ID, listPlans, savePlan } from "./plan.js";
import { matchesSelectedProducts } from "./match.js";
import { allQuestions, makeQuestion, saveQuestion } from "./questions.js";

export class BasketReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const stagedPlans = (eventId: string) => listPlans().filter((p) => p.eventId === eventId && p.basketedAt && !p.orderIds.length);
const liveOrders = (orders: Order[]) => orders.filter((o) => o.state !== "rejected");
export function invalidateBasketReview(eventId: string) {
  for (const q of allQuestions().filter((q) => q.eventId === eventId && q.type === "order_review" && q.state === "open")) {
    q.state = "replaced";
    saveQuestion(q);
  }
}
const snapshot = (eventId: string, orders: Order[]) => {
  const event = getEvent(eventId)!;
  return sha256(stableStringify({
    siteId: event.siteId, deliveryDate: event.serviceDate, version: event.version,
    plans: stagedPlans(eventId).sort((a, b) => a.id.localeCompare(b.id)).map((p) => ({
      id: p.id, siteId: p.siteId, deliveryDate: p.deliveryDate, lines: p.lines, needs: p.needs, overrides: p.overrides,
    })),
    orders: liveOrders(orders).sort((a, b) => a.id.localeCompare(b.id)),
  }));
};

/** Stale requests disappear from the approval queue as soon as the basket is read again. */
export function basketReview(eventId: string, orders: Order[]): Question | null {
  const current = snapshot(eventId, orders);
  let review: Question | null = null;
  for (const q of allQuestions().filter((q) => q.eventId === eventId && q.type === "order_review" && q.state === "open")) {
    if (q.deadline && new Date(q.deadline).getTime() <= now().getTime()) {
      q.state = "expired";
      saveQuestion(q);
    } else if (q.facts.snapshot === current && !review) review = q;
    else {
      q.state = "replaced";
      saveQuestion(q);
    }
  }
  return review;
}

export async function submitBasketForReview(eventId: string, person: Person): Promise<Question> {
  const event = getEvent(eventId);
  if (!event) throw new BasketReviewError(404, "No such order");
  const { orders } = await gw.orders(eventId);
  const plans = stagedPlans(eventId);
  const existing = liveOrders(orders);
  const outlets = [...plans.flatMap((p) => p.lines.filter((l) => !l.removed).map((l) => l.outletId)), ...existing.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => l.outletId))];
  if (person.hotelId !== HOTEL_ID || (!person.hotelScope && outlets.some((id) => !person.outlets.includes(id))))
    throw new BasketReviewError(403, "This order is outside your hotel or outlet scope");
  if (plans.some((p) => !matchesSelectedProducts(p.needs, p.lines)))
    throw new BasketReviewError(409, "The product matches changed. Ask the order builder to review the selected products.");
  const previous = basketReview(eventId, orders);
  if (previous) return previous;
  if (!outlets.length) throw new BasketReviewError(409, "Add items to the order before submitting it for review");
  const unresolved = listPlans().some((p) => p.eventId === eventId && p.kind === "single" && !p.reviewing && !p.basketedAt && !p.orderIds.length && p.status !== "rejected" && p.tooLateChoice !== "removed");
  if (unresolved || allQuestions().some((q) => q.eventId === eventId && q.forRole === "chef" && (q.state === "open" || q.state === "waiting")))
    throw new BasketReviewError(409, "Resolve the remaining product decisions before submitting the order for review");
  const hard = (rules: typeof plans[number]["inputRules"]) => rules.some((r) => r.outcome !== "order" && (r.outcome === "block" || !r.overridable));
  if (plans.some((p) => p.tooLate || p.error || p.siteId !== event.siteId || !p.deliveryDate || hard(p.inputRules) || p.lines.some((l) => !l.removed && (!l.productId || hard(l.rules)))))
    throw new BasketReviewError(409, "Resolve the delivery or product issues before submitting the order for review");
  const dates = [...new Set(plans.map((p) => p.deliveryDate!))];
  if (dates.length > 1) throw new BasketReviewError(409, "Items must share a delivery date before submitting the order for review");
  const before = snapshot(eventId, orders);
  const quoteLines = new Map<string, { productId: string; quantity: number; outletId: string; ref: string; requires: Constraints }>();
  for (const plan of plans) for (const line of plan.lines.filter((l) => !l.removed)) {
    const key = `${line.productId}:${line.outletId}`;
    const grouped = quoteLines.get(key) ?? { productId: line.productId!, quantity: 0, outletId: line.outletId, ref: key, requires: { claims: [], avoidAllergens: [], labels: [] } };
    grouped.quantity += line.quantity;
    for (const need of plan.needs.filter((n) => line.needIds.includes(n.id))) {
      for (const field of ["claims", "avoidAllergens", "labels"] as const)
        grouped.requires[field] = [...new Set([...grouped.requires[field], ...need.constraints[field]])];
      if (need.constraints.origin) {
        if (grouped.requires.origin && grouped.requires.origin !== need.constraints.origin)
          throw new BasketReviewError(409, "The order has conflicting origin requirements. Ask the order builder to review the items.");
        grouped.requires.origin = need.constraints.origin;
      }
    }
    quoteLines.set(key, grouped);
  }
  const quote = plans.length ? await gw.quote({
    siteId: event.siteId, eventId, deliveryDate: dates[0],
    lines: [...quoteLines.values()],
  }) : null;
  if (quote?.outcome === "block") throw new BasketReviewError(409, "The order has blocked items. Resolve them before submitting for review.");
  const continued = [...new Set(plans.flatMap((p) => p.overrides.stockContinued ?? []))];
  if (quote?.unconfirmedStock.some((id) => !continued.includes(id)))
    throw new BasketReviewError(409, "The order builder must choose whether to continue with unconfirmed stock before finance review");
  if (quote?.unconfirmedStock.length) {
    const terms = (line: QuoteLine) => stableStringify([line.salesUnit, line.unitPrice, line.taxRate, line.stock,
      line.availableDate, line.closingTime, line.priceValidTo, line.logisticModel]);
    // A new combined quote must not turn consent stored on a staged SKU into
    // consent for changed supplier facts, quantities or policy.
    for (const plan of plans) {
      const relevant = plan.lines.filter((l) => !l.removed && l.productId && quote.unconfirmedStock.includes(l.productId));
      if (!relevant.length) continue;
      const reviewed = plan.quoteId ? await gw.getQuote(plan.quoteId) : null;
      const valid = reviewed && reviewed.stockPolicy === quote.stockPolicy && reviewed.siteId === quote.siteId && reviewed.deliveryDate === quote.deliveryDate &&
        relevant.every((line) => {
          const old = reviewed.lines.find((l) => l.ref === line.id);
          const fresh = quote.lines.find((l) => l.productId === line.productId && l.outletId === line.outletId);
          return (plan.overrides.stockContinued ?? []).includes(line.productId!) && old && fresh && old.quantity === line.quantity && terms(old) === terms(fresh);
        });
      if (!valid) throw new BasketReviewError(409, "The unconfirmed stock terms changed. The order builder must review the items again before finance approval.");
    }
  }
  // Re-read after the lookup. Concurrent clicks share the same request; edits require a fresh submission.
  const latest = (await gw.orders(eventId)).orders;
  return tx(() => {
    if (snapshot(eventId, latest) !== before) throw new BasketReviewError(409, "The order changed. Review it and submit again.");
    const concurrent = basketReview(eventId, latest);
    if (concurrent) return concurrent;
    const lines = [
      ...existing.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => ({ lineId: `${o.id}:${l.lineNo}`, productId: l.productId, product: l.productName, quantity: l.quantity, unit: l.salesUnit, lineTotal: l.lineTotal }))),
      ...(quote?.lines ?? []).map((l) => ({ lineId: l.ref!, productId: l.productId, product: l.productName, quantity: l.quantity, unit: l.salesUnit, lineTotal: l.lineTotal })),
    ];
    const total = round2(existing.reduce((sum, o) => sum + o.totalExVat, 0) + (quote?.totalExVat ?? 0));
    const rules = [...(quote?.mandateCheck.rules ?? []), ...plans.flatMap((p) => [...p.inputRules, ...p.lines.flatMap((l) => l.rules)])].filter((r) => r.outcome !== "order");
    const deadlines = (quote?.lines ?? []).map((l) => parseAimoTime(l.closingTime)?.toISOString()).filter((v): v is string => !!v);
    if (quote) deadlines.push(quote.expiresAt);
    const question = makeQuestion({
      planId: `basket:${eventId}`, eventId, type: "order_review", forRole: "approver", outletId: null,
      quoteId: quote?.id ?? null, fingerprint: quote?.fingerprint ?? before,
      title: `Review order: ${event.name}`,
      body: `${person.name} submitted this order to finance for approval · ${eur(total)} ex VAT · ${lines.length} items`,
      facts: {
        kind: "approval", hotelId: HOTEL_ID, snapshot: before, planIds: plans.map((p) => p.id), lines, total,
        deliveryDate: quote?.deliveryDate ?? event.serviceDate, grants: quote?.mandateCheck.approvalsNeeded ?? [],
        items: [...new Map(rules.map((r) => [r.ruleId, { text: r.message }])).values()],
        continued, decidedBy: plans.find((p) => p.overrides.stockDecidedBy)?.overrides.stockDecidedBy ?? person.name,
      },
      ruleIds: [...new Set(rules.map((r) => r.ruleId))], deadline: deadlines.sort()[0] ?? null,
      options: [{ id: "approve", label: "Approve order", primary: true }, { id: "reject", label: "Refuse order", primary: false }],
    });
    saveQuestion(question);
    audit({ actor: personActor(person), action: "question_asked", summary: `${person.name} submitted ${event.name} to finance for review`, eventId, questionId: question.id, quoteId: question.quoteId, details: { kind: "confirmation", total, planIds: question.facts.planIds }, visibility: "hotel", usesFixture: quote?.usesFixtures ?? false });
    return question;
  });
}

/** Finance signs the exact quote, then the gateway rechecks its terms at commit. */
export async function answerBasketReview(question: Question, person: Person, token: string) {
  if (person.hotelId !== HOTEL_ID) throw new BasketReviewError(403, "This order belongs to another hotel");
  if (question.answer === "reject") return;
  const { orders } = await gw.orders(question.eventId!);
  if (stagedPlans(question.eventId!).some((p) => !matchesSelectedProducts(p.needs, p.lines)))
    throw new BasketReviewError(409, "The product matches changed. Ask the order builder to review the selected products.");
  if (snapshot(question.eventId!, orders) !== question.facts.snapshot)
    throw new BasketReviewError(409, "The order changed after submission. Ask the order builder to submit it again.");
  if (!question.quoteId) return; // Previously placed items are reviewed without placing them twice.
  try {
    const approval = await gw.approve(token, question.quoteId, question.fingerprint!, question.facts.grants as string[]);
    const order = await gw.order(question.quoteId, `basket-review:${question.id}`, approval.id, question.facts.continued as string[], question.facts.decidedBy as string);
    for (const plan of stagedPlans(question.eventId!).filter((p) => (question.facts.planIds as string[]).includes(p.id))) {
      plan.orderIds = [order.id];
      plan.approvalId = approval.id;
      plan.status = "ordered";
      plan.summary = `Approved by ${person.name} · ordered`;
      savePlan(plan);
    }
  } catch (error) {
    if (error instanceof GatewayError) throw new BasketReviewError(error.status, `${error.body.message} Submit the order for a fresh finance review.`);
    throw error;
  }
}
