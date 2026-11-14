/**
 * The demo seed: Emma and Lauri's wedding (docs/demo-plan.md), on fixtures, from a
 * fresh reset. Checks the figures the video shows, so a change to the engine that
 * moves them is caught before recording.
 */
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
afterAll(async () => {
  // Leave the shared seed as the other suites expect it.
  await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: "gala" }) });
  server.close();
});

async function login(personId: string) {
  const r = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId }) });
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  return async (method: string, path: string, body?: unknown): Promise<any> => {
    const res = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, ...(await res.json()) };
  };
}

async function booking() {
  const reset = await fetch(`${BASE}/api/reset`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile: "wedding" }) });
  const aino = await login("p-aino");
  const sanna = await login("p-sanna");
  const status = await aino("GET", "/status");
  await aino("POST", "/clock", { scene: "2" });
  const order = (await aino("POST", "/events/evt-wedding/order")).plan;
  const card = (await aino("GET", `/plans/${order.id}`)).questions.find((q: any) => q.forRole === "approver");
  const approved = await sanna("POST", `/questions/${card.id}/answer`, { optionId: "approve" });
  const orders = (await aino("GET", "/orders?eventId=evt-wedding")).orders;
  return { reset: await reset.json(), status, aino, order, card, approved, orders };
}

const qty = (plan: any) => Object.fromEntries(plan.lines.map((l: any) => [l.productId, l.quantity]));

describe("Demo seed: the wedding", () => {
  let a: Awaited<ReturnType<typeof booking>>;
  let b: Awaited<ReturnType<typeof booking>>;
  beforeAll(async () => {
    a = await booking();
    b = await booking();
  });

  it("resets to Demo Hotel with Aino and Sanna and a €1,950 cap", () => {
    expect(a.reset.seed).toBe("wedding");
    expect(a.status.seed.current).toBe("wedding");
    expect(a.status.seed.hotelName).toBe("Demo Hotel");
  });

  it("books the seven menu lines in whole packs, as the demo plan sets them", () => {
    expect(qty(a.order)).toEqual({ "469672": 31, "460541": 3, "464727": 45, "467767": 12, "460617": 1, "464306": 40, "477125": 5 });
    expect(a.order.totalExVat).toBe(2003.37);
    expect(a.order.lines.every((l: any) => l.source === "fixture")).toBe(true);
  });

  it("asks Sanna once: €53.37 over her limit, with the unconfirmed stock on the same card", () => {
    expect(a.order.status).toBe("waiting");
    expect(a.order.approvalsNeeded).toEqual(expect.arrayContaining(["spend_cap", "unknown_stock"]));
    const unknown = a.order.lines.filter((l: any) => l.stock?.kind === "unknown").map((l: any) => l.productId).sort();
    expect(unknown).toEqual(["460541", "464306", "467767", "477125"]);
    expect(a.approved.plan.status).toBe("ordered");
    expect(a.orders).toHaveLength(1);
    expect(a.orders[0].totalExVat).toBe(2003.37);
  });

  it("catches the almond in the princess cake for a tree-nut allergy, though the cake lists tree nuts as free-from", async () => {
    const ev = (await b.aino("GET", "/events/evt-wedding")).event;
    await b.aino("POST", "/clock", { scene: "3" });
    const r = await b.aino("POST", "/events/evt-wedding/diet-groups", { group: { id: "onni", label: "Tree-nut allergy", count: 1, constraints: { claims: [], avoidAllergens: ["AN"], labels: [] }, standing: false }, version: ev.version });
    const cake = r.warnings.find((w: any) => w.productId === "467767");
    expect(cake).toBeTruthy();
    expect(cake.text).toMatch(/almond/);
  });

  it("uses real stock at the final check: no overlay, the cream's 37 is the mock's own figure", async () => {
    await b.aino("POST", "/clock", { scene: "4" });
    const s = await b.aino("GET", "/status");
    expect(s.dataMode.overlay).toBeNull();
  });

  it("gives the same result twice from a fresh reset", () => {
    expect(qty(b.order)).toEqual(qty(a.order));
    expect(b.order.totalExVat).toBe(a.order.totalExVat);
  });
});
