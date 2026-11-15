// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { api, type BasketResp, type MessageResp, type Person, type PlanResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { BasketPage } from "../src/screens/Baskets";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const basket = {
  event: { id: "conference", name: "Conference dinner", serviceDate: "2026-11-20", guests: 120 },
  questions: [], orders: [], requests: [], review: null, confirmed: false,
  orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms.", usesFixtures: true },
} as unknown as BasketResp;
const exactMatch = {
  plan: { id: "milk", proposal: true, request: { lines: [{}] }, itemReviews: [{ canApprove: true, requiresApproval: false }] },
  questions: [],
} as unknown as PlanResp;

beforeEach(() => {
  vi.spyOn(api, "basket").mockResolvedValue(basket);
  vi.spyOn(api, "request").mockResolvedValue(exactMatch);
  vi.spyOn(api, "basketPlan").mockResolvedValue({} as Awaited<ReturnType<typeof api.basketPlan>>);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openOrder() {
  render(<MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
  return await screen.findByRole("textbox", { name: "Add to this order" }) as HTMLTextAreaElement;
}

describe("order search draft", () => {
  // Regression: ORDERING-001 — an exact match must not erase the next request.
  // Found by /qa on 2026-11-15.
  it("preserves a newer draft when an earlier search finishes adding its exact match", async () => {
    let resolveMessage!: (value: MessageResp) => void;
    vi.spyOn(api, "message").mockReturnValue(new Promise((resolve) => { resolveMessage = resolve; }));
    const input = await openOrder();
    fireEvent.change(input, { target: { value: "10 l milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(api.message).toHaveBeenCalledExactlyOnceWith("10 l milk");
    fireEvent.change(input, { target: { value: "20 kg potatoes" } });
    resolveMessage({ route: "new_request", request: {} as Extract<MessageResp, { route: "new_request" | "new_request_unsure" }>["request"], note: null });
    await waitFor(() => expect(api.basketPlan).toHaveBeenCalledWith("milk"));
    await screen.findByText("Added to the order.");
    expect(input.value).toBe("20 kg potatoes");
  });

  it("clears the submitted draft when the user has not changed it", async () => {
    vi.spyOn(api, "message").mockResolvedValue({ route: "new_request", request: {} as Extract<MessageResp, { route: "new_request" | "new_request_unsure" }>["request"], note: null });
    const input = await openOrder();
    fireEvent.change(input, { target: { value: "10 l milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Added to the order.");
    expect(input.value).toBe("");
  });
});
