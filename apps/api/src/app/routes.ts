/**
 * The hotel app's API (/api): the screens' backend. It runs the hotel agent,
 * which itself calls the gateway over HTTP. SESSION-SWITCH ("viewing as") is
 * here: the browser holds a server-issued session for one seeded person.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AnswerBody, ClockSetBody, SingleRequest, DietGroup } from "@aimo/contracts";
import { allPeople, getPerson, issueToken, resolveToken, tokenFrom, type Person } from "../identity.js";
import { clockState, setClock, SCENES, now } from "../clock.js";
import { audit, auditView, verifyChain, decisionCount, SYSTEM } from "../audit.js";
import { kvGet, kvSet } from "../db.js";
import { FIXED, rulesView } from "../rules/catalogue.js";
import { PARAMS, policyParams, storedPolicy } from "../rules/policy.js";
import { defaultRuleParams, editRules, resetRules, RuleEditError } from "../rules/editor.js";
import { getProduct, getProductDetails, catalogSize, searchProducts } from "../catalog.js";
import { interpretMessage } from "../agent/message.js";
import { logSearch } from "../searchlog.js";
import { matchesCurrentShortlists, shortlist } from "../agent/match.js";
import { allItemsResolved, quantityScope, refreshItemReviews } from "../agent/itemReview.js";
import { toBase } from "../agent/parse.js";
import { newPlan, quoteAndDecide, getPlan, listPlans, mandate, savePlan, emptyOverrides, HOTEL_ID, needsFromSingle } from "../agent/plan.js";
import { questionsFor, allQuestions, getQuestion, canAnswer } from "../agent/questions.js";
import { answer } from "../agent/answers.js";
import { addDietGroup, changeEvent, changeGuests, coverageSummary, EditConflict, eventView, finalCheck, getEvent, listEvents, orderEvent, removeNeed, runCutoff, runViability, saveEvent, warnings, personActor, type StoredEvent } from "../agent/events.js";
import { isCalendarDate, newId } from "../util.js";
import { MenuBody, menuRequest, saveMenu, scaleMenu } from "../agent/menu.js";
import { listRemembered } from "../agent/memory.js";
import { seedReset, OUTLETS, OUTSIDE_AGENT_TOKEN, VALIO_VIEWER_TOKEN } from "../seed.js";
import { seedHotelWorkspace } from "../seed-workspace.js";
import { gw, GatewayError } from "../agent/gatewayClient.js";
import { dataMode, lookup, UpstreamError } from "../aimo/lookup.js";
import { inspectDelivery } from "./productInspection.js";
import { config } from "../config.js";
import { modelConfigured, modelName } from "../agent/openai.js";
import { basketReview, submitBasketForReview, invalidateBasketReview, BasketReviewError, basketChangeToken, correctBasketRequest, changeBasket, assertBasketIdle } from "../agent/baskets.js";
import { approvalLevels, basketStatus, pendingQuestions } from "../agent/basketSummary.js";
import { measureProcessing, processingClock } from "./processing.js";

type Authed = Request & { person: Person; token: string };

function person(req: Request, res: Response, next: NextFunction) {
  const id = resolveToken(tokenFrom(req));
  if (!id || id.kind !== "person") return res.status(401).json({ error: "Pick who you are viewing as" });
  (req as Authed).person = id.person;
  (req as Authed).token = id.token;
  next();
}

const P = (req: Request) => (req as Authed).person;
const T = (req: Request) => (req as Authed).token;
const inPlanScope = (req: Request, plan: { outletId: string }) => P(req).hotelId === HOTEL_ID && (P(req).hotelScope || P(req).outlets.includes(plan.outletId));

// An in-flight item recheck must not save an older copy over a removal or commit.
const changingPlan = (handler: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  const plan = getPlan(String(req.params.id));
  if (plan?.removedFromBasketAt) return res.status(409).json({ error: "This request was removed from the order" });
  return plan?.eventId ? changeBasket(plan.eventId, async () => handler(req, res)) : handler(req, res);
};

function sessionCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `aimo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
}

export function appRouter(): Router {
  const r = Router();

  r.get("/status", (_req, res) =>
    res.json({
      clock: { ...clockState(), now: now().toISOString(), scenes: SCENES },
      dataMode: dataMode(),
      seedProfile: kvGet("seedProfile"),
      model: { provider: "openai", model: modelName(), configured: modelConfigured() },
      catalogue: catalogSize(),
      testMode: config.testMode,
      chain: verifyChain(),
    }),
  );
  r.get("/people", (_req, res) => res.json({ people: allPeople(), outlets: OUTLETS }));
  r.post("/session", (req, res) => {
    const { personId } = z.object({ personId: z.string() }).parse(req.body);
    const p = getPerson(personId);
    if (!p) return res.status(404).json({ error: "No such person" });
    const token = issueToken({ kind: "person", personId: p.id, testSession: true });
    sessionCookie(res, token);
    res.json({ person: p, token });
  });

  r.post("/reset", async (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const { profile } = z.object({ profile: z.enum(["story", "hotel"]).default("story") }).parse(req.body ?? {});
    if (profile === "hotel") await seedHotelWorkspace();
    else seedReset();
    res.json({ ok: true });
  });

  // CLOCK-SET: test mode only; moving the clock is its own audit entry. Sits before the session
  // check so the demo settings on the person picker can move it; no session = system actor.
  r.post("/clock", (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const b = ClockSetBody.parse(req.body);
    const before = now().toISOString();
    const s = setClock({ time: b.time, scene: b.scene });
    if (b.scene) kvSet("dataMode", { mode: b.scene === "live" ? "live" : "fixture", overlay: b.scene === "4" ? "final-check" : null });
    const id = resolveToken(tokenFrom(req));
    audit({ actor: id?.kind === "person" ? personActor(id.person) : SYSTEM, action: "clock_moved", summary: `Clock moved from ${before} to ${now().toISOString()}${b.scene ? ` (${SCENES[b.scene]?.label ?? b.scene})` : ""}`, details: { scene: b.scene ?? null }, visibility: "shared" });
    res.json({ clock: s, dataMode: kvGet("dataMode") });
  });

  r.use(person);
  r.use(measureProcessing);

  r.get("/me", (req, res) => res.json({ person: P(req) }));

  // UI-01: home opens on the decisions waiting for this person, then their events.
  r.get("/home", (req, res) => {
    const p = P(req);
    const mine = questionsFor(p);
    const events = listEvents().map((e) => ({ id: e.id, name: e.name, serviceDate: e.serviceDate, guests: e.guests, coverage: coverageSummary(e.id), version: e.version, outlets: [...new Set(e.dishes.map((d) => d.outletId))] }));
    const plans = listPlans().filter((pl) => pl.kind === "single" && !pl.reviewing).slice(0, 10).map((pl) => ({ id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name }));
    res.json({ questions: mine, events, plans, warnings: warnings().filter((w) => w.state === "open") });
  });

  const messageBody = z.object({ text: z.string().trim().min(1).max(2000) });

  // Warm only interpretation and local catalogue caches while the person types.
  // Never create a plan, audit a submission, or fetch supplier/quote terms here.
  r.post("/messages/prepare", async (req, res) => {
    const { text } = messageBody.parse(req.body);
    const { parsed } = await interpretMessage(text);
    if (parsed && !res.destroyed) {
      const request = { ...parsed.request, siteId: mandate().sites[0].id, outletId: P(req).outlets[0] ?? "banquet" };
      for (const need of needsFromSingle(request)) shortlist(need, { log: false });
    }
    res.json({ ok: true });
  });

  // Chat box: route the message (MESSAGE-ROUTE), then parse a new request into chips (REQUEST-PARSE).
  r.post("/messages", async (req, res) => {
    const started = processingClock.now();
    const { text } = messageBody.parse(req.body);
    const { route, parsed } = await interpretMessage(text);
    if (route.route === "event_change") {
      const m = text.match(/(\d{1,5})\s*guests?/i);
      const guests = m ? Number(m[1]) : null;
      const parsedEntry = audit({ actor: personActor(P(req)), action: "request_parsed", summary: "Interpreted an event change", details: { route: "event_change", guests, processingMs: Math.round(processingClock.now() - started) }, visibility: "hotel" });
      return res.json({ route: "event_change", parseAuditId: parsedEntry.id, guests, events: listEvents().map((e) => ({ id: e.id, name: e.name, guests: e.guests, version: e.version })), judgement: route.judgement });
    }
    if (route.route === "neither") return res.json({ route: "neither", message: "I can take a new request or a change to an event." });
    if (!parsed) throw new Error("Missing request interpretation");
    logSearch({ source: "request_parse", query: text, interpreted: { route: route.route, parsedBy: parsed.request.parsedBy, note: parsed.note, neededBy: parsed.request.neededBy, neededByText: parsed.request.neededByText, lines: parsed.request.lines } });
    const parsedEntry = audit({ actor: personActor(P(req)), action: "request_parsed", summary: `Parsed "${text.slice(0, 80)}" into ${parsed.request.lines.length} line(s) (${parsed.request.parsedBy})`, details: { request: parsed.request, processingMs: Math.round(processingClock.now() - started) }, visibility: "hotel", judgements: route.judgement ? [route.judgement] : [] });
    res.json({ route: route.route === "unsure" ? "new_request_unsure" : "new_request", request: { ...parsed.request, parseAuditId: parsedEntry.id, siteId: mandate().sites[0].id, outletId: P(req).outlets[0] ?? "banquet" }, note: parsed.note });
  });

  // UI-04 confirmed chips → a plan → quote → questions or an order.
  r.post("/requests", async (req, res) => {
    const request = SingleRequest.parse(req.body.request);
    // An order basket (an event) the request is added to; its delivery date is the needed-by date.
    const eventId = req.body.eventId == null ? null : z.string().parse(req.body.eventId);
    const reviewing = req.body.reviewing === true;
    if (eventId && !getEvent(eventId)) return res.status(404).json({ error: "No such order" });
    const plan = await startRequest(req, request, eventId, reviewing, reviewing && req.body.itemReview === true);
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  });

  /** One path for a typed request and a generated menu order: plan, quote, then review or order. */
  async function startRequest(req: Request, request: SingleRequest, eventId: string | null, reviewing: boolean, itemReview: boolean, title?: string, summary?: string) {
    const p = P(req);
    const plan = newPlan("single", { personId: p.id, name: p.name }, request.outletId, { request, title: title ?? (request.lines.map((l) => `${l.quantity ? `${l.quantity.amount} ${l.quantity.unit} ` : ""}${l.constraints.claims.includes("FREE_FROM_LACTOSE") ? "lactose-free " : ""}${l.query}`).join(", ") || request.originalText.slice(0, 60)) });
    plan.eventId = eventId;
    plan.siteId = request.siteId ?? plan.siteId;
    plan.reviewing = reviewing;
    if (itemReview) plan.itemReviews = [];
    audit({ actor: personActor(p), action: "request_received", summary: summary ?? (reviewing ? `${p.name} checked the request: ${plan.title}` : `${p.name} confirmed the request: ${plan.title}`), ...(summary ? { eventId } : {}), details: { kind: reviewing ? "review" : "confirmation", planId: plan.id }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    return getPlan(plan.id)!;
  }
  r.get("/plans", (_req, res) =>
    res.json({ plans: listPlans().filter((pl) => pl.kind === "single").map((pl) => ({ id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name, totalExVat: pl.totalExVat })) }),
  );
  r.get("/plans/:id", (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  });

  // Resume a saved proposal in the same per-item review as the add-to-order dialog.
  // Keep it visible in its basket; opening details alone never changes the request.
  r.post("/plans/:id/review-items", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!inPlanScope(req, plan)) return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (plan.kind !== "single" || !plan.eventId || plan.basketedAt || plan.orderIds.length || plan.overrides.accepted)
      return res.status(409).json({ error: "This request can no longer be reviewed" });
    plan.itemReviews ??= [];
    await quoteAndDecide(plan, T(req));
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  }));

  // Re-check an edited, not-yet-accepted request without leaving abandoned plans in the basket.
  r.post("/plans/:id/requote", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!inPlanScope(req, plan)) return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (plan.kind !== "single" || plan.orderIds.length || plan.overrides.accepted || plan.basketedAt) return res.status(409).json({ error: "This request can no longer be changed" });
    const request = SingleRequest.parse(req.body.request);
    const p = P(req);
    if (request.outletId !== plan.outletId || (request.siteId ?? plan.siteId) !== plan.siteId)
      return res.status(403).json({ error: "A correction must stay within the original delivery site and outlet" });
    // A product choice belongs to a stable need, so compatible quantity edits keep it.
    // Text, product, diet or unit-dimension changes require a fresh choice.
    // Rechecking retains item approvals only if their complete terms still match.
    const previous = plan.request;
    const sameScope = previous?.siteId === request.siteId && previous?.outletId === request.outletId && previous?.neededBy === request.neededBy;
    const unchanged = new Set(sameScope ? request.lines.filter((line) => previous?.lines.some((old) => old.id === line.id && JSON.stringify(old) === JSON.stringify(line))).map((line) => line.id) : []);
    const sameNeeds = new Set(sameScope ? request.lines.filter((line) => {
      const old = previous?.lines.find((old) => old.id === line.id);
      return old?.quantity && line.quantity
        && toBase(old.quantity).unit === toBase(line.quantity).unit
        && JSON.stringify({ ...old, quantity: line.quantity }) === JSON.stringify(line);
    }).map((line) => line.id) : []);
    const chosen = plan.overrides.chosen?.filter((choice) => [...sameNeeds].some((id) => choice.startsWith(`${id}:`)));
    const salesQuantities = plan.overrides.salesQuantities?.filter((quantity) => unchanged.has(quantity.needId));
    plan.request = request;
    plan.siteId = request.siteId ?? plan.siteId;
    plan.outletId = request.outletId;
    plan.title = request.lines.map((l) => `${l.quantity ? `${l.quantity.amount} ${l.quantity.unit} ` : ""}${l.constraints.claims.includes("FREE_FROM_LACTOSE") ? "lactose-free " : ""}${l.query}`).join(", ") || request.originalText.slice(0, 60);
    plan.overrides = { ...emptyOverrides(), chosen, salesQuantities };
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} changed the request: ${plan.title}`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  }));

  // Adding to an order only stages the checked lines. Supplier submission happens later,
  // when the hotel sends its final order for approval and processing.
  r.post("/plans/:id/basket", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!inPlanScope(req, plan)) return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (!plan.eventId || !plan.proposal || plan.orderIds.length) return res.status(409).json({ error: "This request is not ready to add to the order" });
    // A previously saved proposal may predate the current matching rules/catalogue.
    // Reject changed matches so the chef reviews the result before anything is staged.
    if (!matchesCurrentShortlists(plan.needs, plan.lines))
      return res.status(409).json({ error: "The product matches changed. Review this request again before adding it." });
    if (plan.itemReviews) {
      // Check current supplier terms before accepting the collection of item decisions.
      await quoteAndDecide(plan, T(req));
      if (!allItemsResolved(plan) || !plan.proposal)
        return res.status(409).json({ error: "Approve every unresolved item before adding this request. Changed terms need approval again.", plan });
    }
    const { continueWithWarnings } = z.object({ continueWithWarnings: z.boolean().default(false) }).parse(req.body ?? {});
    const issueRules = [...plan.inputRules, ...plan.lines.flatMap((line) => line.rules)].filter((rule) => rule.outcome !== "order");
    const hardIssues = issueRules.filter((rule) => rule.outcome === "block" || !rule.overridable);
    if (plan.tooLate || plan.error || hardIssues.length) return res.status(409).json({ error: "Resolve the stock, delivery or product issues before adding this request" });
    if (issueRules.length && !continueWithWarnings && !plan.itemReviews) return res.status(409).json({ error: "Confirm that you want to add this request with its warnings" });
    const p = P(req);
    const unconfirmed = plan.lines.filter((line) => line.productId && line.rules.some((rule) => rule.ruleId === "STK-01")).map((line) => line.productId!);
    if ((continueWithWarnings || plan.itemReviews) && unconfirmed.length) {
      plan.overrides.stockContinued = [...new Set([...(plan.overrides.stockContinued ?? []), ...unconfirmed])];
      const stockApprovers = plan.itemReviews?.filter((item) => plan.lines.some((line) => line.needIds.includes(item.needId) && unconfirmed.includes(line.productId!))).map((item) => item.approvedBy!);
      plan.overrides.stockDecidedBy = stockApprovers?.length ? [...new Set(stockApprovers)].join(", ") : p.name;
    }
    plan.basketedAt = now().toISOString();
    plan.reviewing = false;
    plan.proposal = false;
    plan.status = "waiting";
    plan.summary = "In the order · awaiting final order";
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} added ${plan.title} to the order`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, lines: plan.lines.map((l) => l.productId) }, visibility: "hotel" });
    savePlan(plan);
    invalidateBasketReview(plan.eventId);
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id), basket: await basketView(plan.eventId) });
  }));

  r.post("/plans/:id/items/:needId/approve", changingPlan((req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    const p = P(req);
    if (p.hotelId !== HOTEL_ID || (!p.hotelScope && !p.outlets.includes(plan.outletId)))
      return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (!plan.itemReviews || plan.overrides.accepted || plan.basketedAt || plan.orderIds.length)
      return res.status(409).json({ error: "This request is no longer being reviewed" });
    refreshItemReviews(plan);
    const item = plan.itemReviews.find((item) => item.needId === String(req.params.needId));
    if (!item) return res.status(404).json({ error: "No such item" });
    const { fingerprint } = z.object({ fingerprint: z.string() }).parse(req.body);
    if (item.fingerprint !== fingerprint || !item.canApprove)
      return res.status(409).json({ error: item.reason ?? "This item changed. Review its current terms and approve again.", plan });
    if (!item.approvedAt) {
      item.approvedBy = p.name;
      item.approvedAt = now().toISOString();
      audit({ actor: personActor(p), action: "request_received", summary: `${p.name} approved ${plan.needs.find((n) => n.id === item.needId)!.label}`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, needId: item.needId, fingerprint }, visibility: "hotel" });
      savePlan(plan);
    }
    res.json({ plan, questions: [] });
  }));

  // A piece/weight conversion cannot be invented: the buyer enters whole sales units.
  r.post("/plans/:id/items/:needId/quantity", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    const p = P(req);
    if (p.hotelId !== HOTEL_ID || (!p.hotelScope && !p.outlets.includes(plan.outletId)))
      return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (!plan.itemReviews || plan.overrides.accepted || plan.basketedAt || plan.orderIds.length)
      return res.status(409).json({ error: "This request is no longer being reviewed" });
    const { fingerprint, productId, quantity } = z.object({ fingerprint: z.string(), productId: z.string(), quantity: z.number().int().positive().max(1_000_000) }).parse(req.body);
    refreshItemReviews(plan);
    const item = plan.itemReviews.find((item) => item.needId === String(req.params.needId));
    const need = plan.needs.find((n) => n.id === item?.needId);
    const line = plan.lines.find((line) => line.productId === productId && line.needIds.includes(need?.id ?? ""));
    if (!item || !need || !line?.salesUnit) return res.status(404).json({ error: "No such product on this item" });
    if (item.fingerprint !== fingerprint) return res.status(409).json({ error: "This item changed. Review its current terms again.", plan });
    if (line.packContent && line.packContent.unit === need.amount.unit)
      return res.status(409).json({ error: "Edit the requested quantity for this product instead" });
    plan.overrides.salesQuantities = [...(plan.overrides.salesQuantities ?? []).filter((q) => q.needId !== need.id), { needId: need.id, productId, quantity, scope: quantityScope(need) }];
    plan.overrides.chosen = [...(plan.overrides.chosen ?? []).filter((choice) => !choice.startsWith(`${need.id}:`)), `${need.id}:${productId}`];
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} specified ${quantity} ${line.salesUnit} of ${line.productName}`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, needId: need.id, productId, quantity, salesUnit: line.salesUnit }, visibility: "hotel" });
    await quoteAndDecide(plan, T(req));
    res.json({ plan, questions: [] });
  }));

  // The person approves adding the proposed products to the quote, or picks an alternative first.
  r.post("/plans/:id/accept", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!inPlanScope(req, plan)) return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    if (plan.itemReviews) return res.status(409).json({ error: "Approve the individual items and add them to the order before final finance review" });
    if (!plan.proposal) return res.status(409).json({ error: "Nothing waiting to be added" });
    const p = P(req);
    plan.overrides.accepted = true;
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} added ${plan.title} to the quote`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, lines: plan.lines.map((l) => l.productId) }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  }));
  r.post("/plans/:id/choose", changingPlan(async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!inPlanScope(req, plan)) return res.status(403).json({ error: "This item is outside your hotel or outlet scope" });
    const reviewing = plan.kind === "single" && (plan.reviewing || plan.itemReviews) && !plan.basketedAt && !plan.orderIds.length && !plan.overrides.accepted;
    if (!plan.proposal && !reviewing) return res.status(409).json({ error: "Nothing waiting to be added" });
    const { needId, productId } = z.object({ needId: z.string(), productId: z.string() }).parse(req.body);
    const need = plan.needs.find((n) => n.id === needId);
    if (!need?.candidates.some((c) => c.productId === productId)) return res.status(404).json({ error: "Not one of the options" });
    const p = P(req);
    plan.overrides.chosen = [...(plan.overrides.chosen ?? []).filter((k) => !k.startsWith(`${needId}:`)), `${needId}:${productId}`];
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} picked ${need.candidates.find((c) => c.productId === productId)!.name} for ${need.label}`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, needId, productId }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  }));

  // DLV-06: a too-late request is either dropped from the quote or kept, unordered, for someone to review.
  r.post("/plans/:id/too-late", changingPlan((req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!plan.tooLate) return res.status(409).json({ error: "This request isn't too late" });
    const { choice } = z.object({ choice: z.enum(["remove", "review"]) }).parse(req.body);
    const p = P(req);
    plan.tooLateChoice = choice === "remove" ? "removed" : "review";
    audit({
      actor: personActor(p), action: "request_received", eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, ...plan.tooLate }, visibility: "hotel",
      summary: choice === "remove" ? `${p.name} removed ${plan.title} from the quote: it can't arrive in time` : `${p.name} kept ${plan.title} in the order for review, although it can't arrive in time`,
    });
    savePlan(plan);
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  }));

  r.get("/questions/:id", (req, res) => {
    const q = getQuestion(String(req.params.id));
    if (!q) return res.status(404).json({ error: "No such question" });
    res.json({ question: q, canAnswer: canAnswer(q, P(req)) });
  });
  r.post("/questions/:id/answer", async (req, res) => {
    const { optionId, note } = AnswerBody.parse(req.body);
    const question = getQuestion(String(req.params.id));
    if (question?.type === "order_review" && question.eventId) assertBasketIdle(question.eventId);
    const out = await answer(String(req.params.id), P(req), optionId, T(req), note);
    if (!out.ok) return res.status(409).json(out);
    const q = out.question;
    res.json({ ...out, plan: q.planId ? getPlan(q.planId) : null });
  });

  // Order baskets: one per event, named by the event and its delivery date. Requests attach to one.
  const basketPlans = (eventId: string) => listPlans().filter((pl) => pl.kind === "single" && pl.eventId === eventId && !pl.reviewing && !pl.removedFromBasketAt && pl.tooLateChoice !== "removed");
  const planRow = (pl: ReturnType<typeof listPlans>[number]) => ({
    id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name, totalExVat: pl.totalExVat, orderIds: pl.orderIds,
    tooLate: pl.tooLate ?? null, tooLateChoice: pl.tooLateChoice ?? null, basketedAt: pl.basketedAt ?? null,
    changeToken: basketChangeToken(pl), outletId: pl.outletId,
    lines: pl.lines.filter((line) => !line.removed),
  });
  const basketSummary = (event: StoredEvent, orders: Awaited<ReturnType<typeof gw.orders>>["orders"]) => {
    const plans = basketPlans(event.id);
    const eventPlanId = event.orderPlanId ?? event.viabilityPlanId;
    const eventPlan = eventPlanId ? getPlan(eventPlanId) : null;
    if (eventPlan) plans.push(eventPlan);
    const needsAttention = warnings(event.id).some((warning) => warning.state === "open")
      || !!event.finalCheck?.lines.some((line) => line.result !== "covered");
    return basketStatus(event.serviceDate, orders, plans, allQuestions().filter((q) => q.eventId === event.id), now(), needsAttention);
  };
  // Return the same saved basket projection on reads and successful submissions so
  // the builder can update its items and deadline without a second browser request.
  const basketView = async (id: string) => {
    if (!getEvent(id)) throw new BasketReviewError(404, "No such order");
    const { orders } = await gw.orders(id);
    const review = basketReview(id, orders);
    return { ...eventView(id), requests: basketPlans(id).map(planRow), orders, review, ...basketSummary(getEvent(id)!, orders) };
  };
  r.get("/baskets", async (req, res) => {
    const { orders } = await gw.orders();
    const p = P(req);
    // Apply the same stale finance-review cleanup as the detail page, using local snapshots only.
    for (const event of listEvents()) basketReview(event.id, orders.filter((order) => order.eventId === event.id));
    const open = pendingQuestions(allQuestions(), now());
    res.json({
      baskets: listEvents().map((e) => {
        const mine = orders.filter((o) => o.eventId === e.id && o.state !== "rejected");
        const staged = basketPlans(e.id).filter((pl) => pl.basketedAt && !pl.orderIds.length);
        const totalExVat = staged.some((pl) => pl.totalExVat === null)
          ? null
          : mine.reduce((n, o) => n + o.totalExVat, 0) + staged.reduce((n, pl) => n + pl.totalExVat!, 0);
        return {
          id: e.id,
          name: e.name,
          deliveryDate: e.serviceDate,
          guests: e.guests,
          coverage: coverageSummary(e.id),
          lines: mine.reduce((n, o) => n + o.lines.filter((l) => !l.removed).length, 0) + staged.reduce((n, pl) => n + pl.lines.filter((l) => !l.removed).length, 0),
          totalExVat,
          ...basketSummary(e, mine),
          // Only what this person can answer; the rest is someone else's to approve.
          waiting: open.filter((q) => q.eventId === e.id && canAnswer(q, p)).length,
          waitingOthers: open.filter((q) => q.eventId === e.id && !canAnswer(q, p)).length,
          approvalLevels: approvalLevels(open.filter((q) => q.eventId === e.id)),
          requests: basketPlans(e.id).length + (e.dishes.length ? 1 : 0),
        };
      }),
    });
  });
  r.post("/baskets", (req, res) => {
    const b = z.object({ name: z.string().trim().min(1).max(120), deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), guests: z.number().int().min(0).optional() }).parse(req.body);
    const p = P(req);
    const e: StoredEvent = {
      id: newId("evt"), name: b.name, siteId: mandate().sites[0].id, serviceDate: b.deliveryDate, guests: b.guests ?? 0, dietGroups: [], dishes: [], dietsConfirmed: false,
      version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [{ at: now().toISOString(), by: p.name, what: "Order created" }],
    };
    saveEvent(e);
    audit({ actor: personActor(p), action: "basket_created", summary: `${p.name} opened the order "${e.name}" for delivery ${e.serviceDate}`, eventId: e.id, details: { kind: "confirmation" }, visibility: "hotel" });
    res.json({ basket: { id: e.id, name: e.name, deliveryDate: e.serviceDate } });
  });
  r.get("/baskets/:id", async (req, res) => {
    res.json(await basketView(String(req.params.id)));
  });
  r.post("/baskets/:id/submit-review", async (req, res) => {
    const id = String(req.params.id);
    const review = await submitBasketForReview(id, P(req));
    res.json({ review, basket: await basketView(id) });
  });
  r.post("/baskets/:id/requests/:planId/correct", async (req, res) => {
    const { changeToken, action } = z.object({ changeToken: z.string().min(1), action: z.enum(["edit", "remove"]) }).parse(req.body);
    const plan = await correctBasketRequest(String(req.params.id), String(req.params.planId), changeToken, action, P(req));
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  });

  r.get("/events", (_req, res) => res.json({ events: listEvents().map((e) => ({ ...e, coverage: coverageSummary(e.id) })) }));
  r.get("/events/:id", (req, res) => res.json(eventView(String(req.params.id))));
  r.post("/events/:id/viability", async (req, res) => res.json({ plan: await runViability(String(req.params.id), P(req)) }));
  r.post("/events/:id/order", async (req, res) => res.json({ plan: await orderEvent(String(req.params.id), P(req)) }));
  r.post("/events/:id/remove-need", (req, res) => {
    const b = z.object({ needId: z.string(), version: z.number() }).parse(req.body);
    res.json({ event: removeNeed(String(req.params.id), b.needId, b.version, P(req)) });
  });
  r.post("/events/:id/guests", async (req, res) => {
    const b = z.object({ guests: z.number().int().min(0), version: z.number() }).parse(req.body);
    res.json(await changeGuests(String(req.params.id), b.guests, b.version, P(req)));
  });
  // Scene 3 in one step: a new guest count and/or a new allergy (D28 check first, then one change).
  r.post("/events/:id/change", async (req, res) => {
    const b = z.object({ guests: z.number().int().min(0).optional(), group: DietGroup.optional(), version: z.number() }).parse(req.body);
    res.json(await changeEvent(String(req.params.id), { guests: b.guests, group: b.group }, b.version, P(req)));
  });
  r.post("/events/:id/diet-groups", async (req, res) => {
    const b = z.object({ group: DietGroup, version: z.number() }).parse(req.body);
    res.json(await addDietGroup(String(req.params.id), b.group, b.version, P(req)));
  });
  // Menu → order (CH-01, CH-12): the chef's dishes and amounts per guest, scaled by the head count.
  r.get("/events/:id/menu", (req, res) => {
    const e = getEvent(String(req.params.id));
    if (!e) return res.status(404).json({ error: "No such order" });
    res.json({ event: e, scale: scaleMenu(e) });
  });
  r.put("/events/:id/menu", (req, res) => {
    const id = String(req.params.id);
    if (!getEvent(id)) return res.status(404).json({ error: "No such order" });
    const e = saveMenu(id, MenuBody.parse(req.body), P(req));
    audit({ actor: personActor(P(req)), action: "request_received", summary: `${P(req).name} saved the menu for ${e.name}: ${e.dishes.length} dish${e.dishes.length === 1 ? "" : "es"}, ${e.guests} guests`, eventId: id, details: { kind: "review", version: e.version }, visibility: "hotel" });
    res.json({ event: e, scale: scaleMenu(e) });
  });
  r.post("/events/:id/menu/order", async (req, res) => {
    const id = String(req.params.id);
    const e = getEvent(id);
    if (!e) return res.status(404).json({ error: "No such order" });
    const { version } = z.object({ version: z.number().int() }).parse(req.body ?? {});
    // The order is generated from the menu the chef is looking at, never a newer one they haven't seen.
    if (version !== e.version) throw new EditConflict(e);
    const scale = scaleMenu(e);
    if (scale.problems.length) return res.status(422).json({ error: "menu_incomplete", message: scale.problems.map((r) => r.message).join(" "), problems: scale.problems, scale });
    const p = P(req);
    const request = menuRequest(e, scale, e.siteId ?? mandate().sites[0].id, p.outlets[0] ?? "banquet");
    const title = `Menu · ${e.guests} guests · ${scale.lines.length} item${scale.lines.length === 1 ? "" : "s"}`;
    const plan = await startRequest(req, request, id, true, true, title, `${p.name} generated the order from the menu: ${e.dishes.length} dish${e.dishes.length === 1 ? "" : "es"} × ${e.guests} guests → ${scale.lines.length} lines`);
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id), scale });
  });
  r.post("/events/:id/final-check", async (req, res) => res.json({ finalCheck: await finalCheck(String(req.params.id)) }));
  r.post("/events/:id/cutoff", (req, res) => res.json({ flags: runCutoff(String(req.params.id)) }));

  r.get("/orders", async (req, res) => res.json(await gw.orders(req.query.eventId ? String(req.query.eventId) : undefined)));
  r.get("/orders/:id", async (req, res) => res.json(await gw.getOrder(String(req.params.id))));

  r.get("/audit", (req, res) => {
    const viewer = req.query.viewer === "valio" ? "valio" : "hotel";
    const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
    res.json({ viewer, chain: verifyChain(), entries: auditView(viewer, { eventId }), decisions: viewer === "hotel" && eventId ? decisionCount(eventId) : null });
  });

  const rulesPayload = (req: Request) => {
    const p = storedPolicy();
    return {
      rules: rulesView(),
      mandate: mandate(),
      fixed: FIXED,
      params: PARAMS,
      defaultParams: defaultRuleParams(),
      policy: { params: policyParams(), version: p.version, updatedBy: p.updatedBy, updatedAt: p.updatedAt },
      canEdit: P(req).role === "approver",
      remembered: listRemembered(),
      tokens: { outsideAgent: OUTSIDE_AGENT_TOKEN, valioViewer: VALIO_VIEWER_TOKEN },
    };
  };
  r.get("/rules", (req, res) => res.json(rulesPayload(req)));
  // RULE-EDIT: an approver changes outcomes and limits. The next quote uses them.
  r.put("/rules", (req, res) => {
    const b = z.object({ outcomes: z.record(z.string(), z.string()).optional(), params: z.record(z.string(), z.unknown()).optional() }).parse(req.body);
    try {
      const changes = editRules(P(req), b);
      res.json({ ...rulesPayload(req), changes });
    } catch (e) {
      if (e instanceof RuleEditError) return res.status(P(req).role === "approver" ? 400 : 403).json({ error: e.message });
      throw e;
    }
  });
  r.post("/rules/reset", (req, res) => {
    try {
      const changes = resetRules(P(req));
      res.json({ ...rulesPayload(req), changes });
    } catch (e) {
      if (e instanceof RuleEditError) return res.status(403).json({ error: e.message });
      throw e;
    }
  });
  // Catalogue inspection is account-scoped and read-only, separate from request planning.
  const canInspectProducts = (req: Request) => P(req).hotelId === HOTEL_ID && (P(req).hotelScope || P(req).outlets.length > 0);
  r.get("/products", (req, res) => {
    if (!canInspectProducts(req)) return res.status(403).json({ error: "Outside your hotel scope" });
    const { q } = z.object({ q: z.string().trim().max(200).default("") }).parse(req.query);
    const exact = q ? getProduct(q) : null;
    res.json({ products: exact ? [exact] : q ? searchProducts({ q, limit: 50 }) : [], sites: mandate().sites.map(({ id, name }) => ({ id, name })), source: "Local catalogue" });
  });
  r.get("/products/:id/supplier", async (req, res) => {
    if (!canInspectProducts(req)) return res.status(403).json({ error: "Outside your hotel scope" });
    const { siteId, requestedDate } = z.object({ siteId: z.string().min(1), requestedDate: z.string().refine(isCalendarDate, "Use a valid YYYY-MM-DD date") }).parse(req.query);
    const site = mandate().sites.find((candidate) => candidate.id === siteId);
    if (!site) return res.status(403).json({ error: "Outside your delivery site scope" });
    const product = getProductDetails(String(req.params.id));
    if (!product) return res.status(404).json({ error: "Not in catalogue" });
    try {
      const { lines, fallback } = await lookup([product.id], requestedDate);
      const evaluatedAt = now();
      res.setHeader("Cache-Control", "no-store");
      res.json({ product, lookup: lines[0], site: { id: site.id, name: site.name }, requestedDate, evaluatedAt: evaluatedAt.toISOString(), fallback, delivery: inspectDelivery(product, lines[0], requestedDate, evaluatedAt) });
    } catch (error) {
      if (error instanceof UpstreamError) return res.status(503).json({ error: "upstream_unavailable", message: "Supplier terms could not be checked. Try again." });
      throw error;
    }
  });
  r.get("/products/:id", (req, res) => {
    const p = getProductDetails(String(req.params.id));
    if (!p) return res.status(404).json({ error: "Not in catalogue" });
    res.json(p);
  });

  // Demo-only safety drill (docs/demo-plan.md): a script posing as an outside agent sends an
  // order over the budget with no approval. Not part of the product; it shows a real refusal.
  r.post("/drill", async (_req, res) => {
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${OUTSIDE_AGENT_TOKEN}`, ...(process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {}) };
    const m = mandate();
    const q = (await (await fetch(`${config.gatewayUrl}/quotes`, { method: "POST", headers: H, body: JSON.stringify({ siteId: m.sites[0].id, deliveryDate: "2026-11-16", lines: [{ productId: "469672", quantity: 80, outletId: "banquet" }] }) })).json()) as any;
    const o = await fetch(`${config.gatewayUrl}/orders`, { method: "POST", headers: { ...H, "Idempotency-Key": `drill-${q.id}` }, body: JSON.stringify({ quoteId: q.id }) });
    res.json({ quote: { id: q.id, total: q.totalExVat, cap: m.spendCapEur }, status: o.status, refusal: await o.json() });
  });
  r.post("/data-mode", (req, res) => {
    const b = z.object({ mode: z.enum(["live", "fixture"]), overlay: z.string().nullable().default(null) }).parse(req.body);
    kvSet("dataMode", b);
    res.json({ dataMode: b });
  });

  return r;
}

export function appErrors(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof GatewayError) return res.status(err.status).json(err.body);
  if (err instanceof BasketReviewError) return res.status(err.status).json({ error: "basket_review", message: err.message });
  if (err instanceof EditConflict) return res.status(409).json({ error: "edit_conflict", message: err.message, current: err.current });
  if (err instanceof z.ZodError) return res.status(422).json({ error: "invalid", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  next(err);
}
