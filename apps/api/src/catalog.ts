/**
 * The local catalogue (data/products_slim.jsonl) and PRODUCT-SEARCH (chunk 02).
 * Shortlist locally first; the mock is only called for the shortlist (VA-13).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Product, ProductSearchQuery } from "@aimo/contracts";
import { config } from "./config.js";
import { registerBrand } from "./util.js";
import { relevance, type Match } from "./search.js";

type Raw = Record<string, any>;

let products: Map<string, Product> | null = null;
let raw: Map<string, Raw> | null = null;
let orderedProducts: Product[] = [];
// Only local catalogue matches are reused. Price, stock and cut-off facts are never cached here.
const searchCache = new Map<string, { matches: Match[]; limit: number }>();
const SEARCH_CACHE_LIMIT = 100;

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
  orderedProducts = [...products.values()].sort((a, b) => a.id.localeCompare(b.id));
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

/**
 * PRODUCT-SEARCH: filters the local file only. Without text, every match by product id.
 * With text, ranked by what the product is (search.ts): "cheese" returns cheeses, not
 * cheesecake. Same input, same list, same order.
 */
export function searchProducts(q: ProductSearchQuery): Product[] {
  return searchMatches(q).map((m) => m.product);
}

/** The same search with each product's relevance tier, for the gateway and tests. */
export function searchMatches(q: ProductSearchQuery): Match[] {
  loadCatalog();
  const limit = q.limit ?? 50;
  const text = q.q?.trim();
  const key = text ? JSON.stringify([text.toLowerCase().normalize("NFC"), q.category ?? null, [...(q.claims ?? [])].sort(), [...(q.excludeAllergens ?? [])].sort(), q.origin ?? null, [...(q.labels ?? [])].sort()]) : null;
  const cached = key ? searchCache.get(key) : null;
  if (cached && cached.limit >= limit) {
    searchCache.delete(key!);
    searchCache.set(key!, cached);
    return cached.matches.slice(0, limit).map((m) => ({ ...m }));
  }
  const pool: Product[] = [];
  for (const p of orderedProducts) {
    if (q.category && !p.category.startsWith(q.category)) continue;
    if (q.claims?.length && !q.claims.every((c) => p.claims.includes(c))) continue;
    if (q.excludeAllergens?.length && failsAllergens(p, q.excludeAllergens)) continue;
    if (q.origin && p.origin !== q.origin) continue;
    if (q.labels?.length && !q.labels.every((l) => p.labels.includes(l))) continue;
    pool.push(p);
    if (!text && pool.length >= limit) break;
  }
  if (!text) return pool.map((product) => ({ product, tier: 0, role: null, term: "" }));
  // Ranking already considers the whole pool; keep enough for every public page size.
  const cacheLimit = Math.max(50, limit);
  const matches = relevance(text, pool, orderedProducts, q.category, q.claims).slice(0, cacheLimit);
  searchCache.delete(key!);
  if (searchCache.size >= SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(key!, { matches, limit: cacheLimit });
  return matches.slice(0, limit).map((m) => ({ ...m }));
}

/** Every product whose name mentions the text, whatever it is (fixture recording wants them all). */
export function productsMentioning(text: string): Product[] {
  loadCatalog();
  const t = text.toLowerCase();
  return [...products!.values()].filter((p) => `${p.name} ${p.nameFi ?? ""}`.toLowerCase().includes(t)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function allProducts(): Product[] {
  loadCatalog();
  return [...products!.values()];
}
