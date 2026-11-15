// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import type { Question } from "@aimo/contracts";
import { api, ApiError, type AnswerResp, type BasketResp, type Person } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { QuestionCard } from "../src/ui/QuestionCard";
import { OrderReviewHistory } from "../src/ui/OrderReviewHistory";
import { BasketPage } from "../src/screens/Baskets";

const manager: Person = { id: "sanna", name: "Sanna", title: "Finance manager", role: "approver", hotelScope: true, outlets: ["banquet"] };
const chef: Person = { ...manager, id: "aino", name: "Aino", role: "chef", hotelScope: false };
const question: Question = {
  id: "review-1", planId: "basket:conference", eventId: "conference", type: "order_review", forRole: "approver", outletId: null,
  quoteId: "quote-1", fingerprint: "submitted-terms", title: "Review order: HackJunction",
  body: "Aino submitted this order to finance for approval · €1,419.84 ex VAT · 3 items",
  facts: { kind: "approval", total: 1419.84, items: [{ text: "Over the hotel spend cap" }], lines: [{ lineId: "milk", productId: "464306", product: "Lactose-free milk", quantity: 5, unit: "L", lineTotal: 10 }] },
  ruleIds: ["MAN-01"], options: [{ id: "approve", label: "Approve order", primary: true }, { id: "reject", label: "Return to order builder", primary: false }],
  deadline: "2026-11-15T10:00:00Z", state: "open", answer: null, answeredBy: null, answeredAt: null, createdAt: "2026-11-14T10:00:00Z",
};
const refresh = vi.fn();
const onAnswered = vi.fn();
const context = (me = manager): AppCtx => ({ me, people: [manager, chef, { ...manager, id: "jonas", name: "Jonas" }], now: "2026-11-14T10:00:00Z", outlets: [], status: null, tick: 0, refresh, switchPerson: vi.fn() });
const mount = (q: Question = question, me = manager, orderContext = true) => render(<MemoryRouter><Ctx.Provider value={context(me)}><QuestionCard q={q} compact orderContext={orderContext} onAnswered={onAnswered} /></Ctx.Provider></MemoryRouter>);
const answered = (answer = "reject"): Question => ({ ...question, state: "answered", answer, answeredBy: { personId: manager.id, name: manager.name }, answeredAt: "2026-11-14T10:01:00Z", ...(answer === "reject" ? { answerNote: "Reduce the quantity." } : {}) });

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("manager order review", () => {
  it("shows one concise accent panel with a truthfully labelled review countdown", () => {
    const { container } = mount();
    expect(screen.getByRole("heading", { name: "Waiting for approval" })).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Approve order", "Refuse order"]);
    expect(screen.getByText("Review expires in 24 h 0 min")).toBeTruthy();
    expect(screen.getByText(/Review valid until/)).toBeTruthy();
    for (const repeated of ["Details", "Jonas", "Aino submitted", "Review order:", "1,419.84", "Lactose-free milk", "Return to order builder", "Order by"]) expect(container.textContent).not.toContain(repeated);
    expect(container.querySelector(".manager-approval")).toBeTruthy();
  });

  it("retains order navigation where the card appears outside the order context", () => {
    mount(question, manager, false);
    expect(screen.getByRole("link", { name: "HackJunction" }).getAttribute("href")).toBe("/baskets/conference");
  });

  it("does not invent a review deadline when none was saved", () => {
    const { container } = mount({ ...question, deadline: null });
    expect(container.textContent).not.toContain("Review expires");
    expect(container.querySelector("time")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve order" })).toBeTruthy();
  });

  it("keeps older return decisions without claiming they sent a note", () => {
    mount({ ...answered(), answerNote: undefined });
    expect(screen.getByRole("status").textContent).toBe("Returned to the order builder.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("requires a trimmed note and allows cancelling without sending an answer", async () => {
    const answer = vi.spyOn(api, "answer");
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Refuse order" }));
    const field = screen.getByRole("textbox", { name: "Note to order builder (required)" });
    expect(document.activeElement).toBe(field);
    await user.type(field, "  \t ");
    expect((screen.getByRole("button", { name: "Send refusal" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(field.closest("form")!);
    expect(screen.getByRole("alert").textContent).toContain("Add a refusal note");
    expect(answer).not.toHaveBeenCalled();
    await user.clear(field);
    await user.type(field, "Draft note");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Refuse order" }));
    await user.click(screen.getByRole("button", { name: "Refuse order" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(answer).not.toHaveBeenCalled();
  });

  it("sends the refusal through the answer API once, disables duplicate clicks, and refreshes on success", async () => {
    let resolve!: (result: AnswerResp) => void;
    const answer = vi.spyOn(api, "answer").mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Refuse order" }));
    await user.type(screen.getByRole("textbox"), "  Reduce the quantity.  ");
    const form = screen.getByRole("textbox").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(question.id, "reject", "Reduce the quantity.");
    expect((screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("  Reduce the quantity.  ");
    resolve({ ok: true, question: answered() });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Returned for changes" })).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("Refusal note sent to the order builder.");
    expect(onAnswered).toHaveBeenCalledWith(answered(), undefined);
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("approves through the same API without requiring a refusal note", async () => {
    const answer = vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: answered("approve") });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Approve order" }));
    expect(answer).toHaveBeenCalledWith(question.id, "approve", undefined);
    expect(onAnswered).toHaveBeenCalledWith(answered("approve"), undefined);
    expect(refresh).toHaveBeenCalled();
  });

  it("saves once when Return is pressed on the focused approval panel", async () => {
    let resolve!: (result: AnswerResp) => void;
    const answer = vi.spyOn(api, "answer").mockReturnValue(new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    mount();
    const panel = screen.getByRole("article", { name: "Waiting for approval" });
    panel.focus();
    await user.keyboard("{Enter}{Enter}");
    expect(answer).toHaveBeenCalledExactlyOnceWith(question.id, "approve", undefined);
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    resolve({ ok: true, question: answered("approve") });
    await screen.findByRole("heading", { name: "Approval recorded" });
    expect(onAnswered).toHaveBeenCalledWith(answered("approve"), undefined);
    expect(refresh).toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(answer).toHaveBeenCalledOnce();
  });

  it("keeps Return scoped to the focused control during refusal", async () => {
    const answer = vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: answered() });
    const user = userEvent.setup();
    mount();
    screen.getByRole("button", { name: "Refuse order" }).focus();
    await user.keyboard("{Enter}");
    await user.type(screen.getByRole("textbox"), "Reduce the quantity.{Enter}Keep the milk.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Reduce the quantity.\nKeep the milk.");
    screen.getByRole("article", { name: "Waiting for approval" }).focus();
    await user.keyboard("{Enter}");
    expect(answer).not.toHaveBeenCalled();
  });

  it("does not approve on modified, repeating or composing Return keys", () => {
    const answer = vi.spyOn(api, "answer");
    mount();
    const panel = screen.getByRole("article", { name: "Waiting for approval" });
    for (const key of ["altKey", "ctrlKey", "metaKey", "shiftKey", "repeat", "isComposing"]) {
      fireEvent.keyDown(panel, { key: "Enter", [key]: true });
    }
    expect(answer).not.toHaveBeenCalled();
  });

  it("keeps the note after failure and permits a retry", async () => {
    const answer = vi.spyOn(api, "answer").mockRejectedValueOnce(new ApiError(500, { message: "Could not save the note" })).mockResolvedValueOnce({ ok: true, question: answered() });
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Refuse order" }));
    await user.type(screen.getByRole("textbox"), "Reduce the quantity.");
    await user.click(screen.getByRole("button", { name: "Send refusal" }));
    expect(screen.getByRole("alert").textContent).toBe("Could not save the note");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Reduce the quantity.");
    expect(onAnswered).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Send refusal" }));
    expect(answer).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a recorded approval whose processing failed", async () => {
    const error = "Terms changed. Submit the order for a fresh finance review.";
    vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: answered("approve"), error });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Approve order" }));
    expect(screen.getByRole("alert").textContent).toBe(error);
    expect(onAnswered).toHaveBeenCalledWith(answered("approve"), error);
    expect(refresh).toHaveBeenCalled();
  });

  it("refreshes and closes actions when another manager has already answered", async () => {
    vi.spyOn(api, "answer").mockRejectedValue(new ApiError(409, { question: answered(), reason: "Answered by Jonas" }));
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Approve order" }));
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Answered by Jonas");
    expect(onAnswered).toHaveBeenCalledWith(answered(), "Answered by Jonas");
    expect(refresh).toHaveBeenCalled();
  });

  it.each([
    { q: question, me: chef },
    { q: question, me: { ...manager, hotelScope: false } },
    { q: { ...question, state: "waiting" as const }, me: manager },
    { q: { ...question, state: "replaced" as const }, me: manager },
    { q: { ...question, state: "expired" as const }, me: manager },
    { q: { ...question, deadline: "2026-11-14T09:00:00Z" }, me: manager },
  ])("offers no actions without permission or an open, unexpired review: %j", ({ q, me }) => {
    const answer = vi.spyOn(api, "answer");
    mount(q, me);
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(screen.getByRole("article"), { key: "Enter" });
    expect(answer).not.toHaveBeenCalled();
  });

  it("preserves distinct request and chef decision cards", () => {
    mount({ ...question, type: "unknown_stock", forRole: "chef", title: "Continue with milk?", body: "Stock not confirmed", facts: { kind: "stock", items: [{ ruleId: "STK-01", text: "Stock unknown" }] }, options: [{ id: "continue", label: "Continue", primary: true }] }, chef);
    expect(screen.getByRole("heading", { name: "Continue with milk?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refuse order" })).toBeNull();
  });

  it("preserves submitted context, terms and refusal notes in review history", () => {
    const decision = { ...answered(), answerNote: "Keep <milk> & reduce quantity.\nPlease revise." };
    const { container } = render(<OrderReviewHistory questions={[decision]} />);
    expect(screen.getByText("Order review history")).toBeTruthy();
    expect(container.textContent).toContain(decision.body);
    expect(container.textContent).toContain(decision.answerNote);
    expect(container.textContent).toContain("Over the hotel spend cap");
    expect(container.textContent).toContain("Lactose-free milk");
    expect(container.querySelector("milk")).toBeNull();
  });

  it("removes the section count and keeps processing errors visible after the panel refreshes away", async () => {
    const basket = {
      event: { id: "conference", name: "HackJunction", serviceDate: "2026-11-16" }, questions: [question], requests: [], orders: [], review: question,
      orderBy: { state: "known", at: "2026-11-15T15:00:00Z", reason: null, usesFixtures: true, excludedItems: 0, unconfirmedStockItems: 0 }, confirmed: false,
    } as unknown as BasketResp;
    const load = vi.spyOn(api, "basket").mockResolvedValueOnce(basket).mockResolvedValue({ ...basket, questions: [answered("approve")], review: null });
    const error = "Supplier terms changed. Submit the order for a fresh finance review.";
    vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: answered("approve"), error });
    render(<MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={context()}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    const heading = await screen.findByRole("heading", { name: "Decisions before processing" });
    expect(heading.parentElement?.querySelector(".countb")).toBeNull();
    expect(screen.getByText(/Supplier ordering cutoff;/)).toBeTruthy();
    expect(screen.queryByText("Submitted to finance. This order is ready for approval.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Approve order" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert").textContent).toBe(error);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Decisions before processing" })).toBeNull());
    expect(screen.getByRole("alert").textContent).toBe(error);
  });

  it("shows the saved refusal to the builder after reloading the order", async () => {
    const basket = {
      event: { id: "conference", name: "HackJunction", serviceDate: "2026-11-16" }, questions: [answered()], requests: [], orders: [], review: null,
      orderBy: { state: "unknown", at: null, reason: "Supplier terms unknown", usesFixtures: false, excludedItems: 1, unconfirmedStockItems: 0 }, confirmed: false,
    } as unknown as BasketResp;
    vi.spyOn(api, "basket").mockResolvedValue(basket);
    render(<MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={context(chef)}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Changes requested");
    expect(status.textContent).toContain("Reduce the quantity.");
    expect(status.textContent).toContain("Sanna");
    expect(screen.queryByRole("button", { name: "Refuse order" })).toBeNull();
    expect(screen.getByText("Order review history")).toBeTruthy();
    expect(screen.queryByText("Review expires")).toBeNull();
  });

  it("hides the decisions section when only other people need to decide", async () => {
    const basket = {
      event: { id: "conference", name: "HackJunction", serviceDate: "2026-11-16" }, questions: [question], requests: [], orders: [], review: question,
      orderBy: { state: "unknown", at: null, reason: null, usesFixtures: false, excludedItems: 0, unconfirmedStockItems: 0 }, confirmed: false,
    } as unknown as BasketResp;
    vi.spyOn(api, "basket").mockResolvedValue(basket);
    render(<MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={context(chef)}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    await screen.findByRole("heading", { name: "In the order" });
    expect(screen.queryByRole("heading", { name: "Decisions before processing" })).toBeNull();
  });

  it("does not claim a refusal note for the distinct request-rejection workflow", async () => {
    const requestQuestion: Question = { ...question, type: "spend_cap", planId: "request", options: [{ id: "reject", label: "Reject request", primary: false }] };
    const decision: Question = { ...requestQuestion, state: "answered", answer: "reject", answeredBy: { personId: manager.id, name: manager.name } };
    const basket = {
      event: { id: "conference", name: "HackJunction", serviceDate: "2026-11-16" }, questions: [requestQuestion], requests: [], orders: [], review: null,
      orderBy: { state: "unknown", at: null, reason: null, usesFixtures: false, excludedItems: 0, unconfirmedStockItems: 0 }, confirmed: false,
    } as unknown as BasketResp;
    vi.spyOn(api, "basket").mockResolvedValueOnce(basket).mockResolvedValue({ ...basket, questions: [decision] });
    vi.spyOn(api, "answer").mockResolvedValue({ ok: true, question: decision });
    render(<MemoryRouter initialEntries={["/baskets/conference"]}><Ctx.Provider value={context()}><Routes><Route path="/baskets/:id" element={<BasketPage />} /></Routes></Ctx.Provider></MemoryRouter>);
    await userEvent.click(await screen.findByRole("button", { name: "Reject request" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Decisions before processing" })).toBeNull());
    expect(screen.queryByText("Refusal note sent to the order builder.")).toBeNull();
    expect(api.answer).toHaveBeenCalledWith(requestQuestion.id, "reject");
  });
});
