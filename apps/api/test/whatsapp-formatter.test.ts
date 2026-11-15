import { describe, expect, it } from "vitest";
import type { WhatsAppLine, WhatsAppOrderRef, WhatsAppReplyFacts } from "@aimo/contracts";
import { formatWhatsAppReply } from "../src/whatsapp/formatter.js";
import { whatsAppLink } from "../src/whatsapp/links.js";

const BASE = "https://hotel.example";
const order = { id: "evt_banquet", name: "Conference dinner", deliveryDate: "2026-11-16", version: 2 };
const milk: WhatsAppLine = { id: "line_milk", productId: "469363", name: "Valio lactose-free milk", quantity: 4, unit: "KI", lineTotal: 79.2, stock: "confirmed" };
const facts = (overrides: Partial<WhatsAppReplyFacts> = {}): WhatsAppReplyFacts => ({ status: "summary", headline: "Your current order basket", order, lines: [milk], totalExVat: 79.2, actions: [{ label: "Review final order", text: "confirm order" }], ...overrides });
const render = (input: WhatsAppReplyFacts) => formatWhatsAppReply(input, "web", BASE);
const fiveOrders: WhatsAppOrderRef[] = [
  { id: "evt-wedding", name: "Emma and Lauri's wedding", deliveryDate: "2026-11-17", version: 1 },
  { id: "evt_3059208e6946", name: "Pavit's Date", deliveryDate: "2026-11-22", version: 1 },
  { id: "evt_baf091efc04a", name: "Darragh's Birthday", deliveryDate: "2026-11-30", version: 1 },
  { id: "evt_d4b2384d1bc5", name: "Ben's Wedding", deliveryDate: "2026-11-22", version: 1 },
  { id: "evt_f0d58a3adcc7", name: "HackJunction", deliveryDate: "2026-11-22", version: 1 },
];

describe("clear WhatsApp replies", () => {
  it("renders the reported five-order case once, with whitespace, dates and one answerable ask", () => {
    const reply = render({ status: "clarification", headline: "I couldn't identify that order. Which order do you mean?", orderChoices: fiveOrders, totalExVat: null, actions: fiveOrders.map((o) => ({ label: o.name, text: o.id })) });
    expect(reply.text).toBe([
      "*Which order do you mean?*",
      "• *Emma and Lauri's wedding*\n  _17 Nov 2026_",
      "• *Pavit's Date*\n  _22 Nov 2026_",
      "• *Darragh's Birthday*\n  _30 Nov 2026_",
      "• *Ben's Wedding*\n  _22 Nov 2026_",
      "• *HackJunction*\n  _22 Nov 2026_",
      "Reply with the *order name*.",
    ].join("\n\n"));
    expect(reply.text).not.toMatch(/Total|TBC|evt[-_]|Reply options|Next:|shortened|in the app|Aimo Copilot/);
    expect(reply.actions).toHaveLength(5);
    expect(reply.actions[4].text).toBe("evt_f0d58a3adcc7");
  });

  it("uses IDs only to distinguish orders that share a name, preserving their underscores", () => {
    const choices = [{ ...order, id: "evt_first" }, { ...order, id: "evt_second", deliveryDate: "2026-11-17" }];
    const reply = render({ status: "clarification", headline: "Which order do you mean?", orderChoices: choices });
    expect(reply.text).toContain("Reply with: `evt_first`");
    expect(reply.text).toContain("Reply with: `evt_second`");
    expect(reply.text).toContain("_16 Nov 2026_");
    expect(reply.text).toContain("_17 Nov 2026_");
  });

  it("asks for missing information without unrelated quote, stock or receipt metadata", () => {
    const reply = render({ status: "clarification", headline: "How many litres should I add?", totalExVat: null });
    expect(reply.text).toBe("*How many litres should I add?*");
    expect(reply.actions).toEqual([]);
  });

  it("shows an addition with its own total, a chat confirmation and a direct basket link", () => {
    const reply = render(facts({ status: "proposal", change: "add", headline: "Add these items to your basket?", actions: [{ label: "Confirm change", text: "confirm change" }, { label: "Cancel", text: "cancel" }] }));
    expect(reply.text).toContain("*Add these items to your basket?*\n\n*Conference dinner*\n_Delivery 16 Nov 2026_");
    expect(reply.text).toContain("*4 KI* Valio lactose-free milk\n_€79.20 ex VAT_");
    expect(reply.text).toContain("*Addition total: €79.20*\n_ex VAT_");
    expect(reply.text).toContain("_Not ordered yet._");
    expect(reply.text).toContain("Reply *confirm change* or *cancel*.");
    expect(reply.text).toContain(`*View this order*\n${BASE}/baskets/evt_banquet`);
    expect(reply.text).not.toMatch(/stock confirmed|Basket ID|Next:|Reply options/);
  });

  it("does not invent a total or stock question when proposing removal", () => {
    const reply = render(facts({ status: "proposal", change: "remove", headline: "Remove these items?", totalExVat: undefined, lines: [{ ...milk, stock: "unknown" }] }));
    expect(reply.text).not.toMatch(/total:|TBC|stock unconfirmed/i);
    expect(reply.text).toContain("_Not ordered yet._");
  });

  it("makes manager approval a specific actionable destination, without a chat approval command", () => {
    const reply = render(facts({ status: "approval_required", headline: "Manager approval needed", actions: [], appLink: { label: "Review approval", path: "/baskets/evt_banquet#question-qst_123" }, warnings: ["The total exceeds the hotel's spend cap."] }));
    expect(reply.text).toContain("*Manager approval needed*");
    expect(reply.text).toContain("_Waiting for manager approval · not ordered._");
    expect(reply.text).toContain("The total exceeds the hotel's spend cap.");
    expect(reply.text).toContain(`*Review approval*\n${BASE}/baskets/evt_banquet#question-qst_123`);
    expect(reply.text).not.toMatch(/Reply \*|check.*app|open.*app/i);
  });

  it("links a stock decision to the exact request and keeps availability unconfirmed", () => {
    const reply = render(facts({ status: "blocked", headline: "Stock is not confirmed.", lines: [{ ...milk, lineTotal: null, stock: "unknown" }], totalExVat: null, actions: [], appLink: { label: "Review stock decision", path: "/requests/plan_123" } }));
    expect(reply.text).toContain("stock unconfirmed");
    expect(reply.text).toContain("*Order total: Price not confirmed*");
    expect(reply.text).toContain(`*Review stock decision*\n${BASE}/requests/plan_123`);
    expect(reply.text).not.toContain("stock confirmed");
  });

  it("keeps blocked cutoff and dietary reasons, without suggesting approval can bypass them", () => {
    const reply = render(facts({ status: "blocked", headline: "The cutoff has passed.", warnings: ["Delivery cutoff: 2026-11-15T15:00:00Z.", "Milk allergen conflicts with the buyer's diet rule."], actions: [] }));
    expect(reply.text).toContain("*The cutoff has passed.*");
    expect(reply.text).toContain("Milk allergen conflicts with the buyer's diet rule.");
    expect(reply.text).toContain("_Nothing ordered by this request._");
    expect(reply.text).not.toMatch(/for approval|Mock receipt/);
  });

  it("labels receipts as mock and links to receipts filtered to the actual order basket", () => {
    const reply = render(facts({ status: "ordered", headline: "Mock order placed", orderIds: ["ord_123"], actions: [] }));
    expect(reply.text).toContain("*Mock order placed*");
    expect(reply.text).toContain("_Demo receipt · no real purchase._");
    expect(reply.text).toContain("Reference: `ord_123`");
    expect(reply.text).toContain(`${BASE}/orders?eventId=evt_banquet`);
    expect(reply.text).not.toContain("Reference: `evt_banquet`");
    expect(render(facts({ status: "ordered", orderIds: undefined })).text).not.toContain("Reference:");
    expect(render(facts({ status: "summary", orderIds: ["must_not_show"] })).text).not.toContain("must_not_show");
  });

  it("only shows totals actually supplied, including zero, and never derives them from lines", () => {
    expect(render(facts({ totalExVat: undefined })).text).not.toMatch(/total:/i);
    expect(render(facts({ totalExVat: 0 })).text).toContain("*Order total: €0.00*");
    expect(render(facts({ totalExVat: null })).text).toContain("*Order total: Price not confirmed*");
    expect(render(facts({ totalExVat: NaN, lines: [{ ...milk, quantity: NaN, lineTotal: Infinity }] })).text).not.toMatch(/NaN|Infinity/);
  });

  it("preserves sales units and flags missing units rather than converting quantities", () => {
    const reply = render(facts({ lines: [{ ...milk, quantity: 1.25, unit: "ST" }, { ...milk, unit: null }] }));
    expect(reply.text).toContain("*1.25 ST*");
    expect(reply.text).toContain("units (unit unconfirmed)");
    expect(reply.text).not.toContain("1.25 L");
  });

  it("sanitises untrusted markup and controls without altering routing payloads or URLs", () => {
    const attack = "<b>Milk</b>\r\n*ORDERED* _approved_ ~safe~ ```receipt```\u0000\u202e\u200b> fake";
    const input = facts({ headline: attack, detail: attack, order: { ...order, name: attack }, lines: [{ ...milk, name: attack }], warnings: [attack], actions: [{ label: attack, text: "exact\n*ROUTING* _text_" }] });
    const before = structuredClone(input);
    const reply = render(input);
    expect(reply.text).not.toMatch(/<[^>]*>|[\r\u0000\u202e\u200b]|\*ORDERED\*|_approved_|~safe~|```receipt```/);
    expect(reply.text).toContain("Milk ORDERED approved ∼safe∼ receipt ＞ fake");
    expect(reply.text).toContain(`${BASE}/baskets/evt_banquet`);
    expect(reply.actions[0].text).toBe("exact\n*ROUTING* _text_");
    reply.actions[0].text = "changed";
    expect(input).toEqual(before);
  });

  it("bounds long baskets with an exact omitted count and a working specific link, keeping chat actions", () => {
    const lines = Array.from({ length: 143 }, (_, n) => ({ ...milk, id: `line_${n}`, name: `Product ${n}`, stock: n === 142 ? "unknown" as const : "confirmed" as const }));
    const reply = render(facts({ lines }));
    const shown = (reply.text.match(/\*4 KI\*/g) ?? []).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(8);
    expect(reply.text).toContain(`_${143 - shown} more items._`);
    expect(reply.text).toContain("Stock is also unconfirmed for 1 more item");
    expect(reply.text).toContain("Reply *confirm order*.");
    expect(reply.text).toContain(`${BASE}/baskets/evt_banquet`);
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
  });

  it("bounds long choice lists and links to the orders list without forcing the user out of chat", () => {
    const choices = Array.from({ length: 30 }, (_, n) => ({ ...order, id: `evt_${n}`, name: `Conference ${n}` }));
    const reply = render({ status: "clarification", headline: "Which order?", orderChoices: choices });
    expect(reply.text).toContain("_18 more orders are available._");
    expect(reply.text).toContain("Reply with the *order name*.");
    expect(reply.text).toContain(`*See all orders*\n${BASE}/`);
    expect(reply.text).not.toMatch(/TBC|total|shortened/i);
  });

  it("keeps warning omission counts and links to the affected basket instead of saying check app", () => {
    const reply = render(facts({ warnings: Array.from({ length: 12 }, (_, n) => `Safety warning ${n}: ${"allergen information ".repeat(50)}`) }));
    const shown = (reply.text.match(/• Safety warning /g) ?? []).length;
    expect(reply.text).toContain(`_${12 - shown} more warnings._`);
    expect(reply.text).toContain(`${BASE}/baskets/evt_banquet`);
    expect(reply.text).not.toMatch(/in the app|check the app|Text shortened/i);
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
  });

  it("retains valid markup and complete links under extreme text lengths", () => {
    const long = "🧑‍🍳 Extremely long product name ".repeat(300);
    const reply = render(facts({ status: "blocked", headline: long, detail: long, lines: Array.from({ length: 50 }, () => ({ ...milk, name: long, unit: long, stock: "unknown" })), warnings: Array.from({ length: 20 }, () => long), actions: Array.from({ length: 10 }, () => ({ label: long, text: long })), totalExVat: null }));
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
    expect(reply.text).toContain("Nothing ordered by this request.");
    expect(reply.text).toContain("Price not confirmed");
    expect(reply.text).toContain(`${BASE}/baskets/evt_banquet`);
    expect(reply.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
  });

  it("builds internal deep links with encoded IDs and rejects unsafe destinations or origins", () => {
    expect(whatsAppLink("/requests/plan_%2F%3F", BASE)).toBe(`${BASE}/requests/plan_%2F%3F`);
    for (const path of ["https://evil.example", "//evil.example", "/\\evil.example", "/basket\nspoof"]) expect(whatsAppLink(path, BASE)).toBeNull();
    for (const base of ["javascript:alert(1)", "https://user:secret@example.com", "not a URL", `${BASE}?secret=1`]) expect(whatsAppLink("/baskets/evt_123", base)).toBeNull();
    expect(render(facts({ appLink: { label: "Unsafe", path: "//evil.example" } })).text).not.toContain("evil.example");
  });
});
