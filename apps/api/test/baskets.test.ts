/** Order baskets: create one, add a request to it, and see the request's order and questions under it. */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getPlan, savePlan } = await import("../src/agent/plan.js");
const { loadFixture } = await import("../src/aimo/lookup.js");
const { matchesCurrentShortlists } = await import("../src/agent/match.js");
const { getMandate, putMandate } = await import("../src/gateway/service.js");

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

async function signIn(personId: string) {
  const session = await call("POST", "/session", { personId });
  cookie = `aimo_session=${session.token}`;
}

async function readyBasket(productId = "469672", text = "10 kg salmon") {
  await call("POST", "/reset");
  await signIn("p-aino");
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  const id = (await call("POST", "/baskets", { name: "Conference dinner", deliveryDate: "2026-11-16" })).basket.id;
  const message = await call("POST", "/messages", { text });
  const request = { ...message.request, neededBy: "2026-11-16", lines: message.request.lines.map((line: any) => ({ ...line, productId })) };
  const add = async () => {
    const { plan } = await call("POST", "/requests", { request, eventId: id, reviewing: true });
    expect((await call("POST", `/plans/${plan.id}/basket`, { continueWithWarnings: true })).status).toBe(200);
    return plan.id;
  };
  return { id, planId: await add(), add };
}

describe("order baskets", () => {
  it("routes and parses literal product searches without a model, even with a key configured", async () => {
    await signIn("p-aino");
    const previousKey = config.openai.apiKey;
    const nativeFetch = globalThis.fetch;
    const modelCalls: string[] = [];
    config.openai.apiKey = "test-key";
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (String(input).startsWith(config.openai.baseUrl)) {
        modelCalls.push(String(input));
        throw new Error("A literal product search must not wait for the model");
      }
      return nativeFetch(input, init);
    });
    try {
      for (const text of ["milk", "10 kg chicken burger", "40 l lactose-free milk"]) {
        const parsed = await call("POST", "/messages", { text });
        expect(parsed).toMatchObject({ status: 200, route: "new_request", request: { parsedBy: "rules" } });
      }
      expect(modelCalls).toEqual([]);
    } finally {
      spy.mockRestore();
      config.openai.apiKey = previousKey;
    }
  });

  it("creates a basket and attaches a request to it", async () => {
    await fetch(`${BASE}/api/reset`, { method: "POST" });
    const s = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-aino" }) });
    cookie = s.headers.get("set-cookie")!.split(";")[0];
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });

    const before = await call("GET", "/baskets");
    expect(before.baskets.length).toBeGreaterThan(0);

    const made = await call("POST", "/baskets", { name: "Sales kick-off", deliveryDate: "2026-11-20" });
    expect(made.basket).toMatchObject({ name: "Sales kick-off", deliveryDate: "2026-11-20" });
    const id = made.basket.id;
    expect((await call("GET", "/baskets")).baskets.find((b: any) => b.id === id)).toMatchObject({ lines: 0, waiting: 0, requests: 0 });

    const m = await call("POST", "/messages", { text: "10 kg salmon" });
    const r = await call("POST", "/requests", { request: { ...m.request, neededBy: "2026-11-20" }, eventId: id, reviewing: true });
    expect(r.plan.eventId).toBe(id);
    expect((await call("GET", `/baskets/${id}`)).requests).toHaveLength(0);

    const changed = { ...m.request, neededBy: "2026-11-20", lines: m.request.lines.map((line: any) => ({ ...line, productId: "469672", quantity: { amount: 20, unit: "kg" } })) };
    const requoted = await call("POST", `/plans/${r.plan.id}/requote`, { request: changed });
    expect(requoted.plan).toMatchObject({ proposal: true, eventId: id, orderIds: [] });
    expect(requoted.plan.id).toBe(r.plan.id);
    expect(requoted.plan.request.lines[0].quantity).toEqual({ amount: 20, unit: "kg" });

    const staged = await call("POST", `/plans/${r.plan.id}/basket`);
    expect(staged.status).toBe(200);
    expect(staged.plan).toMatchObject({ basketedAt: expect.any(String), summary: "In the order · awaiting final order", orderIds: [] });
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);

    const view = await call("GET", `/baskets/${id}`);
    expect(staged.basket).toEqual(expect.objectContaining({
      requests: view.requests, orders: view.orders, review: view.review, orderBy: view.orderBy, confirmed: view.confirmed,
    }));
    expect(staged.basket.orderBy).toMatchObject({ state: "known", at: "2026-11-15T15:00:00.000Z" });
    expect(view.requests.map((p: any) => p.id)).toEqual([r.plan.id]);
    expect(view.requests[0]).toMatchObject({ basketedAt: expect.any(String), lines: expect.any(Array) });
    expect((await call("GET", "/baskets")).baskets.find((basket: any) => basket.id === id).lines).toBeGreaterThan(0);
    // The request's questions belong to the basket, so they show under "Awaiting approval".
    for (const q of r.questions) expect(view.questions.map((x: any) => x.id)).toContain(q.id);

    expect((await call("POST", "/requests", { request: m.request, eventId: "evt_nope" })).status).toBe(404);
    expect((await call("POST", "/baskets", { name: "", deliveryDate: "2026-11-20" })).status).toBeGreaterThanOrEqual(400);
  });

  it("a passed Monday cut-off doesn't make a later order too late (DLV-06)", async () => {
    // Tuesday evening: every Monday cut-off the mock returns has passed.
    await call("POST", "/clock", { time: "2026-11-17T18:00:00Z" });
    const id = (await call("POST", "/baskets", { name: "Birthday", deliveryDate: "2026-11-30" })).basket.id;
    const m = await call("POST", "/messages", { text: "40 l lactose-free milk" });
    const r = await call("POST", "/requests", { request: { ...m.request, neededBy: "2026-11-30" }, eventId: id });
    expect(r.plan.tooLate).toBeNull();
    expect(r.plan.needs[0].rules.map((x: any) => x.ruleId)).not.toContain("DLV-06");
  });

  it("distinguishes an unknown product ID from a search with no matching product", async () => {
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const id = (await call("POST", "/baskets", { name: "Search failures", deliveryDate: "2026-11-20" })).basket.id;
    const m = await call("POST", "/messages", { text: "10 kg salmon" });

    const unknown = await call("POST", "/requests", {
      request: { ...m.request, neededBy: "2026-11-20", lines: m.request.lines.map((line: any) => ({ ...line, productId: "999999" })) },
      eventId: id,
      reviewing: true,
    });
    expect(unknown.plan.summary).toBe("Product not found. Refine the search and try again.");
    expect(unknown.plan.needs[0].rules.map((rule: any) => rule.ruleId)).toContain("REQ-04");

    const noMatch = await call("POST", "/requests", {
      request: { ...m.request, neededBy: "2026-11-20", lines: m.request.lines.map((line: any) => ({ ...line, query: "zzzz-no-such-product", category: "99999", productId: null })) },
      eventId: id,
      reviewing: true,
    });
    expect(noMatch.plan.summary).toBe("No matching product found. Refine the search and try again.");
    expect(noMatch.plan.needs[0].rules.map((rule: any) => rule.ruleId)).toContain("DIET-04");
  });

  it("does not propose the screenshot's NoChicken product for a chicken burger request", async () => {
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const basket = await call("POST", "/baskets", { name: "Chicken burgers", deliveryDate: "2026-11-16" });
    const m = await call("POST", "/messages", { text: "10 pcs chicken burger by Monday" });
    expect(m.request.lines[0].query).toBe("chicken burger");
    const r = await call("POST", "/requests", { request: m.request, eventId: basket.basket.id, reviewing: true });
    expect(r.status).toBe(200);
    expect(r.plan.needs[0].candidates.length).toBeGreaterThan(0);
    expect(r.plan.needs[0].candidates.map((p: any) => p.productId)).not.toContain("469770");
    expect(r.plan.lines.some((l: any) => /NoChicken|vegetarian/i.test(l.productName))).toBe(false);
    expect(r.plan.orderIds).toEqual([]);

    // A proposal saved by the old matcher (or still open during an upgrade) must
    // not let the stale NoChicken selection through when the chef clicks Add.
    const stale = getPlan(r.plan.id)!;
    stale.lines[0].productId = "469770";
    savePlan(stale);
    const staged = await call("POST", `/plans/${stale.id}/basket`, { continueWithWarnings: true });
    expect(staged.status).toBe(409);
    expect(staged.error).toBe("The product matches changed. Review this request again before adding it.");
    expect(getPlan(stale.id)!.basketedAt).toBeFalsy();

    // Also reject baskets staged by the old matcher before this safeguard existed.
    stale.basketedAt = "2026-11-14T10:00:00Z";
    stale.proposal = false;
    stale.reviewing = false;
    savePlan(stale);
    const submitted = await call("POST", `/baskets/${basket.basket.id}/submit-review`);
    expect(submitted.status).toBe(409);
    expect(submitted.message).toBe("The product matches changed. Ask the order builder to review the selected products.");
    expect((await call("GET", `/orders?eventId=${basket.basket.id}`)).orders).toEqual([]);
  });

  it("submits and orders a saved Monster selection after its original shorthand stops auto-matching", async () => {
    // Synthetic supplier terms: this regression tests the saved selection, not live stock.
    const fixture = loadFixture("base")!;
    fixture.availability["477529"] = { productId: "477529", salesBlock: false, logisticModel: "Stock", closingTime: "2026-11-15T17:00:00+0200", scheduleLines: [{ salesBlock: false, availableAmount: 100, availableDate: "2026-11-16", salesUnit: "KI" }] };
    fixture.price["477529"] = { ...fixture.price["469672"], productId: "477529", catalogPrice: { ...fixture.price["469672"].catalogPrice, value: 56.27 } };
    const { id, planId } = await readyBasket("477529", "1 pcs Monster Energy energy drink");
    // Reproduce a basket accepted by the old build with the exact product already shown.
    const saved = getPlan(planId)!;
    saved.request!.lines[0].query = "monster";
    saved.request!.lines[0].productId = null;
    saved.needs[0].query = "monster";
    saved.needs[0].pinnedProductId = null;
    savePlan(saved);
    expect(matchesCurrentShortlists(saved.needs, saved.lines)).toBe(false);

    const submitted = await call("POST", `/baskets/${id}/submit-review`);
    expect(submitted.status).toBe(200);
    expect(submitted.review.facts.lines).toMatchObject([{ productId: "477529", quantity: 1, lineTotal: 56.27 }]);
    expect((await call("POST", `/baskets/${id}/submit-review`)).review.id).toBe(submitted.review.id);
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    const orders = (await call("GET", `/orders?eventId=${id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toMatchObject([{ productId: "477529", quantity: 1, lineTotal: 56.27 }]);
    await signIn("p-aino");
  });

  it("leaves a missing qualified product unresolved and refuses to add it to a basket", async () => {
    const basket = await call("POST", "/baskets", { name: "Missing brand", deliveryDate: "2026-11-16" });
    const m = await call("POST", "/messages", { text: "10 l unlistedbrand milk by Monday" });
    expect(m.request.lines[0]).toMatchObject({ query: "unlistedbrand milk", category: "10400" });
    const r = await call("POST", "/requests", { request: m.request, eventId: basket.basket.id, reviewing: true });
    expect(r.plan.summary).toBe("No matching product found. Refine the search and try again.");
    expect(r.plan.needs[0].candidates).toEqual([]);
    expect(r.plan.lines.every((l: any) => l.productId === null)).toBe(true);
    expect((await call("POST", `/plans/${r.plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);
    expect(r.plan.orderIds).toEqual([]);
  });

  it("lets the chef add unconfirmed stock after explicitly accepting the warning", async () => {
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const id = (await call("POST", "/baskets", { name: "Stock warning", deliveryDate: "2026-11-20" })).basket.id;
    const m = await call("POST", "/messages", { text: "1000 l lactose-free milk" });
    const r = await call("POST", "/requests", { request: { ...m.request, neededBy: "2026-11-20", lines: m.request.lines.map((l: any) => ({ ...l, productId: "464306" })) }, eventId: id, reviewing: true });

    expect(r.plan.proposal).toBe(true);
    expect(r.plan.lines.some((line: any) => line.rules.some((rule: any) => rule.ruleId === "STK-01"))).toBe(true);
    expect((await call("POST", `/plans/${r.plan.id}/basket`)).status).toBe(409);

    const staged = await call("POST", `/plans/${r.plan.id}/basket`, { continueWithWarnings: true });
    expect(staged.status).toBe(200);
    expect(staged.plan.basketedAt).toEqual(expect.any(String));
    expect(staged.plan.overrides.stockContinued).toContain(staged.plan.lines[0].productId);
    expect(staged.plan.overrides.stockDecidedBy).toBe("Aino");
  });

  it("reviews mixed items independently, retaining a replacement while another row is refined or discarded", async () => {
    await call("POST", "/reset");
    await signIn("p-aino");
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const id = (await call("POST", "/baskets", { name: "Mixed products", deliveryDate: "2026-11-30" })).basket.id;
    const parsed = await call("POST", "/messages", { text: "10 l lactose-free milk, 3 pcs zzzz-no-such-product" });
    const request = { ...parsed.request, neededBy: "2026-11-30" };
    const result = await call("POST", "/requests", { request, eventId: id, reviewing: true });
    expect(result.plan.status).toBe("blocked");
    expect(result.plan.request.lines).toHaveLength(2);
    const [milk, missing] = request.lines;
    const milkNeed = result.plan.needs.find((need: any) => need.id === milk.id);
    const replacement = milkNeed.candidates[1];
    expect(replacement).toBeDefined();

    // An unrelated missing item must not prevent choosing a replacement for milk.
    const chosen = await call("POST", `/plans/${result.plan.id}/choose`, { needId: milk.id, productId: replacement.productId });
    expect(chosen.status).toBe(200);
    expect(chosen.plan.needs.find((need: any) => need.id === milk.id).candidates[0].productId).toBe(replacement.productId);
    expect((await call("POST", `/plans/${result.plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);

    const salmon = (await call("POST", "/messages", { text: "3 kg salmon" })).request.lines[0];
    const refined = { ...request, lines: [milk, { ...salmon, id: missing.id }] };
    const checked = await call("POST", `/plans/${result.plan.id}/requote`, { request: refined });
    expect(checked.status).toBe(200);
    expect(checked.plan.request.lines[0]).toEqual(milk);
    expect(checked.plan.needs.find((need: any) => need.id === milk.id).candidates[0].productId).toBe(replacement.productId);
    expect(checked.plan.lines.some((line: any) => line.needIds.includes(missing.id) && line.productId)).toBe(true);

    const discarded = await call("POST", `/plans/${result.plan.id}/requote`, { request: { ...refined, lines: [milk] } });
    expect(discarded.status).toBe(200);
    expect(discarded.plan.needs.map((need: any) => need.id)).toEqual([milk.id]);
    expect(discarded.plan.lines.every((line: any) => !line.needIds.includes(missing.id))).toBe(true);
    expect(discarded.plan.needs[0].candidates[0].productId).toBe(replacement.productId);
    expect(discarded.plan.totalExVat).toBeCloseTo(discarded.plan.lines.reduce((sum: number, line: any) => sum + line.lineTotal, 0));
    expect((await call("POST", `/plans/${result.plan.id}/basket`, { continueWithWarnings: true })).status).toBe(200);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toEqual([]);
  });

  it("resets a row's replacement when that row changes", async () => {
    const parsed = await call("POST", "/messages", { text: "10 l lactose-free milk" });
    const request = { ...parsed.request, neededBy: "2026-11-30" };
    const result = await call("POST", "/requests", { request, reviewing: true });
    const need = result.plan.needs[0];
    const replacement = need.candidates[1];
    expect((await call("POST", `/plans/${result.plan.id}/choose`, { needId: need.id, productId: replacement.productId })).status).toBe(200);
    const changed = { ...request, lines: request.lines.map((line: any) => ({ ...line, quantity: { amount: 20, unit: "l" } })) };
    const checked = await call("POST", `/plans/${result.plan.id}/requote`, { request: changed });
    expect(checked.status).toBe(200);
    expect(getPlan(result.plan.id)!.overrides.chosen).toEqual([]);
    expect(checked.plan.request.lines[0].quantity.amount).toBe(20);
  });

  it("too late: removed from the quote, or kept in the order for review", async () => {
    await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const id = (await call("POST", "/baskets", { name: "Tomorrow lunch", deliveryDate: "2026-11-15" })).basket.id;
    const m = await call("POST", "/messages", { text: "40 l lactose-free milk" });
    const add = () => call("POST", "/requests", { request: { ...m.request, neededBy: "2026-11-15" }, eventId: id });
    const a = await add();
    expect(a.plan.tooLate).toEqual({ neededBy: "2026-11-15", earliest: "2026-11-16" });
    expect((await call("POST", `/plans/${a.plan.id}/too-late`, { choice: "remove" })).plan.tooLateChoice).toBe("removed");
    expect((await call("GET", `/baskets/${id}`)).requests).toHaveLength(0);

    const b = await add();
    await call("POST", `/plans/${b.plan.id}/too-late`, { choice: "review" });
    const view = await call("GET", `/baskets/${id}`);
    expect(view.requests).toHaveLength(1);
    expect(view.requests[0]).toMatchObject({ id: b.plan.id, tooLateChoice: "review", orderIds: [] });
  });

  it("submits one finance review, then only finance can approve and place one order", async () => {
    const { id, planId } = await readyBasket();
    const before = (await call("GET", "/baskets")).baskets.find((b: any) => b.id === id);
    expect(before).toMatchObject({ confirmed: false, approvalLevels: [], orderBy: { state: "known", at: "2026-11-15T15:00:00.000Z", usesFixtures: true } });
    const [submitted, retry] = await Promise.all([
      call("POST", `/baskets/${id}/submit-review`),
      call("POST", `/baskets/${id}/submit-review`),
    ]);
    expect(submitted.status).toBe(200);
    expect(submitted.review).toMatchObject({ type: "order_review", forRole: "approver", state: "open", eventId: id, facts: { kind: "approval", planIds: [planId] } });
    expect(retry.review.id).toBe(submitted.review.id);
    expect(submitted.basket).toMatchObject({
      event: { id }, review: { id: submitted.review.id },
      requests: [{ id: planId, basketedAt: expect.any(String) }], orderBy: before.orderBy,
    });
    expect((await call("GET", `/baskets/${id}`)).review.id).toBe(submitted.review.id);
    expect((await call("GET", "/baskets")).baskets.find((b: any) => b.id === id)).toMatchObject({ confirmed: false, approvalLevels: [{ role: "approver", count: 1 }] });
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
    expect((await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" })).status).toBe(409);

    await signIn("p-sanna");
    expect((await call("GET", "/home")).questions.filter((q: any) => q.eventId === id)).toHaveLength(1);
    const approved = await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" });
    expect(approved.error).toBeUndefined();
    expect(approved.question).toMatchObject({ state: "answered", answeredBy: { name: "Sanna" } });
    const orders = (await call("GET", `/orders?eventId=${id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].approvalId).toEqual(expect.any(String));
    expect((await call("GET", `/plans/${planId}`)).plan.orderIds).toEqual([orders[0].id]);
    expect((await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" })).status).toBe(409);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(1);
    expect((await call("GET", "/baskets")).baskets.find((b: any) => b.id === id)).toMatchObject({ lines: 1, totalExVat: orders[0].totalExVat, confirmed: true, approvalLevels: [] });
    expect(await call("GET", `/baskets/${id}`)).toMatchObject({ confirmed: true, orderBy: before.orderBy });
  });

  it("replaces the finance request when items change and combines repeated products", async () => {
    const { id, add } = await readyBasket();
    const first = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await add();
    expect((await call("GET", `/baskets/${id}`)).review).toBeNull();
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${first.id}/answer`, { optionId: "approve" })).status).toBe(409);
    await signIn("p-aino");
    const next = await call("POST", `/baskets/${id}/submit-review`);
    expect(next.status).toBe(200);
    expect(next.review.id).not.toBe(first.id);
    expect(next.review.facts.lines).toHaveLength(1);
    expect(next.review.facts.lines[0].quantity).toBe(first.facts.lines[0].quantity * 2);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
  });

  it("allows a returned order to be submitted again without placing anything", async () => {
    const { id } = await readyBasket();
    const first = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${first.id}/answer`, { optionId: "reject", note: "Reduce the salmon quantity." })).error).toBeUndefined();
    await signIn("p-aino");
    const next = await call("POST", `/baskets/${id}/submit-review`);
    expect(next.status).toBe(200);
    expect(next.review.id).not.toBe(first.id);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
  });

  it("requires a nonempty refusal note, saves it atomically, and delivers it to the builder and hotel audit", async () => {
    const { id, planId } = await readyBasket();
    const review = (await call("POST", `/baskets/${id}/submit-review`)).review;
    expect((await call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note: "Chef cannot decide" })).status).toBe(409);
    await signIn("p-sanna");
    for (const note of [undefined, "", " \n\t "]) {
      const result = await call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note });
      expect(result).toMatchObject({ status: 409, question: { state: "open", answer: null }, reason: expect.stringContaining("refusal note") });
    }
    expect((await call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note: "x".repeat(2001) })).status).toBe(422);
    const note = "Reduce the salmon quantity.\nKeep the lactose-free items.";
    const results = await Promise.all([
      call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note: `  ${note}  ` }),
      call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note: "A duplicate must not overwrite the first note" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 200).question).toMatchObject({ state: "answered", answer: "reject", answerNote: note, answeredBy: { name: "Sanna" } });
    await signIn("p-aino");
    const basket = await call("GET", `/baskets/${id}`);
    expect(basket.review).toBeNull();
    expect(basket.questions.find((q: any) => q.id === review.id)).toMatchObject({ answerNote: note, answer: "reject", facts: { lines: review.facts.lines, total: review.facts.total } });
    expect(basket.requests.find((plan: any) => plan.id === planId)).toMatchObject({ orderIds: [], basketedAt: expect.any(String) });
    const audit = await call("GET", `/audit?viewer=hotel&eventId=${id}`);
    const decisions = audit.entries.filter((entry: any) => entry.action === "question_answered" && entry.questionId === review.id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ summary: expect.stringContaining(note), visibility: "hotel", details: { option: "reject", note } });
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
  });

  it("keeps role, outlet and hotel permissions on refusals", async () => {
    const { id } = await readyBasket();
    const review = (await call("POST", `/baskets/${id}/submit-review`)).review;
    const { recordAnswer, getQuestion } = await import("../src/agent/questions.js");
    const { getPerson } = await import("../src/identity.js");
    const manager = getPerson("p-sanna")!;
    for (const person of [getPerson("p-aino")!, { ...manager, hotelScope: false }, { ...manager, hotelId: "another-hotel" }]) {
      expect(recordAnswer(review.id, person, "reject", "Please revise").ok).toBe(false);
      expect(getQuestion(review.id)).toMatchObject({ state: "open", answer: null });
    }
  });

  it("returns a review of placed items without cancelling or changing the supplier order", async () => {
    const { id } = await readyBasket();
    const first = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${first.id}/answer`, { optionId: "approve" })).error).toBeUndefined();
    const before = (await call("GET", `/orders?eventId=${id}`)).orders;
    const review = (await call("POST", `/baskets/${id}/submit-review`)).review;
    expect(review.quoteId).toBeNull();
    expect((await call("POST", `/questions/${review.id}/answer`, { optionId: "reject", note: "Check the catering plan before adding more." })).status).toBe(200);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toEqual(before);
  });

  it("does not accept refusal on a replaced or expired review, even before a basket refresh", async () => {
    const { id, add } = await readyBasket();
    const replaced = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await add();
    const current = (await call("POST", `/baskets/${id}/submit-review`)).review;
    await signIn("p-sanna");
    expect((await call("POST", `/questions/${replaced.id}/answer`, { optionId: "reject", note: "Too late" })).status).toBe(409);
    // This review expires with the 24-hour quote, before the supplier's 17:00 Helsinki cutoff.
    expect(current.deadline).toBe("2026-11-15T10:00:00.000Z");
    await call("POST", "/clock", { time: current.deadline });
    expect(await call("POST", `/questions/${current.id}/answer`, { optionId: "reject", note: "Too late" })).toMatchObject({ status: 409, question: { state: "expired", answer: null }, reason: expect.stringContaining("expired") });
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
  });

  it("refuses empty orders and rechecks expired cutoffs at finance approval", async () => {
    const { id } = await readyBasket();
    const empty = (await call("POST", "/baskets", { name: "Empty", deliveryDate: "2026-11-16" })).basket.id;
    expect((await call("POST", `/baskets/${empty}/submit-review`)).status).toBe(409);
    const submitted = await call("POST", `/baskets/${id}/submit-review`);
    await call("POST", "/clock", { time: "2026-11-15T18:00:00Z" });
    expect((await call("GET", "/baskets")).baskets.find((b: any) => b.id === id)).toMatchObject({ confirmed: false, approvalLevels: [], orderBy: { state: "expired" } });
    await signIn("p-sanna");
    const approved = await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" });
    expect(approved.status).toBe(409);
    expect(approved.error ?? approved.reason).toMatch(/expired|cut-off/i);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
    expect((await call("POST", `/baskets/${id}/submit-review`)).status).toBe(409);
  });

  it("keeps explicitly accepted unknown stock unconfirmed after finance approval", async () => {
    const { id } = await readyBasket("464306", "1000 l lactose-free milk");
    const submitted = await call("POST", `/baskets/${id}/submit-review`);
    expect(submitted.status).toBe(200);
    expect(submitted.review.facts.items.some((item: any) => /stock/i.test(item.text))).toBe(true);
    await signIn("p-sanna");
    const approved = await call("POST", `/questions/${submitted.review.id}/answer`, { optionId: "approve" });
    expect(approved.error).toBeUndefined();
    const orders = (await call("GET", `/orders?eventId=${id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "Aino" } });
    expect((await call("GET", "/baskets")).baskets.find((b: any) => b.id === id)).toMatchObject({ confirmed: false, approvalLevels: [], orderBy: { state: "known", at: "2026-11-15T15:00:00.000Z", excludedItems: 0, unconfirmedStockItems: 1, reason: expect.stringContaining("Stock is unconfirmed") } });
  });

  it.each(["quantity", "policy"])("requires a fresh builder decision when staged unknown-stock %s changes", async (change) => {
    const { id, planId } = await readyBasket("464306", "1000 l lactose-free milk");
    if (change === "quantity") {
      const plan = getPlan(planId)!;
      plan.lines[0].quantity += 1;
      savePlan(plan);
    } else {
      const policy = getMandate("hotel-aurora");
      putMandate({ ...policy, version: policy.version + 1 });
    }
    const submitted = await call("POST", `/baskets/${id}/submit-review`);
    expect(submitted.status).toBe(409);
    expect(submitted.message).toMatch(/builder.*review/i);
    expect((await call("GET", `/orders?eventId=${id}`)).orders).toHaveLength(0);
  });

  it.each([false, true])("reads matching list/detail deadlines from saved terms without supplier lookups (partial: %s)", async (partial) => {
    const { id, planId } = await readyBasket();
    if (partial) {
      // Synthetic saved terms: one dated item and one unresolved supplier snapshot.
      const saved = getPlan(planId)!;
      saved.lines.push({ ...saved.lines[0], id: "unknown-terms", productId: "unknown", availabilityEvidence: undefined });
      savePlan(saved);
    }
    const nativeFetch = globalThis.fetch;
    const lookups: string[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (/\/(lookup|availability|price)(?:\?|$)/.test(String(input))) lookups.push(String(input));
      return nativeFetch(input, init);
    });
    try {
      const card = (await call("GET", "/baskets")).baskets.find((b: any) => b.id === id);
      const detail = await call("GET", `/baskets/${id}`);
      expect(card.orderBy).toEqual(detail.orderBy);
      expect(card.orderBy.state).toBe("known");
      expect(card.orderBy.excludedItems).toBe(partial ? 1 : 0);
      expect(card.confirmed).toBe(false);
      expect(lookups).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
