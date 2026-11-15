import { describe, expect, it, vi } from "vitest";
import { allProducts, getProduct } from "../src/catalog.js";
import { buildCategoryTags } from "../src/categoryTags.js";
import { queryTerms, termRole } from "../src/search.js";

describe("catalogue search work", () => {
  it("validates an equivalent catalogue array once, rather than once per word match", () => {
    const base = getProduct("469363")!;
    const products = Array.from({ length: 200 }, (_, i) => ({ ...base, id: `cache-${i}` }));
    const first = buildCategoryTags(products);
    const copy = [...products].reverse();
    const has = vi.spyOn(Set.prototype, "has");
    try {
      for (let i = 0; i < 100; i++) expect(buildCategoryTags(copy)).toBe(first);
      expect(has.mock.calls.length).toBeLessThanOrEqual(products.length);
    } finally { has.mockRestore(); }
    // A new product object is still a different catalogue, even with the same ID.
    expect(buildCategoryTags([{ ...copy[0], name: "Changed catalogue item" }, ...copy.slice(1)])).not.toBe(first);
  });

  it("preserves the original role matcher for every catalogue product across languages and inflections", () => {
    const products = allProducts();
    for (const query of ["milk", "strawberry", "cream cheese", "salmon fillet", "papu", "kakku", "oat milk"]) {
      for (const term of queryTerms(query)) {
        // An empty probe disables only the fast rejection, exercising the
        // complete pre-existing matcher as the equivalence oracle.
        const unfiltered = { ...term, probes: [""] };
        const differences = products.filter((product) => termRole(product, term) !== termRole(product, unfiltered)).map((product) => product.id);
        expect(differences, `${query}: ${term.key}`).toEqual([]);
      }
    }
  });
});
