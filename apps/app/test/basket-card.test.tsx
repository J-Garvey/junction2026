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
  orderBy: { state: "known", at: "2026-11-15T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 },
};
const render = (changes: Partial<Basket> = {}, role = "chef") => renderToStaticMarkup(<MemoryRouter><BasketCard basket={{ ...basket, ...changes }} role={role} /></MemoryRouter>);

describe("order cards", () => {
  it("shows only the dated cutoff on the card, with notes behind the info marker", () => {
    const html = render();
    expect(html).not.toContain("Order by");
    expect(html).not.toContain("Fixture");
    expect(html).toContain('dateTime="2026-11-15T15:00:00Z"');
    expect(html).toContain("17:00");
    expect(html).not.toContain("Helsinki");
    expect(html).toContain('<summary aria-label="About this ordering deadline">');
    expect(html).toContain('role="note"');
    expect(html).not.toContain("excluded from the calculation");
  });

  it("labels the order deadline and fixtures in the detail", () => {
    const html = renderToStaticMarkup(<OrderBy deadline={basket.orderBy} detail />);
    expect(html).toContain("Order by");
    expect(html).toContain("Demo data");
  });

  it("shows the saved creator alongside the guest count", () => {
    const html = render({ guests: 96, createdBy: "Mikko" });
    expect(html).toContain("96 guests");
    expect(html).toContain("Created by ");
    expect(html).toContain("Mikko");
  });

  it("explains the supplier cutoff in the detail without treating it as review expiry", () => {
    const html = renderToStaticMarkup(<OrderBy deadline={basket.orderBy} detail />);
    expect(html).toContain("Supplier ordering cutoff; stock and delivery terms are rechecked when ordering.");
    expect(html).not.toContain("Review expires");
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

  it.each([false, true])("explains a partial deadline with a native keyboard/touch disclosure (detail: %s)", (detail) => {
    const deadline = { ...basket.orderBy, excludedItems: 2 };
    const html = renderToStaticMarkup(<OrderBy deadline={deadline} detail={detail} />);
    expect(html).toContain('dateTime="2026-11-15T15:00:00Z"');
    expect(html).toContain('<details class="order-deadline-info popwrap">');
    expect(html).toMatch(/<summary aria-label="About (items with unknown delivery information|this ordering deadline)"><sup aria-hidden="true">i<\/sup><\/summary>/);
    expect(html).toContain('role="note"');
    expect(html).toContain("This deadline covers only items with known delivery information.");
    expect(html).toContain("2 items were excluded from the calculation");
    expect(html).toContain("Their delivery remains unconfirmed.");
  });

  it("keeps the info control separate from the card navigation link", () => {
    const html = render({ orderBy: { ...basket.orderBy, excludedItems: 1 } });
    expect(html).toContain('href="/baskets/wedding"');
    expect(html).toContain("1 item was excluded");
    const link = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
    expect(link).toContain("wedding");
    expect(link).not.toMatch(/<(summary|details|button)\b/);
  });

  it("keeps all-unknown delivery terms honest on the card and in the detail", () => {
    const deadline = { ...basket.orderBy, state: "unknown" as const, at: null, excludedItems: 2, reason: "No ordering deadline can be calculated. Delivery remains unconfirmed." };
    for (const detail of [false, true]) {
      const html = renderToStaticMarkup(<OrderBy deadline={deadline} detail={detail} />);
      expect(html).toContain("Unknown");
      expect(html).toContain(deadline.reason);
      expect(html).toContain("2 items were excluded");
      expect(html).not.toContain("This deadline covers");
      expect(html).not.toContain("<time");
    }
  });

  it("shows unconfirmed stock without a missing-delivery marker when every item has dated terms", () => {
    const deadline = { ...basket.orderBy, unconfirmedStockItems: 1, reason: "Stock is unconfirmed for 1 scheduled item. The ordering deadline does not confirm stock or delivery." };
    const html = render({ orderBy: deadline });
    expect(html).toContain("17:00");
    expect(html).toContain(deadline.reason);
    expect(html).toMatch(/role="note">[\s\S]*Stock is unconfirmed/);
    expect(html).not.toContain("excluded from the calculation");
  });

  it.each(["expired", "unavailable"] as const)("retains the %s result when some items lack delivery terms", (state) => {
    const deadline = { ...basket.orderBy, state, at: state === "expired" ? basket.orderBy.at : null, excludedItems: 1, reason: state === "unavailable" ? "No supplier schedule covers this item." : null };
    const html = renderToStaticMarkup(<OrderBy deadline={deadline} detail />);
    expect(html).toContain(state === "expired" ? "Expired" : "Unavailable");
    expect(html).toContain("1 item was excluded");
    expect(html).not.toContain("Unknown</strong>");
  });
});
