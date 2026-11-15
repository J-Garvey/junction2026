/**
 * AUDIT-APPEND and AUDIT-VIEW (chunk 09): one append-only log both sides read.
 * Each entry stores the hash of the one before it (Q09.3), so an edit breaks
 * the chain. Valio Aimo reads only entries tagged "shared" (Q09.2).
 */
import type { AuditEntry, AuditAction, ModelJudgement } from "@aimo/contracts";
import { getDb, allJson, getJson } from "./db.js";
import { nowIso } from "./clock.js";
import { sha256, stableStringify, newId } from "./util.js";

import { hotelFor } from "./ownership.js";
import { sharedOrder, sharedQuote } from "./gateway/shared.js";
import type { Order, Quote } from "@aimo/contracts";

export type Actor = AuditEntry["actor"];
export const AGENT: Actor = { kind: "agent", id: "hotel-agent", name: "Hotel agent", role: "agent", outletId: null, testSession: false };
export const GATEWAY: Actor = { kind: "gateway", id: "gateway", name: "Aimo Agent Gateway", role: "gateway", outletId: null, testSession: false };
export const SYSTEM: Actor = { kind: "system", id: "system", name: "System", role: null, outletId: null, testSession: false };

export type AppendInput = {
  hotelId?: string | null;
  actor: Actor;
  action: AuditAction;
  summary: string;
  eventId?: string | null;
  quoteId?: string | null;
  orderId?: string | null;
  questionId?: string | null;
  ruleIds?: string[];
  judgements?: ModelJudgement[];
  details?: Record<string, unknown>;
  usesFixture?: boolean;
  visibility: "shared" | "hotel";
};

export function audit(input: AppendInput): AuditEntry {
  const db = getDb();
  const prev = db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get() as { hash: string } | undefined;
  const prevHash = prev?.hash ?? "genesis";
  const body = {
    id: newId("aud"),
    simTime: nowIso(),
    realTime: new Date().toISOString(),
    hotelId: hotelFor(input),
    actor: input.actor,
    action: input.action,
    summary: input.summary,
    eventId: input.eventId ?? null,
    quoteId: input.quoteId ?? null,
    orderId: input.orderId ?? null,
    questionId: input.questionId ?? null,
    ruleIds: [...new Set(input.ruleIds ?? [])],
    judgements: input.judgements ?? [],
    details: input.details ?? {},
    usesFixture: input.usesFixture ?? false,
    visibility: input.visibility,
    prevHash,
  };
  const hash = sha256(prevHash + stableStringify(body));
  const info = db.prepare("INSERT INTO audit (id, json, hash) VALUES (?, ?, ?)").run(body.id, JSON.stringify({ ...body, hash }), hash);
  const entry = { seq: Number(info.lastInsertRowid), ...body, hash } as AuditEntry;
  db.prepare("UPDATE audit SET json = ? WHERE seq = ?").run(JSON.stringify(entry), entry.seq);
  return entry;
}

export function auditView(viewer: "hotel" | "valio", f: { hotelIds?: string[]; hotelId?: string; eventId?: string; orderId?: string; limit?: number } = {}): AuditEntry[] {
  let rows = allJson<AuditEntry>("SELECT json FROM audit ORDER BY seq DESC");
  rows = rows.filter(r => {
    const owner = hotelFor(r);
    return owner !== null && (f.hotelIds === undefined || f.hotelIds.includes(owner)) && (f.hotelId === undefined || owner === f.hotelId);
  });
  if (f.eventId !== undefined) rows = rows.filter((r) => r.eventId === f.eventId);
  if (f.orderId !== undefined) rows = rows.filter((r) => r.orderId === f.orderId);
  if (viewer === "valio") rows = rows.filter((r) => r.visibility === "shared" && ["quote_created", "order_placed", "order_amended", "approval_granted", "order_refused", "flag_sent_to_valio_aimo"].includes(r.action)).map(redactForValio);
  return rows.slice(0, f.limit ?? 500);
}

/** Q09.2: Valio Aimo sees that a rule was met or an approval exists, never recipes, guests or preferences. */
function redactForValio(e: AuditEntry): AuditEntry {
  const q = e.quoteId ? getJson<Quote>("quotes", e.quoteId) : null;
  const o = e.orderId ? getJson<Order>("orders", e.orderId) : null;
  const details: Record<string, unknown> = {};
  if (e.action === "quote_created" && q) details.quote = sharedQuote(q);
  if (["order_placed", "order_amended"].includes(e.action) && o) details.order = sharedOrder(o);
  if (e.action === "approval_granted") {
    details.approvalId = typeof e.details.approvalId === "string" ? e.details.approvalId : null;
    details.decision = "approved";
    details.role = "approver";
  }
  if (e.action === "flag_sent_to_valio_aimo") {
    details.code = "unresolved_at_cutoff";
    if (typeof e.details.productId === "string") details.productId = e.details.productId;
  }
  if (e.action === "order_refused") details.code = "order_refused";
  // Never copy free text, rule facts, model output, signatures or nested details.
  return { seq: e.seq, id: e.id, simTime: e.simTime, realTime: e.realTime,
    hotelId: hotelFor(e), action: e.action, eventId: null, questionId: null,
    quoteId: e.quoteId, orderId: e.orderId, ruleIds: e.ruleIds,
    usesFixture: e.usesFixture, visibility: "shared", hash: e.hash, prevHash: e.prevHash,
    actor: { ...GATEWAY, role: e.action === "approval_granted" ? "approver" : "gateway" },
    summary: e.action, judgements: [], details };
}

/** Recompute the chain; returns the first broken seq, or null if intact. */
export function verifyChain(): { ok: boolean; brokenAt: number | null; entries: number } {
  const rows = getDb().prepare("SELECT seq, json, hash FROM audit ORDER BY seq ASC").all() as { seq: number; json: string; hash: string }[];
  let prev = "genesis";
  for (const r of rows) {
    const e = JSON.parse(r.json) as AuditEntry;
    const { seq, hash, ...body } = e;
    if (e.prevHash !== prev || sha256(prev + stableStringify(body)) !== r.hash) return { ok: false, brokenAt: r.seq, entries: rows.length };
    prev = r.hash;
  }
  return { ok: true, brokenAt: null, entries: rows.length };
}

/** DECISION-COUNT (Q09.5): answered cards count one each; pre-answers count zero. */
export function decisionCount(eventId: string, hotelId?: string) {
  const rows = auditView("hotel", { eventId, hotelId });
  const decisions = rows.filter((r) => r.action === "question_answered" && r.actor.kind === "person" && r.details.kind !== "confirmation");
  const confirmations = rows.filter((r) => r.action === "request_received" && r.details.kind === "confirmation");
  return {
    decisions: decisions.length,
    confirmations: confirmations.length,
    items: decisions.map((d) => ({ at: d.simTime, by: d.actor.name, summary: d.summary, ruleIds: d.ruleIds })),
  };
}
