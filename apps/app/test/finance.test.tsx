// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Order, Question } from "@aimo/contracts";
import { api, type Basket, type BasketResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { FinanceHome } from "../src/screens/Finance";
import { BasketPage } from "../src/screens/Baskets";
import { eur } from "../src/format";

const manager: Person = { id: "sanna", name: "Sanna", title: "Finance manager", role: "approver", hotelScope: true, outlets: ["banquet"] };
const chef: Person = { ...manager, id: "aino", name: "Aino", title: "Chef", role: "chef", hotelScope: false };
const bar: Person = { ...chef, id: "mikko", name: "Mikko", title: "Bar manager", outlets: ["bar"] };
const question: Question = {
  id: "review", planId: "basket:wedding", eventId: "wedding", type: "order_review", forRole: "approver", outletId: null,
  quoteId: null, fingerprint: "saved", title: "Review order: Wedding", body: "Aino submitted this order to finance for approval · €120 ex VAT · 1 item",
  facts: { total: 120, items: [{ text: "Over the hotel spend cap" }, { text: "Stock is unconfirmed; the chef chose to continue" }] },
  ruleIds: ["MAN-01"], options: [{ id: "approve", label: "Approve order", primary: true }, { id: "reject", label: "Refuse order", primary: false }],
  deadline: "2026-11-15T15:00:00Z", state: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: "2026-11-14T10:00:00Z",
};
const basket: Basket = {
  id: "wedding", name: "Wedding", deliveryDate: "2026-11-16", guests: 120, coverage: { level: "none", text: "Not ordered" },
  lines: 1, totalExVat: 120, waiting: 1, waitingOthers: 0, requests: 1, approvalLevels: [{ role: "approver", count: 1 }], confirmed: false,
  orderBy: { state: "known", at: "2026-11-15T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 1 },
};
const order = (id: string, total: number, state: Order["state"] = "placed"): Order => ({
  id, quoteId: "quote", hotelId: "hotel", siteId: "site", eventId: "wedding", deliveryDate: "2026-11-16", state, lines: [],
  totalExVat: total, totalVat: 0, placedAt: "2026-11-14T10:00:00Z", placedBy: "Aino", approvalId: null, idempotencyKey: id, version: 1, flags: [],
});
const staged = { id: "milk", title: "Milk", status: "proposed", summary: "Milk", createdAt: question.createdAt, createdBy: "Aino", totalExVat: 100, orderIds: [], tooLate: null, tooLateChoice: null, basketedAt: question.createdAt, lines: [{ id: "line", productName: "Milk", quantity: 10, salesUnit: "L", lineTotal: 100 }] };
const detail = {
  event: { id: "wedding", name: "Wedding", serviceDate: "2026-11-16" }, questions: [question], requests: [staged], orders: [order("placed", 20)], review: question,
  orderBy: basket.orderBy, confirmed: false,
} as unknown as BasketResp;
const context = (me = manager): AppCtx => ({ me, people: [manager, chef, bar], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() });
const mount = (element: React.ReactNode, me = manager) => render(<MemoryRouter><Ctx.Provider value={context(me)}>{element}</Ctx.Provider></MemoryRouter>);
const mountDetail = (me = manager) => render(<MemoryRouter initialEntries={["/baskets/wedding"]}><Ctx.Provider value={context(me)}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);

beforeEach(() => {
  vi.spyOn(api, "baskets").mockResolvedValue({ baskets: [basket] });
  vi.spyOn(api, "home").mockResolvedValue({ questions: [question], events: [], plans: [], warnings: [] });
  vi.spyOn(api, "orders").mockResolvedValue({ orders: [order("placed", 40), order("amended", 30, "amended"), order("refused", 999, "rejected")] });
  vi.spyOn(api, "basket").mockResolvedValue(detail);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("manager and finance workspace", () => {
  it("puts the personal approval queue and accurately labelled spend ahead of event orders", async () => {
    mount(<FinanceHome />);
    await screen.findByRole("link", { name: "Review order" });
    const metrics = screen.getByLabelText("Finance overview");
    expect(within(metrics).getByText(eur(120))).toBeTruthy();
    expect(within(metrics).getByText(eur(70))).toBeTruthy();
    expect(metrics.textContent).not.toContain(eur(999));
    expect(metrics.textContent).toContain("including any already placed items");
    expect(screen.getByRole("link", { name: "Review order" }).getAttribute("href")).toBe("/baskets/wedding#question-review");
    expect(screen.getByRole("link", { name: "Hotel rules" }).getAttribute("href")).toBe("/rules");
    expect(screen.getByRole("link", { name: "Audit log" }).getAttribute("href")).toBe("/audit");
    expect(screen.queryByRole("button", { name: "New order" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Type a request" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Order" })).toBeNull();
  });

  it("shows only current decisions within the person's authority, earliest expiry first", async () => {
    vi.mocked(api.home).mockResolvedValue({ questions: [
      { ...question, outletId: "banquet" },
      { ...question, id: "urgent", title: "Urgent request", type: "spend_cap", outletId: "banquet", deadline: "2026-11-14T11:00:00Z" },
      { ...question, id: "expired", title: "Expired", outletId: "banquet", deadline: "2026-11-14T09:00:00Z" },
      { ...question, id: "chef", title: "Chef only", forRole: "chef" },
      { ...question, id: "waiting", title: "Still waiting", outletId: "banquet", state: "waiting" },
      { ...question, id: "replaced", title: "Replaced", outletId: "banquet", state: "replaced" },
      { ...question, id: "other-outlet", title: "Other outlet", outletId: "bar" },
      { ...question, id: "hotel", title: "Hotel-wide approval" },
    ], events: [], plans: [], warnings: [] });
    mount(<FinanceHome />, { ...manager, hotelScope: false });
    const decisions = await screen.findByRole("region", { name: "Needs your decision" });
    const rows = within(decisions).getAllByRole("article");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("heading", { name: "Urgent request" })).toBeTruthy();
    expect(within(rows[1]).getByRole("heading", { name: "Wedding" })).toBeTruthy();
  });

  it("uses TBC for a submitted total that is unknown", async () => {
    vi.mocked(api.home).mockResolvedValue({ questions: [{ ...question, facts: {} }], events: [], plans: [], warnings: [] });
    mount(<FinanceHome />);
    await screen.findByRole("link", { name: "Review order" });
    const metrics = screen.getByLabelText("Finance overview");
    expect(within(metrics).getByText("TBC")).toBeTruthy();
  });

  it("retires stale basket reviews before fetching the personal queue", async () => {
    let resolve!: (result: { baskets: Basket[] }) => void;
    vi.mocked(api.baskets).mockReturnValue(new Promise((done) => { resolve = done; }));
    mount(<FinanceHome />);
    expect(api.home).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Finance overview")).toBeNull();
    resolve({ baskets: [] });
    await screen.findByRole("link", { name: "Review order" });
    expect(api.home).toHaveBeenCalledOnce();
  });

  it("shows financial context, saved exceptions and approval controls without kitchen editing tools", async () => {
    mountDetail();
    const summary = await screen.findByRole("region", { name: "Financial summary" });
    expect(within(summary).getByText(eur(120))).toBeTruthy();
    expect(within(summary).getByText(eur(20))).toBeTruthy();
    expect(within(summary).getByText(eur(100))).toBeTruthy();
    expect(within(summary).getByText(question.body)).toBeTruthy();
    expect(within(summary).getByText("Over the hotel spend cap")).toBeTruthy();
    expect(within(summary).getByText("Stock is unconfirmed; the chef chose to continue")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Order" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refuse order" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Add to the order" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit order for review" })).toBeNull();
  });

  it("keeps unknown basket prices unknown in the manager's summary", async () => {
    vi.mocked(api.basket).mockResolvedValue({ ...detail, requests: [{ ...detail.requests[0], totalExVat: null }], review: null, questions: [] });
    mountDetail();
    const summary = await screen.findByRole("region", { name: "Financial summary" });
    expect(within(summary).getAllByText("TBC")).toHaveLength(2);
    expect(within(summary).getByText(eur(20))).toBeTruthy();
  });

  it("uses the submitted quote amount when supplier prices have changed since the draft", async () => {
    const repriced = { ...question, facts: { ...question.facts, total: 150 } };
    vi.mocked(api.basket).mockResolvedValue({ ...detail, review: repriced, questions: [repriced] });
    mountDetail();
    const summary = await screen.findByRole("region", { name: "Financial summary" });
    expect(within(summary).getByText(eur(150))).toBeTruthy();
    expect(within(summary).getByText(eur(130))).toBeTruthy();
    expect(within(summary).getByText(eur(20))).toBeTruthy();
    expect(within(summary).queryByText(eur(120))).toBeNull();
  });

  it.each([chef, bar])("keeps Submit order for review in the $title view", async (person) => {
    vi.mocked(api.basket).mockResolvedValue({ ...detail, questions: [], review: null, orderBy: { ...detail.orderBy, state: "unknown", at: null } });
    const submit = vi.spyOn(api, "submitBasketForReview").mockResolvedValue({ review: question, basket: detail });
    mountDetail(person);
    await userEvent.click(await screen.findByRole("button", { name: "Submit order for review" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith("wedding");
    await waitFor(() => expect((screen.getByRole("button", { name: "Submitted for review" }) as HTMLButtonElement).disabled).toBe(true));
    expect(document.querySelector(".basket-context time")?.getAttribute("datetime")).toBe(detail.orderBy.at);
    expect(api.basket).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Add to the order" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Financial summary" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Order" })).toBeNull();
  });
});
