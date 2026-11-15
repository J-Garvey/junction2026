// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { api, type BasketResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { BasketPage } from "../src/screens/Baskets";

const aino: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet", "bar"], hotelScope: false };
const ctx: AppCtx = { me: aino, people: [aino], outlets: [], status: null, now: "2026-11-11T08:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const reception = {
  event: { id: "reception", name: "Partner reception", serviceDate: "2026-11-16", guests: 96, createdBy: "Mikko", createdAt: "2026-11-10T09:00:00Z" },
  questions: [], orders: [], requests: [], review: null, confirmed: false,
  orderBy: { state: "known", at: "2026-11-12T10:30:00Z", reason: "Stock is unconfirmed for 1 scheduled item.", usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 1 },
} as unknown as BasketResp;
function page(basket: BasketResp) {
  vi.spyOn(api, "basket").mockResolvedValue(basket);
  return render(<MemoryRouter initialEntries={["/baskets/reception"]}><Ctx.Provider value={ctx}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("booking context", () => {
  it("keeps the reception's saved guests and creator visible even when supplier stock is unconfirmed", async () => {
    page(reception);
    expect(await screen.findByText("96 guests")).toBeTruthy();
    expect(screen.getByText("Created by Mikko")).toBeTruthy();
    expect(screen.queryByText("Created by Aino")).toBeNull();
    expect(screen.queryByText("Guest count not entered")).toBeNull();
    expect(screen.queryByRole("button", { name: "Demo data" })).toBeNull();
  });

  it("labels missing legacy booking facts without borrowing the current viewer's identity", async () => {
    page({ ...reception, event: { ...reception.event, guests: 0, createdBy: null } });
    expect(await screen.findByText("Guest count not entered")).toBeTruthy();
    expect(screen.getByText("Creator not recorded")).toBeTruthy();
    expect(screen.queryByText("Created by Aino")).toBeNull();
  });
});
