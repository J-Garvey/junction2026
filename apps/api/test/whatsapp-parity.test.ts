import { afterEach, describe, expect, it, vi } from "vitest";
import type { WhatsAppInterpretContext } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
vi.mock("../src/agent/openai.js", () => ({ structured: vi.fn(), ModelUnavailable: class extends Error {} }));
const { structured } = await import("../src/agent/openai.js");
const { interpretMessage } = await import("../src/agent/message.js");
const { interpretWhatsApp } = await import("../src/whatsapp/interpreter.js");
const model = vi.mocked(structured);
const birthday = { id: "evt-birthday", name: "Darragh's Birthday", deliveryDate: "2026-11-30", version: 1 };
const context: WhatsAppInterpretContext = {
  orders: [birthday, { ...birthday, id: "evt-other", name: "Conference" }],
  activeOrderId: "evt-other", pending: null, lines: [],
};
const modelItem = (overrides = {}) => ({
  text: "sliced cheddar cheese", productWord: "sliced cheddar cheese", productType: null,
  productId: null, amount: 10, unit: "pcs", claims: [], avoidAllergens: [], origin: null, ...overrides,
});
afterEach(() => model.mockReset());

describe("web and WhatsApp share product interpretation", () => {
  it("reads the screenshot's quantity and order without a model or another quantity question", async () => {
    const web = await interpretMessage("10 slices of cheese");
    const chat = await interpretWhatsApp("add 10 slices of cheese to darragh's birthday", context);
    expect(chat).toMatchObject({ intent: "add_items", orderId: birthday.id, question: null });
    for (const request of [web.parsed?.request, chat.request]) {
      expect(request).toMatchObject({ parsedBy: "rules", lines: [{ query: "sliced cheese", quantity: { amount: 10, unit: "pcs" } }] });
    }
    expect(chat.request?.neededBy).toBe(birthday.deliveryDate);
    expect(model).not.toHaveBeenCalled();
  });

  it("keeps quantity evidence when the model shortens the item description", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [modelItem()] });
    const source = "10 thin slices of cheddar cheese";
    const web = await interpretMessage(source);
    const chat = await interpretWhatsApp(`add ${source} to darragh's birthday`, context);
    expect(chat).toMatchObject({ intent: "add_items", orderId: birthday.id, question: null });
    for (const request of [web.parsed?.request, chat.request]) {
      expect(request).toMatchObject({ parsedBy: "openai", lines: [{ text: source, query: "sliced cheddar cheese", quantity: { amount: 10, unit: "pcs" } }] });
    }
  });

  it.each(["sliced cheddar cheese", "0 slices of cheese", "2 x 500 g sliced cheddar cheese", "2 packs of sliced cheddar cheese"])(
    "still asks about omitted, invalid or ambiguous quantities: %s", async (source) => {
      model.mockResolvedValue({ neededByText: null, lines: [modelItem()] });
      expect(await interpretWhatsApp(`add ${source} to darragh's birthday`, context)).toMatchObject({ intent: "clarify" });
    },
  );

  it("does not borrow a second item's quantity for an item with no amount", async () => {
    model.mockResolvedValue({ neededByText: null, lines: [modelItem(), modelItem({ text: "5 kg salmon", productWord: "salmon", amount: 5, unit: "kg" })] });
    const chat = await interpretWhatsApp("add sliced cheddar cheese and 5 kg salmon to darragh's birthday", context);
    expect(chat).toMatchObject({ intent: "clarify", request: { lines: [{ quantity: null }, { quantity: { amount: 5, unit: "kg" } }] } });
  });
});
