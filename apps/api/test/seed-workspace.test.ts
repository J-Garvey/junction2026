import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { HOTEL_DEMO_IDS: ids, HOTEL_DEMO_TIME, HOTEL_DEMO_VERSION, HOTEL_BOOKINGS, HOTEL_REQUESTS } = await import("../src/demo/hotel-data.js");
const { scaleMenu } = await import("../src/agent/menu.js");
const { verifyJwt } = await import("../src/gateway/keys.js");
const { getDb } = await import("../src/db.js");
const { loadFixture } = await import("../src/aimo/lookup.js");

let server: Server;
let base = "";
let token = "";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, ...await res.json() };
}
async function signIn(person = "p-aino") { token = (await call("/session", { personId: person })).token; }
async function fresh() {
  expect(await call("/reset", { profile: "hotel" })).toMatchObject({ status: 200, ok: true });
  await signIn();
}
async function receipt(eventId: string) { return (await call(`/orders?eventId=${eventId}`)).orders; }

describe("populated hotel demo", () => {
  it("keeps menu quantities and dietary constraints aligned with the seeded requests", () => {
    for (const [key, lines] of Object.entries(HOTEL_REQUESTS)) {
      const booking = HOTEL_BOOKINGS.find((e) => e.id === ids[key as keyof typeof ids])!;
      const menu = scaleMenu(booking);
      expect(menu.problems).toEqual([]);
      for (const line of lines) {
        const matches = menu.lines.filter((l) => l.productId === line.productId);
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.reduce((sum, l) => sum + l.total.amount, 0)).toBeCloseTo(line.quantity!.amount);
        expect(matches.every((l) => l.total.unit === line.quantity!.unit)).toBe(true);
        for (const match of matches) {
          expect(line.constraints.claims).toEqual(expect.arrayContaining(match.constraints.claims));
          expect(line.constraints.avoidAllergens).toEqual(expect.arrayContaining(match.constraints.avoidAllergens));
          if (match.constraints.origin) expect(line.constraints.origin).toBe(match.constraints.origin);
        }
      }
    }
  });

  it("repeats without supplier or model access, with actionable states and real signed receipts", async () => {
    const nativeFetch = globalThis.fetch;
    const previousModelKey = config.openai.apiKey;
    config.openai.apiKey = "configured-but-unused-in-seed";
    const externalCalls: string[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      if (!String(input).startsWith(base + "/")) {
        externalCalls.push(String(input));
        throw new Error("The seed must run offline");
      }
      return nativeFetch(input, init);
    });
    const snapshots: unknown[] = [];
    let previousOrderId: string | undefined;
    try {
      for (let run = 0; run < 2; run++) {
        await fresh();
        const status = await call("/status");
        expect(status).toMatchObject({ seedProfile: { id: "hotel", version: HOTEL_DEMO_VERSION }, clock: { now: HOTEL_DEMO_TIME }, dataMode: { mode: "fixture", overlay: null }, chain: { ok: true } });
        const { baskets } = await call("/baskets");
        expect(baskets).toHaveLength(7);
        const breakfast = await receipt(ids.breakfast);
        expect(breakfast).toHaveLength(1);
        const consoleState = await call("/live/state");
        expect(consoleState.session).toMatchObject({ status: "idle", steps: [] });
        expect(consoleState.feed.some((entry: any) => entry.orderId === breakfast[0].id)).toBe(true);
        if (previousOrderId) expect(consoleState.feed.some((entry: any) => entry.orderId === previousOrderId)).toBe(false);
        previousOrderId = breakfast[0].id;
        expect(verifyJwt(breakfast[0].jws, "aimo-order+jwt")).toBeTruthy();
        expect(breakfast[0].lines.every((l: any) => l.source === "fixture")).toBe(true);
        expect(breakfast[0].lines.map((l: any) => [l.productId, l.quantity])).toEqual([["460768", 4], ["460944", 2], ["460617", 1]]);
        expect(baskets.find((b: any) => b.id === ids.breakfast).confirmed).toBe(true);
        expect(baskets.find((b: any) => b.id === ids.breakfast)).toMatchObject({ totalExVat: 213.28, coverage: { level: "covered", text: "Ready" } });
        expect(breakfast[0]).toMatchObject({ totalExVat: 213.28, deliveryDate: "2026-11-16" });
        const homeEvents = (await call("/home")).events;
        expect(homeEvents.find((e: any) => e.id === ids.breakfast).coverage).toEqual(baskets.find((b: any) => b.id === ids.breakfast).coverage);
        expect((await call(`/events/${ids.breakfast}`)).coverage).toEqual(baskets.find((b: any) => b.id === ids.breakfast).coverage);

        const wedding = await call("/events/evt-wedding");
        expect(wedding.event).toMatchObject({ guests: 180, orderPlanId: null, dietGroups: [], createdBy: "Aino", serviceDate: "2026-11-17", deliveryDate: "2026-11-16" });
        expect(baskets.find((b: any) => b.id === "evt-wedding")).toMatchObject({ createdBy: "Aino", deliveryDate: "2026-11-16" });
        expect(wedding.event.dishes.flatMap((d: any) => d.ingredients)).toHaveLength(7);
        expect(await receipt("evt-wedding")).toEqual([]);

        const { questions } = await call("/home");
        expect(questions.some((q: any) => q.eventId === ids.milk && q.type === "unknown_stock" && q.state === "open")).toBe(true);
        const milk = await call(`/baskets/${ids.milk}`);
        expect(milk.requests[0].lines[0].stock.kind).toBe("unknown");
        expect(await receipt(ids.milk)).toEqual([]);

        const blocked = await call(`/baskets/${ids.allergy}`);
        expect(blocked.requests[0].status).toBe("blocked");
        expect(blocked.coverage).toEqual({ level: "not_covered", text: "Blocked · 1 line" });
        expect(homeEvents.find((e: any) => e.id === ids.allergy).coverage).toEqual(blocked.coverage);
        expect(blocked.requests[0].lines.flatMap((l: any) => l.rules).some((r: any) => r.ruleId === "ALG-01" && r.outcome === "block")).toBe(true);
        expect(await call(`/baskets/${ids.allergy}/submit-review`, {})).toMatchObject({ status: 409 });
        expect(await receipt(ids.allergy)).toEqual([]);

        const bar = await call(`/baskets/${ids.bar}`);
        expect(bar.event).toMatchObject({ guests: 96, createdBy: "Mikko", createdAt: "2026-11-10T09:00:00.000Z" });
        expect(baskets.find((b: any) => b.id === ids.bar)).toMatchObject({ guests: 96, createdBy: "Mikko" });
        expect(bar.questions.some((q: any) => q.type === "order_review" && q.answer === "reject" && q.answeredBy.personId === "p-sanna" && q.answerNote.includes("head count"))).toBe(true);
        expect(await receipt(ids.bar)).toEqual([]);

        await signIn("p-sanna");
        const finance = await call(`/baskets/${ids.forum}`);
        expect(finance.review).toMatchObject({ type: "order_review", state: "open", facts: { total: 2016.02 } });
        expect(finance.review.ruleIds).toContain("MAN-01");
        expect(Date.parse(finance.review.deadline)).toBeGreaterThan(Date.parse(HOTEL_DEMO_TIME));
        expect(await receipt(ids.forum)).toEqual([]);
        snapshots.push({ baskets: baskets.map((b: any) => ({ id: b.id, total: b.totalExVat, confirmed: b.confirmed, lines: b.lines })), breakfast: breakfast[0].lines.map((l: any) => [l.productId, l.quantity, l.unitPrice]), finance: finance.review.facts.total });
      }
      expect(snapshots[0]).toEqual(snapshots[1]);
      expect(externalCalls).toEqual([]);
      // The loaded card is functional: finance signs and commits it through the gateway.
      const { review } = await call(`/baskets/${ids.forum}`);
      expect(await call(`/questions/${review.id}/answer`, { optionId: "approve" })).toMatchObject({ status: 200, ok: true });
      const orders = await receipt(ids.forum);
      expect(orders).toHaveLength(1);
      expect(verifyJwt(orders[0].jws, "aimo-order+jwt")).toBeTruthy();
      expect((await call(`/events/${ids.forum}`)).coverage).toEqual({ level: "at_risk", text: "Ready · 2 stock not confirmed" });
      expect((await call(`/baskets/${ids.forum}`)).confirmed).toBe(false);
      await call(`/questions/${review.id}/answer`, { optionId: "approve" });
      expect(await receipt(ids.forum)).toHaveLength(1);
    } finally { spy.mockRestore(); config.openai.apiKey = previousModelKey; }
  });

  it("rejects unknown presets without clearing data, and retains the original story reset", async () => {
    await fresh();
    expect(await call("/reset", { profile: "typo" })).toMatchObject({ status: 422 });
    expect((await call("/baskets")).baskets).toHaveLength(7);
    expect(await call("/reset", {})).toMatchObject({ status: 200, ok: true });
    await signIn();
    expect((await call("/baskets")).baskets).toHaveLength(1);
    expect((await call("/status")).clock.scene).toBe("1");
    expect((getDb().prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n).toBe(0);
  });

  it("checks fixture coverage before deleting an existing workspace", async () => {
    await fresh();
    const fixture = loadFixture("base")!;
    const price = fixture.price["460768"];
    delete fixture.price["460768"];
    try {
      expect(await call("/reset", { profile: "hotel" })).toMatchObject({ status: 500 });
      expect((await call("/baskets")).baskets).toHaveLength(7);
      expect(await receipt(ids.breakfast)).toHaveLength(1);
    } finally { fixture.price["460768"] = price; }
  });

  it("recovers the creator of an already-loaded reception from its original audit entry", async () => {
    await fresh();
    getDb().prepare("UPDATE events SET json = json_remove(json, '$.createdBy', '$.createdAt') WHERE id = ?").run(ids.bar);
    await signIn("p-sanna");
    expect((await call(`/baskets/${ids.bar}`)).event).toMatchObject({ guests: 96, createdBy: "Mikko", createdAt: "2026-11-10T09:00:00.000Z" });
    expect((await call("/baskets")).baskets.find((b: any) => b.id === ids.bar).createdBy).toBe("Mikko");
    expect((await call("/status")).chain.ok).toBe(true);
    await signIn("p-mikko");
    const made = await call("/baskets", { name: "New reception", deliveryDate: "2026-11-19", guests: 40 });
    await signIn("p-sanna");
    expect((await call(`/baskets/${made.basket.id}`)).event).toMatchObject({ guests: 40, createdBy: "Mikko" });
  });

  it("restores Aino and the delivery date for an older wedding without resetting saved activity", async () => {
    await fresh();
    const before = await receipt(ids.breakfast);
    const auditBefore = getDb().prepare("SELECT json FROM audit ORDER BY seq").all();
    // Older versions saved neither an author nor a delivery date on the wedding.
    getDb().prepare("UPDATE events SET json = json_remove(json, '$.createdBy', '$.createdAt', '$.deliveryDate') WHERE id = ?").run("evt-wedding");
    await signIn("p-sanna");
    for (const route of ["/events/evt-wedding", "/baskets/evt-wedding"]) {
      expect((await call(route)).event).toMatchObject({ createdBy: "Aino", createdAt: "2026-08-14T07:00:00.000Z", serviceDate: "2026-11-17", deliveryDate: "2026-11-16" });
    }
    expect((await call("/baskets")).baskets.find((b: any) => b.id === "evt-wedding")).toMatchObject({ createdBy: "Aino", deliveryDate: "2026-11-16" });
    expect(await receipt(ids.breakfast)).toEqual(before);
    expect(getDb().prepare("SELECT json FROM audit ORDER BY seq").all()).toEqual(auditBefore);
    expect((await call("/status")).chain.ok).toBe(true);
    // Preserve recorded authors and delivery terms; never borrow the viewer's name.
    getDb().prepare("UPDATE events SET json = json_set(json, '$.createdBy', 'Mikko', '$.deliveryDate', '2026-11-13') WHERE id = ?").run("evt-wedding");
    expect((await call("/events/evt-wedding")).event).toMatchObject({ createdBy: "Mikko", deliveryDate: "2026-11-13" });
    const made = await call("/baskets", { name: "Emma and Lauri's wedding", deliveryDate: "2026-11-17" });
    getDb().prepare("UPDATE events SET json = json_remove(json, '$.createdBy', '$.createdAt') WHERE id = ?").run(made.basket.id);
    expect((await call(`/baskets/${made.basket.id}`)).event.createdBy).toBe("Sanna");
  });

  it("generates the wedding menu for Monday delivery while keeping Tuesday service", async () => {
    await call("/reset", { profile: "story" });
    await signIn();
    const generated = await call("/events/evt-wedding/menu/order", { version: 1 });
    expect(generated.status).toBe(200);
    expect(generated.plan).toMatchObject({ neededBy: "2026-11-16", deliveryDate: "2026-11-16", totalExVat: 2003.37 });
    expect(generated.plan.lines.filter((l: any) => !l.removed)).toHaveLength(7);
    expect(generated.plan.lines.find((l: any) => l.productId === "477125").outletId).toBe("bar");
    expect(generated.plan.lines.filter((l: any) => l.productId !== "477125").every((l: any) => l.outletId === "banquet")).toBe(true);
    expect((await call("/events/evt-wedding")).event.serviceDate).toBe("2026-11-17");
    await signIn("p-mikko");
    expect((await call(`/plans/${generated.plan.id}`)).status).toBe(403);
    expect((await call("/requests", { request: { ...generated.plan.request, outletId: "bar" }, reviewing: true })).status).toBe(403);
  });
});
