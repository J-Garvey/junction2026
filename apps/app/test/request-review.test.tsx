// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { SingleRequest, type Candidate, type Need, type Plan, type PlanLine, type Product } from "@aimo/contracts";
import { api, ApiError, type BasketResp, type Person, type PlanResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { RequestReviewDialog } from "../src/ui/RequestReviewDialog";
import { BasketPage } from "../src/screens/Baskets";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
const candidate: Candidate = {
  productId: "464306", name: "Replacement milk", brand: null, rank: 2, rankStep: "price", label: "good",
  unitPrice: 12, pricePerBase: 1.2, baseUnit: "l", stock: { kind: "unknown", reason: "terminal_sentinel" },
  reliability: null, packContent: { value: 10, unit: "l", source: "price", verified: true }, salesUnit: "KI",
  closingTime: "2026-11-19T17:00:00+0200", availableDate: "2026-11-20", source: "fixture", judgement: null, notes: [],
};
function fixture(approved = false): PlanResp {
  const request = SingleRequest.parse({ kind: "single", originalText: "10 l milk", siteId: "site", outletId: "banquet", neededBy: "2026-11-20", neededByText: null, parsedBy: "rules",
    lines: [{ id: "need", text: "10 l milk", query: "milk", productType: null, productId: null, category: null, quantity: { amount: 10, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] } }],
  });
  const line: PlanLine = { id: "line", needIds: ["need"], productId: "469363", productName: "Selected milk", outletId: "banquet", needAmount: { value: 10, unit: "l" }, quantity: 1,
    packContent: { value: 10, unit: "l", source: "price", verified: true }, overshoot: null, unitPrice: 20, lineTotal: 20, salesUnit: "KI", stock: { kind: "known", amount: 100 }, availableDate: "2026-11-20", closingTime: "2026-11-19T17:00:00+0200",
    reliability: null, source: "fixture", verdict: "green", status: "covered", rules: [], rankStep: null, shares: [], allocation: "primary", riskAccepted: null, removed: false,
  };
  const need: Need = { id: "need", label: "milk", text: "milk", dishId: null, dishName: null, ingredientId: null, groupId: "all", groupLabel: "All", guests: null, perPortion: null, outletId: "banquet", amount: { value: 10, unit: "l" }, constraints: request.lines[0].constraints,
    pinnedProductId: null, productType: null, category: null, query: "milk", neededBy: "2026-11-20", frozen: false, candidates: [candidate], candidateCount: 1, excluded: [], rules: [], judgements: [], substituteFor: null };
  const plan: Plan = { id: "plan", kind: "single", eventId: "event", title: "10 l milk", createdAt: "2026-11-14T10:00:00Z", createdBy: { personId: "jonas", name: "Jonas" }, siteId: "site", outletId: "banquet", neededBy: "2026-11-20", deliveryDate: "2026-11-20", urgent: false, stage: "order", status: "waiting", request, inputRules: [], needs: [need], lines: [line], quoteId: "quote", fingerprint: "quote-fp", totalExVat: 20, approvalsNeeded: [], approvalId: null, orderIds: [], idemKey: "idem", usesFixtures: true, note: null, summary: "Ready to add to the quote", questionIds: [], shortfall: null, error: null, proposal: true,
    itemReviews: [{ needId: "need", fingerprint: "item-fp", canApprove: true, quantityRequired: false, reason: null, approvedBy: approved ? "Aino" : null, approvedAt: approved ? "2026-11-14T10:00:00Z" : null }],
  };
  return { plan, questions: [] };
}
function show(initialReview: PlanResp, me = chef) {
  const onAdded = vi.fn();
  const onChanged = vi.fn();
  const refresh = vi.fn();
  const context: AppCtx = { me, people: [me], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh, switchPerson: vi.fn() };
  render(<MemoryRouter><Ctx.Provider value={context}><RequestReviewDialog initialReview={initialReview} deliveryDate="2026-11-20" onClose={vi.fn()} onAdded={onAdded} onChanged={onChanged} /></Ctx.Provider></MemoryRouter>);
  return { onAdded, onChanged, refresh };
}
beforeEach(() => {
  vi.spyOn(api, "product").mockResolvedValue({ claims: ["FREE_FROM_LACTOSE"], contains: [], mayContain: [], hasAllergenData: false } as unknown as Product);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("saved request review controls", () => {
  it("resumes item review, requires approval, stages once and refreshes the order", async () => {
    const saved = fixture();
    delete saved.plan.itemReviews;
    vi.spyOn(api, "reviewItems").mockResolvedValue(fixture());
    vi.spyOn(api, "approveItem").mockResolvedValue(fixture(true));
    let finish!: (result: PlanResp) => void;
    vi.spyOn(api, "basketPlan").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { onAdded, onChanged, refresh } = show(saved);
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Product 469363/).textContent).toContain("Fixture");
    await screen.findByText(/Dietary suitability is unknown/);
    await screen.findByRole("button", { name: "Approve milk" });
    expect(api.reviewItems).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    fireEvent.click(screen.getByRole("button", { name: "Adding…" }));
    expect(api.basketPlan).toHaveBeenCalledTimes(1);
    finish(fixture(true));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(refresh).toHaveBeenCalledOnce();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("uses a suggested replacement and requires approval of the new terms", async () => {
    const changed = fixture();
    changed.plan.lines[0] = { ...changed.plan.lines[0], productId: candidate.productId, productName: candidate.name, unitPrice: 12, lineTotal: 12, stock: candidate.stock, status: "unknown_stock" };
    changed.plan.totalExVat = 12;
    changed.plan.itemReviews![0].fingerprint = "replacement-fp";
    vi.spyOn(api, "choose").mockResolvedValue(changed);
    const { onChanged } = show(fixture(true));
    fireEvent.click(screen.getByRole("button", { name: "Suggest replacements" }));
    fireEvent.click(screen.getByRole("button", { name: "Use replacement" }));
    await screen.findByRole("button", { name: "Approve milk" });
    expect(api.choose).toHaveBeenCalledWith("plan", "need", "464306");
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Unknown: ships from the supplier/).length).toBeGreaterThan(0);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByText("0 of 1 items approved")).toBeTruthy();
  });

  it("shows changed supplier terms after an add conflict and allows review and retry", async () => {
    const changed = fixture();
    changed.plan.lines[0].unitPrice = 25;
    changed.plan.lines[0].lineTotal = 25;
    changed.plan.totalExVat = 25;
    changed.plan.itemReviews![0].fingerprint = "new-price";
    vi.spyOn(api, "basketPlan").mockRejectedValueOnce(new ApiError(409, { error: "Changed terms need approval again.", plan: changed.plan })).mockResolvedValueOnce(fixture(true));
    const approved = structuredClone(changed);
    approved.plan.itemReviews![0].approvedAt = "2026-11-14T10:00:00Z";
    approved.plan.itemReviews![0].approvedBy = "Aino";
    vi.spyOn(api, "approveItem").mockResolvedValue(approved);
    const { onAdded } = show(fixture(true));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("Changed terms");
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onAdded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect(api.approveItem).toHaveBeenCalledWith("plan", "need", "new-price"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
  });

  it("disables request changes and item decisions outside the viewer's outlet", async () => {
    vi.spyOn(api, "choose");
    vi.spyOn(api, "approveItem");
    show(fixture(), { ...chef, id: "mikko", name: "Mikko", outlets: ["bar"] });
    expect(screen.getByText(/outside your outlet scope/)).toBeTruthy();
    for (const name of ["Approve milk", "Suggest replacements", "Edit quantity for milk"]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(api.choose).not.toHaveBeenCalled();
    expect(api.approveItem).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Add to order" })).toBeNull();
  });

  it("keeps the selection after a failed replacement and allows a retry", async () => {
    vi.spyOn(api, "choose").mockRejectedValue(new ApiError(0, { message: "Can't reach the server right now. Nothing has been ordered." }));
    show(fixture());
    fireEvent.click(screen.getByRole("button", { name: "Suggest replacements" }));
    fireEvent.click(screen.getByRole("button", { name: "Use replacement" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Can't reach the server"));
    expect(screen.getByText("Selected milk")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Use replacement" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("checks an explicit sales-unit quantity before enabling item approval", async () => {
    const unresolved = fixture();
    unresolved.plan.lines[0].quantity = 0;
    unresolved.plan.lines[0].packContent = null;
    unresolved.plan.itemReviews![0] = { ...unresolved.plan.itemReviews![0], quantityRequired: true, canApprove: false, reason: "Enter the number of sales units to order, then check the quantity." };
    const checked = fixture();
    checked.plan.lines[0].quantity = 3;
    checked.plan.lines[0].lineTotal = 60;
    checked.plan.lines[0].packContent = null;
    checked.plan.totalExVat = 60;
    checked.plan.itemReviews![0].fingerprint = "quantity-fp";
    vi.spyOn(api, "itemSalesQuantity").mockResolvedValue(checked);
    show(unresolved);
    expect((screen.getByRole("button", { name: "Approve milk" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Sales units for milk" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Check quantity" }));
    await waitFor(() => expect(api.itemSalesQuantity).toHaveBeenCalledWith("plan", "need", "item-fp", "469363", 3));
    await waitFor(() => expect((screen.getByRole("button", { name: "Approve milk" }) as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/60,00/).length).toBeGreaterThan(0);
  });

  it("opens from the pending row and moves the item into the order with a persistent success message", async () => {
    const initial = fixture();
    let staged = false;
    vi.spyOn(api, "basket").mockImplementation(async () => ({
      event: { id: "event", name: "Conference dinner", serviceDate: "2026-11-20", guests: 0 },
      questions: [], orders: [], review: null, confirmed: false,
      requests: [{ ...initial.plan, createdBy: "Jonas", basketedAt: staged ? "2026-11-14T10:00:00Z" : null }],
      orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms.", usesFixtures: true },
    } as unknown as BasketResp));
    vi.spyOn(api, "plan").mockResolvedValue(initial);
    vi.spyOn(api, "approveItem").mockResolvedValue(fixture(true));
    vi.spyOn(api, "basketPlan").mockImplementation(async () => { staged = true; return fixture(true); });
    const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
    render(<MemoryRouter initialEntries={["/baskets/event"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^10 l milk/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await screen.findByText("Awaiting final order");
    expect(screen.getByText("Added to the order. Submit the final order for finance review.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^10 l milk/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Submit order for review" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
