// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { api, type Person, type StatusResp } from "../src/api";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
const manager: Person = { ...chef, id: "sanna", name: "Sanna", title: "Finance manager", role: "approver", hotelScope: true };
const status: StatusResp = {
  clock: { mode: "fixed", time: null, scene: "1", now: "2026-11-14T10:00:00Z", scenes: {} as StatusResp["clock"]["scenes"] },
  dataMode: "fixture", model: { provider: "openai", model: "demo", configured: false }, chain: { ok: true, brokenAt: null, entries: 0 },
};

beforeEach(() => {
  vi.spyOn(api, "people").mockResolvedValue({ people: [chef, manager], outlets: [] });
  vi.spyOn(api, "me").mockResolvedValue({ person: chef });
  vi.spyOn(api, "status").mockResolvedValue(status);
  vi.spyOn(api, "home").mockResolvedValue({ questions: [], events: [], plans: [], warnings: [] });
  vi.spyOn(api, "baskets").mockResolvedValue({ baskets: [] });
  vi.spyOn(api, "orders").mockResolvedValue({ orders: [] });
  vi.spyOn(api, "events").mockResolvedValue({ events: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("persistent app navigation", () => {
  // Regression: core pages were only reachable by typing their URL after the sidebar was removed.
  it("lets a chef reach requests and receipts without opening an unrelated menu", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><App /></MemoryRouter>);
    const nav = await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Orders", "Waiting", "Events", "Requests", "Receipts"]);
    expect(within(nav).getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBe("page");
    await user.click(within(nav).getByRole("link", { name: "Receipts" }));
    expect(await screen.findByRole("heading", { name: "Orders" })).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Receipts" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Orders" }).hasAttribute("aria-current")).toBe(false);
    expect(screen.getByRole("main").id).toBe("main-content");
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main-content");
  });

  it("gives finance a direct approvals route and avoids the chef's request composer", async () => {
    vi.mocked(api.me).mockResolvedValue({ person: manager });
    render(<MemoryRouter><App /></MemoryRouter>);
    const nav = await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Approvals & spend", "Events", "Order receipts"]);
    expect(within(nav).getByRole("link", { name: "Approvals & spend" }).getAttribute("href")).toBe("/");
    await screen.findByLabelText("Finance overview");
    expect(screen.queryByRole("textbox", { name: "Type a request" })).toBeNull();
  });

  it("keeps the order section current on a direct basket URL", async () => {
    vi.spyOn(api, "basket").mockRejectedValue(new Error("Fixture order unavailable"));
    render(<MemoryRouter initialEntries={["/baskets/wedding"]}><App /></MemoryRouter>);
    const nav = await screen.findByRole("navigation", { name: "Primary navigation" });
    expect(within(nav).getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Aimo Copilot home" }).getAttribute("href")).toBe("/");
  });
});
