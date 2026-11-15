import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { SingleLine } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { loadFixture } = await import("../src/aimo/lookup.js");

let server: Server;
let base = "";
let cookie = "";
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ...await response.json() };
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  // Initial catalogue matching can outlast the default idle socket timeout on a busy devbox.
  server.keepAliveTimeout = 60_000;
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(async () => {
  await call("POST", "/reset");
  cookie = `aimo_session=${(await call("POST", "/session", { personId: "p-aino" })).token}`;
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
});

async function chooseMilk(text = "10 l lactose-free milk") {
  const { request } = await call("POST", "/messages", { text });
  const started = await call("POST", "/requests", { eventId: "evt-wedding", reviewing: true, itemReview: true, request: { ...request, neededBy: "2026-11-20" } });
  expect(started.status).toBe(200);
  const chosen = await call("POST", `/plans/${started.plan.id}/choose`, { needId: started.plan.needs[0].id, productId: "464401" });
  expect(chosen.status).toBe(200);
  expect(chosen.plan.lines[0]).toMatchObject({ productId: "464401", quantity: 10, lineTotal: 11 });
  return chosen.plan;
}
async function approve(plan: any, index = 0) {
  const item = plan.itemReviews[index];
  return call("POST", `/plans/${plan.id}/items/${item.needId}/approve`, { fingerprint: item.fingerprint });
}
async function requote(plan: any, edit: Partial<SingleLine>) {
  return call("POST", `/plans/${plan.id}/requote`, { request: { ...plan.request, lines: [{ ...plan.request.lines[0], ...edit }] } });
}

describe("explicit product choices on requote", () => {
  it.each([
    { amount: 20, unit: "l" as const },
    { amount: 200, unit: "dl" as const },
  ])("keeps chosen skimmed milk for $amount $unit, reprices it and requires approval again", async (quantity) => {
    const plan = await chooseMilk();
    const approved = await approve(plan);
    expect(approved.status).toBe(200);
    expect(approved.plan.itemReviews[0].approvedBy).toBe("Aino");

    const checked = await requote(approved.plan, { quantity });
    expect(checked.status).toBe(200);
    expect(checked.plan.overrides.chosen).toEqual([`${plan.needs[0].id}:464401`]);
    expect(checked.plan.lines).toHaveLength(1);
    expect(checked.plan.lines[0]).toMatchObject({ productId: "464401", quantity: 20, unitPrice: 1.1, lineTotal: 22, needAmount: { value: 20, unit: "l" }, stock: { kind: "unknown" } });
    expect(checked.plan.totalExVat).toBe(22);
    expect(checked.plan.itemReviews[0]).toMatchObject({ requiresApproval: true, approvedAt: null, approvedBy: null });
    expect(checked.plan.itemReviews[0].fingerprint).not.toBe(approved.plan.itemReviews[0].fingerprint);
    expect((await approve(approved.plan)).status).toBe(409);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
    const reapproved = await approve(checked.plan);
    expect(reapproved.status).toBe(200);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(200);
  });

  it("retains a choice and its approval when the complete line and terms are unchanged", async () => {
    const approved = await approve(await chooseMilk());
    const checked = await requote(approved.plan, {});
    expect(checked.status).toBe(200);
    expect(checked.plan.lines[0].productId).toBe("464401");
    expect(checked.plan.itemReviews[0]).toEqual(approved.plan.itemReviews[0]);
  });

  it("follows need IDs across reordered lines while preserving the unchanged row's approval", async () => {
    const milkApproved = await approve(await chooseMilk("10 l lactose-free milk, 10 kg salmon"));
    const approved = await approve(milkApproved.plan, 1);
    expect(approved.status).toBe(200);
    const [milk, salmon] = approved.plan.request.lines;
    const checked = await call("POST", `/plans/${approved.plan.id}/requote`, { request: { ...approved.plan.request, lines: [salmon, { ...milk, quantity: { amount: 20, unit: "l" } }] } });
    expect(checked.status).toBe(200);
    expect(checked.plan.lines.find((line: any) => line.needIds.includes(milk.id))).toMatchObject({ productId: "464401", quantity: 20, lineTotal: 22 });
    expect(checked.plan.itemReviews.find((item: any) => item.needId === milk.id).approvedAt).toBeNull();
    expect(checked.plan.itemReviews.find((item: any) => item.needId === salmon.id)).toEqual(approved.plan.itemReviews[1]);
  });

  it.each<[string, Partial<SingleLine>]>([
    ["request text", { text: "10 l lactose-free coffee milk" }],
    ["query", { query: "coffee milk" }],
    ["product type", { productType: "coffee milk" }],
    ["category", { category: "10401" }],
    ["pinned product", { productId: "469363" }],
    ["diet", { constraints: { claims: ["VEGAN"], avoidAllergens: [], labels: [] } }],
    ["allergens", { constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: ["AM"], labels: [] } }],
    ["incompatible unit", { quantity: { amount: 20, unit: "kg" } }],
    ["line identity", { id: "different-need" }],
  ])("drops the old choice after changing %s", async (_name, edit) => {
    const approved = await approve(await chooseMilk());
    const checked = await requote(approved.plan, edit);
    expect(checked.status).toBe(200);
    expect(checked.plan.overrides.chosen).toEqual([]);
    expect(checked.plan.itemReviews[0].approvedAt).toBeNull();
    if (_name === "diet" || _name === "allergens") {
      expect(checked.plan.lines.every((line: any) => line.productId !== "464401")).toBe(true);
    }
  });

  it("rechecks the selected product's current price instead of reusing its old terms", async () => {
    const approved = await approve(await chooseMilk());
    const fixture = loadFixture("base")!;
    const original = structuredClone(fixture.price["464401"]);
    try {
      fixture.price["464401"].catalogPrice.value = 2.2;
      fixture.price["464401"].comparisonPrice.value = 2.2;
      const checked = await requote(approved.plan, { quantity: { amount: 20, unit: "l" } });
      expect(checked.status).toBe(200);
      expect(checked.plan.lines[0]).toMatchObject({ productId: "464401", quantity: 20, unitPrice: 2.2, lineTotal: 44 });
      expect(checked.plan.itemReviews[0].approvedAt).toBeNull();
      expect((await approve(approved.plan)).status).toBe(409);
    } finally {
      fixture.price["464401"] = original;
    }
  });

  it("does not keep selecting a previously chosen product whose delivery becomes unavailable", async () => {
    const approved = await approve(await chooseMilk());
    const fixture = loadFixture("base")!;
    const original = structuredClone(fixture.availability["464401"]);
    try {
      fixture.availability["464401"].scheduleLines = [];
      const checked = await requote(approved.plan, { quantity: { amount: 20, unit: "l" } });
      expect(checked.status).toBe(200);
      expect(checked.plan.needs[0].candidates.every((candidate: any) => candidate.productId !== "464401")).toBe(true);
      expect(checked.plan.lines.every((line: any) => line.productId !== "464401")).toBe(true);
      expect(checked.plan.itemReviews[0].approvedAt).toBeNull();
      expect((await approve(approved.plan)).status).toBe(409);
    } finally {
      fixture.availability["464401"] = original;
    }
  });

  it("refreshes the chosen product's stock at the edited quantity", async () => {
    const approved = await approve(await chooseMilk());
    const fixture = loadFixture("base")!;
    const original = structuredClone(fixture.availability["464401"]);
    try {
      fixture.availability["464401"].scheduleLines[0].availableAmount = 15;
      const checked = await requote(approved.plan, { quantity: { amount: 20, unit: "l" } });
      expect(checked.status).toBe(200);
      expect(checked.plan.lines[0]).toMatchObject({ productId: "464401", quantity: 20, stock: { kind: "known", amount: 15 } });
      expect(checked.plan.itemReviews[0].approvedAt).toBeNull();
      expect((await approve(approved.plan)).status).toBe(409);
    } finally {
      fixture.availability["464401"] = original;
    }
  });

  it("blocks an edited request after its supplier cutoff expires", async () => {
    const approved = await approve(await chooseMilk());
    await call("POST", "/clock", { time: "2026-11-20T10:00:00Z" });
    const checked = await requote(approved.plan, { quantity: { amount: 20, unit: "l" } });
    expect(checked.status).toBe(200);
    expect(checked.plan.itemReviews[0]).toMatchObject({ canApprove: false, approvedAt: null });
    expect((await approve(checked.plan)).status).toBe(409);
    expect((await call("POST", `/plans/${approved.plan.id}/basket`)).status).toBe(409);
  });
});
