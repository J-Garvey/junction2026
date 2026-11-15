/**
 * The live console's API (/api/live): one server-sent event stream carries both
 * halves of the screen, the agent's run and Valio Aimo's gateway feed.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { kvSet } from "../db.js";
import { HOTEL_ID } from "../agent/plan.js";
import { setClock, now } from "../clock.js";
import { seedReset, OUTSIDE_AGENT_TOKEN, VALIO_VIEWER_TOKEN } from "../seed.js";
import { getMandate } from "../gateway/service.js";
import { verifyJwt } from "../gateway/keys.js";
import { orderToUbl } from "../gateway/peppol.js";
import { resolveToken, tokenFrom, issueToken } from "../identity.js";
import { GatewayRefusal } from "../gateway/service.js";
import { readableOrder } from "../gateway/reads.js";
import { verifyChain } from "../audit.js";
import { feedBus, feedEntries, clearFeed, type FeedEntry } from "./feed.js";
import { agentBus, answer, currentSession, resetSession, say, type Session } from "./agent.js";

/** The demo's clock: Saturday 14 Nov, before Sunday's 17:00 cut-off for Monday delivery. */
export const LIVE_TIME = "2026-11-14T10:00:00Z";

function rules() {
  const m = getMandate(HOTEL_ID);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = [...m.deliveryDays].sort();
  const span = d.length && d[d.length - 1] - d[0] === d.length - 1 ? `${days[d[0]]}–${days[d[d.length - 1]]}` : d.map((x) => days[x]).join(", ");
  return {
    hotel: "Demo Hotel",
    spendCapEur: m.spendCapEur,
    delivery: span,
    site: m.sites[0]?.name ?? "",
    unconfirmedStock: "asks the chef",
    signed: Boolean(m.signature),
  };
}

function state() {
  return { session: currentSession(), feed: feedEntries().filter(e => e.hotelId === HOTEL_ID), rules: rules(), clock: now().toISOString(), model: config.openai.model, modelReady: Boolean(config.openai.apiKey), chain: verifyChain() };
}

export function liveReset() {
  seedReset();
  setClock({ time: LIVE_TIME });
  kvSet("dataMode", { mode: "fixture", overlay: null });
  clearFeed();
  resetSession();
}

export function liveRouter(): Router {
  const r = Router();
  // This console combines private hotel chat, policy and signed records. Valio
  // uses the gateway's explicit shared projections instead of this hotel UI.
  r.use((req, res, next) => {
    const id = resolveToken(tokenFrom(req));
    if (!id) return res.status(401).json({ error: "forbidden", message: "Sign in to the hotel console" });
    if (id.kind !== "person" || id.hotelId !== HOTEL_ID)
      throw new GatewayRefusal(403, { error: "forbidden", message: "The live console belongs to Demo Hotel; use gateway shared reads" });
    req.identity = id;
    next();
  });

  r.get("/state", (_req, res) => res.json(state()));

  r.get("/stream", (req: Request, res: Response) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("state", state());
    const onEntry = (e: FeedEntry) => { if (e.hotelId === HOTEL_ID) send("feed", e); };
    const onSession = (s: Session) => send("session", s);
    const onReset = () => send("state", state());
    feedBus.on("entry", onEntry);
    feedBus.on("reset", onReset);
    agentBus.on("session", onSession);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ping);
      feedBus.off("entry", onEntry);
      feedBus.off("reset", onReset);
      agentBus.off("session", onSession);
    });
  });

  r.post("/say", (req, res) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(600) }).parse(req.body);
    try {
      say(text);
      res.status(202).json({ ok: true });
    } catch (e) {
      res.status(409).json({ error: "busy", message: (e as Error).message });
    }
  });

  r.post("/cards/:id", async (req, res) => {
    const { optionId } = z.object({ optionId: z.string() }).parse(req.body);
    try {
      await answer(String(req.params.id), optionId);
      res.json({ ok: true });
    } catch (e) {
      res.status(409).json({ error: "closed", message: (e as Error).message });
    }
  });

  r.post("/reset", (req, res) => {
    if (!config.testMode) return res.status(403).json({ error: "Test mode only" });
    const personId = req.identity!.kind === "person" ? req.identity!.person.id : "";
    liveReset();
    const token = issueToken({ kind: "person", personId, testSession: true });
    res.cookie("aimo_session", token, { httpOnly: true, sameSite: "lax", path: "/" });
    res.json(state());
  });

  // Safety drill: an unvetted script holding the hotel's agent token orders far over budget
  // with no approval. It goes through the real gateway; the refusal is the gateway's own.
  r.post("/rogue", async (_req, res) => {
    const H = { "Content-Type": "application/json", Authorization: `Bearer ${OUTSIDE_AGENT_TOKEN}`, ...(process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {}) };
    const q: any = await (await fetch(`${config.gatewayUrl}/quotes`, { method: "POST", headers: H, body: JSON.stringify({ siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469672", quantity: 80, outletId: "banquet" }] }) })).json();
    const o = await fetch(`${config.gatewayUrl}/orders`, { method: "POST", headers: { ...H, "Idempotency-Key": `rogue-${q.id}` }, body: JSON.stringify({ quoteId: q.id }) });
    res.json({ quoteTotal: q.totalExVat, status: o.status, refusal: await o.json() });
  });

  // The signed record behind a feed row, as Valio Aimo sees it.
  r.get("/orders/:id", (req, res) => {
    const o = readableOrder(req.identity!, String(req.params.id));
    const claims = o.jws ? verifyJwt(o.jws, "aimo-order+jwt") : null;
    res.json({
      order: { id: o.id, state: o.state, totalExVat: o.totalExVat, totalVat: o.totalVat, deliveryDate: o.deliveryDate, placedAt: o.placedAt, placedBy: o.placedBy, approvalId: o.approvalId, lines: o.lines.map((l) => ({ productId: l.productId, name: l.productName, quantity: l.quantity, salesUnit: l.salesUnit, unitPrice: l.unitPrice, lineTotal: l.lineTotal, riskAccepted: l.riskAccepted })) },
      signature: { present: Boolean(o.jws), valid: Boolean(claims), alg: "ES256", jwks: "/.well-known/jwks.json", jws: o.jws ?? null, claims },
      valioToken: VALIO_VIEWER_TOKEN.slice(0, 6) + "…",
    });
  });
  r.get("/orders/:id/peppol", (req, res) => res.type("application/xml").send(orderToUbl(readableOrder(req.identity!, String(req.params.id)))));

  return r;
}
