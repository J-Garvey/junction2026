// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Mandate } from "@aimo/contracts";
import { api, type RulesResp } from "../src/api";
import { Rules } from "../src/screens/Rules";
import { Ctx, type AppCtx } from "../src/ctx";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function mount(categoryOriginRequirements?: Mandate["categoryOriginRequirements"]) {
  vi.spyOn(api, "rules").mockResolvedValue({
    mandate: { version: 1, sites: [{ name: "Demo Hotel" }], categoryOriginRequirements },
    rules: [], params: {}, policy: { updatedBy: null }, canEdit: false, remembered: [], tokens: { outsideAgent: "synthetic-test-token" },
  } as unknown as RulesResp);
  render(<Ctx.Provider value={{ tick: 0 } as AppCtx}><Rules /></Ctx.Provider>);
}

describe("Rules standing category origins", () => {
  it("shows Finland and the exact fish scope alongside the signed mandate", async () => {
    mount([{ origin: "fi", categories: ["18701", "18702", "18705", "18706", "18707", "18708", "41720", "41722", "41723"] }]);
    const section = await screen.findByRole("region", { name: "Category origin requirements" });
    expect(within(section).getByText(/Finland \(fi\) only/).textContent).toContain("18701, 18702, 18705, 18706, 18707, 18708, 41720, 41722, 41723");
    expect(within(section).getByText(/Catalogue origin must be known/)).toBeTruthy();
  });

  it.each([undefined, []])("renders older or unrestricted mandate snapshots (%s)", async (requirements) => {
    mount(requirements);
    expect(await screen.findByText("No category origin requirements in this mandate.")).toBeTruthy();
  });
});
