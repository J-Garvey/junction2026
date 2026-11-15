// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Live } from "../src/live/Live";

let stream: EventTarget;
const state = {
  session: { id: "fixture-session", status: "idle", steps: [], error: null, model: "fixture" },
  rules: { hotel: "Demo hotel", spendCapEur: 1950, delivery: "Monday", site: "fixture", unconfirmedStock: "Ask the chef", signed: true },
  clock: "2026-11-14T10:00:00Z", model: "fixture", modelReady: false,
  feed: [{ id: "fixture-feed", at: "2026-11-14T10:00:00Z", agent: "Hotel agent", callerKind: "agent", method: "POST", path: "/gateway/v1/orders", status: 201, action: "ORDER", verdict: "ALLOWED", amount: 12.4, reason: null, signed: true, quoteId: "fixture-quote", orderId: "fixture-order" }],
};

beforeEach(() => {
  vi.stubGlobal("EventSource", class extends EventTarget {
    constructor() { super(); stream = this; }
    close() {}
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url === "/api/live/state" ? state : ({ order: { lines: [], totalExVat: 12.4 }, signature: { valid: true, alg: "ES256", jwks: "/.well-known/jwks.json", jws: "synthetic-receipt-signature" } }) })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function load(reducedMotion = false) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reducedMotion }));
  await act(async () => { render(<Live />); });
  await act(async () => stream.dispatchEvent(new MessageEvent("state", { data: JSON.stringify(state) })));
}

describe("live console accessibility", () => {
  it("offers hotel sign-in when the console session is unauthenticated", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await act(async () => { render(<Live />); });
    expect(screen.getByRole("link", { name: "Open hotel sign-in" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: /Send/ })).toBeNull();
  });
  it.each([true, false])("respects reduced motion when following new activity (%s)", async (reducedMotion) => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(() => {});
    await load(reducedMotion);
    expect(scroll).toHaveBeenLastCalledWith({ top: expect.any(Number), behavior: reducedMotion ? "auto" : "smooth" });
  });

  it("exposes one main heading, the request field and a keyboard-focusable activity region", async () => {
    await load();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "Kitchen request" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Gateway activity, scroll for all columns" }).tabIndex).toBe(0);
  });

  it("announces a disconnected stream instead of claiming the monitor is live", async () => {
    await load();
    expect(screen.getByRole("status").textContent).toContain("Live API monitor");
    act(() => { const source = stream as EventSource; source.onerror?.call(source, new Event("error")); });
    expect(screen.getByRole("status").textContent).toContain("Reconnecting to gateway");
  });

  it.each(["Enter", " "])("opens a named native order dialog using %s and closes on cancel", async (key) => {
    await load();
    const trigger = screen.getByRole("button", { name: "View signed order fixture-order" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key });
    const dialog = await screen.findByRole("dialog", { name: "Signed order fixture-order" });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    const receiptToken = await screen.findByRole("region", { name: "Signed receipt token" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close signed order" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(receiptToken);
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close signed order" }));
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
