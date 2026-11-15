/** Menu → order: amounts per guest × head count, combined across dishes, then the shared review and basket. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { scaleMenu } = await import("../src/agent/menu.js");

let BASE = "";
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${BASE}/gateway/v1`;
});
afterAll(() => server.close());

let cookie = "";
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
}

async function fresh() {
  await call("POST", "/reset");
  const session = await call("POST", "/session", { personId: "p-aino" });
  cookie = `aimo_session=${session.token}`;
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  return (await call("POST", "/baskets", { name: "Conference dinner", deliveryDate: "2026-11-16" })).basket.id as string;
}

const LF = { id: "lf", label: "Lactose-free", count: 10, constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] }, standing: false };
const menu = (version: number, extra: Record<string, unknown> = {}) => ({
  version,
  guests: 120,
  dietsConfirmed: true,
  dietGroups: [LF],
  dishes: [
    { id: "main", name: "Salmon main", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "salmon", text: "Salmon fillet pieces", productId: "469672", perPortion: { amount: 170, unit: "g" } },
      { id: "cream", text: "Whipping cream", productId: "464727", perPortion: { amount: 0.5, unit: "dl" } },
    ] },
    { id: "dessert", name: "Dessert", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "cream", text: "Whipping cream", productId: "464727", perPortion: { amount: 1, unit: "dl" } },
    ] },
  ],
  ...extra,
});

describe("menu to order", () => {
  it("scales each ingredient by the guests who eat it and combines the same product across dishes", () => {
    const m = menu(1);
    const s = scaleMenu({ name: "x", ...m } as any);
    expect(s.problems).toEqual([]);
    expect(s.regularGuests).toBe(110);
    const salmon = s.lines.filter((l) => l.productId === "469672");
    // The diet group keeps its own line (Q03.3): regular guests never move onto the diet spec.
    expect(salmon.map((l) => [l.total.amount, l.constraints.claims])).toEqual([[18.7, []], [1.7, ["FREE_FROM_LACTOSE"]]]);
    const cream = s.lines.find((l) => l.productId === "464727" && !l.constraints.claims.length)!;
    expect(cream.total).toEqual({ amount: 16.5, unit: "l" }); // 110 × (0.05 + 0.1) l
    expect(cream.shares.map((x) => [x.dishName, x.amount])).toEqual([["Salmon main", 5.5], ["Dessert", 11]]);
  });

  it("refuses to generate without a head count or a stated answer on diets, and flags unit slips", () => {
    expect(scaleMenu({ name: "x", ...menu(1, { guests: 0, dietGroups: [] }) } as any).problems.map((p) => p.ruleId)).toContain("REQ-06");
    expect(scaleMenu({ name: "x", ...menu(1, { dietsConfirmed: false }) } as any).problems.map((p) => p.ruleId)).toContain("REQ-05");
    expect(scaleMenu({ name: "x", ...menu(1, { guests: 5 }) } as any).problems.map((p) => p.ruleId)).toContain("DIET-03");
    const slip = menu(1);
    (slip.dishes[1].ingredients[0] as any).perPortion = { amount: 2, unit: "l" };
    expect(scaleMenu({ name: "x", ...slip } as any).warnings.map((w) => w.ruleId)).toContain("QTY-02");
  });

  it("saves the menu, generates one reviewable request in the basket, and stages it like a typed request", async () => {
    const id = await fresh();
    const saved = await call("PUT", `/events/${id}/menu`, menu(1));
    expect(saved.status).toBe(200);
    expect(saved.event.version).toBe(2);
    expect(saved.scale.lines).toHaveLength(4);

    // A stale version is refused with the current menu.
    expect((await call("POST", `/events/${id}/menu/order`, { version: 1 })).status).toBe(409);

    const gen = await call("POST", `/events/${id}/menu/order`, { version: 2 });
    expect(gen.status).toBe(200);
    expect(gen.plan.eventId).toBe(id);
    expect(gen.plan.title).toMatch(/^Menu · 120 guests/);
    expect(gen.plan.request.lines).toHaveLength(4);
    expect(gen.plan.itemReviews).toBeDefined();
    // Combined cream: one order line, rounded once.
    const creamLine = gen.plan.lines.find((l: any) => l.productId === "464727" && l.needAmount.value === 16.5);
    expect(creamLine.quantity).toBe(17);

    // Approve each item, then add the generated order to the basket.
    let plan = gen.plan;
    for (const item of plan.itemReviews.filter((i: any) => i.requiresApproval !== false)) {
      const r = await call("POST", `/plans/${plan.id}/items/${encodeURIComponent(item.needId)}/approve`, { fingerprint: item.fingerprint });
      if (r.status === 200) plan = r.plan;
    }
    const staged = await call("POST", `/plans/${plan.id}/basket`, {});
    expect(staged.status).toBe(200);
    const basket = await call("GET", `/baskets/${id}`);
    expect(basket.requests.some((r: any) => r.id === plan.id && r.basketedAt)).toBe(true);
  });

  it("explains what is missing instead of generating an order", async () => {
    const id = await fresh();
    await call("PUT", `/events/${id}/menu`, menu(1, { dietsConfirmed: false }));
    const gen = await call("POST", `/events/${id}/menu/order`, { version: 2 });
    expect(gen.status).toBe(422);
    expect(gen.problems.map((p: any) => p.ruleId)).toEqual(["REQ-05"]);
  });
});
