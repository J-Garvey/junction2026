// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ProductDetails } from "@aimo/contracts";
import { CatalogueFacts } from "../src/ui/ProductDetails";

const product: ProductDetails = {
  id: "469363", name: "Example lactose-free milk", nameFi: "Esimerkkimaito", brand: "Valio", vendor: "Example supplier", category: "10400",
  claims: ["FREE_FROM_LACTOSE"], contains: ["AM"], mayContain: ["SC"], hasAllergenData: true, origin: "fi", labels: ["FINNISH_HEART_SYMBOL"],
  catalogueSalesUnit: "KI", packContent: { value: 10, unit: "l" }, temperature: 4, temperatureLabel: "cool", reliability: 0, co2KgPerKg: 0,
  substitutes: ["464306"], nutrition: { kcal: 35, lactose: 0, salt: 0.05 }, ingredients: "MILK, lactase enzyme",
  catalogueDetails: { gtin: "0641234567890", baseUnit: "ST", units: { ST: 1, KI: 10 }, salesUnitInBaseUnits: 10, allowedLotSize: 0.01,
    vatCategory: "MEDIUM", variableWeight: false, freeFrom: ["ML"], allergenUndeclared: ["SA"], netWeightKg: null, netVolumeL: 1,
    netContentSource: "name", deposits: [{ material: "3", unit: "ST", quantity: 10 }], hotelTags: ["breakfast:milk"],
    ingredientsEn: "MILK, lactase enzyme", ingredientsFi: "MAITO, laktaasientsyymi" },
};
afterEach(cleanup);

describe("full catalogue detail", () => {
  it("shows identity, packaging, declarations, ingredients, nutrition and qualified sustainability values", () => {
    render(<CatalogueFacts product={product} />);
    for (const text of ["0641234567890", "Example supplier", "Esimerkkimaito", "Finland (FI)", "cashew (SC)", "milk (AM)", "lactose (ML)", "almond (SA)", "464306"]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(screen.getByText("MAITO, laktaasientsyymi").getAttribute("lang")).toBe("fi");
    expect(screen.getByText("MILK, lactase enzyme").getAttribute("lang")).toBe("en");
    expect(screen.getByText("0 g")).toBeTruthy();
    expect(screen.getByText("No", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText(/0,0% of historical ordered quantity delivered/)).toBeTruthy();
    expect(screen.getByText("0 kg CO₂e / kg (product-group average)")).toBeTruthy();
    expect(screen.getByText("Inferred from the product name")).toBeTruthy();
    expect(screen.getByText(/Catalogue conversions and steps may differ/)).toBeTruthy();
    expect(screen.getByText(/Deposit amount not supplied/)).toBeTruthy();
    expect(screen.getByText(/does not specify which basis/)).toBeTruthy();
    expect(screen.getByText(/A lactose-free claim does not remove the milk allergen/)).toBeTruthy();
  });

  it("labels missing information as unknown and does not turn absent declarations into an allergen-free claim", () => {
    const missing = structuredClone(product);
    Object.assign(missing, { nutrition: null, ingredients: null, contains: [], mayContain: [], hasAllergenData: false, co2KgPerKg: null, reliability: null });
    Object.assign(missing.catalogueDetails, { gtin: null, variableWeight: null, freeFrom: [], allergenUndeclared: [], ingredientsEn: null, ingredientsFi: null });
    render(<CatalogueFacts product={missing} />);
    expect(screen.getByText("No allergen declaration supplied. Dietary suitability is unknown.")).toBeTruthy();
    expect(screen.getByText("Nutrition information not supplied.")).toBeTruthy();
    expect(screen.getByText("Ingredient statement not supplied.")).toBeTruthy();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.queryByText("0 g")).toBeNull();
    expect(screen.queryByText("No", { selector: "dd" })).toBeNull();
  });

  it("explains the X99 absence marker separately from named allergens", () => {
    const absence = structuredClone(product);
    absence.contains.push("X99");
    render(<CatalogueFacts product={absence} />);
    expect(screen.getByText(/This is an absence marker, not an allergen/)).toBeTruthy();
    expect(screen.getByText("milk (AM)")).toBeTruthy();
  });
});
