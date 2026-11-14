/** Order baskets: create one, add a request to it, and see the request's order and questions under it. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");

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

describe("order baskets", () => {
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

    const m = await call("POST", "/messages", { text: "I need 1,000 litres of lactose-free milk by Monday" });
    const r = await call("POST", "/requests", { request: { ...m.request, neededBy: "2026-11-20" }, eventId: id });
    expect(r.plan.eventId).toBe(id);

    const view = await call("GET", `/baskets/${id}`);
    expect(view.requests.map((p: any) => p.id)).toEqual([r.plan.id]);
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
});
