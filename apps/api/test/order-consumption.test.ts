import { beforeEach, describe, expect, it } from "vitest";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
const { seedReset, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { issueToken, resolveToken } = await import("../src/identity.js");
const { createApproval, createQuote, listOrders, placeOrder } = await import("../src/gateway/service.js");

beforeEach(() => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
});

describe("a signed quote authorizes one order", () => {
  it.each([false, true])("rejects new keys after consumption, including concurrent submissions (approval: %s)", async (needsApproval) => {
    const agent = resolveToken(OUTSIDE_AGENT_TOKEN)!;
    if (agent.kind === "valio") throw new Error("Expected hotel agent");
    const quote = await createQuote(agent, {
      siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: needsApproval
        ? [{ productId: "469363", quantity: 380, outletId: "banquet" }, { productId: "471555", quantity: 400, outletId: "banquet" }]
        : [{ productId: "469363", quantity: 5, outletId: "banquet" }],
    });
    expect(quote.mandateCheck.approvalsNeeded).toEqual(needsApproval ? ["spend_cap"] : []);
    const approver = resolveToken(issueToken({ kind: "person", personId: "p-sanna" }))!;
    const approval = needsApproval
      ? await createApproval(approver, { quoteId: quote.id, fingerprint: quote.fingerprint, grants: ["spend_cap"] })
      : undefined;
    const submissions = await Promise.allSettled(["first", "second", "third"].map((key) => placeOrder(agent, quote.id, key, approval?.id)));
    const success = submissions.filter((r) => r.status === "fulfilled");
    expect(success).toHaveLength(1);
    for (const result of submissions) if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ status: 409, body: { error: "quote_consumed" } });
    }
    const index = submissions.findIndex((r) => r.status === "fulfilled");
    const winner = success[0];
    if (winner.status !== "fulfilled") throw new Error("Expected an order");
    const replay = await placeOrder(agent, quote.id, ["first", "second", "third"][index], approval?.id);
    expect(replay).toMatchObject({ replay: true, order: { id: winner.value.order.id } });
    await expect(placeOrder(agent, quote.id, "fourth", approval?.id)).rejects.toMatchObject({ status: 409, body: { error: "quote_consumed" } });
    expect(listOrders(agent.hotelId)).toHaveLength(1);
  });
});
