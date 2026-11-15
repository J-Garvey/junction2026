import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { WhatsAppInterpretContext, WhatsAppLine, WhatsAppOrderRef } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
const { interpretWhatsApp } = await import("../src/whatsapp/interpreter.js");
const { setClock } = await import("../src/clock.js");

const wedding: WhatsAppOrderRef = { id: "evt-wedding", name: "Aurora Wedding", deliveryDate: "2026-11-16", version: 1 };
const conference: WhatsAppOrderRef = { id: "evt-conference", name: "Conference Lunch", deliveryDate: "2026-11-17", version: 2 };
const dinner: WhatsAppOrderRef = { id: "evt-dinner", name: "Conference Dinner", deliveryDate: "2026-11-17", version: 3 };
const line = (id: string, productId: string, name: string): WhatsAppLine => ({ id, productId, name, quantity: 10, unit: "l", lineTotal: 20, stock: "confirmed" });
const milk = line("line-milk", "469363", "Valio lactose-free milk");
const butter = line("line-butter", "460000", "Valio butter");
const context = (overrides: Partial<WhatsAppInterpretContext> = {}): WhatsAppInterpretContext => ({
  orders: [wedding, conference, dinner], activeOrderId: wedding.id, pending: null, lines: [milk, butter], ...overrides,
});
let network: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  setClock({ time: "2026-11-14T10:00:00Z" });
  network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Interpreter tests must stay offline"));
});
afterAll(() => {
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
});

describe("WhatsApp order resolution", () => {
  it.each(["evt-wedding", "Aurora Wedding", "wedding", "2026-11-16", "Monday"])("selects by ID, name, name phrase or date: %s", async (text) => {
    expect(await interpretWhatsApp(text, context({ activeOrderId: null }))).toMatchObject({ intent: "select_order", orderId: wedding.id });
  });

  it.each(["show evt-wedding", "summary of wedding", "show me Aurora Wedding", "what's in the wedding order?"])("shows a named order: %s", async (text) => {
    expect(await interpretWhatsApp(text, context({ activeOrderId: dinner.id }))).toMatchObject({ intent: "summary", orderId: wedding.id });
  });

  it.each(["conference", "show conference", "add 5 kg butter to conference", "show 2026-11-17"])("asks and lists choices for an ambiguous reference: %s", async (text) => {
    const reply = await interpretWhatsApp(text, context());
    expect(reply).toMatchObject({ intent: "clarify", orderId: null, request: null, lineIds: [] });
    expect(reply.choices.map((order) => order.id)).toEqual([conference.id, dinner.id]);
    expect(reply.question).toBe("Which order do you mean?");
    expect(reply.question).not.toContain(dinner.id);
  });

  it.each([
    "add 10kg pasta to emma' and lauris wedding",
    "add 10 kg pasta to Emma & Lauri's wedding",
    "add 10 kg pasta to emma and lauri wedding",
    "add 10 kg pasta to emma and Lauri's weding",
    "show emma lauris wedding",
  ])("tolerates apostrophes, possessives and small typos in order names: %s", async (text) => {
    const emma = { id: "evt-emma", name: "Emma and Lauri's wedding", deliveryDate: "2026-11-17", version: 4 };
    const pavit = { id: "evt-pavit", name: "Pavit's Date", deliveryDate: "2026-11-18", version: 5 };
    expect(await interpretWhatsApp(text, context({ orders: [wedding, emma, pavit], activeOrderId: null })))
      .toMatchObject({ orderId: emma.id });
  });

  it("uses both name and date to disambiguate", async () => {
    const earlier = { ...conference, id: "evt-earlier", deliveryDate: "2026-11-16" };
    expect(await interpretWhatsApp("show order Conference Lunch on 2026-11-16", context({ orders: [earlier, conference] })))
      .toMatchObject({ intent: "summary", orderId: earlier.id });
  });

  it.each(["add 5 kg butter to order missing", "confirm order evt-missing", "show missing", "remove milk from missing order", "add 5 l milk for 2026-12-01"])("never falls back from an explicit unknown reference: %s", async (text) => {
    const reply = await interpretWhatsApp(text, context());
    expect(reply.intent).toBe("clarify");
    expect(reply.orderId).toBeNull();
    expect(reply.choices).toEqual(context().orders);
  });

  it("does not silently pick one of two conflicting explicit orders", async () => {
    const reply = await interpretWhatsApp("show evt-wedding for evt-dinner", context());
    expect(reply.intent).toBe("clarify");
    expect(reply.orderId).toBeNull();
    expect(reply.choices.map((order) => order.id)).toEqual([wedding.id, dinner.id]);
  });

  it("uses active context for followups and asks if several orders are possible", async () => {
    expect(await interpretWhatsApp("summary", context())).toMatchObject({ intent: "summary", orderId: wedding.id });
    expect(await interpretWhatsApp("add 5 kg butter", context({ activeOrderId: conference.id }))).toMatchObject({ intent: "add_items", orderId: conference.id });
    const reply = await interpretWhatsApp("add 5 kg butter", context({ activeOrderId: null }));
    expect(reply.intent).toBe("clarify");
    expect(reply.choices).toEqual(context().orders);
  });

  it("can infer the only order, but does not reuse a stale active ID", async () => {
    expect(await interpretWhatsApp("summary", context({ orders: [wedding], activeOrderId: null }))).toMatchObject({ intent: "summary", orderId: wedding.id });
    expect(await interpretWhatsApp("confirm order", context({ orders: [wedding], activeOrderId: "deleted" }))).toMatchObject({ intent: "clarify", orderId: null });
    expect(await interpretWhatsApp("summary", context({ orders: [], activeOrderId: null }))).toMatchObject({ intent: "clarify", choices: [] });
  });

  it.each(["order-1", "order-2026-11-16", "basket-1"])("resolves exact order IDs without treating their prefix or date as a label: %s", async (id) => {
    expect(await interpretWhatsApp(id, context({ orders: [{ ...wedding, id }], activeOrderId: null })))
      .toMatchObject({ intent: "select_order", orderId: id });
  });

  it("never treats a quantity or product ID as an order index", async () => {
    expect(await interpretWhatsApp("2", context())).toMatchObject({ intent: "clarify", orderId: null });
    const numericOrder = { ...conference, id: "469363" };
    const reply = await interpretWhatsApp("add 2 l product 469363", context({ orders: [wedding, numericOrder] }));
    expect(reply).toMatchObject({ intent: "add_items", orderId: wedding.id });
    expect(reply.request?.lines[0].productId).toBe("469363");
    expect(await interpretWhatsApp("remove 469363", context({ orders: [wedding, numericOrder] }))).toMatchObject({ intent: "remove_items", orderId: wedding.id, lineIds: [milk.id] });
  });

  it.each(["from Finland", "in sauce"])("does not turn product wording into an order reference: %s", async (suffix) => {
    const misleading = { ...conference, name: suffix.replace(/^\S+\s+/, "") };
    const reply = await interpretWhatsApp(`add 1 kg salmon ${suffix}`, context({ orders: [wedding, misleading] }));
    expect(reply.orderId).not.toBe(misleading.id);
    if (reply.intent === "add_items") expect(reply.request?.originalText).toContain(suffix);
  });
});

describe("WhatsApp item additions", () => {
  it("strips the order name and date before calling the existing product parser", async () => {
    const reply = await interpretWhatsApp("add 1,000 litres lactose-free milk to order Aurora Wedding on 2026-11-16", context({ activeOrderId: dinner.id }));
    expect(reply).toMatchObject({ intent: "add_items", orderId: wedding.id });
    expect(reply.request).toMatchObject({ kind: "single", parsedBy: "rules", neededBy: wedding.deliveryDate });
    expect(reply.request?.lines).toHaveLength(1);
    expect(reply.request?.lines[0]).toMatchObject({ query: "milk", productType: "plain drinking milk", quantity: { amount: 1000, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"] } });
    expect(reply.request?.originalText).not.toMatch(/Wedding|2026-11-16/i);
  });

  it.each(["add 10 l milk to Aurora Wedding", "Aurora Wedding: add 10 l milk", "10 l milk", "10l milk", "add 10 l milk to my order", "add 10 l milk to the order", "add 10 l milk to it"])("parses a scoped or contextual addition: %s", async (text) => {
    const reply = await interpretWhatsApp(text, context());
    expect(reply).toMatchObject({ intent: "add_items", orderId: wedding.id });
    expect(reply.request?.lines[0]).toMatchObject({ query: "milk", quantity: { amount: 10, unit: "l" } });
  });

  it("preserves separate quantities and named claims", async () => {
    const reply = await interpretWhatsApp("add 10 l lactose-free milk and 12 gluten-free bread", context());
    expect(reply.intent).toBe("add_items");
    expect(reply.request?.lines).toMatchObject([
      { query: "milk", quantity: { amount: 10, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"] } },
      { query: "bread", quantity: { amount: 12, unit: "pcs" }, constraints: { claims: ["FREE_FROM_GLUTEN"] } },
    ]);
  });

  it.each(["add 1 additional kilo of salmon", "add an additional kilo of salmon", "add another kilo of salmon"])("preserves additive kilo wording or asks for its quantity: %s", async (text) => {
    const reply = await interpretWhatsApp(text, context());
    expect(["add_items", "clarify"]).toContain(reply.intent);
    if (reply.intent === "add_items") expect(reply.request?.lines[0].quantity).toEqual({ amount: 1, unit: "kg" });
    else expect(reply.question).toMatch(/quantity/);
  });

  it("carries a global suffix requirement across every item", async () => {
    const reply = await interpretWhatsApp("add 10 l milk and 12 bread both vegan", context());
    expect(reply.intent).toBe("add_items");
    expect(reply.request?.lines).toHaveLength(2);
    for (const item of reply.request!.lines) expect(item.constraints.claims).toContain("VEGAN");
  });

  it("preserves named allergen exclusions in the offline parser fallback", async () => {
    const reply = await interpretWhatsApp("add 12 peanut-free bread", context());
    expect(reply.intent).toBe("add_items");
    expect(reply.request?.lines[0].constraints.avoidAllergens).toContain("AP");
    expect((await interpretWhatsApp("add 12 nut-free bread", context())).request?.lines[0].constraints.avoidAllergens).toEqual(expect.arrayContaining(["AN", "AP"]));
    const dairy = await interpretWhatsApp("add 12 dairy-free bread", context());
    expect(dairy.request?.lines[0].constraints).toMatchObject({ claims: ["FREE_FROM_MILK"], avoidAllergens: ["AM"] });
  });

  it.each(["add lactose-free milk", "add product 469363", "add 5 l milk and butter"])("asks for omitted quantities instead of accepting one piece: %s", async (text) => {
    const reply = await interpretWhatsApp(text, context());
    expect(reply.intent).toBe("clarify");
    expect(reply.question).toMatch(/quantity/i);
    expect(reply.request?.lines.some((item) => item.quantity === null)).toBe(true);
  });

  it.each(["add 0 l milk", "add -5 l milk", "add 5 kg halal beef"])("asks for unsafe or unsupported parser input: %s", async (text) => {
    expect((await interpretWhatsApp(text, context())).intent).toBe("clarify");
  });

  it.each(["add 2 x 500 ml milk", "add 10 l lactose-free milk and gluten-free"])("does not silently drop a quantity or dietary fragment: %s", async (text) => {
    expect((await interpretWhatsApp(text, context())).intent).toBe("clarify");
  });

  it("keeps milk allergen distinct from a lactose-free claim", async () => {
    const reply = await interpretWhatsApp("add 10 l lactose-free milk", context());
    expect(reply.request?.lines[0].constraints).toEqual({ claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] });
  });
});

describe("WhatsApp removals", () => {
  it("returns every matching line ID once for an identified product", async () => {
    const extra = { ...milk, id: "line-milk-second" };
    expect(await interpretWhatsApp("remove 469363 and 469363", context({ lines: [milk, extra, milk] })))
      .toMatchObject({ intent: "remove_items", orderId: wedding.id, lineIds: [milk.id, extra.id] });
  });

  it("resolves unambiguous names and multiple products", async () => {
    expect(await interpretWhatsApp("remove milk and butter", context())).toMatchObject({ intent: "remove_items", lineIds: [milk.id, butter.id] });
    expect(await interpretWhatsApp("remove line-milk", context())).toMatchObject({ intent: "remove_items", lineIds: [milk.id] });
  });

  it("asks about ambiguous products without partially removing matches", async () => {
    const oat = line("line-oat", "470000", "Oat milk");
    const reply = await interpretWhatsApp("remove butter and milk", context({ lines: [milk, butter, oat] }));
    expect(reply).toMatchObject({ intent: "clarify", lineIds: [] });
    expect(reply.question).toContain("469363");
    expect(reply.question).toContain("Oat milk");
    expect(await interpretWhatsApp("remove all milk", context({ lines: [milk, oat] }))).toMatchObject({ intent: "remove_items", lineIds: [milk.id, oat.id] });
  });

  it.each(["remove 2 l milk", "remove milk and salmon", "remove"])("asks rather than guessing removal scope: %s", async (text) => {
    expect(await interpretWhatsApp(text, context())).toMatchObject({ intent: "clarify", lineIds: [] });
  });

  it("resolves another order without ever applying the active order's lines", async () => {
    expect(await interpretWhatsApp("remove milk from Conference Lunch", context()))
      .toEqual({ intent: "remove_items", orderId: conference.id, request: null, lineIds: [], question: null, choices: [] });
    const selectedLine = line("conference-milk", milk.productId!, milk.name);
    expect(await interpretWhatsApp("remove milk from Conference Lunch", context({ activeOrderId: conference.id, lines: [selectedLine] })))
      .toMatchObject({ intent: "remove_items", orderId: conference.id, lineIds: [selectedLine.id] });
  });
});

describe("WhatsApp confirmation safety", () => {
  it.each([
    "add 1 kg salmon instead of milk", "add 1 kg salmon rather than milk",
    "add 1 kg salmon to replace milk", "add 1 kg salmon as a replacement for milk",
    "add 1 kg salmon if milk is unavailable", "add 1 kg salmon or butter",
  ])("does not partially execute unsupported replacements, choices or conditions: %s", async (text) => {
    expect(await interpretWhatsApp(text, context())).toMatchObject({ intent: "clarify", request: null, lineIds: [] });
  });

  it.each([
    "add 1 kg salmon to all orders", "add 1 kg salmon to Aurora Wedding and Conference Lunch",
    "add 1 kg salmon to evt-wedding and evt-conference", "remove all items from all orders",
    "add 1 kg salmon to Aurora Wedding; add 2 kg butter to Conference Lunch",
    "confirm order evt-wedding and evt-conference",
  ])("keeps unsupported multi-order instructions atomic: %s", async (text) => {
    expect(await interpretWhatsApp(text, context())).toMatchObject({ intent: "clarify", orderId: null, request: null, lineIds: [] });
  });

  it.each(["confirm order", "place the order", "submit order", "confirm evt-wedding"])("requires explicit order intent: %s", async (text) => {
    expect(await interpretWhatsApp(text, context())).toMatchObject({ intent: "confirm_order", orderId: wedding.id, request: null, lineIds: [] });
  });

  it.each(["yes", "ok", "okay", "confirm", "yes please", "confirm change"])("does not place an order for a vague affirmation: %s", async (text) => {
    expect((await interpretWhatsApp(text, context())).intent).toBe("clarify");
  });

  it.each(["add_items", "remove_items"] as const)("accepts only an explicit pending %s change", async (kind) => {
    const pending = { kind, orderId: wedding.id, fingerprint: "synthetic-proposal" };
    expect(await interpretWhatsApp("yes, confirm change", context({ pending, activeOrderId: conference.id }))).toMatchObject({ intent: "accept_change", orderId: wedding.id });
    expect((await interpretWhatsApp("ok", context({ pending }))).intent).toBe("clarify");
    expect(await interpretWhatsApp("cancel change", context({ pending }))).toMatchObject({ intent: "cancel", orderId: wedding.id });
    expect(await interpretWhatsApp("confirm order", context({ pending }))).toMatchObject({ intent: "confirm_order", orderId: wedding.id });
  });

  it("does not promote a pending order confirmation through confirm change", async () => {
    expect((await interpretWhatsApp("confirm change", context({ pending: { kind: "confirm_order", orderId: wedding.id, fingerprint: "fake" } }))).intent).toBe("clarify");
    expect((await interpretWhatsApp("confirm change", context({ pending: { kind: "add_items", orderId: "deleted", fingerprint: "fake" } }))).intent).toBe("clarify");
  });

  it.each([
    "add 5 l milk and confirm order", "remove butter and place order", "confirm order and add 2 kg butter",
    "add 5 l milk and remove butter", "confirm order then show summary", "do not confirm order", "don't confirm", "never place order", "do not add 5 l milk",
  ])("clarifies mixed or negated instructions: %s", async (text) => {
    expect(await interpretWhatsApp(text, context())).toMatchObject({ intent: "clarify", lineIds: [], request: null });
  });

  it("returns all contract fields and never changes conversation, orders, or lines", async () => {
    const ctx = context();
    const before = structuredClone(ctx);
    for (const text of ["", "summary", "Aurora Wedding", "add 10 l milk", "remove butter", "confirm order", "yes"]) {
      expect(Object.keys(await interpretWhatsApp(text, ctx)).sort()).toEqual(["choices", "intent", "lineIds", "orderId", "question", "request"]);
    }
    expect(ctx).toEqual(before);
  });
});

describe("WhatsApp edit commands", () => {
  it("reads numbered and named quantity changes on the active order", async () => {
    expect(await interpretWhatsApp("change 2 to 15", context())).toMatchObject({ intent: "change_quantity", orderId: wedding.id, lineIds: [butter.id], quantity: 15 });
    expect(await interpretWhatsApp("Set butter to 4 l", context())).toMatchObject({ intent: "change_quantity", lineIds: [butter.id], quantity: 4 });
    expect(await interpretWhatsApp("change milk to 0", context())).toMatchObject({ intent: "remove_items", lineIds: [milk.id] });
    expect(await interpretWhatsApp("change 2 to 15 kg", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("change 2 to 1.5", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("change 3 to 5", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("change valio to 5", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("change 2 to 5", context({ activeOrderId: null }))).toMatchObject({ intent: "clarify" });
  });

  it("removes numbered lines", async () => {
    expect(await interpretWhatsApp("remove 1 and 2", context())).toMatchObject({ intent: "remove_items", lineIds: [milk.id, butter.id] });
    expect(await interpretWhatsApp("remove line 7", context())).toMatchObject({ intent: "clarify" });
  });

  it("reads approvals, refusals with notes, new orders and help", async () => {
    expect(await interpretWhatsApp("approve", context())).toMatchObject({ intent: "approve", orderId: wedding.id });
    expect(await interpretWhatsApp("Refuse: Too much salmon", context())).toMatchObject({ intent: "refuse", note: "Too much salmon" });
    expect(await interpretWhatsApp("reject the order because over budget", context())).toMatchObject({ intent: "refuse", note: "over budget" });
    expect(await interpretWhatsApp("don't approve", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("confirm approval", context({ pending: { kind: "answer_question", orderId: wedding.id, fingerprint: "x", questionId: "q", optionId: "approve" } }))).toMatchObject({ intent: "accept_change" });
    expect(await interpretWhatsApp("new order Emma's wedding on 17 Nov", context())).toMatchObject({ intent: "new_order", newOrder: { name: "Emma's wedding", deliveryDate: "2026-11-17" } });
    expect(await interpretWhatsApp("new order", context())).toMatchObject({ intent: "clarify" });
    expect(await interpretWhatsApp("help", context())).toMatchObject({ intent: "help" });
  });
});
