import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Need, Plan } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getProduct } = await import("../src/catalog.js");
const { lookup } = await import("../src/aimo/lookup.js");
const { rankNeed, shortlist } = await import("../src/agent/match.js");
const { needsFromSingle } = await import("../src/agent/plan.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { setClock } = await import("../src/clock.js");

let base = "";
let cookie = "";
let server: Server;
const networkFetch = globalThis.fetch;
async function call(method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  expect(response.status).toBe(200);
  return response.json();
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (!String(input).startsWith(`${base}/`)) throw new Error("This regression uses only saved fixtures and local HTTP");
    return networkFetch(input, init);
  });
});
afterAll(() => { vi.restoreAllMocks(); server.close(); });
beforeEach(async () => {
  await call("POST", "/reset");
  cookie = `aimo_session=${(await call("POST", "/session", { personId: "p-aino" })).token}`;
  await call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
});

function expectReconciled(need: Need) {
  const trace = need.selectionTrace!;
  const remaining = new Set(trace.shortlist.map((p) => p.productId));
  let removed = 0;
  for (const stage of trace.stages) for (const id of stage.removedProductIds) {
    expect(remaining.delete(id), `${id} leaves the funnel once at ${stage.key}`).toBe(true);
    removed++;
    if (stage.key !== "lookup") expect(need.excluded.some((e) => e.productId === id && e.ruleId && e.reason && e.name)).toBe(true);
  }
  expect([...remaining].sort()).toEqual(need.candidates.map((c) => c.productId).sort());
  expect(trace.shortlist).toHaveLength(removed + need.candidateCount);
}

describe("saved milk selection evidence", () => {
  it("persists the real bounded 40 L shortlist, rule removals, judgements and ranking through the API", async () => {
    const { request } = await call("POST", "/messages", { text: "40 l lactose-free milk by Monday" });
    const { plan }: { plan: Plan } = await call("POST", "/requests", { request });
    expect(plan.needs).toHaveLength(1);
    const need = plan.needs[0];
    expect(need.amount).toEqual({ value: 40, unit: "l" });
    expect(need.pinnedProductId).toBeNull();
    expect(need.selectionTrace!.shortlist).toEqual(shortlist(need, { log: false }).map((p) => ({ productId: p.id, name: p.name })));
    expectReconciled(need);
    expect(need.candidates.length).toBeGreaterThan(1);
    expect(need.candidates[0]).toMatchObject({ productId: "464306", rank: 1, stock: { kind: "unknown" }, source: "fixture", judgement: { source: "hand_checked", verdict: "yes", probability: .99 } });
    expect(plan.lines.find((l) => l.productId === "464306")?.rankStep).toBeTruthy();
    expect(plan.orderIds).toEqual([]);
    const saved = (await call("GET", `/plans/${plan.id}`)).plan;
    expect(saved.needs[0].selectionTrace).toEqual(need.selectionTrace);
  });

  it("records real product-type exclusions and counts cutoff/type overlap once", async () => {
    const need = needsFromSingle({ ...rulesParse("40 l lactose-free milk by Monday"), siteId: "site-main", outletId: "out-kitchen" })[0];
    const ids = ["464306", "462626", "463203"];
    const list = ids.map((id) => getProduct(id)!);
    const result = await lookup(ids, "2026-11-16", { mode: "fixture", overlay: null });
    const pool = new Map(result.lines.map((l) => [l.productId, l]));
    // Modified saved responses, explicitly synthetic: coffee reaches type; creamer fails cutoff and type.
    pool.set("462626", { ...pool.get("462626")!, closingTime: "2026-11-15T17:00:00+0200" });
    pool.set("463203", { ...pool.get("463203")!, deliverable: true, closingTime: "2026-11-13T17:00:00+0200" });
    await rankNeed(need, list, pool);
    expectReconciled(need);
    expect(need.excluded.filter((e) => e.productId === "463203").map((e) => e.ruleId)).toEqual(["CUT-01", "TYP-02"]);
    expect(need.selectionTrace!.stages.find((s) => s.key === "cutoff")?.removedProductIds).toEqual(["463203"]);
    expect(need.selectionTrace!.stages.find((s) => s.key === "type")?.removedProductIds).toEqual(["462626"]);
    expect(need.judgements.find((j) => j.subject === "462626")).toMatchObject({ verdict: "no", source: "hand_checked", probability: .01 });
  });

  it("records missing lookups as unevaluated and still excludes expired cutoffs", async () => {
    const need = needsFromSingle({ ...rulesParse("40 l lactose-free milk by Monday"), siteId: "site-main", outletId: "out-kitchen" })[0];
    const ids = ["464306", "469363"];
    const { lines } = await lookup(["464306"], "2026-11-16", { mode: "fixture", overlay: null });
    setClock({ time: "2026-11-16T18:00:00Z" });
    await rankNeed(need, ids.map((id) => getProduct(id)!), new Map(lines.map((l) => [l.productId, l])));
    expectReconciled(need);
    expect(need.selectionTrace!.stages.find((s) => s.key === "lookup")?.removedProductIds).toEqual(["469363"]);
    expect(need.excluded.some((e) => e.productId === "469363")).toBe(false);
    expect(need.excluded).toContainEqual(expect.objectContaining({ productId: "464306", ruleId: "CUT-01" }));
    expect(need.candidates).toEqual([]);
  });
});
