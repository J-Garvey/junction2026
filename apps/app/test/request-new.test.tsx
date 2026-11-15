// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { SingleRequest } from "@aimo/contracts";
import { api, type Person, type PlanResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { RequestNew } from "../src/screens/Request";

// Keep SQLite out of the DOM test while using the real clock and the seeded
// standing mandate for catalogue matching, including its Finnish-fish rule.
const testDb = vi.hoisted(() => ({ mandate: null as unknown }));
vi.mock("../../api/src/db.js", () => {
  const values = new Map<string, unknown>();
  return {
    kvGet: (key: string) => values.get(key) ?? null,
    kvSet: (key: string, value: unknown) => values.set(key, value),
    getJson: (table: string) => table === "mandates" ? structuredClone(testDb.mandate) : null,
  };
});
process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
const { rulesParse } = await import("../../api/src/agent/parse.js");
const { needsFromSingle } = await import("../../api/src/agent/plan.js");
const { shortlist } = await import("../../api/src/agent/match.js");
const { setClock } = await import("../../api/src/clock.js");
testDb.mandate = (await import("../../api/src/seed.js")).MANDATE;

const chef: Person = { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
function request(text = "10 l milk by Monday"): SingleRequest {
  return { ...rulesParse(text), siteId: "site-aurora", outletId: "banquet" };
}
function show(initial: SingleRequest) {
  const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
  render(<MemoryRouter initialEntries={[{ pathname: "/requests/new", state: { resp: { route: "new_request", request: initial, note: null } } }]}>
    <Ctx.Provider value={context}><Routes>
      <Route path="/requests/new" element={<RequestNew />} />
      <Route path="/requests/:id" element={<div>Quote opened</div>} />
    </Routes></Ctx.Provider>
  </MemoryRouter>);
}
async function quote() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Quote" })); });
  expect(screen.getByText("Quote opened")).toBeTruthy();
  expect(api.request).toHaveBeenCalledOnce();
  return vi.mocked(api.request).mock.calls[0][0];
}

beforeEach(() => {
  setClock({ time: "2026-11-14T10:00:00Z" });
  vi.spyOn(api, "request").mockResolvedValue({ plan: { id: "quoted" }, questions: [] } as unknown as PlanResp);
  vi.spyOn(api, "message");
  vi.spyOn(api, "prepareMessage");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RequestNew product chip identity", () => {
  it("quotes salmon after editing milk and its unit, using salmon catalogue matches", async () => {
    const initial = request();
    expect(initial.lines[0]).toMatchObject({ query: "milk", productType: "plain drinking milk", category: "10400" });
    show(initial);
    fireEvent.change(screen.getByRole("textbox", { name: "Product" }), { target: { value: "salmon" } });
    fireEvent.change(screen.getByRole("combobox", { name: /^Quantity/ }), { target: { value: "kg" } });
    expect(api.request).not.toHaveBeenCalled();
    expect(api.message).not.toHaveBeenCalled();
    expect(api.prepareMessage).not.toHaveBeenCalled();

    const sent = await quote();
    expect(sent).toMatchObject({ neededBy: "2026-11-16", lines: [{
      id: initial.lines[0].id, query: "salmon", text: "salmon", productType: null, category: null, productId: null,
      quantity: { amount: 10, unit: "kg" },
    }] });
    const [need] = needsFromSingle(sent);
    expect(need.label).toBe("10 kg salmon");
    const matches = shortlist(need, { log: false });
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.map((p) => p.id)).not.toContain("462150");
    expect(matches.every((p) => p.category !== "10400")).toBe(true);
  }, 60_000);

  it("clears a chosen SKU and retains explicit diet, allergen, label, origin and quantity requirements", async () => {
    const initial = request("10 l lactose-free milk 469363 by Monday");
    initial.lines[0].constraints = { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: ["AN", "AP"], labels: ["ORGANIC"], origin: "fi" };
    show(initial);
    fireEvent.change(screen.getByRole("textbox", { name: "Product" }), { target: { value: "salmon" } });
    const sent = await quote();
    expect(sent.lines[0]).toMatchObject({
      query: "salmon", text: "salmon", productId: null, category: null, productType: null,
      quantity: initial.lines[0].quantity, constraints: initial.lines[0].constraints,
    });
    expect(needsFromSingle(sent)[0]).toMatchObject({ pinnedProductId: null, constraints: initial.lines[0].constraints });
  });

  it.each([false, true])("keeps parsed identity when only quantity, diet or date changes (cosmetic product edit: %s)", async (cosmeticEdit) => {
    const initial = request("10 l lactose-free milk 469363 by Monday");
    show(initial);
    if (cosmeticEdit) fireEvent.change(screen.getByRole("textbox", { name: "Product" }), { target: { value: "  MILK  " } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Quantity/ }), { target: { value: "20" } });
    fireEvent.change(screen.getByRole("combobox", { name: /^Quantity/ }), { target: { value: "dl" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Add a diet claim" }), { target: { value: "FREE_FROM_GLUTEN" } });
    fireEvent.click(screen.getByRole("button", { name: /In a week/ }));
    const sent = await quote();
    expect(sent.lines[0]).toMatchObject({
      productId: "469363", productType: "plain drinking milk", category: "10400", text: initial.lines[0].text,
      quantity: { amount: 20, unit: "dl" }, constraints: { claims: ["FREE_FROM_LACTOSE", "FREE_FROM_GLUTEN"] },
    });
    expect(sent.neededBy).toBe("2026-11-21");
  });
});
