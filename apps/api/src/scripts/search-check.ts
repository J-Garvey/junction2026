/**
 * Prints search relevance for queries, to eyeball it: the terms, home categories, tier
 * counts, what is returned and what was left out.
 * `tsx src/scripts/search-check.ts cheese "cream cheese"`; add --all for every tier.
 */
import { allProducts, searchMatches } from "../catalog.js";
import { headIndex, homeCategories, queryTerms, rank } from "../search.js";

const all = process.argv.includes("--all");
const products = allProducts();
for (const q of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const terms = queryTerms(q);
  const home = homeCategories(terms[headIndex(terms)], products);
  console.log(`\n=== "${q}" → terms [${terms.map((t) => t.key).join(", ")}]`);
  console.log("  home:", [...home].sort((a, b) => b[1].heads - a[1].heads).map(([c, h]) => `${c} ${h.heads}/${h.size}`).join(", "));
  const ms = rank(q, products, products);
  console.log(`  tiers 0-3: ${[0, 1, 2, 3].map((t) => ms.filter((m) => m.tier === t).length).join(" / ")}`);
  const shown = all ? ms : searchMatches({ q, limit: 50 });
  for (const m of shown.slice(0, all ? 400 : 25)) console.log(`  t${m.tier} ${(m.role ?? "-").padEnd(8)} ${m.product.category} ${m.product.id} ${m.product.name}`);
  if (!all) {
    const out = ms.filter((m) => m.tier >= 2);
    console.log(`  -- left out (${out.length}), sample:`);
    for (const m of out.slice(0, 12)) console.log(`     t${m.tier} ${(m.role ?? "-").padEnd(8)} ${m.product.category} ${m.product.name}`);
  }
}
