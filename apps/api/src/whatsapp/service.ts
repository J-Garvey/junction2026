/** Synthetic channel coordinator. Uses the existing parser, plans and HTTP gateway. */
import type { Constraints, Order, PlanLine, Question, Quote, WhatsAppConversation, WhatsAppLine, WhatsAppOrderRef, WhatsAppReplyFacts } from "@aimo/contracts";
import type { Person } from "../identity.js";
import { kvGet, kvSet, tx } from "../db.js";
import { now, nowIso } from "../clock.js";
import { audit } from "../audit.js";
import { amendOrAsk, getEvent, listEvents, personActor, removeNeed, runViability, saveEvent, type StoredEvent } from "../agent/events.js";
import { getPlan, listPlans, mandate, newPlan, quoteAndDecide, savePlan, placeFromPlan, type StoredPlan } from "../agent/plan.js";
import { allQuestions, canAnswer, expireOpenQuestions, makeQuestion, saveQuestion } from "../agent/questions.js";
import { answer } from "../agent/answers.js";
import { BasketReviewError, invalidateBasketReview, submitBasketForReview } from "../agent/baskets.js";
import { gw, GatewayError } from "../agent/gatewayClient.js";
import { newId, parseAimoTime, sha256, stableStringify, round2 } from "../util.js";
import { interpretWhatsApp } from "./interpreter.js";
import { formatWhatsAppReply } from "./formatter.js";
import { basketSnapshot } from "./snapshot.js";
import { config } from "../config.js";

const ref = (id: string): WhatsAppOrderRef => {
  const e = getEvent(id)!;
  return { id, name: e.name, deliveryDate: e.serviceDate, version: e.version };
};
const chatLine = (line: PlanLine): WhatsAppLine => ({
  id: line.id, productId: line.productId, name: line.productName, quantity: line.quantity,
  unit: line.salesUnit, lineTotal: line.lineTotal, stock: line.stock?.kind === "known" ? "confirmed" : "unknown",
});
const staged = (id: string) => listPlans().filter((p) => p.eventId === id && p.kind === "single" && p.basketedAt && !p.reviewing && !p.orderIds.length && p.tooLateChoice !== "removed");
const warnings = (p: StoredPlan) => [...new Set([...p.inputRules, ...p.lines.filter((l) => !l.removed).flatMap((l) => l.rules)].filter((r) => r.outcome !== "order").map((r) => r.message))];
const hard = (p: StoredPlan) => Boolean(p.tooLate || p.error || p.status === "blocked" || p.status === "failed" || p.status === "needs_input" || [...p.inputRules, ...p.lines.filter((l) => !l.removed).flatMap((l) => l.rules)].some((r) => r.outcome === "block" || (r.outcome !== "order" && !r.overridable)));
// Placed orders are part of what the person reviewed: an amendment elsewhere invalidates the preview.
const pendingFingerprint = (id: string, orders: Order[], p?: StoredPlan, extra?: unknown) => sha256(stableStringify([basketSnapshot(id), orders.map((o) => [o.id, o.version, o.state]), p ? { request: p.request, fingerprint: p.fingerprint, lines: p.lines } : null, extra ?? null]));
const questionFingerprint = (q: Question) => sha256(stableStringify([q.id, q.state, q.quoteId, q.fingerprint, q.facts]));
const pastCutoff = (closingTime: string | null) => { const cut = parseAimoTime(closingTime); return Boolean(cut && cut.getTime() <= now().getTime()); };

/** Reply examples. The part before " — " is shown as the command to send. */
const TIPS = {
  summary: "summary — see the order with numbered lines",
  add: "add 10 kg salmon — add products",
  remove: "remove 2 — remove line 2",
  change: "change 2 to 15 — set line 2 to 15 packs",
  confirm: "confirm order — check and submit the order",
  approve: "approve — approve what is waiting for you",
  refuse: "refuse: too much salmon — return it with a note",
  create: "new order Emma's wedding on 17 Nov — start another order",
  switch: "order name — switch to another order",
  cancel: "cancel — drop a change before you confirm it",
};

/** Approver cards on this order, split into the ones this person may answer and the rest. */
function decisions(eventId: string, person: Person) {
  const open = allQuestions().filter((q) => q.eventId === eventId && q.state === "open" && q.forRole === "approver");
  return { mine: open.filter((q) => canAnswer(q, person)), others: open.filter((q) => !canAnswer(q, person)) };
}
const refuseOption = (q: Question) => q.options.find((o) => o.id === "reject") ?? q.options.find((o) => !o.primary && o.id !== "approve");

/** The question's own basket lines when it carries them; otherwise the current order lines. */
function questionLines(q: Question, fallback: WhatsAppLine[]): WhatsAppLine[] {
  const lines = q.facts.lines as { lineId: string; productId: string; product: string; quantity: number; unit: string | null; lineTotal: number | null }[] | undefined;
  return lines?.length ? lines.map((l) => ({ id: l.lineId, productId: l.productId, name: l.product, quantity: l.quantity, unit: l.unit, lineTotal: l.lineTotal, stock: null })) : fallback;
}

async function contents(id: string) {
  const e = getEvent(id)!;
  const sources = staged(id);
  const orders = (await gw.orders(id)).orders.filter((o) => o.state !== "rejected");
  let base: StoredPlan | null = null;
  if (e.dishes.length && !orders.length) {
    // Reuse the event planner, including diet groups and removed needs.
    base = await runViability(id, { id: "whatsapp-preview", name: "WhatsApp preview", role: "chef", outlets: [], hotelScope: true, hotelId: "hotel-aurora", title: "Preview" });
  }
  const plans = [...(base ? [base] : []), ...sources];
  const lines = plans.flatMap((p) => p.lines.filter((l) => !l.removed));
  // Placed lines first, then additions; the summary numbers lines in this order.
  const displayed: WhatsAppLine[] = [...orders.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => ({ id: `${o.id}:${l.lineNo}`, productId: l.productId, name: l.productName, quantity: l.quantity, unit: l.salesUnit, lineTotal: l.lineTotal, stock: l.stock.kind === "known" ? "confirmed" as const : "unknown" as const, ordered: true }))), ...plans.flatMap((p) => p.lines.filter((l) => !l.removed).map((l) => ({ ...chatLine(l), id: `${p === base ? "event" : p.id}:${l.id}` })))];
  const totalExVat = displayed.some((l) => l.lineTotal === null) ? null : round2(displayed.reduce((sum, l) => sum + l.lineTotal!, 0));
  return { e, sources, plans, lines, displayed, orders, totalExVat };
}

/** Why placed lines can't be changed as asked, or null. The gateway re-checks all of it. */
function amendmentProblem(orders: Order[], changes: { lineId: string; quantity: number }[]): string | null {
  for (const o of orders) {
    const mine = changes.filter((c) => c.lineId.startsWith(`${o.id}:`));
    if (!mine.length) continue;
    if (o.state === "locked") return "This order is locked and can no longer be changed.";
    for (const c of mine) {
      const line = o.lines.find((l) => !l.removed && `${o.id}:${l.lineNo}` === c.lineId);
      if (!line) return "That line is no longer in the order. Say 'summary' to see the current lines.";
      if (pastCutoff(line.closingTime)) return `The order cut-off for ${line.productName} has passed, so it can no longer be changed.`;
    }
    const left = o.lines.filter((l) => !l.removed && !mine.some((c) => c.quantity === 0 && c.lineId === `${o.id}:${l.lineNo}`));
    if (!left.length) return "That would empty the placed order. Keep at least one item; Valio Aimo cancels whole orders.";
  }
  if (changes.some((c) => !orders.some((o) => c.lineId.startsWith(`${o.id}:`)))) return "That line is no longer in the order. Say 'summary' to see the current lines.";
  return null;
}

type Contents = Awaited<ReturnType<typeof contents>>;
type QuantityCheck = { line: WhatsAppLine; quote: Quote["lines"][number]; terms: unknown; warnings: string[] } | { problem: string; detail?: string; appLink?: WhatsAppReplyFacts["appLink"] };

/** Today's price, stock and delivery terms for one line at a new quantity. Nothing is changed. */
async function quantityCheck(current: Contents, line: WhatsAppLine, quantity: number): Promise<QuantityCheck> {
  const basketLink = { label: "Open the order", path: `/baskets/${encodeURIComponent(current.e.id)}` };
  let source: { productId: string; outletId: string; requires: Constraints; continued: boolean } | null = null;
  if (line.ordered) {
    const o = current.orders.find((x) => line.id.startsWith(`${x.id}:`));
    const ol = o?.lines.find((l) => !l.removed && `${o.id}:${l.lineNo}` === line.id);
    if (ol) source = { productId: ol.productId, outletId: ol.outletId, requires: ol.requires ?? { claims: [], avoidAllergens: [], labels: [] }, continued: Boolean(ol.riskAccepted) };
  } else {
    const p = current.sources.find((x) => line.id.startsWith(`${x.id}:`));
    const pl = p?.lines.find((l) => !l.removed && `${p.id}:${l.id}` === line.id);
    if (p && pl?.productId) {
      const needs = p.needs.filter((n) => pl.needIds.includes(n.id)).map((n) => n.constraints);
      const origins = [...new Set(needs.map((n) => n.origin).filter((o): o is string => Boolean(o)))];
      if (origins.length > 1) return { problem: "This product has conflicting required origins.", detail: "Resolve the requirements in the app.", appLink: basketLink };
      source = {
        productId: pl.productId, outletId: pl.outletId, continued: Boolean(p.overrides.stockContinued?.includes(pl.productId)),
        requires: { claims: [...new Set(needs.flatMap((n) => n.claims))], avoidAllergens: [...new Set(needs.flatMap((n) => n.avoidAllergens))], labels: [...new Set(needs.flatMap((n) => n.labels))], ...(origins.length ? { origin: origins[0] } : {}) },
      };
    }
  }
  if (!source) return { problem: "That line has no verified product.", detail: "Change it in the app.", appLink: basketLink };
  let quote: Quote;
  try {
    quote = await gw.quote({ siteId: current.e.siteId, eventId: current.e.id, deliveryDate: current.e.serviceDate, lines: [{ productId: source.productId, outletId: source.outletId, quantity, ref: line.id, requires: source.requires }] });
  } catch (error) {
    return { problem: "The gateway could not price this change.", detail: error instanceof GatewayError ? error.body.message : "Try again in the app." };
  }
  const q = quote.lines[0];
  const increase = quantity > line.quantity;
  // A decrease never makes a shortage worse, so only an increase is held to stock.
  const blocking = q.rules.filter((r) => r.outcome === "block" && (increase || r.ruleId !== "STK-04"));
  if (blocking.length) return { problem: "This change is blocked.", detail: [...new Set(blocking.map((r) => r.message))].join(" ") };
  if (q.lineTotal === null) return { problem: "There is no confirmed price for this product.", detail: "Change it in the app.", appLink: basketLink };
  if (increase && q.stock.kind === "known" && q.stock.amount < quantity) return { problem: `Only ${q.stock.amount}${q.salesUnit ? ` ${q.salesUnit}` : ""} are available.`, detail: "Choose a smaller quantity." };
  if (increase && q.stock.kind !== "known" && !source.continued) {
    return { problem: "Stock is not confirmed for the larger quantity.", detail: "A chat reply can't accept unconfirmed stock. Decide on it in the app.", appLink: basketLink };
  }
  return {
    quote: q,
    line: { ...line, quantity, lineTotal: q.lineTotal, stock: q.stock.kind === "known" ? "confirmed" : "unknown" },
    terms: { productId: q.productId, unitPrice: q.unitPrice, availableDate: q.availableDate, closingTime: q.closingTime, stock: q.stock.kind },
    warnings: [...new Set(q.rules.filter((r) => r.outcome !== "order" && r.outcome !== "block").map((r) => r.message))],
  };
}

/** The transport serializes each person; this also serializes different people on one basket. */
const basketLocks = new Map<string, Promise<void>>();
async function locked<T>(id: string, action: () => Promise<T>): Promise<T> {
  const previous = basketLocks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const queued = previous.then(() => next);
  basketLocks.set(id, queued);
  await previous;
  try { return await action(); } finally { release(); if (basketLocks.get(id) === queued) basketLocks.delete(id); }
}

export async function handleWhatsAppMessage(input: { person: Person; token: string; conversation: WhatsAppConversation; text: string; messageId: string; channel?: "web" | "simulator" }) {
  const { person, text } = input;
  const conversation = structuredClone(input.conversation);
  const respond = (facts: WhatsAppReplyFacts) => ({ conversation, reply: formatWhatsAppReply(facts, input.channel, config.publicAppUrl) });
  const placed = person.hotelScope ? [] : (await gw.orders()).orders.filter((o) => o.state !== "rejected");
  const choices = listEvents().filter((e) => person.hotelId === "hotel-aurora" && mandate().sites.some((s) => s.id === e.siteId) && (person.hotelScope || (e.dishes.every((d) => person.outlets.includes(d.outletId))
    && staged(e.id).every((p) => p.lines.filter((l) => !l.removed).every((l) => person.outlets.includes(l.outletId)))
    && placed.filter((o) => o.eventId === e.id).every((o) => o.lines.filter((l) => !l.removed).every((l) => person.outlets.includes(l.outletId)))))).map((e) => ref(e.id));
  if (!choices.some((e) => e.id === conversation.activeOrderId)) { conversation.activeOrderId = null; conversation.pending = null; }
  const initial = conversation.activeOrderId ? await contents(conversation.activeOrderId) : null;
  let interpretation = await interpretWhatsApp(text, { ...conversation, orders: choices, lines: initial?.displayed ?? [] });
  if (interpretation.orderId && !choices.some((o) => o.id === interpretation.orderId)) return respond({ status: "blocked", headline: "This order is outside your hotel or outlet scope." });
  if (interpretation.orderId && interpretation.orderId !== conversation.activeOrderId) {
    conversation.activeOrderId = interpretation.orderId;
    conversation.pending = null;
    const selected = await contents(interpretation.orderId);
    interpretation = await interpretWhatsApp(text, { ...conversation, orders: choices, lines: selected.displayed });
  }
  if (interpretation.intent === "cancel") {
    conversation.pending = null;
    return respond({ status: "summary", headline: "Pending change cancelled", detail: "The basket is unchanged." });
  }
  if (interpretation.intent === "help") {
    const active = choices.find((o) => o.id === interpretation.orderId) ?? null;
    return respond({ status: "summary", headline: "What I can do", detail: active ? `Working on ${active.name}. Changes always show a preview first and need a second reply to confirm.` : "Changes always show a preview first and need a second reply to confirm.", order: active, tips: Object.values(TIPS) });
  }
  if (interpretation.intent === "new_order") {
    const wanted = interpretation.newOrder!;
    if (person.hotelId !== "hotel-aurora") return respond({ status: "blocked", headline: "You can't create orders for this hotel." });
    if (wanted.deliveryDate < nowIso().slice(0, 10)) return respond({ status: "clarification", headline: `${wanted.deliveryDate} is in the past. Which delivery date should the order have?` });
    const e: StoredEvent = {
      id: newId("evt"), name: wanted.name, siteId: mandate().sites[0].id, serviceDate: wanted.deliveryDate, guests: 0, dietGroups: [], dishes: [], dietsConfirmed: false,
      version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [{ at: nowIso(), by: person.name, what: "Order created" }],
    };
    saveEvent(e);
    audit({ actor: personActor(person), action: "basket_created", summary: `${person.name} opened the order "${e.name}" for delivery ${e.serviceDate} through simulated WhatsApp`, eventId: e.id, details: { kind: "confirmation" }, visibility: "hotel" });
    conversation.activeOrderId = e.id;
    conversation.pending = null;
    return respond({ status: "updated", headline: "New order created", detail: "It is empty. Add products to it next.", order: ref(e.id), tips: [TIPS.add, TIPS.summary] });
  }
  if (interpretation.intent === "clarify" || !interpretation.orderId) {
    // A later "confirm change/order" must never accept an older proposal after
    // the person's latest request needed clarification instead of a new preview.
    const hadPending = Boolean(conversation.pending);
    conversation.pending = null;
    return respond({ status: "clarification", headline: interpretation.question ?? "Which order would you like to work on?", detail: hadPending ? "The previous confirmation was cancelled. Send the request again to review it." : undefined, orderChoices: interpretation.choices, actions: interpretation.choices.map((o) => ({ label: o.name, text: o.id })) });
  }
  const id = interpretation.orderId;
  conversation.activeOrderId = id;
  return locked(id, async () => {
    const order = ref(id);
    const current = await contents(id);
    const confirmAction = { label: current.orders.length ? "Submit for finance review" : "Review final order", text: "confirm order" };
    const summary = (extra: Partial<WhatsAppReplyFacts> = {}) => respond({ status: "summary", headline: "Your current order basket", order, lines: current.displayed, totalExVat: current.totalExVat, numbered: true, actions: [confirmAction], ...extra });
    const blocked = (headline: string, detail?: string, appLink?: WhatsAppReplyFacts["appLink"]) => respond({ status: "blocked", headline, detail, order, appLink });
    const financeInApp = () => {
      conversation.pending = null;
      return blocked("Financial approvals stay in the app.", "The financial approver must sign in and review the decision there.", { label: "Review in the app", path: `/baskets/${encodeURIComponent(id)}` });
    };
    // Another person may have changed the basket while this message was being
    // interpreted or waiting for its lock. Check current scope before any reply.
    if (!mandate().sites.some((s) => s.id === current.e.siteId) || (!person.hotelScope
      && (current.e.dishes.some((d) => !person.outlets.includes(d.outletId))
        || [...current.lines, ...current.orders.flatMap((o) => o.lines)].some((l) => !l.removed && !person.outlets.includes(l.outletId))))) {
      conversation.activeOrderId = null;
      conversation.pending = null;
      return blocked("This order is outside your hotel or outlet scope.");
    }
    if (interpretation.intent === "summary" || interpretation.intent === "select_order") {
      const waiting = decisions(id, person);
      const tips = current.displayed.length ? [TIPS.add, TIPS.remove, TIPS.change] : [TIPS.add];
      if (waiting.mine.length && input.channel !== "web") tips.push(TIPS.approve, TIPS.refuse);
      const detail = [
        current.orders.length ? "Lines marked placed are already ordered; changing them amends the mock order." : "You can add, remove or change items, then confirm the final basket.",
        waiting.mine.length ? `${waiting.mine.length === 1 ? "A decision is" : `${waiting.mine.length} decisions are`} waiting ${input.channel === "web" ? "in the app" : "for you"}: ${waiting.mine[0].title}.` : "",
        !waiting.mine.length && waiting.others.length ? "Waiting for a manager's approval." : "",
      ].filter(Boolean).join(" ");
      return summary({ detail, tips, ...(input.channel === "web" && waiting.mine.length ? { appLink: { label: "Review in the app", path: `/baskets/${encodeURIComponent(id)}` } } : {}) });
    }
    if (interpretation.intent === "approve" || interpretation.intent === "refuse") {
      // Real group senders inherit a demo ordering identity, never its financial
      // approval authority. Even the linked phone must approve in the app.
      if (input.channel === "web") return financeInApp();
      conversation.pending = null;
      const waiting = decisions(id, person);
      const q = waiting.mine[0];
      if (!q) return blocked(waiting.others.length ? "This decision is for a manager." : "Nothing on this order is waiting for approval.", waiting.others.length ? "Only the financial approver can approve or refuse it." : undefined);
      const option = interpretation.intent === "approve" ? q.options.find((o) => o.primary) : refuseOption(q);
      if (!option) return blocked("This decision can't be answered from chat.", undefined, { label: "Open the decision", path: `/baskets/${encodeURIComponent(id)}#question-${encodeURIComponent(q.id)}` });
      if (interpretation.intent === "refuse" && q.type === "order_review" && !interpretation.note) {
        return respond({ status: "clarification", headline: "What should I tell the order builder?", detail: "Reply with the reason, for example 'refuse: too much salmon'.", order });
      }
      if ((interpretation.note?.length ?? 0) > 2000) return respond({ status: "clarification", headline: "Please keep the note under 2000 characters.", order });
      const approving = interpretation.intent === "approve";
      conversation.pending = { kind: "answer_question", orderId: id, questionId: q.id, optionId: option.id, note: interpretation.note, fingerprint: questionFingerprint(q) };
      const verb = approving ? "approval" : "refusal";
      return respond({
        status: "proposal", change: approving ? "approve" : "refuse", headline: `${option.label}?`, order,
        detail: [q.title, q.body, !approving && interpretation.note ? `Note: ${interpretation.note}` : "", waiting.mine.length > 1 ? `${waiting.mine.length - 1} more decision${waiting.mine.length > 2 ? "s" : ""} after this one.` : ""].filter(Boolean).join(" · "),
        lines: questionLines(q, current.displayed), totalExVat: typeof q.facts.total === "number" ? q.facts.total : current.totalExVat,
        actions: [{ label: `Confirm ${verb}`, text: `confirm ${verb}` }, { label: "Cancel", text: "cancel" }],
      });
    }
    if (interpretation.intent === "add_items") {
      conversation.pending = null;
      if (!interpretation.request?.lines.length || interpretation.request.lines.some((l) => !l.quantity || l.quantity.amount <= 0)) return respond({ status: "clarification", headline: "How much of each product should I add?", order });
      const request = { ...interpretation.request, siteId: current.e.siteId, outletId: person.outlets[0] ?? "banquet", neededBy: interpretation.request.neededBy ?? current.e.serviceDate };
      if (request.neededBy !== current.e.serviceDate) return blocked("The requested delivery date differs from this basket.", "Choose a basket with the right delivery date in the app.");
      const plan = newPlan("single", { personId: person.id, name: person.name }, request.outletId, { eventId: id, request, reviewing: true, title: request.lines.map((l) => l.text).join(", ") });
      await quoteAndDecide(plan, input.token);
      if (hard(plan) || !plan.proposal) return respond({ status: "blocked", headline: plan.summary || "This request needs more details.", order, lines: plan.lines.map(chatLine), warnings: warnings(plan), appLink: { label: "Review this request", path: `/requests/${encodeURIComponent(plan.id)}` } });
      conversation.pending = { kind: "add_items", orderId: id, planId: plan.id, fingerprint: pendingFingerprint(id, current.orders, plan) };
      return respond({ status: "proposal", headline: "Add these items to your basket?", order, change: "add", detail: current.orders.length ? "They join the order as additions and go to finance review with it." : undefined, lines: plan.lines.map(chatLine), totalExVat: plan.totalExVat, warnings: warnings(plan), actions: [{ label: "Confirm change", text: "confirm change" }, { label: "Cancel", text: "cancel" }] });
    }
    if (interpretation.intent === "remove_items") {
      conversation.pending = null;
      const selected = current.displayed.filter((l) => interpretation.lineIds.includes(l.id));
      if (!selected.length || selected.length !== interpretation.lineIds.length) return blocked("I could not identify those items. Name one exact product to remove.");
      const placedLines = selected.filter((l) => l.ordered);
      if (placedLines.length && placedLines.length !== selected.length) return blocked("Please remove placed lines and new additions in separate messages.", "Say 'summary' to see which lines are placed.");
      if (placedLines.length) {
        const problem = amendmentProblem(current.orders, placedLines.map((l) => ({ lineId: l.id, quantity: 0 })));
        if (problem) return blocked(problem);
      }
      conversation.pending = { kind: "remove_items", orderId: id, lineIds: selected.map((l) => l.id), fingerprint: pendingFingerprint(id, current.orders) };
      const after = current.totalExVat === null || selected.some((l) => l.lineTotal === null) ? null : round2(current.totalExVat - selected.reduce((s, l) => s + l.lineTotal!, 0));
      return respond({
        status: "proposal", change: "remove", order, lines: selected,
        headline: placedLines.length ? "Remove these items from the placed order?" : "Remove these items from your basket?",
        detail: placedLines.length ? `This amends the placed mock order. New order total ${after === null ? "not confirmed" : `€${after.toFixed(2)}`} ex VAT.` : undefined,
        actions: [{ label: "Confirm removal", text: "confirm removal" }, { label: "Cancel", text: "cancel" }],
      });
    }
    if (interpretation.intent === "change_quantity") {
      conversation.pending = null;
      const line = current.displayed.find((l) => l.id === interpretation.lineIds[0]);
      const quantity = interpretation.quantity;
      if (!line || !quantity || interpretation.lineIds.length !== 1) return respond({ status: "clarification", headline: "Which line should I change? Say 'summary' to see the numbered lines.", order });
      if (line.id.startsWith("event:")) return blocked("This line comes from the event plan.", "Change guests or dishes in the app to change it.", { label: "Open the event", path: `/events/${encodeURIComponent(id)}` });
      if (line.ordered) {
        const problem = amendmentProblem(current.orders, [{ lineId: line.id, quantity }]);
        if (problem) return blocked(problem);
      }
      const check = await quantityCheck(current, line, quantity);
      if ("problem" in check) return blocked(check.problem, check.detail, check.appLink);
      conversation.pending = { kind: "change_quantity", orderId: id, lineIds: [line.id], quantity, fingerprint: pendingFingerprint(id, current.orders, undefined, check.terms) };
      const after = current.totalExVat === null || line.lineTotal === null || check.line.lineTotal === null ? null : round2(current.totalExVat - line.lineTotal + check.line.lineTotal);
      return respond({
        status: "proposal", change: "quantity", order, lines: [check.line],
        headline: `Change ${line.name} from ${line.quantity} to ${quantity}${line.unit ? ` ${line.unit}` : ""}?`,
        detail: [line.ordered ? "This amends the placed mock order." : "", `New order total ${after === null ? "not confirmed" : `€${after.toFixed(2)}`} ex VAT.`].filter(Boolean).join(" "),
        warnings: check.warnings,
        actions: [{ label: "Confirm change", text: "confirm change" }, { label: "Cancel", text: "cancel" }],
      });
    }
    const pending = conversation.pending;
    if (interpretation.intent === "accept_change") {
      if (!pending || pending.orderId !== id || pending.kind === "confirm_order") return blocked("There is no basket change waiting for confirmation.");
      conversation.pending = null;
      if (pending.kind === "answer_question") return answerFromChat(pending.questionId!, pending.optionId!, pending.note, pending.fingerprint);
      if (pending.kind === "change_quantity") return changeFromChat(pending.lineIds![0], pending.quantity!, pending.fingerprint);
      conversation.pending = pending;
      const plan = pending.planId ? getPlan(pending.planId) : null;
      if (pending.fingerprint !== pendingFingerprint(id, current.orders, plan ?? undefined)) { conversation.pending = null; return blocked("The basket changed since you reviewed it.", "Send the change again to review the latest basket."); }
      const changedLines = pending.kind === "add_items" && plan ? plan.lines.map(chatLine) : current.displayed.filter((line) => pending.lineIds?.includes(line.id));
      const placedRemoval = pending.kind === "remove_items" && changedLines.some((l) => l.ordered);
      if (pending.kind === "add_items" && plan) {
        const previous = pending.fingerprint;
        await quoteAndDecide(plan, input.token);
        if (hard(plan) || !plan.proposal) { conversation.pending = null; return blocked(plan.summary, warnings(plan).join(" ")); }
        if (previous !== pendingFingerprint(id, current.orders, plan)) { conversation.pending = null; return blocked("The product, price or delivery terms changed. Send the request again to review them."); }
        // Unknown stock requires its own explicit chef decision in the existing app.
        if (plan.lines.some((l) => l.stock?.kind !== "known")) {
          conversation.pending = null;
          plan.reviewing = false;
          savePlan(plan);
          return blocked("Stock is not confirmed.", "Review the stock decision before adding these items. A chat confirmation cannot confirm stock.", { label: "Review stock decision", path: `/requests/${encodeURIComponent(plan.id)}` });
        }
        tx(() => {
          plan.reviewing = false; plan.basketedAt = nowIso(); plan.proposal = false;
          plan.status = "waiting"; plan.summary = "In the order · awaiting final order";
          savePlan(plan);
          audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} added ${plan.title} through simulated WhatsApp`, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
        });
        invalidateBasketReview(id);
      } else if (placedRemoval) {
        const problem = amendmentProblem(current.orders, changedLines.map((l) => ({ lineId: l.id, quantity: 0 })));
        if (problem) { conversation.pending = null; return blocked(problem); }
        for (const o of current.orders) {
          const changes = o.lines.filter((l) => !l.removed && pending.lineIds?.includes(`${o.id}:${l.lineNo}`)).map((l) => ({ productId: l.productId, outletId: l.outletId, quantity: 0 }));
          if (!changes.length) continue;
          try {
            await gw.amend(o.id, { changes, decidedBy: person.name });
          } catch (error) {
            conversation.pending = null;
            return blocked("Valio Aimo's gateway refused the change.", error instanceof GatewayError ? error.body.message : "Try again in the app.");
          }
        }
        audit({ actor: personActor(person), action: "order_amended", eventId: id, summary: `${person.name} removed ${changedLines.map((l) => l.name).join(", ")} from the placed order through simulated WhatsApp`, details: { kind: "confirmation", lineIds: pending.lineIds }, visibility: "hotel" });
      } else if (pending.kind === "remove_items") {
        tx(() => {
          for (const p of current.sources) {
            const lines = p.lines.filter((l) => pending.lineIds?.includes(`${p.id}:${l.id}`));
            if (!lines.length) continue;
            for (const l of lines) { l.removed = true; p.overrides.removedNeeds.push(...l.needIds); }
            p.totalExVat = p.lines.filter((l) => !l.removed).some((l) => l.lineTotal === null) ? null : round2(p.lines.filter((l) => !l.removed).reduce((s, l) => s + l.lineTotal!, 0));
            savePlan(p);
          }
          for (const l of (current.plans.find((p) => p.kind === "event")?.lines ?? []).filter((l) => pending.lineIds?.includes(`event:${l.id}`))) {
            for (const needId of l.needIds) removeNeed(id, needId, getEvent(id)!.version, person);
          }
          audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} removed basket lines through simulated WhatsApp`, details: { kind: "confirmation", lineIds: pending.lineIds }, visibility: "hotel" });
        });
        invalidateBasketReview(id);
      }
      conversation.pending = null;
      const updated = await contents(id);
      return respond({ status: "updated", change: pending.kind === "add_items" ? "add" : "remove", headline: pending.kind === "add_items" ? "Added to your basket" : placedRemoval ? "Removed from the placed order" : "Removed from your basket", order: ref(id), lines: changedLines, totalExVat: updated.totalExVat, actions: placedRemoval ? [] : [confirmAction] });
    }

    /** Re-checks the reviewed terms, then amends the placed order or updates the staged line. */
    async function changeFromChat(lineId: string, quantity: number, fingerprint: string) {
      const line = current.displayed.find((l) => l.id === lineId);
      if (!line) return blocked("That line is no longer in the order.", "Say 'summary' to see the current lines.");
      if (line.ordered) {
        const problem = amendmentProblem(current.orders, [{ lineId, quantity }]);
        if (problem) return blocked(problem);
      }
      const check = await quantityCheck(current, line, quantity);
      if ("problem" in check) return blocked(check.problem, check.detail, check.appLink);
      if (fingerprint !== pendingFingerprint(id, current.orders, undefined, check.terms)) return blocked("The order, price or delivery terms changed since you reviewed them.", "Send the change again to review the latest terms.");
      const what = `${line.name} from ${line.quantity} to ${quantity}${line.unit ? ` ${line.unit}` : ""}`;
      if (line.ordered) {
        const o = current.orders.find((x) => lineId.startsWith(`${x.id}:`))!;
        const ol = o.lines.find((l) => `${o.id}:${l.lineNo}` === lineId)!;
        // An increase on unconfirmed stock continues only on the hotel's earlier explicit decision.
        const stock = ol.riskAccepted && check.quote.stock.kind !== "known" ? { continueWith: [ol.productId], decidedBy: ol.riskAccepted.by } : undefined;
        let outcome: "applied" | "asked";
        try {
          outcome = await amendOrAsk(current.e, o.id, [{ productId: ol.productId, outletId: ol.outletId, quantity }], `Approve the change to ${current.e.name}?`, `${person.name} asked in WhatsApp to change ${what}.`, stock);
        } catch (error) {
          return blocked("Valio Aimo's gateway refused the change.", error instanceof GatewayError ? error.body.message : "Try again in the app.");
        }
        audit({ actor: personActor(person), action: "order_amended", eventId: id, orderId: o.id, summary: `${person.name} ${outcome === "applied" ? "changed" : "asked to change"} ${what} through simulated WhatsApp`, details: { kind: "confirmation", lineId, quantity }, visibility: "hotel" });
        if (outcome === "asked") return respond({ status: "approval_required", headline: "Manager approval needed for this change", detail: "The placed order stays as it is until a manager approves the change.", order: ref(id), lines: [check.line], appLink: { label: "Review approval", path: `/baskets/${encodeURIComponent(id)}` } });
      } else {
        const [planId] = lineId.split(":");
        tx(() => {
          const p = getPlan(planId)!;
          const pl = p.lines.find((l) => `${p.id}:${l.id}` === lineId)!;
          Object.assign(pl, { quantity, unitPrice: check.quote.unitPrice, lineTotal: check.quote.lineTotal, stock: check.quote.stock, availableDate: check.quote.availableDate, closingTime: check.quote.closingTime, rules: check.quote.rules });
          const live = p.lines.filter((l) => !l.removed);
          p.totalExVat = live.some((l) => l.lineTotal === null) ? null : round2(live.reduce((s, l) => s + l.lineTotal!, 0));
          savePlan(p);
          audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} changed ${what} through simulated WhatsApp`, details: { kind: "confirmation", planId: p.id, lineId, quantity }, visibility: "hotel" });
        });
        invalidateBasketReview(id);
      }
      const updated = await contents(id);
      return respond({ status: "updated", change: "quantity", headline: line.ordered ? "Placed order changed" : "Quantity changed", order: ref(id), lines: [check.line], totalExVat: updated.totalExVat, actions: line.ordered ? [] : [confirmAction] });
    }

    /** Records the approver's decision exactly as the app's decision card does. */
    async function answerFromChat(questionId: string, optionId: string, note: string | undefined, fingerprint: string) {
      // Also reject persisted pre-fix answer_question confirmations.
      if (input.channel === "web") return financeInApp();
      const q = allQuestions().find((x) => x.id === questionId);
      if (!q || q.state !== "open" || questionFingerprint(q) !== fingerprint) return blocked("This decision changed or was already answered.", "Say 'summary' to see what is waiting now.");
      const out = await answer(q.id, person, optionId, input.token, note);
      if (!out.ok) return blocked(out.reason);
      const approved = optionId === q.options.find((o) => o.primary)?.id;
      if (out.error) return blocked(approved ? "The approval was recorded, but the order could not be placed." : "The decision was recorded, but applying it failed.", out.error, { label: "Open the order", path: `/baskets/${encodeURIComponent(id)}` });
      const after = await contents(id);
      if (approved && q.type === "order_review" && q.quoteId) {
        return respond({ status: "ordered", headline: "Approved and ordered", order: ref(id), lines: after.displayed, totalExVat: after.totalExVat, orderIds: after.orders.map((o) => o.id) });
      }
      return respond({ status: "updated", change: approved ? "approve" : "refuse", headline: approved ? "Approved" : "Refused", detail: approved ? q.title : `${q.title}. Your note was sent to the order builder.`, order: ref(id), lines: after.displayed, totalExVat: after.totalExVat });
    }

    if (interpretation.intent !== "confirm_order") return blocked("Please describe a basket change or ask for an order summary.");
    if (current.orders.length) {
      // With a placed order, the final step is the same finance review as the app's submit button.
      const snapshot = pendingFingerprint(id, current.orders);
      if (!pending || pending.kind !== "confirm_order" || pending.orderId !== id || pending.fingerprint !== snapshot) {
        conversation.pending = { kind: "confirm_order", orderId: id, fingerprint: snapshot };
        return summary({ status: "proposal", change: "submit", headline: "Submit this order for finance review?", detail: "Finance approves the complete order before the additions are placed.", numbered: false, actions: [{ label: "Submit for review", text: "confirm order" }, { label: "Cancel", text: "cancel" }] });
      }
      conversation.pending = null;
      try {
        const review = await submitBasketForReview(id, person, input.token);
        return summary({ status: "approval_required", headline: "Sent for finance review", detail: review.body, numbered: false, lines: [], actions: [], appLink: { label: "Review approval", path: `/baskets/${encodeURIComponent(id)}#question-${encodeURIComponent(review.id)}` } });
      } catch (error) {
        if (error instanceof BasketReviewError) return blocked(error.message, undefined, { label: "Open the order", path: `/baskets/${encodeURIComponent(id)}` });
        if (error instanceof GatewayError) return blocked("The gateway could not quote this order.", error.body.message);
        throw error;
      }
    }
    const checkoutKey = `whatsapp-checkout:${id}`;
    const existingId = kvGet<string>(checkoutKey);
    const existing = existingId ? getPlan(existingId) : null;
    if (existing && existing.status === "waiting" && existing.basketCheckout?.snapshot === basketSnapshot(id)) {
      conversation.pending = null;
      return summary({ status: "approval_required", headline: "This order is already awaiting manager approval", detail: "Your financial approver can review the exact quote below.", lines: [], actions: [], appLink: { label: "Review approval", path: `/baskets/${encodeURIComponent(id)}${existing.questionIds[0] ? `#question-${encodeURIComponent(existing.questionIds[0])}` : ""}` } });
    }
    if (!current.lines.length) return blocked("This basket is empty. Add items before confirming it.");
    const snapshot = basketSnapshot(id);
    if (!pending || pending.kind !== "confirm_order" || pending.orderId !== id || pending.fingerprint !== snapshot) {
      conversation.pending = { kind: "confirm_order", orderId: id, fingerprint: snapshot };
      return summary({ status: "proposal", change: "submit", headline: "Confirm this final order?", detail: "I’ll run the final checks and request manager approval if needed.", actions: [{ label: "Confirm final order", text: "confirm order" }, { label: "Cancel", text: "cancel" }] });
    }
    conversation.pending = null;
    if (current.plans.some(hard)) return blocked("Resolve the basket's product or delivery issues in the app before ordering.");
    const allRules = current.plans.flatMap((p) => [...p.inputRules, ...p.lines.filter((l) => !l.removed).flatMap((l) => l.rules)]);
    const continued = new Set(current.plans.flatMap((p) => p.overrides.stockDecidedBy ? p.overrides.stockContinued ?? [] : []));
    const unresolved = allRules.filter((r) => r.outcome === "ask_chef" && !(r.ruleId === "STK-01" && continued.has(String(r.facts.productId))));
    const softApprovals = allRules.filter((r) => r.outcome === "ask_approver");
    if (unresolved.length || current.lines.some((l) => l.stock?.kind !== "known" && !continued.has(l.productId ?? ""))) return blocked("The basket still needs a chef decision.", [...new Set(unresolved.map((r) => r.message)), "Resolve stock and product questions in the app."].join(" "));
    // Aggregate products across messages before stock and mandate evaluation.
    const grouped = new Map<string, { line: PlanLine; requires: Constraints }>();
    for (const line of current.lines) {
      if (!line.productId) return blocked("An item has no verified product. Resolve it in the app.");
      const requirements = current.plans.flatMap((p) => p.needs).filter((n) => line.needIds.includes(n.id)).map((n) => n.constraints);
      const key = `${line.productId}|${line.outletId}`;
      const group = grouped.get(key) ?? { line: { ...structuredClone(line), quantity: 0 }, requires: { claims: [], avoidAllergens: [], labels: [] } };
      group.line.quantity += line.quantity;
      group.requires.claims = [...new Set([...group.requires.claims, ...requirements.flatMap((r) => r.claims)])];
      group.requires.avoidAllergens = [...new Set([...group.requires.avoidAllergens, ...requirements.flatMap((r) => r.avoidAllergens)])];
      group.requires.labels = [...new Set([...group.requires.labels, ...requirements.flatMap((r) => r.labels)])];
      const origins = [...new Set([group.requires.origin, ...requirements.map((r) => r.origin)].filter((origin): origin is string => Boolean(origin)))];
      if (origins.length > 1) return blocked("This product has conflicting required origins. Resolve the requirements in the app.");
      if (origins.length) group.requires.origin = origins[0];
      grouped.set(key, group);
    }
    let quote: Quote;
    try {
      quote = await gw.quote({ siteId: current.e.siteId, eventId: id, deliveryDate: current.e.serviceDate, lines: [...grouped.values()].map(({ line, requires }) => ({ productId: line.productId!, outletId: line.outletId, quantity: line.quantity, ref: line.id, requires })) });
    } catch (error) { return blocked("The gateway could not quote this basket.", error instanceof GatewayError ? error.message : "Try again in the app."); }
    if (basketSnapshot(id) !== snapshot) return blocked("The basket changed while the final checks were running. Review it again.");
    if (quote.outcome === "block" || quote.lines.some((l) => l.lineTotal === null || (l.stock.kind !== "known" && !continued.has(l.productId)))) return blocked("The gateway blocked this basket.", quote.lines.flatMap((l) => l.rules.filter((r) => r.outcome !== "order").map((r) => r.message)).join(" "));
    // Accounting outlets share supplier stock; do not count the same stock twice.
    const totalsByProduct = new Map<string, number>();
    for (const line of quote.lines) totalsByProduct.set(line.productId, (totalsByProduct.get(line.productId) ?? 0) + line.quantity);
    if (quote.lines.some((l) => l.stock.kind === "known" && totalsByProduct.get(l.productId)! > l.stock.amount)) return blocked("There is not enough confirmed stock for the entire basket.", "Reduce the requested quantity in the app before confirming.");
    // The fresh gateway quote may not silently replace the terms the person saw.
    if (quote.totalExVat !== current.totalExVat || quote.lines.some((l) => { const original = grouped.get(`${l.productId}|${l.outletId}`)!.line; return l.unitPrice !== original.unitPrice || l.availableDate !== original.availableDate || l.closingTime !== original.closingTime; })) return blocked("Price or delivery terms changed during the final check. Review the basket in the app.");
    const plan = newPlan("event", { personId: person.id, name: person.name }, person.outlets[0] ?? "banquet", {
      eventId: id, event: current.e, title: current.e.name, deliveryDate: current.e.serviceDate, neededBy: current.e.serviceDate,
      quoteId: quote.id, fingerprint: quote.fingerprint, totalExVat: quote.totalExVat, totalVat: quote.totalVat,
      lines: [...grouped.values()].map(({ line }) => { const q = quote.lines.find((l) => l.ref === line.id)!; return { ...line, lineTotal: q.lineTotal, unitPrice: q.unitPrice, stock: q.stock, rules: q.rules }; }),
      approvalsNeeded: quote.mandateCheck.approvalsNeeded, status: "waiting", usesFixtures: quote.lines.some((l) => l.source === "fixture"),
      basketCheckout: { snapshot, sourcePlanIds: current.sources.map((p) => p.id) },
    });
    plan.overrides.stockContinued = [...continued];
    plan.overrides.stockDecidedBy = current.plans.find((p) => p.overrides.stockDecidedBy)?.overrides.stockDecidedBy;
    if (existing) expireOpenQuestions(existing.id, "replaced");
    savePlan(plan);
    kvSet(checkoutKey, plan.id);
    const e = getEvent(id)!;
    e.orderPlanId = plan.id;
    saveEvent(e);
    // The event's orderPlanId changed as part of checkout; bind the committed version.
    plan.basketCheckout!.snapshot = basketSnapshot(id);
    if (plan.approvalsNeeded.length || softApprovals.length) {
      const question = makeQuestion({ planId: plan.id, eventId: id, type: "spend_cap", forRole: "approver", outletId: null, quoteId: quote.id, fingerprint: quote.fingerprint,
        title: `Approve ${current.e.name}?`, body: `The complete basket totals EUR ${quote.totalExVat.toFixed(2)} excluding VAT. ${[...new Set(softApprovals.map((r) => r.message))].join(" ")}`, facts: { kind: "approval", grants: plan.approvalsNeeded }, ruleIds: [...new Set([...quote.mandateCheck.rules, ...softApprovals].map((r) => r.ruleId))], deadline: quote.expiresAt,
        options: [{ id: "approve", label: "Approve exact basket", primary: true }, { id: "reject", label: "Reject", primary: false }] });
      saveQuestion(question);
      plan.questionIds = [question.id]; plan.summary = "Waiting for approval of the complete basket";
      savePlan(plan);
      return summary({ status: "approval_required", headline: "Manager approval needed", detail: "Your financial approver can review the exact quote below.", lines: [], warnings: [...new Set([...quote.mandateCheck.rules, ...softApprovals].filter((rule) => rule.outcome !== "order").map((rule) => rule.message))], actions: [], appLink: { label: "Review approval", path: `/baskets/${encodeURIComponent(id)}#question-${encodeURIComponent(question.id)}` } });
    }
    savePlan(plan);
    await placeFromPlan(plan, undefined);
    if (plan.status !== "ordered") return blocked(plan.summary, plan.error ?? undefined);
    audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} confirmed the complete basket through simulated WhatsApp`, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
    return respond({ status: "ordered", headline: "Mock order placed", order, lines: plan.lines.map(chatLine), totalExVat: plan.totalExVat, orderIds: plan.orderIds, actions: [] });
  });
}
