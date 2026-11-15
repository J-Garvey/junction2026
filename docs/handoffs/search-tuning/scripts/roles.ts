// Roles of a query's head term in products whose name matches a regex. Usage: roles.ts "<query>" "<regex>"
import { allProducts } from "../catalog.ts";
import { queryTerms, headIndex, termRole, homeCategories, rank } from "../search.ts";
const [q, re, n = "15"] = process.argv.slice(2);
const all = allProducts();
const ts = queryTerms(q); const t = ts[headIndex(ts)];
console.log("term", t.key, "en", JSON.stringify(t.en), "fi", t.fi, "home", [...homeCategories(t, all)].map(([c, h]) => `${c}:${h.heads}/${h.size}`).join(" "));
const ps = all.filter((p) => new RegExp(re, "i").test(`${p.name} | ${p.nameFi}`)).slice(0, +n);
const tiers = new Map(rank(q, ps, all).map((m) => [m.product.id, m.tier]));
for (const p of ps) console.log(` ${termRole(p, t)} t${tiers.get(p.id) ?? "-"} ${p.category} ${p.name} | ${p.nameFi}`);
