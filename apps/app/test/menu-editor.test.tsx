// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { api, ApiError, type MenuBody, type MenuScale, type PlanResp, type StoredEvent } from "../src/api";
import { MenuEditor } from "../src/ui/MenuEditor";

// Exercise the editor/review boundary; the full review has its own component tests.
vi.mock("../src/ui/RequestReviewDialog", () => ({
  RequestReviewDialog: ({ initialReview, onAdded }: { initialReview: PlanResp; onAdded: () => void }) => (
    <div role="dialog" aria-label={`Review ${initialReview.plan.eventId}`}>
      <button onClick={onAdded}>Add reviewed menu</button>
    </div>
  ),
}));

const wedding: StoredEvent = {
  id: "wedding", name: "Wedding", siteId: "hotel", serviceDate: "2026-11-20",
  guests: 180, dietsConfirmed: true,
  dietGroups: [{ id: "lf", label: "Lactose-free", count: 10, standing: false, constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] } }],
  dishes: Array.from({ length: 4 }, (_, i) => ({
    id: `wedding-dish-${i}`, name: `Wedding dish ${i + 1}`, outletId: "banquet", excludesGroups: [],
    ingredients: [{ id: `wedding-ingredient-${i}`, text: `Wedding ingredient ${i + 1}`, perPortion: { amount: 100, unit: "g" } }],
  })),
  version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null,
  lastDiff: null, finalCheck: null, changes: [],
};
const empty: StoredEvent = { ...wedding, id: "order-b", name: "Order B", guests: 0, dietsConfirmed: false, dietGroups: [], dishes: [] };
const onSaved = vi.fn();
const onAdded = vi.fn();
const editor = (event: StoredEvent) => <MenuEditor event={event} menuInOrder={false} onSaved={onSaved} onAdded={onAdded} />;
const guests = () => screen.getByRole("spinbutton", { name: "Guests" }) as HTMLInputElement;
const setGuests = (value: number) => fireEvent.change(guests(), { target: { value: String(value) } });
const saveButton = () => screen.getByRole("button", { name: "Save menu" });
const generateButton = () => screen.getByRole("button", { name: /^Generate order/ });

function scale(event: StoredEvent): MenuScale {
  return { guests: event.guests, regularGuests: event.guests, lines: [{
    lineId: event.id, text: `${event.name} scaled ingredient`, productId: null, total: { amount: 1, unit: "kg" },
    constraints: { claims: [], avoidAllergens: [], labels: [] }, shares: [],
  }], problems: [], warnings: [] };
}
const menu = (event: StoredEvent) => ({ event, scale: scale(event) });
// Only event identity crosses the mocked review boundary.
const review = (event: StoredEvent) => ({ plan: { id: `review-${event.id}`, eventId: event.id } as PlanResp["plan"], questions: [], scale: scale(event) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush(fn: () => void = () => {}) { await act(async () => { fn(); }); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(api, "menu").mockImplementation(async (id) => menu(id === wedding.id ? wedding : empty));
  vi.spyOn(api, "saveMenu").mockImplementation(async (id, body: MenuBody) => menu({ ...(id === wedding.id ? wedding : empty), ...body, version: body.version + 1 }));
  vi.spyOn(api, "menuOrder").mockImplementation(async (id) => review(id === wedding.id ? wedding : empty));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("menu event identity", () => {
  it("resets a dirty four-dish wedding when switching to an empty order at the same version, then saves only B's draft to B", async () => {
    const view = render(editor(wedding));
    setGuests(194);
    expect(screen.getAllByRole("textbox", { name: "Dish name" })).toHaveLength(4);

    view.rerender(editor(empty));
    expect(guests().value).toBe("");
    expect(screen.getAllByRole("textbox", { name: "Dish name" })).toHaveLength(1);
    expect((screen.getByRole("textbox", { name: "Ingredient" }) as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("spinbutton", { name: "Lactose-free guests" })).toBeNull();
    expect((screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement).disabled).toBe(true);

    setGuests(24);
    fireEvent.change(screen.getByRole("textbox", { name: "Dish name" }), { target: { value: "B soup" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Ingredient" }), { target: { value: "B potatoes" } });
    fireEvent.click(saveButton());
    await flush();
    expect(api.saveMenu).toHaveBeenCalledExactlyOnceWith(empty.id, {
      version: 1, guests: 24, dietsConfirmed: false, dietGroups: [], dishes: [{
        id: expect.any(String), name: "B soup", outletId: "banquet", excludesGroups: [],
        ingredients: [{ id: expect.any(String), text: "B potatoes", perPortion: { amount: 0, unit: "g" } }],
      }],
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("ignores A's late initial load after B has loaded its scale", async () => {
    const oldLoad = deferred<ReturnType<typeof menu>>();
    vi.mocked(api.menu).mockImplementation((id) => id === wedding.id ? oldLoad.promise : Promise.resolve(menu(empty)));
    const view = render(editor(wedding));
    view.rerender(editor(empty));
    await flush();
    expect(screen.getByText("Order B scaled ingredient")).toBeTruthy();
    await flush(() => oldLoad.resolve(menu(wedding)));
    expect(screen.queryByText("Wedding scaled ingredient")).toBeNull();
    expect(screen.getByText("Order B scaled ingredient")).toBeTruthy();
  });

  it.each(["save", "generate"] as const)("ignores A's late %s save response and does not continue generation or refresh B", async (action) => {
    const oldSave = deferred<ReturnType<typeof menu>>();
    const currentSave = deferred<ReturnType<typeof menu>>();
    vi.mocked(api.saveMenu).mockImplementation((id) => id === wedding.id ? oldSave.promise : currentSave.promise);
    const view = render(editor(wedding));
    setGuests(194);
    fireEvent.click(action === "save" ? saveButton() : generateButton());
    view.rerender(editor(empty));
    setGuests(24);
    fireEvent.click(saveButton());
    await flush(() => oldSave.resolve(menu({ ...wedding, guests: 194, version: 2 })));
    expect(guests().value).toBe("24");
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(api.menuOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    await flush(() => currentSave.resolve(menu({ ...empty, guests: 24, version: 2 })));
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("ignores an old save conflict without changing B's version or messages", async () => {
    const oldSave = deferred<ReturnType<typeof menu>>();
    vi.mocked(api.saveMenu).mockImplementationOnce(() => oldSave.promise);
    const view = render(editor(wedding));
    setGuests(194);
    fireEvent.click(saveButton());
    view.rerender(editor(empty));
    await flush(() => oldSave.reject(new ApiError(409, { error: "edit_conflict", current: { ...wedding, version: 8 } })));
    expect(screen.queryByRole("status")).toBeNull();
    setGuests(24);
    fireEvent.click(saveButton());
    await flush();
    expect(api.saveMenu).toHaveBeenLastCalledWith(empty.id, expect.objectContaining({ guests: 24, version: 1 }));
  });

  it.each(["success", "failure"] as const)("ignores an old generation %s after B has its own review and scale", async (outcome) => {
    const oldGeneration = deferred<ReturnType<typeof review>>();
    vi.mocked(api.menuOrder).mockImplementationOnce(() => oldGeneration.promise);
    const orderB = { ...wedding, id: empty.id, name: empty.name, guests: 24 };
    const view = render(editor(wedding));
    fireEvent.click(generateButton());
    view.rerender(editor(orderB));
    fireEvent.click(generateButton());
    await flush();
    expect(screen.getByRole("dialog", { name: "Review order-b" })).toBeTruthy();
    await flush(() => outcome === "success"
      ? oldGeneration.resolve(review(wedding))
      : oldGeneration.reject(new ApiError(400, { message: "Old wedding error", scale: scale(wedding) })));
    expect(screen.queryByRole("dialog", { name: "Review wedding" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Review order-b" })).toBeTruthy();
    expect(screen.getByText("Order B scaled ingredient")).toBeTruthy();
    expect(screen.queryByText("Wedding scaled ingredient")).toBeNull();
    expect(screen.queryByText("Old wedding error")).toBeNull();
  });

  it("clears a completed review and its success message on event switches", async () => {
    const view = render(editor(wedding));
    fireEvent.click(generateButton());
    await flush();
    expect(screen.getByRole("dialog", { name: "Review wedding" })).toBeTruthy();
    view.rerender(editor(empty));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(editor(wedding));
    fireEvent.click(generateButton());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Add reviewed menu" }));
    expect(screen.getByRole("status").textContent).toContain("Submit the final order for finance review");
    view.rerender(editor(empty));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("same-event refresh and concurrency", () => {
  it("retains dirty edits and the original version on refresh, then keeps them through a conflict and explicit retry", async () => {
    const otherEdit = { ...wedding, guests: 181, version: 2, changes: [{ at: "2026-11-15T10:00:00Z", by: "Other chef", what: "Changed guests" }] };
    vi.mocked(api.saveMenu).mockRejectedValueOnce(new ApiError(409, { error: "edit_conflict", current: otherEdit }));
    const view = render(editor(wedding));
    setGuests(194);
    view.rerender(editor(otherEdit));
    expect(guests().value).toBe("194");
    fireEvent.click(saveButton());
    await flush();
    expect(api.saveMenu).toHaveBeenLastCalledWith(wedding.id, expect.objectContaining({ guests: 194, version: 1 }));
    expect(screen.getByRole("status").textContent).toContain("Other chef changed the menu");
    expect(guests().value).toBe("194");
    expect(onSaved).not.toHaveBeenCalled();
    fireEvent.click(saveButton());
    await flush();
    expect(api.saveMenu).toHaveBeenLastCalledWith(wedding.id, expect.objectContaining({ guests: 194, version: 2 }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(onSaved).toHaveBeenCalledOnce();
  });

  it("accepts a same-event version refresh when there are no local edits", async () => {
    const view = render(editor(wedding));
    view.rerender(editor({ ...wedding, guests: 181, version: 2 }));
    expect(guests().value).toBe("181");
    setGuests(194);
    fireEvent.click(saveButton());
    await flush();
    expect(api.saveMenu).toHaveBeenLastCalledWith(wedding.id, expect.objectContaining({ guests: 194, version: 2 }));
  });

  it("does not let a late initial scale replace a successful save for the same event", async () => {
    const oldLoad = deferred<ReturnType<typeof menu>>();
    vi.mocked(api.menu).mockReturnValueOnce(oldLoad.promise);
    render(editor(wedding));
    setGuests(194);
    fireEvent.click(saveButton());
    await flush();
    expect(screen.getByText("Scaled for 194 guests · 1 order line")).toBeTruthy();
    await flush(() => oldLoad.resolve(menu(wedding)));
    expect(screen.queryByText("Scaled for 180 guests · 1 order line")).toBeNull();
    expect(screen.getByText("Scaled for 194 guests · 1 order line")).toBeTruthy();
  });
});
