// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ProductDetails, ProductInspection } from "@aimo/contracts";
import { api } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { Products, SupplierEvidence, SupplierProduct } from "../src/screens/Products";

const fixture = JSON.parse(readFileSync(resolve("../../data/fixtures/aimo/base.json"), "utf8"));
const rawProduct = readFileSync(resolve("../../data/products_slim.jsonl"), "utf8").split("\n").map((line) => line && JSON.parse(line)).find((product) => product.id === "461955");
const product: ProductDetails = {
  id: "461955", name: rawProduct.en, nameFi: rawProduct.fi, category: rawProduct.cat, brand: rawProduct.brand, vendor: rawProduct.vendor,
  claims: rawProduct.claims ?? [], contains: rawProduct.contains ?? [], mayContain: rawProduct.may_contain ?? [], hasAllergenData: true, origin: "fi", labels: [],
  catalogueSalesUnit: "KG", packContent: null, temperature: null, temperatureLabel: null, reliability: null, co2KgPerKg: null, substitutes: [], nutrition: null, ingredients: null,
  catalogueDetails: { gtin: null, baseUnit: "KG", units: {}, salesUnitInBaseUnits: null, allowedLotSize: null, vatCategory: null, variableWeight: true, freeFrom: [], allergenUndeclared: [], netWeightKg: null, netVolumeL: null, netContentSource: null, deposits: [], hotelTags: [], ingredientsEn: null, ingredientsFi: null },
};
const inspection: ProductInspection = {
  product, site: { id: "site-aurora", name: "Demo Hotel, goods entrance" }, requestedDate: "2026-11-16", evaluatedAt: "2026-11-10T10:00:00Z", fallback: null,
  lookup: { productId: product.id, source: "fixture", fixtureName: "base", fetchedAt: fixture.recordedAt, known: true, deliverable: false, salesBlock: false, logisticModel: null, salesUnit: null, stock: { kind: "none" }, availableDate: null, closingTime: null, availabilityEvidence: { salesBlock: false, schedules: fixture.availability[product.id].scheduleLines },
    price: { value: fixture.price[product.id].catalogPrice.value, currency: "EUR", withTax: null, taxRate: 13.5, listPrice: null, comparisonPrice: 28.84, comparisonUnit: "KG", validFrom: "2026-01-13T00:00:00+0200", validTo: "9999-12-31T00:00:00+0200" } },
  delivery: { state: "not_available", message: "No supplier delivery dates were returned. A price alone does not establish availability.", rules: [{ ruleId: "DLV-01", outcome: "block", message: "Valio Aimo returned no delivery dates.", facts: {}, overridable: false }] },
};
const ctx: AppCtx = {
  me: { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false },
  people: [], outlets: [], status: null, now: "2026-11-10T10:00:00Z", tick: 0, refresh: () => {}, switchPerson: () => {},
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("read-only supplier product inspection", () => {
  it("finds salmon by ID and opens its priced no-schedule evidence using the keyboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "products").mockImplementation(async (query) => ({ products: query ? [product] : [], sites: [inspection.site], source: "Local catalogue" }));
    const inspect = vi.spyOn(api, "inspectProduct").mockResolvedValue(inspection);
    const plan = vi.spyOn(api, "request");
    render(<Ctx.Provider value={ctx}><MemoryRouter initialEntries={["/products"]}><Routes>
      <Route path="/products" element={<Products />} /><Route path="/products/:id" element={<SupplierProduct />} />
    </Routes></MemoryRouter></Ctx.Provider>);
    await screen.findByText(/Search by name or product ID/);
    const search = screen.getByRole("searchbox", { name: "Product name or ID" });
    search.focus();
    await user.keyboard("461955{Enter}");
    const results = await screen.findByRole("region", { name: "Catalogue results" });
    const link = await within(results).findByRole("link", { name: /Inspect supplier terms/ });
    link.focus();
    await user.keyboard("{Enter}");
    const evidence = await screen.findByRole("region", { name: "Supplier evidence" });
    expect(within(evidence).getByText("Not available")).toBeTruthy();
    expect(within(evidence).getByText(/28,84.*sales unit \(not returned\)/)).toBeTruthy();
    expect(within(evidence).getByText("No supplier delivery dates returned.")).toBeTruthy();
    expect(within(evidence).getByText("DLV-01")).toBeTruthy();
    expect(within(evidence).getByText(/Saved fixture \(base\)/)).toBeTruthy();
    expect(inspect).toHaveBeenCalledWith("461955", "2026-11-10", "site-aurora");
    expect(plan).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /add|approve|order/i })).toBeNull();
    const summary = within(evidence).getByText("Catalogue details", { selector: "summary" });
    await user.click(summary);
    expect(summary.parentElement?.hasAttribute("open")).toBe(true);
  });

  it("shows live provenance and unconfirmed stock separately from delivery eligibility", () => {
    const unknown = structuredClone(inspection);
    unknown.lookup.source = "live";
    unknown.lookup.fixtureName = null;
    unknown.lookup.stock = { kind: "unknown", reason: "terminal_sentinel" };
    unknown.lookup.availabilityEvidence!.schedules = [{ availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200", salesUnit: "KI", salesBlock: false, stock: unknown.lookup.stock }];
    unknown.delivery = { state: "stock_unconfirmed", message: "Supplier delivery dates exist and the cutoff is open. Stock is not confirmed.", rules: [] };
    render(<SupplierEvidence inspection={unknown} />);
    expect(screen.getByText("Stock not confirmed")).toBeTruthy();
    expect(screen.getByText(/Live Junction mock/)).toBeTruthy();
    expect(screen.getByText(/ships from the supplier/)).toBeTruthy();
    expect(screen.getByText("Schedule 1")).toBeTruthy();
    expect(screen.queryByText("Not available")).toBeNull();
  });

  it.each(["cutoff_passed", "sales_blocked"] as const)("names the %s state explicitly", (state) => {
    const changed = structuredClone(inspection);
    changed.delivery = { state, message: "Original supplier evidence blocks delivery.", rules: [] };
    render(<SupplierEvidence inspection={changed} />);
    expect(screen.getByText(state === "cutoff_passed" ? "Cutoff passed" : "Sales blocked")).toBeTruthy();
    expect(screen.queryByText("Not available")).toBeNull();
  });

  it("handles older evidence and fallback labels without turning missing schedules into no delivery", () => {
    const old = structuredClone(inspection);
    delete old.lookup.availabilityEvidence;
    old.delivery = { state: "unknown", message: "Original supplier schedules were not saved.", rules: [] };
    old.fallback = "Live mock unavailable; using saved fixture";
    render(<SupplierEvidence inspection={old} />);
    expect(screen.getByText("Delivery eligibility unknown")).toBeTruthy();
    expect(screen.getByText(/Original supplier schedule not saved/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("using saved fixture");
    expect(screen.queryByText("No supplier delivery dates returned.")).toBeNull();
  });

  it("lets the buyer retry a failed read without showing stale supplier terms", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "products").mockResolvedValue({ products: [], sites: [inspection.site], source: "Local catalogue" });
    const inspect = vi.spyOn(api, "inspectProduct").mockRejectedValueOnce(new Error("Supplier temporarily unavailable")).mockResolvedValue(inspection);
    render(<Ctx.Provider value={ctx}><MemoryRouter initialEntries={["/products/461955?date=2026-11-16"]}><Routes><Route path="/products/:id" element={<SupplierProduct />} /></Routes></MemoryRouter></Ctx.Provider>);
    expect((await screen.findByRole("alert")).textContent).toContain("Supplier temporarily unavailable");
    expect(screen.queryByRole("region", { name: "Supplier evidence" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("region", { name: "Supplier evidence" });
    expect(inspect).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Check supplier terms" }));
    await screen.findByRole("region", { name: "Supplier evidence" });
    expect(inspect).toHaveBeenCalledTimes(3);
  });
});
