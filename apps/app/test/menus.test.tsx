// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { AccountMenu, OrderSwitcher } from "../src/App";
import { api, type Basket, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", hotelScope: false, outlets: ["banquet"] };
const context: AppCtx = { me: chef, people: [chef], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const basket = (id: string, name: string, deliveryDate: string): Basket => ({
  id, name, deliveryDate, guests: 100, lines: 0, totalExVat: 0, waiting: 0, waitingOthers: 0, requests: 0,
  coverage: { level: "none", text: "Not ordered" }, approvalLevels: [], confirmed: false,
  orderBy: { state: "unknown", at: null, reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 },
});
const baskets = [basket("conference", "Conference", "2026-11-20"), basket("wedding", "Wedding", "2026-11-17")];
const location = () => screen.getByTestId("location").textContent;
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
async function mount(kind: "account" | "orders") {
  const onSwitch = vi.fn();
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={["/requests"]}><Ctx.Provider value={context}>
    <button>Before menu</button>
    {kind === "account" ? <AccountMenu me={chef} onSwitch={onSwitch} /> : <OrderSwitcher />}
    <button>After menu</button>
    <Location />
  </Ctx.Provider></MemoryRouter>);
  if (kind === "orders") await waitFor(() => expect(api.baskets).toHaveResolved());
  const trigger = screen.getByRole("button", { name: kind === "account" ? "Signed in as Aino" : "My orders" });
  return { user, trigger, onSwitch };
}

beforeEach(() => { vi.spyOn(api, "baskets").mockResolvedValue({ baskets }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

for (const kind of ["account", "orders"] as const) describe(`${kind} menu keyboard`, () => {
  it.each(["{Enter}", " "])("moves focus into the menu on %s and returns it on Escape", async (key) => {
    const { user, trigger } = await mount(kind);
    trigger.focus();
    await user.keyboard(key);
    const items = screen.getAllByRole("menuitem");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps ArrowUp/Down and supports Home/End from any item", async () => {
    const { user, trigger } = await mount(kind);
    trigger.focus();
    await user.keyboard("{Enter}");
    const items = screen.getAllByRole("menuitem");
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(items.at(-1));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(items.at(-1));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(items[0]);
  });

  it("opens on ArrowDown at the first item and ArrowUp at the last item", async () => {
    const { user, trigger } = await mount(kind);
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem")[0]);
    await user.keyboard("{Escape}{ArrowUp}");
    expect(document.activeElement).toBe(screen.getAllByRole("menuitem").at(-1));
  });

  it.each([false, true])("closes and leaves the menu with Tab (shift=%s)", async (shift) => {
    const { user, trigger } = await mount(kind);
    trigger.focus();
    await user.keyboard("{Enter}{End}");
    await user.tab({ shift });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: shift ? "Before menu" : "After menu" }));
  });

  it("keeps pointer toggle, outside dismissal and link navigation working", async () => {
    const { user, trigger } = await mount(kind);
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "After menu" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "After menu" }));
    await user.click(trigger);
    await user.click(screen.getAllByRole("menuitem")[0]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(location()).toBe(kind === "account" ? "/audit" : "/baskets/wedding");
  });

  it("activates the focused link with Enter", async () => {
    const { user, trigger } = await mount(kind);
    trigger.focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(location()).toBe(kind === "account" ? "/rules" : "/baskets/conference");
  });
});

it("activates Switch user from the keyboard", async () => {
  const { user, trigger, onSwitch } = await mount("account");
  trigger.focus();
  await user.keyboard("{Enter}{End} ");
  expect(onSwitch).toHaveBeenCalledOnce();
  expect(screen.queryByRole("menu")).toBeNull();
});

it("handles an empty order list and keeps View all orders accessible", async () => {
  vi.mocked(api.baskets).mockResolvedValue({ baskets: [] });
  const { user, trigger } = await mount("orders");
  trigger.focus();
  await user.keyboard("{ArrowUp}");
  const item = screen.getByRole("menuitem", { name: "View all orders" });
  expect(document.activeElement).toBe(item);
  await user.keyboard("{ArrowDown}{ArrowUp}{Home}{End}");
  expect(document.activeElement).toBe(item);
  await user.keyboard("{Enter}");
  expect(location()).toBe("/");
  expect(screen.queryByRole("menu")).toBeNull();
});
