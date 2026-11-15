import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Constraints, DietGroup, EventSpec, FiredRule, Product } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { SEED_EVENT, MANDATE, seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { getProduct } = await import("../src/catalog.js");
const { scaleMenu } = await import("../src/agent/menu.js");
const { needsFromEvent, newPlan, quoteAndDecide, runPipeline } = await import("../src/agent/plan.js");
const { rankNeed } = await import("../src/agent/match.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { lookup, loadFixture, normalise } = await import("../src/aimo/lookup.js");

const group = (id: string, count: number, constraints: Partial<Constraints> = {}): DietGroup => ({
  id, label: id, count, standing: false, constraints: { claims: [], avoidAllergens: [], labels: [], ...constraints },
});
const lactoseFree = (count: number) => group("lf", count, { claims: ["FREE_FROM_LACTOSE"] });
function coffee(dietGroups: DietGroup[] = []): EventSpec {
  const event = structuredClone(SEED_EVENT);
  event.dietGroups = dietGroups;
  event.dishes = [event.dishes.find((dish) => dish.id === "coffee")!];
  event.dishes[0].ingredients = [event.dishes[0].ingredients.find((ingredient) => ingredient.id === "milk")!];
  return event;
}
function scaled(event: EventSpec) {
  const scale = scaleMenu(event);
  const problems: FiredRule[] = [];
  const needs = needsFromEvent(event, MANDATE, [], problems);
  expect(problems).toEqual(scale.problems);
  return { scale, needs };
}

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(() => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
  // Fixture mode can fall through to upstream for a missing SKU. Bound the
  // shortlist to saved fixture evidence and mark other SKUs unavailable here.
  const fixture = loadFixture("base")!;
  vi.spyOn(gw, "lookup").mockImplementation(async (ids, date) => {
    const savedIds = ids.filter((id) => fixture.availability[id] || fixture.price[id]);
    const saved = await lookup(savedIds, date, { mode: "fixture", overlay: null });
    return { ...saved, lines: ids.map((id) => saved.lines.find((line) => line.productId === id)
      ?? normalise(id, {}, {}, "fixture", "unavailable fixed-total regression fixture", "2026-11-14T10:00:00Z")) };
  });
});
afterEach(() => vi.restoreAllMocks());

describe("fixed event totals in preview and generation (R06-02)", () => {
  it.each([
    ["regular only", []],
    ["all guests lactose-free", [lactoseFree(180)]],
    ["multiple groups without regular guests", [lactoseFree(100), group("gf", 80, { claims: ["FREE_FROM_GLUTEN"] })]],
    ["mixed regular and diet guests", [lactoseFree(20), group("gf", 10, { claims: ["FREE_FROM_GLUTEN"] })]],
  ] as const)("preserves exactly one 40 L total: %s", (_name, groups) => {
    const event = coffee([...groups]);
    const { scale, needs } = scaled(event);
    expect(scale.problems).toEqual([]);
    expect(scale.lines).toHaveLength(1);
    expect(scale.lines[0].total).toEqual({ amount: 40, unit: "l" });
    expect(scale.lines[0].shares).toEqual([expect.objectContaining({ groupId: "event-total", guests: null, perPortion: null, amount: 40 })]);
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ id: "coffee:milk:event-total", amount: { value: 40, unit: "l" }, guests: null, perPortion: null });
    expect(needs[0].constraints).toEqual(scale.lines[0].constraints);
    expect(needs[0].constraints.claims).toEqual([...new Set(["FREE_FROM_LACTOSE", ...groups.flatMap((g) => g.constraints.claims)])].sort());
  });

  it("retains all seven seed wedding ingredients when every guest has a diet", () => {
    const event = structuredClone(SEED_EVENT);
    event.dietGroups = [lactoseFree(event.guests)];
    const { scale, needs } = scaled(event);
    expect(scale.lines).toHaveLength(7);
    expect(needs).toHaveLength(7);
    expect(needs.find((need) => need.ingredientId === "milk")?.amount).toEqual({ value: 40, unit: "l" });
  });

  it("applies only participating groups' claims, allergens, labels and origin", () => {
    const event = coffee([
      group("served", 80, { claims: ["FREE_FROM_GLUTEN"], avoidAllergens: ["AN"], labels: ["organic"], origin: "fi" }),
      group("excluded", 100, { claims: ["VEGAN"], avoidAllergens: ["AM"], origin: "se" }),
      group("empty", 0, { claims: ["VEGAN"], origin: "de" }),
    ]);
    const dish = event.dishes[0];
    dish.excludesGroups = ["excluded"];
    dish.ingredients[0].variants = { served: "469363", excluded: "464306", empty: "464201" };
    const { scale, needs } = scaled(event);
    expect(scale.problems).toEqual([]);
    expect(scale.lines[0]).toMatchObject({ total: { amount: 40, unit: "l" }, productId: "469363" });
    expect(needs[0].pinnedProductId).toBe("469363");
    expect(needs[0].constraints).toEqual({ claims: ["FREE_FROM_GLUTEN", "FREE_FROM_LACTOSE"], avoidAllergens: ["AN"], labels: ["organic"], origin: "fi" });
    expect(scale.lines[0].constraints).toEqual(needs[0].constraints);
  });

  it("excludes a dish when none of its guests participate, including an excluded regular group", () => {
    for (const groups of [[], [lactoseFree(180)]]) {
      const event = coffee(groups);
      event.dishes[0].excludesGroups = ["regular", "lf"];
      // Keep another served dish, so an intentionally empty dish is not confused
      // with a completely empty menu's existing missing-menu question.
      event.dishes.push(structuredClone(SEED_EVENT.dishes[0]));
      const { scale, needs } = scaled(event);
      expect(scale.problems).toEqual([]);
      expect(scale.lines.flatMap((line) => line.shares).some((share) => share.dishId === "coffee")).toBe(false);
      expect(needs.some((need) => need.dishId === "coffee")).toBe(false);
    }
  });

  it.each(["different variants", "variant and default", "variant and unpinned", "group origins", "ingredient origin"])("asks for explicit quantities for conflicting allocation: %s", (kind) => {
    const event = coffee([lactoseFree(100), group("other", 80)]);
    const ingredient = event.dishes[0].ingredients[0];
    if (kind === "different variants") ingredient.variants = { lf: "469363", other: "464306" };
    if (kind === "variant and default") { ingredient.productId = "464306"; ingredient.variants = { lf: "469363" }; }
    if (kind === "variant and unpinned") ingredient.variants = { lf: "469363" };
    if (kind === "group origins") { event.dietGroups[0].constraints.origin = "fi"; event.dietGroups[1].constraints.origin = "se"; }
    if (kind === "ingredient origin") { ingredient.origin = "fi"; event.dietGroups[0].constraints.origin = "se"; }
    const { scale, needs } = scaled(event);
    expect(needs).toEqual([]);
    expect(scale.problems).toEqual([expect.objectContaining({ ruleId: "REQ-02", outcome: "ask_chef", message: expect.stringMatching(/Split the fixed 40 l total.*explicit group quantities/) })]);
  });

  it("uses a common variant once and ignores variants for guests who do not eat the dish", () => {
    const event = coffee([lactoseFree(100), group("other", 80)]);
    event.dishes[0].ingredients[0].productId = "464306";
    event.dishes[0].ingredients[0].variants = { lf: "469363", other: "469363", regular: "464201" };
    const { scale, needs } = scaled(event);
    expect(scale.problems).toEqual([]);
    expect(scale.lines[0].productId).toBe("469363");
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ pinnedProductId: "469363", amount: { value: 40, unit: "l" } });
  });

  it("does not infer a mixed regular/diet variant split from head counts", () => {
    const event = coffee([lactoseFree(20)]);
    event.dishes[0].ingredients[0].productId = "464306";
    event.dishes[0].ingredients[0].variants = { lf: "469363" };
    expect(scaled(event).scale.problems[0].ruleId).toBe("REQ-02");
  });

  it("carries text restrictions into both fixed-total paths and refuses conflicting text origin", () => {
    const event = coffee([lactoseFree(180)]);
    event.dishes[0].ingredients[0].text = "Finnish lactose-free milk without nuts";
    let result = scaled(event);
    expect(result.needs[0].constraints).toEqual(result.scale.lines[0].constraints);
    expect(result.needs[0].constraints).toMatchObject({ claims: ["FREE_FROM_LACTOSE"], origin: "fi" });
    event.dietGroups[0].constraints.origin = "se";
    result = scaled(event);
    expect(result.scale.problems[0].ruleId).toBe("REQ-02");
  });

  it.each(["coffee:milk:event-total", "coffee:milk:regular"])("honours an explicitly removed fixed total (%s)", (removed) => {
    expect(needsFromEvent(coffee([lactoseFree(180)]), MANDATE, [removed], [])).toEqual([]);
  });

  it("keeps per-portion variants and counts separate while preserving the fixed total", () => {
    const event = coffee([lactoseFree(20)]);
    event.dishes[0].ingredients.push({ id: "portion", text: "Milk", productId: "464306", variants: { lf: "469363" }, perPortion: { amount: 1, unit: "dl" } });
    const { scale, needs } = scaled(event);
    expect(scale.problems).toEqual([]);
    expect(needs.map((need) => [need.ingredientId, need.pinnedProductId, need.amount.value])).toEqual([["milk", null, 40], ["portion", "464306", 16], ["portion", "469363", 2]]);
    expect(scale.lines.map((line) => line.total.amount)).toEqual([40, 16, 2]);
  });

  it.each(["diet", "allergen", "unknown declaration"])("keeps participating constraints enforced during matching: %s", async (kind) => {
    const event = coffee([group("restricted", 180, kind === "diet" ? { claims: ["VEGAN"] } : { avoidAllergens: ["AM"] })]);
    event.dishes[0].ingredients[0].productId = "469363";
    const need = scaled(event).needs[0];
    const product: Product = structuredClone(getProduct("469363")!);
    if (kind === "unknown declaration") { product.hasAllergenData = false; product.contains = []; product.mayContain = []; }
    const evidence = await lookup([product.id], "2026-11-16", { mode: "fixture", overlay: null });
    await rankNeed(need, [product], new Map(evidence.lines.map((line) => [line.productId, line])));
    const rules = [...need.rules, ...need.candidates.flatMap((candidate) => candidate.notes)];
    expect(rules.map((rule) => rule.ruleId)).toContain(kind === "diet" ? "DIET-01" : kind === "allergen" ? "ALG-01" : "ALG-03");
    if (kind !== "unknown declaration") expect(need.candidates).toEqual([]);
  });

  it("keeps the exact 40 L through the event matching pipeline", async () => {
    const event = coffee([lactoseFree(180)]);
    const plan = newPlan("event", { personId: "p-aino", name: "Aino" }, "banquet", { event, eventId: event.id, reviewing: true });
    await runPipeline(plan);
    expect(plan.inputRules).toEqual([]);
    expect(plan.needs).toHaveLength(1);
    expect(plan.needs[0].amount).toEqual({ value: 40, unit: "l" });
    expect(plan.lines.reduce((sum, line) => sum + line.needAmount.value, 0)).toBe(40);
  });

  async function call(method: string, path: string, body?: unknown, token?: string) {
    const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `aimo_session=${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  }

  it("saves and generates all seven wedding lines, including the exact 40 L milk", async () => {
    const { token } = await call("POST", "/session", { personId: "p-aino" });
    const initial = await call("GET", "/events/evt-wedding/menu", undefined, token);
    const event = initial.event;
    const saved = await call("PUT", "/events/evt-wedding/menu", { ...event, dietGroups: [lactoseFree(event.guests)] }, token);
    expect(saved.status).toBe(200);
    expect(saved.scale.lines).toHaveLength(7);
    const generated = await call("POST", "/events/evt-wedding/menu/order", { version: saved.event.version }, token);
    expect(generated.status).toBe(200);
    expect(generated.plan.request.lines).toHaveLength(7);
    expect(generated.plan.request.lines.find((line: any) => line.query === "milk")).toMatchObject({ quantity: { amount: 40, unit: "l" }, constraints: { claims: ["FREE_FROM_LACTOSE"] } });
    expect(generated.plan.needs.find((need: any) => need.query === "milk").amount).toEqual({ value: 40, unit: "l" });
  });

  it("stops both menu generation and event ordering with the same allocation question", async () => {
    const event = coffee([lactoseFree(20)]);
    event.dishes[0].ingredients[0].variants = { lf: "469363" };
    const quote = vi.spyOn(gw, "quote");
    const order = vi.spyOn(gw, "order");
    const { token } = await call("POST", "/session", { personId: "p-aino" });
    const initial = await call("GET", "/events/evt-wedding/menu", undefined, token);
    const saved = await call("PUT", "/events/evt-wedding/menu", { ...event, version: initial.event.version }, token);
    const generated = await call("POST", "/events/evt-wedding/menu/order", { version: saved.event.version }, token);
    expect(generated.status).toBe(422);
    expect(generated.problems).toEqual(saved.scale.problems);
    const plan = newPlan("event", { personId: "p-aino", name: "Aino" }, "banquet", { event, eventId: event.id, reviewing: true });
    await quoteAndDecide(plan);
    expect(plan.status).toBe("needs_input");
    expect(plan.inputRules).toEqual(generated.problems);
    expect(plan.summary).toMatch(/Split the fixed 40 l total/);
    expect(quote).not.toHaveBeenCalled();
    expect(order).not.toHaveBeenCalled();
  });
});
