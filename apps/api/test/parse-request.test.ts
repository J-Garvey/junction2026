import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/agent/openai.js", () => ({ structured: vi.fn(), ModelUnavailable: class extends Error {} }));
const { structured } = await import("../src/agent/openai.js");
const { parseRequest, parseSimpleRequest } = await import("../src/agent/parse.js");
const model = vi.mocked(structured);
afterEach(() => model.mockReset());

describe("literal purchase requests skip the model", () => {
  it.each([
    ["40 l lactose-free milk", "milk", 40, "l", ["FREE_FROM_LACTOSE"]],
    ["10 kg chicken burger", "chicken burger", 10, "kg", []],
    ["12 x cakes", "cakes", 12, "pcs", []],
    ["10 slices of cheese", "sliced cheese", 10, "pcs", []],
    ["1 slice of cheese", "sliced cheese", 1, "pcs", []],
    ["milk", "milk", 1, "pcs", []],
    ["Please add 1,5 l gluten-free oat milk", "oat milk", 1.5, "l", ["FREE_FROM_GLUTEN"]],
    ["I need 1,000 litres of lactose-free milk by Monday", "milk", 1000, "l", ["FREE_FROM_LACTOSE"]],
  ])("reads %s locally", async (text, query, amount, unit, claims) => {
    const result = await parseRequest(text as string);
    expect(result.request.parsedBy).toBe("rules");
    expect(result.request.originalText).toBe(text);
    expect(result.request.lines[0]).toMatchObject({ query, quantity: { amount, unit }, constraints: { claims } });
    expect(result.note).toBeNull();
    expect(model).not.toHaveBeenCalled();
  });

  it("keeps every line, quantity, claim and explicit delivery date", async () => {
    const { request } = await parseRequest("40 l lactose-free milk and 10 kg salmon fillet by 2026-11-20");
    expect(request.neededBy).toBe("2026-11-20");
    expect(request.lines).toHaveLength(2);
    expect(request.lines[0]).toMatchObject({ query: "milk", quantity: { amount: 40, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"] } });
    expect(request.lines[1]).toMatchObject({ query: "salmon fillet", quantity: { amount: 10, unit: "kg" }, constraints: { claims: [] } });
    expect(model).not.toHaveBeenCalled();
  });

  it.each(["464306", "4 x 464306"])("keeps an explicit product ID in %s", (text) => {
    expect(parseSimpleRequest(text)?.lines[0].productId).toBe("464306");
  });

  it.each([
    "10 l milk without nuts", "10 l milk for an almond allergy", "milk before Monday at 10am",
    "10 guests now", "10 kg salmon or trout", "10 packs milk", "10 kg unlistedbrand chicken burger",
    "milk by Monday except coffee milk", "10 kg salmon,", "milk for 16 Nov", "2% milk", "maitoa kiitos",
  ])("keeps richer or unsupported wording on the model path: %s", (text) => {
    expect(parseSimpleRequest(text)).toBeNull();
  });

  it("still parses explicit allergy instructions through the model", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [{ text: "10 l milk without nuts", productWord: "milk", productType: "plain drinking milk", productId: null, amount: 10, unit: "l", claims: [], avoidAllergens: ["AN", "AP"], origin: null }] });
    const { request } = await parseRequest("10 l milk without nuts");
    expect(model).toHaveBeenCalledOnce();
    expect(request.parsedBy).toBe("openai");
    expect(request.lines[0].constraints.avoidAllergens).toEqual(["AN", "AP"]);
  });
});
