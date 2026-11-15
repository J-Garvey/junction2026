// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Need, Order, OrderLine, Plan, PlanLine, SingleLine } from "@aimo/contracts";
import { api, type BasketResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { CarbonEstimate } from "../src/ui/CarbonEstimate";
import { DishView, LinesList } from "../src/ui/PlanView";
import { ProductReviewItem } from "../src/ui/ProductReviewItem";
import { BasketPage } from "../src/screens/Baskets";
import { Orders } from "../src/screens/Orders";
import { RequestPlan } from "../src/screens/Request";
import { eur } from "../src/format";

// Display fixtures use the saved salmon's actual KG sales unit and product-group factor.
const basis = { kgPerSalesUnit: 1, co2KgPerKg: 6.245, massSource: "sales unit is KG" };
const line: PlanLine = {
  id: "salmon", needIds: ["dinner"], productId: "469672", productName: "Salmon", outletId: "banquet", needAmount: { value: 1.1, unit: "kg" },
  quantity: 2, packContent: { value: 1, unit: "kg", verified: true, source: "sales unit is KG" }, overshoot: null,
  unitPrice: 29.84, lineTotal: 59.68, salesUnit: "KG", stock: { kind: "known", amount: 311 }, availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200",
  reliability: null, source: "fixture", verdict: "green", status: "covered", rules: [], rankStep: null, shares: [], allocation: "primary", riskAccepted: null, removed: false,
  carbonBasis: basis, co2Kg: 12.49,
};
const older = { ...line, id: "milk", productName: "Milk", carbonBasis: undefined, co2Kg: 44, salesUnit: "ST" };
const plan = { id: "plan", title: "Dinner", needs: [], lines: [line, older], totalExVat: 119.36, proposal: true } as unknown as Plan;
const orderLine = (value: PlanLine, lineNo: number): OrderLine => ({
  lineNo, productId: value.productId!, productName: value.productName, ref: null, outletId: value.outletId,
  quantity: value.quantity, salesUnit: value.salesUnit, unitPrice: value.unitPrice, lineTotal: value.lineTotal,
  taxRate: 13.5, stock: { kind: "known", amount: 311 }, availableDate: value.availableDate, closingTime: value.closingTime,
  priceValidTo: null, logisticModel: "Stock", source: "fixture", rules: [], outcome: "order", removed: value.removed,
  riskAccepted: null, carbonBasis: value.carbonBasis,
});
const order: Order = { id: "order", quoteId: "quote", hotelId: "hotel", siteId: "site", eventId: "event", deliveryDate: "2026-11-16",
  state: "placed", lines: [orderLine(line, 1), orderLine(older, 2)], totalExVat: 119.36, totalVat: 16.11, placedAt: "2026-11-14T10:00:00Z",
  placedBy: "Aino", approvalId: null, idempotencyKey: "carbon", version: 1, flags: [] };
const me = { id: "sanna", name: "Sanna", title: "Finance manager", role: "approver" as const, outlets: ["banquet"], hotelScope: true };
const context: AppCtx = { me, people: [me], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const mount = (element: React.ReactNode) => render(<MemoryRouter><Ctx.Provider value={context}>{element}</Ctx.Provider></MemoryRouter>);

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("visible informational carbon", () => {
  it("shows the product-group wording on event lines without hover and rejects legacy totals", () => {
    mount(<LinesList plan={plan} warnings={[]} />);
    const estimate = screen.getByText("≈ 12,49 kg CO₂e · product-group average");
    expect(estimate.getAttribute("title")).toBeNull();
    expect(estimate.style.whiteSpace).toBe("normal");
    expect(screen.getByText("No carbon estimate")).toBeTruthy();
    expect(screen.queryByText(/44 kg CO₂e/)).toBeNull();
    expect(screen.getAllByText(eur(59.68))).toHaveLength(2);
  });

  it("labels shared lines as a whole-line estimate instead of assigning full pack emissions to each dish", () => {
    const needs = ["dinner", "lunch"].map((id) => ({ id, label: id, dishName: id, groupId: "regular", outletId: "banquet", judgements: [] }) as unknown as Need);
    const shared = { ...line, needIds: ["dinner", "lunch"], shares: [{ needId: "dinner", label: "Dinner", amount: 0.5 }, { needId: "lunch", label: "Lunch", amount: 0.6 }] };
    mount(<DishView plan={{ ...plan, needs, lines: [shared] }} warnings={[]} />);
    expect(screen.getAllByText("≈ 12,49 kg CO₂e · product-group average · whole shared line")).toHaveLength(2);
  });

  it("uses each split line's sales quantity and suppresses removed lines", () => {
    const split = { ...line, id: "split", quantity: 1, productName: "Second allocation" };
    mount(<LinesList plan={{ ...plan, lines: [line, split, { ...line, id: "removed", removed: true }] }} warnings={[]} />);
    expect(screen.getByText("≈ 12,49 kg CO₂e · product-group average")).toBeTruthy();
    expect(screen.getByText("≈ 6,25 kg CO₂e · product-group average")).toBeTruthy();
    expect(screen.getByText("No carbon estimate · removed line")).toBeTruthy();
  });

  it("keeps a zero factor distinct from missing data and avoids rounding a tiny positive estimate to zero", () => {
    const { rerender } = render(<CarbonEstimate line={{ quantity: 1, carbonBasis: { ...basis, co2KgPerKg: 0 } }} />);
    expect(screen.getByText("≈ 0 kg CO₂e · product-group average")).toBeTruthy();
    rerender(<CarbonEstimate line={{ quantity: 1, carbonBasis: { ...basis, co2KgPerKg: 0.001 } }} />);
    expect(screen.getByText("< 0,01 kg CO₂e · product-group average")).toBeTruthy();
    rerender(<CarbonEstimate line={{ quantity: 0, carbonBasis: basis }} />);
    expect(screen.getByText("No carbon estimate")).toBeTruthy();
  });

  it("shows carbon on the compact request review without opening details", () => {
    const productDetails = vi.spyOn(api, "product");
    const requested: SingleLine = { id: "dinner", text: "1.1 kg salmon", query: "salmon", productType: null, category: null, productId: line.productId, quantity: { amount: 1.1, unit: "kg" }, constraints: { claims: [], avoidAllergens: [], labels: [] } };
    mount(<table><ProductReviewItem line={requested} lines={[line, older]} deliveryDate="2026-11-16" checked disabled={false}
      onApprove={vi.fn()} onSalesQuantity={vi.fn()} onEdit={vi.fn()} onChoose={vi.fn()} /></table>);
    expect(screen.getByText("≈ 12,49 kg CO₂e · product-group average")).toBeTruthy();
    expect(screen.getByText("No carbon estimate")).toBeTruthy();
    expect(productDetails).not.toHaveBeenCalled();
  });

  it("shows carbon in saved proposals before acceptance", async () => {
    vi.spyOn(api, "plan").mockResolvedValue({ plan, questions: [] });
    vi.spyOn(api, "rules").mockResolvedValue({} as Awaited<ReturnType<typeof api.rules>>);
    mount(<Routes><Route path="*" element={<RequestPlan />} /></Routes>);
    expect(await screen.findByText("≈ 12,49 kg CO₂e · product-group average")).toBeTruthy();
    expect(screen.getByText("No carbon estimate")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to quote" })).toBeTruthy();
  });

  it("shows evidence or missing data on staged and placed basket items", async () => {
    vi.spyOn(api, "basket").mockResolvedValue({ event: { id: "event", name: "Dinner", serviceDate: "2026-11-16" },
      requests: [{ ...plan, orderIds: [], basketedAt: "2026-11-14T10:00:00Z" }], orders: [order], questions: [], review: null, confirmed: false,
      orderBy: { state: "unknown", at: null, reason: "Recheck supplier terms", usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 },
    } as unknown as BasketResp);
    mount(<Routes><Route path="*" element={<BasketPage />} /></Routes>);
    await screen.findByRole("heading", { name: "In the order" });
    expect(screen.getAllByText("≈ 12,49 kg CO₂e · product-group average")).toHaveLength(2);
    expect(screen.getAllByText("No carbon estimate")).toHaveLength(2);
  });

  it("shows saved receipt carbon before interaction and preserves keyboard access to details", async () => {
    vi.spyOn(api, "orders").mockResolvedValue({ orders: [{ ...order, lines: [...order.lines, orderLine({ ...line, removed: true }, 3)] }] });
    mount(<Orders />);
    const trigger = await screen.findByRole("button", { name: /2 KG Salmon.*product-group average/ });
    expect(screen.getByText("No carbon estimate")).toBeTruthy();
    expect(screen.getByText("No carbon estimate · removed line")).toBeTruthy();
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Salmon" });
    expect(within(dialog).getByText("≈ 12,49 kg CO₂e · product-group average")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
