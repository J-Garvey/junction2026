// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Candidate, ModelJudgement, Need, PlanLine } from "@aimo/contracts";
import { SelectionFunnel } from "../src/ui/SelectionFunnel";
import { Candidates } from "../src/ui/PlanView";
import { selectionFunnel } from "../src/ui/selection-funnel-model";

afterEach(cleanup);

// Synthetic evidence covers overlaps and uncertainty; API tests use the saved supplier fixture.
function fixture() {
  const judgement = (id: string, unsure = false): ModelJudgement => ({ fn: "TYPE-CHECK", subject: id, question: `Is product ${id} plain drinking milk?`, probability: unsure ? .55 : .99,
    threshold: { fact: .9, reject: .1 }, verdict: unsure ? "unsure" : "yes", source: unsure ? "model" : "hand_checked", model: unsure ? "test-model" : null });
  const candidate = (id: string, name: string, rank: number): Candidate => ({ productId: id, name, rank, rankStep: "price per kg or L after rounding", label: rank === 1 ? "best" : "better", brand: null,
    unitPrice: rank * 10, pricePerBase: rank, baseUnit: "l", salesUnit: "KI", packContent: { value: 10, unit: "l", verified: true, source: "price API" }, stock: { kind: "unknown", reason: "stock_sentinel" },
    closingTime: "2026-11-15T17:00:00+0200", availableDate: "2026-11-16", reliability: .99, source: "fixture", judgement: judgement(id, rank === 2), notes: [] });
  const candidates = [candidate("464306", "Selected plain milk", 1), candidate("469363", "Alternative plain milk", 2)];
  const need: Need = { id: "milk", label: "40 L lactose-free milk", text: "40 L lactose-free milk", query: "milk", amount: { value: 40, unit: "l" },
    dishId: null, dishName: null, ingredientId: null, groupId: "request", groupLabel: "This request", guests: null, perPortion: null, outletId: "out-kitchen", constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] },
    pinnedProductId: null, productType: "plain drinking milk", category: "10400", neededBy: "2026-11-16", frozen: false, candidates, candidateCount: 2, rules: [], substituteFor: null,
    excluded: [
      { productId: "465346", name: "Contradictory diet fixture", ruleId: "DIET-02", reason: "Claims lactose-free but lists lactose." },
      { productId: "463203", name: "Past-cutoff creamer", ruleId: "CUT-01", reason: "The order cutoff has passed." },
      { productId: "463203", name: "Past-cutoff creamer", ruleId: "TYP-02", reason: "Not plain drinking milk." },
      { productId: "462626", name: "Coffee milk", ruleId: "TYP-02", reason: "Not plain drinking milk." },
    ],
    judgements: candidates.map((c) => c.judgement!).concat({ ...judgement("462626"), verdict: "no", probability: .01 }),
    selectionTrace: { shortlist: [...candidates, { productId: "465346", name: "Contradictory diet fixture" }, { productId: "463203", name: "Past-cutoff creamer" }, { productId: "462626", name: "Coffee milk" }],
      stages: [{ key: "lookup", removedProductIds: [] }, { key: "eligibility", removedProductIds: ["465346"] }, { key: "cutoff", removedProductIds: ["463203"] }, { key: "type", removedProductIds: ["462626"] }, { key: "delivery", removedProductIds: [] }] },
  };
  const lines = [{ id: "selected-line", needIds: ["milk"], productId: "464306", quantity: 4, rankStep: candidates[0].rankStep, removed: false }] as PlanLine[];
  return { need, lines };
}

describe("selection funnel counts", () => {
  it("reconciles the bounded shortlist without counting a cutoff/type overlap twice", () => {
    const { need } = fixture();
    const funnel = selectionFunnel(need);
    expect(funnel.complete).toBe(true);
    expect(funnel.stages.map((s) => [s.before, s.removed.length, s.after])).toEqual([[5, 0, 5], [5, 1, 4], [4, 1, 3], [3, 1, 2], [2, 0, 2]]);
    expect(funnel.products.length).toBe(funnel.candidates.length + funnel.stages.reduce((sum, s) => sum + s.removed.length, 0));
  });

  it("flags incomplete traces rather than filling in invented counts", () => {
    const { need } = fixture();
    need.selectionTrace!.stages[2].removedProductIds.push("not-in-shortlist");
    need.candidateCount = 99;
    const funnel = selectionFunnel(need);
    expect(funnel.complete).toBe(false);
    expect(funnel.candidates).toHaveLength(2);
    expect(funnel.stages[2].removed).toHaveLength(1);
  });
});

describe("selection evidence controls", () => {
  it("drills into every stage with keyboard controls and preserves focus on Escape", async () => {
    const user = userEvent.setup();
    const { need, lines } = fixture();
    render(<SelectionFunnel need={need} lines={lines} />);
    await user.tab();
    const root = screen.getByRole("button", { name: "Selection funnel for 40 L lactose-free milk" });
    expect(document.activeElement).toBe(root);
    await user.keyboard("{Enter}");
    expect(screen.getByText(/bounded shortlist passed to ranking/)).toBeTruthy();
    await user.tab();
    const shortlist = screen.getByRole("button", { name: "Bounded shortlist: 5" });
    expect(document.activeElement).toBe(shortlist);
    await user.keyboard(" ");
    const region = screen.getByRole("region", { name: "Bounded shortlist: 5" });
    expect(within(region).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(shortlist);
    expect(shortlist.getAttribute("aria-expanded")).toBe("false");
    expect(root.getAttribute("aria-expanded")).toBe("true");

    for (const stage of selectionFunnel(need).stages) {
      const name = `${stage.label}: ${stage.before} → ${stage.after} · ${stage.removed.length} ${stage.key === "lookup" ? "not evaluated" : "removed"}`;
      const button = screen.getByRole("button", { name });
      button.focus();
      await user.keyboard("{Enter}");
      const details = screen.getByRole("region", { name });
      for (const removed of stage.removed) {
        expect(within(details).getByText(removed.name)).toBeTruthy();
        expect(within(details).getByText(`Product ${removed.productId}`)).toBeTruthy();
        for (const reason of need.excluded.filter((e) => e.productId === removed.productId)) {
          expect(within(details).getByText(reason.ruleId)).toBeTruthy();
          expect(details.textContent).toContain(reason.reason);
        }
      }
      await user.keyboard("{Escape}");
      expect(document.activeElement).toBe(button);
    }
  });

  it("shows all ranked alternatives, actual plan selection, uncertainty and evidence sources", async () => {
    const user = userEvent.setup();
    const { need, lines } = fixture();
    render(<Candidates need={need} lines={lines} />);
    await user.click(screen.getByRole("button", { name: /Selection funnel for/ }));
    await user.click(screen.getByRole("button", { name: /Final ranking: 2 candidates · 1 selected/ }));
    const ranking = screen.getByRole("region", { name: /Final ranking:/ });
    expect(within(ranking).getByText("Selected in plan")).toBeTruthy();
    expect(within(ranking).getByText("Retained alternative · not selected")).toBeTruthy();
    expect(within(ranking).getByText(/Selection ranking reason: price per kg or L after rounding/)).toBeTruthy();
    expect(within(ranking).getByText("Uncertain")).toBeTruthy();
    expect(ranking.textContent).toContain("probability 0,55 · source: model (test-model)");
    expect(ranking.textContent).toContain("probability 0,99 · source: hand checked");
    expect(ranking.textContent).toContain("Valio Aimo sent a placeholder figure");
    expect(within(ranking).getByText(/Retained alternatives were not rejected/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Product-type evidence: 3 checked · 1 uncertain" }));
    expect(within(screen.getByRole("region", { name: /Product-type evidence:/ })).getByText("Coffee milk")).toBeTruthy();
  });

  it("does not label rank one selected when the buyer selected an alternative", async () => {
    const user = userEvent.setup();
    const { need, lines } = fixture();
    lines[0].removed = true;
    lines.push({ ...lines[0], id: "replacement", productId: "469363", removed: false });
    render(<SelectionFunnel need={need} lines={lines} />);
    await user.click(screen.getByRole("button", { name: /Selection funnel for/ }));
    await user.click(screen.getByRole("button", { name: /Final ranking:/ }));
    const ranking = screen.getByRole("region", { name: /Final ranking:/ });
    const selected = within(ranking).getByText("Selected in plan").closest("li")!;
    expect(selected.textContent).toContain("Alternative plain milk");
    expect(selected.textContent).toContain("A separate buyer-choice or allocation reason was not recorded");
  });

  it("explains older and empty plans and never invents a recipe-pinned salmon funnel", async () => {
    const user = userEvent.setup();
    const { need } = fixture();
    delete need.selectionTrace;
    const { rerender } = render(<SelectionFunnel need={need} lines={[]} />);
    await user.click(screen.getByRole("button", { name: /Selection funnel for/ }));
    expect(screen.getByText(/older plan has no saved shortlist trace/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Products with saved evidence: 5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Saved exclusions: 5 → 2 · 3 removed" })).toBeTruthy();
    rerender(<SelectionFunnel need={{ ...need, candidates: [], candidateCount: 0, excluded: [], judgements: [] }} lines={[]} />);
    expect(screen.getByRole("button", { name: /Final ranking: 0 candidates · 0 selected/ })).toBeTruthy();
    rerender(<SelectionFunnel need={{ ...need, label: "Salmon", pinnedProductId: "469672" }} lines={[]} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps missing lookup evidence distinct from a rule rejection", async () => {
    const user = userEvent.setup();
    const { need } = fixture();
    need.selectionTrace!.shortlist.push({ productId: "missing", name: "No lookup fixture" });
    need.selectionTrace!.stages[0].removedProductIds.push("missing");
    render(<SelectionFunnel need={need} lines={[]} />);
    await user.click(screen.getByRole("button", { name: /Selection funnel for/ }));
    await user.click(screen.getByRole("button", { name: "Supplier lookup evidence: 6 → 5 · 1 not evaluated" }));
    expect(screen.getByText(/Not evaluated; no rejection rule recorded/)).toBeTruthy();
  });

  it("identifies saved plan selections missing from the candidate evidence", async () => {
    const user = userEvent.setup();
    const { need, lines } = fixture();
    lines[0].productId = "old-selection";
    lines[0].productName = "Previously selected milk";
    render(<SelectionFunnel need={need} lines={lines} />);
    await user.click(screen.getByRole("button", { name: /Selection funnel for/ }));
    await user.click(screen.getByRole("button", { name: /Final ranking: 2 candidates · 1 selected/ }));
    expect(screen.getByText(/Previously selected milk \(old-selection\).*Selection evidence for these products is incomplete/)).toBeTruthy();
    expect(screen.getAllByText("Retained alternative · not selected")).toHaveLength(2);
  });
});
