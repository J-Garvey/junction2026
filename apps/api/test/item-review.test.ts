import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { loadFixture } = await import("../src/aimo/lookup.js");

let base = "";
let cookie = "";
let server: Server;
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ...await response.json() };
}
async function signIn(personId: string) {
  cookie = `aimo_session=${(await call("POST", "/session", { personId })).token}`;
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(async () => {
  await call("POST", "/reset");
  await signIn("p-aino");
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  // Synthetic stock and price fixture for the screenshot's product, absent from base.json.
  const fixture = loadFixture("base")!;
  fixture.availability["468445"] = { productId: "468445", salesBlock: false, logisticModel: "Stock", closingTime: "2026-11-15T17:00:00+0200", scheduleLines: [{ salesBlock: false, availableAmount: 100, availableDate: "2026-11-16", salesUnit: "KI" }] };
  fixture.price["468445"] = { ...fixture.price["469672"], productId: "468445", catalogPrice: { ...fixture.price["469672"].catalogPrice, value: 28.48 }, comparisonPrice: { ...fixture.price["469672"].comparisonPrice, value: 28.48 } };
});

async function draft(text: string, productIds: (string | null)[], date = "2026-11-20", saved = false) {
  const basket = (await call("POST", "/baskets", { name: "Item review", deliveryDate: date })).basket;
  const { request } = await call("POST", "/messages", { text });
  const response = await call("POST", "/requests", { eventId: basket.id, reviewing: !saved, itemReview: !saved,
    request: { ...request, neededBy: date, lines: request.lines.map((line: any, index: number) => ({ ...line, productId: productIds[index] })) } });
  expect(response.status).toBe(200);
  return { basket, plan: response.plan };
}
async function approve(plan: any, index: number) {
  const item = plan.itemReviews[index];
  return call("POST", `/plans/${plan.id}/items/${item.needId}/approve`, { fingerprint: item.fingerprint });
}

describe("per-item order review", () => {
  it("stages an exact match without a separate item approval", async () => {
    const { plan } = await draft("10 kg salmon", ["469672"]);
    expect(plan.itemReviews[0]).toMatchObject({ canApprove: true, requiresApproval: false, approvedAt: null });
    const staged = await call("POST", `/plans/${plan.id}/basket`);
    expect(staged.status).toBe(200);
    expect(staged.plan.basketedAt).toBeTruthy();
    expect(staged.plan.orderIds).toHaveLength(0);
  });

  it("requires approval when a replacement exactly matches a previously blocked item", async () => {
    const fixture = loadFixture("base")!;
    const originalValidity = fixture.price["469363"].catalogPrice.validTo;
    const originalStock = fixture.availability["464306"].scheduleLines[0].availableAmount;
    // Synthetic fixture: an expired original price and confirmed replacement stock.
    fixture.price["469363"].catalogPrice.validTo = "2026-11-14T00:00:00+0200";
    fixture.availability["464306"].scheduleLines[0].availableAmount = 100;
    try {
      const { plan } = await draft("5 l lactose-free milk", ["469363"]);
      expect(plan.lines[0].productId).toBe("469363");
      expect(plan.itemReviews[0].canApprove).toBe(false);
      const changed = await call("POST", `/plans/${plan.id}/choose`, { needId: plan.needs[0].id, productId: "464306" });
      expect(changed.status).toBe(200);
      expect(changed.plan.lines[0]).toMatchObject({ productId: "464306", status: "covered", packContent: { verified: true } });
      expect(changed.plan.lines[0].rules.every((rule: any) => rule.outcome === "order")).toBe(true);
      expect(changed.plan.itemReviews[0]).toMatchObject({ canApprove: true, requiresApproval: true, approvedAt: null });
      expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
      const rechecked = await call("POST", `/plans/${plan.id}/review-items`);
      expect(rechecked.plan.itemReviews[0]).toMatchObject({ requiresApproval: true, approvedAt: null });
      const approved = await approve(rechecked.plan, 0);
      expect(approved.status).toBe(200);
      expect(approved.plan.itemReviews[0].approvedBy).toBe("Aino");
      expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(200);
    } finally {
      fixture.price["469363"].catalogPrice.validTo = originalValidity;
      fixture.availability["464306"].scheduleLines[0].availableAmount = originalStock;
    }
  });

  it("resumes a visible saved proposal, stages it after review, and places it once through finance", async () => {
    const { basket, plan } = await draft("5 l lactose-free milk", ["464306"], "2026-11-20", true);
    expect((await call("GET", `/plans/${plan.id}`)).plan.itemReviews).toBeUndefined();
    expect((await call("GET", `/orders?eventId=${basket.id}`)).orders).toHaveLength(0);
    const checked = await call("POST", `/plans/${plan.id}/review-items`);
    expect(checked.status).toBe(200);
    expect(checked.plan).toMatchObject({ reviewing: false, proposal: true, orderIds: [] });
    expect((await call("GET", `/baskets/${basket.id}`)).requests.map((p: any) => p.id)).toContain(plan.id);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
    const approved = await approve(checked.plan, 0);
    expect(approved.status).toBe(200);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(200);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
    expect((await call("POST", `/plans/${plan.id}/review-items`)).status).toBe(409);
    const review = await call("POST", `/baskets/${basket.id}/submit-review`);
    expect(review.status).toBe(200);
    expect((await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" })).status).toBe(409);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" })).ok).toBe(true);
    await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" });
    const orders = (await call("GET", `/orders?eventId=${basket.id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "Aino" } });
  });

  it("resets a saved request's item approval after choosing a replacement", async () => {
    const { plan } = await draft("5 l lactose-free milk", ["469363"], "2026-11-20", true);
    const checked = await call("POST", `/plans/${plan.id}/review-items`);
    const approved = await approve(checked.plan, 0);
    const changed = await call("POST", `/plans/${plan.id}/choose`, { needId: plan.needs[0].id, productId: "464306" });
    expect(changed.status).toBe(200);
    expect(changed.plan.lines[0].productId).toBe("464306");
    expect(changed.plan.itemReviews[0].approvedAt).toBeNull();
    expect((await approve(approved.plan, 0)).status).toBe(409);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
  });

  it("binds item approval to the original supplier schedule shown in details", async () => {
    const { plan } = await draft("5 l lactose-free milk", ["469363"], "2026-11-20", true);
    const checked = await call("POST", `/plans/${plan.id}/review-items`);
    const approved = await approve(checked.plan, 0);
    const fixture = loadFixture("base")!;
    const original = structuredClone(fixture.availability["469363"]);
    try {
      // Move the original schedule and cutoff together. The supplier terms
      // the builder reviewed changed and must invalidate the approval.
      fixture.availability["469363"].scheduleLines[0].availableDate = "2026-11-17";
      fixture.availability["469363"].closingTime = "2026-11-16T17:00:00+0200";
      const result = await call("POST", `/plans/${plan.id}/basket`);
      expect(result.status).toBe(409);
      expect(result.plan.lines[0].availableDate).toBe("2026-11-17");
      expect(result.plan.lines[0].availableDate).not.toBe(approved.plan.lines[0].availableDate);
      expect(result.plan.itemReviews[0].approvedAt).toBeNull();
      expect(result.plan.lines[0].availabilityEvidence).not.toEqual(approved.plan.lines[0].availabilityEvidence);
    } finally {
      fixture.availability["469363"] = original;
    }
  });

  it("restricts saved request mutations to the outlet while permitting a manager building the order", async () => {
    const { plan } = await draft("5 l lactose-free milk", ["469363"], "2026-11-20", true);
    await signIn("p-mikko");
    for (const [path, body] of [
      ["review-items", {}], ["basket", {}], ["requote", { request: plan.request }],
      ["choose", { needId: plan.needs[0].id, productId: "464306" }],
    ] as const) expect((await call("POST", `/plans/${plan.id}/${path}`, body)).status).toBe(403);
    await signIn("p-jonas");
    const checked = await call("POST", `/plans/${plan.id}/review-items`);
    expect(checked.status).toBe(200);
    expect((await approve(checked.plan, 0)).plan.itemReviews[0].approvedBy).toBe("Jonas");
  });

  it("rechecks the duck request without inferring pieces from kilograms", async () => {
    // Explicit synthetic lookup fixture for the reported SKU; catalogue data stays unchanged.
    const fixture = loadFixture("base")!;
    fixture.availability["467139"] = { productId: "467139", salesBlock: false, logisticModel: "Stock", closingTime: "2026-11-15T17:00:00+0200", scheduleLines: [{ salesBlock: false, availableAmount: 100, availableDate: "2026-11-16", salesUnit: "KG" }] };
    fixture.price["467139"] = { ...fixture.price["469672"], productId: "467139", catalogPrice: { ...fixture.price["469672"].catalogPrice, value: 21.14 }, comparisonPrice: { ...fixture.price["469672"].comparisonPrice, value: 21.14 } };
    const { plan } = await draft("10 pcs duck", ["467139"], "2026-11-17", true);
    const checked = await call("POST", `/plans/${plan.id}/review-items`);
    expect(checked.plan.lines[0]).toMatchObject({ productId: "467139", quantity: 0, salesUnit: "KG" });
    expect(checked.plan.itemReviews[0]).toMatchObject({ canApprove: false, quantityRequired: true });
    expect((await approve(checked.plan, 0)).status).toBe(409);
    const item = checked.plan.itemReviews[0];
    const specified = await call("POST", `/plans/${plan.id}/items/${item.needId}/quantity`, { fingerprint: item.fingerprint, productId: "467139", quantity: 4 });
    expect(specified.plan.lines[0]).toMatchObject({ quantity: 4, salesUnit: "KG", lineTotal: 84.56 });
    expect((await approve(specified.plan, 0)).status).toBe(200);
  });

  it("requires decisions only for exceptions and keeps unknown stock unknown through finance and one order", async () => {
    const { basket, plan } = await draft("10 kg salmon, 5 l lactose-free milk", ["469672", "464306"]);
    expect(plan.itemReviews).toHaveLength(2);
    expect(plan.itemReviews.map((item: any) => item.requiresApproval)).toEqual([false, true]);
    expect((await call("POST", `/plans/${plan.id}/accept`)).status).toBe(409);
    const first = { plan };
    expect(first.plan.itemReviews[0].approvedAt).toBeNull();
    expect(first.plan.itemReviews[1].approvedAt).toBeNull();
    // A basket-wide bypass does not replace the remaining item's decision.
    expect((await call("POST", `/plans/${plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);
    const second = await approve(first.plan, 1);
    expect(second.status).toBe(200);
    expect((await approve(second.plan, 1)).plan.itemReviews[1].approvedAt).toBe(second.plan.itemReviews[1].approvedAt);
    const staged = await call("POST", `/plans/${plan.id}/basket`);
    expect(staged.status).toBe(200);
    expect(staged.plan.overrides.stockContinued).toContain("464306");
    const review = await call("POST", `/baskets/${basket.id}/submit-review`);
    expect(review.status).toBe(200);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" });
    const orders = (await call("GET", `/orders?eventId=${basket.id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].lines.find((line: any) => line.productId === "464306")).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "Aino" } });
  });

  it("approves a valid row while a missing row is fixed, and retains only unchanged decisions", async () => {
    const { plan } = await draft("10 kg salmon, 3 pcs zzzz-no-such-product", ["469672", null]);
    expect(plan.status).toBe("blocked");
    const first = await approve(plan, 0);
    expect(first.status).toBe(200);
    expect((await approve(first.plan, 1)).status).toBe(409);
    const request = { ...first.plan.request, lines: [first.plan.request.lines[0]] };
    const edited = await call("POST", `/plans/${plan.id}/requote`, { request });
    expect(edited.plan.itemReviews[0].approvedBy).toBe("Aino");
    const changed = { ...request, lines: [{ ...request.lines[0], quantity: { amount: 20, unit: "kg" } }] };
    const updated = await call("POST", `/plans/${plan.id}/requote`, { request: changed });
    expect(updated.plan.itemReviews[0].approvedAt).toBeNull();
    expect((await approve(edited.plan, 0)).status).toBe(409);
    expect((await approve(updated.plan, 0)).status).toBe(200);
  });

  it("asks for explicit whole sales units when the eggs pack cannot be converted, then prices and processes it", async () => {
    const { basket, plan } = await draft("30 pcs eggs", ["468445"]);
    expect(plan.lines[0]).toMatchObject({ productId: "468445", quantity: 0, packContent: null });
    expect(plan.itemReviews[0]).toMatchObject({ canApprove: false, quantityRequired: true });
    expect((await approve(plan, 0)).status).toBe(409);
    const item = plan.itemReviews[0];
    const path = `/plans/${plan.id}/items/${item.needId}/quantity`;
    const body = { fingerprint: item.fingerprint, productId: "468445", quantity: 2 };
    expect((await call("POST", path, { ...body, quantity: 0.5 })).status).toBe(422);
    const checked = await call("POST", path, body);
    expect(checked.status).toBe(200);
    expect(checked.plan.lines[0]).toMatchObject({ quantity: 2, salesUnit: "KI", lineTotal: 56.96, packContent: null });
    expect(checked.plan.itemReviews[0]).toMatchObject({ canApprove: true, quantityRequired: false, approvedAt: null });
    const approved = await approve(checked.plan, 0);
    expect(approved.status).toBe(200);
    expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(200);
    const review = await call("POST", `/baskets/${basket.id}/submit-review`);
    expect(review.status).toBe(200);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${review.review.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    expect((await call("GET", `/orders?eventId=${basket.id}`)).orders[0].lines[0]).toMatchObject({ quantity: 2, salesUnit: "KI" });
  });

  it("invalidates approval when supplier price changes and refuses expired cutoffs", async () => {
    const { plan } = await draft("10 kg salmon", ["469672"]);
    expect(plan.itemReviews[0].requiresApproval).toBe(false);
    const fixture = loadFixture("base")!;
    const original = fixture.price["469672"].catalogPrice.value;
    fixture.price["469672"].catalogPrice.value = original + 1;
    try {
      const changed = await call("POST", `/plans/${plan.id}/basket`);
      expect(changed.status).toBe(409);
      expect(changed.plan.itemReviews[0].approvedAt).toBeNull();
      expect(changed.plan.itemReviews[0].requiresApproval).toBe(true);
      expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
      expect((await approve(changed.plan, 0)).status).toBe(200);
      await call("POST", "/clock", { time: "2026-11-19T18:00:00Z" });
      expect((await approve(changed.plan, 0)).status).toBe(409);
      expect((await call("POST", `/plans/${plan.id}/basket`)).status).toBe(409);
    } finally {
      fixture.price["469672"].catalogPrice.value = original;
    }
  });

  it("never approves dietary failures or unknown product IDs", async () => {
    const { plan } = await draft("10 l vegan milk", ["464306"]);
    expect((await approve(plan, 0)).status).toBe(409);
    expect((await call("POST", `/plans/${plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);
    const missing = await draft("10 kg salmon", ["999999"]);
    expect((await approve(missing.plan, 0)).status).toBe(409);
  });

  it("requires approval again for a replacement and restricts item decisions to the outlet", async () => {
    const { plan } = await draft("5 l lactose-free milk", ["469363"]);
    const approved = await approve(plan, 0);
    await signIn("p-mikko");
    expect((await approve(approved.plan, 0)).status).toBe(403);
    await signIn("p-aino");
    const changed = await call("POST", `/plans/${plan.id}/choose`, { needId: plan.needs[0].id, productId: "464306" });
    expect(changed.status).toBe(200);
    expect(changed.plan.lines[0].productId).toBe("464306");
    expect(changed.plan.itemReviews[0].approvedAt).toBeNull();
    expect((await approve(approved.plan, 0)).status).toBe(409);
  });
});
