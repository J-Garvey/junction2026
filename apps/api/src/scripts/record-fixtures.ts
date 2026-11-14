/**
 * Saves real mock responses for the seed pool as data/fixtures/aimo/base.json,
 * so event test runs repeat exactly (Q08.9, Q11.5). Every value served from it
 * is labelled "fixture".
 */
import { searchProducts } from "../catalog.js";
import { fetchRaw, saveFixture } from "../aimo/lookup.js";

export const FIXTURE_CATEGORIES = ["10400", "10401", "10500", "10501", "18701", "17421", "41760", "10900", "41764", "21380", "41720", "21140", "41763", "22300", "85028", "18701"];

const ids = new Set<string>();
for (const c of FIXTURE_CATEGORIES) for (const p of searchProducts({ category: c, limit: 50_000 } as any)) ids.add(p.id);
const list = [...ids].sort();
console.log(`Recording ${list.length} products`);
const r = await fetchRaw(list, "2026-11-16");
saveFixture({ name: "base", recordedAt: new Date().toISOString(), timeNow: r.timeNow, availability: r.availability, price: r.price });
console.log("Saved data/fixtures/aimo/base.json; mock timeNow", r.timeNow);
