// Print the shortlist (tier<3) for one query, with tier and category. Usage: q.ts "<query>" [n]
import { searchMatches } from "../catalog.ts";
const [q, n = "60", grep] = process.argv.slice(2);
const ms = searchMatches({ q, limit: 200 });
const sl = ms.filter((m) => m.tier < 3);
console.log(`${q}: ${sl.length} shortlisted, ${ms.length - sl.length} tier-3`);
for (const m of (grep ? ms.filter((m) => new RegExp(grep, "i").test(m.product.name)) : sl).slice(0, +n)) console.log(` t${m.tier} ${m.product.category} ${m.role} ${m.product.name} | ${m.product.nameFi}`);
