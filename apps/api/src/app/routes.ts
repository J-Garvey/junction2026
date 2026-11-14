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
import { audit, auditView, verifyChain, decisionCount } from "../audit.js";
import { kvGet, kvSet } from "../db.js";
import { RULES, FIXED } from "../rules/catalogue.js";
import { getProduct, catalogSize } from "../catalog.js";
import { parseRequest } from "../agent/parse.js";
import { logSearch } from "../searchlog.js";
import { messageRoute } from "../agent/judge.js";
import { newPlan, quoteAndDecide, getPlan, listPlans, mandate, savePlan } from "../agent/plan.js";
import { questionsFor, allQuestions, getQuestion, canAnswer } from "../agent/questions.js";
import { answer } from "../agent/answers.js";
import { addDietGroup, changeEvent, changeGuests, coverageSummary, EditConflict, eventView, finalCheck, getEvent, listEvents, orderEvent, removeNeed, runCutoff, runViability, saveEvent, warnings, personActor, type StoredEvent } from "../agent/events.js";
import { newId } from "../util.js";
import { listRemembered } from "../agent/memory.js";
import { seedReset, OUTLETS, OUTSIDE_AGENT_TOKEN, VALIO_VIEWER_TOKEN } from "../seed.js";
import { gw } from "../agent/gatewayClient.js";
import { dataMode } from "../aimo/lookup.js";
import { config } from "../config.js";
import { modelConfigured, modelName } from "../agent/openai.js";

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

function sessionCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `aimo_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`);
}

export function appRouter(): Router {
  const r = Router();

  r.get("/status", (_req, res) =>
    res.json({
      clock: { ...clockState(), now: now().toISOString(), scenes: SCENES },
      dataMode: dataMode(),
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

  r.post("/reset", (_req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    seedReset();
    res.json({ ok: true });
  });

  r.use(person);

  r.get("/me", (req, res) => res.json({ person: P(req) }));

  // UI-01: home opens on the decisions waiting for this person, then their events.
  r.get("/home", (req, res) => {
    const p = P(req);
    const mine = questionsFor(p);
    const events = listEvents().map((e) => ({ id: e.id, name: e.name, serviceDate: e.serviceDate, guests: e.guests, coverage: coverageSummary(e.id), version: e.version, outlets: [...new Set(e.dishes.map((d) => d.outletId))] }));
    const plans = listPlans().filter((pl) => pl.kind === "single").slice(0, 10).map((pl) => ({ id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name }));
    res.json({ questions: mine, events, plans, warnings: warnings().filter((w) => w.state === "open") });
  });

  // Chat box: route the message (MESSAGE-ROUTE), then parse a new request into chips (REQUEST-PARSE).
  r.post("/messages", async (req, res) => {
    const { text } = z.object({ text: z.string().min(1).max(2000) }).parse(req.body);
    const route = await messageRoute(text);
    if (route.route === "event_change") {
      const m = text.match(/(\d{1,5})\s*guests?/i);
      return res.json({ route: "event_change", guests: m ? Number(m[1]) : null, events: listEvents().map((e) => ({ id: e.id, name: e.name, guests: e.guests, version: e.version })), judgement: route.judgement });
    }
    if (route.route === "neither") return res.json({ route: "neither", message: "I can take a new request or a change to an event." });
    const parsed = await parseRequest(text);
    logSearch({ source: "request_parse", query: text, interpreted: { route: route.route, parsedBy: parsed.request.parsedBy, note: parsed.note, neededBy: parsed.request.neededBy, neededByText: parsed.request.neededByText, lines: parsed.request.lines } });
    audit({ actor: personActor(P(req)), action: "request_parsed", summary: `Parsed "${text.slice(0, 80)}" into ${parsed.request.lines.length} line(s) (${parsed.request.parsedBy})`, details: { request: parsed.request }, visibility: "hotel", judgements: route.judgement ? [route.judgement] : [] });
    res.json({ route: route.route === "unsure" ? "new_request_unsure" : "new_request", request: { ...parsed.request, siteId: mandate().sites[0].id, outletId: P(req).outlets[0] ?? "banquet" }, note: parsed.note });
  });

  // UI-04 confirmed chips → a plan → quote → questions or an order.
  r.post("/requests", async (req, res) => {
    const request = SingleRequest.parse(req.body.request);
    // An order basket (an event) the request is added to; its delivery date is the needed-by date.
    const eventId = req.body.eventId == null ? null : z.string().parse(req.body.eventId);
    if (eventId && !getEvent(eventId)) return res.status(404).json({ error: "No such order" });
    const p = P(req);
    const plan = newPlan("single", { personId: p.id, name: p.name }, request.outletId, { request, title: request.lines.map((l) => `${l.quantity ? `${l.quantity.amount} ${l.quantity.unit} ` : ""}${l.constraints.claims.includes("FREE_FROM_LACTOSE") ? "lactose-free " : ""}${l.query}`).join(", ") || request.originalText.slice(0, 60) });
    plan.eventId = eventId;
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} confirmed the request: ${plan.title}`, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  });
  r.get("/plans", (_req, res) =>
    res.json({ plans: listPlans().filter((pl) => pl.kind === "single").map((pl) => ({ id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name, totalExVat: pl.totalExVat })) }),
  );
  r.get("/plans/:id", (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    res.json({ plan, questions: allQuestions().filter((q) => q.planId === plan.id) });
  });

  // The person approves adding the proposed products to the quote, or picks an alternative first.
  r.post("/plans/:id/accept", async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!plan.proposal) return res.status(409).json({ error: "Nothing waiting to be added" });
    const p = P(req);
    plan.overrides.accepted = true;
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} added ${plan.title} to the quote`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, lines: plan.lines.map((l) => l.productId) }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  });
  r.post("/plans/:id/choose", async (req, res) => {
    const plan = getPlan(String(req.params.id));
    if (!plan) return res.status(404).json({ error: "No such plan" });
    if (!plan.proposal) return res.status(409).json({ error: "Nothing waiting to be added" });
    const { needId, productId } = z.object({ needId: z.string(), productId: z.string() }).parse(req.body);
    const need = plan.needs.find((n) => n.id === needId);
    if (!need?.candidates.some((c) => c.productId === productId)) return res.status(404).json({ error: "Not one of the options" });
    const p = P(req);
    plan.overrides.chosen = [...(plan.overrides.chosen ?? []).filter((k) => !k.startsWith(`${needId}:`)), `${needId}:${productId}`];
    audit({ actor: personActor(p), action: "request_received", summary: `${p.name} picked ${need.candidates.find((c) => c.productId === productId)!.name} for ${need.label}`, eventId: plan.eventId, details: { kind: "confirmation", planId: plan.id, needId, productId }, visibility: "hotel" });
    savePlan(plan);
    await quoteAndDecide(plan, T(req));
    res.json({ plan: getPlan(plan.id), questions: allQuestions().filter((q) => q.planId === plan.id) });
  });

  // DLV-06: a too-late request is either dropped from the quote or kept, unordered, for someone to review.
  r.post("/plans/:id/too-late", (req, res) => {
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
  });

  r.get("/questions/:id", (req, res) => {
    const q = getQuestion(String(req.params.id));
    if (!q) return res.status(404).json({ error: "No such question" });
    res.json({ question: q, canAnswer: canAnswer(q, P(req)) });
  });
  r.post("/questions/:id/answer", async (req, res) => {
    const { optionId } = AnswerBody.parse(req.body);
    const out = await answer(String(req.params.id), P(req), optionId, T(req));
    if (!out.ok) return res.status(409).json(out);
    const q = out.question;
    res.json({ ...out, plan: q.planId ? getPlan(q.planId) : null });
  });

  // Order baskets: one per event, named by the event and its delivery date. Requests attach to one.
  const basketPlans = (eventId: string) => listPlans().filter((pl) => pl.kind === "single" && pl.eventId === eventId && pl.tooLateChoice !== "removed");
  const planRow = (pl: ReturnType<typeof listPlans>[number]) => ({
    id: pl.id, title: pl.title, status: pl.status, summary: pl.summary, createdAt: pl.createdAt, createdBy: pl.createdBy.name, totalExVat: pl.totalExVat, orderIds: pl.orderIds,
    tooLate: pl.tooLate ?? null, tooLateChoice: pl.tooLateChoice ?? null,
  });
  r.get("/baskets", async (_req, res) => {
    const { orders } = await gw.orders();
    const open = allQuestions().filter((q) => q.state === "open" || q.state === "waiting");
    res.json({
      baskets: listEvents().map((e) => {
        const mine = orders.filter((o) => o.eventId === e.id && o.state !== "rejected");
        return {
          id: e.id,
          name: e.name,
          deliveryDate: e.serviceDate,
          guests: e.guests,
          coverage: coverageSummary(e.id),
          lines: mine.reduce((n, o) => n + o.lines.filter((l) => !l.removed).length, 0),
          totalExVat: mine.reduce((n, o) => n + o.totalExVat, 0),
          waiting: open.filter((q) => q.eventId === e.id).length,
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
    const id = String(req.params.id);
    if (!getEvent(id)) return res.status(404).json({ error: "No such order" });
    const { orders } = await gw.orders(id);
    res.json({ ...eventView(id), requests: basketPlans(id).map(planRow), orders });
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
  r.post("/events/:id/final-check", async (req, res) => res.json({ finalCheck: await finalCheck(String(req.params.id)) }));
  r.post("/events/:id/cutoff", (req, res) => res.json({ flags: runCutoff(String(req.params.id)) }));

  r.get("/orders", async (req, res) => res.json(await gw.orders(req.query.eventId ? String(req.query.eventId) : undefined)));
  r.get("/orders/:id", async (req, res) => res.json(await gw.getOrder(String(req.params.id))));

  r.get("/audit", (req, res) => {
    const viewer = req.query.viewer === "valio" ? "valio" : "hotel";
    const eventId = req.query.eventId ? String(req.query.eventId) : undefined;
    res.json({ viewer, chain: verifyChain(), entries: auditView(viewer, { eventId }), decisions: eventId ? decisionCount(eventId) : null });
  });

  r.get("/rules", (_req, res) =>
    res.json({
      rules: RULES,
      mandate: mandate(),
      fixed: FIXED,
      remembered: listRemembered(),
      tokens: { outsideAgent: OUTSIDE_AGENT_TOKEN, valioViewer: VALIO_VIEWER_TOKEN },
    }),
  );
  r.get("/products/:id", (req, res) => {
    const p = getProduct(String(req.params.id));
    if (!p) return res.status(404).json({ error: "Not in catalogue" });
    res.json(p);
  });

  // CLOCK-SET: test mode only; moving the clock is its own audit entry.
  r.post("/clock", (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const b = ClockSetBody.parse(req.body);
    const before = now().toISOString();
    const s = setClock({ time: b.time, scene: b.scene });
    if (b.scene) kvSet("dataMode", { mode: b.scene === "live" ? "live" : "fixture", overlay: b.scene === "4" ? "final-check" : null });
    audit({ actor: personActor(P(req)), action: "clock_moved", summary: `Clock moved from ${before} to ${now().toISOString()}${b.scene ? ` (${SCENES[b.scene]?.label ?? b.scene})` : ""}`, details: { scene: b.scene ?? null }, visibility: "shared" });
    res.json({ clock: s, dataMode: kvGet("dataMode") });
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
  if (err instanceof EditConflict) return res.status(409).json({ error: "edit_conflict", message: err.message, current: err.current });
  if (err instanceof z.ZodError) return res.status(422).json({ error: "invalid", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  next(err);
}
