// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import type { AuditEntry } from "@aimo/contracts";
import { api, type AuditResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { Audit } from "../src/screens/Audit";

const manager: Person = { id: "sanna", name: "Sanna", title: "Finance manager", role: "approver", hotelScope: true, outlets: ["banquet"] };
const context: AppCtx = { me: manager, people: [manager], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
const entry = (id: string, fields: Partial<AuditEntry> = {}): AuditEntry => ({
  id, seq: 1, simTime: context.now, realTime: context.now,
  actor: { kind: "person", id: "sanna", name: "Sanna", role: "approver", outletId: null, testSession: true },
  action: "quote_created", summary: id, eventId: "event-one", quoteId: null, orderId: null, questionId: null,
  ruleIds: [], judgements: [], details: {}, usesFixture: true, visibility: "shared", hash: "hash", prevHash: "genesis", ...fields,
});
const placed = entry("placement", { action: "order_placed", summary: "Placed ord-one", orderId: "ord-one", details: { quoteId: "quo-one", approvalId: "apr-one" } });
const approved = entry("approval", { action: "approval_granted", summary: "Approved quo-one", quoteId: "quo-one", details: { approvalId: "apr-one" } });
const quoted = entry("quote", { summary: "Created quo-one", quoteId: "quo-one", details: { planId: "plan-one" }, ruleIds: ["MAN-01"] });
const unrelated = entry("unrelated", { summary: "Separate quote for the same event", quoteId: "quo-two", details: { planId: "plan-one" } });
const response = (entries = [placed, approved, quoted, unrelated], viewer: AuditResp["viewer"] = "hotel"): AuditResp => ({
  viewer, entries, chain: { ok: true, brokenAt: null, entries: 20 }, decisions: null,
});
function mount(path = "/audit") {
  return render(<MemoryRouter initialEntries={[path]}><Ctx.Provider value={context}><Audit /><Link to="/audit?viewer=valio">Supplier view</Link></Ctx.Provider></MemoryRouter>);
}

beforeEach(() => {
  vi.spyOn(api, "audit").mockResolvedValue(response());
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected request outside the scoped audit response"));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("audit references", () => {
  it.each(["ord-one", "quo-one", "apr-one"])("finds the related quote, approval and placement by %s", async (id) => {
    mount();
    await screen.findByText(placed.summary);
    fireEvent.change(screen.getByRole("textbox", { name: "Filter audit log" }), { target: { value: `  ${id.toUpperCase()}  ` } });
    expect(screen.getByText(placed.summary)).toBeTruthy();
    expect(screen.getByText(approved.summary)).toBeTruthy();
    expect(screen.getByText(quoted.summary)).toBeTruthy();
    expect(screen.queryByText(unrelated.summary)).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("status").textContent).toContain("Hash chain verified");
    expect(screen.getByRole("status").textContent).toContain("20 entries");
    expect(api.audit).toHaveBeenCalledExactlyOnceWith("hotel", undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("provides shareable reference filters and a clear empty-result recovery within the event scope", async () => {
    mount("/audit?eventId=event-one");
    const link = (await screen.findAllByRole("link", { name: "Approval apr-one" }))[0];
    expect(link.getAttribute("href")).toBe("/audit?eventId=event-one&q=apr-one");
    await userEvent.click(link);
    expect((screen.getByRole("textbox", { name: "Filter audit log" }) as HTMLInputElement).value).toBe("apr-one");
    expect(screen.getByText(placed.summary)).toBeTruthy();
    expect(screen.getByText(quoted.summary)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter audit log" }), { target: { value: "no-such-reference" } });
    expect(screen.getByText("No entries match this filter.")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText(unrelated.summary)).toBeTruthy();
    expect(api.audit).toHaveBeenCalledExactlyOnceWith("hotel", "event-one");
  });

  it.each(["audit-entry", "question-one", "plan-one", "event-one", "MAN-01", "Sanna", "quote_created"])("retains named structured ID and text filtering for %s", async (q) => {
    vi.mocked(api.audit).mockResolvedValue(response([entry("audit-entry", { ...quoted, id: "audit-entry", questionId: "question-one" })]));
    mount(`/audit?q=${encodeURIComponent(q)}`);
    expect(await screen.findByText(quoted.summary)).toBeTruthy();
  });

  it("does not index or render arbitrary payloads, sensitive text, or malformed reference values", async () => {
    vi.mocked(api.audit).mockResolvedValue(response([entry("safe-entry", { details: {
      request: { originalText: "private-guest-diet" }, preferences: "private-preference", note: "private-note",
      quoteId: { id: "nested-quote" }, orderId: ["array-order"], approvalId: 123,
    } })]));
    mount();
    await screen.findByText("safe-entry");
    for (const q of ["private-guest-diet", "private-preference", "private-note", "nested-quote", "array-order", "123", "[object Object]"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "Filter audit log" }), { target: { value: q } });
      expect(screen.getByText("No entries match this filter.")).toBeTruthy();
    }
  });

  it("keeps supplier filtering and reference links within the returned shared entries", async () => {
    const privateEntry = entry("hotel-secret", { visibility: "hotel", orderId: "ord-one", quoteId: "quo-two", details: { approvalId: "private-approval" } });
    vi.mocked(api.audit).mockResolvedValue(response([placed, approved, quoted, privateEntry, unrelated], "valio"));
    mount("/audit?viewer=valio&eventId=event-one&q=ord-one");
    await screen.findByText(placed.summary);
    expect(screen.getByText(quoted.summary)).toBeTruthy();
    expect(screen.queryByText(privateEntry.summary)).toBeNull();
    expect(screen.queryByText(unrelated.summary)).toBeNull();
    expect(screen.queryByRole("link", { name: /private-approval|Event event-one|Request plan-one/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Quote quo-one" })[0].getAttribute("href")).toBe("/audit?viewer=valio&eventId=event-one&q=quo-one");
    expect(screen.getByRole("link", { name: "All entries" }).getAttribute("href")).toBe("/audit?viewer=valio&q=ord-one");
    expect(api.audit).toHaveBeenCalledExactlyOnceWith("valio", "event-one");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not search hotel-only reference fields in supplier mode", async () => {
    vi.mocked(api.audit).mockResolvedValue(response([entry("shared", { questionId: "question-one", details: { planId: "plan-one" } })], "valio"));
    mount("/audit?viewer=valio");
    await screen.findByText("shared");
    for (const q of ["event-one", "question-one", "plan-one"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "Filter audit log" }), { target: { value: q } });
      expect(screen.getByText("No entries match this filter.")).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears old hotel entries while a supplier response is pending", async () => {
    vi.mocked(api.audit).mockResolvedValueOnce(response([entry("hotel-only", { visibility: "hotel" })])).mockReturnValue(new Promise(() => {}));
    mount();
    await screen.findByText("hotel-only");
    await userEvent.click(screen.getByRole("link", { name: "Supplier view" }));
    await waitFor(() => expect(api.audit).toHaveBeenLastCalledWith("valio", undefined));
    expect(screen.queryByText("hotel-only")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows an empty audit and preserves the broken-chain warning", async () => {
    vi.mocked(api.audit).mockResolvedValue({ ...response([]), chain: { ok: false, brokenAt: 7, entries: 20 } });
    mount();
    expect(await screen.findByText("No entries.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Hash chain broken at entry 7");
  });
});
