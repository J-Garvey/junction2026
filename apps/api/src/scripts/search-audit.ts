/**
 * Precision audit: for common kitchen queries, flags results whose name says they are
 * something else (cake, sauce, snack, cup...). `tsx src/scripts/search-audit.ts`
 */
import { searchMatches } from "../catalog.js";

const QUERIES = `cheese|milk|cream|butter|eggs|salmon|potatoes|bread|coffee|tea|yoghurt|flour|sugar|chicken|ham|beef|pork|bacon|sausage|rice|pasta|
tomato|onion|garlic|carrot|lettuce|cucumber|mushroom|apple|lemon|orange|banana|strawberries|blueberries|raspberries|feta|mozzarella|
halloumi|cheddar|parmesan|cream cheese|whipping cream|sour cream|quark|oat milk|orange juice|apple juice|ice cream|chocolate|honey|jam|
oil|olive oil|vinegar|salt|pepper|mustard|ketchup|mayonnaise|shrimp|tuna|cod|lamb|turkey|duck|tofu|hummus|croissant|bagel|muffin|
cheesecake|vanilla|cinnamon|water|beer|wine|napkin|juusto|maito|kerma`.split("|").map((q) => q.trim()).filter(Boolean);
const TELL = /\b(cake|cakes|snacks?|sauce|chips|crisps|filter|cups?|napkins?|cleaner|pie|pastry|soup|salad|pizza|biscuits?|ice cream|chocolate|candy|flavou?red|drink|powder|mix|dip|bites|nuggets|casserole|lasagne)\b/i;

let flagged = 0;
for (const q of QUERIES) {
  const ms = searchMatches({ q, limit: 50 });
  const bad = ms.filter((m) => TELL.test(m.product.name) && !new RegExp(`\b${q}`, "i").test(m.product.name.match(TELL)?.[0] ?? ""));
  flagged += bad.length;
  console.log(`${q.padEnd(16)} ${String(ms.length).padStart(3)} t${ms[0]?.tier ?? "-"}  ${bad.length ? `⚠ ${bad.length}: ` + bad.slice(0, 4).map((m) => m.product.name.slice(0, 50)).join(" | ") : ""}`);
}
console.log(`\n${flagged} flagged`);
