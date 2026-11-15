import { describe, expect, it } from "vitest";
import type { WhatsAppLine, WhatsAppReplyFacts } from "@aimo/contracts";
import { formatWhatsAppReply } from "../src/whatsapp/formatter.js";

const order = { id: "evt_banquet", name: "Conference dinner", deliveryDate: "2026-11-16", version: 2 };
const milk: WhatsAppLine = {
  id: "line_milk", productId: "469363", name: "Valio lactose-free milk 1 L",
  quantity: 4, unit: "KI", lineTotal: 79.2, stock: "confirmed",
};
const facts = (overrides: Partial<WhatsAppReplyFacts> = {}): WhatsAppReplyFacts => ({
  status: "summary", headline: "Your conference basket", order, lines: [milk], totalExVat: 79.2,
  actions: [{ label: "Review basket", text: "show my basket" }], ...overrides,
});

describe("WhatsApp reply formatter", () => {
  it("gives text reply commands for a real WhatsApp group while retaining demo order labels", () => {
    const reply = formatWhatsAppReply(facts({ status: "proposal", actions: [{ label: "Confirm change", text: "confirm change" }, { label: "Cancel", text: "cancel" }] }), "web");
    expect(reply.text).toContain("Aimo Copilot · demo orders");
    expect(reply.text).not.toContain("FAKE WhatsApp");
    expect(reply.text).toContain("Confirm change: ```confirm change```");
    expect(reply.text).toContain("Next: reply ```confirm change```.");
    expect(reply.text).toContain("Proposal only · not ordered.");
  });
  it("shows a concise labelled basket with sales units, date and ex-VAT totals", () => {
    const reply = formatWhatsAppReply(facts());
    expect(reply).toEqual({
      status: "summary",
      actions: [{ label: "Review basket", text: "show my basket" }],
      text: [
        "FAKE WhatsApp · demo\n*Basket summary*\nYour conference basket",
        "*Conference dinner*\nBasket ID: ```evt_banquet```\nDelivery date: 2026-11-16",
        "*Items · line totals ex VAT*\n• 4 × KI — Valio lactose-free milk 1 L\n  EUR 79.20 · stock confirmed",
        "*Total (ex VAT): EUR 79.20*",
        "Next: choose “Review basket”.",
      ].join("\n\n"),
    });
    expect(reply.text).not.toMatch(/\b\d{1,2}:\d{2}\b/); // No invented delivery hour.
  });

  it.each([
    ["proposal", "Proposed basket change", "Proposal only · not ordered."],
    ["updated", "Basket updated", "Staged basket · not a placed order."],
    ["approval_required", "Approval required", "Basket awaiting approval · not ordered."],
    ["blocked", "Request blocked", "No order placed by this request."],
  ] as const)("labels %s without claiming a placed order", (status, heading, note) => {
    const reply = formatWhatsAppReply(facts({
      status, headline: "Please review this basket", detail: "The requested change needs attention.",
      orderIds: ["must_not_be_a_receipt"],
    }));
    expect(reply.status).toBe(status);
    expect(reply.text).toContain(`*${heading}*\n${note}`);
    expect(reply.text).toContain("The requested change needs attention.");
    expect(reply.text).not.toMatch(/Mock receipt|Mock order placed|must_not_be_a_receipt/);
  });

  it("retains the clarification and gives one next action", () => {
    const reply = formatWhatsAppReply({ status: "clarification", headline: "Which basket?", detail: "Please give the basket name." });
    expect(reply.text).toContain("*More details needed*\nWhich basket?");
    expect(reply.text).toContain("Please give the basket name.");
    expect(reply.text).toContain("Next: reply with the missing details.");
    expect(reply.text.match(/Next:/g)).toHaveLength(1);
    expect(reply.text).not.toContain("Delivery date:");
    expect(reply.actions).toEqual([]);
  });

  it("keeps an approval request and its safety warnings explicit", () => {
    const reply = formatWhatsAppReply(facts({
      status: "approval_required", headline: "Manager approval needed for EUR 350.00",
      totalExVat: 350, warnings: ["Spend cap exceeded.", "Unknown stock cannot be confirmed by approval."],
      actions: [{ label: "Open approval", text: "approval evt_banquet" }, { label: "Cancel", text: "cancel" }],
    }));
    expect(reply.text).toContain("Basket awaiting approval · not ordered.");
    expect(reply.text).toContain("*Warnings*\n• Spend cap exceeded.\n• Unknown stock cannot be confirmed by approval.");
    expect(reply.text).toContain("Next: choose “Open approval”.");
    expect(reply.text.match(/Next:/g)).toHaveLength(1);
  });

  it("preserves a blocked cutoff or dietary explanation without offering approval", () => {
    const reply = formatWhatsAppReply(facts({
      status: "blocked", headline: "The order cutoff has passed.",
      warnings: ["Delivery cutoff: 2026-11-15T15:00:00Z.", "Milk allergen conflicts with the buyer's diet rule."], actions: [],
    }));
    expect(reply.text).toContain("The order cutoff has passed.");
    expect(reply.text).toContain("Delivery cutoff: 2026-11-15T15:00:00Z.");
    expect(reply.text).toContain("Milk allergen conflicts with the buyer's diet rule.");
    expect(reply.text).toContain("Next: review the block in the app.");
    expect(reply.text).not.toMatch(/for approval|Mock receipt/);
  });

  it("labels placed mock receipts and uses only supplied receipt IDs", () => {
    const reply = formatWhatsAppReply(facts({
      status: "ordered", headline: "Conference basket submitted in the demo.",
      orderIds: ["mock_order_123", "mock_order_456"], actions: [],
    }));
    expect(reply.text).toContain("*Mock order placed*\nSimulated receipt · no real purchase.");
    expect(reply.text).toContain("*Mock receipt*\nMock order ID: ```mock_order_123```\nMock order ID: ```mock_order_456```");
    expect(reply.text).toContain("Basket ID: ```evt_banquet```");
    expect(reply.text).toContain("Next: review the mock order in the app.");
    expect(reply.text).not.toMatch(/Staged basket|awaiting approval/);
  });

  it("does not substitute a basket ID for an absent receipt ID", () => {
    const reply = formatWhatsAppReply(facts({ status: "ordered", orderIds: undefined }));
    expect(reply.text).toContain("Mock order ID: not supplied.");
    expect(reply.text).not.toContain("Mock order ID: ```evt_banquet```");
  });

  it("shows unknown stock, missing units and unknown prices as unknown", () => {
    const reply = formatWhatsAppReply(facts({
      lines: [{ ...milk, stock: "unknown", unit: null, lineTotal: null }, { ...milk, id: "other", stock: null }],
      totalExVat: null,
    }));
    expect(reply.text).toContain("4 × sales unit TBC");
    expect(reply.text).toContain("EUR TBC · stock unknown");
    expect(reply.text).toContain("Stock unknown for 2 items; availability is unconfirmed.");
    expect(reply.text).toContain("*Total (ex VAT): EUR TBC*");
    expect(reply.text).not.toContain("stock confirmed");
  });

  it("does not calculate an absent total or convert sales units", () => {
    const reply = formatWhatsAppReply(facts({
      lines: [{ ...milk, quantity: 1.25, unit: "ST", lineTotal: 2.48 }], totalExVat: undefined,
    }));
    expect(reply.text).toContain("1.25 × ST");
    expect(reply.text).toContain("EUR 2.48 · stock confirmed");
    expect(reply.text).toContain("*Total (ex VAT): EUR TBC*");
    expect(reply.text).not.toContain("1.25 L");
  });

  it("keeps zero totals and quantities rather than treating them as missing", () => {
    const reply = formatWhatsAppReply(facts({ lines: [{ ...milk, quantity: 0, lineTotal: 0 }], totalExVat: 0 }));
    expect(reply.text).toContain("0 × KI");
    expect(reply.text.match(/EUR 0\.00/g)).toHaveLength(2);
    expect(reply.text).not.toContain("TBC");
  });

  it("neutralises formatting, HTML, controls, bidi and newlines in displayed strings", () => {
    const attack = "<b>Milk</b>\r\n*ORDERED* _approved_ ~safe~ ```receipt```\u0000\u202e\u200b> fake";
    const reply = formatWhatsAppReply(facts({
      headline: attack, detail: attack,
      order: { ...order, name: attack, deliveryDate: "2026-11-16\n*approved*" },
      lines: [{ ...milk, name: attack, unit: "KI\n*confirmed*" }], warnings: [attack],
      actions: [{ label: "<b>Review</b>\n*now*", text: "exact\n*ROUTING* _text_" }],
    }));
    expect(reply.text).not.toMatch(/<[^>]*>|[\r\u0000\u202e\u200b]|\*ORDERED\*|_approved_|~safe~|```receipt```/);
    expect(reply.text).toContain("Milk ORDERED approved ∼safe∼ receipt ＞ fake");
    expect(reply.text).toContain("Delivery date: 2026-11-16 approved");
    expect(reply.text).not.toContain("\n*approved*");
    expect(reply.text).toContain("Next: choose “Review now”.");
    expect(reply.actions).toEqual([{ label: "<b>Review</b>\n*now*", text: "exact\n*ROUTING* _text_" }]);
  });

  it("keeps identifiers in generated monospace without letting backticks break out", () => {
    const reply = formatWhatsAppReply(facts({
      status: "ordered", order: { ...order, id: "evt_123```\n<b>fake</b>" },
      orderIds: ["mock_123```\n*fake*"],
    }));
    expect(reply.text).toContain("Basket ID: ```evt_123 fake```");
    expect(reply.text).toContain("Mock order ID: ```mock_123 *fake*```");
    expect(reply.text.match(/```/g)).toHaveLength(4);
  });

  it("preserves the meaning of stock comparisons and approximate values in warnings", () => {
    const reply = formatWhatsAppReply(facts({ warnings: ["Stock < 5 KI; require > 10 KI. Estimated cost ~ EUR 20."] }));
    expect(reply.text).toContain("Stock ＜ 5 KI; require ＞ 10 KI. Estimated cost ∼ EUR 20.");
    expect(reply.text).not.toContain("Stock 5 KI");
  });

  it("returns exact supplied actions, bounded to three, without mutating facts", () => {
    const input = facts({ actions: Array.from({ length: 7 }, (_, n) => ({ label: `Choice ${n}`, text: `  exact_${n}\n` })) });
    const before = structuredClone(input);
    const reply = formatWhatsAppReply(input);
    expect(reply.actions).toEqual(input.actions!.slice(0, 3));
    expect(reply.text).toContain("4 more actions in the app.");
    expect(reply.text).toContain("Next: open the basket in the app for full details.");
    reply.actions[0].text = "changed";
    expect(input).toEqual(before);
  });

  it("truncates long baskets with an accurate count and a full-basket CTA", () => {
    const lines = Array.from({ length: 143 }, (_, n) => ({ ...milk, id: `line_${n}`, name: `Product ${n}`, stock: n === 142 ? "unknown" as const : "confirmed" as const }));
    const reply = formatWhatsAppReply(facts({ lines }));
    const shown = (reply.text.match(/• \d+ ×/g) ?? []).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(8);
    expect(reply.text).toContain(`… ${143 - shown} more items in the full basket.`);
    expect(reply.text).toContain("Stock unknown for 1 item; availability is unconfirmed.");
    expect(reply.text).toContain("Next: open the full basket in the app.");
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
  });

  it("keeps warnings, or explicitly points to the omitted warnings", () => {
    const warnings = Array.from({ length: 12 }, (_, n) => `Safety warning ${n}: ${"allergen information ".repeat(50)}`);
    const reply = formatWhatsAppReply(facts({ warnings }));
    const shown = (reply.text.match(/• Safety warning /g) ?? []).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(4);
    expect(reply.text).toContain(`… ${12 - shown} more warnings in the app.`);
    expect(reply.text).toContain("Text shortened; full details and warnings are in the app.");
    expect(reply.text).toContain("Next: open the basket in the app for full details.");
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
  });

  it("bounds lengthy text while preserving status, totals, unknown stock and a CTA", () => {
    const long = "🧑‍🍳 Extremely long product name ".repeat(300);
    const reply = formatWhatsAppReply(facts({
      status: "blocked", headline: long, detail: long,
      order: { id: long, name: long, deliveryDate: long, version: 1 },
      lines: Array.from({ length: 50 }, (_, n) => ({ ...milk, id: String(n), name: long, unit: long, stock: "unknown" })),
      warnings: Array.from({ length: 20 }, () => long),
      actions: Array.from({ length: 10 }, () => ({ label: long, text: long })),
      totalExVat: null,
    }));
    expect(reply.text.length).toBeLessThanOrEqual(4_000);
    expect(reply.text).toContain("*Request blocked*\nNo order placed by this request.");
    expect(reply.text).toContain("*Total (ex VAT): EUR TBC*");
    expect(reply.text).toContain("Stock unknown for 50 items; availability is unconfirmed.");
    expect(reply.text).toMatch(/\d+ more warnings in the app/);
    expect(reply.text).toContain("Next: open the full basket in the app.");
    expect(reply.text.match(/Next:/g)).toHaveLength(1);
    expect(reply.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    expect(reply.actions).toHaveLength(3);
    expect(reply.actions[0].text).toBe(long);
  });

  it("bounds multiple receipt IDs and states the accurate omitted count", () => {
    const reply = formatWhatsAppReply(facts({ status: "ordered", orderIds: Array.from({ length: 9 }, (_, n) => `mock_${n}`) }));
    expect(reply.text.match(/Mock order ID:/g)).toHaveLength(3);
    expect(reply.text).toContain("6 more mock order IDs in the app.");
    expect(reply.text).toContain("Next: open the basket in the app for full details.");
  });

  it("omits empty warnings and renders an empty basket without invented items", () => {
    const reply = formatWhatsAppReply(facts({ lines: [], warnings: ["", " \n", "<b></b>"], order: null, actions: [] }));
    expect(reply.text).not.toMatch(/\*Items|\*Warnings|Basket ID|Mock receipt/);
    expect(reply.text).toContain("*Total (ex VAT): EUR 79.20*");
    expect(reply.text).toContain("Next: review the basket in the app.");
  });

  it("does not print nonfinite numbers as confirmed prices or quantities", () => {
    const reply = formatWhatsAppReply(facts({ lines: [{ ...milk, quantity: NaN, lineTotal: Infinity }], totalExVat: NaN }));
    expect(reply.text).not.toMatch(/NaN|Infinity/);
    expect(reply.text).toContain("TBC × KI");
    expect(reply.text.match(/EUR TBC/g)).toHaveLength(2);
  });
});
