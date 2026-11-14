/**
 * Chunks 02–04 for one need: shortlist locally, filter on hard rules, check the
 * product type, look up the shortlist once, rank in the fixed SF-06 order and
 * work out whole packs. Deterministic apart from the stored model judgements.
 */
import type { Candidate, FiredRule, LookupLine, Need, PlanLine, Product, StatusLabel, Verdict, BaseUnit, ModelJudgement } from "@aimo/contracts";
import { getProduct, searchProducts } from "../catalog.js";
import { fire, FIXED, RULE_INDEX } from "../rules/catalogue.js";
import { cutoffRule, dietRules, packContent, reliabilityRules, supplyRules, blocks } from "../rules/checks.js";
import { typeCheck } from "./judge.js";
import { round2, eur } from "../util.js";
import { now } from "../clock.js";
import type { PreAnswers } from "@aimo/contracts";

/** Categories where claims can't tell product types apart, so TYPE-CHECK runs (Q02.1 step 4). */
const MIXED_TYPE_CATEGORIES = ["10400", "10401"];

export type Pool = Map<string, LookupLine>;

/** Step 1–2 of Q02.1: the shortlist for a need, before lookup. */
export function shortlist(need: Need): Product[] {
  const claims = need.constraints.claims ?? [];
  if (need.pinnedProductId) {
    const pinned = getProduct(need.pinnedProductId);
    const out: Product[] = pinned ? [pinned] : [];
    // Alternatives in the same category, for when the recipe's product fails this group's rules.
    if (pinned) for (const p of searchProducts({ category: pinned.category, claims: claims.filter((c) => c !== "FREE_FROM_MILK"), limit: FIXED.searchLimit })) if (p.id !== pinned.id) out.push(p);
    return out.slice(0, FIXED.searchLimit);
  }
  const base = { category: need.category ?? undefined, claims: claims.filter((c) => c !== "FREE_FROM_MILK"), limit: FIXED.searchLimit };
  let list = searchProducts({ ...base, q: need.query });
  if (!list.length && need.category) list = searchProducts(base);
  return list;
}

type Scored = { p: Product; l: LookupLine; content: ReturnType<typeof packContent>; pricePerBase: number | null; judgement: ModelJudgement | null; notes: FiredRule[]; pinned: boolean };

/** RANK (SF-06, D32): recipe match, reliability band, price per kg or L, then confirmed stock as the last tie-break, then id. */
const relBand = (r: number | null) => (r === null ? 1 : r >= FIXED.reliabilityAmber ? 0 : 2);
const STEPS: [string, (s: Scored) => number | string][] = [
  ["recipe-approved product", (s) => (s.pinned ? 0 : 1)],
  ["delivery reliability", (s) => relBand(s.p.reliability) * 10 - (s.p.reliability ?? 0)],
  ["price per kg or L after rounding", (s) => (s.pricePerBase === null ? Number.MAX_SAFE_INTEGER : Math.round(s.pricePerBase * 100))],
  ["confirmed stock (tie-break, D32)", (s) => (s.l.stock.kind === "unknown" ? 1 : 0)],
  ["product id (tie-break)", (s) => s.p.id],
];
function compare(a: Scored, b: Scored): number {
  for (const [, f] of STEPS) {
    const x = f(a), y = f(b);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
function decidingStep(a: Scored, b: Scored | undefined): string {
  if (!b) return "only candidate";
  if (a.pinned !== b.pinned) return "recipe-approved product";
  for (const [name, f] of STEPS) if (f(a) !== f(b)) return name;
  return "product id (tie-break)";
}

/**
 * Filter and rank the shortlist for a need. Fills need.candidates, need.excluded
 * and need.rules. `urgent` decides whether a past cut-off matters now; it is
 * always caught (CUT-01), whatever the mock's date says.
 */
export async function rankNeed(need: Need, list: Product[], pool: Pool, opts: { lockedOk?: boolean } = {}): Promise<void> {
  const at = now();
  need.excluded = [];
  const passing: Scored[] = [];
  let lastFilter = "the catalogue search";
  // Type check only where claims can't separate types.
  let judgements = new Map<string, ModelJudgement>();
  const typeTarget = need.productType && !need.pinnedProductId && MIXED_TYPE_CATEGORIES.some((c) => (need.category ?? "").startsWith(c)) ? need.productType : null;
  for (const p of list) {
    const l = pool.get(p.id);
    if (!l) continue;
    const pinned = p.id === need.pinnedProductId;
    const diet = dietRules(p, need.constraints, need.groupLabel);
    const hard = [...blocks(diet), ...supplyRules(p, l)];
    // A change to a placed order keeps lines whose cut-off has passed (they are locked, not lost);
    // the gateway refuses any attempt to change them (CUT-02).
    const cut = opts.lockedOk && pinned ? null : cutoffRule(p, l, at);
    if (cut) hard.push(cut);
    if (hard.length) {
      need.excluded.push({ productId: p.id, name: p.name, reason: hard[0].message, ruleId: hard[0].ruleId });
      lastFilter = RULE_INDEX.get(hard[0].ruleId)?.area.toLowerCase() ?? hard[0].ruleId;
      if (pinned) need.rules.push(...hard);
      continue;
    }
    const content = packContent(p, l, need.amount.unit);
    const pricePerBase = content && l.price ? l.price.value / content.value : null;
    passing.push({ p, l, content, pricePerBase, judgement: null, notes: diet.filter((r) => r.outcome !== "block"), pinned });
  }
  if (typeTarget && passing.length) {
    judgements = await typeCheck(typeTarget, passing.map((s) => s.p));
    need.judgements.push(...judgements.values());
    for (let i = passing.length - 1; i >= 0; i--) {
      const j = judgements.get(passing[i].p.id);
      passing[i].judgement = j ?? null;
      if (j?.verdict === "no") {
        need.excluded.push({ productId: passing[i].p.id, name: passing[i].p.name, reason: `Not ${typeTarget} (model ${j.probability?.toFixed(2)})`, ruleId: "TYP-02" });
        passing.splice(i, 1);
        lastFilter = "product type check";
      } else if (j?.verdict === "unsure") passing[i].notes.push(fire("TYP-01", { product: passing[i].p.name, type: typeTarget, probability: j.probability === null ? "model unreachable" : j.probability.toFixed(2) }));
    }
  }
  // The recipe's own product wins whenever it passes every hard rule (recipe-approved, D6):
  // anything else is a substitute and asks the chef. Confirmed stock is only the last tie-break (D32).
  passing.sort(compare);
  need.candidateCount = passing.length;
  need.candidates = passing.map((s, i): Candidate => ({
    productId: s.p.id,
    name: s.p.name,
    brand: s.p.brand,
    rank: i + 1,
    rankStep: i === 0 ? decidingStep(s, passing[1]) : decidingStep(passing[i - 1], s),
    label: i === 0 ? "best" : i === 1 ? "better" : i === 2 ? "good" : "more",
    unitPrice: s.l.price?.value ?? null,
    pricePerBase: s.pricePerBase === null ? null : round2(s.pricePerBase),
    baseUnit: s.content?.unit ?? null,
    stock: s.l.stock,
    reliability: s.p.reliability,
    packContent: s.content ? { value: s.content.value, unit: s.content.unit, verified: s.content.verified, source: s.content.source } : null,
    salesUnit: s.l.salesUnit,
    closingTime: s.l.closingTime,
    availableDate: s.l.availableDate,
    source: s.l.source,
    judgement: s.judgement,
    notes: s.notes,
  }));
  if (!passing.length) {
    const ruleNames = [...(need.constraints.claims ?? []), ...(need.constraints.avoidAllergens ?? []).map((a) => `no ${a}`)].join(", ") || "delivery and price checks";
    need.rules.push(fire("DIET-04", { need: need.label, rules: ruleNames, filter: lastFilter }));
  } else if (need.pinnedProductId && passing[0].p.id !== need.pinnedProductId) {
    need.substituteFor = need.pinnedProductId;
  }
}

export type PackMath = { quantity: number; overshoot: { amount: number; pct: number; eur: number } | null; rules: FiredRule[] };

/** PACK-ROUND + OVERSHOOT-CHECK (D25): round the total once, up, ask only above both limits. */
export function packRound(productName: string, needValue: number, needUnit: BaseUnit, c: Candidate, pre: PreAnswers): PackMath {
  const rules: FiredRule[] = [];
  if (!c.packContent) return { quantity: 0, overshoot: null, rules: [fire("QTY-03", { product: productName, content: "unknown" })] };
  if (c.packContent.unit !== needUnit)
    return { quantity: 0, overshoot: null, rules: [fire("QTY-05", { need: productName, from: needUnit, to: c.packContent.unit, product: productName })] };
  const exact = needValue / c.packContent.value;
  const quantity = Math.max(1, Math.ceil(exact - 1e-9));
  const over = quantity * c.packContent.value - needValue;
  if (over < 1e-9) return { quantity, overshoot: null, rules };
  const pct = (over / needValue) * 100;
  const overEur = c.unitPrice !== null ? (over / c.packContent.value) * c.unitPrice : 0;
  const overshoot = { amount: round2(over), pct: round2(pct), eur: round2(overEur) };
  if (pct > pre.overshootMaxPct && overEur > pre.overshootMaxEur)
    rules.push(fire("QTY-01", { product: productName, packs: quantity, unit: c.salesUnit ?? "units", overshoot: `${round2(over)} ${needUnit}`, pct: `${Math.round(pct)}%`, eurOver: eur(overEur) }));
  else rules.push(fire("QTY-06", { need: `${round2(needValue)} ${needUnit}`, packs: quantity, product: productName, overshoot: `${round2(over)} ${needUnit}` }));
  return { quantity, overshoot, rules };
}

/** LINE-VERDICT (Q04.5): months ahead stock is ignored; amber for caveats; red when nothing passes. */
export function verdictOf(line: Pick<PlanLine, "rules" | "stock" | "productId">, urgent: boolean): { verdict: Verdict; status: StatusLabel } {
  if (!line.productId || line.rules.some((r) => r.outcome === "block")) return { verdict: "red", status: line.productId ? "blocked" : "not_available" };
  const unknown = line.stock?.kind === "unknown";
  const amberRules = ["REL-01", "REL-02", "QTY-03", "QTY-04", "QTY-05", "TYP-01", "SUB-01", "DLV-03", "QTY-02"];
  const amber = line.rules.some((r) => amberRules.includes(r.ruleId));
  if (unknown) return { verdict: "amber", status: "unknown_stock" };
  if (urgent && line.rules.some((r) => r.ruleId === "STK-02")) return { verdict: "amber", status: "check" };
  return amber ? { verdict: "amber", status: "check" } : { verdict: "green", status: "covered" };
}

export { reliabilityRules };
