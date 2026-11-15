/**
 * Offline search evaluation: what the automatic shortlist (tier < 3) holds for the queries a
 * hotel kitchen types. The fixed SF-06 ranking puts price first, so it can pick any shortlisted
 * product: every product on the shortlist must be the thing asked for, not just the top few.
 *
 * Runs on the committed catalogue (data/products_slim.jsonl). It never calls the Valio Aimo API.
 * The query list started from the search-tuning audit (docs/handoffs/search-tuning/).
 */
import { describe, it, expect } from "vitest";
import type { Product } from "@aimo/contracts";
import { searchMatches } from "../src/catalog.js";
import { FIXED } from "../src/rules/catalogue.js";

type Case = {
  q: string;
  /** Fewest shortlisted products a chef should see. */
  min: number;
  /** Every shortlisted product's English or Finnish name must match. */
  all?: RegExp;
  /** No shortlisted product's name may match. */
  none?: RegExp;
  /** These product ids must be on the shortlist. */
  ids?: string[];
};

const text = (p: Product) => `${p.name} | ${p.nameFi ?? ""}`;
const shortlistFor = (q: string) => searchMatches({ q, limit: FIXED.searchLimit }).filter((m) => m.tier < 3).map((m) => m.product);

const CASES: Case[] = [
  // Cakes: real cakes, never pancakes, rice cakes, fish cakes or a cake tin.
  ...["cake", "cakes", "kakku", "birthday cake", "wedding cake"].map((q) => ({
    q, min: 30, all: /cake|kakku|kakut|kaku|torte|gateau|gâteau|torttu|tårta/i,
    none: /pancake|pannukak|rice ?cake|riisikak|corn ?cake|maissikak|fish ?cake|kalakak|crab ?cake|rapukak|potato ?cake|cake tin|vuoka/i,
  })),
  { q: "cheesecake", min: 10, all: /cheese ?cake|juustokakku/i },
  { q: "chocolate cake", min: 10, all: /chocolate|suklaa|choco|mud|cocoa|kaakao|brownie/i, none: /pancake|rice ?cake/i },
  // Pulses: what the chef cooks with, not coffee or vanilla beans.
  ...["beans", "papu"].map((q) => ({ q, min: 30, all: /bean|papu|pavu/i, none: /coffee|kahvi|vanill|cocoa|kaakao|jelly/i })),
  { q: "coffee beans", min: 5, all: /coffee|kahvi/i },
  { q: "chickpeas", min: 8, all: /chick ?peas?|kikherne/i },
  { q: "lentils", min: 8, all: /lentil|linssi/i },
  ...["peas", "herne"].map((q) => ({ q, min: 5, all: /\bpeas?\b|herne/i, none: /chick ?pea|kikherne|falafel/i })),
  { q: "frozen peas", min: 3, all: /\bpeas?\b|herne/i },
  { q: "tofu", min: 8, all: /tofu/i },
  { q: "spaghetti", min: 8, all: /spag/i },
  { q: "noodles", min: 10, all: /noodle|nuudeli|udon|soba|ramen/i },
  { q: "lettuce", min: 10, all: /lettuce|salaatti|salad/i },
  { q: "cucumber", min: 10, all: /cucumber|kurkku/i },
  { q: "avocado", min: 5, all: /avocado|avokado/i },
  { q: "hummus", min: 8, all: /hummus/i },
  { q: "honey", min: 8, all: /honey|hunaja/i, none: /chicken|kana|broiler|melon/i },
  { q: "water", min: 20, all: /water|vesi/i, none: /melon/i },
  { q: "sparkling water", min: 5, all: /water|vesi/i },
  // Pancake jam and cake jam are jams; jam yoghurt and jam doughnuts are not.
  { q: "jam", min: 20, all: /\bjam|hillo/i, none: /yog|jogurt|ice cream|jäätelö|doughnut|donitsi|munkki/i },
  { q: "strawberry jam", min: 3, all: /(strawberr|mansik).*(\bjam|hillo)|(\bjam|hillo).*(strawberr|mansik)|mansikkahillo/i },
  // Staples: the product, not something made from it or sold beside it.
  { q: "eggs", min: 8, none: /albumen|powder|jauhe|\bwhites?\b|yolk|valkuai|keltuai|spread|levite/i },
  { q: "flour", min: 20, all: /flour|jauho/i, none: /crumb|korppu|panko/i },
  { q: "onions", min: 15, all: /onion|sipuli|shal+ot/i, none: /garlic|valkosipuli|leek|purjo|spring ?onion|kevätsipuli|chive|ruoho/i },
  { q: "garlic", min: 3, all: /garlic|valkosipuli/i },
  { q: "carrots", min: 10, all: /carrot|porkkana/i },
  { q: "potatoes", min: 10, none: /fries|frites|chips|salad|sweet potato|casserole/i },
  { q: "rice", min: 20, none: /rice ?cake|riisikak|rice ?(milk|drink)|riisijuoma|vinegar|etikka|paper/i },
  { q: "milk", min: 20, none: /chocolate|powder|fermented|curdled|coconut|oat|soy/i },
  { q: "cream", min: 20, none: /ice cream|cream cheese|fra[iî]che|hand|cleaner|sour cream/i },
  { q: "butter", min: 10, all: /butter|voi/i, none: /peanut|cocoa|shea|maapähkinä/i },
  // Grated pizza cheese is a cheese; a pizza is not.
  { q: "cheese", min: 50, none: /cheesecake|cake|snacks?|sauce|slicer|biscuit|pizza(?! ?cheese|juusto)/i },
  { q: "salmon", min: 10, all: /salmon|lohi/i, none: /soup|keitto|pie\b|piiras|pasta/i },
  { q: "chicken breast", min: 10, all: /breast|rinta/i },
  { q: "chicken burger", min: 3, all: /burger|pihvi|hampurilai/i, ids: ["461651"], none: /nochicken|vegetarian|vegan/i },
  { q: "strawberries", min: 3, none: /yoghurt|ice cream|quark|pastille|jam/i },
  { q: "oat milk", min: 10, all: /oat|kaura/i },
  { q: "orange juice", min: 10, all: /orange|appelsiini/i },
  { q: "napkins", min: 20, all: /napkin|servietti|lautasliina|serviette/i },
  { q: "yoghurt", min: 20, all: /yog|jogurt/i },
  { q: "tomatoes", min: 10, none: /ketchup|sauce|soup|kastike|keitto/i },
  // Finnish words find the same products as their English names.
  { q: "juusto", min: 50 },
  { q: "kerma", min: 20 },
  { q: "lohi", min: 10, all: /salmon|lohi/i },
  { q: "mansikka", min: 3 },
];

describe("search evaluation: the shortlist is the thing the chef asked for", () => {
  it.each(CASES)("$q", ({ q, min, all, none, ids }) => {
    const ps = shortlistFor(q);
    expect(ps.length, `"${q}" shortlisted ${ps.length}`).toBeGreaterThanOrEqual(min);
    if (all) expect(ps.filter((p) => !all.test(text(p))).map(text), `"${q}": not the product`).toEqual([]);
    if (none) expect(ps.filter((p) => none.test(text(p))).map(text), `"${q}": wrong product`).toEqual([]);
    if (ids) expect(ps.map((p) => p.id)).toEqual(expect.arrayContaining(ids));
  });

  it("Finnish and English names find the same products", () => {
    const ids = (q: string) => shortlistFor(q).map((p) => p.id);
    expect(ids("kakku")).toEqual(ids("cake"));
    expect(ids("papu")).toEqual(ids("beans"));
    expect(ids("juusto")).toEqual(ids("cheese"));
  });

  it("occasion words don't narrow a product: a wedding cake is a cake", () => {
    const ids = (q: string) => shortlistFor(q).map((p) => p.id);
    expect(ids("birthday cake")).toEqual(ids("cake"));
    expect(ids("wedding cake")).toEqual(ids("cake"));
  });

  it("words that aren't products stay off the shortlist", () => {
    for (const q of ["houses", "unicorn chicken burger", "unlistedbrand milk"]) expect(shortlistFor(q), q).toEqual([]);
  });
});
