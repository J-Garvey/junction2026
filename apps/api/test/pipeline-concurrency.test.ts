import { afterEach, describe, expect, it, vi } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { newPlan, runPipeline } = await import("../src/agent/plan.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { loadFixture, normalise } = await import("../src/aimo/lookup.js");
const matching = await import("../src/agent/match.js");
afterEach(() => vi.restoreAllMocks());

describe("large order ranking", () => {
  it("ranks four needs at a time while preserving every need and one combined supplier lookup", async () => {
    seedReset();
    setClock({ time: "2026-11-14T10:00:00Z" });
    const fixture = loadFixture("base")!;
    const line = normalise("469672", fixture.availability["469672"], fixture.price["469672"], "fixture", fixture.name, "2026-11-14T10:00:00Z");
    const lookup = vi.spyOn(gw, "lookup").mockResolvedValue({ lines: [line], fallback: null });
    const originalRank = matching.rankNeed;
    let active = 0, maximum = 0;
    const started: string[] = [];
    const release: (() => void)[] = [];
    const rank = vi.spyOn(matching, "rankNeed").mockImplementation(async (...args) => {
      active++;
      maximum = Math.max(maximum, active);
      started.push(args[0].id);
      if (started.length <= 4) await new Promise<void>((resolve) => { release.push(resolve); });
      try { await originalRank(...args); } finally { active--; }
    });
    const request = { ...rulesParse(Array.from({ length: 9 }, () => "1 kg salmon 469672").join("; ")), siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16" };
    const plan = newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { request, reviewing: true });
    const running = runPipeline(plan);
    await vi.waitFor(() => expect(started).toHaveLength(4));
    expect(maximum).toBe(4);
    release.toReversed().forEach((resolve) => resolve());
    await running;
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(rank).toHaveBeenCalledTimes(9);
    expect(maximum).toBe(4);
    expect(plan.needs.map((need) => need.id)).toEqual(request.lines.map((item) => item.id));
    expect(plan.needs.every((need) => need.candidates[0]?.productId === "469672")).toBe(true);
    expect(plan.lines.every((item) => item.productId === "469672")).toBe(true);
    expect(plan.lines.reduce((sum, item) => sum + item.needIds.length, 0)).toBe(9);
  });
});
