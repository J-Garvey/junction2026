// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Question } from "@aimo/contracts";
import { api, ApiError, type BasketResp, type Person, type StatusResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { BasketPage } from "../src/screens/Baskets";
import { ManagerApprovalPanel } from "../src/ui/ManagerApprovalPanel";

const chef: Person = { id: "aino", name: "Aino", title: "Chef", role: "chef", hotelScope: false, outlets: ["banquet"] };
const manager: Person = { ...chef, id: "sanna", name: "Sanna", title: "Finance manager", role: "approver", hotelScope: true };
const submittedAt = "2026-11-14T10:00:00Z";
const expiredAt = "2026-11-15T10:01:00Z";
const review: Question = {
  id: "review-1", planId: "basket:conference", eventId: "conference", type: "order_review", forRole: "approver", outletId: null,
  quoteId: "quote-1", fingerprint: "submitted-terms", title: "Review order: Conference", body: "Aino submitted milk for finance review",
  facts: { total: 10, deliveryDate: "2026-11-16", lines: [{ lineId: "milk", product: "Milk", quantity: 5, unit: "L", lineTotal: 10 }] },
  ruleIds: [], options: [{ id: "approve", label: "Approve order", primary: true }, { id: "reject", label: "Refuse order", primary: false }],
  deadline: "2026-11-15T10:00:00Z", state: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: submittedAt,
};
const basket = {
  event: { id: "conference", name: "Conference", serviceDate: "2026-11-16" }, questions: [review], orders: [], review,
  requests: [{ id: "milk", title: "Milk", status: "waiting", summary: "In the order", createdAt: submittedAt, createdBy: "Aino", totalExVat: 10,
    orderIds: [], tooLate: null, tooLateChoice: null, basketedAt: submittedAt,
    lines: [{ id: "milk-line", productId: "464306", productName: "Milk", quantity: 5, salesUnit: "L", lineTotal: 10 }],
  }],
  orderBy: { state: "known", at: "2026-11-15T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 }, confirmed: false,
} as unknown as BasketResp;
const expired = { ...review, state: "expired" as const };
const expiredBasket = { ...basket, review: null, questions: [expired] };
const refresh = vi.fn();
function context(now = submittedAt, me = chef, tick = 0): AppCtx {
  // Like App.tsx's /api/status polling, changing clock.now need not bump tick.
  const status: StatusResp = {
    clock: { mode: "fixed", time: now, now, scene: null, scenes: {
      "1": { label: "Booking", time: submittedAt }, "2": { label: "Changes", time: submittedAt },
      "3": { label: "Review", time: submittedAt }, "4": { label: "Cutoff", time: expiredAt },
    } },
    testMode: true, dataMode: "fixture", model: { provider: "openai", model: "test", configured: false }, chain: { ok: true, brokenAt: null, entries: 0 },
  };
  return { me, people: [chef, manager], outlets: [], status, now: status.clock.now, tick, refresh, switchPerson: vi.fn() };
}
function page(ctx: AppCtx) {
  return <MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={ctx}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>;
}
const submitButton = () => screen.getByRole("button", { name: "Submit order for review" }) as HTMLButtonElement;

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("basket review expiry with the app clock", () => {
  it("recovers the builder in place, preserves review history, and submits fresh terms once", async () => {
    let current = basket;
    const load = vi.spyOn(api, "basket").mockImplementation(async () => current);
    let resolve!: (result: { review: Question }) => void;
    const submit = vi.spyOn(api, "submitBasketForReview").mockImplementation(() => new Promise((done) => { resolve = done; }));
    const view = render(page(context()));
    expect((await screen.findByRole("button", { name: "Submitted for review" }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(page(context("2026-11-15T09:59:00Z")));
    expect(load).toHaveBeenCalledTimes(1);
    current = expiredBasket;
    view.rerender(page(context(expiredAt)));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(submitButton().disabled).toBe(false);
    expect(screen.getByText("Ready to order")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Review expired", hidden: true })).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    expect(review.state).toBe("open");

    fireEvent.click(submitButton());
    fireEvent.click(screen.getByRole("button", { name: "Submitting…" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith("conference");
    const fresh = { ...review, id: "review-2", quoteId: "quote-2", createdAt: expiredAt, deadline: "2026-11-15T15:00:00Z" };
    current = { ...basket, review: fresh, questions: [fresh, expired] };
    await act(async () => resolve({ review: fresh }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Submitted for review" }) as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByRole("heading", { name: "Review expired", hidden: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Waiting for approval", hidden: true })).toBeTruthy();
    expect(screen.getAllByText(review.body)).toHaveLength(2);
    expect(refresh).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledOnce();
  });

  it.each(["stale", "failed"])("reconciles only once when the expiry read is %s and later status polls arrive", async (result) => {
    const load = vi.spyOn(api, "basket").mockResolvedValueOnce(basket);
    if (result === "failed") load.mockRejectedValue(new Error("Temporarily unavailable"));
    else load.mockResolvedValue(basket);
    const submit = vi.spyOn(api, "submitBasketForReview");
    const view = render(page(context()));
    await screen.findByRole("button", { name: "Submitted for review" });
    view.rerender(page(context(review.deadline!)));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => {});
    view.rerender(page(context(expiredAt)));
    view.rerender(page(context("2026-11-15T10:02:00Z")));
    expect(submitButton().disabled).toBe(false);
    expect(screen.getByRole("heading", { name: "Review expired", hidden: true })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows the manager's expired review and removes approval actions on a status clock update", () => {
    const answer = vi.spyOn(api, "answer");
    const panel = (now: string) => <MemoryRouter><Ctx.Provider value={context(now, manager)}><ManagerApprovalPanel q={review} orderContext /></Ctx.Provider></MemoryRouter>;
    const view = render(panel(submittedAt));
    expect(screen.getByRole("button", { name: "Order" })).toBeTruthy();
    view.rerender(panel(expiredAt));
    expect(screen.getByRole("heading", { name: "Review expired" })).toBeTruthy();
    expect(screen.getByText(/then submit for review again/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(screen.getByRole("article"), { key: "Enter" });
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps submission with the builder and shows expired history and current finance totals to the manager", async () => {
    vi.spyOn(api, "basket").mockResolvedValueOnce(basket).mockResolvedValue(expiredBasket);
    const view = render(page(context(submittedAt, manager)));
    await screen.findByRole("button", { name: "Order" });
    expect(screen.queryByRole("button", { name: /Submit.*review/ })).toBeNull();
    view.rerender(page(context(expiredAt, manager)));
    await screen.findByRole("heading", { name: "Review expired", hidden: true });
    expect(screen.queryByRole("button", { name: "Order" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Submit.*review/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Submitted for approval" })).toBeNull();
    expect(screen.getByText("Current order total · ex VAT")).toBeTruthy();
    expect(screen.getByText(review.body)).toBeTruthy();
  });

  it.each([
    { now: "2026-11-15T15:01:00Z", message: "The order has blocked items. Resolve them before submitting for review.", cutoff: "expired" as const },
    { now: expiredAt, message: "Resolve the delivery or product issues before submitting the order for review", cutoff: "known" as const },
  ])("keeps authoritative submission failures visible after expiry: $message", async ({ now, message, cutoff }) => {
    vi.spyOn(api, "basket").mockResolvedValueOnce(basket).mockResolvedValue({ ...expiredBasket, orderBy: { ...basket.orderBy, state: cutoff } });
    const submit = vi.spyOn(api, "submitBasketForReview").mockRejectedValue(new ApiError(409, { message }));
    const view = render(page(context()));
    await screen.findByRole("button", { name: "Submitted for review" });
    view.rerender(page(context(now)));
    await waitFor(() => expect(api.basket).toHaveBeenCalledTimes(2));
    fireEvent.click(submitButton());
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(submitButton().disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Submitted for review" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Review expired", hidden: true })).toBeTruthy();
    expect(submit).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("accepts a replaced review from a normal global refresh without an expiry loop", async () => {
    const load = vi.spyOn(api, "basket").mockResolvedValueOnce(basket).mockResolvedValue({ ...basket, review: null, questions: [{ ...review, state: "replaced" }] });
    const view = render(page(context()));
    await screen.findByRole("button", { name: "Submitted for review" });
    view.rerender(page(context(submittedAt, chef, 1)));
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(screen.getByRole("heading", { name: "Review replaced", hidden: true })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not expire a saved review without a deadline", async () => {
    const noDeadline = { ...review, deadline: null };
    const load = vi.spyOn(api, "basket").mockResolvedValue({ ...basket, review: noDeadline, questions: [noDeadline] });
    const view = render(page(context()));
    await screen.findByRole("button", { name: "Submitted for review" });
    view.rerender(page(context(expiredAt)));
    expect((screen.getByRole("button", { name: "Submitted for review" }) as HTMLButtonElement).disabled).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
