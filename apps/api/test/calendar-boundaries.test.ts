import { beforeEach, describe, expect, it } from "vitest";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
const { rulesParse, resolveDate, checkSingle } = await import("../src/agent/parse.js");
const { seedReset, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { resolveToken } = await import("../src/identity.js");
const { createQuote } = await import("../src/gateway/service.js");
beforeEach(() => { seedReset(); setClock({ time: "2026-11-14T10:00:00Z" }); });

describe("calendar dates must exist before a delivery can be offered", () => {
  it.each(["2027-02-30", "2027-13-01", "2026-02-29", "31 Feb"])("clarifies impossible date %s (AUD-MAIN-012)", (date) => {
    expect(resolveDate(date).date).toBeNull();
    expect(rulesParse(`10 kg salmon by ${date}`).neededBy).toBeNull();
  });

  it("does not discard the request's invalid date text", () => {
    expect(resolveDate("2027-02-30")).toEqual({ date: null, text: "2027-02-30" });
  });

  it("asks again if an edited structured request contains an impossible date", () => {
    const request = { ...rulesParse("10 kg salmon"), siteId: "site-aurora", outletId: "banquet", neededBy: "2027-02-30" };
    expect(checkSingle(request)).toContainEqual(expect.objectContaining({ ruleId: "REQ-03" }));
  });

  it("rejects an impossible gateway delivery date before supplier lookup", async () => {
    await expect(createQuote(resolveToken(OUTSIDE_AGENT_TOKEN)!, {
      siteId: "site-aurora", deliveryDate: "2027-02-30", lines: [{ productId: "469363", quantity: 1, outletId: "banquet" }],
    })).rejects.toMatchObject({ status: 400, body: { error: "invalid" } });
  });

  it("keeps a valid leap-day date", () => {
    expect(resolveDate("2028-02-29").date).toBe("2028-02-29");
  });
});
