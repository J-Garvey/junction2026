// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { SingleRequest } from "@aimo/contracts";
import { api, type MessageResp, type Person, type PlanResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { RequestNew, Requests } from "../src/screens/Request";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
const text = "12 L lactose-free milk by Monday";
function parsed(query = "milk", amount = 12, neededBy: string | null = "2026-11-16"): Extract<MessageResp, { request: unknown }> {
  return { route: "new_request", note: null, request: SingleRequest.parse({
    kind: "single", originalText: text, siteId: "site", outletId: "banquet", neededBy,
    neededByText: null, parsedBy: "rules",
    lines: [{ id: "line", text, query, productType: null, productId: null, category: null,
      quantity: { amount, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] } }],
  }) };
}

function Workspace() {
  const [tick, setTick] = useState(0);
  const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null,
    now: tick ? "2026-11-16T10:00:00Z" : "2026-11-15T10:00:00Z", tick,
    refresh: () => setTick((n) => n + 1), switchPerson: vi.fn() };
  return <Ctx.Provider value={context}>
    <button type="button" onClick={context.refresh}>Refresh workspace</button>
    <Link to="/requests/new" state={{ resp: parsed("cream", 4, null) }}>Open another parsed request</Link>
    <Routes>
      <Route path="/requests" element={<Requests />} />
      <Route path="/requests/new" element={<RequestNew />} />
      <Route path="/requests/quoted" element={<div>Quote preview</div>} />
    </Routes>
  </Ctx.Provider>;
}

beforeEach(() => {
  vi.spyOn(api, "home").mockResolvedValue({ questions: [], plans: [], events: [], warnings: [] });
  vi.spyOn(api, "prepareMessage").mockResolvedValue({ ok: true });
  vi.spyOn(api, "request").mockResolvedValue({ plan: { id: "quoted" }, questions: [] } as unknown as PlanResp);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("new-request route state", () => {
  it.each([
    ["/requests/new", "new_request"],
    ["/requests/new", "new_request_unsure"],
    ["/requests", "new_request"],
  ] as const)("shows and quotes a %s submission (%s)", async (path, route) => {
    const user = userEvent.setup();
    vi.spyOn(api, "message").mockResolvedValue({ ...parsed(), route });
    render(<MemoryRouter initialEntries={[path]}><Workspace /></MemoryRouter>);
    await user.type(screen.getByRole("textbox", { name: "Type a request" }), text);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect((await screen.findByRole("spinbutton") as HTMLInputElement).value).toBe("12");
    expect((screen.getByRole("textbox", { name: "Product" }) as HTMLInputElement).value).toBe("milk");
    expect(screen.getByRole("button", { name: /^Tomorrow/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Type a request above to start.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Quote" }));
    await screen.findByText("Quote preview");
    expect(api.message).toHaveBeenCalledExactlyOnceWith(text);
    expect(api.request).toHaveBeenCalledExactlyOnceWith(parsed().request);
  });

  it("preserves edited chips across workspace refreshes and replaces them for a new same-route response", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[{ pathname: "/requests/new", state: { resp: parsed() } }]}><Workspace /></MemoryRouter>);
    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "20");
    await user.clear(screen.getByRole("textbox", { name: "Product" }));
    await user.type(screen.getByRole("textbox", { name: "Product" }), "butter");
    await user.click(screen.getByRole("button", { name: /Remove lactose-free/i }));
    fireEvent.change(screen.getByLabelText("Custom date"), { target: { value: "2026-11-25" } });
    await user.click(screen.getByRole("button", { name: "Refresh workspace" }));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("20");
    expect((screen.getByRole("textbox", { name: "Product" }) as HTMLInputElement).value).toBe("butter");
    expect((screen.getByLabelText("Custom date") as HTMLInputElement).value).toBe("2026-11-25");
    expect(screen.queryByRole("button", { name: /Remove lactose-free/i })).toBeNull();

    await user.clear(screen.getByRole("spinbutton"));
    await user.click(screen.getByRole("button", { name: "Quote" }));
    expect(screen.getByRole("alert").textContent).toContain("how much butter");
    await user.click(screen.getByRole("link", { name: "Open another parsed request" }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Product" }) as HTMLInputElement).value).toBe("cream"));
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("4");
    expect(screen.getByRole("button", { name: /Remove lactose-free/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /In a week/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Quote" }));
    await screen.findByText("Quote preview");
    expect(api.request).toHaveBeenCalledExactlyOnceWith({ ...parsed("cream", 4, null).request, neededBy: "2026-11-23" });
  });
});
