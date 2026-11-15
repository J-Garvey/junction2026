/**
 * Writes the category tags (categoryTags.ts) to data/category_tags.json for people to read: what
 * each of the catalogue's categories holds, in its own product names' words, English and Finnish,
 * with the label the app shows on a category chip. Built from data/products_slim.jsonl only; no API
 * call. The output is deterministic, so a rebuild only changes when the catalogue does.
 *
 *   pnpm --filter @aimo/api tags            # writes data/category_tags.json
 *   pnpm --filter @aimo/api tags 22630      # prints one category instead
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { allProducts } from "../catalog.js";
import { buildCategoryTags, categoryLabel, TAG_FOCUS, TAG_MIN, TAG_SHARE, TAG_SOURCES } from "../categoryTags.js";
import { config } from "../config.js";

const all = allProducts();
const { cats } = buildCategoryTags(all);
const rows = [...cats.values()].map((c) => ({
  category: c.category,
  label: categoryLabel(c.category, all),
  size: c.size,
  storage: c.storage,
  en: c.en.map(({ word, n, share, focus }) => ({ word, n, share, focus })),
  fi: c.fi.map(({ word, n, share, focus }) => ({ word, n, share, focus })),
  examples: c.examples,
}));

const only = process.argv[2];
if (only) {
  console.log(JSON.stringify(rows.find((r) => r.category === only) ?? `No category ${only}`, null, 2));
} else {
  const out = {
    source: "data/products_slim.jsonl, built by apps/api/src/categoryTags.ts",
    rule: `A tag is a word in at least ${TAG_MIN} product names and ${TAG_SHARE * 100}% of the category, whose products are at least ${TAG_FOCUS * 100}% in this category, used by at least ${TAG_SOURCES} brands, and not a country. Finnish tags are compound tails that are real words.`,
    categories: rows,
  };
  const path = resolve(config.dataDir, "category_tags.json");
  writeFileSync(path, JSON.stringify(out, null, 1) + "\n");
  const tagged = rows.filter((r) => r.en.length || r.fi.length).length;
  console.log(`Wrote ${rows.length} categories (${tagged} with tags) to ${path}`);
}
