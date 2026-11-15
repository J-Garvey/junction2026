// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { api, authHooks, type HomeResp, type Person, type RulesResp } from "../src/api";

const jonas: Person = { id: "jonas", name: "Jonas", title: "F&B director", role: "approver", hotelScope: true, outlets: ["banquet"] };
const aino: Person = { ...jonas, id: "aino", name: "Aino", title: "Chef", role: "chef", hotelScope: false };
const home: HomeResp = { questions: [], events: [], plans: [], warnings: [] };
const warning: HomeResp["warnings"][number] = {
  id: "warning", eventId: "private-event", kind: "allergy", text: "Previous session's allergy warning", productId: "cake", productName: "Cake",
  allergen: "nuts", groupId: "guests", count: 1, orderId: "order", state: "open", resolvedBy: null, resolution: null, createdAt: "2026-11-14T10:00:00Z",
};
const rules = (canEdit = true): RulesResp => ({
  rules: [],
  mandate: {
    id: "mandate", type: "aimo.mandate.standing.1", hotelId: "hotel", customerNumber: "demo", sites: [], spendCapEur: 1950,
    blockedProducts: [], deliveryDays: [1], holidays: [], version: 1,
    preAnswers: { partialFillMaxShortPct: null, unknownStockMaxLineEur: null, overshootMaxPct: 10, overshootMaxEur: 25, priceRiseMaxPct: 5, guestChangeMaxPct: 5 },
  },
  params: {
    spendCapEur: { key: "spendCapEur", scope: "mandate", label: "Spend cap per order", kind: "eur" },
    blockedProducts: { key: "blockedProducts", scope: "mandate", label: "Blocked product codes", kind: "products" },
  },
  defaultParams: { spendCapEur: 1950, blockedProducts: [] },
  policy: { params: {}, version: 1, updatedBy: null, updatedAt: null },
  canEdit, fixed: {}, remembered: [], tokens: { outsideAgent: "fixture-agent", valioViewer: "fixture-viewer" },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const mount = () => render(<MemoryRouter initialEntries={["/rules"]}><App /></MemoryRouter>);
const spend = () => screen.getByRole("spinbutton", { name: "Spend cap per order" }) as HTMLInputElement;

async function draftRules() {
  const input = await screen.findByRole("spinbutton", { name: "Spend cap per order" });
  await userEvent.clear(input);
  await userEvent.type(input, "2000");
  const blocked = screen.getByRole("textbox", { name: "Add to Blocked product codes" });
  await userEvent.type(blocked, "469363{Enter}");
  expect(screen.getByText("2 unsaved changes")).toBeTruthy();
  return input;
}

async function openPicker(name = "Jonas") {
  await userEvent.click(screen.getByRole("button", { name: `Signed in as ${name}` }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Switch user" }));
  expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
}

beforeEach(() => {
  vi.spyOn(api, "people").mockResolvedValue({ people: [jonas, aino], outlets: [] });
  vi.spyOn(api, "me").mockResolvedValue({ person: jonas });
  vi.spyOn(api, "session").mockImplementation(async (id) => ({ person: id === aino.id ? aino : jonas }));
  vi.spyOn(api, "status").mockResolvedValue({
    clock: { mode: "fixed", time: null, scene: null, now: "2026-11-14T10:00:00Z", scenes: {
      "1": { label: "Booking", time: "2026-08-14T10:00:00Z" }, "2": { label: "Change", time: "2026-08-14T10:00:00Z" },
      "3": { label: "Before cutoff", time: "2026-10-30T10:00:00Z" }, "4": { label: "Final check", time: "2026-11-14T10:00:00Z" },
    } },
    dataMode: "fixture", model: { provider: "openai", model: "fixture", configured: false }, chain: { ok: true, brokenAt: null, entries: 0 },
  });
  vi.spyOn(api, "home").mockResolvedValue(home);
  vi.spyOn(api, "baskets").mockResolvedValue({ baskets: [] });
  vi.spyOn(api, "rules").mockResolvedValue(rules());
  vi.spyOn(api, "saveRules").mockResolvedValue(rules());
});

afterEach(() => {
  cleanup();
  authHooks.onUnauthorized = () => {};
  vi.restoreAllMocks();
});

describe("person picker session boundaries", () => {
  it("preserves both unsaved rule edits and nested input text when switching is cancelled", async () => {
    const { container } = mount();
    const input = await draftRules();
    await userEvent.type(screen.getByRole("textbox", { name: "Add to Blocked product codes" }), "unfinished");

    await openPicker();
    expect(input.isConnected).toBe(true);
    expect(container.querySelector<HTMLElement>(".shell")?.style.display).toBe("none");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save rules" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(spend()).toBe(input);
    expect(spend().value).toBe("2000");
    expect(screen.getByRole("button", { name: "Remove 469363" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Add to Blocked product codes" }) as HTMLInputElement).value).toBe("unfinished");
    expect(screen.getByRole("region", { name: "Unsaved rule changes" }).textContent).toContain("2 unsaved changes");
    expect(api.rules).toHaveBeenCalledTimes(1);
    expect(api.session).not.toHaveBeenCalled();
    expect(api.saveRules).not.toHaveBeenCalled();
  });

  it.each([aino, jonas])("clears the old screen before loading a successful session for $name", async (person) => {
    const nextRules = deferred<RulesResp>();
    const session = deferred<{ person: Person }>();
    mount();
    const oldInput = await draftRules();
    await openPicker();
    vi.mocked(api.rules).mockReturnValue(nextRules.promise);
    vi.mocked(api.session).mockReturnValue(session.promise);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(`${person.name} ${person.title}$`) }));

    // Merely starting a session request must not discard the current draft.
    expect(oldInput.isConnected).toBe(true);
    await act(async () => session.resolve({ person }));
    await screen.findByRole("button", { name: `Signed in as ${person.name}` });
    expect(oldInput.isConnected).toBe(false);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("region", { name: "Unsaved rule changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove 469363" })).toBeNull();
    expect(api.rules).toHaveBeenCalledTimes(2);

    await act(async () => nextRules.resolve(rules(person.role === "approver")));
    await screen.findByRole("spinbutton", { name: "Spend cap per order" });
    expect(spend().value).toBe("1950");
    expect(spend().disabled).toBe(person.role !== "approver");
    expect(screen.queryByRole("region", { name: "Unsaved rule changes" })).toBeNull();
    expect(api.saveRules).not.toHaveBeenCalled();
  });

  it("unmounts a retained draft on unauthorized access and never restores it on sign-in", async () => {
    const { container } = mount();
    const oldInput = await draftRules();
    await openPicker();
    act(() => authHooks.onUnauthorized());

    expect(oldInput.isConnected).toBe(false);
    expect(container.querySelector(".shell")).toBeNull();
    expect(screen.getByRole("heading", { name: "Who are you?" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Jonas F&B director$/ }));
    await screen.findByRole("spinbutton", { name: "Spend cap per order" });
    expect(spend().value).toBe("1950");
    expect(spend()).not.toBe(oldInput);
    expect(screen.queryByRole("region", { name: "Unsaved rule changes" })).toBeNull();
    expect(api.rules).toHaveBeenCalledTimes(2);
  });

  it("keeps the unauthenticated picker full screen with no mounted route or cancel action", async () => {
    vi.mocked(api.me).mockRejectedValue(new Error("Unauthorized"));
    const { container } = mount();
    await screen.findByRole("button", { name: /Jonas F&B director$/ });
    expect(container.querySelector(".shell")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(api.rules).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Jonas F&B director$/ }));
    await screen.findByRole("spinbutton", { name: "Spend cap per order" });
    expect(spend().value).toBe("1950");
  });

  it("clears identity-scoped shell warnings as soon as a session switches", async () => {
    vi.mocked(api.home).mockResolvedValue({ ...home, warnings: [warning] });
    mount();
    await screen.findByText(warning.text);
    await openPicker();
    const nextHome = deferred<HomeResp>();
    vi.mocked(api.home).mockReturnValue(nextHome.promise);
    await userEvent.click(screen.getByRole("button", { name: /Aino Chef$/ }));
    await screen.findByRole("button", { name: "Signed in as Aino" });
    expect(screen.queryByText(warning.text)).toBeNull();
    await act(async () => nextHome.resolve(home));
  });

  it("ignores a previous session's late warning response after unauthorized access and sign-in", async () => {
    const oldHome = deferred<HomeResp>();
    vi.mocked(api.home).mockReturnValueOnce(oldHome.promise);
    mount();
    await screen.findByRole("spinbutton", { name: "Spend cap per order" });
    act(() => authHooks.onUnauthorized());
    await userEvent.click(screen.getByRole("button", { name: /Aino Chef$/ }));
    await screen.findByRole("button", { name: "Signed in as Aino" });
    await act(async () => oldHome.resolve({ ...home, warnings: [warning] }));
    await waitFor(() => expect(api.home).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(warning.text)).toBeNull();
  });
});
