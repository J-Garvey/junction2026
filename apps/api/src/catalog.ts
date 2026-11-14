/**
 * The local catalogue (data/products_slim.jsonl) and PRODUCT-SEARCH (chunk 02).
 * Shortlist locally first; the mock is only called for the shortlist (VA-13).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Product, ProductSearchQuery } from "@aimo/contracts";
import { config } from "./config.js";
import { registerBrand } from "./util.js";

type Raw = Record<string, any>;

let products: Map<string, Product> | null = null;
let raw: Map<string, Raw> | null = null;

function toProduct(p: Raw, ingredients: Map<string, string>): Product {
  const su = Number(p.su_in_bu ?? 1) || 1;
  let packContent: Product["packContent"] = null;
  if (typeof p.net_l === "number" && p.net_l > 0) packContent = { value: +(p.net_l * su).toFixed(4), unit: "l" };
  else if (typeof p.net_kg === "number" && p.net_kg > 0) packContent = { value: +(p.net_kg * su).toFixed(4), unit: "kg" };
  else if (p.su === "ST") packContent = { value: 1, unit: "pcs" };
  return {
    id: String(p.id),
    name: p.en || p.fi || String(p.id),
    nameFi: p.fi ?? null,
    brand: p.brand ?? null,
    vendor: p.vendor ?? null,
    category: String(p.cat ?? ""),
    claims: p.claims ?? [],
    contains: p.contains ?? [],
    mayContain: p.may_contain ?? [],
    hasAllergenData: Boolean(p.has_allergen_data),
    origin: p.origin ?? null,
    labels: p.labels ?? [],
    catalogueSalesUnit: p.su ?? "",
    packContent,
    temperature: typeof p.temp === "number" ? p.temp : null,
    temperatureLabel: p.temp_label ?? null,
    reliability: typeof p.reliability === "number" ? p.reliability : null,
    co2KgPerKg: typeof p.co2_kg_per_kg === "number" ? p.co2_kg_per_kg : null,
    substitutes: (p.subs ?? []).map(String),
    nutrition: p.nutr100 ?? null,
    ingredients: ingredients.get(String(p.id)) ?? null,
  };
}

export function loadCatalog() {
  if (products) return;
  const ingredients = new Map<string, string>();
  for (const line of readFileSync(resolve(config.dataDir, "ingredients.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    ingredients.set(String(r.id), r.en || r.fi || "");
  }
  products = new Map();
  raw = new Map();
  for (const line of readFileSync(resolve(config.dataDir, "products_slim.jsonl"), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const p = JSON.parse(line);
    raw.set(String(p.id), p);
    const prod = toProduct(p, ingredients);
    products.set(String(p.id), prod);
    registerBrand(prod.name, prod.brand);
  }
}

export function getProduct(id: string): Product | null {
  loadCatalog();
  return products!.get(id) ?? null;
}
export function getRaw(id: string): Raw | null {
  loadCatalog();
  return raw!.get(id) ?? null;
}
export function catalogSize() {
  loadCatalog();
  return products!.size;
}

/** English words the chef types, with the Finnish stems the catalogue uses. */
const SYNONYMS: Record<string, string[]> = {
  milk: ["milk", "maito"],
  cream: ["cream", "kerma"],
  butter: ["butter", "voi"],
  salmon: ["salmon", "lohi"],
  potato: ["potato", "peruna"],
  potatoes: ["potato", "peruna"],
  bread: ["bread", "leipä", "loaf"],
  cheese: ["cheese", "juusto"],
  egg: ["egg", "muna"],
  eggs: ["egg", "muna"],
  coffee: ["coffee", "kahvi"],
  yoghurt: ["yoghurt", "yogurt", "jogurtti"],
  yogurt: ["yoghurt", "yogurt", "jogurtti"],
  flour: ["flour", "jauho"],
  sugar: ["sugar", "sokeri"],
};

function tokens(q: string): string[][] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9äöåé%-]+/i)
    .filter((t) => t.length > 1)
    .map((t) => SYNONYMS[t] ?? [t]);
}

/** A product with no allergen declaration is never "safe" for an allergy (GROUND_TRUTH 4.2). */
export function failsAllergens(p: Product, avoid: string[]): string | null {
  if (!avoid.length) return null;
  if (!p.hasAllergenData) return "no allergen declaration";
  for (const a of avoid) {
    if (a === "X99") continue;
    if (p.contains.includes(a)) return `contains ${a}`;
    if (p.mayContain.includes(a)) return `may contain ${a}`;
  }
  return null;
}

/** PRODUCT-SEARCH: filters the local file only. Same input, same list, same order (by product id). */
export function searchProducts(q: ProductSearchQuery): Product[] {
  loadCatalog();
  const toks = q.q ? tokens(q.q) : [];
  const out: Product[] = [];
  const ids = [...products!.keys()].sort();
  for (const id of ids) {
    const p = products!.get(id)!;
    if (q.category && !p.category.startsWith(q.category)) continue;
    if (q.claims?.length && !q.claims.every((c) => p.claims.includes(c))) continue;
    if (q.excludeAllergens?.length && failsAllergens(p, q.excludeAllergens)) continue;
    if (q.origin && p.origin !== q.origin) continue;
    if (q.labels?.length && !q.labels.every((l) => p.labels.includes(l))) continue;
    if (toks.length) {
      const hay = `${p.name} ${p.nameFi ?? ""} ${p.brand ?? ""}`.toLowerCase();
      if (!toks.every((alts) => alts.some((t) => hay.includes(t)))) continue;
    }
    out.push(p);
    if (out.length >= (q.limit ?? 50)) break;
  }
  return out;
}
