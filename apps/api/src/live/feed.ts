/**
 * Valio Aimo's live view of its agent front door. Every call to /gateway/v1 is
 * tapped after the gateway answers, and turned into one row: who called, what
 * they tried, and the gateway's verdict. Nothing here decides anything; the
 * verdict is read from the gateway's own response.
 */
import { EventEmitter } from "node:events";
import type { Request, Response, NextFunction } from "express";
import { resolveToken, tokenFrom } from "../identity.js";
import { newId } from "../util.js";

export type Verdict = "ALLOWED" | "NEEDS_APPROVAL" | "ASKS_CHEF" | "REFUSED" | "APPROVED" | "INFO";
export type Action = "SEARCH" | "PRODUCT" | "LOOKUP" | "QUOTE" | "APPROVAL" | "ORDER" | "AMEND" | "RULES" | "READ";

export type FeedEntry = {
  id: string;
  at: string;
  agent: string;
  callerKind: "agent" | "person" | "valio" | "unknown";
  method: string;
  path: string;
  status: number;
  action: Action;
  verdict: Verdict;
  amount: number | null;
  reason: string | null;
  signed: boolean;
  quoteId: string | null;
  orderId: string | null;
  ms: number;
};

const MAX = 300;
const entries: FeedEntry[] = [];
export const feedBus = new EventEmitter();
feedBus.setMaxListeners(100);

export const feedEntries = () => entries.slice();
export function clearFeed() {
  entries.length = 0;
  feedBus.emit("reset");
}

function actionOf(method: string, path: string): Action {
  if (path.startsWith("/products") && method === "GET") return path === "/products" ? "SEARCH" : "PRODUCT";
  if (path === "/lookup") return "LOOKUP";
  if (path.startsWith("/quotes")) return method === "POST" ? "QUOTE" : "READ";
  if (path === "/approvals") return "APPROVAL";
  if (/^\/orders\/[^/]+\/amendments/.test(path)) return "AMEND";
  if (path.startsWith("/orders")) return method === "POST" ? "ORDER" : "READ";
  if (path === "/mandate") return "RULES";
  return "READ";
}

const money = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Reads the gateway's answer and names the verdict in Valio Aimo's words. */
export function classify(method: string, path: string, status: number, body: any): Pick<FeedEntry, "action" | "verdict" | "amount" | "reason" | "signed" | "quoteId" | "orderId"> {
  const action = actionOf(method, path);
  const base = { action, amount: null as number | null, reason: null as string | null, signed: false, quoteId: null as string | null, orderId: null as string | null };
  if (status >= 400) {
    const rules: any[] = Array.isArray(body?.rules) ? body.rules : [];
    const reason = rules.find((r) => r.outcome === "block" || r.outcome === "ask_approver")?.message ?? body?.message ?? `HTTP ${status}`;
    return { ...base, verdict: "REFUSED", reason: body?.error ? `${reason}` : reason, quoteId: body?.quoteId ?? null };
  }
  if (action === "SEARCH") return { ...base, verdict: "INFO", reason: `${body?.products?.length ?? 0} products` };
  if (action === "LOOKUP") return { ...base, verdict: "INFO", reason: `${body?.lines?.length ?? 0} prices and stock` };
  if (action === "RULES") return { ...base, verdict: "INFO", reason: "Read the hotel's signed rules" };
  if (action === "QUOTE") {
    const q = body;
    const out = { ...base, amount: q.totalExVat ?? null, signed: Boolean(q.jws), quoteId: q.id ?? null };
    if (q.outcome === "block") {
      const r = (q.lines ?? []).flatMap((l: any) => l.rules ?? []).find((r: any) => r.outcome === "block");
      return { ...out, verdict: "REFUSED", reason: r?.message ?? "A hard rule blocks this quote" };
    }
    if (q.mandateCheck && !q.mandateCheck.pass) {
      const r = (q.mandateCheck.rules ?? []).find((r: any) => r.outcome === "ask_approver");
      return { ...out, verdict: "NEEDS_APPROVAL", reason: r?.message ?? `Needs ${q.mandateCheck.approvalsNeeded?.join(", ")}` };
    }
    if ((q.unconfirmedStock ?? []).length) return { ...out, verdict: "ASKS_CHEF", reason: `Stock not confirmed for ${q.unconfirmedStock.length} product${q.unconfirmedStock.length > 1 ? "s" : ""}: the chef decides` };
    return { ...out, verdict: "ALLOWED", reason: `Within the hotel's rules · ${money(q.totalExVat)}` };
  }
  if (action === "APPROVAL") return { ...base, verdict: "APPROVED", reason: `${body?.approvedBy?.name ?? "Approver"} signed off`, signed: Boolean(body?.signature), quoteId: body?.quoteId ?? null };
  if (action === "ORDER" || action === "AMEND") {
    const o = action === "AMEND" ? body?.order : body;
    const parts = [o?.approvalId ? "approval attached" : null, (o?.lines ?? []).some((l: any) => l.riskAccepted) ? "unconfirmed stock accepted by the chef" : null, status === 200 && action === "ORDER" ? "same key: same order returned" : null].filter(Boolean);
    return { ...base, verdict: "ALLOWED", amount: o?.totalExVat ?? null, signed: Boolean(o?.jws), orderId: o?.id ?? null, quoteId: o?.quoteId ?? null, reason: parts.length ? parts.join(" · ") : "Within the hotel's rules" };
  }
  return { ...base, verdict: "INFO" };
}

/** Express middleware mounted in front of the gateway router. */
export function feedTap(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  const path = req.path;
  if (path === "/openapi.json" || path === "/audit") return next();
  const id = resolveToken(tokenFrom(req));
  const agent = !id ? "Unknown caller" : id.kind === "agent" ? id.name : id.kind === "person" ? `${id.person.name} (${id.person.title})` : id.name;
  const callerKind = !id ? "unknown" : id.kind;
  const orig = res.json.bind(res);
  res.json = (body: any) => {
    try {
      const c = classify(req.method, path, res.statusCode, body);
      if (c.action === "READ" && res.statusCode < 400) return orig(body);
      if (c.action === "APPROVAL" && c.quoteId) c.amount = entries.find((x) => x.action === "QUOTE" && x.quoteId === c.quoteId)?.amount ?? null;
      if (c.action === "ORDER" && c.verdict === "REFUSED") {
        const qid = typeof req.body?.quoteId === "string" ? req.body.quoteId : null;
        const quote = qid ? entries.find((x) => x.action === "QUOTE" && x.quoteId === qid) : undefined;
        c.quoteId = qid;
        c.amount = quote?.amount ?? null;
        if (body?.error === "mandate_violation" && !req.body?.approvalId) c.reason = `${c.reason} No approval attached.`;
      }
      const e: FeedEntry = { id: newId("call"), at: new Date().toISOString(), agent, callerKind, method: req.method, path: `/gateway/v1${path}`, status: res.statusCode, ms: Date.now() - started, ...c };
      entries.push(e);
      if (entries.length > MAX) entries.shift();
      feedBus.emit("entry", e);
    } catch {
      // The feed must never break the gateway.
    }
    return orig(body);
  };
  next();
}
