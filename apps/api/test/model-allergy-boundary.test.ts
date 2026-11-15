import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/agent/openai.js", () => ({ structured: vi.fn(), ModelUnavailable: class extends Error {} }));
const { structured } = await import("../src/agent/openai.js");
const { parseRequest } = await import("../src/agent/parse.js");
const model = vi.mocked(structured);
afterEach(() => model.mockReset());
const text = "10 l milk for an almond allergy";
const response = (avoidAllergens: string[]) => ({ neededByText: null, lines: [{ text, productWord: "milk", productType: "plain drinking milk", productId: null, amount: 10, unit: "l", claims: [], avoidAllergens, origin: null }] });

describe("explicit allergy words constrain model interpretation", () => {
  it("rejects the captured milk/almond code substitution (AUD-MAIN-013)", async () => {
    // Exact interpretation captured by the independent real-model campaign row4213.
    model.mockResolvedValue(response(["AM"]));
    const result = await parseRequest(text);
    expect(result.request.lines[0].constraints.avoidAllergens).toContain("SA");
    expect(result.request.lines[0].constraints.avoidAllergens).not.toContain("AM");
    expect(result.note).toBeTruthy();
  });

  it("keeps a correctly coded almond allergy on the model path", async () => {
    model.mockResolvedValue(response(["SA"]));
    const result = await parseRequest(text);
    expect(result.request.parsedBy).toBe("openai");
    expect(result.request.lines[0].constraints.avoidAllergens).toEqual(["SA"]);
    expect(result.note).toBeNull();
  });

  it("keeps an almond restriction local in the safe fallback", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [] });
    const result = await parseRequest("10 l milk for an almond allergy and 2 kg butter");
    expect(result.request.lines).toHaveLength(2);
    expect(result.request.lines[0]).toMatchObject({ query: "milk", constraints: { avoidAllergens: ["SA"] } });
    expect(result.request.lines[1]).toMatchObject({ query: "butter", constraints: { avoidAllergens: [] } });
  });
});
