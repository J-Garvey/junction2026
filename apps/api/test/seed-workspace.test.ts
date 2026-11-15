import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { HOTEL_DEMO_IDS: ids, HOTEL_DEMO_TIME } = await import("../src/demo/hotel-data.js");
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
    try {
      for (let run = 0; run < 2; run++) {
        await fresh();
        const status = await call("/status");
        expect(status).toMatchObject({ seedProfile: { id: "hotel", version: 1 }, clock: { now: HOTEL_DEMO_TIME }, dataMode: { mode: "fixture", overlay: null }, chain: { ok: true } });
        const { baskets } = await call("/baskets");
        expect(baskets).toHaveLength(7);
        const breakfast = await receipt(ids.breakfast);
        expect(breakfast).toHaveLength(1);
        expect(verifyJwt(breakfast[0].jws, "aimo-order+jwt")).toBeTruthy();
        expect(breakfast[0].lines.every((l: any) => l.source === "fixture")).toBe(true);
        expect(breakfast[0].lines.map((l: any) => [l.productId, l.quantity])).toEqual([["460768", 4], ["460944", 2], ["460617", 1]]);
        expect(baskets.find((b: any) => b.id === ids.breakfast).confirmed).toBe(true);

        const wedding = await call("/events/evt-wedding");
        expect(wedding.event).toMatchObject({ guests: 180, orderPlanId: null, dietGroups: [] });
        expect(wedding.event.dishes.flatMap((d: any) => d.ingredients)).toHaveLength(7);
        expect(await receipt("evt-wedding")).toEqual([]);

        const { questions } = await call("/home");
        expect(questions.some((q: any) => q.eventId === ids.milk && q.type === "unknown_stock" && q.state === "open")).toBe(true);
        const milk = await call(`/baskets/${ids.milk}`);
        expect(milk.requests[0].lines[0].stock.kind).toBe("unknown");
        expect(await receipt(ids.milk)).toEqual([]);

        const blocked = await call(`/baskets/${ids.allergy}`);
        expect(blocked.requests[0].status).toBe("blocked");
        expect(blocked.requests[0].lines.flatMap((l: any) => l.rules).some((r: any) => r.ruleId === "ALG-01" && r.outcome === "block")).toBe(true);
        expect(await call(`/baskets/${ids.allergy}/submit-review`, {})).toMatchObject({ status: 409 });
        expect(await receipt(ids.allergy)).toEqual([]);

        const bar = await call(`/baskets/${ids.bar}`);
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
});
