import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/agent/openai.js", () => ({ structured: vi.fn(), ModelUnavailable: class extends Error {} }));
const { structured, ModelUnavailable } = await import("../src/agent/openai.js");
const { parseRequest, rulesParse } = await import("../src/agent/parse.js");
const { dietRules } = await import("../src/rules/checks.js");
const { getProduct } = await import("../src/catalog.js");
const model = vi.mocked(structured);
afterEach(() => model.mockReset());

describe("campaign regressions: quantities and list retention", () => {
  it.each([[1000000, "1,000,000 litres milk"], [0.5, ".5 kg butter"]])("preserves amount %s in %s", (amount, text) => {
    expect(rulesParse(text as string).lines[0].quantity?.amount).toBe(amount);
  });

  it("asks for a valid quantity instead of removing a negative sign", () => {
    expect(rulesParse("-5 kg milk").lines[0].quantity).toBeNull();
  });

  it.each(["2% milk", "10 l 2% milk"])("clarifies an unsupported fat specification rather than reading it as a count: %s (AUD-MAIN-006)", (text) => {
    const line = rulesParse(text).lines[0];
    expect(line.query).toContain("2%");
    expect(line.quantity).toBeNull();
  });

  it("retains additional-kilo grammar (WA-SELF-002)", () => {
    expect(rulesParse("1 additional kilo of salmon").lines[0]).toMatchObject({ query: "salmon", quantity: { amount: 1, unit: "kg" } });
  });

  it("retains all 60 newline-separated items and their individual amounts", () => {
    const text = Array.from({ length: 60 }, (_, i) => `${i + 1} kg ${i % 2 ? "butter" : "salmon"}`).join("\n");
    const { lines } = rulesParse(text);
    expect(lines).toHaveLength(60);
    expect(lines.map((line) => line.quantity?.amount)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("does not discard a second item following the delivery day", () => {
    const request = rulesParse("10 l milk by Monday and 2 kg butter");
    expect(request.lines).toHaveLength(2);
    expect(request.lines[1]).toMatchObject({ query: "butter", quantity: { amount: 2, unit: "kg" } });
  });
});

describe("campaign regressions: hard constraint retention", () => {
  it("applies a leading global vegan constraint to every line (AUD-MAIN-001)", () => {
    const { lines } = rulesParse("Everything must be vegan: 10 kg burgers and 5 l milk");
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.query)).toEqual(["burgers", "milk"]);
    expect(lines.every((line) => line.constraints.claims.includes("VEGAN"))).toBe(true);
  });

  it("encodes explicit nut avoidance in fallback (AUD-MAIN-003)", () => {
    expect(rulesParse("10 l milk without nuts").lines[0]).toMatchObject({ query: "milk", constraints: { avoidAllergens: ["AN", "AP"] } });
  });

  it("represents a required origin in the model schema and propagates the answer", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [{ text: "10 kg Finnish salmon", productWord: "salmon", productType: "salmon", productId: null, amount: 10, unit: "kg", claims: [], avoidAllergens: [], origin: "fi" }] });
    const { request } = await parseRequest("10 kg Finnish salmon");
    expect(request.lines[0].constraints.origin).toBe("fi");
    expect((model.mock.calls[0][0].schema as any).properties.lines.items.properties.origin).toBeDefined();
  });

  it("retains origin in the model-unavailable fallback", async () => {
    model.mockRejectedValue(new ModelUnavailable("synthetic unavailable"));
    const { request } = await parseRequest("10 kg Finnish salmon");
    expect(request.lines[0]).toMatchObject({ query: "salmon", constraints: { origin: "fi" } });
  });

  it("keeps foreign and unknown provenance blocked after parsing Finnish origin", () => {
    const constraints = rulesParse("10 kg Finnish salmon").lines[0].constraints;
    for (const origin of [null, "no"]) {
      const product = { ...getProduct("462150")!, origin };
      expect(dietRules(product, constraints, "request")).toContainEqual(expect.objectContaining({ ruleId: "ORG-01", outcome: "block" }));
    }
  });

  it.each(["10 kg Finnish Norwegian salmon", "Everything must be Finnish: 10 kg Norwegian salmon"])("clarifies conflicting origins: %s", (text) => {
    expect(rulesParse(text).lines[0].quantity).toBeNull();
  });

  it("still blocks missing allergen declarations after extracting nut avoidance", () => {
    const constraints = rulesParse("10 l milk without nuts").lines[0].constraints;
    expect(dietRules(getProduct("460643")!, constraints, "request")).toContainEqual(expect.objectContaining({ ruleId: "ALG-03", outcome: "block" }));
  });

  it("retains a global nut restriction even after a delivery date", () => {
    const { lines } = rulesParse("10 l milk and 2 kg butter by Monday, all nut-free");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.constraints.avoidAllergens.includes("AN") && line.constraints.avoidAllergens.includes("AP"))).toBe(true);
  });

  it("applies a composite global suffix to every item (AUD-MAIN-001 replay)", () => {
    const { lines } = rulesParse("10 l milk and 5 kg salmon, everything gluten-free and nut-free");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.constraints.claims.includes("FREE_FROM_GLUTEN") && line.constraints.avoidAllergens.includes("AN"))).toBe(true);
  });

  it.each([
    "2 kg potatoes 460541; 10 kg potatoes 460541; 40 kg potatoes 460541, all products must be Finnish by 2026-11-16",
    "2 kg potatoes 460541; 10 kg potatoes 460541; 40 kg potatoes 460541, Finnish products only by 2026-11-16",
  ])("retains the global origin suffix before its delivery date (AUD-MAIN-011): %s", (text) => {
    const request = rulesParse(text);
    expect(request.neededBy).toBe("2026-11-16");
    expect(request.lines).toHaveLength(3);
    expect(request.lines.every((line) => line.constraints.origin === "fi")).toBe(true);
  });

  it.each(["without milk or nuts", "without milk and nuts"])("retains every composite exclusion: %s (AUD-MAIN-003 replay)", (exclusions) => {
    const { lines } = rulesParse(`2 kg Finnish vegan cheese ${exclusions}`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ query: "cheese", constraints: { claims: ["VEGAN"], origin: "fi" } });
    expect(lines[0].constraints.avoidAllergens).toEqual(expect.arrayContaining(["AM", "AN", "AP"]));
  });

  it.each(["gluten-free", "nut-free", "Finnish"])("clarifies a restriction-only segment rather than dropping it: %s", (restriction) => {
    const { lines } = rulesParse(`10 l milk, ${restriction}`);
    expect(lines.some((line) => line.quantity === null)).toBe(true);
  });

  it("keeps a local gluten restriction on its own item", () => {
    const { lines } = rulesParse("2 kg gluten-free bread and 3 kg butter");
    expect(lines.map((line) => line.constraints.claims)).toEqual([["FREE_FROM_GLUTEN"], []]);
  });

  it("applies an explicit both-vegan suffix to the two items (WA-SELF-003)", () => {
    const { lines } = rulesParse("10 l milk and 12 bread both vegan");
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.constraints.claims.includes("VEGAN"))).toBe(true);
    expect(lines.map((line) => line.query)).toEqual(["milk", "bread"]);
  });

  it("keeps Finnish lactose-free requirements as a hard claim", () => {
    expect(rulesParse("10 l laktoositon maito").lines[0]).toMatchObject({ query: "maito", constraints: { claims: ["FREE_FROM_LACTOSE"] } });
  });

  it("turns an invalid model object into a visible safe fallback", async () => {
    model.mockResolvedValue({ neededByText: null, lines: null });
    const result = await parseRequest("10 kg Finnish salmon");
    expect(result.note).toBeTruthy();
    expect(result.request.parsedBy).toBe("rules");
    expect(result.request.lines[0].constraints.origin).toBe("fi");
  });

  it("rejects an unrecognized allergen code from the model", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [{ text: "10 l milk without nuts", productWord: "milk", productType: "plain drinking milk", productId: null, amount: 10, unit: "l", claims: [], avoidAllergens: ["ZZ"], origin: null }] });
    const result = await parseRequest("10 l milk without nuts");
    expect(result.note).toBeTruthy();
    expect(result.request.lines[0].constraints.avoidAllergens).toEqual(expect.arrayContaining(["AN", "AP"]));
  });
});
