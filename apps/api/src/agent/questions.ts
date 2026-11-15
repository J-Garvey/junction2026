/**
 * Chunk 06: QUESTION-BUILD, QUESTION-ROUTE, ANSWER-RECORD. One card per
 * decision, naming the rule that raised it; answers are buttons (D26), with
 * a required note when a manager returns a final order review for changes.
 * Recipe fit goes to the outlet's chef first; money and policy to an
 * approver after (D6, AP-09). The first answer closes the card for everyone (TM-03).
 */
import type { Plan, PlanLine, Question, QuestionType, Quote } from "@aimo/contracts";
import { getDb, allJson, getJson, tx } from "../db.js";
import { nowIso, now } from "../clock.js";
import { audit, AGENT } from "../audit.js";
import { newId, eur, parseAimoTime, round2, shortName, helsinkiStartOfDay } from "../util.js";
import { allPeople, type Person } from "../identity.js";
import { specCompare } from "./sidebyside.js";
import { getProduct } from "../catalog.js";
import { allergenQuestionText, eventAllergenScope, missingAllergenProducts } from "./allergenData.js";
import type { AllergenAcknowledgement } from "@aimo/contracts";

export function saveQuestion(q: Question) {
  getDb()
    .prepare("INSERT INTO questions (id, plan_id, state, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, json = excluded.json")
    .run(q.id, q.planId, q.state, JSON.stringify(q));
}
export const getQuestion = (id: string) => getJson<Question>("questions", id);
export const allQuestions = () => allJson<Question>("SELECT json FROM questions ORDER BY rowid DESC");
export const openQuestionsForPlan = (planId: string) => allJson<Question>("SELECT json FROM questions WHERE plan_id = ? AND state IN ('open','waiting') ORDER BY rowid", planId);

export function expireOpenQuestions(planId: string, state: "replaced" | "expired") {
  for (const q of openQuestionsForPlan(planId)) {
    if (q.type === "allergy_conflict") continue;
    q.state = state;
    saveQuestion(q);
    audit({ actor: AGENT, action: state === "expired" ? "question_expired" : "question_replaced", summary: `${q.title} (${state})`, eventId: q.eventId, questionId: q.id, details: { planId }, visibility: "hotel" });
  }
}

export function makeQuestion(p: Omit<Question, "id" | "state" | "answer" | "answeredBy" | "answeredAt" | "createdAt"> & { state?: Question["state"] }): Question {
  return { id: newId("qst"), state: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: nowIso(), ...p };
}

const earliestCutoff = (lines: PlanLine[]) => {
  const t = lines.map((l) => parseAimoTime(l.closingTime)?.getTime()).filter((x): x is number => typeof x === "number" && x > now().getTime());
  return t.length ? new Date(Math.min(...t)).toISOString() : null;
};

/** RULE-POLICY: a rule asks a role only when the hotel left it set to ask that role. */
const asks = (l: PlanLine, id: string, outcome: "ask_chef" | "ask_approver" = "ask_chef") => l.rules.some((r) => r.ruleId === id && r.outcome === outcome);
const APPROVER_ORDER = ["QTY-01", "REL-02", "DLV-03", "PRC-02"];
const rank = (id: string) => (APPROVER_ORDER.includes(id) ? APPROVER_ORDER.indexOf(id) : APPROVER_ORDER.length);
/** Rules with their own chef card, or handled outside the line (STK-01 by stock kind, STK-02 as the split). */
const OWN_CARD = new Set(["ALG-03", "TYP-01", "SUB-01", "QTY-02", "QTY-03", "QTY-05", "STK-01", "STK-02"]);

const lineFacts = (l: PlanLine) => ({ lineId: l.id, productId: l.productId, product: l.productName, quantity: l.quantity, unit: l.salesUnit, needIds: l.needIds, lineTotal: l.lineTotal, shares: l.shares });

export function buildAllergenQuestions(plan: Plan & { event?: import("@aimo/contracts").EventSpec | null; overrides: { allergenAcknowledgements?: AllergenAcknowledgement[] } }, quote: Quote): Question[] {
  const missing = missingAllergenProducts(quote, plan.overrides.allergenAcknowledgements);
  return [...new Set(missing.map((l) => l.outletId))].map((outletId) => {
    const productIds = [...new Set(missing.filter((l) => l.outletId === outletId).map((l) => l.productId))];
    const q = makeQuestion({ planId: plan.id, eventId: plan.eventId, quoteId: quote.id, fingerprint: quote.fingerprint,
      deadline: quote.expiresAt, type: "missing_allergen_data", forRole: "chef", outletId,
      title: "Continue with allergen data not confirmed?", body: allergenQuestionText(plan, productIds, outletId),
      facts: { kind: "allergen_data", productIds, ...(plan.event ? { eventScope: eventAllergenScope(plan.event) } : {}), lines: plan.lines.filter((l) => l.outletId === outletId && productIds.includes(l.productId ?? "")).map(lineFacts) },
      ruleIds: ["ALG-03"], options: [{ id: "continue", label: "Continue with missing allergen data", primary: true }, { id: "others", label: "Pick another product", primary: false }],
    });
    saveQuestion(q);
    audit({ actor: AGENT, action: "question_asked", summary: q.body, eventId: plan.eventId, quoteId: quote.id, questionId: q.id, ruleIds: ["ALG-03"], details: { planId: plan.id }, visibility: "hotel" });
    return q;
  });
}

/** QUESTION-BUILD for a quote. Pre-answered questions are never created (PREANSWER-MATCH runs first). */
export function buildQuestions(plan: Plan & { overrides: any }, quote: Quote): Question[] {
  const out: Question[] = buildAllergenQuestions(plan, quote);
  const live = plan.lines.filter((l) => !l.removed && l.productId);
  // Answer in time for both the order cut-off and the date the goods are needed, whichever comes first.
  const needed = plan.neededBy ? helsinkiStartOfDay(plan.neededBy).toISOString() : null;
  const cut = earliestCutoff(live);
  const deadline = [cut, needed].filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  const base = { planId: plan.id, eventId: plan.eventId, quoteId: quote.id, fingerprint: quote.fingerprint, deadline };

  // Chef: product type unsure (one card for all such lines).
  const typ = live.filter((l) => asks(l, "TYP-01"));
  if (typ.length)
    out.push(makeQuestion({
      ...base, type: "ambiguous_type", forRole: "chef", outletId: typ[0].outletId,
      title: "Right product?",
      body: `${typ.map((l) => shortName(l.productName)).join(", ")}: is it ${String(typ[0].rules.find((r) => r.ruleId === "TYP-01")!.facts.type ?? "the type you need")}?`,
      facts: { kind: "type", lines: typ.map(lineFacts), judgements: plan.needs.flatMap((n) => n.judgements).filter((j) => typ.some((l) => l.productId === j.subject)) },
      ruleIds: ["TYP-01"],
      options: [{ id: "yes", label: "Yes, use it", primary: true }, { id: "no", label: "No, leave it out", primary: false }],
    }));

  // Chef: a different product for a recipe ingredient, with a side-by-side (D6).
  for (const l of live.filter((x) => asks(x, "SUB-01"))) {
    const r = l.rules.find((x) => x.ruleId === "SUB-01")!;
    const need = plan.needs.find((n) => l.needIds.includes(n.id))!;
    const original = need.substituteFor!;
    out.push(makeQuestion({
      ...base, type: "substitute", forRole: "chef", outletId: l.outletId,
      title: `Swap for ${need.dishName ?? "this dish"}?`,
      body: `${shortName(getProduct(original)?.name ?? original)} → ${shortName(l.productName)}`,
      facts: { kind: "substitute", line: lineFacts(l), needId: need.id, dishId: need.dishId, original, substitute: l.productId, sideBySide: specCompare(original, l.productId!), alternatives: need.candidates.slice(1, 3).map((c) => ({ productId: c.productId, name: c.name })) },
      ruleIds: ["SUB-01"],
      options: [{ id: "use", label: "Use this one", primary: true }, { id: "another", label: "Use another", primary: false }, { id: "none", label: "None of these", primary: false }],
    }));
  }

  // D31: one question to the person building the order for every line whose stock Valio Aimo can't confirm.
  const unconfirmed = live.filter((l) => l.stock?.kind === "unknown" && quote.unconfirmedStock?.includes(l.productId!) && !(plan.overrides.stockContinued ?? []).includes(l.productId!));
  if (unconfirmed.length) {
    const urgentNeeds = plan.urgent ? plan.needs.filter((n) => unconfirmed.some((l) => l.needIds.includes(n.id))) : [];
    const confirmedCover = urgentNeeds.length
      ? urgentNeeds.map((n) => n.candidates.filter((c) => c.stock.kind === "known" && c.packContent?.unit === n.amount.unit).reduce((sum, c) => sum + (c.stock.kind === "known" ? c.stock.amount * (c.packContent?.value ?? 0) : 0), 0))
      : [];
    const alt = urgentNeeds.length === 1 && confirmedCover[0] > 0 ? { covered: round2(Math.min(confirmedCover[0], urgentNeeds[0].amount.value)), need: urgentNeeds[0].amount.value, unit: urgentNeeds[0].amount.unit } : null;
    out.push(makeQuestion({
      ...base, type: "unknown_stock", forRole: "chef", outletId: unconfirmed[0].outletId,
      title: unconfirmed.length === 1 ? `Continue with ${shortName(unconfirmed[0].productName)}?` : `Continue with ${unconfirmed.length} lines?`,
      body: `Stock not confirmed: ${unconfirmed.map((l) => shortName(l.productName)).join(", ")}`,
      facts: { kind: "stock", lines: unconfirmed.map(lineFacts), alternative: alt },
      ruleIds: ["STK-01"],
      options: [
        { id: "continue", label: "Continue", primary: true },
        ...(alt ? [{ id: "confirmed", label: `Use confirmed stock (${alt.covered} of ${alt.need} ${alt.unit})`, primary: false }] : []),
        { id: "others", label: "Pick others", primary: false },
      ],
    }));
  }

  // Chef: quantity sanity or unverifiable pack size.
  const qty = live.filter((l) => ["QTY-02", "QTY-03", "QTY-05"].some((id) => asks(l, id)) && !l.needIds.every((id) => plan.overrides.confirmed.includes(`${id}:${l.productId}`)));
  if (qty.length)
    out.push(makeQuestion({
      ...base, type: "quantity_sanity", forRole: "chef", outletId: qty[0].outletId,
      title: "Check quantity",
      body: qty.map((l) => `${shortName(l.productName)}: ${l.rules.find((r) => ["QTY-02", "QTY-03", "QTY-05"].includes(r.ruleId) && r.outcome === "ask_chef")!.label}`).join(" · "),
      facts: { kind: "quantity", lines: qty.map(lineFacts) },
      ruleIds: [...new Set(qty.flatMap((l) => l.rules.filter((r) => r.ruleId.startsWith("QTY") && r.outcome === "ask_chef").map((r) => r.ruleId)))],
      options: [{ id: "keep", label: "Order as calculated", primary: true }, { id: "remove", label: "Remove the line", primary: false }],
    }));

  // Chef: any other rule the hotel set to "ask the chef" (RULE-POLICY). Same answers as the quantity card.
  const other = live.filter((l) => !qty.includes(l) && l.rules.some((r) => r.outcome === "ask_chef" && !OWN_CARD.has(r.ruleId)) && !l.needIds.every((id) => plan.overrides.confirmed.includes(`${id}:${l.productId}`)));
  if (other.length)
    out.push(makeQuestion({
      ...base, type: "quantity_sanity", forRole: "chef", outletId: other[0].outletId,
      title: other.length === 1 ? `Order ${shortName(other[0].productName)}?` : `Order these ${other.length} lines?`,
      body: other.map((l) => `${shortName(l.productName)}: ${l.rules.filter((r) => r.outcome === "ask_chef" && !OWN_CARD.has(r.ruleId)).map((r) => r.message).join(" ")}`).join(" · "),
      facts: { kind: "quantity", lines: other.map(lineFacts) },
      ruleIds: [...new Set(other.flatMap((l) => l.rules.filter((r) => r.outcome === "ask_chef" && !OWN_CARD.has(r.ruleId)).map((r) => r.ruleId)))],
      options: [{ id: "keep", label: "Order it", primary: true }, { id: "remove", label: "Remove the line", primary: false }],
    }));

  // Approver: one card for every money and policy item on this quote.
  const items: { ruleId: string; text: string; grant: string | null; lines: string[] }[] = [];
  for (const r of quote.mandateCheck.rules) items.push({ ruleId: r.ruleId, text: r.ruleId === "MAN-01" ? `Over cap: ${r.facts.total} of ${r.facts.cap}` : `${r.label}: ${r.facts.product ?? ""}`, grant: r.ruleId === "MAN-01" ? "spend_cap" : r.ruleId === "MAN-02" ? "blocked_product" : null, lines: [] });
  const unknown: PlanLine[] = [];
  const softDecided = plan.overrides.approvedSoft.includes(quote.fingerprint);
  if (!softDecided) {
    const partial = live.filter((l) => asks(l, "STK-02", "ask_approver"));
    const pre = getJson<any>("mandates", plan.siteId ? "hotel-aurora" : "", "hotel_id")?.preAnswers;
    if (partial.length && !plan.overrides.keepShort && plan.shortfall) {
      const shortPct = ((plan.shortfall.need - plan.shortfall.covered) / plan.shortfall.need) * 100;
      if (!(pre?.partialFillMaxShortPct != null && shortPct <= pre.partialFillMaxShortPct))
        items.push({ ruleId: "STK-02", text: `Split: ${round2(plan.shortfall.covered)} of ${plan.shortfall.need} ${plan.shortfall.unit} in stock${partial.some((l) => l.allocation === "unknown_fill") ? ", rest at unknown stock" : ""}`, grant: "partial_fill", lines: partial.map((l) => l.id) });
    }
    // Every other line rule the hotel set to "ask an approver" (RULE-POLICY); by default QTY-01, REL-02, DLV-03 and PRC-02.
    const approverIds = [...new Set(live.flatMap((l) => l.rules.filter((r) => r.outcome === "ask_approver" && r.ruleId !== "STK-02").map((r) => r.ruleId)))]
      .sort((a, b) => rank(a) - rank(b));
    for (const id of approverIds) {
      const ls = live.filter((l) => asks(l, id, "ask_approver"));
      if (ls.length) items.push({ ruleId: id, text: `${ls[0].rules.find((r) => r.ruleId === id)!.label}: ${ls.map((l) => shortName(l.productName)).join(", ")}`, grant: null, lines: ls.map((l) => l.id) });
    }
  }
  if (items.length) {
    const split = items.some((i) => i.ruleId === "STK-02");
    const chefFirst = out.length > 0;
    out.push(makeQuestion({
      ...base, type: split ? "partial_fill" : items[0].ruleId === "MAN-01" ? "spend_cap" : items[0].ruleId === "STK-01" ? "unknown_stock" : items[0].ruleId === "QTY-01" ? "overshoot" : items[0].ruleId === "REL-02" ? "reliability" : "spend_cap",
      forRole: "approver", outletId: null, state: chefFirst ? "waiting" : "open",
      title: split ? "Approve split order?" : "Approve order?",
      body: `${eur(quote.totalExVat)} · ${live.length} line${live.length === 1 ? "" : "s"}${plan.shortfall && split ? ` · ${round2(plan.shortfall.covered)} of ${plan.shortfall.need} ${plan.shortfall.unit} in stock` : ""}`,
      facts: { kind: "approval", total: quote.totalExVat, totalVat: quote.totalVat, items, grants: quote.mandateCheck.approvalsNeeded, lines: live.map(lineFacts), deliveryDate: quote.deliveryDate },
      ruleIds: items.map((i) => i.ruleId),
      options: split
        ? [{ id: "approve", label: "Approve the split", primary: true }, { id: "keep_short", label: "Keep it short", primary: false }, { id: "reject", label: "Reject", primary: false }]
        : [{ id: "approve", label: unknown.length && items.every((i) => i.ruleId === "STK-01") ? "Accept the risk" : "Approve", primary: true }, { id: "reject", label: "Reject", primary: false }],
    }));
  }
  for (const q of out) {
    saveQuestion(q);
    audit({ actor: AGENT, action: "question_asked", summary: `${q.forRole === "chef" ? "Chef" : "Approver"} asked: ${q.title}`, eventId: q.eventId, quoteId: q.quoteId, questionId: q.id, ruleIds: q.ruleIds, details: { planId: plan.id, state: q.state, type: q.type }, visibility: "hotel" });
  }
  return out;
}

/** QUESTION-ROUTE: by role and outlet; a recipe question with no chef for its outlet goes to every chef. */
export function canAnswer(q: Question, p: Person): boolean {
  if (p.role !== q.forRole) return false;
  if (q.forRole === "approver") return p.hotelScope || (q.outletId !== null && p.outlets.includes(q.outletId));
  if (!q.outletId) return true;
  const chefs = allPeople().filter((x) => x.role === "chef" && x.outlets.includes(q.outletId!));
  return chefs.length ? p.outlets.includes(q.outletId) : true;
}

export function questionsFor(p: Person): Question[] {
  return allQuestions()
    .filter((q) => (q.state === "open" || q.state === "waiting") && canAnswer(q, p))
    .sort((a, b) => (a.state === b.state ? (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") : a.state === "open" ? -1 : 1));
}

/** ANSWER-RECORD: one transaction; the first answer wins. */
export function recordAnswer(qId: string, p: Person, optionId: string, note?: string): { ok: true; question: Question } | { ok: false; question: Question | null; reason: string } {
  return tx(() => {
    const q = getQuestion(qId);
    if (!q) return { ok: false as const, question: null, reason: "No such question" };
    if (q.state === "answered") return { ok: false as const, question: q, reason: `Answered by ${q.answeredBy?.name}, ${q.answeredAt}` };
    if (q.state !== "open") return { ok: false as const, question: q, reason: q.state === "waiting" ? "Waiting for the chef to answer first" : `This question was ${q.state}` };
    if (q.type === "missing_allergen_data" && (!q.deadline || new Date(q.deadline) <= now())) {
      q.state = "expired";
      saveQuestion(q);
      return { ok: false as const, question: q, reason: "These terms expired. Review the missing allergen data again." };
    }
    if (!canAnswer(q, p)) return { ok: false as const, question: q, reason: `This question is for the ${q.forRole}${q.outletId ? ` of ${q.outletId}` : ""}` };
    if (q.type === "order_review") {
      if (q.facts.hotelId && q.facts.hotelId !== p.hotelId)
        return { ok: false as const, question: q, reason: "This order belongs to another hotel" };
      if (q.deadline && new Date(q.deadline).getTime() <= now().getTime()) {
        q.state = "expired";
        saveQuestion(q);
        return { ok: false as const, question: q, reason: "This review expired. Ask the order builder to submit it again." };
      }
      if (optionId === "reject" && (!note?.trim() || note.trim().length > 2000))
        return { ok: false as const, question: q, reason: "Add a refusal note for the order builder (1–2000 characters)." };
    }
    if (!q.options.some((o) => o.id === optionId)) return { ok: false as const, question: q, reason: "Unknown option" };
    q.state = "answered";
    q.answer = optionId;
    if (q.type === "order_review" && optionId === "reject") q.answerNote = note!.trim();
    q.answeredBy = { personId: p.id, name: p.name };
    q.answeredAt = nowIso();
    saveQuestion(q);
    return { ok: true as const, question: q };
  });
}

export function openWaitingApprover(planId: string) {
  const qs = openQuestionsForPlan(planId);
  if (qs.some((q) => q.forRole === "chef" && q.state === "open")) return;
  for (const q of qs) if (q.state === "waiting") {
    q.state = "open";
    saveQuestion(q);
  }
}

export { round2, eur, getProduct };
