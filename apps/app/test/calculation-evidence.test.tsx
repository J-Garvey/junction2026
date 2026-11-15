// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Order, Plan, PlanLine, Question } from "@aimo/contracts";
import { api, type BasketResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { MoneyView } from "../src/ui/PlanView";
import { LineCalculation, TotalCalculation, VatCalculation, evidencedVat, matchingVatLines } from "../src/ui/CalculationEvidence";
import { OrderItemDialog } from "../src/ui/OrderItemDialog";
import { FinanceOrderSummary } from "../src/screens/Finance";
import { Orders } from "../src/screens/Orders";
import { BasketPage } from "../src/screens/Baskets";
import { RequestPlan } from "../src/screens/Request";
import { eur } from "../src/format";

// Supplier price and tax evidence actually recorded in the Junction sandbox.
const saved = JSON.parse(readFileSync(resolve("../../data/fixtures/aimo/base.json"), "utf8"));
const milkPrice = saved.price["469363"];
const chef: Person = { id: "aino", name: "Aino", title: "Chef", role: "chef", hotelScope: false, outlets: ["banquet"] };
const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: saved.timeNow, tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const line = (changes: Partial<PlanLine> = {}): PlanLine => ({
  id: "milk", productId: "469363", productName: "Saved milk", needIds: ["need"], outletId: "banquet", quantity: 3, salesUnit: "L",
  unitPrice: milkPrice.catalogPrice.value, lineTotal: 7.44, needAmount: { value: 2.1, unit: "l" }, packContent: { value: 1, unit: "l", source: "price", verified: true },
  shares: [{ needId: "need", label: "Breakfast", amount: 2.1 }], stock: { kind: "known", amount: 384 }, source: "fixture", overshoot: null,
  availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200", rules: [], status: "covered", verdict: "green", allocation: "primary", removed: false, reliability: null, rankStep: null, riskAccepted: null, ...changes,
});
const plan = (changes: Partial<Plan> = {}): Plan => ({
  id: "plan", title: "Milk request", kind: "single", eventId: "wedding", stage: "order", status: "waiting", createdAt: saved.timeNow, createdBy: { personId: "aino", name: "Aino" },
  siteId: "site", outletId: "banquet", neededBy: "2026-11-16", deliveryDate: "2026-11-16", urgent: false, request: null, inputRules: [], needs: [], lines: [line()],
  quoteId: null, fingerprint: null, totalExVat: 7.44, totalVat: 0, approvalsNeeded: [], approvalId: null, orderIds: [], idemKey: "idem", usesFixtures: true, note: null, summary: "Saved plan", questionIds: [], shortfall: null, error: null, ...changes,
});
const order = (): Order => ({
  id: "receipt", quoteId: "quote", eventId: "wedding", hotelId: "hotel", siteId: "site", deliveryDate: "2026-11-16", state: "placed",
  lines: [{ ...line(), productId: "469363", stock: { kind: "known", amount: 384 }, source: "fixture", lineNo: 1, ref: "milk", taxRate: milkPrice.tax.taxRate, priceValidTo: milkPrice.catalogPrice.validTo, logisticModel: "Stock", outcome: "order" }],
  totalExVat: 7.44, totalVat: 1, version: 1, placedAt: saved.timeNow, placedBy: "Aino", approvalId: null, idempotencyKey: "idem", flags: [],
});
const mount = (children: React.ReactNode) => render(<MemoryRouter><Ctx.Provider value={context}>{children}</Ctx.Provider></MemoryRouter>);
const normalized = (node: HTMLElement) => node.textContent!.replace(/\s+/g, " ");
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("saved calculation evidence", () => {
  it("reconciles the displayed money total and opens whole-pack maths with mouse and keyboard without fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    const removed = line({ id: "removed", productName: "Removed cake", lineTotal: 999, removed: true });
    const split = line({ id: "split", productName: "Split milk", quantity: 1, lineTotal: 2.48, allocation: "partial", needAmount: { value: 1, unit: "l" } });
    mount(<MoneyView plan={plan({ totalExVat: 9.92, lines: [line(), split, removed] })} warnings={[]} cap={10} />);
    const trigger = screen.getByRole("button", { name: `Explain order total: ${eur(9.92)}` });
    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: trigger.getAttribute("aria-label")! });
    expect(normalized(dialog)).toContain("7,44 € + 2,48 € = 9,92 €");
    const drill = within(dialog).getByText("Saved milk: 7,44 €", { selector: "summary" });
    // Happy DOM implements summary clicks, but not the browser's native Enter activation.
    await user.click(drill);
    expect(drill.parentElement!.hasAttribute("open")).toBe(true);
    expect(normalized(drill.parentElement!)).toContain("2,1 ÷ 1 = 2,1; round up to 3 sales units");
    expect(normalized(drill.parentElement!)).toContain("2,48 € / L × 3 L = 7,44 €");
    expect(normalized(dialog)).toContain("Removed cake: 999,00 € · removed, excluded");
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
    await user.click(screen.getByRole("button", { name: "Explain line amount for Saved milk" }));
    expect(normalized(screen.getByRole("dialog"))).toContain("Saved calculation");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps an unknown included price and the budget difference unknown while excluding removed unknown prices", async () => {
    const user = userEvent.setup();
    mount(<MoneyView plan={plan({ totalExVat: 7.44, lines: [line(), line({ id: "unknown", productName: "Unknown price", unitPrice: null, lineTotal: null })] })} warnings={[]} cap={10} />);
    await user.click(screen.getByRole("button", { name: "Explain order total: TBC" }));
    expect(normalized(screen.getByRole("dialog"))).toContain("Known subtotal: 7,44 €");
    expect(normalized(screen.getByRole("dialog"))).toContain("a complete total cannot be verified");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Explain budget over or under amount" }));
    expect(normalized(screen.getByRole("dialog"))).toContain("unknown order price leaves the budget difference unknown");
    cleanup();
    mount(<MoneyView plan={plan({ lines: [line(), line({ id: "removed", removed: true, lineTotal: null })] })} warnings={[]} cap={10} />);
    expect(screen.getByRole("button", { name: `Explain order total: ${eur(7.44)}` })).toBeTruthy();
  });

  it.each([{ cap: 7, text: "7,44 € − hotel spend cap 7,00 € = 0,44 €", label: "+0,44 €" }, { cap: 10, text: "7,44 € − hotel spend cap 10,00 € = −2,56 €", label: "2,56 € left" }, { cap: 7.44, text: "7,44 € − hotel spend cap 7,44 € = 0,00 €", label: "0,00 € left" }])("explains budget subtraction at the displayed precision ($cap)", async ({ cap, text, label }) => {
    mount(<MoneyView plan={plan()} warnings={[]} cap={cap} />);
    const trigger = screen.getByRole("button", { name: "Explain budget over or under amount" });
    expect(normalized(trigger)).toBe(label);
    await userEvent.click(trigger);
    expect(normalized(screen.getByRole("dialog"))).toContain(text);
  });

  it("retains mismatched historical amounts instead of silently inventing a reconciling calculation", async () => {
    mount(<TotalCalculation title="old total" total={20} lines={[line({ lineTotal: 10 })]} />);
    await userEvent.click(screen.getByRole("button", { name: `Explain old total: ${eur(20)}` }));
    const dialog = screen.getByRole("dialog");
    expect(normalized(dialog)).toContain("saved total differs from that sum by 10,00 €");
    await userEvent.click(within(dialog).getByText("Saved milk: 10,00 €", { selector: "summary" }));
    expect(normalized(dialog)).toContain("saved amount differs by 2,56 €");
  });

  it("shows high precision unit prices, rounded line amounts, and partial allocations without adding repeated needs", () => {
    mount(<LineCalculation line={line({ unitPrice: 1.2345, quantity: 2, lineTotal: 2.47, allocation: "unknown_fill", stock: { kind: "unknown", reason: "terminal_sentinel" } })} />);
    expect(normalized(document.body)).toContain("1,2345 € / L × 2 L = 2,47 €");
    expect(normalized(document.body)).toContain("2 × 1 = 2 l · stock not confirmed");
    expect(normalized(document.body)).toContain("other split lines are counted separately");
    expect(normalized(document.body)).toContain("must not be added across allocations");
    cleanup();
    mount(<LineCalculation line={line({ packContent: null })} />);
    expect(screen.getByText(/Required and ordered amounts cannot be compared/)).toBeTruthy();
  });

  it("uses saved supplier tax rates, excludes removed tax lines, and rounds VAT after summing", async () => {
    const receipt = order();
    receipt.lines.push({ ...receipt.lines[0], lineNo: 2, removed: true, taxRate: null, lineTotal: 999 });
    mount(<VatCalculation totalVat={receipt.totalVat} lines={receipt.lines} scope="receipt" />);
    await userEvent.click(screen.getByRole("button", { name: `Explain VAT for receipt: ${eur(1)}` }));
    const dialog = normalized(screen.getByRole("dialog"));
    expect(dialog).toContain("7,44 € × 13,5% = 1,00 €");
    expect(dialog).not.toContain("999");
    expect(evidencedVat(0, [{ ...line(), taxRate: 0 }])).toBe(0);
    expect(evidencedVat(0, [{ ...line(), taxRate: null }])).toBeNull();
    expect(evidencedVat(0, [])).toBeNull();
    cleanup();
    mount(<VatCalculation totalVat={0} lines={[{ ...line(), taxRate: null }]} scope="older snapshot" />);
    await userEvent.click(screen.getByRole("button", { name: "Explain VAT for older snapshot: TBC" }));
    expect(normalized(screen.getByRole("dialog"))).toContain("catalogue VAT category does not establish a tax rate");
    cleanup();
    // Each line's tax rounds to zero alone; the aggregate must round to one cent.
    mount(<VatCalculation totalVat={0.01} lines={Array.from({ length: 2 }, () => ({ ...line(), lineTotal: 0.03, taxRate: 13.5 }))} scope="rounded tax" />);
    await userEvent.click(screen.getByRole("button", { name: `Explain VAT for rounded tax: ${eur(0.01)}` }));
    expect(normalized(screen.getByRole("dialog"))).toContain("0,03 € × 13,5% + Saved milk: 0,03 € × 13,5% = 0,01 €");
  });

  it("does not attach VAT from another event order version or changed plan", () => {
    const receipt = order();
    const current = plan({ orderIds: [receipt.id], quoteId: receipt.quoteId });
    expect(matchingVatLines(current, receipt)).toEqual(receipt.lines);
    expect(matchingVatLines({ ...current, totalExVat: 8 }, receipt)).toBeUndefined();
    expect(matchingVatLines({ ...current, quoteId: "new-quote" }, receipt)).toBeUndefined();
    expect(matchingVatLines({ ...current, lines: [line({ quantity: 4 })] }, receipt)).toBeUndefined();
    expect(matchingVatLines(plan(), receipt)).toBeUndefined();
  });

  it("keeps a parent details dialog open and returns focus when calculation evidence closes", async () => {
    const onClose = vi.fn();
    mount(<OrderItemDialog title="Request" eyebrow="Details" onClose={onClose}><TotalCalculation title="request total" total={7.44} lines={[line()]} /></OrderItemDialog>);
    const trigger = screen.getByRole("button", { name: `Explain request total: ${eur(7.44)}` });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close", exact: true }));
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("explains submitted prices independently of drafts and handles reviews without saved line detail", async () => {
    const review = { id: "review", createdAt: saved.timeNow, facts: { total: 10, lines: [{ product: "Milk at submission", quantity: 3, unit: "L", lineTotal: 10 }] } } as unknown as Question;
    mount(<FinanceOrderSummary total={7.44} placed={2} pending={5.44} review={review} />);
    await userEvent.click(screen.getByRole("button", { name: `Explain submitted order total: ${eur(10)}` }));
    expect(normalized(screen.getByRole("dialog"))).toContain("10,00 € = 10,00 €");
    expect(normalized(screen.getByRole("dialog"))).toContain("Draft prices are not substituted");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Explain amount awaiting placement" }));
    expect(normalized(screen.getByRole("dialog"))).toContain("10,00 € − already placed 2,00 € = 8,00 €");
    cleanup();
    mount(<FinanceOrderSummary total={7.44} placed={2} pending={5.44} review={{ ...review, facts: { total: 10, lines: [null] } }} />);
    await userEvent.click(screen.getByRole("button", { name: `Explain submitted order total: ${eur(10)}` }));
    expect(normalized(screen.getByRole("dialog"))).toContain("No line breakdown was saved");
  });

  it("mounts receipt totals and reuses the existing line details for receipt amounts", async () => {
    vi.spyOn(api, "orders").mockResolvedValue({ orders: [order()] });
    mount(<Orders />);
    await userEvent.click(await screen.findByRole("button", { name: `Explain order receipt total: ${eur(7.44)}` }));
    expect(normalized(screen.getByRole("dialog"))).toContain("Saved receipt version 1");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: /Saved milk/ }));
    expect(normalized(screen.getByRole("dialog"))).toContain("2,48 € / L × 3 L = 7,44 €");
    expect(api.orders).toHaveBeenCalledOnce();
  });

  it("explains placed plus staged basket totals once, with line drill-downs and no supplier calls", async () => {
    vi.spyOn(api, "basket").mockResolvedValue({
      event: { id: "wedding", name: "Wedding", serviceDate: "2026-11-16" }, questions: [], review: null, orders: [order()],
      requests: [{ ...plan(), basketedAt: saved.timeNow }, { ...plan({ id: "already-placed", orderIds: ["receipt"] }), basketedAt: saved.timeNow }],
      orderBy: { state: "unknown", at: null, reason: "Older snapshot" },
    } as unknown as BasketResp);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<MemoryRouter initialEntries={["/baskets/wedding"]}><Ctx.Provider value={context}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: `Explain current order total: ${eur(14.88)}` }));
    const dialog = screen.getByRole("dialog");
    expect(normalized(dialog)).toContain("7,44 € + 7,44 € = 14,88 €");
    await userEvent.click(within(dialog).getByText("Staged request Milk request: 7,44 €", { selector: "summary" }));
    expect(normalized(dialog)).toContain("2,48 € / L × 3 L = 7,44 €");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])("mounts the saved request total in the %s proposal view", async (proposal) => {
    vi.spyOn(api, "plan").mockResolvedValue({ plan: plan({ proposal }), questions: [] });
    vi.spyOn(api, "rules").mockResolvedValue({ mandate: { spendCapEur: 10 } } as Awaited<ReturnType<typeof api.rules>>);
    render(<MemoryRouter initialEntries={["/requests/plan"]}><Ctx.Provider value={context}><Routes><Route path="/requests/:id" element={<RequestPlan />} /></Routes></Ctx.Provider></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: `Explain request total: ${eur(7.44)}` }));
    expect(normalized(screen.getByRole("dialog"))).toContain("7,44 € = 7,44 €");
    expect(api.plan).toHaveBeenCalledOnce();
  });
});
