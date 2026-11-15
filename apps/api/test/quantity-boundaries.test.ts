import { describe, expect, it } from "vitest";
import { rulesParse } from "../src/agent/parse.js";

describe("unsupported quantity expressions require clarification", () => {
  it.each([
    "1/2 kg salmon", "1 – 2 kg salmon", "2 x 500 g butter", "−5 kg salmon", "- 5 kg salmon", "10 cases milk",
  ])("does not turn %s into a different positive purchase amount", (text) => {
    expect(rulesParse(text).lines[0].quantity).toBeNull();
  });

  it("retains a simple piece multiplier with an explicit product ID", () => {
    expect(rulesParse("12 x 469363").lines[0]).toMatchObject({ productId: "469363", quantity: { amount: 12, unit: "pcs" } });
  });
});
