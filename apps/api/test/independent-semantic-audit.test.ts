/** Independent auditor regression: reconstructed observed error, not a real-model trial. */
import { describe, expect, it, vi } from "vitest";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
vi.mock("../src/agent/openai.js", () => ({ structured: vi.fn(), ModelUnavailable: class extends Error {} }));
const { structured } = await import("../src/agent/openai.js");
const { parseRequest } = await import("../src/agent/parse.js");

describe("independently observed allergen-code substitution", () => {
  it("retains literal almond avoidance when model data incorrectly says milk avoidance", async () => {
    const text = "10 l milk for an almond allergy";
    // Campaign real-model evidence returned AM (milk), omitting SA (almond).
    // This is a synthetic reconstruction of that bad structured result. The
    // literal request and GS1 dictionary supply the oracle, not model confidence.
    vi.mocked(structured).mockResolvedValueOnce({ neededByText: null, lines: [{
      text, productWord: "milk", productType: "plain drinking milk", productId: null,
      amount: 10, unit: "l", claims: [], avoidAllergens: ["AM"], origin: null,
    }] });
    const { request } = await parseRequest(text);
    expect(request.lines).toHaveLength(1);
    expect(request.lines[0].quantity).toEqual({ amount: 10, unit: "l" });
    expect(request.lines[0].constraints.avoidAllergens).toContain("SA");
    expect(request.lines[0].constraints.avoidAllergens).not.toContain("AM");
  });
});
