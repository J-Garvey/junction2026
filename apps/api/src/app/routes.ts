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
import { messageRoute } from "../agent/judge.js";
import { newPlan, quoteAndDecide, getPlan, listPlans, mandate, savePlan } from "../agent/plan.js";
import { questionsFor, allQuestions, getQuestion, canAnswer } from "../agent/questions.js";
import { answer } from "../agent/answers.js";
import { addDietGroup, changeGuests, coverageSummary, EditConflict, eventView, finalCheck, listEvents, orderEvent, removeNeed, runCutoff, runViability, warnings, personActor } from "../agent/events.js";
import { listRemembered } from "../agent/memory.js";
import { seedReset, seedProfile, SEED_PROFILES, OUTLETS, OUTSIDE_AGENT_TOKEN, VALIO_VIEWER_TOKEN } from "../seed.js";
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
      seed: { current: seedProfile().id, hotelName: seedProfile().hotelName, profiles: Object.keys(SEED_PROFILES) },
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

  r.post("/reset", (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const { profile } = z.object({ profile: z.enum(["gala", "wedding"]).optional() }).parse(req.body ?? {});
    seedReset(profile);
    res.json({ ok: true, seed: seedProfile().id });
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
    audit({ actor: personActor(P(req)), action: "request_parsed", summary: `Parsed "${text.slice(0, 80)}" into ${parsed.request.lines.length} line(s) (${parsed.request.parsedBy})`, details: { request: parsed.request }, visibility: "hotel", judgements: route.judgement ? [route.judgement] : [] });
    res.json({ route: route.route === "unsure" ? "new_request_unsure" : "new_request", request: { ...parsed.request, siteId: mandate().sites[0].id, outletId: P(req).outlets[0] ?? "banquet" }, note: parsed.note });
  });

  // UI-04 confirmed chips → a plan → quote → questions or an order.
  r.post("/requests", async (req, res) => {
    const request = SingleRequest.parse(req.body.request);
    const p = P(req);
    const plan = newPlan("single", { personId: p.id, name: p.name }, request.outletId, { request, title: request.lines.map((l) => `${l.quantity ? `${l.quantity.amount} ${l.quantity.unit} ` : ""}${l.constraints.claims.includes("FREE_FROM_LACTOSE") ? "lactose-free " : ""}${l.query}`).join(", ") || request.originalText.slice(0, 60) });
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
    if (b.scene) kvSet("dataMode", { mode: b.scene === "live" ? "live" : "fixture", overlay: b.scene === "4" ? seedProfile().finalCheckOverlay : null });
    audit({ actor: personActor(P(req)), action: "clock_moved", summary: `Clock moved from ${before} to ${now().toISOString()}${b.scene ? ` (${SCENES[b.scene]?.label ?? b.scene})` : ""}`, details: { scene: b.scene ?? null }, visibility: "shared" });
    res.json({ clock: s, dataMode: kvGet("dataMode") });
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
