/**
 * Chunks 02–04 for one need: shortlist locally, filter on hard rules, check the
 * product type, look up the shortlist once, rank in the fixed SF-06 order and
 * work out whole packs. Deterministic apart from the stored model judgements.
 */
import type { Candidate, FiredRule, LookupLine, Need, PlanLine, Product, SearchHelp, StatusLabel, Verdict, BaseUnit, ModelJudgement } from "@aimo/contracts";
import { allProducts, getProduct, searchMatches, searchPage } from "../catalog.js";
import { contentWords, queryTerms, rank } from "../search.js";
import { categoryLabel, didYouMean as didYouMeanWords } from "../categoryTags.js";
import { fire, FIXED, RULE_INDEX } from "../rules/catalogue.js";
import { cutoffRule, productRules, earliestDelivery, packContent, priceValidityRule, reliabilityRules, supplyRules, blocks } from "../rules/checks.js";
import { mandate } from "./mandate.js";
import { typeCheck } from "./judge.js";
import { carbonBasisFor } from "../carbon.js";
import { round2, eur, fmtHelsinki } from "../util.js";
import { now } from "../clock.js";
import { brief, logSearch } from "../searchlog.js";
import type { PreAnswers } from "@aimo/contracts";

/** Categories where claims can't tell product types apart, so TYPE-CHECK runs (Q02.1 step 4). */
const MIXED_TYPE_CATEGORIES = ["10400", "10401"];

export type Pool = Map<string, LookupLine>;

/** Step 1–2 of Q02.1: the shortlist for a need, before lookup. */
export function shortlist(need: Need, opts: { log?: boolean } = {}): Product[] {
  const claims = need.constraints.claims ?? [];
  if (need.pinnedProductId) {
    const pinned = getProduct(need.pinnedProductId);
    const out: Product[] = pinned ? [pinned] : [];
    // A category can mix distinct products (plain, coffee and sour milk). Alternatives
    // must retain the named identity; an ID alone does not establish a substitute spec.
    const query = need.query.replace(/\b\d{6}\b/g, "").trim();
    // Only words can name alternatives: a leftover count or "x" would list the whole category.
    if (pinned && contentWords(query).some((w) => /\p{L}{2}/u.test(w))) {
      const matches = searchMatches({ q: query, category: pinned.category, claims: claims.filter((c) => c !== "FREE_FROM_MILK"), limit: FIXED.searchLimit }, mandate());
      for (const m of matches) if (m.tier < 3 && m.product.id !== pinned.id) out.push(m.product);
    }
    return out.slice(0, FIXED.searchLimit);
  }
  const base = { category: need.category ?? undefined, claims: claims.filter((c) => c !== "FREE_FROM_MILK"), limit: FIXED.searchLimit };
  // Mention-only search results are useful for browsing, but cannot establish what to
  // buy. A failed text match must not turn into an unrelated category-wide pick.
  const list = searchMatches({ ...base, q: need.query }, mandate()).filter((m) => m.tier < 3).map((m) => m.product);
  if (opts.log !== false) logSearch({ source: "shortlist", query: { need: need.label, text: need.text, q: need.query, ...base }, interpreted: { count: list.length, fellBackToCategory: false, top: brief(list) } });
  return list;
}

/** A blocked named product can offer its broader type, without changing the requested specification. */
export function replacementShortlist(need: Need, original: Product[]): { query: string; products: Product[] } | null {
  const m = mandate();
  // This is a deliberate alternative to a known product that fails the hotel's rules,
  // never a way to turn an unknown query into a category-wide automatic choice.
  if (!original.length || original.some((p) => !blocks(productRules(p, need.constraints, need.groupLabel, m)).length)) return null;
  const categories = new Set(original.map((p) => p.category));
  if (categories.size !== 1) return null;
  const words = contentWords(need.query).filter((word) => /\p{L}/u.test(word));
  if (words.length < 2) return null;
  const query = words.at(-1)!;
  const excluded = new Set(original.map((p) => p.id));
  const products = searchMatches({ q: query, category: original[0].category, claims: need.constraints.claims.filter((claim) => claim !== "FREE_FROM_MILK"), excludeAllergens: need.constraints.avoidAllergens, origin: need.constraints.origin, limit: 50 }, m)
    .filter((match) => !excluded.has(match.product.id)
      && !blocks(productRules(match.product, need.constraints, need.groupLabel, m)).length)
    .map((match) => match.product).slice(0, 50);
  return products.length ? { query, products } : null;
}

/** Possible products listed at most; `possibleTotal` says how many there are. */
export const HELP_SHOWN = 20;

/**
 * Fixes 4 and 5 of the search audit: when the shortlist is empty, help the person instead of
 * showing nothing. A misspelt word gets catalogue spellings that are checked to find products
 * ("chese" → "cheese"). Products that only mention the words, or match once a word no product
 * uses is dropped ("unicorn chicken burger" → chicken burgers), are listed as possible matches.
 * None of them is looked up or ordered: the person picks one, and it is checked like any item.
 */
export function searchHelp(need: Need): SearchHelp | null {
  if (need.pinnedProductId || !need.query.trim()) return null;
  const all = allProducts();
  const base = { category: need.category ?? undefined, claims: (need.constraints.claims ?? []).filter((c) => c !== "FREE_FROM_MILK") };
  const words = contentWords(need.query);
  const unmatched = words.filter((w) => !searchMatches({ q: w, limit: 1 }).length);
  const orderable = (q: string) => searchMatches({ ...base, q, limit: FIXED.searchLimit }).some((m) => m.tier < 3);
  // Something to order was found: no help needed.
  if (orderable(need.query)) return null;
  const didYouMean: string[] = [];
  for (const w of unmatched)
    for (const s of didYouMeanWords(w, all)) {
      const fixed = words.map((x) => (x === w ? s : x)).join(" ");
      if (didYouMean.length < 3 && !didYouMean.includes(fixed) && orderable(fixed)) didYouMean.push(fixed);
    }
  let possible: SearchHelp["possible"] = [];
  let possibleTotal = 0;
  const toPossible = (q: string, reason: string, ms: ReturnType<typeof searchMatches>) =>
    ms.slice(0, HELP_SHOWN).map((m) => ({ productId: m.product.id, name: m.product.name, category: m.product.category, categoryLabel: labelOf(m.product.category), reason, query: q }));
  // The name mentions every word, but may be something else ("Cheese cake" for "cheese").
  const mentions = searchPage({ ...base, q: need.query, limit: HELP_SHOWN });
  if (mentions.total) {
    possible = toPossible(need.query, `The name mentions "${need.query}", but it may be something else.`, mentions.matches);
    possibleTotal = mentions.total;
  } else if (unmatched.length && unmatched.length < words.length) {
    const reduced = words.filter((w) => !unmatched.includes(w)).join(" ");
    const all = searchMatches({ ...base, q: reduced, limit: 1000 });
    const best = all.some((m) => m.tier < 3) ? all.filter((m) => m.tier < 3) : all;
    possible = toPossible(reduced, `No product name says ${unmatched.map((w) => `"${w}"`).join(" or ")}.`, best);
    possibleTotal = best.length;
  }
  if (!unmatched.length && !didYouMean.length && !possible.length) return null;
  return { unmatched, didYouMean, possible, possibleTotal };
}

/** A saved proposal must still qualify for automatic selection before it is staged. */
export function matchesCurrentShortlists(needs: Need[], lines: PlanLine[]): boolean {
  if (!matchesSelectedProducts(needs, lines)) return false;
  const eligible = new Map(needs.map((need) => [need.id, new Set(shortlist(need).map((p) => p.id))]));
  return lines.filter((line) => !line.removed).every((line) =>
    line.productId && line.needIds.length > 0 && line.needIds.every((id) => eligible.get(id)?.has(line.productId!)),
  );
}

/** Validate the exact products already accepted into a basket, independent of shortlist limits. */
export function matchesSelectedProducts(needs: Need[], lines: PlanLine[]): boolean {
  const byId = new Map(needs.map((need) => [need.id, need]));
  const m = mandate();
  const catalog = allProducts();
  return lines.filter((line) => !line.removed).every((line) => {
    const product = line.productId ? getProduct(line.productId) : null;
    if (!product || !line.needIds.length) return false;
    return line.needIds.every((id) => {
      const need = byId.get(id);
      if (!need || blocks(productRules(product, need.constraints, need.groupLabel, m)).length) return false;
      if (need.pinnedProductId === product.id) return true;
      if (need.category && !product.category.startsWith(need.category)) return false;
      const terms = queryTerms(need.query);
      // A brand such as "monster" cannot establish an automatic product type, but
      // the builder has already accepted a specific matching product in this basket.
      const brandTerms = new Set(queryTerms(product.brand ?? "").map((term) => term.key));
      const brandOnly = terms.length > 0 && terms.every((term) => term.key.startsWith("~") && brandTerms.has(term.key));
      return rank(need.query, [product], catalog, need.category ?? undefined, need.constraints.claims)
        .some((match) => match.tier < 3 || brandOnly);
    });
  });
}

type Scored = { p: Product; l: LookupLine; content: ReturnType<typeof packContent>; pricePerBase: number | null; costToCover: Candidate["costToCover"]; pieces: boolean; judgement: ModelJudgement | null; notes: FiredRule[]; pinned: boolean };

/** RANK: explicit recipe choice, then price and reliability; stock is disclosed separately. */
const relBand = (r: number | null) => (r === null ? 1 : r >= FIXED.reliabilityAmber ? 0 : 2);
const STEPS: [string, (s: Scored) => number | string][] = [
  ["known price", (s) => (s.l.price === null ? 1 : 0)],
  ["recipe-approved product", (s) => (s.pinned ? 0 : 1)],
  ["price per kg or L after rounding", (s) => Math.round((s.pieces ? s.costToCover?.totalExVat ?? Number.MAX_SAFE_INTEGER : s.pricePerBase ?? Number.MAX_SAFE_INTEGER) * 100)],
  ["delivery reliability", (s) => relBand(s.p.reliability) * 10 - (s.p.reliability ?? 0)],
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
  for (const [name, f] of STEPS) if (f(a) !== f(b)) return a.pieces && name.startsWith("price per") ? "cost to cover the piece need after whole-pack rounding" : name;
  return "product id (tie-break)";
}

/**
 * Filter and rank the shortlist for a need. Fills need.candidates, need.excluded
 * and need.rules. `urgent` decides whether a past cut-off matters now; it is
 * always caught (CUT-01), whatever the mock's date says.
 */
export async function rankNeed(need: Need, list: Product[], pool: Pool, opts: { lockedOk?: boolean; deliveryDays?: number[]; holidays?: string[]; combinedPieceNeed?: number } = {}): Promise<void> {
  const at = now();
  const m = mandate();
  need.excluded = [];
  const trace = need.selectionTrace = { shortlist: list.map((p) => ({ productId: p.id, name: p.name })), stages: [] } as NonNullable<Need["selectionTrace"]>;
  const remaining = new Set(list.map((p) => p.id));
  const recordStage = (key: (typeof trace.stages)[number]["key"], ids: string[]) => {
    const removedProductIds = [...new Set(ids)].filter((id) => remaining.delete(id));
    trace.stages.push({ key, removedProductIds });
  };
  // Missing lookup evidence is an unevaluated product, not a dietary or stock rejection.
  recordStage("lookup", list.filter((p) => !pool.has(p.id)).map((p) => p.id));
  need.earliestDelivery = null;
  need.lateDeliveryOptions = [];
  let passing: Scored[] = [];
  // Products whose only fault is a passed cut-off: a later date would fix them.
  const cutOnly: Scored[] = [];
  let lastFilter = "the catalogue search";
  // Type check only where claims can't separate types.
  let judgements = new Map<string, ModelJudgement>();
  const typeTarget = need.productType && MIXED_TYPE_CATEGORIES.some((c) => (need.category ?? "").startsWith(c)) ? need.productType : null;
  for (const p of list) {
    const l = pool.get(p.id);
    if (!l) continue;
    const pinned = p.id === need.pinnedProductId;
    const diet = productRules(p, need.constraints, need.groupLabel, m);
    const supply = supplyRules(p, l);
    // Keep unpriced products visible at the end; PRC-01 still blocks ordering them.
    const hard = [...blocks(diet), ...supply.filter((r) => r.ruleId !== "PRC-01")];
    // A change to a placed order keeps lines whose cut-off has passed (they are locked, not lost);
    // the gateway refuses any attempt to change them (CUT-02).
    const cut = opts.lockedOk && pinned ? null : cutoffRule(p, l, at);
    if (hard.length) {
      need.excluded.push({ productId: p.id, name: p.name, reason: hard[0].message, ruleId: hard[0].ruleId });
      lastFilter = RULE_INDEX.get(hard[0].ruleId)?.area.toLowerCase() ?? hard[0].ruleId;
      if (pinned) need.rules.push(...hard);
      continue;
    }
    const content = packContent(p, l, need.amount.unit);
    const pieces = need.amount.unit === "pcs";
    const pricePerBase = content && l.price && (!pieces || content.verified) ? l.price.value / content.value : null;
    const costToCover = pieces ? pieceCostToCover(p.name, opts.combinedPieceNeed ?? need.amount.value, content, l.price?.value ?? null, m.preAnswers) : undefined;
    const scored: Scored = { p, l, content, pricePerBase, pieces, costToCover, judgement: null, notes: [...diet.filter((r) => r.outcome !== "block"), ...supply.filter((r) => r.ruleId === "PRC-01")], pinned };
    if (cut) {
      cutOnly.push(scored);
      need.excluded.push({ productId: p.id, name: p.name, reason: cut.message, ruleId: cut.ruleId });
      if (pinned) need.rules.push(cut);
    } else passing.push(scored);
  }
  recordStage("eligibility", need.excluded.filter((e) => e.ruleId !== "CUT-01").map((e) => e.productId));
  recordStage("cutoff", need.excluded.filter((e) => e.ruleId === "CUT-01").map((e) => e.productId));
  if (typeTarget && (passing.length || cutOnly.length)) {
    judgements = await typeCheck(typeTarget, [...passing, ...cutOnly].map((s) => s.p));
    need.judgements.push(...judgements.values());
    for (const group of [passing, cutOnly]) {
      for (let i = group.length - 1; i >= 0; i--) {
        const j = judgements.get(group[i].p.id);
        group[i].judgement = j ?? null;
        if (j?.verdict === "no") {
          need.excluded.push({ productId: group[i].p.id, name: group[i].p.name, reason: `Not ${typeTarget} (model ${j.probability?.toFixed(2)})`, ruleId: "TYP-02" });
          group.splice(i, 1);
          lastFilter = "product type check";
        } else if (j?.verdict === "unsure") {
          const typ = fire("TYP-01", { product: group[i].p.name, type: typeTarget, probability: j.probability === null ? "model unreachable" : j.probability.toFixed(2) });
          // RULE-POLICY: a hotel that blocks unsure types leaves them out instead of asking.
          if (typ.outcome === "block") {
            need.excluded.push({ productId: group[i].p.id, name: group[i].p.name, reason: typ.message, ruleId: "TYP-01" });
            group.splice(i, 1);
            lastFilter = "product type check";
          } else group[i].notes.push(typ);
        }
      }
    }
  }
  recordStage("type", need.excluded.map((e) => e.productId));
  // Preserve explicit recipe choices; automatic picks prefer price, with stock shown separately.
  passing.sort(compare);
  // NOT-IN-TIME (DLV-06): nothing that passes every other check arrives by the needed-by date.
  // One clear rule with the earliest date replaces the per-product reasons.
  const nb = need.neededBy;
  // Every product's own earliest date must fall after the needed-by date; an empty list proves nothing.
  const dates = nb && !opts.lockedOk ? [...passing, ...cutOnly].map((s) => earliestDelivery(s.l, at, opts.deliveryDays ?? [1, 2, 3, 4, 5], opts.holidays ?? [])) : [];
  if (nb && dates.length && dates.every((d) => d !== null && d > nb)) {
    need.lateDeliveryOptions = [...passing, ...cutOnly].flatMap((s) => {
      const date = earliestDelivery(s.l, at, opts.deliveryDays ?? [1, 2, 3, 4, 5], opts.holidays ?? []);
      const content = s.content;
      if (!date || !content?.verified || content.value <= 0 || content.unit !== need.amount.unit || s.judgement?.verdict === "unsure") return [];
      const quantity = Math.max(1, Math.ceil(need.amount.value / content.value - 1e-9));
      if (!s.l.price || s.l.stock.kind !== "known" || s.l.stock.amount < quantity || priceValidityRule(s.p, s.l, date)) return [];
      return [{ ...asCandidate(s, 0), availableDate: date, quantity, deliveryEstimated: cutOnly.includes(s) }];
    // Every full-pack option, earliest first; the screen shows the first and can load the rest.
    }).sort((a, b) => a.availableDate!.localeCompare(b.availableDate!) || a.productId.localeCompare(b.productId));
    dates.sort();
    for (const s of passing) need.excluded.push({ productId: s.p.id, name: s.p.name, reason: `Arrives ${s.l.availableDate}, after ${nb}`, ruleId: "DLV-03" });
    passing = [];
    need.earliestDelivery = dates.find((d): d is string => Boolean(d)) ?? null;
    const day = (d: string) => fmtHelsinki(`${d}T12:00:00Z`, false);
    need.rules = need.rules.filter((r) => r.ruleId !== "CUT-01");
    need.rules.push(fire("DLV-06", { need: need.label, neededBy: nb, neededByText: day(nb), earliest: need.earliestDelivery, earliestText: need.earliestDelivery ? day(need.earliestDelivery) : "not known yet" }));
  }
  recordStage("delivery", need.excluded.map((e) => e.productId));
  need.candidateCount = passing.length;
  need.candidates = passing.map((s, i): Candidate => ({
    ...asCandidate(s, i),
    rankStep: i === 0 ? decidingStep(s, passing[1]) : decidingStep(passing[i - 1], s),
  }));
  if (!passing.length && !need.rules.some((r) => r.ruleId === "DLV-06")) {
    if (need.pinnedProductId && !getProduct(need.pinnedProductId)) {
      need.rules.push(fire("REQ-04", { product: need.pinnedProductId }));
    } else {
      const ruleNames = [...(need.constraints.claims ?? []), ...(need.constraints.avoidAllergens ?? []).map((a) => `no ${a}`)].join(", ") || "delivery and price checks";
      need.rules.push(fire("DIET-04", { need: need.label, rules: ruleNames, filter: lastFilter }));
    }
  } else if (need.pinnedProductId && passing[0] && passing[0].p.id !== need.pinnedProductId) {
    need.substituteFor = need.pinnedProductId;
  }
}

function asCandidate(s: Scored, i: number): Candidate {
  return {
    productId: s.p.id,
    name: s.p.name,
    brand: s.p.brand,
    rank: i + 1,
    rankStep: "earliest delivery",
    label: i === 0 ? "best" : i === 1 ? "better" : i === 2 ? "good" : "more",
    unitPrice: s.l.price?.value ?? null,
    pricePerBase: s.pricePerBase === null ? null : round2(s.pricePerBase),
    ...(s.pieces ? { costToCover: s.costToCover } : {}),
    baseUnit: s.content?.unit ?? null,
    stock: s.l.stock,
    reliability: s.p.reliability,
    packContent: s.content ? { value: s.content.value, unit: s.content.unit, verified: s.content.verified, source: s.content.source } : null,
    carbonBasis: carbonBasisFor(s.p, s.l),
    salesUnit: s.l.salesUnit,
    closingTime: s.l.closingTime,
    availabilityEvidence: s.l.availabilityEvidence,
    availableDate: s.l.availableDate,
    source: s.l.source,
    judgement: s.judgement,
    notes: s.notes,
    category: s.p.category,
    categoryLabel: labelOf(s.p.category),
  };
}

/** Category labels come from the whole catalogue, which doesn't change while the server runs. */
const labels = new Map<string, string>();
function labelOf(category: string): string {
  let l = labels.get(category);
  if (l === undefined) labels.set(category, (l = categoryLabel(category, allProducts())));
  return l;
}

export type PackMath = { quantity: number; overshoot: { amount: number; pct: number; eur: number } | null; rules: FiredRule[] };

/** PACK-ROUND + OVERSHOOT-CHECK (D25): round the total once, up, ask only above both limits. */
export function packRound(productName: string, needValue: number, needUnit: BaseUnit, c: Pick<Candidate, "packContent" | "unitPrice" | "salesUnit">, pre: PreAnswers): PackMath {
  const rules: FiredRule[] = [];
  if (!c.packContent) return { quantity: 0, overshoot: null, rules: [fire("QTY-03", { product: productName, content: "unknown" })] };
  if (needUnit === "pcs" && (!c.packContent.verified || c.packContent.value <= 0)) return { quantity: 0, overshoot: null, rules: [fire("QTY-03", { product: productName, content: "piece conversion not confirmed" })] };
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

/** Use the same checked conversion and rounding as the order, never a weight-derived piece count. */
export function pieceCostToCover(name: string, need: number, content: Candidate["packContent"], unitPrice: number | null, pre: PreAnswers): Candidate["costToCover"] {
  if (unitPrice === null || !content?.verified || content.unit !== "pcs" || content.value <= 0) return null;
  const { quantity } = packRound(name, need, "pcs", { packContent: content, unitPrice, salesUnit: null }, pre);
  return { need, quantity, totalExVat: round2(quantity * unitPrice) };
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
