/**
 * Measure submitted hotel stages at the HTTP boundary, before dispatch and until
 * the result has been computed/saved (before response serialization). Resuming a
 * decision adds only that call's runtime. No timer survives a request or uses the
 * fixture clock. GETs, preparation and failed/duplicate decisions record nothing.
 */
import type { RequestHandler } from "express";
import type { AuditEntry, Plan, Question, SingleRequest, StageProcessing } from "@aimo/contracts";
import { getJson } from "../db.js";
import { getPlan, savePlan } from "../agent/plan.js";
import { allQuestions, getQuestion } from "../agent/questions.js";
import { getEvent, saveEvent, warnings } from "../agent/events.js";
import type { Person } from "../identity.js";

type Milestone = StageProcessing["milestone"];
/** A dedicated monotonic clock keeps controlled measurements separate from HTTP timers in tests. */
export const processingClock = { now: () => performance.now() };
const pending = (questions: Question[]) => questions.filter((q) => q.state === "open" || q.state === "waiting");

export function planMilestone(plan: Plan, questions: Question[]): Milestone {
  if (plan.status === "failed" || plan.error) return "failed";
  if (plan.status === "blocked" || plan.tooLate) return "blocked";
  if (plan.status === "rejected") return "rejected";
  if (plan.status === "ordered" || plan.status === "kept_short") return "ordered";
  if (plan.status === "needs_input") return "chef_input";
  if (plan.status === "viability") return "viability_checked";
  const open = pending(questions);
  if (open.some((q) => q.forRole === "chef")
    || plan.itemReviews?.some((item) => !item.canApprove || (item.requiresApproval !== false && !item.approvedAt))) return "chef_input";
  if (open.some((q) => q.forRole === "approver" && q.state === "open")) return "approval_ready";
  // Proposals can still contain chef questions that are only created on accept.
  if (plan.proposal && [...plan.inputRules, ...plan.lines.filter((l) => !l.removed).flatMap((l) => l.rules)].some((r) => r.outcome === "ask_chef")) return "chef_input";
  return "review_ready";
}

/** Only use parsing measurements produced by this person's actual submitted message. */
export function savedParsingMs(request: SingleRequest, personId: string, edited = false): number | undefined {
  if (!request.parseAuditId) return undefined;
  const entry = getJson<AuditEntry>("audit", request.parseAuditId);
  const parsed = entry?.details.request as SingleRequest | undefined;
  const ms = entry?.details.processingMs;
  if (entry?.action !== "request_parsed" || entry.actor.id !== personId
    || !parsed || !request.lines.length
    || (edited ? !parsed.lines.every((line) => request.lines.some((p) => p.query === line.query && JSON.stringify(p.quantity) === JSON.stringify(line.quantity)))
      : parsed.originalText !== request.originalText || !request.lines.every((line) => parsed.lines.some((p) => p.id === line.id)))
    || typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return undefined;
  return ms;
}

function savedEventParsingMs(auditId: unknown, personId: string): number | undefined {
  if (typeof auditId !== "string") return undefined;
  const entry = getJson<AuditEntry>("audit", auditId);
  const ms = entry?.details.processingMs;
  return entry?.action === "request_parsed" && entry.actor.id === personId && entry.details.route === "event_change"
    && typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : undefined;
}

export function finishProcessing(stage: string, started: number, milestone: Milestone, previous?: StageProcessing, parsingMs?: number): StageProcessing {
  return {
    stage, milestone,
    totalMs: (previous?.totalMs ?? parsingMs ?? 0) + Math.round(processingClock.now() - started),
    ...((previous?.parsingMs ?? parsingMs) !== undefined ? { parsingMs: previous?.parsingMs ?? parsingMs } : {}),
    segments: (previous?.segments ?? 0) + 1,
  };
}

export const measureProcessing: RequestHandler = (req, res, next) => {
  if (req.method !== "POST") return next();
  const eventMatch = req.path.match(/^\/events\/([^/]+)\/(viability|order|change|guests|diet-groups|final-check|menu\/order)$/);
  const planMatch = req.path.match(/^\/plans\/([^/]+)\/(review-items|requote|accept|choose|basket|items\/[^/]+\/(approve|quantity))$/);
  const answerMatch = req.path.match(/^\/questions\/([^/]+)\/answer$/);
  if (!eventMatch && !planMatch && !answerMatch && req.path !== "/requests") return next();
  const started = processingClock.now();
  const question = answerMatch ? getQuestion(answerMatch[1]) : null;
  const beforePlan = planMatch || question ? getPlan(planMatch?.[1] ?? question!.planId) : null;
  // A single request inside a basket owns its own timing, separate from event stages.
  const eventId = eventMatch?.[1] ?? (question && beforePlan?.kind !== "single" ? question.eventId : null);
  const beforeEvent = eventId ? getEvent(eventId) : null;
  const stage = eventMatch ? ({ viability: "Viability check", order: "Event order", "final-check": "Final check", "menu/order": "Menu request" }[eventMatch[2]] ?? "Event change")
    : planMatch?.[2] === "requote" ? "Request change" : beforeEvent?.processing?.stage ?? beforePlan?.processing?.stage ?? "Request";
  const previous = answerMatch || (planMatch && planMatch[2] !== "requote") ? beforeEvent?.processing ?? beforePlan?.processing : undefined;
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 || body?.ok === false || body?.error) return json(body);
    const plan = body?.plan as ReturnType<typeof getPlan> | undefined;
    const event = eventId ? getEvent(eventId) : null;
    const questions = pending(allQuestions().filter((q) => event ? q.eventId === event.id : q.planId === (plan?.id ?? beforePlan?.id)));
    let milestone: Milestone = plan ? planMilestone(plan, questions) : "review_ready";
    if (event && eventMatch?.[2] !== "menu/order") {
      // A chef's stock-consent answer can resume a substitution and run the
      // final check internally; its saved result belongs to this same stage.
      const finalCheck = body?.finalCheck ?? (question?.facts.recheckFinal === true ? event.finalCheck : undefined);
      if (warnings(event.id).some((w) => w.state === "open")) milestone = "blocked";
      else if (plan && ["blocked", "failed", "rejected", "chef_input"].includes(milestone)) { /* Keep the plan's stopping condition. */ }
      else if (finalCheck && !finalCheck.lines.length) milestone = "failed";
      else if (questions.some((q) => q.forRole === "chef")) milestone = "chef_input";
      else if (questions.some((q) => q.forRole === "approver" && q.state === "open")) milestone = "approval_ready";
      else if (finalCheck?.lines.some((line: { result: string }) => !["covered", "covered_at_risk"].includes(line.result))) milestone = "chef_input";
      else if (!plan || (question && ["allergy", "change", "change_stock", "final_substitute"].includes(String(question.facts.kind)))) {
        milestone = body?.applied === false || body?.question?.answer === "keep" ? "change_checked"
          : body?.question?.answer === "none" ? "chef_input"
          : finalCheck || question?.facts.kind === "final_substitute" ? "final_checked" : "change_applied";
      }
    }
    const personId = (req as typeof req & { person: Person }).person.id;
    const parsingMs = previous ? undefined
      : plan?.request && (req.path === "/requests" || (planMatch?.[2] === "requote" && plan.request.parseAuditId !== beforePlan?.request?.parseAuditId)) ? savedParsingMs(plan.request, personId, planMatch?.[2] === "requote")
      : eventMatch ? savedEventParsingMs(req.body?.parseAuditId, personId) : undefined;
    const processing = finishProcessing(stage, started, milestone, previous, parsingMs);
    if (plan) {
      plan.processing = processing;
      savePlan(plan);
    } else if (beforePlan?.kind === "single") {
      const updated = getPlan(beforePlan.id)!;
      processing.milestone = planMilestone(updated, questions);
      updated.processing = processing;
      savePlan(updated);
    }
    if (event && eventMatch?.[2] !== "menu/order") {
      event.processing = processing;
      saveEvent(event);
      // changeEvent returns an event snapshot; include the timing in that response too.
      if (body.event) body.event.processing = processing;
    }
    return json(body);
  };
  next();
};
