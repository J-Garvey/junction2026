/**
 * PRODUCT-SEARCH relevance: a query returns the thing asked for, not everything whose
 * name mentions it. Runs on the committed catalogue (data/products_slim.jsonl).
 */
import { describe, it, expect } from "vitest";
import { searchMatches, searchProducts } from "../src/catalog.js";
import { rulesParse } from "../src/agent/parse.js";

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

  it("a word no product has with the head is ignored; a brand alone lists the brand", () => {
    expect(names("some nice cheese")).toEqual(names("cheese"));
    expect(searchProducts({ q: "valio", limit: 50 }).every((p) => p.brand === "Valio")).toBe(true);
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

  it("falls back to mentions only when nothing is the thing", () => {
    const ms = searchMatches({ q: "oregano shaker", limit: 50 });
    expect(ms.length).toBeGreaterThan(0);
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
});
