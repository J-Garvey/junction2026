import { describe, expect, it } from "vitest";
import type { AvailabilityEvidence, Order, Plan, Question } from "@aimo/contracts";
import { approvalLevels, basketStatus, isConfirmedOrder, orderDeadline, pendingQuestions, type DeadlineItem } from "../src/agent/basketSummary.js";

process.env.AIMO_DB = ":memory:";
const { normalise } = await import("../src/aimo/lookup.js");
const at = new Date("2026-11-14T10:00:00Z");
const delivery = "2026-11-16";
const schedule = (changes: Partial<AvailabilityEvidence["schedules"][number]> = {}): AvailabilityEvidence["schedules"][number] => ({
  availableDate: delivery, closingTime: "2026-11-15T17:00:00+0200", stock: { kind: "known", amount: 20 }, salesUnit: "KI", salesBlock: false, ...changes,
});
const item = (changes: Partial<DeadlineItem> = {}): DeadlineItem => ({
  productId: "469672", quantity: 10, salesUnit: "KI", source: "fixture", deliveryDate: delivery,
  availabilityEvidence: { salesBlock: false, schedules: [schedule()] }, ...changes,
});
const withSchedules = (...schedules: AvailabilityEvidence["schedules"]) => item({ availabilityEvidence: { salesBlock: false, schedules } });
const q = (role: "chef" | "approver", state: Question["state"] = "open", deadline: string | null = null) => ({ forRole: role, state, deadline }) as Question;
const plan = (changes: Partial<Plan> = {}) => ({ id: "plan", status: "ordered", orderIds: ["order"], lines: [], ...changes }) as Plan;
function order(changes: Partial<Order> = {}): Order {
  return {
    id: "order", quoteId: "quote", hotelId: "hotel", siteId: "site", eventId: "event", deliveryDate: delivery, state: "placed",
    totalExVat: 10, totalVat: 1.35, placedAt: at.toISOString(), placedBy: "Aino", approvalId: null, idempotencyKey: "idem", version: 1, flags: [],
    lines: [{
      lineNo: 1, ref: null, productId: "469672", productName: "Salmon", outletId: "kitchen", quantity: 10, salesUnit: "KI", unitPrice: 1, lineTotal: 10,
      taxRate: 13.5, stock: { kind: "known", amount: 20 }, availableDate: delivery, closingTime: "2026-11-15T17:00:00+0200", priceValidTo: null,
      logisticModel: "Stock", source: "fixture", rules: [], outcome: "order", removed: false, riskAccepted: null,
      availabilityEvidence: item().availabilityEvidence,
    }], ...changes,
  };
}

describe("order-by aggregation from supplier schedules", () => {
  it("uses the earliest item cutoff, comparing actual instants with differing offsets", () => {
    const early = withSchedules(schedule({ closingTime: "2026-11-15T15:30:00+0100" }));
    early.productId = "other";
    expect(orderDeadline([item(), early], delivery, at)).toMatchObject({ state: "known", at: "2026-11-15T14:30:00.000Z", usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0, reason: null });
  });

  it("chooses the latest feasible full-quantity option, ignoring blocked, late, short and incompatible-unit alternatives", () => {
    const options = withSchedules(
      schedule({ closingTime: "2026-11-14T17:00:00+0200" }),
      schedule(),
      schedule({ availableDate: "2026-11-17", closingTime: "2026-11-16T17:00:00+0200" }),
      schedule({ stock: { kind: "known", amount: 9 }, closingTime: "2026-11-16T10:00:00+0200" }),
      schedule({ salesBlock: true, closingTime: "2026-11-16T10:00:00+0200" }),
      schedule({ salesUnit: "ST", closingTime: "2026-11-16T10:00:00+0200" }),
    );
    expect(orderDeadline([options], delivery, at)).toMatchObject({ state: "known", at: "2026-11-15T15:00:00.000Z" });
  });

  it("combines repeated SKU demand across requests and outlets without multiplying stock", () => {
    expect(orderDeadline([item({ quantity: 11 }), item({ quantity: 10 })], delivery, at).state).toBe("unavailable");
    expect(orderDeadline([item({ quantity: 10 }), item({ quantity: 10 })], delivery, at).state).toBe("known");
  });

  it("does not add together alternative schedule inventory", () => {
    expect(orderDeadline([withSchedules(schedule({ stock: { kind: "known", amount: 6 } }), schedule({ stock: { kind: "known", amount: 6 } }))], delivery, at).state).toBe("unavailable");
  });

  it("does not replace a conflicting saved snapshot with a more optimistic one", () => {
    expect(orderDeadline([item({ quantity: 5 }), { ...withSchedules(schedule({ stock: { kind: "known", amount: 9 } })), quantity: 5 }], delivery, at).state).toBe("unavailable");
  });

  it.each([
    schedule({ closingTime: null }), schedule({ closingTime: "invalid" }), schedule({ closingTime: "2026-11-15T17:00:00" }),
    schedule({ closingTime: "2026-02-30T17:00:00Z" }),
    schedule({ availableDate: null }), schedule({ availableDate: "2026-02-30" }), schedule({ salesUnit: null }),
  ])("excludes incomplete delivery terms without hiding known items' cutoffs (%j)", (s) => {
    expect(orderDeadline([withSchedules(s), item({ productId: "other" })], delivery, at)).toMatchObject({ state: "known", at: "2026-11-15T15:00:00.000Z", excludedItems: 1 });
    expect(orderDeadline([withSchedules(s)], delivery, at)).toMatchObject({ state: "unknown", at: null, excludedItems: 1, reason: expect.stringContaining("delivery remains unconfirmed") });
  });

  it("uses each dated item's latest feasible option, then the earliest limiting cutoff in a mixed basket", () => {
    const later = withSchedules(schedule({ closingTime: "2026-11-14T16:00:00Z" }), schedule({ closingTime: "2026-11-15T16:00:00Z" }));
    const earlier = item({ productId: "earlier", availabilityEvidence: { salesBlock: false, schedules: [schedule({ closingTime: "2026-11-15T14:00:00Z" })] } });
    const missing = [item({ productId: "undated", deliveryDate: null }), item({ productId: "no-evidence", availabilityEvidence: undefined })];
    expect(orderDeadline([...missing, later, earlier], delivery, at)).toMatchObject({ state: "known", at: "2026-11-15T14:00:00.000Z", excludedItems: 2 });
    expect(orderDeadline(missing, delivery, at)).toMatchObject({ state: "unknown", at: null, excludedItems: 2 });
  });

  it.each([
    { kind: "unknown", reason: "terminal_sentinel" }, { kind: "unknown", reason: "stock_sentinel" },
    { kind: "none" }, { kind: "known", amount: NaN },
  ] as const)("separates known delivery timing from unconfirmed stock (%j)", (stock) => {
    const dated = withSchedules(schedule({ stock, closingTime: "2026-11-15T14:00:00Z" }));
    const before = structuredClone(dated);
    expect(orderDeadline([item({ productId: "other" }), dated], delivery, at)).toMatchObject({
      state: "known", at: "2026-11-15T14:00:00.000Z", excludedItems: 0, unconfirmedStockItems: 1,
      reason: expect.stringContaining("does not confirm stock or delivery"),
    });
    expect(orderDeadline([dated], delivery, new Date("2026-11-15T14:00:00Z"))).toMatchObject({ state: "expired", unconfirmedStockItems: 1 });
    expect(dated).toEqual(before);
  });

  it("does not replace a proven full-quantity option with a later stock-unknown option", () => {
    expect(orderDeadline([withSchedules(schedule(), schedule({ stock: { kind: "unknown", reason: "stock_sentinel" }, closingTime: "2026-11-15T16:00:00Z" }))], delivery, at))
      .toMatchObject({ state: "known", at: "2026-11-15T15:00:00.000Z", unconfirmedStockItems: 0 });
  });

  it("allows a proven option even when other alternatives are unknown", () => {
    expect(orderDeadline([withSchedules(schedule({ closingTime: null }), schedule())], delivery, at).state).toBe("known");
  });

  it.each([
    { salesBlock: true, schedules: [schedule()] }, { salesBlock: false, schedules: [] },
    { salesBlock: false, schedules: [schedule({ availableDate: "2026-11-17" })] },
    { salesBlock: false, schedules: [schedule({ salesBlock: true })] },
  ])("reports unavailable supplier evidence (%j)", (availabilityEvidence) => {
    expect(orderDeadline([item({ availabilityEvidence })], delivery, at)).toMatchObject({ state: "unavailable", at: null });
    const unavailable = item({ productId: "unavailable", availabilityEvidence });
    const unknown = item({ productId: "unknown", deliveryDate: null, availabilityEvidence: undefined });
    for (const items of [[unknown, item(), unavailable], [unavailable, item(), unknown]])
      expect(orderDeadline(items, delivery, at)).toMatchObject({ state: "unavailable", at: null, excludedItems: 1 });
  });

  it("retains known late, short, blocked and incompatible schedules even when other fields are missing", () => {
    const unknown = item({ productId: "unknown", availabilityEvidence: undefined });
    for (const s of [
      schedule({ availableDate: "2026-11-17", closingTime: null }),
      schedule({ stock: { kind: "known", amount: 9 }, availableDate: null }),
      schedule({ salesUnit: "ST", closingTime: null }),
      schedule({ salesBlock: true, availableDate: null }),
      schedule({ closingTime: "2026-11-17T10:00:00Z" }),
    ]) expect(orderDeadline([unknown, withSchedules(s)], delivery, at)).toMatchObject({ state: "unavailable", at: null });
    expect(orderDeadline([unknown, item({ deliveryDate: "2026-11-17", salesUnit: null })], delivery, at).state).toBe("unavailable");
  });

  it("keeps repeated-SKU quantities combined even when one line's delivery date is unknown", () => {
    expect(orderDeadline([item({ quantity: 11 }), item({ quantity: 10, deliveryDate: null })], delivery, at).state).toBe("unavailable");
  });

  it("does not promise an item scheduled after the card delivery date or shift its cutoff", () => {
    expect(orderDeadline([item({ deliveryDate: "2026-11-17" })], delivery, at).state).toBe("unavailable");
    const normalized = normalise("469672", { closingTime: "2026-11-15T17:00:00+0200", logisticModel: "Stock", scheduleLines: [{ availableAmount: 20, availableDate: delivery, salesUnit: "KI" }] }, undefined, "fixture", "test", at.toISOString());
    // Simulate an older saved snapshot that projected top-level terms.
    const projected = { ...normalized, availableDate: "2026-11-30", closingTime: "2026-11-29T17:00:00+0200" };
    expect(projected.closingTime).toBe("2026-11-29T17:00:00+0200");
    expect(orderDeadline([{ ...item(), ...projected, deliveryDate: "2026-11-30" }], "2026-11-30", new Date("2026-11-17T10:00:00Z")))
      .toMatchObject({ state: "expired", at: "2026-11-15T15:00:00.000Z" });
  });

  it("requires original evidence for old snapshots and handles empty or unresolved baskets", () => {
    expect(orderDeadline([item({ availabilityEvidence: undefined })], delivery, at).state).toBe("unknown");
    expect(orderDeadline([], delivery, at).state).toBe("unknown");
    expect(orderDeadline([item({ productId: null })], delivery, at).state).toBe("unknown");
    expect(orderDeadline([item()], "2026-02-30", at).state).toBe("unknown");
    expect(basketStatus(delivery, [order()], [plan({ orderIds: [], lines: [] })], [], at)).toMatchObject({ confirmed: false, orderBy: { state: "known", excludedItems: 1 } });
    expect(basketStatus(delivery, [], [plan({ orderIds: [], lines: [] })], [], at)).toMatchObject({ confirmed: false, orderBy: { state: "unknown", at: null, excludedItems: 1 } });
  });

  it("marks the cutoff expired at the exact cutoff instant, retaining the historical deadline", () => {
    expect(orderDeadline([item()], delivery, new Date("2026-11-15T15:00:00Z"))).toMatchObject({ state: "expired", at: "2026-11-15T15:00:00.000Z" });
    expect(orderDeadline([item({ availabilityEvidence: undefined }), item({ productId: "dated" })], delivery, new Date("2026-11-15T15:00:00Z")))
      .toMatchObject({ state: "expired", at: "2026-11-15T15:00:00.000Z", excludedItems: 1 });
  });

  it("retains every original schedule and never normalizes malformed stock to confirmed quantity", () => {
    const l = normalise("469672", { closingTime: "2026-11-15T17:00:00+0200", scheduleLines: [
      { availableAmount: 0, availableDate: delivery, salesUnit: "KI", salesBlock: true },
      { availableAmount: 20, availableDate: delivery, salesUnit: "KI" },
      { availableAmount: null, availableDate: delivery, salesUnit: "KI" },
    ] }, undefined, "fixture", "test", at.toISOString());
    expect(l.availabilityEvidence?.schedules).toHaveLength(3);
    expect(l.availabilityEvidence?.schedules[2].stock.kind).toBe("none");
    expect(orderDeadline([{ ...item(), availabilityEvidence: l.availabilityEvidence }], delivery, at).state).toBe("known");
  });
});

describe("conditional approvals and whole-order confirmation", () => {
  it("includes only pending role counts, including approvals waiting on a chef, and excludes expired decisions", () => {
    const pending = pendingQuestions([q("chef"), q("approver", "waiting"), q("chef", "answered"), q("chef", "expired"), q("chef", "replaced"), q("chef", "open", at.toISOString())], at);
    expect(approvalLevels(pending)).toEqual([{ role: "chef", count: 1 }, { role: "approver", count: 1 }]);
    expect(approvalLevels(pendingQuestions([q("approver", "open")], at))).toEqual([{ role: "approver", count: 1 }]);
    expect(approvalLevels([])).toEqual([]);
  });

  it.each(["placed", "amended", "checked", "locked"] as const)("recognizes committed %s orders even after their cutoff", (state) => {
    const placed = order({ state });
    expect(isConfirmedOrder(placed)).toBe(true);
    expect(basketStatus(delivery, [placed], [plan()], [], new Date("2026-11-20T10:00:00Z")).confirmed).toBe(true);
  });

  it("never confirms empty, rejected, flagged, unconfirmed-stock, short, or late orders", () => {
    const placed = order();
    for (const changed of [
      order({ lines: [] }), order({ state: "rejected" }), order({ flags: ["short"] }),
      order({ lines: [{ ...placed.lines[0], stock: { kind: "unknown", reason: "stock_sentinel" }, riskAccepted: { by: "Aino", at: at.toISOString() } }] }),
      order({ lines: [{ ...placed.lines[0], stock: { kind: "known", amount: 9 } }] }),
      order({ lines: [{ ...placed.lines[0], availableDate: "2026-11-17" }] }),
      order({ lines: [{ ...placed.lines[0], removed: true }] }),
      order({ lines: [{ ...placed.lines[0], availabilityEvidence: undefined }] }),
      order({ lines: [{ ...placed.lines[0], availabilityEvidence: { salesBlock: false, schedules: [schedule({ stock: { kind: "unknown", reason: "stock_sentinel" } })] } }] }),
      order({ lines: [...placed.lines, { ...placed.lines[0], lineNo: 2, availabilityEvidence: undefined }] }),
      order({ placedAt: "2026-11-17T10:00:00Z" }),
    ]) expect(isConfirmedOrder(changed)).toBe(false);
  });

  it("does not label a draft or partially committed basket confirmed", () => {
    expect(basketStatus(delivery, [], [], [], at).confirmed).toBe(false);
    expect(basketStatus(delivery, [order()], [plan({ orderIds: [], status: "waiting" })], [], at).confirmed).toBe(false);
    expect(basketStatus(delivery, [order()], [plan({ orderIds: ["missing-order"] })], [], at).confirmed).toBe(false);
    expect(basketStatus(delivery, [order()], [plan()], [q("chef")], at).confirmed).toBe(false);
    expect(basketStatus(delivery, [order()], [plan()], [], at, true).confirmed).toBe(false);
    expect(basketStatus("2026-11-15", [order()], [plan()], [], at).confirmed).toBe(false);
    expect(basketStatus(delivery, [order()], [plan({ status: "kept_short" })], [], at).confirmed).toBe(false);
  });

  it("requires enough supplier stock for repeated SKUs across all committed orders", () => {
    const first = order();
    const second = order({ id: "second" });
    expect(basketStatus(delivery, [first, second], [], [], at).confirmed).toBe(true);
    first.lines[0].quantity = 15;
    second.lines[0].quantity = 15;
    expect(basketStatus(delivery, [first, second], [], [], at)).toMatchObject({ confirmed: false, orderBy: { state: "unavailable" } });
  });

  it("keeps partial deadlines informational and never confirms a basket with excluded items", () => {
    const partial = order();
    partial.lines.push({ ...partial.lines[0], lineNo: 2, productId: "unknown", availabilityEvidence: undefined });
    expect(basketStatus(delivery, [partial], [], [], at)).toMatchObject({ confirmed: false, orderBy: { state: "known", excludedItems: 1 } });
  });
});
