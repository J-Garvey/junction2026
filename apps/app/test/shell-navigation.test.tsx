// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("app shell", () => {
  it("opens read-only product search through the account menu using the keyboard", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "products").mockResolvedValue({ products: [], sites: [], source: "Local catalogue" });
    render(<MemoryRouter><App /></MemoryRouter>);
    (await screen.findByRole("button", { name: "Signed in as Aino" })).focus();
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Products" }));
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Products" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
  });

  it("renders the chef workspace without the top tab bar", async () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByRole("link", { name: "Aimo Copilot home" });
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    expect(screen.getByRole("main").id).toBe("main-content");
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main-content");
  });

  it("renders finance without the top tab bar or chef's request composer", async () => {
    vi.mocked(api.me).mockResolvedValue({ person: manager });
    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByLabelText("Finance overview");
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Type a request" })).toBeNull();
  });

  it("keeps the home link on a direct basket URL", async () => {
    vi.spyOn(api, "basket").mockRejectedValue(new Error("Fixture order unavailable"));
    render(<MemoryRouter initialEntries={["/baskets/wedding"]}><App /></MemoryRouter>);
    expect((await screen.findByRole("link", { name: "Aimo Copilot home" })).getAttribute("href")).toBe("/");
  });
});
