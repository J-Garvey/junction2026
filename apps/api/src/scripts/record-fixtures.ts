/**
 * Saves real mock responses for the seed pool as data/fixtures/aimo/base.json,
 * so event test runs repeat exactly (Q08.9, Q11.5). Every value served from it
 * is labelled "fixture".
 *
 * `--add-missing` records only products not yet in base.json and merges them in,
 * so new products join without moving the figures existing tests were written on.
 */
import { productsMentioning, searchProducts } from "../catalog.js";
import { fetchRaw, loadFixture, saveFixture } from "../aimo/lookup.js";

export const FIXTURE_CATEGORIES = ["10400", "10401", "10500", "10501", "18701", "17421", "41760", "10900", "41764", "21380", "41720", "21140", "41763", "22300", "85028", "18701"];
/** Name searches across categories: every product named salmon, for the demo's salmon funnel. */
export const FIXTURE_QUERIES = ["salmon"];

const addMissing = process.argv.includes("--add-missing");
const ids = new Set<string>();
for (const c of FIXTURE_CATEGORIES) for (const p of searchProducts({ category: c, limit: 50_000 } as any)) ids.add(p.id);
for (const q of FIXTURE_QUERIES) for (const p of productsMentioning(q)) ids.add(p.id);

const base = addMissing ? loadFixture("base") : null;
if (addMissing && !base) throw new Error("--add-missing needs an existing base.json");
const list = [...ids].filter((id) => !base || !(base.availability[id] || base.price[id])).sort();
console.log(`Recording ${list.length} products${addMissing ? " not yet in base.json" : ""}`);
if (list.length) {
  const r = await fetchRaw(list, "2026-11-16");
  if (base) {
    saveFixture({ ...base, availability: { ...base.availability, ...r.availability }, price: { ...base.price, ...r.price } });
    console.log(`Merged ${list.length} products into data/fixtures/aimo/base.json; mock timeNow`, r.timeNow);
  } else {
    saveFixture({ name: "base", recordedAt: new Date().toISOString(), timeNow: r.timeNow, availability: r.availability, price: r.price });
    console.log("Saved data/fixtures/aimo/base.json; mock timeNow", r.timeNow);
  }
}
