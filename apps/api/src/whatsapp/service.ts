/** Synthetic channel coordinator. Uses the existing parser, plans and HTTP gateway. */
import type { Constraints, PlanLine, Quote, WhatsAppConversation, WhatsAppLine, WhatsAppOrderRef, WhatsAppReplyFacts } from "@aimo/contracts";
import type { Person } from "../identity.js";
import { kvGet, kvSet, tx } from "../db.js";
import { nowIso } from "../clock.js";
import { audit } from "../audit.js";
import { getEvent, listEvents, personActor, removeNeed, runViability, saveEvent } from "../agent/events.js";
import { getPlan, listPlans, mandate, newPlan, quoteAndDecide, savePlan, placeFromPlan, type StoredPlan } from "../agent/plan.js";
import { expireOpenQuestions, makeQuestion, saveQuestion } from "../agent/questions.js";
import { gw, GatewayError } from "../agent/gatewayClient.js";
import { sha256, stableStringify, round2 } from "../util.js";
import { interpretWhatsApp } from "./interpreter.js";
import { formatWhatsAppReply } from "./formatter.js";
import { basketSnapshot } from "./snapshot.js";

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
const pendingFingerprint = (id: string, p?: StoredPlan) => sha256(stableStringify([basketSnapshot(id), p ? { request: p.request, fingerprint: p.fingerprint, lines: p.lines } : null]));

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
  const displayed = [...plans.flatMap((p) => p.lines.filter((l) => !l.removed).map((l) => ({ ...chatLine(l), id: `${p === base ? "event" : p.id}:${l.id}` }))), ...orders.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => ({ id: `${o.id}:${l.lineNo}`, productId: l.productId, name: l.productName, quantity: l.quantity, unit: l.salesUnit, lineTotal: l.lineTotal, stock: l.stock.kind === "known" ? "confirmed" as const : "unknown" as const })))];
  const totalExVat = displayed.some((l) => l.lineTotal === null) ? null : round2(displayed.reduce((sum, l) => sum + l.lineTotal!, 0));
  return { e, sources, plans, lines, displayed, orders, totalExVat };
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
  const respond = (facts: WhatsAppReplyFacts) => ({ conversation, reply: formatWhatsAppReply(facts, input.channel) });
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
  if (interpretation.intent === "clarify" || !interpretation.orderId) {
    // A later "confirm change/order" must never accept an older proposal after
    // the person's latest request needed clarification instead of a new preview.
    const hadPending = Boolean(conversation.pending);
    conversation.pending = null;
    return respond({ status: "clarification", headline: interpretation.question ?? "Which order would you like to work on?", detail: [interpretation.choices.map((o) => `${o.name} (${o.id}), ${o.deliveryDate}`).join("; "), hadPending ? "The previous confirmation was cancelled. Send the request again to review it." : ""].filter(Boolean).join(" "), actions: interpretation.choices.slice(0, 3).map((o) => ({ label: o.name, text: o.id })) });
  }
  const id = interpretation.orderId;
  conversation.activeOrderId = id;
  return locked(id, async () => {
    const order = ref(id);
    const current = await contents(id);
    const summary = (extra: Partial<WhatsAppReplyFacts> = {}) => respond({ status: "summary", headline: "Your current order basket", order, lines: current.displayed, totalExVat: current.totalExVat, actions: [{ label: "Review final order", text: "confirm order" }], ...extra });
    const blocked = (headline: string, detail?: string) => respond({ status: "blocked", headline, detail, order });
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
      return summary({ detail: current.orders.length ? "Includes placed mock orders. Open the app to amend placed lines." : "You can add or remove items, then confirm the final basket." });
    }
    if (current.orders.length) {
      conversation.pending = null;
      return summary({ status: "ordered", headline: "This basket already has a placed mock order", orderIds: current.orders.map((o) => o.id), detail: "Open the basket in the app to amend placed orders.", actions: [] });
    }
    if (interpretation.intent === "add_items") {
      conversation.pending = null;
      if (!interpretation.request?.lines.length || interpretation.request.lines.some((l) => !l.quantity || l.quantity.amount <= 0)) return respond({ status: "clarification", headline: "How much of each product should I add?", order });
      const request = { ...interpretation.request, siteId: current.e.siteId, outletId: person.outlets[0] ?? "banquet", neededBy: interpretation.request.neededBy ?? current.e.serviceDate };
      if (request.neededBy !== current.e.serviceDate) return blocked("The requested delivery date differs from this basket.", "Choose a basket with the right delivery date in the app.");
      const plan = newPlan("single", { personId: person.id, name: person.name }, request.outletId, { eventId: id, request, reviewing: true, title: request.lines.map((l) => l.text).join(", ") });
      await quoteAndDecide(plan, input.token);
      if (hard(plan) || !plan.proposal) return respond({ status: "blocked", headline: plan.summary || "This request needs more details in the app.", order, lines: plan.lines.map(chatLine), warnings: warnings(plan) });
      conversation.pending = { kind: "add_items", orderId: id, planId: plan.id, fingerprint: pendingFingerprint(id, plan) };
      return respond({ status: "proposal", headline: "Add these items to your basket?", order, lines: plan.lines.map(chatLine), totalExVat: plan.totalExVat, warnings: warnings(plan), actions: [{ label: "Confirm change", text: "confirm change" }, { label: "Cancel", text: "cancel" }] });
    }
    if (interpretation.intent === "remove_items") {
      conversation.pending = null;
      const selected = current.displayed.filter((l) => interpretation.lineIds.includes(l.id));
      if (!selected.length || selected.length !== interpretation.lineIds.length) return blocked("I could not identify those items. Name one exact product to remove.");
      conversation.pending = { kind: "remove_items", orderId: id, lineIds: selected.map((l) => l.id), fingerprint: pendingFingerprint(id) };
      return respond({ status: "proposal", headline: "Remove these entire lines from your basket?", order, lines: selected, actions: [{ label: "Confirm removal", text: "confirm change" }, { label: "Cancel", text: "cancel" }] });
    }
    const pending = conversation.pending;
    if (interpretation.intent === "accept_change") {
      if (!pending || pending.orderId !== id || pending.kind === "confirm_order") return blocked("There is no basket change waiting for confirmation.");
      const plan = pending.planId ? getPlan(pending.planId) : null;
      if (pending.fingerprint !== pendingFingerprint(id, plan ?? undefined)) { conversation.pending = null; return blocked("The basket changed since you reviewed it.", "Send the change again to review the latest basket."); }
      if (pending.kind === "add_items" && plan) {
        const previous = pending.fingerprint;
        await quoteAndDecide(plan, input.token);
        if (hard(plan) || !plan.proposal) { conversation.pending = null; return blocked(plan.summary, warnings(plan).join(" ")); }
        if (previous !== pendingFingerprint(id, plan)) { conversation.pending = null; return blocked("The product, price or delivery terms changed. Send the request again to review them."); }
        // Unknown stock requires its own explicit chef decision in the existing app.
        if (plan.lines.some((l) => l.stock?.kind !== "known")) {
          conversation.pending = null;
          plan.reviewing = false;
          savePlan(plan);
          return blocked("Stock is not confirmed.", "The proposal is available in this basket in the app. Review the stock decision there before adding these items. A chat confirmation cannot confirm stock.");
        }
        tx(() => {
          plan.reviewing = false; plan.basketedAt = nowIso(); plan.proposal = false;
          plan.status = "waiting"; plan.summary = "In the order · awaiting final order";
          savePlan(plan);
          audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} added ${plan.title} through simulated WhatsApp`, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
        });
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
      }
      conversation.pending = null;
      const updated = await contents(id);
      return respond({ status: "updated", headline: "Your basket has been updated", order: ref(id), lines: updated.displayed, totalExVat: updated.totalExVat, actions: [{ label: "Review final order", text: "confirm order" }] });
    }
    if (interpretation.intent !== "confirm_order") return blocked("Please describe a basket change or ask for an order summary.");
    const checkoutKey = `whatsapp-checkout:${id}`;
    const existingId = kvGet<string>(checkoutKey);
    const existing = existingId ? getPlan(existingId) : null;
    if (existing && existing.status === "waiting" && existing.basketCheckout?.snapshot === basketSnapshot(id)) {
      conversation.pending = null;
      return summary({ status: "approval_required", headline: "This exact basket is already awaiting approval", detail: "Open Waiting in the app to answer the existing approval card.", actions: [] });
    }
    if (!current.lines.length) return blocked("This basket is empty. Add items before confirming it.");
    const snapshot = basketSnapshot(id);
    if (!pending || pending.kind !== "confirm_order" || pending.orderId !== id || pending.fingerprint !== snapshot) {
      conversation.pending = { kind: "confirm_order", orderId: id, fingerprint: snapshot };
      return summary({ status: "proposal", headline: "Review the entire basket before submission", detail: "Confirm this exact basket to run the gateway checks. Any required financial approval stays in the app.", actions: [{ label: "Confirm final order", text: "confirm order" }, { label: "Cancel", text: "cancel" }] });
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
      return summary({ status: "approval_required", headline: plan.summary, detail: "The financial approver can review the exact quote in Waiting in the app.", actions: [] });
    }
    savePlan(plan);
    await placeFromPlan(plan, undefined);
    if (plan.status !== "ordered") return blocked(plan.summary, plan.error ?? undefined);
    audit({ actor: personActor(person), action: "request_received", eventId: id, summary: `${person.name} confirmed the complete basket through simulated WhatsApp`, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
    return respond({ status: "ordered", headline: "Your mock order is placed", order, lines: plan.lines.map(chatLine), totalExVat: plan.totalExVat, orderIds: plan.orderIds, actions: [] });
  });
}
