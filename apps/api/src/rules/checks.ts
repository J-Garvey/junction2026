/**
 * Pure rule functions (RULE-EVALUATE, DIET-FILTER, STOCK-CHECK, CUTOFF-CHECK,
 * PACK-CONTENT, MANDATE-CHECK). The same code runs in the hotel agent, to
 * predict, and in the gateway, to enforce. No I/O, no clock reads: "now" is
 * passed in, so every check repeats.
 */
import type { Constraints, FiredRule, LookupLine, Mandate, Product, BaseUnit } from "@aimo/contracts";
import { fire, FIXED } from "./catalogue.js";
import { parseAimoTime, fmtHelsinki, eur, round2 } from "../util.js";

export const ALLERGEN_NAMES: Record<string, string> = {
  AM: "milk", AE: "eggs", AF: "fish", AC: "crustaceans", UM: "molluscs", AP: "peanuts", AN: "tree nuts", AY: "soybeans",
  AS: "sesame", BC: "celery", BM: "mustard", NL: "lupin", AU: "sulphites", AW: "cereals containing gluten", UW: "wheat",
  GB: "barley", GO: "oats", NR: "rye", GS: "spelt", GK: "kamut", ML: "lactose", SA: "almond", SC: "cashew", SH: "hazelnut",
  SW: "walnut", SP: "pecan", ST: "pistachio", SM: "macadamia", SR: "brazil nut", PN: "pine nuts", UN: "shellfish",
};
export const allergenName = (c: string) => ALLERGEN_NAMES[c] ?? c;

/**
 * An allergy names a family; the data codes members separately. "Tree nuts" (AN) must
 * also catch almond (SA) and the other individual nuts, and "cereals containing gluten"
 * (AW) must catch wheat, rye and the rest. A "free from" entry never outweighs a
 * "contains" entry: only CONTAINS and MAY_CONTAIN are read here.
 */
const FAMILIES: Record<string, string[]> = {
  AN: ["AN", "SA", "SC", "SH", "SW", "SP", "ST", "SM", "SR"],
  AW: ["AW", "UW", "GB", "NR", "GO", "GS", "GK"],
  AM: ["AM", "ML"],
};
export const expandAllergens = (codes: string[]) => [...new Set(codes.flatMap((c) => FAMILIES[c] ?? [c]))];

/** Allergen codes whose absence confirms a diet when the claim is missing (Q02.3, declaration path). */
const DIET_CODES: Record<string, string[]> = {
  FREE_FROM_LACTOSE: ["AM", "ML"],
  FREE_FROM_GLUTEN: ["AW", "UW", "GB", "NR", "GO", "GS", "GK"],
  FREE_FROM_MILK: ["AM", "ML"],
};
export const CLAIM_LABEL: Record<string, string> = {
  FREE_FROM_LACTOSE: "lactose-free",
  FREE_FROM_GLUTEN: "gluten-free",
  VEGAN: "vegan",
  VEGETARIAN: "vegetarian",
  FREE_FROM_MILK: "milk-free",
};

/**
 * DIET-FILTER for one product. Returns blocking rules, or DIET-05 when a diet
 * is met by declaration rather than by claim. Never matches on names.
 */
export function dietRules(p: Product, c: Constraints, group: string): FiredRule[] {
  const out: FiredRule[] = [];
  const name = p.name;
  for (const claim of c.claims ?? []) {
    if (claim === "FREE_FROM_LACTOSE" && p.claims.includes(claim) && p.contains.includes("ML")) {
      out.push(fire("DIET-02", { product: name, productId: p.id }));
      continue;
    }
    if (p.claims.includes(claim)) continue;
    const codes = DIET_CODES[claim];
    if (codes && p.hasAllergenData && !codes.some((x) => p.contains.includes(x) || p.mayContain.includes(x))) {
      out.push(fire("DIET-05", { product: name, productId: p.id, claim: CLAIM_LABEL[claim] ?? claim, codes: codes.join(", ") }));
      continue;
    }
    out.push(fire("DIET-01", { product: name, productId: p.id, claim: CLAIM_LABEL[claim] ?? claim, group }));
  }
  const asked = c.avoidAllergens ?? [];
  if (asked.length && !p.hasAllergenData) out.push(fire("ALG-03", { product: name, productId: p.id, group, allergen: asked.map(allergenName).join(", ") }));
  else for (const a of expandAllergens(asked)) {
    if (a === "X99") continue;
    if (p.contains.includes(a)) out.push(fire("ALG-01", { product: name, productId: p.id, allergen: allergenName(a), code: a, group }));
    else if (p.mayContain.includes(a)) out.push(fire("ALG-02", { product: name, productId: p.id, allergen: allergenName(a), code: a, group }));
  }
  if (c.origin && p.origin !== c.origin) out.push(fire("ORG-01", { product: name, origin: p.origin ?? "unknown", required: c.origin }));
  for (const l of c.labels ?? []) if (!p.labels.includes(l)) out.push(fire("LBL-01", { product: name, label: l }));
  return out;
}

export const blocks = (rules: FiredRule[]) => rules.filter((r) => r.outcome === "block");

/** Deliverability and price (DLV-01, DLV-02, PRC-01). */
export function supplyRules(p: { name: string }, l: LookupLine): FiredRule[] {
  const out: FiredRule[] = [];
  if (!l.deliverable) out.push(fire(l.salesBlock ? "DLV-02" : "DLV-01", { product: p.name, productId: l.productId }));
  if (!l.price) out.push(fire("PRC-01", { product: p.name, productId: l.productId }));
  return out;
}

/** CUTOFF-CHECK: decided from the cut-off time itself, never from the mock's date. */
export function cutoffRule(p: { name: string }, l: LookupLine, now: Date): FiredRule | null {
  const c = parseAimoTime(l.closingTime);
  if (!c) return null;
  if (c.getTime() <= now.getTime())
    return fire("CUT-01", { product: p.name, productId: l.productId, cutoff: fmtHelsinki(c), available: l.availableDate ?? "a date" });
  return null;
}

/**
 * EARLIEST-DELIVERY: the first date this product can still arrive. A cut-off that
 * hasn't passed keeps the date Valio Aimo offered. A passed one moves forward whole
 * days with its delivery date until the cut-off is in the future again. That is an
 * estimate: the mock returns one schedule line only.
 */
export function earliestDelivery(l: LookupLine, now: Date, deliveryDays: number[], holidays: string[]): string | null {
  if (!l.availableDate) return null;
  const c = parseAimoTime(l.closingTime);
  if (!c || c.getTime() > now.getTime()) return l.availableDate;
  const base = new Date(`${l.availableDate}T12:00:00Z`).getTime();
  for (let i = 1; i <= 60; i++) {
    const d = new Date(base + i * 86_400_000);
    const date = d.toISOString().slice(0, 10);
    if (!deliveryDays.includes(d.getUTCDay()) || holidays.includes(date)) continue;
    if (c.getTime() + i * 86_400_000 > now.getTime()) return date;
  }
  return null;
}

export function hoursLeft(l: LookupLine, now: Date): number | null {
  const c = parseAimoTime(l.closingTime);
  return c ? (c.getTime() - now.getTime()) / 3_600_000 : null;
}

/** STOCK-CHECK: never treat unknown as enough. Stock counts only when urgent (D8, SF-07). */
export type StockVerdict = { kind: "enough" | "partial" | "none" | "unknown" | "info"; available: number | null; rules: FiredRule[] };
export function stockCheck(p: { name: string }, l: LookupLine, quantity: number, urgent: boolean, unit: string): StockVerdict {
  if (l.stock.kind === "unknown") {
    const reason = l.stock.reason === "terminal_sentinel" ? "Terminal product, ships from the supplier" : "stock placeholder value";
    return { kind: "unknown", available: null, rules: [fire("STK-01", { product: p.name, productId: l.productId, reason })] };
  }
  const amt = l.stock.kind === "known" ? l.stock.amount : 0;
  if (!urgent) return { kind: "info", available: amt, rules: [fire("STK-05", { product: p.name, stock: `${amt} ${unit}` })] };
  if (amt >= quantity) return { kind: "enough", available: amt, rules: [] };
  if (amt > 0) return { kind: "partial", available: amt, rules: [fire("STK-04", { product: p.name, productId: l.productId, quantity, unit, stock: amt, date: l.availableDate ?? "" })] };
  return { kind: "none", available: 0, rules: [fire("STK-04", { product: p.name, productId: l.productId, quantity, unit, stock: 0, date: l.availableDate ?? "" })] };
}

export function reliabilityRules(p: Product): FiredRule[] {
  if (p.reliability === null) return [fire("REL-01", { product: p.name, reliability: "unknown" })];
  if (p.reliability < FIXED.reliabilityAsk) return [fire("REL-02", { product: p.name, productId: p.id, reliability: `${Math.round(p.reliability * 100)}%` })];
  if (p.reliability < FIXED.reliabilityAmber) return [fire("REL-01", { product: p.name, reliability: `${Math.round(p.reliability * 100)}%` })];
  return [];
}

export function priceValidityRule(p: { name: string }, l: LookupLine, deliveryDate: string): FiredRule | null {
  const to = parseAimoTime(l.price?.validTo ?? null);
  if (to && to.toISOString().slice(0, 10) < deliveryDate)
    return fire("PRC-02", { product: p.name, validTo: to.toISOString().slice(0, 10), date: deliveryDate });
  return null;
}

/**
 * PACK-CONTENT: kg, L or pieces per sales unit. Prefer catalogue price ÷
 * comparison price; fall back to the catalogue formula and mark it unverified.
 */
export type PackContent = { value: number; unit: BaseUnit; verified: boolean; source: string; rules: FiredRule[] };

/**
 * Pieces per sales unit, for recipes counted in pieces ("one slice each"). The count comes
 * from the name ("15pcs", "40 kpl"); it is trusted only when the price API's kg per pack
 * agrees with the name's own weight, so a guessed count is never used silently.
 */
export function piecesPerPack(p: Product, l: LookupLine | null): PackContent | null {
  // A count printed on a variable-weight product is not pieces per ordered kg.
  // Let the builder specify whole sales units instead of inventing that conversion.
  if (["KG", "L", "ZML"].includes(l?.salesUnit ?? p.catalogueSalesUnit)) return null;
  const m = p.name.match(/(\d+)\s*(?:pcs|kpl|pieces|port\.?)\b/i) ?? p.name.match(/\b(\d+)\s*x\s*\d/i);
  if (!m) return p.catalogueSalesUnit === "ST" ? { value: 1, unit: "pcs", verified: true, source: "sold by the piece", rules: [] } : null;
  const n = Number(m[1]);
  const pr = l?.price;
  const apiKg = pr && pr.comparisonPrice && pr.comparisonUnit === "KG" ? pr.value / pr.comparisonPrice : null;
  const total = p.name.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  const each = p.name.match(/(\d+)\s*g\b/i);
  const nameKg = total ? Number(total[1].replace(",", ".")) : each ? (Number(each[1]) * n) / 1000 : null;
  const verified = apiKg !== null && nameKg !== null && Math.abs(apiKg - nameKg) / apiKg <= FIXED.packDisagreePct / 100;
  return { value: n, unit: "pcs", verified, source: verified ? `${n} pieces, name checked against the price API (${round2(apiKg!)} kg)` : `${n} pieces, from the name only`, rules: verified ? [] : [fire("QTY-03", { product: p.name, content: `${n} pcs` })] };
}

export function packContent(p: Product, l: LookupLine | null, wantUnit?: BaseUnit): PackContent | null {
  if (wantUnit === "pcs") return piecesPerPack(p, l);
  const su = l?.salesUnit ?? p.catalogueSalesUnit;
  if (su === "KG") return { value: 1, unit: "kg", verified: true, source: "sales unit is KG", rules: [] };
  if (su === "L") return { value: 1, unit: "l", verified: true, source: "sales unit is L", rules: [] };
  if (su === "ZML") return null;
  const formula = p.packContent;
  const pr = l?.price;
  if (pr && pr.comparisonPrice && pr.comparisonPrice > 0 && (pr.comparisonUnit === "KG" || pr.comparisonUnit === "L")) {
    const api = pr.value / pr.comparisonPrice;
    const unit: BaseUnit = pr.comparisonUnit === "KG" ? "kg" : "l";
    const rules: FiredRule[] = [];
    if (formula && formula.unit === unit && Math.abs(formula.value - api) / api > FIXED.packDisagreePct / 100)
      rules.push(fire("QTY-04", { product: p.name, formula: `${formula.value} ${unit}`, api: `${round2(api)} ${unit}` }));
    // The comparison price is rounded to cents, so the ratio drifts (4.4993 L for a 6 × 0.75 L case).
    // When the catalogue's exact content agrees within 5%, use it: same evidence, no rounding error.
    if (formula && formula.unit === unit && Math.abs(formula.value - api) / api <= FIXED.packDisagreePct / 100)
      return { value: formula.value, unit, verified: true, source: `catalogue ${formula.value} ${unit}, confirmed by catalogPrice ÷ comparisonPrice (${round2(api)})`, rules };
    return { value: +api.toFixed(4), unit, verified: true, source: "catalogPrice ÷ comparisonPrice", rules };
  }
  if (formula) return { value: formula.value, unit: formula.unit, verified: formula.unit === "pcs", source: "catalogue net content × units", rules: formula.unit === "pcs" ? [] : [fire("QTY-03", { product: p.name, content: `${formula.value} ${formula.unit}` })] };
  return null;
}

/** MANDATE-CHECK (AP-06): the same function predicts in the agent and enforces in the gateway. */
export function mandateRules(m: Mandate, totalExVat: number, productIds: { id: string; name: string }[], siteId: string): { rules: FiredRule[]; approvalsNeeded: string[] } {
  const rules: FiredRule[] = [];
  const needed: string[] = [];
  if (!m.sites.some((s) => s.id === siteId)) rules.push(fire("DLV-05", { site: siteId }));
  if (totalExVat > m.spendCapEur) {
    rules.push(fire("MAN-01", { total: eur(totalExVat), cap: eur(m.spendCapEur) }));
    needed.push("spend_cap");
  }
  for (const p of productIds)
    if (m.blockedProducts.includes(p.id)) {
      rules.push(fire("MAN-02", { product: p.name, productId: p.id }));
      if (!needed.includes("blocked_product")) needed.push("blocked_product");
    }
  return { rules, approvalsNeeded: needed };
}
