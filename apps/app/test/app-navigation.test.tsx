// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { api, authHooks, type Person, type StatusResp } from "../src/api";

// The four seeded identities, including Mikko's single-outlet kitchen scope.
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
const destinations = [
  ["Waiting", "/inbox"], ["Requests", "/requests"], ["Events", "/events"], ["Order receipts", "/orders"],
];
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

describe("main navigation", () => {
  it.each(people)("makes every core destination directly discoverable for $name", async (person) => {
    const user = userEvent.setup();
    mount(person);
    const nav = within(await screen.findByRole("navigation", { name: "Main navigation" }));
    const homeName = person.role === "approver" ? "Approvals & spend" : "My orders";
    expect(nav.getAllByRole("link")).toHaveLength(5);
    expect(nav.getByRole("link", { name: homeName }).getAttribute("href")).toBe("/");
    expect(nav.getByRole("link", { name: homeName }).getAttribute("aria-current")).toBe("page");
    if (person.role === "approver") {
      await screen.findByRole("heading", { name: "Approvals & spend" });
      expect(screen.queryByRole("button", { name: "New order" })).toBeNull();
    } else {
      await screen.findByRole("button", { name: "New order" });
    }

    for (const [name, href] of destinations) {
      const link = nav.getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(href);
      await user.click(link);
      expect(link.getAttribute("aria-current")).toBe("page");
      expect(nav.getAllByRole("link").filter((item) => item.hasAttribute("aria-current"))).toEqual([link]);
      await screen.findByRole("heading", { name: name === "Waiting" ? person.role === "approver" ? "Approvals & spend" : "Waiting for you" : name === "Order receipts" ? "Orders" : name });
    }
    await user.click(nav.getByRole("link", { name: homeName }));
    expect(nav.getByRole("link", { name: homeName }).getAttribute("aria-current")).toBe("page");
    expect(nav.queryByRole("link", { name: /WhatsApp|Demo|Rules|Audit/ })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Requests marked current when opening a new request directly", async () => {
    mount(people[1], "/requests/new");
    const nav = within(await screen.findByRole("navigation", { name: "Main navigation" }));
    expect(nav.getByRole("link", { name: "Requests" }).getAttribute("aria-current")).toBe("page");
    expect(nav.getByRole("link", { name: "My orders" }).hasAttribute("aria-current")).toBe(false);
  });

  it("identifies the order section and keeps a named way home on an order detail", async () => {
    vi.spyOn(api, "basket").mockRejectedValue(new Error("Saved order is no longer available"));
    mount(people[1], "/baskets/wedding");
    const nav = within(await screen.findByRole("navigation", { name: "Main navigation" }));
    expect(nav.getByRole("link", { name: "My orders" }).getAttribute("aria-current")).toBe("location");
    expect(nav.getByRole("link", { name: "My orders" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Go to homepage" }).getAttribute("href")).toBe("/");
  });

  it("lets keyboard users reach the visible destinations without opening a menu", async () => {
    const user = userEvent.setup();
    mount();
    const nav = within(await screen.findByRole("navigation", { name: "Main navigation" }));
    nav.getByRole("link", { name: "My orders" }).focus();
    for (const [name] of destinations) {
      await user.tab();
      expect(document.activeElement).toBe(nav.getByRole("link", { name }));
    }
    await user.keyboard("{Enter}");
    expect(nav.getByRole("link", { name: "Order receipts" }).getAttribute("aria-current")).toBe("page");
  });
});
