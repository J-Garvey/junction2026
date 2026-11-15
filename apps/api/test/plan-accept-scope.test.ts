import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { getDb } = await import("../src/db.js");
const { getPerson, resolveToken } = await import("../src/identity.js");
const { HOTEL_AGENT_TOKEN } = await import("../src/seed.js");
const { createQuote, placeOrder, listOrders } = await import("../src/gateway/service.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { mandate } = await import("../src/agent/plan.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { lookup, normalise } = await import("../src/aimo/lookup.js");

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
function storedState() {
  return Object.fromEntries(["plans", "quotes", "orders", "approvals", "questions", "audit"].map((table) =>
    [table, getDb().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}
async function proposal() {
  const request = { ...rulesParse("10 kg salmon"), siteId: mandate().sites[0].id, outletId: "banquet", neededBy: "2026-11-16" };
  const result = await call("POST", "/requests", { request });
  expect(result.status).toBe(200);
  expect(result.plan.error).toBeNull();
  expect(result.plan).toMatchObject({ proposal: true, outletId: "banquet", eventId: null, orderIds: [] });
  return result.plan;
}

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server.close());
beforeEach(async () => {
  await call("POST", "/reset");
  await signIn("p-aino");
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  const fixture = await lookup(["462150", "469672"], "2026-11-16", { mode: "fixture", overlay: null });
  // Bound the shortlist to saved salmon terms; other products are explicitly unavailable.
  // Exercise real gateway storage and commit checks in process, without a second
  // loopback connection. Only the shortlist's unavailable products are mocked.
  vi.spyOn(gw, "lookup").mockImplementation(async (ids) => ({ ...fixture, lines: ids.map((id) => fixture.lines.find((line) => line.productId === id) ?? normalise(id, {}, {}, "fixture", "unavailable scope-test fixture", "2026-11-14T10:00:00Z")) }));
  const agent = resolveToken(HOTEL_AGENT_TOKEN)!;
  vi.spyOn(gw, "quote").mockImplementation((body) => createQuote(agent, body));
  vi.spyOn(gw, "order").mockImplementation(async (quoteId, idemKey, approvalId, continueWith, decidedBy) =>
    (await placeOrder(agent, quoteId, idemKey, approvalId, undefined, { continueWith, decidedBy })).order);
  vi.spyOn(gw, "orders").mockImplementation(async (eventId) => ({ orders: listOrders(mandate().hotelId, eventId) }));
});
afterEach(() => vi.restoreAllMocks());

describe("standalone proposal acceptance scope", () => {
  it("keeps shared reads but rejects a bar-only person's accept and replacement without side effects (R05-01)", async () => {
    const plan = await proposal();
    await signIn("p-mikko");
    expect((await call("GET", `/plans/${plan.id}`)).status).toBe(200);
    const before = storedState();
    const quote = vi.mocked(gw.quote).mockClear();
    const order = vi.mocked(gw.order).mockClear();
    const approve = vi.spyOn(gw, "approve");
    vi.mocked(gw.lookup).mockClear();
    for (const [path, body] of [
      ["accept", {}],
      ["choose", { needId: plan.needs[0].id, productId: plan.lines[0].productId }],
    ] as const) {
      const denied = await call("POST", `/plans/${plan.id}/${path}`, body);
      expect(denied.status).toBe(403);
      expect(denied.error).toMatch(/outside your hotel or outlet scope/);
      expect(storedState()).toEqual(before);
    }
    expect(gw.lookup).not.toHaveBeenCalled();
    expect(quote).not.toHaveBeenCalled();
    expect(order).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });

  it("rejects acceptance for a different hotel even with hotel-wide authority", async () => {
    const plan = await proposal();
    const outsider = { ...getPerson("p-sanna")!, id: "p-other-hotel", hotelId: "other-hotel" };
    getDb().prepare("INSERT INTO people (id, json) VALUES (?, ?)").run(outsider.id, JSON.stringify(outsider));
    await signIn(outsider.id);
    const before = storedState();
    expect((await call("POST", `/plans/${plan.id}/accept`)).status).toBe(403);
    expect(storedState()).toEqual(before);
  });

  it.each(["p-aino", "p-sanna"])("preserves acceptance and one mock order for authorized %s", async (personId) => {
    const plan = await proposal();
    if (personId === "p-sanna") {
      const person = { ...getPerson(personId)!, outlets: [] };
      getDb().prepare("UPDATE people SET json = ? WHERE id = ?").run(JSON.stringify(person), personId);
    }
    await signIn(personId);
    const accepted = await call("POST", `/plans/${plan.id}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.plan).toMatchObject({ proposal: false, status: "ordered", overrides: { accepted: true } });
    expect(accepted.plan.orderIds).toHaveLength(1);
    expect((await call("GET", "/orders")).orders).toHaveLength(1);
    expect((await call("POST", `/plans/${plan.id}/accept`)).status).toBe(409);
    expect((await call("GET", "/orders")).orders).toHaveLength(1);
  });
});
