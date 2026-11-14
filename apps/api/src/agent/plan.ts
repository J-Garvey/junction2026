/**
 * The hotel agent's pipeline. One path for every request (D4): needs → shortlist
 * → one lookup → rank → whole packs → verdicts → quote at the gateway →
 * questions or an order inside the mandate. Re-planning is deterministic, so an
 * answer is applied by recording an override and running the pipeline again.
 */
import type { Constraints, EventSpec, FiredRule, Mandate, Need, Plan, PlanLine, Question, Quote, SingleRequest, BaseUnit, Candidate } from "@aimo/contracts";
import { getDb, getJson, allJson, kvGet } from "../db.js";
import { now, nowIso } from "../clock.js";
import { getProduct } from "../catalog.js";
import { fire, resolveOutcome } from "../rules/catalogue.js";
import { reliabilityRules, CLAIM_LABEL, allergenName } from "../rules/checks.js";
import { audit, AGENT } from "../audit.js";
import { newId, round2, eur, fmtHelsinki, isoDate } from "../util.js";
import { gw, GatewayError } from "./gatewayClient.js";
import { shortlist, rankNeed, packRound, verdictOf, type Pool } from "./match.js";
import { toBase, quantitySanity, checkSingle } from "./parse.js";
import { buildQuestions, expireOpenQuestions, openQuestionsForPlan } from "./questions.js";
import { recallSubstitute } from "./memory.js";

export const HOTEL_ID = "hotel-aurora";

export type Overrides = {
  confirmed: string[]; // "needId:productId" the chef confirmed (type or substitute)
  excluded: string[]; // "needId:productId" the chef ruled out
  removedNeeds: string[];
  keepShort: boolean;
  approvedSoft: string[]; // agent-side approver items already decided, by fingerprint
  stockContinued?: string[]; // D31: products the person chose to continue with despite unconfirmed stock
  stockDecidedBy?: string;
  useConfirmed?: boolean; // urgent need: the person chose the split across confirmed stock instead
  stockBlind?: boolean; // a change to a placed order rescales the same products; stock is the final check's job
  accepted?: boolean; // single request: the person approved adding the proposed products to the quote
  chosen?: string[]; // "needId:productId" the person picked from the alternatives
};
export type StoredPlan = Plan & { overrides: Overrides; event?: EventSpec | null; questionsAnswered: number };

export const emptyOverrides = (): Overrides => ({ confirmed: [], excluded: [], removedNeeds: [], keepShort: false, approvedSoft: [], stockContinued: [], useConfirmed: false });

export function mandate(): Mandate {
  return getJson<Mandate>("mandates", HOTEL_ID, "hotel_id")!;
}

export function savePlan(p: StoredPlan) {
  getDb()
    .prepare("INSERT INTO plans (id, event_id, json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, event_id = excluded.event_id")
    .run(p.id, p.eventId, JSON.stringify(p), p.createdAt);
}
export function getPlan(id: string): StoredPlan | null {
  return getJson<StoredPlan>("plans", id);
}
export function listPlans(): StoredPlan[] {
  return allJson<StoredPlan>("SELECT json FROM plans ORDER BY created_at DESC");
}

// ---------- dates (NEEDED-BY, URGENCY-CHECK) ----------

const addDays = (d: string, n: number) => isoDate(new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000));
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Step back for prep and thawing, then back to an agreed delivery day (Q04.3, Q04.4). */
export function neededBy(serviceDate: string, frozen: boolean, m: Mandate): { date: string; rules: FiredRule[] } {
  const original = addDays(serviceDate, frozen ? -2 : -1);
  let d = original;
  for (let i = 0; i < 10 && (!m.deliveryDays.includes(weekday(d)) || m.holidays.includes(d)); i++) d = addDays(d, -1);
  return { date: d, rules: d !== original ? [fire("DLV-04", { neededBy: d, original })] : [] };
}

/** Align a single request's date to a delivery day, without moving it earlier than asked. */
function alignSingle(date: string, m: Mandate): string {
  let d = date;
  for (let i = 0; i < 10 && (!m.deliveryDays.includes(weekday(d)) || m.holidays.includes(d)); i++) d = addDays(d, -1);
  return d;
}

export const isUrgentDate = (d: string | null) => (d ? (new Date(`${d}T00:00:00Z`).getTime() - now().getTime()) / 86_400_000 <= 4 : false);

// ---------- needs ----------

function emptyNeed(partial: Partial<Need> & Pick<Need, "id" | "label" | "text" | "groupId" | "groupLabel" | "outletId" | "amount" | "constraints" | "query">): Need {
  return {
    dishId: null, dishName: null, ingredientId: null, guests: null, perPortion: null, pinnedProductId: null, productType: null, category: null, neededBy: null, frozen: false,
    candidates: [], candidateCount: 0, excluded: [], rules: [], judgements: [], substituteFor: null, ...partial,
  };
}

export function needsFromSingle(r: SingleRequest): Need[] {
  return r.lines
    .filter((l) => l.quantity && l.quantity.amount > 0)
    .map((l) => {
      const base = toBase(l.quantity!);
      const claims = l.constraints.claims.map((c) => CLAIM_LABEL[c] ?? c);
      return emptyNeed({
        id: l.id,
        label: `${base.value} ${base.unit} ${[...claims, l.productType ?? l.query].join(" ")}`,
        text: l.text,
        groupId: "request",
        groupLabel: claims.length ? `${claims.join(", ")} request` : "this request",
        outletId: r.outletId,
        amount: base,
        constraints: l.constraints,
        query: l.query,
        productType: l.productType,
        category: l.category,
        pinnedProductId: l.productId,
        neededBy: r.neededBy,
      });
    });
}

/** Each diet group's lines are matched separately (Q03.3); regular guests never move to the diet product silently. */
export function needsFromEvent(e: EventSpec, m: Mandate, removed: string[]): Need[] {
  const out: Need[] = [];
  const dietTotal = e.dietGroups.reduce((s, g) => s + g.count, 0);
  const regular = Math.max(0, e.guests - dietTotal);
  for (const dish of e.dishes) {
    const groups = [
      { id: "regular", label: "No restrictions", count: regular, constraints: { claims: [], avoidAllergens: [], labels: [] } as Constraints },
      ...e.dietGroups.filter((g) => !dish.excludesGroups.includes(g.id)).map((g) => ({ id: g.id, label: g.label, count: g.count, constraints: g.constraints })),
    ];
    for (const ing of dish.ingredients) {
      for (const g of groups) {
        const id = `${dish.id}:${ing.id}:${g.id}`;
        if (removed.includes(id) || g.count <= 0) continue;
        // A fixed total belongs to the whole event, so it is one need, carried by the unrestricted group.
        if (ing.total && g.id !== "regular") continue;
        const pinnedId = ing.variants?.[g.id] ?? ing.productId ?? null;
        const pinned = pinnedId ? getProduct(pinnedId) : null;
        const frozen = Boolean(ing.frozen ?? pinned?.temperature === 7);
        const nb = neededBy(e.serviceDate, frozen, m);
        const amount = ing.total ? toBase(ing.total) : (() => {
          const pp = toBase(ing.perPortion ?? { amount: 0, unit: "pcs" });
          return { value: +(pp.value * g.count).toFixed(4), unit: pp.unit };
        })();
        const constraints: Constraints = {
          claims: [...new Set([...(g.constraints.claims ?? []), ...(ing.claims ?? [])])],
          avoidAllergens: g.constraints.avoidAllergens ?? [],
          labels: g.constraints.labels ?? [],
          origin: ing.origin ?? g.constraints.origin,
        };
        out.push(
          emptyNeed({
            id,
            label: `${ing.text} · ${dish.name}${ing.total ? "" : ` · ${g.label} (${g.count})`}`,
            text: ing.text,
            dishId: dish.id,
            dishName: dish.name,
            ingredientId: ing.id,
            groupId: g.id,
            groupLabel: `${g.label} guests`,
            guests: ing.total ? null : g.count,
            perPortion: ing.perPortion ?? null,
            outletId: dish.outletId,
            amount,
            constraints,
            query: ing.query ?? ing.text,
            category: ing.category ?? pinned?.category ?? null,
            productType: ing.productType ?? null,
            pinnedProductId: pinnedId,
            neededBy: nb.date,
            frozen,
            rules: [...nb.rules, ...(ing.perPortion ? quantitySanity(ing.text, ing.perPortion, g.count) : [])],
          }),
        );
      }
    }
  }
  return out;
}

// ---------- lines ----------

const lineKey = (productId: string, outletId: string) => `${productId}|${outletId}`;

function candidateRules(c: Candidate, need: Need): FiredRule[] {
  const p = getProduct(c.productId)!;
  return [...c.notes, ...reliabilityRules(p)];
}

/**
 * Months ahead: one pick per need, combined per product and outlet, rounded once.
 * Urgent: fill the need from real stock in rank order, then offer unknown stock
 * for the rest (AP-03, D23), unless the person chose to keep it short.
 */
function buildLines(needs: Need[], urgent: boolean, ov: Overrides, m: Mandate): { lines: PlanLine[]; shortfall: Plan["shortfall"] } {
  const lines: PlanLine[] = [];
  let shortfall: Plan["shortfall"] = null;
  const combined = new Map<string, { c: Candidate; needs: Need[]; value: number; unit: BaseUnit }>();
  for (const n of needs) {
    if (!n.candidates.length) {
      lines.push({
        id: `red:${n.id}`, needIds: [n.id], productId: null, productName: n.label, outletId: n.outletId, needAmount: n.amount, quantity: 0, packContent: null, overshoot: null,
        unitPrice: null, lineTotal: null, salesUnit: null, stock: null, availableDate: null, closingTime: null, reliability: null, source: null, verdict: "red", status: "not_available",
        rules: n.rules, rankStep: null, shares: [{ needId: n.id, label: n.label, amount: n.amount.value }], allocation: "short", riskAccepted: null, removed: false,
      });
      continue;
    }
    if (!urgent) {
      const c = n.candidates[0];
      const k = lineKey(c.productId, n.outletId);
      const e = combined.get(k) ?? { c, needs: [], value: 0, unit: n.amount.unit };
      e.needs.push(n);
      e.value += n.amount.value;
      combined.set(k, e);
      continue;
    }
    // Urgent (D32): the best-ranked product takes the whole need, even if its stock is unconfirmed;
    // the person is then asked whether to continue (D31), with the confirmed-stock split as the alternative.
    const best = n.candidates[0];
    if (best.stock.kind === "unknown" && !ov.useConfirmed && best.packContent && best.packContent.unit === n.amount.unit) {
      const packs = Math.ceil(n.amount.value / best.packContent.value - 1e-9);
      lines.push(makeLine(best, [n], n.amount.value, packs, n.amount.unit, "primary", m));
      continue;
    }
    // Otherwise fill from confirmed stock in rank order, then the best unconfirmed product for the rest.
    let remaining = n.amount.value;
    let covered = 0;
    for (const c of n.candidates) {
      if (remaining <= 1e-9) break;
      if (c.stock.kind !== "known" || !c.packContent || c.packContent.unit !== n.amount.unit || c.stock.amount <= 0) continue;
      const want = Math.ceil(remaining / c.packContent.value - 1e-9);
      const take = Math.min(want, Math.floor(c.stock.amount));
      if (take <= 0) continue;
      const got = take * c.packContent.value;
      lines.push(makeLine(c, [n], got >= remaining ? remaining : got, take, n.amount.unit, got >= remaining - 1e-9 ? "primary" : "partial", m));
      covered += Math.min(got, remaining);
      remaining -= got;
    }
    if (remaining > 1e-9) {
      shortfall = { need: n.amount.value, covered: round2(covered), unit: n.amount.unit };
      const unknown = n.candidates.find((c) => c.stock.kind === "unknown" && c.packContent && c.packContent.unit === n.amount.unit);
      if (unknown && !ov.keepShort && !ov.useConfirmed) {
        const packs = Math.ceil(remaining / unknown.packContent!.value - 1e-9);
        lines.push(makeLine(unknown, [n], remaining, packs, n.amount.unit, "unknown_fill", m));
      }
      if (covered > 0 || unknown) lines.forEach((l) => l.needIds.includes(n.id) && l.rules.push(fire("STK-02", { covered: `${round2(covered)} ${n.amount.unit}`, need: `${n.amount.value} ${n.amount.unit}`, short: `${round2(remaining)} ${n.amount.unit}` })));
      if (!lines.some((l) => l.needIds.includes(n.id)))
        lines.push({
          id: `red:${n.id}`, needIds: [n.id], productId: null, productName: n.label, outletId: n.outletId, needAmount: n.amount, quantity: 0, packContent: null, overshoot: null,
          unitPrice: null, lineTotal: null, salesUnit: null, stock: null, availableDate: null, closingTime: null, reliability: null, source: null, verdict: "red", status: "not_available",
          rules: [fire("STK-04", { product: n.label, quantity: n.amount.value, unit: n.amount.unit, stock: 0, date: n.neededBy ?? "" })], rankStep: null,
          shares: [{ needId: n.id, label: n.label, amount: n.amount.value }], allocation: "short", riskAccepted: null, removed: false,
        });
    }
  }
  for (const e of combined.values()) {
    const pm = packRound(e.c.name, e.value, e.unit, e.c, m.preAnswers);
    const l = makeLine(e.c, e.needs, e.value, pm.quantity, e.unit, "primary", m);
    l.overshoot = pm.overshoot;
    l.rules.push(...pm.rules);
    lines.push(l);
  }
  // Recompute verdicts after all rules are attached.
  for (const l of lines) Object.assign(l, verdictOf(l, urgent));
  return { lines, shortfall };
}

function makeLine(c: Candidate, needs: Need[], needValue: number, quantity: number, unit: BaseUnit, allocation: PlanLine["allocation"], m: Mandate): PlanLine {
  const rules: FiredRule[] = [];
  for (const n of needs) {
    rules.push(...n.rules.filter((r) => r.outcome !== "block" || r.facts.productId === c.productId));
    rules.push(...candidateRules(c, n));
    if (n.substituteFor && n.substituteFor !== c.productId) {
      const orig = getProduct(n.substituteFor);
      const remembered = recallSubstitute(n.dishId ?? "request", n.substituteFor, c.productId);
      if (remembered) rules.push(fire("SUB-02", { substitute: c.name, original: orig?.name ?? n.substituteFor, dish: n.dishName ?? "this request", by: remembered.by, at: fmtHelsinki(remembered.at, false) }));
      else rules.push(fire("SUB-01", { dish: n.dishName ?? "this request", substitute: c.name, original: orig?.name ?? n.substituteFor, needId: n.id, productId: c.productId }));
    }
    if (n.neededBy && c.availableDate && c.availableDate > n.neededBy) rules.push(fire("DLV-03", { product: c.name, available: c.availableDate, neededBy: n.neededBy }));
  }
  if (c.stock.kind === "unknown") rules.push(fire("STK-01", { product: c.name, productId: c.productId, reason: c.stock.reason === "terminal_sentinel" ? "Terminal product, ships from the supplier" : "stock placeholder value" }));
  else if (allocation === "primary" && needs.every((n) => !isUrgentDate(n.neededBy))) rules.push(fire("STK-05", { product: c.name, stock: c.stock.kind === "known" ? `${c.stock.amount} ${c.salesUnit ?? ""}` : "none" }));
  const dedup = [...new Map(rules.map((r) => [`${r.ruleId}|${JSON.stringify(r.facts)}`, r])).values()];
  const prod = getProduct(c.productId);
  const massKg = c.packContent && c.packContent.unit !== "pcs" ? c.packContent.value * quantity : null;
  const lineTotal = c.unitPrice === null ? null : round2(c.unitPrice * quantity);
  return {
    id: `${c.productId}|${needs[0].outletId}|${allocation}`,
    needIds: needs.map((n) => n.id),
    productId: c.productId,
    productName: c.name,
    outletId: needs[0].outletId,
    needAmount: { value: round2(needValue), unit },
    quantity,
    packContent: c.packContent,
    overshoot: null,
    unitPrice: c.unitPrice,
    lineTotal,
    salesUnit: c.salesUnit,
    stock: c.stock,
    availableDate: c.availableDate,
    closingTime: c.closingTime,
    reliability: c.reliability,
    source: c.source,
    verdict: "green",
    status: "covered",
    rules: dedup,
    rankStep: c.rankStep,
    shares: needs.map((n) => ({ needId: n.id, label: n.label, amount: round2(n.amount.value) })),
    allocation,
    riskAccepted: null,
    removed: false,
    co2Kg: prod?.co2KgPerKg != null && massKg !== null ? round2(prod.co2KgPerKg * massKg) : null,
  };
}

// ---------- the pipeline ----------

export async function runPipeline(plan: StoredPlan): Promise<StoredPlan> {
  const t0 = performance.now();
  const m = mandate();
  const ov = plan.overrides;
  let needs: Need[];
  if (plan.kind === "single") {
    needs = needsFromSingle(plan.request!);
  } else {
    const e = plan.event!;
    needs = needsFromEvent(e, m, ov.removedNeeds);
    const dietTotal = e.dietGroups.reduce((s, g) => s + g.count, 0);
    plan.inputRules = [];
    if (dietTotal > e.guests) plan.inputRules.push(fire("DIET-03", { dietTotal, guests: e.guests }));
    if (!e.guests) plan.inputRules.push(fire("REQ-06", { event: e.name }));
    if (!e.dietsConfirmed) plan.inputRules.push(fire("REQ-05", { event: e.name }));
  }
  needs = needs.filter((n) => !ov.removedNeeds.includes(n.id));
  // Shortlist every need, then one batched lookup for the whole plan (VA-13).
  const lists = new Map(needs.map((n) => [n.id, shortlist(n)]));
  const ids = [...new Set([...lists.values()].flat().map((p) => p.id))];
  const dates = needs.map((n) => n.neededBy).filter((d): d is string => Boolean(d)).sort();
  const deliveryDate = plan.kind === "single" ? (plan.request!.neededBy ? alignSingle(plan.request!.neededBy, m) : null) : dates[0] ?? null;
  plan.deliveryDate = deliveryDate;
  plan.neededBy = plan.kind === "single" ? plan.request!.neededBy : dates[0] ?? null;
  plan.urgent = plan.kind === "single" ? isUrgentDate(deliveryDate) : isUrgentDate(dates[0] ?? null);
  const pool: Pool = new Map();
  const tLookup = performance.now();
  if (ids.length && deliveryDate) {
    const r = await gw.lookup(ids, deliveryDate);
    for (const l of r.lines) pool.set(l.productId, l);
    if (r.fallback) plan.note = r.fallback;
  }
  for (const n of needs) {
    n.rules = n.rules.filter((r) => r.ruleId === "DLV-04" || r.ruleId === "QTY-02");
    const list = lists.get(n.id)!.filter((p) => !ov.excluded.includes(`${n.id}:${p.id}`));
    await rankNeed(n, list, pool, { lockedOk: ov.stockBlind, deliveryDays: m.deliveryDays, holidays: m.holidays });
    // A chef's confirmation removes the type question for that product.
    for (const c of n.candidates) if (ov.confirmed.includes(`${n.id}:${c.productId}`)) c.notes = c.notes.filter((r) => r.ruleId !== "TYP-01");
    // An alternative the person picked goes first, so it fills the line.
    const pick = n.candidates.find((c) => (ov.chosen ?? []).includes(`${n.id}:${c.productId}`));
    if (pick) n.candidates = [pick, ...n.candidates.filter((c) => c !== pick)];
  }
  const tRank = performance.now();
  plan.needs = needs;
  // One date for the whole plan: the latest of the needs' earliest dates, so every late need fits.
  const late = needs.filter((n) => n.rules.some((r) => r.ruleId === "DLV-06"));
  const earliest = late.map((n) => n.earliestDelivery).filter((d): d is string => Boolean(d)).sort();
  plan.tooLate = late.length ? { neededBy: late[0].neededBy!, earliest: earliest.length === late.length ? earliest[earliest.length - 1] : null } : null;
  const built = buildLines(needs, plan.urgent && !ov.stockBlind, ov, m);
  for (const l of built.lines) {
    if (l.productId && l.needIds.every((id) => ov.confirmed.includes(`${id}:${l.productId}`))) l.rules = l.rules.filter((r) => r.ruleId !== "SUB-01" && r.ruleId !== "TYP-01");
    Object.assign(l, verdictOf(l, plan.urgent));
  }
  plan.lines = built.lines;
  plan.shortfall = built.shortfall;
  plan.usesFixtures = built.lines.some((l) => l.source === "fixture");
  const tEnd = performance.now();
  plan.timings = { products: ids.length, lookupMs: Math.round(tRank - tLookup), rankMs: Math.round(tEnd - tRank), totalMs: Math.round(tEnd - t0) };
  for (const n of needs.filter((x) => x.judgements.length)) audit({
    actor: AGENT, action: "model_judgement", summary: `Type check for ${n.label}: ${n.judgements.length} products judged`, eventId: plan.eventId,
    judgements: n.judgements, details: { planId: plan.id, needId: n.id }, visibility: "hotel",
  });
  return plan;
}

/** Scene 1: verdicts only. No stock counts months ahead and no quote is made (D7, D8). */
export async function viability(plan: StoredPlan): Promise<StoredPlan> {
  plan.stage = "viability";
  await runPipeline(plan);
  plan.status = "viability";
  plan.summary = verdictSummary(plan);
  for (const l of plan.lines)
    audit({ actor: AGENT, action: "line_verdict_set", summary: `${l.productName}: ${l.verdict}`, eventId: plan.eventId, ruleIds: l.rules.map((r) => r.ruleId), details: { planId: plan.id, status: l.status, dishes: l.shares.map((s) => s.label) }, usesFixture: l.source === "fixture", visibility: "hotel" });
  savePlan(plan);
  return plan;
}

export function verdictSummary(p: Plan): string {
  const live = p.lines.filter((l) => !l.removed);
  const red = live.filter((l) => l.verdict === "red").length;
  const amber = live.filter((l) => l.verdict === "amber").length;
  const green = live.filter((l) => l.verdict === "green").length;
  return `${green} green, ${amber} amber, ${red} red`;
}

/** Scene 2 and every request: quote at the gateway, then ask or order. */
export async function quoteAndDecide(plan: StoredPlan, personToken?: string): Promise<StoredPlan> {
  plan.stage = "order";
  plan.error = null;
  plan.proposal = false;
  if (plan.kind === "single") {
    plan.inputRules = checkSingle(plan.request!);
    if (plan.inputRules.length) {
      plan.status = "needs_input";
      plan.summary = plan.inputRules.map((r) => r.message).join(" ");
      audit({ actor: AGENT, action: "constraint_asked", summary: plan.summary, ruleIds: plan.inputRules.map((r) => r.ruleId), details: { planId: plan.id }, visibility: "hotel" });
      savePlan(plan);
      return plan;
    }
  }
  await runPipeline(plan);
  if (plan.inputRules.some((r) => r.outcome === "block" || r.ruleId === "REQ-05" || r.ruleId === "REQ-06")) {
    plan.status = "needs_input";
    plan.summary = plan.inputRules.map((r) => r.message).join(" ");
    savePlan(plan);
    return plan;
  }
  expireOpenQuestions(plan.id, "replaced");
  if (plan.tooLate) {
    const t = plan.tooLate;
    plan.status = "blocked";
    plan.quoteId = null;
    plan.summary = t.earliest ? `No products available for delivery in time. Earliest delivery: ${fmtHelsinki(`${t.earliest}T12:00:00Z`, false)}.` : "No products available for delivery in time.";
    audit({ actor: AGENT, action: "line_verdict_set", summary: `Not in time: needed by ${t.neededBy}, earliest ${t.earliest ?? "unknown"}`, eventId: plan.eventId, ruleIds: ["DLV-06"], details: { planId: plan.id, ...t }, visibility: "hotel" });
    savePlan(plan);
    return plan;
  }
  const live = plan.lines.filter((l) => !l.removed);
  const red = live.filter((l) => l.verdict === "red");
  // Q05.3: an order can't go in while a line is blocked. The chef fixes or removes it first.
  if (red.length) {
    plan.status = "blocked";
    plan.quoteId = null;
    plan.summary = `Blocked · ${red.length} line${red.length > 1 ? "s" : ""}`;
    audit({ actor: AGENT, action: "line_verdict_set", summary: `Blocked: ${plan.summary}`, eventId: plan.eventId, ruleIds: red.flatMap((l) => l.rules.map((r) => r.ruleId)), details: { planId: plan.id }, visibility: "hotel" });
    savePlan(plan);
    return plan;
  }
  const orderable = live.filter((l) => l.productId && l.quantity > 0);
  if (!orderable.length) {
    plan.status = "blocked";
    plan.summary = "Nothing left to order.";
    savePlan(plan);
    return plan;
  }
  const requiresFor = (l: PlanLine): Constraints => {
    const ns = plan.needs.filter((n) => l.needIds.includes(n.id));
    return { claims: [...new Set(ns.flatMap((n) => n.constraints.claims))], avoidAllergens: [...new Set(ns.flatMap((n) => n.constraints.avoidAllergens))], labels: [] };
  };
  let quote: Quote;
  try {
    quote = await gw.quote({
      siteId: plan.siteId,
      deliveryDate: plan.deliveryDate!,
      eventId: plan.eventId ?? undefined,
      lines: orderable.map((l) => ({ productId: l.productId!, quantity: l.quantity, outletId: l.outletId, ref: l.id, requires: requiresFor(l) })),
    });
  } catch (e) {
    plan.status = "failed";
    plan.error = e instanceof GatewayError ? e.body.message : (e as Error).message;
    plan.summary = "Price check failed · nothing ordered";
    savePlan(plan);
    return plan;
  }
  plan.quoteId = quote.id;
  plan.fingerprint = quote.fingerprint;
  plan.totalExVat = quote.totalExVat;
  plan.totalVat = quote.totalVat;
  plan.approvalsNeeded = quote.mandateCheck.approvalsNeeded;
  // Gateway facts win: copy the quoted price and the gateway's own rules onto each line.
  for (const ql of quote.lines) {
    const l = plan.lines.find((x) => x.id === ql.ref);
    if (!l) continue;
    l.unitPrice = ql.unitPrice;
    l.lineTotal = ql.lineTotal;
    for (const r of ql.rules) if (!l.rules.some((x) => x.ruleId === r.ruleId)) l.rules.push(r);
    Object.assign(l, verdictOf(l, plan.urgent));
  }
  for (const r of quote.mandateCheck.rules) if (!plan.inputRules.some((x) => x.ruleId === r.ruleId)) plan.inputRules.push(r);
  if (quote.outcome === "block") {
    plan.status = "blocked";
    plan.summary = "Blocked";
    savePlan(plan);
    return plan;
  }
  // A single request stops here until the person approves adding the products to the quote.
  if (plan.kind === "single" && !plan.overrides.accepted) {
    plan.status = "waiting";
    plan.proposal = true;
    plan.summary = "Ready to add to the quote";
    savePlan(plan);
    return plan;
  }
  const questions = buildQuestions(plan, quote);
  plan.questionIds = questions.map((q) => q.id);
  if (!questions.length) {
    savePlan(plan);
    return placeFromPlan(plan, undefined);
  }
  plan.status = "waiting";
  plan.summary = `Waiting · ${questions.length} question${questions.length > 1 ? "s" : ""}`;
  savePlan(plan);
  return plan;
}

/** ORDER-PLACE from the hotel side, with the plan's idempotency key, so a retry is one order. */
export async function placeFromPlan(plan: StoredPlan, approvalId: string | undefined): Promise<StoredPlan> {
  try {
    const continued = [...new Set(plan.lines.filter((l) => l.productId && l.stock?.kind === "unknown" && (plan.overrides.stockContinued ?? []).includes(l.productId)).map((l) => l.productId!))];
    const o = await gw.order(plan.quoteId!, plan.idemKey, approvalId, continued, plan.overrides.stockDecidedBy);
    plan.orderIds = [...new Set([...plan.orderIds, o.id])];
    plan.status = "ordered";
    plan.approvalId = approvalId ?? null;
    for (const l of plan.lines) {
      const ol = o.lines.find((x) => x.ref === l.id);
      if (ol?.riskAccepted) {
        l.riskAccepted = ol.riskAccepted;
        l.status = "covered_at_risk";
      }
    }
    const atRisk = plan.lines.filter((l) => l.riskAccepted).length;
    plan.summary = `Ordered · ${eur(o.totalExVat)}${atRisk ? ` · ${atRisk} at risk` : ""}${plan.shortfall && plan.overrides.keepShort ? ` · ${plan.shortfall.covered} of ${plan.shortfall.need} ${plan.shortfall.unit}` : ""}`;
    if (plan.overrides.keepShort && plan.shortfall) plan.status = "kept_short";
  } catch (e) {
    if (e instanceof GatewayError && e.body.error === "quote_stale") {
      audit({ actor: AGENT, action: "order_refused", summary: `Terms changed at commit; re-quoting. ${e.body.message}`, eventId: plan.eventId, details: { planId: plan.id, changes: e.body.changes }, visibility: "hotel" });
      plan.idemKey = newId("idem");
      savePlan(plan);
      return quoteAndDecide(plan);
    }
    plan.status = e instanceof GatewayError && e.body.error === "mandate_violation" ? "waiting" : "failed";
    plan.error = e instanceof GatewayError ? `${e.body.error}: ${e.body.message}` : (e as Error).message;
    plan.summary = "Refused by the gateway";
  }
  savePlan(plan);
  return plan;
}

export function newPlan(kind: "single" | "event", by: { personId: string; name: string }, outletId: string, extra: Partial<StoredPlan>): StoredPlan {
  const m = mandate();
  return {
    id: newId("plan"), kind, eventId: null, title: "", createdAt: nowIso(), createdBy: by, siteId: m.sites[0].id, outletId, neededBy: null, deliveryDate: null, urgent: false,
    stage: "order", status: "needs_input", request: null, inputRules: [], needs: [], lines: [], quoteId: null, fingerprint: null, totalExVat: null, approvalsNeeded: [],
    approvalId: null, orderIds: [], idemKey: newId("idem"), usesFixtures: false, note: null, summary: "", questionIds: [], shortfall: null, tooLate: null, error: null,
    overrides: emptyOverrides(), event: null, questionsAnswered: 0, ...extra,
  };
}

export function planQuestions(planId: string): Question[] {
  return openQuestionsForPlan(planId);
}
export { allergenName };
