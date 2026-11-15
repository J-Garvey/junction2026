/**
 * AUDIT-APPEND and AUDIT-VIEW (chunk 09): one append-only log both sides read.
 * Each entry stores the hash of the one before it (Q09.3), so an edit breaks
 * the chain. Valio Aimo reads only entries tagged "shared" (Q09.2).
 */
import type { AuditEntry, AuditAction, ModelJudgement, Quote } from "@aimo/contracts";
import { ApprovalBody, Refusal } from "@aimo/contracts";
import { z } from "zod";
import { getDb, allJson, getJson } from "./db.js";
import { nowIso } from "./clock.js";
import { sha256, stableStringify, newId } from "./util.js";

export type Actor = AuditEntry["actor"];
export const AGENT: Actor = { kind: "agent", id: "hotel-agent", name: "Hotel agent", role: "agent", outletId: null, testSession: false };
export const GATEWAY: Actor = { kind: "gateway", id: "gateway", name: "Aimo Agent Gateway", role: "gateway", outletId: null, testSession: false };
export const SYSTEM: Actor = { kind: "system", id: "system", name: "System", role: null, outletId: null, testSession: false };

export type AppendInput = {
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

export function auditView(viewer: "hotel" | "valio", f: { eventId?: string; orderId?: string; limit?: number } = {}): AuditEntry[] {
  let rows = allJson<AuditEntry>("SELECT json FROM audit ORDER BY seq DESC");
  if (viewer === "valio") rows = rows.filter((r) => r.visibility === "shared" && Object.hasOwn(SHARED_ACTIONS, r.action));
  if (f.eventId) rows = rows.filter((r) => r.eventId === f.eventId);
  if (f.orderId) rows = rows.filter((r) => r.orderId === f.orderId);
  rows = rows.slice(0, f.limit ?? 500);
  return viewer === "valio" ? rows.map(redactForValio) : rows;
}

// Q09.2: share trade facts, never arbitrary stored text or nested rule facts.
// Object schemas strip unknown keys at every level. Invalid details fail closed.
const id = z.string();
const amount = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?$/);
const terms = {
  quantity: amount, unitPrice: amount.nullable(), lineTotal: amount.nullable(),
  totalExVat: amount, totalVat: amount, deliveryDate: date,
};
const line = z.object({
  lineNo: z.number().int(), lineId: id, productId: id, outletId: id,
  salesUnit: z.string().nullable(), quantity: terms.quantity,
  unitPrice: terms.unitPrice, lineTotal: terms.lineTotal,
  availableDate: date.nullable(), closingTime: date.nullable(), priceValidTo: date.nullable(),
  stock: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("known"), amount }),
    z.object({ kind: z.literal("unknown") }),
    z.object({ kind: z.literal("none") }),
  ]),
}).partial();
const trade = {
  hotelId: id, customerNumber: id, siteId: id, quoteVersion: z.number().int(),
  version: z.number().int(), lines: z.array(line), currency: z.string().regex(/^[A-Z]{3}$/),
  totalExVat: terms.totalExVat, totalVat: terms.totalVat, deliveryDate: date,
};
const grants = ApprovalBody.shape.grants;
const SHARED_ACTIONS: Partial<Record<AuditAction, { summary: string; details: z.ZodType }>> = {
  quote_created: {
    summary: "Quote created",
    details: z.object({ ...trade, expiresAt: date }).partial(),
  },
  approval_granted: {
    summary: "Approval recorded",
    details: z.object({ approvalId: id, quoteVersion: z.number().int(), grants, decision: z.literal("approved") }).partial(),
  },
  order_placed: {
    summary: "Order placed",
    details: z.object({ ...trade, approvalId: id.nullable(), outlets: z.array(id), status: z.enum(["placed", "amended", "checked", "locked", "rejected"]) }).partial(),
  },
  order_amended: {
    summary: "Order amended",
    details: z.object({
      ...trade, approvalId: id.nullable(),
      changes: z.array(z.object({
        productId: id, outletId: id, lineId: id, quantity: amount,
        before: z.object(terms).partial(), after: z.object(terms).partial(),
      }).partial()),
    }).partial(),
  },
  order_refused: {
    summary: "Order refused",
    details: z.object({ error: Refusal.shape.error, lineIds: z.array(id) }).partial(),
  },
  final_check_run: {
    summary: "Final check recorded",
    details: z.object({ results: z.array(z.object({ productId: id, result: z.enum(["covered", "covered_at_risk", "short", "price_changed"]) })) }).partial(),
  },
  flag_sent_to_valio_aimo: {
    summary: "Trade issue flagged",
    details: z.object({ productId: id.nullable(), lineIds: z.array(id), closingTime: date }).partial(),
  },
};

function sharedActor(actor: Actor): Actor {
  const roles = { chef: "Chef", approver: "Approver" };
  if (actor.kind === "person") {
    const role = actor.role === "chef" || actor.role === "approver" ? actor.role : null;
    return { kind: "person", id: role ? `role:${role}` : "person", name: role ? roles[role] : "Hotel staff", role, outletId: null, testSession: actor.testSession };
  }
  const labels = { agent: "Hotel agent", outside_agent: "Outside agent", gateway: "Aimo Agent Gateway", system: "System" };
  return { kind: actor.kind, id: actor.kind, name: labels[actor.kind], role: actor.kind === "system" ? null : actor.kind === "gateway" ? "gateway" : "agent", outletId: null, testSession: actor.testSession };
}

/** Fresh read projection; stored entries, chain hashes and signed trade records stay intact. */
function redactForValio(e: AuditEntry): AuditEntry {
  const projection = SHARED_ACTIONS[e.action]!;
  // Old entries keep amounts only in their free-text summary. Read trade terms
  // from that entry's immutable quote, never from the order's latest amendment.
  const q = e.quoteId && ["quote_created", "order_placed", "order_amended"].includes(e.action)
    ? getJson<Quote>("quotes", e.quoteId) : null;
  const parsed = projection.details.safeParse({
    ...(q ? { hotelId: q.hotelId, siteId: q.siteId, deliveryDate: q.deliveryDate, expiresAt: q.expiresAt, lines: q.lines, totalExVat: q.totalExVat, totalVat: q.totalVat, currency: "EUR" } : {}),
    ...e.details,
    ...(e.action === "approval_granted" ? { decision: "approved" } : {}),
  });
  return {
    seq: e.seq, id: e.id, simTime: e.simTime, realTime: e.realTime,
    actor: sharedActor(e.actor), action: e.action, summary: projection.summary,
    eventId: e.eventId, quoteId: e.quoteId, orderId: e.orderId, questionId: null,
    ruleIds: e.ruleIds.filter((r) => /^(?:ALG|DIET|STK|DLV|CUT|PRC|QTY|MAN|CHG|SUB|FIN|SIL)-\d{2}$/.test(r)),
    judgements: [], details: parsed.success ? parsed.data as Record<string, unknown> : {},
    // Hashes refer to the full stored entries; verifyChain checks those originals.
    usesFixture: e.usesFixture, visibility: "shared", prevHash: e.prevHash, hash: e.hash,
  };
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
export function decisionCount(eventId: string) {
  const rows = auditView("hotel", { eventId });
  const decisions = rows.filter((r) => r.action === "question_answered" && r.actor.kind === "person" && r.details.kind !== "confirmation");
  const confirmations = rows.filter((r) => r.action === "request_received" && r.details.kind === "confirmation");
  return {
    decisions: decisions.length,
    confirmations: confirmations.length,
    items: decisions.map((d) => ({ at: d.simTime, by: d.actor.name, summary: d.summary, ruleIds: d.ruleIds })),
  };
}
