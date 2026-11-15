/** Canonical defaults must survive edits so the Rules UI can compare saved values. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { MANDATE, seedReset } = await import("../src/seed.js");
const { DEFAULT_PARAMS, PARAMS } = await import("../src/rules/policy.js");
let server: Server;
let base: string;
let cookie: string;

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
beforeEach(async () => {
  seedReset();
  const res = await fetch(`${base}/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-jonas" }) });
  cookie = res.headers.get("set-cookie")!.split(";")[0];
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
async function request(method = "GET", path = "/rules", body?: unknown) {
  const res = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  expect(res.status).toBe(200);
  return res.json() as Promise<any>;
}
function values(data: any) {
  return Object.fromEntries(Object.entries(PARAMS).map(([key, def]) => [key, def.scope === "policy" ? data.policy.params[key] : key in data.mandate.preAnswers ? data.mandate.preAnswers[key] : data.mandate[key]]));
}

describe("rules response default parameters", () => {
  it("exposes every canonical policy and mandate default, including nulls and lists", async () => {
    const data = await request();
    expect(Object.keys(data.defaultParams).sort()).toEqual(Object.keys(PARAMS).sort());
    expect(data.defaultParams).toEqual({
      spendCapEur: MANDATE.spendCapEur, blockedProducts: MANDATE.blockedProducts, deliveryDays: MANDATE.deliveryDays,
      holidays: MANDATE.holidays, ...MANDATE.preAnswers, ...DEFAULT_PARAMS,
    });
    expect(values(data)).toEqual(data.defaultParams);
  });

  it("keeps defaults unchanged in the save response and fresh GET alongside saved mandate and policy values", async () => {
    const defaults = (await request()).defaultParams;
    const edit = { outcomes: { "REL-02": "ask_chef" }, params: { reliabilityAsk: 0.85, blockedProducts: ["469363"], spendCapEur: 2100, unknownStockMaxLineEur: 100, silenceFlagsValioAimo: false } };
    const saved = await request("PUT", "/rules", edit);
    for (const data of [saved, await request()]) {
      expect(data.defaultParams).toEqual(defaults);
      expect(values(data)).toMatchObject(edit.params);
      expect(data.rules.find((r: any) => r.id === "REL-02")).toMatchObject({ outcome: "ask_chef", defaultOutcome: "ask_approver" });
    }
  });

  it("resets saved policy, mandate and pre-answer values to the same advertised defaults", async () => {
    await request("PUT", "/rules", { params: { reliabilityAsk: 0.85, blockedProducts: ["469363"], holidays: [], priceRiseMaxPct: 10 } });
    const reset = await request("POST", "/rules/reset");
    expect(values(reset)).toEqual(reset.defaultParams);
    const reload = await request();
    expect(values(reload)).toEqual(reset.defaultParams);
  });
});
