// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Question } from "@aimo/contracts";
import { AllergenDataMark } from "../src/ui/Status";
import { QuestionCard } from "../src/ui/QuestionCard";
import { api, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";

const chef: Person = { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", hotelScope: false, outlets: ["banquet"] };
const finance: Person = { ...chef, id: "p-sanna", name: "Sanna", role: "approver" };
const question: Question = {
  id: "potato-data", planId: "wedding-change", eventId: "evt-wedding", type: "missing_allergen_data", forRole: "chef", outletId: "banquet",
  quoteId: "quote", fingerprint: "terms", title: "Continue with allergen data not confirmed?",
  body: "Button potatoes 460541: allergen data not confirmed. 1 guest must avoid tree nuts. Continuing does not confirm safety.",
  facts: { kind: "change_allergens", productIds: ["460541"] }, ruleIds: ["ALG-03"],
  options: [{ id: "continue", label: "Continue with missing allergen data", primary: true }, { id: "others", label: "Pick another product", primary: false }],
  state: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: "2026-10-30T08:00:00Z", deadline: "2026-10-31T08:00:00Z",
};
const mount = (me = chef) => {
  const ctx: AppCtx = { me, people: [chef, finance], now: "2026-10-30T08:00:00Z", outlets: [], status: null, tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
  return render(<MemoryRouter><Ctx.Provider value={ctx}><QuestionCard q={question} /></Ctx.Provider></MemoryRouter>);
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("missing allergen data concern", () => {
  it("keeps the label on an older rule-only snapshot and after a chef acknowledgement", () => {
    const { rerender } = render(<AllergenDataMark line={{ rules: [{ ruleId: "ALG-03" }] }} />);
    expect(screen.getByText("Allergen data not confirmed")).toBeTruthy();
    rerender(<AllergenDataMark line={{ rules: [], allergenDataAcknowledgement: { by: "Aino" } }} />);
    expect(screen.getByText("Allergen data not confirmed")).toBeTruthy();
    rerender(<AllergenDataMark line={{ rules: [] }} />);
    expect(screen.queryByText("Allergen data not confirmed")).toBeNull();
  });
  it("lets the chef explicitly continue by keyboard with the product, allergen and affected count visible", async () => {
    const answer = vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: { ...question, state: "answered", answer: "continue", answeredBy: { personId: chef.id, name: chef.name } } });
    mount();
    expect(screen.getByText(/1 guest must avoid tree nuts/)).toBeTruthy();
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Continue with missing allergen data" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(answer).toHaveBeenCalledWith(question.id, "continue"));
    expect(screen.getByText(/Aino: Continue with missing allergen data/)).toBeTruthy();
    expect(screen.getByText(/Continuing does not confirm safety/)).toBeTruthy();
  });
  it("offers a keyboard-accessible alternative and keeps finance from answering the chef question", async () => {
    mount(finance);
    expect(screen.queryByRole("button", { name: "Continue with missing allergen data" })).toBeNull();
    cleanup();
    const answer = vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: { ...question, state: "answered", answer: "others", answeredBy: { personId: chef.id, name: chef.name } } });
    mount();
    const user = userEvent.setup();
    screen.getByRole("button", { name: "Pick another product" }).focus();
    await user.keyboard(" ");
    await waitFor(() => expect(answer).toHaveBeenCalledWith(question.id, "others"));
  });
});
