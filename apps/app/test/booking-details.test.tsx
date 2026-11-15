// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { api, type BasketResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { BasketPage } from "../src/screens/Baskets";
import { Fixture } from "../src/ui/Status";

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
    fireEvent.click(screen.getByRole("button", { name: "Demo data" }));
    expect(screen.getByRole("note", { name: "About demo data" }).textContent).toContain("rather than a fresh supplier check");
  });

  it("labels missing legacy booking facts without borrowing the current viewer's identity", async () => {
    page({ ...reception, event: { ...reception.event, guests: 0, createdBy: null } });
    expect(await screen.findByText("Guest count not entered")).toBeTruthy();
    expect(screen.getByText("Creator not recorded")).toBeTruthy();
    expect(screen.queryByText("Created by Aino")).toBeNull();
  });
});

describe("demo data explanation", () => {
  it("can be opened and dismissed with a keyboard", async () => {
    const user = userEvent.setup();
    render(<Fixture name="base" />);
    const badge = screen.getByRole("button", { name: "Demo data" });
    await user.tab();
    expect(document.activeElement).toBe(badge);
    await user.keyboard("{Enter}");
    expect(badge.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("note").textContent).toContain("Data set: base");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.activeElement).toBe(badge);
  });
});
