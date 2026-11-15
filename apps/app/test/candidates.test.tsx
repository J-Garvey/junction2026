// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Candidate, Need } from "@aimo/contracts";
import { Ctx, type AppCtx } from "../src/ctx";
import { CANDIDATES_SHOWN, Candidates } from "../src/ui/PlanView";

const base: Candidate = {
  productId: "x", name: "Milk", brand: null, rank: 1, rankStep: "price", label: "best",
  unitPrice: 12, pricePerBase: 1.2, baseUnit: "l", stock: { kind: "known", amount: 100 },
  reliability: null, packContent: { value: 10, unit: "l", source: "price", verified: true }, salesUnit: "KI",
  closingTime: "2026-11-19T17:00:00+0200", availableDate: "2026-11-20", source: "live", judgement: null, notes: [],
};
const needWith = (n: number): Need => ({
  id: "need", label: "milk", text: "milk", dishId: null, dishName: null, ingredientId: null, groupId: "all", groupLabel: "All", guests: null, perPortion: null, outletId: "banquet",
  amount: { value: 10, unit: "l" }, constraints: { claims: [], avoidAllergens: [], labels: [] }, pinnedProductId: null, productType: null, category: null, query: "milk", neededBy: "2026-11-20", frozen: false,
  candidates: Array.from({ length: n }, (_, i) => ({ ...base, productId: `p${i}`, name: `Milk ${i + 1}`, rank: i + 1, label: i === 0 ? "best" : i === 1 ? "better" : i === 2 ? "good" : "more" })),
  candidateCount: n, excluded: [], rules: [], judgements: [], substituteFor: null,
});
const context: AppCtx = { me: { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false }, people: [], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const show = (need: Need) => render(<MemoryRouter><Ctx.Provider value={context}><Candidates need={need} /></Ctx.Provider></MemoryRouter>);
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

afterEach(cleanup);

describe("candidates for a need", () => {
  it("is not limited to three: the best few show and every passing product loads on request", () => {
    show(needWith(12));
    expect(rows()).toHaveLength(CANDIDATES_SHOWN);
    expect(CANDIDATES_SHOWN).toBeGreaterThan(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 products" }));
    expect(rows()).toHaveLength(12);
    expect(screen.getByText("Milk 12")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(rows()).toHaveLength(CANDIDATES_SHOWN);
  });

  it("narrows an ambiguous word to one range with category chips", () => {
    const need = needWith(6);
    need.candidates.forEach((c, i) => Object.assign(c, i < 4 ? { category: "22630", categoryLabel: "Pepper, ground · ambient" } : { category: "17406", categoryLabel: "Chili, capsicum" }));
    show(need);
    const chips = screen.getByRole("group", { name: "Narrow by range" });
    fireEvent.click(within(chips).getByRole("button", { name: "Chili, capsicum 2" }));
    expect(rows()).toHaveLength(2);
    expect(screen.getByText("Milk 5")).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "All 6" }));
    expect(rows()).toHaveLength(CANDIDATES_SHOWN);
  });

  it("shows no chips when every product is from one range", () => {
    show(needWith(3));
    expect(screen.queryByRole("group", { name: "Narrow by range" })).toBeNull();
  });

  it("has no button when every product already shows", () => {
    show(needWith(4));
    expect(rows()).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});
