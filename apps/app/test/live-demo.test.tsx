// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Live } from "../src/live/Live";

const feed = [
  { id: "lookup", at: "2026-11-14T15:00:00Z", agent: "Demo Hotel purchasing agent", method: "POST", path: "/gateway/v1/lookup", action: "LOOKUP", verdict: "INFO", reason: "7 prices and stock", amount: null, signed: false, orderId: null, ms: 17 },
  { id: "order", at: "2026-11-14T15:00:01Z", agent: "Demo Hotel purchasing agent", method: "POST", path: "/gateway/v1/orders/wedding/amendments", action: "AMEND", verdict: "ALLOWED", reason: "approval attached", amount: 1965.17, signed: true, orderId: "wedding", ms: 42 },
];

beforeEach(() => {
  vi.stubGlobal("EventSource", class {
    addEventListener() {}
    close() {}
  });
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    if (input === "/api/live/state") return { ok: true, json: async () => ({
      session: { status: "idle", steps: [] }, feed,
      rules: { spendCapEur: 1950, delivery: "Mon–Fri", unconfirmedStock: "asks the chef", signed: true },
      model: "demo-model", modelReady: false,
    }) };
    if (input === "/api/live/orders/wedding") return { ok: true, json: async () => ({
      order: { id: "wedding", totalExVat: 1965.17, deliveryDate: "2026-11-16", approvalId: "finance-change", lines: [
        { productId: "473522", name: "Raspberry pastry cake", quantity: 5, salesUnit: "KI", lineTotal: 310.6, riskAccepted: { by: "Aino" } },
      ] },
      signature: { valid: true, alg: "ES256", jwks: "/.well-known/jwks.json", jws: "signed-fixture" },
    }) };
    throw new Error(`Unexpected request: ${input}`);
  }));
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("the demo's closing console", () => {
  it("shows measured durations for lookups and verdicts, then opens the signed wedding record", async () => {
    render(<Live />);
    expect(await screen.findByText("17 ms")).toBeTruthy();
    expect(screen.getByText("42 ms")).toBeTruthy();
    expect(screen.getByText("ALLOWED")).toBeTruthy();
    await userEvent.click(screen.getByText("AMEND"));
    expect(await screen.findByRole("heading", { name: "Signed order wedding" })).toBeTruthy();
    expect(await screen.findByText(/Signature valid · ES256/)).toBeTruthy();
    expect(screen.getByText("Raspberry pastry cake")).toBeTruthy();
    expect(screen.getByText("Stock not confirmed · Aino accepted")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Peppol BIS Order (UBL XML)" }).getAttribute("href")).toBe("/api/live/orders/wedding/peppol");
  });
});
