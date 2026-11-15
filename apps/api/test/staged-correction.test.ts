import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { SingleRequest } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { getPlan, savePlan } = await import("../src/agent/plan.js");
const { loadFixture } = await import("../src/aimo/lookup.js");
const { getPerson } = await import("../src/identity.js");
const { correctBasketRequest } = await import("../src/agent/baskets.js");

let base = "", cookie = "";
let server: Server;
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, ...await r.json() };
}
async function signIn(id: string) { cookie = `aimo_session=${(await call("POST", "/session", { personId: id })).token}`; }
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
beforeEach(async () => {
  await call("POST", "/reset");
  await signIn("p-aino");
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  // Limit catalogue-wide alternatives to recorded supply evidence in this suite.
  // Missing fixture SKUs must never fall through to a live supplier request.
  const lookup = gw.lookup;
  const fixture = loadFixture("base")!;
  vi.spyOn(gw, "lookup").mockImplementation((ids, date) => lookup(ids.filter((id) => fixture.availability[id] && fixture.price[id]), date));
});
afterEach(() => vi.restoreAllMocks());

async function staged(productId = "469672", amount = 10, eventId?: string) {
  const id = eventId ?? (await call("POST", "/baskets", { name: "F10 conference", deliveryDate: "2026-11-16" })).basket.id;
  const milk = productId === "464306";
  const request = SingleRequest.parse({ kind: "single", originalText: milk ? "lactose-free milk" : "salmon", siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16", neededByText: null, parsedBy: "rules",
    lines: [{ id: "need", text: milk ? "milk" : "salmon", query: milk ? "milk" : "salmon", productId, category: null, productType: milk ? "plain drinking milk" : null, quantity: { amount, unit: milk ? "l" : "kg" }, constraints: { claims: milk ? ["FREE_FROM_LACTOSE"] : [], avoidAllergens: [], labels: [] } }],
  });
  const draft = await call("POST", "/requests", { request, eventId: id, reviewing: true, itemReview: true });
  expect(draft.status).toBe(200);
  const stage = await approveAndStage(draft.plan);
  expect(stage.status).toBe(200);
  return { id, planId: draft.plan.id };
}
async function approveAndStage(plan: any) {
  for (const item of plan.itemReviews ?? []) {
    expect(item.canApprove).toBe(true);
    if (item.requiresApproval && !item.approvedAt) expect((await call("POST", `/plans/${plan.id}/items/${item.needId}/approve`, { fingerprint: item.fingerprint })).status).toBe(200);
  }
  return call("POST", `/plans/${plan.id}/basket`);
}
async function row(id: string, planId: string) { return (await call("GET", `/baskets/${id}`)).requests.find((p: any) => p.id === planId); }
async function correct(id: string, planId: string, action: "edit" | "remove", changeToken?: string) {
  return call("POST", `/baskets/${id}/requests/${planId}/correct`, { action, changeToken: changeToken ?? (await row(id, planId)).changeToken });
}

describe("uncommitted staged corrections", () => {
  it.each([["469672", 10, 5], ["464306", 1000, 40]])("returns %s for reduction, fresh item checks and fresh finance review", async (sku, amount, reduced) => {
    const { id, planId } = await staged(String(sku), Number(amount));
    const first = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${first.id}/answer`, { optionId: "reject", note: `Reduce to ${reduced}` })).error).toBeUndefined();
    await signIn("p-aino");
    const withdrawn = await correct(id, planId, "edit");
    expect(withdrawn).toMatchObject({ status: 200, plan: { basketedAt: null, proposal: false, orderIds: [], approvalId: null } });
    expect(getPlan(planId)!.overrides.stockContinued).toEqual([]);
    expect((await row(id, planId)).basketedAt).toBeNull();
    expect((await call("POST", `/baskets/${id}/submit-review`)).status).toBe(409);
    const reviewed = await call("POST", `/plans/${planId}/review-items`);
    const request = structuredClone(reviewed.plan.request);
    request.lines[0].quantity.amount = reduced;
    const reducedPlan = await call("POST", `/plans/${planId}/requote`, { request });
    expect(reducedPlan.status).toBe(200);
    expect(reducedPlan.plan.request.lines[0].quantity.amount).toBe(reduced);
    expect(reducedPlan.plan.itemReviews.every((item: any) => !item.approvedAt)).toBe(true);
    expect((await approveAndStage(reducedPlan.plan)).status).toBe(200);
    const fresh = (await call("POST", `/baskets/${id}/submit-review`)).review;
    expect(fresh.id).not.toBe(first.id);
    expect(fresh.facts.total).toBeLessThan(first.facts.total);
    expect((await call("GET", `/baskets/${id}`)).questions.find((q: any) => q.id === first.id)).toMatchObject({ answer: "reject", answerNote: `Reduce to ${reduced}` });
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${first.id}/answer`, { optionId: "approve" })).status).toBe(409);
    expect((await call("POST", `/questions/${fresh.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    const orders = (await call("GET", `/orders?eventId=${id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].totalExVat).toBe(fresh.facts.total);
    if (sku === "464306") expect(orders[0].lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "Aino" } });
  });

  it("removes a returned request, invalidates pending finance and rejects stale retries", async () => {
    const { id, planId } = await staged();
    const kept = await staged("464306", 10, id);
    const first = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await signIn("p-sanna");
    await call("POST", `/questions/${first.id}/answer`, { optionId: "reject", note: "Remove salmon" });
    await signIn("p-aino");
    const pending = (await call("POST", `/baskets/${id}/submit-review`)).review;
    const token = (await row(id, planId)).changeToken;
    expect((await correct(id, planId, "remove", token)).status).toBe(200);
    expect((await correct(id, planId, "edit", token)).status).toBe(409);
    const basket = await call("GET", `/baskets/${id}`);
    expect(basket.requests.map((p: any) => p.id)).toEqual([kept.planId]);
    expect(basket.review).toBeNull();
    expect(basket.questions.find((q: any) => q.id === first.id).answerNote).toBe("Remove salmon");
    expect(basket.questions.find((q: any) => q.id === pending.id).state).toBe("replaced");
    expect((await call("POST", `/plans/${planId}/review-items`)).status).toBe(409);
    const fresh = await call("POST", `/baskets/${id}/submit-review`);
    expect(fresh.status).toBe(200);
    expect(fresh.review.facts.planIds).toEqual([kept.planId]);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${pending.id}/answer`, { optionId: "approve" })).status).toBe(409);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toEqual([]);
    expect((await call("POST", `/questions/${fresh.review.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    expect((await call("GET", `/orders?eventId=${id}`)).orders[0].lines.map((l: any) => l.productId)).toEqual(["464306"]);
  });

  it("invalidates a pending finance review immediately when editing, and permits removing the only pending request", async () => {
    const { id, planId } = await staged();
    const review = (await call("POST", `/baskets/${id}/submit-review`)).review;
    expect((await correct(id, planId, "edit")).status).toBe(200);
    expect((await call("GET", `/baskets/${id}`)).review).toBeNull();
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${review.id}/answer`, { optionId: "approve" })).status).toBe(409);
    await signIn("p-aino");
    expect((await correct(id, planId, "remove")).status).toBe(200);
    expect((await call("GET", `/baskets/${id}`)).requests).toEqual([]);
    expect((await call("POST", `/baskets/${id}/submit-review`)).status).toBe(409);
  });

  it("rejects wrong outlets/hotels/baskets and stale snapshots without mutation", async () => {
    const { id, planId } = await staged();
    const token = (await row(id, planId)).changeToken;
    const before = getPlan(planId)!;
    await signIn("p-mikko");
    expect((await correct(id, planId, "edit", token)).status).toBe(403);
    await expect(correctBasketRequest(id, planId, token, "remove", { ...getPerson("p-aino")!, hotelId: "other" })).rejects.toMatchObject({ status: 403 });
    await signIn("p-aino");
    const other = (await call("POST", "/baskets", { name: "Other", deliveryDate: "2026-11-16" })).basket.id;
    expect((await correct(other, planId, "edit", token)).status).toBe(404);
    expect((await correct(id, planId, "remove", "stale")).status).toBe(409);
    expect(getPlan(planId)).toEqual(before);
    const withdrawn = await correct(id, planId, "edit", token);
    const request = { ...withdrawn.plan.request, outletId: "bar" };
    expect((await call("POST", `/plans/${planId}/requote`, { request })).status).toBe(403);
  });

  it("rejects simultaneous corrections and changes during finance commit; placed items remain immutable", async () => {
    const { id, planId } = await staged();
    const token = (await row(id, planId)).changeToken;
    const results = await Promise.all([correct(id, planId, "edit", token), correct(id, planId, "remove", token)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);

    const second = await staged();
    const review = (await call("POST", `/baskets/${second.id}/submit-review`)).review;
    const secondToken = (await row(second.id, second.planId)).changeToken;
    const order = gw.order;
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((r) => { release = r; });
    const started = new Promise<void>((r) => { entered = r; });
    vi.spyOn(gw, "order").mockImplementation(async (...args) => { entered(); await barrier; return order(...args); });
    await signIn("p-sanna");
    const approval = call("POST", `/questions/${review.id}/answer`, { optionId: "approve" });
    await started;
    try {
      await signIn("p-aino");
      expect((await correct(second.id, second.planId, "remove", secondToken)).status).toBe(409);
    } finally { release(); }
    expect((await approval).error).toBeUndefined();
    const before = (await call("GET", `/orders?eventId=${second.id}`)).orders;
    expect(before).toHaveLength(1);
    for (const action of ["edit", "remove"] as const) expect((await correct(second.id, second.planId, action)).status).toBe(409);
    expect((await call("POST", `/plans/${second.planId}/requote`, { request: getPlan(second.planId)!.request })).status).toBe(409);
    expect((await call("GET", `/orders?eventId=${second.id}`)).orders).toEqual(before);
    // Even an interrupted plan-link save must not make an existing receipt editable.
    const interrupted = getPlan(second.planId)!;
    interrupted.orderIds = []; interrupted.status = "waiting";
    savePlan(interrupted);
    expect((await correct(second.id, second.planId, "remove")).status).toBe(409);
  });

  it("rejects finance while correction is in flight without recording an approval", async () => {
    const { id, planId } = await staged();
    const review = (await call("POST", `/baskets/${id}/submit-review`)).review;
    const token = (await row(id, planId)).changeToken;
    const orders = gw.orders;
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((r) => { release = r; });
    const started = new Promise<void>((r) => { entered = r; });
    vi.spyOn(gw, "orders").mockImplementationOnce(async (...args) => { entered(); await barrier; return orders(...args); });
    const correction = correct(id, planId, "edit", token);
    await started;
    try {
      await signIn("p-sanna");
      expect((await call("POST", `/questions/${review.id}/answer`, { optionId: "approve" })).status).toBe(409);
      expect((await call("GET", `/questions/${review.id}`)).question).toMatchObject({ state: "open", answer: null });
    } finally { release(); }
    expect((await correction).status).toBe(200);
    expect((await call("GET", `/questions/${review.id}`)).question).toMatchObject({ state: "replaced", answer: null });
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toEqual([]);
  });

  it("rejects removal during requote so an older async plan cannot restore removed items", async () => {
    const { id, planId } = await staged();
    const pending = await correct(id, planId, "edit");
    const lookup = vi.mocked(gw.lookup).getMockImplementation()!;
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((r) => { release = r; });
    const started = new Promise<void>((r) => { entered = r; });
    vi.mocked(gw.lookup).mockImplementationOnce(async (...args) => { entered(); await barrier; return lookup(...args); });
    const request = structuredClone(pending.plan.request);
    request.lines[0].quantity.amount = 5;
    const recheck = call("POST", `/plans/${planId}/requote`, { request });
    await started;
    try { expect((await correct(id, planId, "remove")).status).toBe(409); }
    finally { release(); }
    expect((await recheck).status).toBe(200);
    expect((await correct(id, planId, "remove")).status).toBe(200);
    expect((await call("POST", `/plans/${planId}/requote`, { request })).status).toBe(409);
    expect((await call("GET", `/baskets/${id}`)).requests).toEqual([]);
  });
});
