/**
 * Events through the four scenes (D4, D8): viability months ahead, the order,
 * the change ~2–3 weeks out and the final check before the cut-off. Chunk 07:
 * ORDER-DIFF, CHANGE-APPLY, ALLERGY-RECHECK, FINAL-CHECK, SHORTFALL-RESOLVE,
 * SUBSTITUTE-FIND, SILENCE-RESOLVE, COVERAGE-SUMMARY. EDIT-GUARD for events.
 */
import type { EventSpec, Order, Question, WarningRecord, DietGroup, Need, BaseUnit } from "@aimo/contracts";
import { getDb, getJson, allJson } from "../db.js";
import { now, nowIso } from "../clock.js";
import { getProduct } from "../catalog.js";
import { audit, AGENT, decisionCount } from "../audit.js";
import { fire } from "../rules/catalogue.js";
import { dietRules, allergenName, packContent } from "../rules/checks.js";
import { typeCheck } from "./judge.js";
import { newId, round2, fmtHelsinki, parseAimoTime, eur, shortName } from "../util.js";
import { gw, GatewayError } from "./gatewayClient.js";
import { makeQuestion, saveQuestion, allQuestions } from "./questions.js";
import { newPlan, quoteAndDecide, viability, savePlan, getPlan, runPipeline, mandate, type StoredPlan, emptyOverrides } from "./plan.js";
import { recallSubstitute } from "./memory.js";
import { specCompare } from "./sidebyside.js";
import type { Person } from "../identity.js";

export type StoredEvent = EventSpec & {
  version: number;
  removedNeeds: string[];
  viabilityPlanId: string | null;
  orderPlanId: string | null;
  orderedGuests: number | null;
  lastDiff: DiffLine[] | null;
  finalCheck: { at: string; summary: string; lines: { productId: string; productName: string; result: string; detail: string }[] } | null;
  changes: { at: string; by: string; what: string }[];
};
export type DiffLine = { productId: string; productName: string; outletId: string; was: number; now: number; unit: string | null; change: "added" | "removed" | "up" | "down" | "unchanged" | "needs_substitute" };

export class EditConflict extends Error {
  constructor(public current: StoredEvent) {
    super("The event changed since you opened it");
  }
}

export const getEvent = (id: string) => getJson<StoredEvent>("events", id);
export const listEvents = () => allJson<StoredEvent>("SELECT json FROM events ORDER BY id");
export function saveEvent(e: StoredEvent) {
  getDb().prepare("INSERT INTO events (id, json, version) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, version = excluded.version").run(e.id, JSON.stringify(e), e.version);
}

/** EDIT-GUARD (TM-07): an edit made against an old version is refused with what changed. */
export function editEvent(id: string, baseVersion: number, by: string, what: string, mutate: (e: StoredEvent) => void): StoredEvent {
  const e = getEvent(id);
  if (!e) throw new Error("No such event");
  if (e.version !== baseVersion) throw new EditConflict(e);
  mutate(e);
  e.version += 1;
  e.changes.push({ at: nowIso(), by, what });
  saveEvent(e);
  return e;
}

const by = (p: Person) => ({ personId: p.id, name: p.name });

// ---------- scene 1 and 2 ----------

export async function runViability(eventId: string, p: Person) {
  const e = getEvent(eventId)!;
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds } });
  await viability(plan);
  e.viabilityPlanId = plan.id;
  saveEvent(e);
  return plan;
}

export async function orderEvent(eventId: string, p: Person) {
  const e = getEvent(eventId)!;
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds } });
  audit({ actor: personActor(p), action: "request_received", summary: `${p.name} asked to order ${e.name}`, eventId, details: { kind: "confirmation", planId: plan.id }, visibility: "hotel" });
  await quoteAndDecide(plan);
  e.orderPlanId = plan.id;
  e.orderedGuests = e.guests;
  saveEvent(e);
  return plan;
}

/** Remove a red line for one group: the chef fixes or removes it before ordering (Q05.3). */
export function removeNeed(eventId: string, needId: string, baseVersion: number, p: Person) {
  return editEvent(eventId, baseVersion, p.name, `Removed ${needId}`, (e) => {
    if (!e.removedNeeds.includes(needId)) e.removedNeeds.push(needId);
  });
}

export const personActor = (p: Person) => ({ kind: "person" as const, id: p.id, name: p.name, role: p.role, outletId: p.outlets[0] ?? null, testSession: true });

// ---------- scene 3: changes ----------

function orderedLines(e: StoredEvent): { order: Order; plan: StoredPlan } | null {
  const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
  return plan ? ({ plan, order: null as unknown as Order }) : null;
}

async function currentOrders(eventId: string): Promise<Order[]> {
  return (await gw.orders(eventId)).orders;
}

/** ORDER-DIFF: per product and outlet, compared by product ID. */
export function orderDiff(order: Order, plan: StoredPlan): DiffLine[] {
  const out: DiffLine[] = [];
  const next = new Map<string, { qty: number; name: string; unit: string | null; red: boolean }>();
  for (const l of plan.lines.filter((x) => !x.removed)) {
    if (!l.productId) {
      for (const n of l.needIds) out.push({ productId: n, productName: l.productName, outletId: l.outletId, was: 0, now: 0, unit: null, change: "needs_substitute" });
      continue;
    }
    const k = `${l.productId}|${l.outletId}`;
    const prev = next.get(k);
    next.set(k, { qty: (prev?.qty ?? 0) + l.quantity, name: l.productName, unit: l.salesUnit, red: l.verdict === "red" });
  }
  const seen = new Set<string>();
  for (const ol of order.lines.filter((x) => !x.removed)) {
    const k = `${ol.productId}|${ol.outletId}`;
    seen.add(k);
    const n = next.get(k);
    const nowQ = n?.qty ?? 0;
    out.push({ productId: ol.productId, productName: ol.productName, outletId: ol.outletId, was: ol.quantity, now: nowQ, unit: ol.salesUnit, change: nowQ === ol.quantity ? "unchanged" : nowQ === 0 ? "removed" : nowQ > ol.quantity ? "up" : "down" });
  }
  for (const [k, n] of next) if (!seen.has(k)) {
    const [productId, outletId] = k.split("|");
    out.push({ productId, productName: n.name, outletId, was: 0, now: n.qty, unit: n.unit, change: "added" });
  }
  return out;
}

/** CHANGE-APPLY (AP-08): inside the hotel's tolerance, amend with no human; otherwise one Approver question. */
export async function changeGuests(eventId: string, guests: number, baseVersion: number, p: Person) {
  const before = getEvent(eventId)!;
  const e = editEvent(eventId, baseVersion, p.name, `Guests ${before.guests} → ${guests}`, (x) => {
    x.guests = guests;
  });
  return applyChange(e, p, `Guests ${before.guests} → ${guests}`);
}

async function applyChange(e: StoredEvent, p: Person, what: string) {
  const m = mandate();
  const orders = await currentOrders(e.id);
  const order = orders.find((o) => o.state !== "rejected");
  const plan = newPlan("event", by(p), e.dishes[0]?.outletId ?? "banquet", { eventId: e.id, title: e.name, event: e, overrides: { ...emptyOverrides(), removedNeeds: e.removedNeeds } });
  await runPipeline(plan);
  savePlan(plan);
  if (!order) {
    e.lastDiff = null;
    saveEvent(e);
    return { applied: false, reason: "No order placed yet; the next order uses the new numbers.", diff: [] as DiffLine[] };
  }
  const diff = orderDiff(order, plan);
  e.lastDiff = diff;
  saveEvent(e);
  const base = e.orderedGuests ?? e.guests;
  const pct = base ? ((e.guests - base) / base) * 100 : 100;
  const changes = diff.filter((d) => d.change !== "unchanged" && d.change !== "needs_substitute").map((d) => ({ productId: d.productId, outletId: d.outletId, quantity: d.now }));
  const facts = { from: base, to: e.guests, pct: `${pct >= 0 ? "+" : ""}${round2(pct)}%`, tolerance: `±${m.preAnswers.guestChangeMaxPct}%` };
  if (!changes.length) {
    audit({ actor: AGENT, action: "order_amended", summary: `${what}: pack rounding means no line changes`, eventId: e.id, ruleIds: ["CHG-01"], details: { diff }, visibility: "hotel" });
    return { applied: true, reason: "No change: pack rounding absorbs it.", diff };
  }
  const within = Math.abs(pct) <= m.preAnswers.guestChangeMaxPct && !diff.some((d) => d.change === "needs_substitute");
  if (within) {
    try {
      const r = await gw.amend(order.id, { changes });
      e.orderedGuests = e.guests;
      saveEvent(e);
      audit({ actor: AGENT, action: "order_amended", summary: fire("CHG-01", facts).message, eventId: e.id, orderId: order.id, ruleIds: ["CHG-01"], details: { diff, version: r.order.version }, visibility: "hotel" });
      return { applied: true, reason: fire("CHG-01", facts).message, diff };
    } catch (err) {
      if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation") throw err;
      // Falls through to a question: the gateway needs an approval for this amendment.
    }
  }
  const q = makeQuestion({
    planId: plan.id, eventId: e.id, type: "change_outside_tolerance", forRole: "approver", outletId: null, quoteId: null, fingerprint: null,
    title: `${facts.from} → ${facts.to} guests?`,
    body: `${facts.pct} · ${within ? "needs approval at the gateway" : `over ${facts.tolerance}`} · ${diff.filter((d) => d.change !== "unchanged").length} lines change`,
    facts: { kind: "change", orderId: order.id, changes, diff, ...facts },
    ruleIds: [within ? "CHG-01" : "CHG-02"],
    options: [{ id: "approve", label: "Approve the change", primary: true }, { id: "keep", label: "Keep the order as is", primary: false }],
    deadline: earliestCutoff(order),
  });
  saveQuestion(q);
  audit({ actor: AGENT, action: "question_asked", summary: `Approver asked: ${q.title}`, eventId: e.id, questionId: q.id, ruleIds: q.ruleIds, details: { diff }, visibility: "hotel" });
  return { applied: false, reason: q.body, diff, questionId: q.id };
}

function earliestCutoff(o: Order): string | null {
  const t = o.lines.filter((l) => !l.removed).map((l) => parseAimoTime(l.closingTime)?.getTime()).filter((x): x is number => typeof x === "number" && x > now().getTime());
  return t.length ? new Date(Math.min(...t)).toISOString() : null;
}

export async function answerChange(q: Question, p: Person, token: string) {
  const f = q.facts as any;
  const e = getEvent(q.eventId!)!;
  if (q.answer === "keep") {
    audit({ actor: personActor(p), action: "order_amended", summary: `${p.name} kept the order as is (${f.from} guests ordered, event now ${f.to})`, eventId: e.id, ruleIds: ["CHG-02"], details: {}, visibility: "hotel" });
    return;
  }
  try {
    await gw.amend(f.orderId, { changes: f.changes });
  } catch (err) {
    if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation" || !err.body.newQuoteId) throw err;
    const nq = await gw.getQuote(err.body.newQuoteId);
    const a = await gw.approve(token, nq.id, nq.fingerprint, nq.mandateCheck.approvalsNeeded);
    await gw.amend(f.orderId, { changes: f.changes, approvalId: a.id });
  }
  e.orderedGuests = e.guests;
  saveEvent(e);
}

// ---------- late allergy (CH-13, D28) ----------

export const warnings = (eventId?: string) => allJson<WarningRecord>("SELECT json FROM warnings ORDER BY rowid").filter((w) => !eventId || w.eventId === eventId);
function saveWarning(w: WarningRecord) {
  getDb().prepare("INSERT INTO warnings (id, event_id, state, json) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state, json = excluded.json").run(w.id, w.eventId, w.state, JSON.stringify(w));
}

/** ALLERGY-RECHECK: warn at once; never remove a line by itself (D28). */
export async function addDietGroup(eventId: string, group: DietGroup, baseVersion: number, p: Person) {
  const e = editEvent(eventId, baseVersion, p.name, `Added ${group.label} (${group.count})`, (x) => {
    x.dietGroups.push(group);
  });
  const orders = await currentOrders(eventId);
  const created: WarningRecord[] = [];
  for (const o of orders) {
    for (const l of o.lines.filter((x) => !x.removed)) {
      const prod = getProduct(l.productId);
      if (!prod) continue;
      // Diet groups don't overlap (Q01.4): the new group's guests came out of the unrestricted guests,
      // so only lines that serve unrestricted guests in a dish this group eats can conflict.
      const dishes = e.dishes.filter((d) => !d.excludesGroups.includes(group.id) && orderPlanServes(e, l.productId, d.id));
      if (!dishes.length) continue;
      const fails = dietRules(prod, group.constraints, group.label).filter((r) => r.outcome === "block");
      if (!fails.length) continue;
      const allergen = String(fails[0].facts.allergen ?? group.label);
      const text = `${shortName(prod.name)} ${fails[0].ruleId === "ALG-01" ? `contains ${allergen}` : fails[0].ruleId === "ALG-02" ? `may contain ${allergen}` : "has no allergen data"}. ${group.count} guests must avoid it. Still in the order.`;
      const w: WarningRecord = { id: newId("warn"), eventId, kind: "allergy", text, productId: l.productId, productName: prod.name, allergen, groupId: group.id, count: group.count, orderId: o.id, state: "open", resolvedBy: null, resolution: null, createdAt: nowIso() };
      saveWarning(w);
      created.push(w);
      const q = makeQuestion({
        planId: e.orderPlanId ?? "none", eventId, type: "allergy_conflict", forRole: "chef", outletId: l.outletId, quoteId: null, fingerprint: null,
        title: `Allergy: ${shortName(prod.name)}`, body: `${fails[0].ruleId === "ALG-01" ? `Contains ${allergen}` : fails[0].ruleId === "ALG-02" ? `May contain ${allergen}` : "No allergen data"} · ${group.count} guests · still in the order`,
        facts: { kind: "allergy", warningId: w.id, orderId: o.id, productId: l.productId, outletId: l.outletId, groupId: group.id, dishes: dishes.map((d) => d.id), dishNames: dishes.map((d) => d.name) },
        ruleIds: ["ALG-10", fails[0].ruleId], deadline: l.closingTime ? parseAimoTime(l.closingTime)!.toISOString() : null,
        options: [{ id: "remove", label: "Remove the line", primary: false }, { id: "other_dish", label: "Give these guests another dish", primary: true }],
      });
      saveQuestion(q);
      audit({ actor: AGENT, action: "allergy_warning", summary: text, eventId, orderId: o.id, questionId: q.id, ruleIds: ["ALG-10", fails[0].ruleId], details: { productId: l.productId, guests: group.count }, visibility: "hotel" });
    }
  }
  return { event: getEvent(eventId)!, warnings: created };
}

function orderPlanServes(e: StoredEvent, productId: string, dishId: string): boolean {
  const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
  if (!plan) return false;
  return plan.lines.some((l) => l.productId === productId && l.needIds.some((n) => n.startsWith(`${dishId}:`) && n.endsWith(":regular")));
}

export async function answerAllergy(q: Question, p: Person) {
  const f = q.facts as any;
  const w = warnings(q.eventId!).find((x) => x.id === f.warningId);
  if (!w || w.state === "resolved") return;
  const e = getEvent(q.eventId!)!;
  if (q.answer === "remove") {
    await gw.amend(f.orderId, { changes: [{ productId: f.productId, outletId: f.outletId, quantity: 0 }] });
    w.resolution = "Line removed from the order";
  } else {
    editEvent(e.id, e.version, p.name, `${w.count} guests (${f.groupId}) get another dish instead of ${(f.dishNames ?? []).join(", ")}`, (x) => {
      for (const d of x.dishes) if (f.dishes.includes(d.id) && !d.excludesGroups.includes(f.groupId)) d.excludesGroups.push(f.groupId);
    });
    w.resolution = `These ${w.count} guests get another dish; the line stays for everyone else`;
  }
  w.state = "resolved";
  w.resolvedBy = p.name;
  saveWarning(w);
  audit({ actor: personActor(p), action: "allergy_resolved", summary: `${w.productName}: ${w.resolution}`, eventId: e.id, orderId: f.orderId, ruleIds: ["ALG-10"], details: {}, visibility: "hotel" });
}

// ---------- scene 4: final check ----------

/** FINAL-CHECK: lookup, stock, cut-off and price validity for every ordered line. */
export async function finalCheck(eventId: string) {
  const e = getEvent(eventId)!;
  const orders = (await currentOrders(eventId)).filter((o) => o.state !== "rejected");
  const plan = e.orderPlanId ? getPlan(e.orderPlanId) : null;
  const results: NonNullable<StoredEvent["finalCheck"]>["lines"] = [];
  const m = mandate();
  for (const o of orders) {
    const live = o.lines.filter((l) => !l.removed);
    let fresh;
    try {
      fresh = await gw.lookup(live.map((l) => l.productId), o.deliveryDate);
    } catch (err) {
      e.finalCheck = { at: nowIso(), summary: `Check failed, retrying. Nothing is marked covered.`, lines: [] };
      saveEvent(e);
      return e.finalCheck;
    }
    for (const l of live) {
      const f = fresh.lines.find((x) => x.productId === l.productId)!;
      const name = l.productName;
      const cut = parseAimoTime(f.closingTime);
      if (f.price && l.unitPrice !== null && f.price.value !== l.unitPrice) {
        const pct = ((f.price.value - l.unitPrice) / l.unitPrice) * 100;
        if (pct > m.preAnswers.priceRiseMaxPct) {
          results.push({ productId: l.productId, productName: name, result: "price_changed", detail: fire("PRC-03", { product: name, newPrice: eur(f.price.value), oldPrice: eur(l.unitPrice), pct: `${round2(pct)}%` }).message });
          continue;
        }
      }
      if (f.stock.kind === "unknown") {
        results.push({ productId: l.productId, productName: name, result: "covered_at_risk", detail: `Unknown stock; risk accepted by ${l.riskAccepted?.by ?? "pre-answer"}${l.riskAccepted ? ` on ${fmtHelsinki(l.riskAccepted.at, false)}` : ""}.` });
        continue;
      }
      if (f.stock.kind !== "known" || f.stock.amount < l.quantity) {
        const stock = f.stock.kind === "known" ? f.stock.amount : 0;
        const detail = fire("FIN-02", { product: name, stock: `${stock} ${l.salesUnit ?? ""}`, quantity: `${l.quantity} ${l.salesUnit ?? ""}`, cutoff: cut ? fmtHelsinki(cut) : "the cut-off" }).message;
        results.push({ productId: l.productId, productName: name, result: "short", detail });
        await resolveShortfall(e, o, l, stock, plan);
        continue;
      }
      results.push({ productId: l.productId, productName: name, result: "covered", detail: fire("FIN-01", { product: name }).message });
    }
  }
  const fc = { at: nowIso(), summary: "", lines: results };
  e.finalCheck = fc;
  saveEvent(e);
  fc.summary = coverageSummary(eventId).text;
  e.finalCheck = fc;
  saveEvent(e);
  audit({ actor: AGENT, action: "final_check_run", summary: `Final check: ${fc.summary}`, eventId, ruleIds: results.map((r) => (r.result === "short" ? "FIN-02" : r.result === "price_changed" ? "PRC-03" : r.result === "covered_at_risk" ? "STK-03" : "FIN-01")), details: { results }, usesFixture: true, visibility: "shared" });
  return fc;
}

/**
 * Try an amendment; if the gateway needs an approval for it (for example unknown
 * stock on a substitute), raise one Approver card instead of failing.
 */
export async function amendOrAsk(e: StoredEvent, orderId: string, changes: { productId: string; outletId: string; quantity: number }[], title: string, why: string): Promise<"applied" | "asked"> {
  try {
    await gw.amend(orderId, { changes });
    return "applied";
  } catch (err) {
    if (!(err instanceof GatewayError) || err.body.error !== "mandate_violation") throw err;
    const q = makeQuestion({
      planId: e.orderPlanId ?? "none", eventId: e.id, type: "unknown_stock", forRole: "approver", outletId: null, quoteId: err.body.newQuoteId ?? null, fingerprint: null,
      title, body: why,
      facts: { kind: "change", orderId, changes }, ruleIds: (err.body.approvalsNeeded ?? []).includes("unknown_stock") ? ["STK-01"] : ["MAN-01"],
      options: [{ id: "approve", label: "Accept the risk", primary: true }, { id: "keep", label: "Keep the order as is", primary: false }],
      deadline: null,
    });
    saveQuestion(q);
    audit({ actor: AGENT, action: "question_asked", summary: `Approver asked: ${title}`, eventId: e.id, orderId, questionId: q.id, ruleIds: q.ruleIds, details: {}, visibility: "hotel" });
    return "asked";
  }
}

type SubCandidate = { productId: string; name: string; quantity: number; stock: string; listed: boolean; pricePerBase: number | null; unknown: boolean };

/** SUBSTITUTE-FIND (Q07.4): listed substitutes first, every candidate passing the need's rules and TYPE-CHECK, on fresh stock. */
async function findSubstitutes(line: Order["lines"][number], need: Need | undefined, deliveryDate: string, needAmount: { value: number; unit: string }): Promise<SubCandidate[]> {
  const prod = getProduct(line.productId)!;
  const listed = prod.substitutes;
  const ids = [...new Set([...listed, ...(need?.candidates ?? []).map((c) => c.productId)])].filter((id) => id !== line.productId);
  if (!ids.length) return [];
  const fresh = await gw.lookup(ids, deliveryDate);
  const at = now();
  const pass: { p: NonNullable<ReturnType<typeof getProduct>>; l: (typeof fresh.lines)[number] }[] = [];
  for (const l of fresh.lines) {
    const p = getProduct(l.productId);
    if (!p || !l.deliverable || !l.price) continue;
    const cut = parseAimoTime(l.closingTime);
    if (cut && cut.getTime() <= at.getTime()) continue;
    if (need && dietRules(p, need.constraints, need.groupLabel).some((r) => r.outcome === "block")) continue;
    pass.push({ p, l });
  }
  const type = (need?.text ?? prod.name).toLowerCase();
  const judged = await typeCheck(type, pass.map((x) => x.p));
  const out: SubCandidate[] = [];
  for (const { p, l } of pass) {
    if (judged.get(p.id)?.verdict === "no") continue;
    const content = packContent(p, l, needAmount.unit as BaseUnit);
    if (!content || content.unit !== needAmount.unit) continue;
    const quantity = Math.ceil(needAmount.value / content.value - 1e-9);
    const unknown = l.stock.kind === "unknown";
    if (l.stock.kind === "known" && l.stock.amount < quantity) continue;
    out.push({ productId: p.id, name: p.name, quantity, stock: unknown ? "unknown stock" : `${l.stock.kind === "known" ? l.stock.amount : 0} in stock`, listed: listed.includes(p.id), pricePerBase: l.price ? round2(l.price.value / content.value) : null, unknown });
  }
  return out.sort((a, b) => Number(b.listed) - Number(a.listed) || Number(a.unknown) - Number(b.unknown) || (a.pricePerBase ?? 1e9) - (b.pricePerBase ?? 1e9) || a.productId.localeCompare(b.productId)).slice(0, 3);
}

/** SHORTFALL-RESOLVE (Q07.3): remembered substitute first, then up to three candidates for the chef. */
async function resolveShortfall(e: StoredEvent, o: Order, line: Order["lines"][number], stock: number, plan: StoredPlan | null) {
  const pl = plan?.lines.find((x) => x.productId === line.productId && x.outletId === line.outletId);
  const need = plan?.needs.find((n) => pl?.needIds.includes(n.id));
  const dishId = need?.dishId ?? "request";
  const prod = getProduct(line.productId)!;
  const unit = pl?.packContent?.unit ?? "l";
  const perPack = pl?.packContent?.value ?? 1;
  const needAmount = { value: line.quantity * perPack, unit };
  const ordered = await findSubstitutes(line, need, o.deliveryDate, needAmount);
  for (const c of ordered) {
    const r = recallSubstitute(dishId, line.productId, c.productId);
    if (r) {
      const msg = fire("SUB-02", { substitute: c.name, original: prod.name, dish: need?.dishName ?? "this request", by: r.by, at: fmtHelsinki(r.at, false) }).message;
      const res = await amendOrAsk(e, o.id, [{ productId: line.productId, outletId: line.outletId, quantity: 0 }, { productId: c.productId, outletId: line.outletId, quantity: c.quantity }], "Accept stock risk?", `${shortName(c.name)} replaces ${shortName(prod.name)} · unknown stock`);
      audit({ actor: AGENT, action: "substitute_applied", summary: res === "applied" ? msg : `${msg} Waiting for the Approver to accept the stock risk.`, eventId: e.id, orderId: o.id, ruleIds: ["SUB-02"], details: { rememberedAt: r.at }, visibility: "hotel" });
      return;
    }
  }
  if (!ordered.length) {
    audit({ actor: AGENT, action: "question_asked", summary: `${prod.name} is short and no substitute passes the event's rules; unresolved`, eventId: e.id, orderId: o.id, ruleIds: ["FIN-02"], details: {}, visibility: "hotel" });
    return;
  }
  const best = ordered[0];
  const cut = parseAimoTime(line.closingTime);
  const q = makeQuestion({
    planId: plan?.id ?? "none", eventId: e.id, type: "substitute", forRole: "chef", outletId: line.outletId, quoteId: null, fingerprint: null,
    title: `Short: ${shortName(prod.name)}`,
    body: `${stock} of ${line.quantity} in stock · use ${shortName(best.name)}?`,
    facts: {
      kind: "final_substitute", orderId: o.id, original: line.productId, originalQty: line.quantity, outletId: line.outletId, dishId, dishName: need?.dishName ?? null,
      substitute: best.productId, substituteQty: best.quantity, substituteStock: best.stock, sideBySide: specCompare(line.productId, best.productId, { originalPrice: line.unitPrice !== null ? round2(line.unitPrice / perPack) : null, subPrice: best.pricePerBase }),
      alternatives: ordered.slice(1).map((c) => ({ productId: c.productId, name: c.name, quantity: c.quantity, stock: c.stock })), stock,
    },
    ruleIds: ["FIN-02", "SUB-01"],
    options: [{ id: "use", label: "Use this one", primary: true }, { id: "another", label: "Use another", primary: false }, { id: "none", label: "None of these", primary: false }],
    deadline: cut?.toISOString() ?? null,
  });
  saveQuestion(q);
  audit({ actor: AGENT, action: "question_asked", summary: `Chef asked: ${q.title}`, eventId: e.id, orderId: o.id, questionId: q.id, ruleIds: q.ruleIds, details: {}, visibility: "hotel" });
}

export async function answerFinalSubstitute(q: Question, p: Person) {
  const f = q.facts as any;
  if (q.answer === "none") {
    audit({ actor: personActor(p), action: "question_answered", summary: `${p.name}: none of the substitutes work; the line stays short and unresolved`, eventId: q.eventId, questionId: q.id, ruleIds: ["FIN-02"], details: {}, visibility: "hotel" });
    return;
  }
  if (q.answer === "another") {
    const [next, ...rest] = f.alternatives ?? [];
    if (!next) return;
    const nq = makeQuestion({
      ...q, title: `Short: ${shortName(getProduct(f.original)?.name ?? f.original)}`,
      body: `Use ${shortName(next.name)} instead?`,
      facts: { ...f, substitute: next.productId, substituteQty: next.quantity, substituteStock: next.stock, sideBySide: specCompare(f.original, next.productId), alternatives: rest },
      state: "open",
    });
    saveQuestion(nq);
    return;
  }
  const { rememberSubstitute } = await import("./memory.js");
  rememberSubstitute(f.dishId, f.original, f.substitute, p.name, nowIso());
  const e = getEvent(q.eventId!)!;
  await amendOrAsk(e, f.orderId, [{ productId: f.original, outletId: f.outletId, quantity: 0 }, { productId: f.substitute, outletId: f.outletId, quantity: f.substituteQty }], "Accept stock risk?", `${shortName(getProduct(f.substitute)?.name ?? f.substitute)} replaces ${shortName(getProduct(f.original)?.name ?? f.original)} · unknown stock`);
  audit({ actor: personActor(p), action: "substitute_applied", summary: `${getProduct(f.substitute)?.name} replaces ${getProduct(f.original)?.name} in ${f.dishName ?? "the dish"}; remembered for next time`, eventId: q.eventId, orderId: f.orderId, questionId: q.id, ruleIds: ["SUB-01"], details: { dish: f.dishName }, visibility: "hotel" });
}

/** SILENCE-RESOLVE (D9): at the cut-off an unanswered line stays as last approved and both sides are told. */
export function runCutoff(eventId: string) {
  const at = now();
  const flags: string[] = [];
  for (const q of allQuestions().filter((x) => x.eventId === eventId && (x.state === "open" || x.state === "waiting"))) {
    if (q.deadline && new Date(q.deadline).getTime() > at.getTime()) continue;
    q.state = "expired";
    saveQuestion(q);
    const f = q.facts as any;
    const msg = q.type === "allergy_conflict" ? `Hotel has not confirmed; ${getProduct(f.productId)?.name} conflicts with a stated allergy and is still in the order.` : fire("SIL-01", { cutoff: q.deadline ? fmtHelsinki(q.deadline) : "the cut-off" }).message;
    flags.push(msg);
    audit({ actor: AGENT, action: "question_expired", summary: `Unanswered at the cut-off: ${q.title}`, eventId, questionId: q.id, ruleIds: ["SIL-01"], details: {}, visibility: "hotel" });
    audit({ actor: AGENT, action: "flag_sent_to_valio_aimo", summary: `Unresolved at cut-off: ${msg}`, eventId, orderId: f.orderId ?? null, ruleIds: ["SIL-01"], details: { productId: f.productId ?? f.original ?? null, askedAt: q.createdAt }, visibility: "shared" });
  }
  return flags;
}

/** COVERAGE-SUMMARY (Q07.7): never "covered" alone while anything is at risk or carries a warning. */
export function coverageSummary(eventId: string): { level: "covered" | "at_risk" | "not_covered" | "warning" | "none"; text: string } {
  const e = getEvent(eventId);
  const ws = warnings(eventId).filter((w) => w.state === "open");
  if (ws.length) return { level: "warning", text: `Allergy warning · ${ws.length} line${ws.length > 1 ? "s" : ""}` };
  const open = allQuestions().filter((q) => q.eventId === eventId && (q.state === "open" || q.state === "waiting"));
  if (open.length) {
    const d = open.map((q) => q.deadline).filter(Boolean).sort()[0];
    return { level: "not_covered", text: `${open.length} open question${open.length > 1 ? "s" : ""}${d ? ` · by ${fmtHelsinki(d!)}` : ""}` };
  }
  const plan = e?.orderPlanId ? getPlan(e.orderPlanId) : null;
  if (plan && !plan.orderIds.length && plan.status === "blocked") {
    const red = plan.lines.filter((l) => l.verdict === "red" && !l.removed).length;
    return { level: "not_covered", text: `Blocked · ${red || 1} line${red === 1 ? "" : "s"}` };
  }
  if (plan && !plan.orderIds.length && plan.status === "rejected") return { level: "not_covered", text: "Rejected" };
  if (!plan || !plan.orderIds.length) return { level: "none", text: "Not ordered" };
  const fc = e?.finalCheck;
  const atRisk = fc ? fc.lines.filter((l) => l.result === "covered_at_risk").length : plan.lines.filter((l) => l.riskAccepted).length;
  const short = fc ? fc.lines.filter((l) => l.result === "short" || l.result === "price_changed").length : 0;
  if (short) return { level: "not_covered", text: `${short} short` };
  if (atRisk) return { level: "at_risk", text: `Covered · ${atRisk} at risk` };
  return { level: "covered", text: "Covered" };
}

export function eventView(eventId: string) {
  const e = getEvent(eventId)!;
  return {
    event: e,
    viability: e.viabilityPlanId ? getPlan(e.viabilityPlanId) : null,
    orderPlan: e.orderPlanId ? getPlan(e.orderPlanId) : null,
    warnings: warnings(eventId),
    coverage: coverageSummary(eventId),
    decisions: decisionCount(eventId),
    questions: allQuestions().filter((q) => q.eventId === eventId),
  };
}
