import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { Basket } from "../src/api";
import { BasketCard } from "../src/ui/BasketCard";
import { OrderBy } from "../src/ui/OrderBy";

const basket: Basket = {
  id: "wedding", name: "Emma and Lauri's wedding", deliveryDate: "2026-11-16", guests: 180,
  coverage: { level: "none", text: "Not ordered" }, lines: 1, totalExVat: 119.84, waiting: 0, waitingOthers: 0,
  requests: 1, approvalLevels: [], confirmed: false,
  orderBy: { state: "known", at: "2026-11-15T15:00:00Z", reason: null, usesFixtures: true },
};
const render = (changes: Partial<Basket> = {}, role = "chef") => renderToStaticMarkup(<MemoryRouter><BasketCard basket={{ ...basket, ...changes }} role={role} /></MemoryRouter>);

describe("order cards", () => {
  it("shows the dated supplier cutoff in Helsinki time and labels fixtures", () => {
    const html = render();
    expect(html).toContain("Order by");
    expect(html).toContain('dateTime="2026-11-15T15:00:00Z"');
    expect(html).toContain("17:00");
    expect(html).toContain("Helsinki");
    expect(html).toContain("Fixture");
  });

  it("omits both irrelevant approval rows and a zero-count footer", () => {
    const html = render({ approvalLevels: [{ role: "chef", count: 0 }, { role: "approver", count: 0 }] });
    expect(html).not.toContain("Chef review");
    expect(html).not.toContain("Manager approval");
    expect(html).not.toContain("waiting for approval");
    expect(html).toContain("View order");
    expect(html).not.toContain("Confirmed");
    expect(html).not.toContain('class="btile confirmed"');
  });

  it.each(["chef", "approver"] as const)("shows only the pending %s role with its real count", (role) => {
    const html = render({ approvalLevels: [{ role, count: 2 }] }, role);
    expect(html).toContain(role === "chef" ? "Chef review" : "Manager approval");
    expect(html).not.toContain(role === "chef" ? "Manager approval" : "Chef review");
    expect(html).toContain('class="current"');
    expect(html).toContain("2 waiting for approval");
  });

  it("shows a readable confirmed state only when the server confirms the whole basket", () => {
    const html = render({ confirmed: true });
    expect(html).toContain('class="btile confirmed"');
    expect(html).toContain("Confirmed");
    expect(html).not.toContain("waiting for approval");
  });

  it.each(["unknown", "unavailable", "expired"] as const)("makes a %s cutoff explicit", (state) => {
    const deadline = { ...basket.orderBy, state, at: state === "expired" ? basket.orderBy.at : null, reason: "Supplier evidence is incomplete." };
    const html = renderToStaticMarkup(<OrderBy deadline={deadline} detail />);
    expect(html).toContain(state[0].toUpperCase() + state.slice(1));
    expect(html).toContain(deadline.reason);
  });
});
