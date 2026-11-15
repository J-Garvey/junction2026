// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { api, authHooks, type Person, type StatusResp } from "../src/api";

const people: Person[] = [
  { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet", "bar"], hotelScope: false },
  { id: "p-mikko", name: "Mikko", title: "Bar manager", role: "chef", outlets: ["bar"], hotelScope: false },
  { id: "p-sanna", name: "Sanna", title: "Finance manager", role: "approver", outlets: ["banquet", "bar"], hotelScope: true },
  { id: "p-jonas", name: "Jonas", title: "F&B director", role: "approver", outlets: ["banquet", "bar"], hotelScope: true },
];
const status: StatusResp = {
  clock: { now: "2026-11-14T10:00:00Z", mode: "fixed", time: null, scene: null, scenes: {} as StatusResp["clock"]["scenes"] },
  dataMode: "fixture", model: { provider: "openai", model: "fixture", configured: false }, chain: { ok: true, brokenAt: null, entries: 0 },
};
const mount = (person = people[1], path = "/") => {
  vi.mocked(api.me).mockResolvedValue({ person });
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
};
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request in navigation test"); }));
  vi.spyOn(api, "me");
  vi.spyOn(api, "people").mockResolvedValue({ people, outlets: [] });
  vi.spyOn(api, "status").mockResolvedValue(status);
  vi.spyOn(api, "home").mockResolvedValue({ questions: [], events: [], plans: [], warnings: [] });
  vi.spyOn(api, "baskets").mockResolvedValue({ baskets: [] });
  vi.spyOn(api, "orders").mockResolvedValue({ orders: [] });
  vi.spyOn(api, "events").mockResolvedValue({ events: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); authHooks.onUnauthorized = () => {}; });

describe("core page navigation without top tabs", () => {
  it.each(people)("lets $name reach Waiting, Requests and Events from the account menu", async (person) => {
    const user = userEvent.setup();
    mount(person);
    const profile = await screen.findByRole("button", { name: `Signed in as ${person.name}` });
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
    for (const [name, path, heading] of [
      ["Waiting", "/inbox", person.role === "approver" ? "Approvals & spend" : "Waiting for you"],
      ["Requests", "/requests", "Requests"],
      ["Events", "/events", "Events"],
    ]) {
      await user.click(profile);
      const link = screen.getByRole("menuitem", { name });
      expect(link.getAttribute("href")).toBe(path);
      await user.click(link);
      expect(screen.queryByRole("menu")).toBeNull();
      await screen.findByRole("heading", { name: heading });
    }
    await user.click(screen.getByRole("link", { name: "Aimo Copilot home" }));
    if (person.role === "approver") {
      await screen.findByRole("heading", { name: "Approvals & spend" });
      expect(screen.queryByRole("button", { name: "New order" })).toBeNull();
    } else await screen.findByRole("button", { name: "New order" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks Requests current on a nested route and returns focus when the menu closes", async () => {
    const user = userEvent.setup();
    mount(people[1], "/requests/new");
    const profile = await screen.findByRole("button", { name: "Signed in as Mikko" });
    await user.click(profile);
    expect(screen.getByRole("menuitem", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(profile);
  });

  it("lets keyboard users open the Waiting page through the menu", async () => {
    const user = userEvent.setup();
    mount();
    const profile = await screen.findByRole("button", { name: "Signed in as Mikko" });
    profile.focus();
    await user.keyboard("{Enter}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Waiting" }));
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Waiting for you" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
