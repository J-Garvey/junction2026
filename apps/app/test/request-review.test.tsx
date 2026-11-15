// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { SingleRequest, type Candidate, type Need, type Plan, type PlanLine, type ProductDetails, type Question } from "@aimo/contracts";
import { api, ApiError, type BasketResp, type Person, type PlanResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { RequestReviewDialog } from "../src/ui/RequestReviewDialog";
import { BasketPage } from "../src/screens/Baskets";
import { RequestPlan } from "../src/screens/Request";

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
async function searchOrder(result: PlanResp) {
  vi.spyOn(api, "basket").mockResolvedValue({
    event: { id: "event", name: "Conference dinner", serviceDate: "2026-11-20", guests: 0 },
    questions: [], orders: [], review: null, confirmed: false, requests: [],
    orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms.", usesFixtures: true },
  } as unknown as BasketResp);
  vi.spyOn(api, "message").mockResolvedValue({ route: "new_request", request: result.plan.request!, note: null });
  vi.spyOn(api, "request").mockResolvedValue(result);
  vi.spyOn(api, "approveItem");
  const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
  render(<MemoryRouter initialEntries={["/baskets/event"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
  fireEvent.change(await screen.findByRole("textbox", { name: "Add to this order" }), { target: { value: "10 l milk" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}
beforeEach(() => {
  vi.spyOn(api, "product").mockResolvedValue({ claims: ["FREE_FROM_LACTOSE"], contains: [], mayContain: [], hasAllergenData: false } as unknown as ProductDetails);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("standalone request proposal scope", () => {
  function showProposal(me: Person) {
    const result = fixture();
    result.plan.eventId = null;
    delete result.plan.itemReviews;
    vi.spyOn(api, "plan").mockResolvedValue(result);
    vi.spyOn(api, "rules").mockResolvedValue({ mandate: { spendCapEur: 1000 } } as Awaited<ReturnType<typeof api.rules>>);
    vi.spyOn(api, "accept").mockResolvedValue(result);
    vi.spyOn(api, "choose").mockResolvedValue(result);
    const context: AppCtx = { me, people: [me], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
    const page = (person: Person) => <MemoryRouter initialEntries={["/requests/plan"]}><Ctx.Provider value={{ ...context, me: person }}><Routes><Route path="/requests/:id" element={<RequestPlan />} /></Routes></Ctx.Provider></MemoryRouter>;
    return { ...render(page(me)), page };
  }

  it("keeps the proposal visible but disables acceptance and alternatives after switching to a bar-only viewer", async () => {
    const { rerender, page } = showProposal(chef);
    const accept = await screen.findByRole("button", { name: "Add to quote" }) as HTMLButtonElement;
    expect(accept.disabled).toBe(false);
    rerender(page({ ...chef, id: "mikko", name: "Mikko", outlets: ["bar"] }));
    expect(screen.getByText("Selected milk")).toBeTruthy();
    expect(screen.getByText(/outside your outlet scope/)).toBeTruthy();
    for (const button of [accept, screen.getByRole("button", { name: /Replacement milk/ }) as HTMLButtonElement]) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(api.accept).not.toHaveBeenCalled();
    expect(api.choose).not.toHaveBeenCalled();
  });

  it.each([
    chef,
    { ...chef, id: "sanna", name: "Sanna", role: "approver" as const, hotelScope: true, outlets: [] },
  ])("allows $name to accept and choose within their scope", async (person) => {
    showProposal(person);
    fireEvent.click(await screen.findByRole("button", { name: /Replacement milk/ }));
    await waitFor(() => expect(api.choose).toHaveBeenCalledExactlyOnceWith("plan", "need", "464306"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to quote" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to quote" }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledExactlyOnceWith("plan"));
    expect(screen.queryByText(/outside your outlet scope/)).toBeNull();
  });
});

describe("saved request review controls", () => {
  function stagedPage(me = chef, unknownStock = false, submitted = false, committed = false) {
    const initial = fixture(true);
    if (unknownStock) initial.plan.lines[0].stock = { kind: "unknown", reason: "stock_sentinel" };
    if (committed) initial.plan.orderIds = ["placed"];
    const returned = { id: "refusal", type: "order_review", planId: "basket:event", eventId: "event", title: "Review order", body: "Review", facts: { total: 20 }, ruleIds: [], options: [], state: "answered", answer: "reject", answerNote: "Reduce milk to 5 l", answeredBy: { name: "Sanna" }, answeredAt: "2026-11-14T10:00:00Z", createdAt: "2026-11-14T09:00:00Z" } as unknown as Question;
    let state: "staged" | "pending" | "removed" = "staged";
    vi.spyOn(api, "basket").mockImplementation(async () => ({
      event: { id: "event", name: "Conference dinner", serviceDate: "2026-11-20", guests: 0 },
      questions: [returned], orders: committed ? [{ id: "placed", eventId: "event", state: "placed", totalExVat: 20, lines: [{ ...initial.plan.lines[0], lineNo: 1 }] }] : [], review: submitted ? { ...returned, id: "pending", state: "open", answer: null } : null, confirmed: false,
      requests: state === "removed" ? [] : [{ ...initial.plan, createdBy: "Jonas", basketedAt: state === "staged" ? "2026-11-14T10:00:00Z" : null, changeToken: "saved-token" }],
      orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms.", usesFixtures: true },
    } as unknown as BasketResp));
    const pending = fixture();
    pending.plan.itemReviews = undefined;
    pending.plan.proposal = false;
    vi.spyOn(api, "correctBasketRequest").mockImplementation(async (_event, _plan, _token, action) => { state = action === "edit" ? "pending" : "removed"; return pending; });
    vi.spyOn(api, "plan").mockResolvedValue(pending);
    vi.spyOn(api, "reviewItems").mockResolvedValue(fixture());
    vi.spyOn(api, "basketPlan").mockImplementation(async () => { state = "staged"; return fixture(true); });
    vi.spyOn(api, "submitBasketForReview").mockResolvedValue({ review: returned });
    const context: AppCtx = { me, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
    render(<MemoryRouter initialEntries={["/baskets/event"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
  }

  it.each([false, true])("preserves saved unknown-stock disclosure alongside staged processing status (submitted=%s)", async (submitted) => {
    stagedPage(chef, true, submitted);
    const request = await screen.findByRole("group", { name: "10 l milk" });
    expect(within(request).getByText("Stock not confirmed")).toBeTruthy();
    expect(within(request).getByText(submitted ? "Awaiting finance approval" : "Ready to order")).toBeTruthy();
    expect(within(request).queryByText("Ready")).toBeNull();
  });

  it("shows placed supplier items without correction or removal controls", async () => {
    stagedPage(chef, false, false, true);
    await screen.findByText("Selected milk");
    expect(screen.getByText("1 order placed with Valio Aimo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Edit request:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove request:/ })).toBeNull();
    expect(api.correctBasketRequest).not.toHaveBeenCalled();
  });

  it("edits a returned staged request through existing item review, then stages and resubmits", async () => {
    const reduced = fixture();
    reduced.plan.request!.lines[0].quantity!.amount = 5;
    reduced.plan.lines[0].quantity = 1;
    reduced.plan.itemReviews![0].fingerprint = "reduced-fp";
    vi.spyOn(api, "requote").mockResolvedValue(reduced);
    const approved = structuredClone(reduced);
    approved.plan.itemReviews![0].approvedBy = "Aino";
    approved.plan.itemReviews![0].approvedAt = "2026-11-14T10:00:00Z";
    vi.spyOn(api, "approveItem").mockResolvedValue(approved);
    stagedPage();
    await screen.findByText("Changes requested");
    fireEvent.click(screen.getByRole("button", { name: "Edit request: 10 l milk" }));
    await screen.findByRole("button", { name: "Edit quantity for milk" });
    expect(api.correctBasketRequest).toHaveBeenCalledExactlyOnceWith("event", "plan", "saved-token", "edit");
    await waitFor(() => expect(api.reviewItems).toHaveBeenCalledExactlyOnceWith("plan"));
    fireEvent.click(screen.getByRole("button", { name: "Edit quantity for milk" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity for milk" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Check item" }));
    await waitFor(() => expect(api.requote).toHaveBeenCalledWith("plan", expect.objectContaining({ lines: [expect.objectContaining({ quantity: { amount: 5, unit: "l" } })] })));
    await screen.findByRole("button", { name: "Approve milk" });
    fireEvent.click(screen.getByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByText("Reduce milk to 5 l").length).toBeGreaterThan(0);
    await waitFor(() => expect((screen.getByRole("button", { name: "Submit order for review" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Submit order for review" }));
    await waitFor(() => expect(api.submitBasketForReview).toHaveBeenCalledExactlyOnceWith("event"));
    expect(api.basketPlan).toHaveBeenCalledExactlyOnceWith("plan");
  }, 20_000);

  it("confirms removing a returned staged request and keeps refusal history", async () => {
    stagedPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove request: 10 l milk" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.correctBasketRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove request: 10 l milk" }));
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.correctBasketRequest).toHaveBeenCalledExactlyOnceWith("event", "plan", "saved-token", "remove");
    expect(screen.getByText("Changes requested")).toBeTruthy();
    expect(screen.getAllByText("Reduce milk to 5 l").length).toBeGreaterThan(0);
    await waitFor(() => expect((screen.getByRole("button", { name: "Submit order for review" }) as HTMLButtonElement).disabled).toBe(true));
  });

  it("keeps stale staged rows unchanged and shows the correction conflict", async () => {
    stagedPage();
    vi.mocked(api.correctBasketRequest).mockRejectedValue(new ApiError(409, { message: "This request changed. Refresh the order before editing or removing it." }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit request: 10 l milk" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This request changed");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Selected milk")).toBeTruthy();
    expect(api.reviewItems).not.toHaveBeenCalled();
    expect(api.basketPlan).not.toHaveBeenCalled();
  });

  it.each([
    { ...chef, outlets: ["bar"] },
    { ...chef, role: "approver" as const, hotelScope: true },
  ])("hides staged correction controls outside the builder scope", async (person) => {
    stagedPage(person);
    await screen.findByText("Selected milk");
    expect(screen.queryByRole("button", { name: /^Edit request:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove request:/ })).toBeNull();
    expect(api.correctBasketRequest).not.toHaveBeenCalled();
  });

  it("carries fresh description-parsing evidence into a request edit", async () => {
    const initial = fixture();
    initial.plan.request!.parseAuditId = "old-parsing";
    const parsed = structuredClone(initial.plan.request!);
    parsed.parseAuditId = "new-parsing";
    parsed.lines[0].query = "cream";
    vi.spyOn(api, "message").mockResolvedValue({ route: "new_request", request: parsed, note: null });
    vi.spyOn(api, "requote").mockResolvedValue(initial);
    show(initial);
    fireEvent.click(screen.getByRole("button", { name: "Edit description for milk" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Description for milk" }), { target: { value: "cream" } });
    fireEvent.click(screen.getByRole("button", { name: "Check item" }));
    await waitFor(() => expect(api.requote).toHaveBeenCalledOnce());
    expect(vi.mocked(api.requote).mock.calls[0][1]).toMatchObject({ parseAuditId: "new-parsing", lines: [{ id: "need", query: "cream" }] });
  });

  it("does not count old parsing again when only a quantity changes", async () => {
    const initial = fixture();
    initial.plan.request!.parseAuditId = "old-parsing";
    vi.spyOn(api, "message");
    vi.spyOn(api, "requote").mockResolvedValue(initial);
    show(initial);
    fireEvent.click(screen.getByRole("button", { name: "Edit quantity for milk" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Quantity for milk" }), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Check item" }));
    await waitFor(() => expect(api.requote).toHaveBeenCalledOnce());
    expect(vi.mocked(api.requote).mock.calls[0][1].parseAuditId).toBeUndefined();
    expect(api.message).not.toHaveBeenCalled();
  });

  it("keeps products in compact rows and approves only the selected item", async () => {
    const multiple = fixture();
    const request = multiple.plan.request!;
    request.lines.push({ ...structuredClone(request.lines[0]), id: "cream", query: "cream" });
    multiple.plan.lines.push({ ...structuredClone(multiple.plan.lines[0]), id: "cream-line", needIds: ["cream"], productName: "Selected cream" });
    multiple.plan.needs.push({ ...structuredClone(multiple.plan.needs[0]), id: "cream" });
    multiple.plan.itemReviews!.push({ ...multiple.plan.itemReviews![0], needId: "cream", fingerprint: "cream-fp" });
    const approved = structuredClone(multiple);
    approved.plan.itemReviews![0].approvedAt = "2026-11-14T10:00:00Z";
    approved.plan.itemReviews![0].approvedBy = "Aino";
    vi.spyOn(api, "approveItem").mockResolvedValue(approved);
    show(multiple);
    const rows = within(screen.getByRole("table", { name: "Products to review" })).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Selected milk")).toBeTruthy();
    expect(within(rows[1]).getByText("1 KI")).toBeTruthy();
    expect(within(rows[2]).getByText("Selected cream")).toBeTruthy();
    expect(screen.queryByText("Order cutoff (Helsinki)")).toBeNull();
    expect(api.product).not.toHaveBeenCalled();
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Approve milk" }));
    await screen.findByTitle("Approved by Aino");
    expect(api.approveItem).toHaveBeenCalledExactlyOnceWith("plan", "need", "item-fp");
    expect(screen.getByRole("button", { name: "Approve cream" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["DIET-01", "This product contains an avoided allergen."],
    ["DLV-06", "The supplier ordering cutoff has passed."],
  ])("keeps the %s block visible with details closed", (ruleId, message) => {
    const blocked = fixture();
    blocked.plan.lines[0].rules.push({ ruleId, outcome: "block", message, facts: {}, overridable: false });
    blocked.plan.itemReviews![0].canApprove = false;
    blocked.plan.itemReviews![0].reason = message;
    vi.spyOn(api, "approveItem");
    show(blocked);
    expect(screen.getAllByText(message).length).toBeGreaterThan(0);
    expect(screen.queryByText("Product details")).toBeNull();
    const approve = screen.getByRole("button", { name: "Approve milk" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(api.approveItem).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds a new exact match directly without opening review", async () => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    vi.spyOn(api, "basketPlan").mockResolvedValue(exact);
    await searchOrder(exact);
    await screen.findByText("Added to the order.");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.basketPlan).toHaveBeenCalledExactlyOnceWith("plan");
    expect(api.approveItem).not.toHaveBeenCalled();
    expect(api.product).not.toHaveBeenCalled();
  });

  it("updates the deadline and items from an exact-match submission without waiting for another read", async () => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    const basket = {
      event: { id: "event", name: "Conference dinner", serviceDate: "2026-11-20", guests: 0 },
      questions: [], orders: [], review: null, confirmed: false,
      requests: [{ ...exact.plan, createdBy: "Aino", basketedAt: "2026-11-14T10:00:00Z" }],
      orderBy: { state: "known", at: "2026-11-19T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 },
    } as unknown as BasketResp;
    vi.spyOn(api, "basketPlan").mockResolvedValue({ ...exact, basket });
    await searchOrder(exact);
    await screen.findByText("Added to the order.");
    expect(screen.queryByText("Unknown")).toBeNull();
    expect(document.querySelector(".basket-context time")?.getAttribute("datetime")).toBe(basket.orderBy.at);
    expect(screen.getByText("Ready to order")).toBeTruthy();
    expect(screen.getByText("Selected milk")).toBeTruthy();
    expect(api.basket).toHaveBeenCalledOnce();
  });

  it("opens review for an exception without staging it", async () => {
    vi.spyOn(api, "basketPlan");
    await searchOrder(fixture());
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Approve milk" })).toBeTruthy();
    expect(api.basketPlan).not.toHaveBeenCalled();
  });

  it("opens review when an exact match changes while being added", async () => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    const changed = fixture();
    changed.plan.lines[0].stock = { kind: "unknown", reason: "terminal_sentinel" };
    vi.spyOn(api, "basketPlan").mockRejectedValue(new ApiError(409, { error: "Supplier terms changed.", plan: changed.plan }));
    await searchOrder(exact);
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Approve milk" })).toBeTruthy();
    expect(screen.queryByText("Added to the order.")).toBeNull();
    expect(api.basketPlan).toHaveBeenCalledOnce();
  });

  it("adds an exact match without item approval or loading supporting dietary facts", async () => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    vi.spyOn(api, "basketPlan").mockResolvedValue(exact);
    vi.spyOn(api, "approveItem");
    const { onAdded } = show(exact);
    expect(screen.getByText("Matches your request")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve milk" })).toBeNull();
    expect(screen.queryByText("Stock")).toBeNull();
    expect(screen.queryByText("Order cutoff (Helsinki)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggest replacements" })).toBeNull();
    expect(api.product).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(api.basketPlan).toHaveBeenCalledOnce();
    expect(api.approveItem).not.toHaveBeenCalled();
  });

  it("reveals exact-match evidence only when details are requested", async () => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    show(exact);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText("Order cutoff (Helsinki)")).toBeTruthy();
    await screen.findByText(/Dietary suitability is unknown/);
    expect(api.product).toHaveBeenCalledWith("469363");
  });

  it.each(["Explain quantity for Selected milk", "Explain line amount for Selected milk"])("opens the existing saved details from the numeric control: %s", async (name) => {
    const exact = fixture();
    exact.plan.itemReviews![0].requiresApproval = false;
    show(exact);
    const trigger = screen.getByRole("button", { name });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Whole-pack rounding")).toBeTruthy();
    expect(document.body.textContent).toContain("20,00 € / KI × 1 KI = 20,00 €");
    await waitFor(() => expect(api.product).toHaveBeenCalledExactlyOnceWith("469363"));
    expect(screen.getByRole("button", { name: "Hide details" })).toBeTruthy();
  });

  it("loads full product details on demand even without dietary requirements", async () => {
    const exception = fixture();
    exception.plan.request!.lines[0].constraints.claims = [];
    exception.plan.lines[0].stock = { kind: "unknown", reason: "terminal_sentinel" };
    show(exception);
    expect(screen.getByRole("button", { name: "Approve milk" })).toBeTruthy();
    expect(screen.queryByText("Order cutoff (Helsinki)")).toBeNull();
    expect(screen.getByText("Approving continues with stock not confirmed.")).toBeTruthy();
    expect(api.product).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByText("Order cutoff (Helsinki)")).toBeTruthy();
    await waitFor(() => expect(api.product).toHaveBeenCalledWith("469363"));
    expect(screen.queryByText(/No dietary requirements/)).toBeNull();
  });

  it("keeps all saved supplier schedules visible when catalogue loading fails and supports retry", async () => {
    vi.mocked(api.product).mockRejectedValueOnce(new Error("Offline"));
    const saved = fixture();
    saved.plan.lines[0].availabilityEvidence = { salesBlock: false, schedules: [
      { availableDate: "2026-11-19", closingTime: "2026-11-18T17:00:00+0200", salesUnit: "KI", stock: { kind: "known", amount: 2 }, salesBlock: false },
      { availableDate: "2026-11-20", closingTime: "2026-11-19T17:00:00+0200", salesUnit: "KI", stock: { kind: "unknown", reason: "terminal_sentinel" }, salesBlock: true },
    ] };
    show(saved);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByText(/Product information could not be loaded/);
    expect(screen.getByRole("heading", { name: "Schedule 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Schedule 2" })).toBeTruthy();
    expect(screen.getByText("Order cutoff (Helsinki)")).toBeTruthy();
    expect(screen.getByText("Yes", { selector: "dd" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/Dietary suitability is unknown/);
    expect(api.product).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("Order cutoff (Helsinki)")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve milk" })).toBeTruthy();
  });

  it("resumes item review, requires approval, stages once and refreshes the order", async () => {
    const saved = fixture();
    delete saved.plan.itemReviews;
    vi.spyOn(api, "reviewItems").mockResolvedValue(fixture());
    vi.spyOn(api, "approveItem").mockResolvedValue(fixture(true));
    let finish!: (result: PlanResp) => void;
    vi.spyOn(api, "basketPlan").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { onAdded, onChanged, refresh } = show(saved);
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
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
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest replacements" }));
    // D34: a replacement with unconfirmed stock is listed, identified by the small marker.
    expect(screen.getAllByRole("img", { name: "Stock not confirmed" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Use replacement" }));
    await screen.findByRole("button", { name: "Approve milk" });
    expect(screen.getAllByRole("img", { name: "Stock not confirmed" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/can't confirm stock/)).toBeNull();
    expect(api.choose).toHaveBeenCalledWith("plan", "need", "464306");
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/Unknown: ships from the supplier/).length).toBeGreaterThan(0);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.getByText("0 of 1 items ready")).toBeTruthy();
  });

  it("lists every passing replacement, not just the first few", () => {
    const many = fixture(true);
    many.plan.needs[0].candidates = Array.from({ length: 7 }, (_, i) => ({ ...candidate, productId: `46430${i}`, name: `Replacement milk ${i + 1}`, rank: i + 2 }));
    many.plan.needs[0].candidateCount = 7;
    show(many);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest replacements" }));
    expect(screen.getAllByRole("button", { name: "Use replacement" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Show all 7 replacements" }));
    expect(screen.getAllByRole("button", { name: "Use replacement" })).toHaveLength(7);
    expect(screen.getByText("Replacement milk 7")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("button", { name: "Use replacement" })).toHaveLength(3);
  });

  it("offers a spelling and possible products when nothing matched, and orders none until picked", async () => {
    const none = fixture();
    none.plan.lines = [];
    none.plan.needs[0].candidates = [];
    none.plan.needs[0].query = "chese";
    none.plan.request!.lines[0].query = "chese";
    none.plan.needs[0].rules = [{ ruleId: "DIET-04", outcome: "block", message: "Nothing matched", facts: {}, overridable: false }];
    none.plan.needs[0].searchHelp = {
      unmatched: ["chese"], didYouMean: ["cheese"], possibleTotal: 1,
      possible: [{ productId: "466750", name: "Cheese cake", category: "41763", categoryLabel: "Cake · frozen", reason: "The name mentions \"chese\", but it may be something else.", query: "chese" }],
    };
    none.plan.itemReviews![0].canApprove = false;
    const message = vi.spyOn(api, "message").mockResolvedValue({ route: "new_request", request: { ...none.plan.request!, lines: [{ ...none.plan.request!.lines[0], query: "cheese" }] }, note: null });
    vi.spyOn(api, "requote").mockResolvedValue(fixture());
    show(none);
    const help = screen.getByRole("region", { name: "Suggestions for chese" });
    expect(within(help).getByText("Possible matches")).toBeTruthy();
    expect(within(help).getByText(/not ordered unless you pick one/)).toBeTruthy();
    fireEvent.click(within(help).getByRole("button", { name: "cheese" }));
    await waitFor(() => expect(message).toHaveBeenCalledWith("10 l cheese"));
  });

  it("checks a picked possible product again with its id pinned", async () => {
    const none = fixture();
    none.plan.lines = [];
    none.plan.needs[0].candidates = [];
    none.plan.needs[0].rules = [{ ruleId: "DIET-04", outcome: "block", message: "Nothing matched", facts: {}, overridable: false }];
    none.plan.needs[0].searchHelp = { unmatched: ["unicorn"], didYouMean: [], possibleTotal: 1,
      possible: [{ productId: "461651", name: "RF Chicken Burger", category: "41712", categoryLabel: "Breaded · frozen", reason: "No product name says \"unicorn\".", query: "chicken burger" }] };
    none.plan.itemReviews![0].canApprove = false;
    const message = vi.spyOn(api, "message").mockResolvedValue({ route: "new_request", request: none.plan.request!, note: null });
    vi.spyOn(api, "requote").mockResolvedValue(fixture());
    show(none);
    fireEvent.click(screen.getByRole("button", { name: "Use RF Chicken Burger" }));
    await waitFor(() => expect(message).toHaveBeenCalledWith("10 l 461651 chicken burger"));
  });

  it("requires a fresh approval for an exact replacement before adding it to the order", async () => {
    const knownCandidate: Candidate = { ...candidate, stock: { kind: "known", amount: 100 } };
    const changed = fixture();
    changed.plan.lines[0] = { ...changed.plan.lines[0], productId: candidate.productId, productName: candidate.name, unitPrice: 12, lineTotal: 12 };
    changed.plan.totalExVat = 12;
    changed.plan.itemReviews![0] = { ...changed.plan.itemReviews![0], fingerprint: "exact-replacement-fp", requiresApproval: true };
    changed.plan.needs[0].candidates = [knownCandidate];
    vi.spyOn(api, "choose").mockResolvedValue(changed);
    const approved = structuredClone(changed);
    approved.plan.itemReviews![0].approvedAt = "2026-11-14T10:00:00Z";
    approved.plan.itemReviews![0].approvedBy = "Aino";
    vi.spyOn(api, "approveItem").mockResolvedValue(approved);
    vi.spyOn(api, "basketPlan").mockResolvedValue(approved);
    const initial = fixture(true);
    initial.plan.needs[0].candidates = [knownCandidate];
    const { onAdded } = show(initial);
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    fireEvent.click(screen.getByRole("button", { name: "Suggest replacements" }));
    fireEvent.click(screen.getByRole("button", { name: "Use replacement" }));
    await screen.findByRole("button", { name: "Approve milk" });
    expect(screen.queryByTitle("Approved by Aino")).toBeNull();
    const add = screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(api.basketPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect(add.disabled).toBe(false));
    expect(api.approveItem).toHaveBeenCalledExactlyOnceWith("plan", "need", "exact-replacement-fp");
    fireEvent.click(add);
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
    expect(api.basketPlan).toHaveBeenCalledExactlyOnceWith("plan");
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
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
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
    vi.spyOn(api, "choose").mockRejectedValue(new ApiError(0, { message: "Can't reach the server right now." }));
    show(fixture());
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
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

  it.each([null, { value: 8.16, unit: "kg", source: "catalog", verified: false }] as const)("keeps checked sales units correctable without converting the requested pieces (pack %j)", async (packContent) => {
    function eggs(quantity: number, fingerprint: string, approved = false, unitPrice = 28.48) {
      const result = fixture(approved);
      const request = result.plan.request!;
      request.lines[0] = { ...request.lines[0], query: "468445", quantity: { amount: 30, unit: "pcs" } };
      result.plan.needs[0].amount = { value: 30, unit: "pcs" };
      result.plan.lines[0] = { ...result.plan.lines[0], productId: "468445", productName: "Kieku eggs", needAmount: { value: 30, unit: "pcs" }, quantity, packContent, unitPrice, lineTotal: quantity * unitPrice };
      result.plan.totalExVat = quantity * unitPrice;
      result.plan.itemReviews![0] = { ...result.plan.itemReviews![0], fingerprint, quantityRequired: quantity === 0, canApprove: quantity > 0 };
      return result;
    }
    vi.spyOn(api, "requote");
    vi.spyOn(api, "itemSalesQuantity").mockResolvedValueOnce(eggs(2, "two-fp")).mockResolvedValueOnce(eggs(1, "one-fp", false, 30));
    vi.spyOn(api, "approveItem").mockResolvedValueOnce(eggs(2, "two-fp", true)).mockResolvedValueOnce(eggs(1, "one-fp", true, 30));
    show(eggs(0, "unresolved-fp"));

    let input = screen.getByRole("spinbutton", { name: "Sales units for 468445" }) as HTMLInputElement;
    expect(input.step).toBe("1");
    expect(input.min).toBe("1");
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(input.checkValidity()).toBe(false);
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Check quantity" }));
    await waitFor(() => expect(api.itemSalesQuantity).toHaveBeenNthCalledWith(1, "plan", "need", "unresolved-fp", "468445", 2));
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Sales units for 468445" }) as HTMLInputElement).value).toBe("2"));
    expect(screen.getAllByText(/56,96/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve 468445" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));

    input = screen.getByRole("spinbutton", { name: "Sales units for 468445" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Check quantity" }));
    await waitFor(() => expect(api.itemSalesQuantity).toHaveBeenNthCalledWith(2, "plan", "need", "two-fp", "468445", 1));
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Sales units for 468445" }) as HTMLInputElement).value).toBe("1"));
    expect(screen.getAllByText(/30,00/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Edit quantity for 468445" }).textContent).toBe("30 pcs");
    expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Approve 468445" }));
    await waitFor(() => expect(api.approveItem).toHaveBeenLastCalledWith("plan", "need", "one-fp"));
    expect(api.requote).not.toHaveBeenCalled();
  });

  it("opens from the pending row and moves the item into the order with a persistent success message", async () => {
    const initial = fixture();
    const basket = {
      event: { id: "event", name: "Conference dinner", serviceDate: "2026-11-20", guests: 0 },
      questions: [], orders: [], review: null, confirmed: false,
      requests: [{ ...initial.plan, createdBy: "Jonas", basketedAt: null }],
      orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms.", usesFixtures: true },
    } as unknown as BasketResp;
    vi.spyOn(api, "basket").mockResolvedValue(basket);
    vi.spyOn(api, "plan").mockResolvedValue(initial);
    vi.spyOn(api, "approveItem").mockResolvedValue(fixture(true));
    vi.spyOn(api, "basketPlan").mockResolvedValue({ ...fixture(true), basket: {
      ...basket,
      requests: [{ ...basket.requests[0], basketedAt: "2026-11-14T10:00:00Z" }],
      orderBy: { state: "known", at: "2026-11-19T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 },
    } });
    const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
    render(<MemoryRouter initialEntries={["/baskets/event"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /^10 l milk/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve milk" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Add to order" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Add to order" }));
    await screen.findByText("Ready to order");
    expect(screen.getByText("Added to the order. Submit the final order for finance review.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^10 l milk/ })).toBeNull();
    expect(screen.queryByText("Unknown")).toBeNull();
    expect(document.querySelector(".basket-context time")?.getAttribute("datetime")).toBe("2026-11-19T15:00:00Z");
    expect((screen.getByRole("button", { name: "Submit order for review" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
