/**
 * Applies a recorded answer. Recipe answers re-run the pipeline with the
 * chef's choice recorded; approver answers sign an approval at the gateway
 * (with the approver's own credential) and place the order.
 */
import type { Question } from "@aimo/contracts";
import { audit } from "../audit.js";
import { getQuestion, saveQuestion, recordAnswer, openWaitingApprover, openQuestionsForPlan } from "./questions.js";
import { getPlan, savePlan, quoteAndDecide, placeFromPlan, type StoredPlan } from "./plan.js";
import { gw, GatewayError } from "./gatewayClient.js";
import { rememberSubstitute } from "./memory.js";
import { getEvent, answerAllergy, answerChange, answerFinalSubstitute, answerMissingAllergenReplacement, personActor } from "./events.js";
import { nowIso } from "../clock.js";
import type { Person } from "../identity.js";
import { answerBasketAllergens, answerBasketReview } from "./baskets.js";
import { applyAllergenAcknowledgements, eventAllergenScope } from "./allergenData.js";

export async function answer(qId: string, p: Person, optionId: string, token: string, note?: string) {
  const pending = getQuestion(qId);
  if (pending?.state === "open" && pending.type === "missing_allergen_data") {
    const plan = getPlan(pending.planId);
    const event = pending.eventId ? getEvent(pending.eventId) : null;
    if ((pending.facts.eventScope && (!event || eventAllergenScope(event) !== pending.facts.eventScope)) ||
      (pending.facts.kind === "allergen_data" && plan?.fingerprint !== pending.fingerprint)) {
      pending.state = "replaced";
      saveQuestion(pending);
      return { ok: false as const, question: pending, reason: "The affected guests, products or terms changed. Review the missing allergen data again." };
    }
  }
  const r = recordAnswer(qId, p, optionId, note);
  if (!r.ok) return r;
  const q = r.question;
  const label = q.options.find((o) => o.id === optionId)?.label ?? optionId;
  audit({
    actor: personActor(p),
    action: "question_answered",
    summary: `${p.name} answered "${q.title}": ${label}${q.answerNote ? `. Note to order builder: ${q.answerNote}` : ""}`,
    eventId: q.eventId,
    quoteId: q.quoteId,
    questionId: q.id,
    ruleIds: q.ruleIds,
    details: { option: optionId, type: q.type, kind: "decision", ...(q.answerNote ? { note: q.answerNote } : {}) },
    visibility: "hotel",
  });
  try {
    await applyAnswer(q, p, token);
  } catch (e) {
    const msg = e instanceof GatewayError ? `${e.body.error}: ${e.body.message}` : (e as Error).message;
    audit({ actor: personActor(p), action: "gateway_error", summary: `Applying the answer failed: ${msg}`, eventId: q.eventId, questionId: q.id, details: {}, visibility: "hotel" });
    return { ok: true as const, question: q, error: msg };
  }
  return { ok: true as const, question: q };
}

async function applyAnswer(q: Question, p: Person, token: string) {
  if (q.type === "order_review") return answerBasketReview(q, p, token);
  const f = q.facts as any;
  if (f.kind === "basket_allergens") return answerBasketAllergens(q, p, token);
  if (f.kind === "change" || f.kind === "change_stock" || f.kind === "change_allergens") return answerChange(q, p, token);
  if (f.kind === "allergy") return answerAllergy(q, p);
  if (f.kind === "missing_allergen_replacement") return answerMissingAllergenReplacement(q, p);
  if (f.kind === "final_substitute") return answerFinalSubstitute(q, p);
  const plan = getPlan(q.planId);
  if (!plan) return;
  plan.questionsAnswered += 1;
  const ov = plan.overrides;
  let replan = false;
  if (f.kind === "allergen_data") {
    if (q.answer === "continue") {
      const acknowledgement = await gw.acknowledgeAllergens(token, q.quoteId!, q.fingerprint!, f.productIds, q.outletId ?? undefined);
      ov.allergenAcknowledgements = [...(ov.allergenAcknowledgements ?? []), acknowledgement];
      applyAllergenAcknowledgements(plan, await gw.getQuote(q.quoteId!));
    } else {
      for (const l of f.lines) for (const n of l.needIds) ov.excluded.push(`${n}:${l.productId}`);
      replan = true;
    }
  } else if (f.kind === "type") {
    for (const l of f.lines) for (const n of l.needIds) (q.answer === "yes" ? ov.confirmed : ov.excluded).push(`${n}:${l.productId}`);
    replan = q.answer === "no";
  } else if (f.kind === "substitute") {
    if (q.answer === "use") {
      ov.confirmed.push(`${f.needId}:${f.substitute}`);
      rememberSubstitute(f.dishId ?? "request", f.original, f.substitute, p.name, nowIso());
    } else if (q.answer === "another") {
      ov.excluded.push(`${f.needId}:${f.substitute}`);
      replan = true;
    } else {
      ov.removedNeeds.push(f.needId);
      replan = true;
    }
  } else if (f.kind === "quantity") {
    for (const l of f.lines) for (const n of l.needIds) (q.answer === "keep" ? ov.confirmed : ov.removedNeeds).push(q.answer === "keep" ? `${n}:${l.productId}` : n);
    replan = q.answer === "remove";
  } else if (f.kind === "stock") {
    // D31: the person building the order decides; it never goes to the Approver.
    if (q.answer === "continue") {
      ov.stockContinued = [...new Set([...(ov.stockContinued ?? []), ...f.lines.map((l: any) => l.productId)])];
      ov.stockDecidedBy = p.name;
      for (const l of f.lines) for (const n of l.needIds) ov.confirmed.push(`${n}:${l.productId}`);
    } else if (q.answer === "confirmed") {
      ov.useConfirmed = true;
      replan = true;
    } else {
      for (const l of f.lines) for (const n of l.needIds) ov.excluded.push(`${n}:${l.productId}`);
      replan = true;
    }
  } else if (f.kind === "approval") {
    return applyApproval(plan, q, p, token);
  }
  savePlan(plan);
  const chefOpen = openQuestionsForPlan(plan.id).some((x) => x.forRole === "chef" && x.state === "open");
  if (replan) {
    await quoteAndDecide(plan, token);
    return;
  }
  if (!chefOpen) {
    // All recipe questions answered: re-quote so the approver sees the exact version to sign.
    await quoteAndDecide(getPlan(plan.id)!, token);
  }
  openWaitingApprover(plan.id);
}

async function applyApproval(plan: StoredPlan, q: Question, p: Person, token: string) {
  const f = q.facts as any;
  if (q.answer === "reject") {
    plan.status = "rejected";
    plan.summary = `Rejected by ${p.name}. Nothing was ordered.`;
    savePlan(plan);
    return;
  }
  if (q.answer === "keep_short") {
    plan.overrides.keepShort = true;
    plan.overrides.approvedSoft.push(q.fingerprint!);
    savePlan(plan);
    // Keep short: re-quote with only the confirmed stock; the split decision is made.
    const next = await quoteAndDecide(plan, token);
    if (next.status === "waiting") {
      // The keep-short version has no unknown-stock lines, so any remaining card is for a different reason.
    }
    return;
  }
  plan.overrides.approvedSoft.push(q.fingerprint!);
  let approvalId: string | undefined;
  if ((f.grants ?? []).length) {
    const a = await gw.approve(token, q.quoteId!, q.fingerprint!, f.grants);
    approvalId = a.id;
  }
  savePlan(plan);
  await placeFromPlan(plan, approvalId);
}
