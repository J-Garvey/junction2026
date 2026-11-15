// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Candidate } from "@aimo/contracts";
import { CandidateRanking } from "../src/ui/CandidateRanking";
afterEach(cleanup);
it("explains the checked whole-pack event cost on a piece candidate", () => {
  render(<CandidateRanking candidate={{ rankStep: "cost to cover the piece need after whole-pack rounding", salesUnit: "KI", costToCover: { need: 194, quantity: 5, totalExVat: 310.6 } } as Candidate} />);
  expect(screen.getByText(/5 KI/).textContent).toContain("310,60");
  expect(screen.getByText(/to cover 194 pcs, rounded to whole packs/)).toBeTruthy();
});
it("asks for quantity instead of showing an unchecked cheap total", () => {
  render(<CandidateRanking candidate={{ rankStep: "only candidate", unitPrice: 1, costToCover: null } as Candidate} />);
  expect(screen.getByText(/unknown; enter a sales quantity/)).toBeTruthy();
});
it("retains normalized kg/L explanations for saved candidates", () => {
  render(<CandidateRanking candidate={{ rankStep: "delivery reliability", pricePerBase: 2, baseUnit: "l" } as Candidate} />);
  expect(screen.getByText(/per l, ex VAT/)).toBeTruthy();
});
