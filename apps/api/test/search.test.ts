/**
 * PRODUCT-SEARCH relevance: a query returns the thing asked for, not everything whose
 * name mentions it. Runs on the committed catalogue (data/products_slim.jsonl).
 */
import { describe, it, expect } from "vitest";
import type { PlanLine } from "@aimo/contracts";
import { getProduct, searchMatches, searchProducts } from "../src/catalog.js";
import { rulesParse } from "../src/agent/parse.js";
import { matchesCurrentShortlists, matchesSelectedProducts, shortlist } from "../src/agent/match.js";
import { needsFromSingle } from "../src/agent/plan.js";
import { rank } from "../src/search.js";

const names = (q: string, extra: object = {}) => searchProducts({ q, limit: 50, ...extra }).map((p) => p.name);
const none = (q: string, bad: RegExp) => expect(names(q).filter((n) => bad.test(n))).toEqual([]);

describe("search finds what the product is", () => {
  it("cheese: cheeses, not cheesecake, cheese snacks, sauces or a slicer", () => {
    const ps = searchProducts({ q: "cheese", limit: 50 });
    expect(ps).toHaveLength(50);
    none("cheese", /cheesecake|(cake|snacks?|sauce|pastry|slicer|biscuit|pizza|roll|bagel|sausage|crisps|chips)/i);
    // The cheese ranges (1060x–1064x, frozen cheese 41771), spread across them rather than one range.
    expect(ps.every((p) => /^106|^4177/.test(p.category))).toBe(true);
    expect(new Set(ps.map((p) => p.category)).size).toBeGreaterThan(8);
  });

  it("Finnish works the same: juusto is cheese, maito is milk", () => {
    expect(names("juusto")).toEqual(names("cheese"));
    expect(searchProducts({ q: "maito", limit: 50 }).every((p) => p.category === "10400")).toBe(true);
  });

  it("a phrase is one thing: cream cheese is cheese, cheesecake is cake", () => {
    expect(searchProducts({ q: "cream cheese", limit: 50 }).every((p) => p.category.startsWith("106"))).toBe(true);
    const cakes = searchProducts({ q: "cheesecake", limit: 50 });
    expect(cakes.length).toBeGreaterThan(10);
    expect(cakes.every((p) => /cheese ?cake|juustokakku/i.test(`${p.name} ${p.nameFi}`))).toBe(true);
  });

  it("cream: no ice cream, cream cheese, crème fraîche or hand cream", () => {
    none("cream", /ice cream|cream cheese|fra[iî]che|hand|cleaner|sour cream/i);
  });

  it("milk: drinking milks, no milk chocolate, milk powder or fermented milk", () => {
    none("milk", /chocolate|powder|fermented|curdled|coconut/i);
    const ids = searchProducts({ q: "milk", category: "10400", claims: ["FREE_FROM_LACTOSE"], limit: 50 }).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["462775", "469363", "464306"]));
  });

  it("potatoes: potatoes, no fries, chips, salad or sweet potato", () => {
    none("potatoes", /fries|frites|chips|salad|sweet potato|casserole/i);
  });

  it("food words don't return equipment or cleaning products", () => {
    none("coffee", /coffee ?filter|(cups?|glass|glas|mug)/i);
    none("lemon", /cleaner|dishwasher|wipe|towel/i);
    none("vanilla", /napkin|candle|air freshener/i);
  });

  it("a form word keeps the product: salmon fillet finds the fillet in the trout range too", () => {
    const ids = searchProducts({ q: "salmon fillet", limit: 50 }).map((p) => p.id);
    expect(ids).toContain("462150"); // SALMON FILLET C-CUT, category 18706
    none("salmon fillet", /b(soup|pie|casserole|tart|trout)b/i);
  });

  it("flavours aren't the fruit: strawberries are strawberries, not strawberry yoghurt", () => {
    none("strawberries", /yoghurt|ice cream|quark|pastille|jam/i);
  });

  it("known conversational filler is ignored; a brand alone lists the brand", () => {
    expect(names("some nice cheese")).toEqual(names("cheese"));
    expect(searchProducts({ q: "valio", limit: 50 }).every((p) => p.brand === "Valio")).toBe(true);
  });

  it.each([
    ["chicken burger", "469770"],
    ["chicken nuggets", "469490"],
    ["beef burger", "468950"],
    ["cream cheese", "466750"],
    ["mozzarella", "466711"],
  ])("%s excludes plant analogues before stock and price ranking", (q, excluded) => {
    const ps = searchProducts({ q, limit: 50 });
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.map((p) => p.id)).not.toContain(excluded);
    expect(ps.every((p) => !p.claims.includes("VEGAN"))).toBe(true);
  });

  it("keeps explicitly requested plant alternatives available", () => {
    expect(searchProducts({ q: "NoChicken burger", limit: 50 }).map((p) => p.id)).toContain("469770");
    expect(searchProducts({ q: "chicken burger", claims: ["VEGAN"], limit: 50 }).map((p) => p.id)).toContain("469770");
    expect(searchProducts({ q: "vegan chicken burger", limit: 50 }).map((p) => p.id)).toContain("469770");
    expect(searchProducts({ q: "cream cheese", claims: ["VEGAN"], limit: 50 }).map((p) => p.id)).toContain("466750");
  });

  it.each(["NoChicken", "No Chicken", "No-Chicken", "Not Chicken", "Chicken-free", "Plant-based chicken", "Vegetarian chicken"])("rejects %s even without a dietary declaration", (identity) => {
    const p = { ...getProduct("469770")!, id: `identity-${identity}`, name: `${identity} Burger 20pcs`, nameFi: null, brand: null, claims: [] };
    expect(rank("chicken burger", [p], [p])).toEqual([]);
  });

  it.each(["unicorn chicken burger", "chicken dragonfruit burger", "unlistedbrand milk"])("does not drop unmatched qualifiers in %s", (q) => {
    expect(searchProducts({ q, limit: 50 })).toEqual([]);
  });

  it("a category hint cannot establish a different species", () => {
    expect(searchProducts({ q: "chicken", category: "18761", limit: 50 })).toEqual([]);
  });

  it("does not read Finnish carrot compounds as chicken qualifiers", () => {
    const p = { ...getProduct("469770")!, id: "carrot-burger", name: "Carrot burger", nameFi: "Porkkanaburger", brand: null, claims: [] };
    expect(rank("chicken burger", [p], [p])).toEqual([]);
  });

  it("other filters still apply, and the category a caller names is the home", () => {
    const ps = searchProducts({ q: "milk", category: "10400", claims: ["FREE_FROM_LACTOSE"], limit: 50 });
    expect(ps.length).toBeGreaterThan(20);
    expect(ps.every((p) => p.category === "10400" && p.claims.includes("FREE_FROM_LACTOSE"))).toBe(true);
  });

  it("is deterministic, and without text lists by product id", () => {
    expect(names("cheese")).toEqual(names("cheese"));
    const ids = searchProducts({ category: "10400", limit: 50 }).map((p) => p.id);
    expect(ids).toEqual([...ids].sort());
  });

  it("keeps reused catalogue matches separate by filters and limit", () => {
    const q = { q: "milk", limit: 50 };
    const original = searchMatches(q);
    expect(original.length).toBeGreaterThan(5);
    searchMatches(q).splice(0);
    const edited = searchMatches(q);
    edited[0].tier = 3;
    expect(searchMatches(q)).toEqual(original);
    expect(searchProducts({ ...q, limit: 5 })).toHaveLength(5);
    const filtered = searchProducts({ ...q, category: "10400", claims: ["FREE_FROM_LACTOSE"] });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((p) => p.category === "10400" && p.claims.includes("FREE_FROM_LACTOSE"))).toBe(true);
    const withoutMilk = searchProducts({ ...q, excludeAllergens: ["AM"] });
    expect(withoutMilk).not.toEqual(original.map((m) => m.product));
    expect(withoutMilk.every((p) => p.hasAllergenData && !p.contains.includes("AM") && !p.mayContain.includes("AM"))).toBe(true);
    expect(searchProducts({ ...q, origin: "no-such-origin" })).toEqual([]);
    expect(searchProducts({ ...q, labels: ["no-such-label"] })).toEqual([]);
  });

  it("falls back to mentions only when nothing is the thing", () => {
    const ms = searchMatches({ q: "oregano shaker", limit: 50 });
    expect(ms.length).toBeGreaterThan(0);
  });

  it("can expand a small first page and keeps each later page as the same ranked prefix", () => {
    const first = searchMatches({ q: "blueberries", limit: 1 });
    const full = searchMatches({ q: "blueberries", limit: 50 });
    expect(full.length).toBeGreaterThan(1);
    expect(first).toEqual(full.slice(0, 1));
    expect(searchMatches({ q: "blueberries", limit: 5 })).toEqual(full.slice(0, 5));
    expect(searchMatches({ q: "blueberries", limit: 25 })).toEqual(full.slice(0, 25));
  });
});

describe("the request parser keeps the product the chef named", () => {
  it("cream cheese stays cream cheese, with no cream category", () => {
    const l = rulesParse("5 kg cream cheese by Monday").lines[0];
    expect(l.query).toBe("cream cheese");
    expect(l.category).toBeNull();
  });
  it("milk still gets the milk category and type", () => {
    const l = rulesParse("I need 1,000 litres of lactose-free milk by Monday").lines[0];
    expect(l).toMatchObject({ query: "milk", category: "10400", productType: "plain drinking milk" });
  });
  it("salmon fillet keeps its form word", () => {
    expect(rulesParse("10 kg salmon fillet by Monday").lines[0].query).toBe("salmon fillet");
  });
  it.each(["oat milk", "almond milk", "coconut milk", "rice milk", "soy milk"])("preserves %s without assigning the dairy milk category", (query) => {
    expect(rulesParse(`10 l ${query} by Monday`).lines[0]).toMatchObject({ query, category: null });
  });
  it.each(["unsalted butter", "chicken burger", "Valio milk"])("preserves all product qualifiers in %s", (query) => {
    expect(rulesParse(`10 kg ${query} by Monday`).lines[0].query).toBe(query.toLowerCase());
  });
});

describe("automatic shortlisting", () => {
  const needFor = (query: string) => needsFromSingle({ ...rulesParse(`10 pcs ${query} by Monday`), siteId: "site-main", outletId: "out-kitchen" })[0];

  it("keeps unknown houses/brand substrings out of automatic product identity (AUD-MAIN-008)", () => {
    expect(shortlist(needFor("houses"))).toEqual([]);
    expect(searchMatches({ q: "houses", limit: 50 }).every((match) => match.tier === 3)).toBe(true);
  });

  it("never falls back to the category when the requested product is absent", () => {
    expect(shortlist({ ...needFor("milk"), query: "unlistedbrand milk" })).toEqual([]);
  });
  it("keeps mention-only results out of automatic purchasing", () => {
    expect(searchMatches({ q: "oregano", category: "20033", limit: 50 }).map((m) => m.tier)).toEqual([3]);
    expect(shortlist({ ...needFor("oregano"), category: "20033" })).toEqual([]);
  });
  it("shortlists actual chicken burgers, while an explicit vegan request can select NoChicken", () => {
    const need = needFor("chicken burger");
    const ps = shortlist(need);
    expect(ps.map((p) => p.id)).toContain("461651");
    expect(ps.map((p) => p.id)).not.toContain("469770");
    expect(shortlist({ ...need, constraints: { ...need.constraints, claims: ["VEGAN"] } }).map((p) => p.id)).toContain("469770");
  });
});

describe("products already selected into a basket", () => {
  const needFor = (query: string) => needsFromSingle({ ...rulesParse(`10 pcs ${query} by Monday`), siteId: "site-aurora", outletId: "banquet" })[0];
  const lineFor = (needId: string, productId: string) => ({ needIds: [needId], productId, removed: false }) as PlanLine;

  it("keeps a matching selection outside the automatic shortlist's result limit", () => {
    const need = needFor("cheese");
    const automatic = shortlist(need).map((p) => p.id);
    const product = searchMatches({ q: "cheese", limit: 1000 }).find((m) => m.tier < 3 && !automatic.includes(m.product.id))!.product;
    const lines = [lineFor(need.id, product.id)];
    expect(matchesCurrentShortlists([need], lines)).toBe(false);
    expect(matchesSelectedProducts([need], lines)).toBe(true);
  });

  it("still rejects conflicting identities, unmatched qualifiers and mention-only known products", () => {
    for (const [query, productId] of [["chicken burger", "469770"], ["unlistedbrand milk", "464306"]]) {
      const need = { ...needFor(query), pinnedProductId: null };
      expect(matchesSelectedProducts([need], [lineFor(need.id, productId)])).toBe(false);
    }
    const oregano = { ...needFor("oregano"), category: "20033" };
    const productId = searchMatches({ q: "oregano", category: "20033", limit: 50 })[0].product.id;
    expect(matchesSelectedProducts([oregano], [lineFor(oregano.id, productId)])).toBe(false);
  });

  it("requires a real product, a valid request link and passing dietary declarations", () => {
    const need = needFor("monster");
    expect(matchesSelectedProducts([need], [lineFor(need.id, "999999")])).toBe(false);
    expect(matchesSelectedProducts([need], [lineFor("missing-need", "477529")])).toBe(false);
    const allergy = { ...need, constraints: { ...need.constraints, avoidAllergens: ["AF"] } };
    expect(matchesSelectedProducts([allergy], [lineFor(need.id, "477529")])).toBe(false);
  });
});
