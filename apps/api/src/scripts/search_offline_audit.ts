// Offline search audit: what the app's shortlist (tier < 3) gets for each query,
// using only the local catalogue. No calls to the Valio Aimo API.
// Run from apps/api: pnpm exec tsx <this file>
import { searchMatches, allProducts } from "../catalog.js";
import { queryTerms, rank, headIndex, homeCategories } from "../search.js";

const Q = process.argv.slice(2).length ? process.argv.slice(2) : `cake|cakes|birthday cake|wedding cake|sponge cake|chocolate cake|cheesecake|pancakes|beans|green beans|baked beans|chickpeas|lentils|peas|tofu|spaghetti|noodles|rice|oat milk|eggs|chicken breast|chicken|lettuce|cucumber|avocado|black pepper|pepper|hummus|sparkling water|water|honey|tea|beef|pork|ham|bacon|sausage|apple|apples|lemon|lemons|carrots|garlic|mushrooms|yoghurt|quark|feta|mozzarella|orange juice|chocolate|vanilla|jam|wine|beer|napkins|kakku|papu|juusto|leipä|mansikka|kerma|voi|kana|lohi|chese|tomatos|strawbery|gluten free bread|lactose free cream|vegan cheese|coffee beans|frozen peas|cherry tomatoes`.split("|");

const all = allProducts();
const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
for (const q of Q) {
  const terms = queryTerms(q);
  const ms = rank(q, all, all);
  const tiers = [0, 1, 2, 3].map((t) => ms.filter((m) => m.tier === t).length);
  const shortlist = searchMatches({ q, limit: 50 }).filter((m) => m.tier < 3);
  const top = shortlist.slice(0, 3).map((m) => pad(m.product.name, 34)).join(" ; ");
  const hidden = ms.filter((m) => m.tier === 3 && m.role === "head").slice(0, 2).map((m) => pad(m.product.name, 30)).join(" ; ");
  const home = [...homeCategories(terms[headIndex(terms)], all).entries()].sort((a, b) => b[1].heads - a[1].heads).slice(0, 3).map(([c, h]) => `${c}:${h.heads}`).join(",");
  console.log(`${pad(q, 18)} terms=[${terms.map((t) => t.key).join(",")}]`.padEnd(48) + ` tiers=${tiers.join("/").padEnd(14)} shortlist=${String(shortlist.length).padStart(2)}  home=${pad(home, 26)} | ${shortlist.length ? top : "EMPTY; real matches hidden in tier 3: " + hidden}`);
}
