/**
 * The live console end to end with a scripted model: the agent's tool calls go over
 * HTTP to the real gateway, two cards stop for people, and the gateway feed records
 * Valio Aimo's verdict for each call. The rogue script is refused.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { setModelTurn } = await import("../src/live/agent.js");

let BASE = "";
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${BASE}/gateway/v1`;
});
afterAll(() => {
  setModelTurn(null);
  server.close();
});

const call = (name: string, args: unknown) => ({ output: [{ type: "function_call", call_id: `c_${name}_${Math.random()}`, name, arguments: JSON.stringify(args) }] });
const lastOutput = (input: any[]) => JSON.parse([...input].reverse().find((i) => i.type === "function_call_output")?.output ?? "{}");

/** Plays the milk-over-budget run: search, lookup, quote, ask chef, ask approver, order. */
function scripted() {
  let step = 0;
  let quoteId = "";
  setModelTurn(async ({ input }) => {
    const prev = lastOutput(input);
    switch (step++) {
      case 0:
        return call("search_products", { q: null, category: "10400", claims: ["FREE_FROM_LACTOSE"], excludeAllergens: null, limit: 50 });
      case 1:
        return call("check_price_and_stock", { productIds: ["464306"], requestedDate: "2026-11-16" });
      case 2:
        return call("create_quote", { deliveryDate: "2026-11-16", lines: [{ productId: "464306", quantity: 2000, outletId: "banquet", lactoseFree: true, glutenFree: false, avoidAllergens: [] }] });
      case 3:
        quoteId = prev.quoteId;
        return call("ask_chef", { title: "Stock not confirmed", question: "Continue?", options: [{ id: "continue", label: "Continue", sub: null }, { id: "confirmed", label: "Use confirmed stock", sub: null }] });
      case 4:
        return call("request_approval", { quoteId, reason: "Over the budget" });
      case 5:
        return call("place_order", { quoteId, approvalId: prev.approvalId, continueWithUnconfirmedStock: ["464306"], decidedBy: "Aino" });
      default:
        return { output: [{ type: "message", content: [{ type: "output_text", text: "Ordered 2,000 L." }] }] };
    }
  });
}

const post = async (p: string, b: unknown = {}) => {
  const r = await fetch(`${BASE}/api/live${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, body: (await r.json()) as any };
};
const state = async () => (await (await fetch(`${BASE}/api/live/state`)).json()) as any;
async function settle() {
  for (let i = 0; i < 100; i++) {
    const s = await state();
    if (s.session.status !== "running") return s;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("agent did not settle");
}
const openCard = (s: any) => s.session.steps.filter((x: any) => x.kind === "card" && !x.answer).at(-1);

describe("Live console: real gateway, scripted model", () => {
  let final: any;
  let chefCard: any;
  let approverCard: any;
  beforeAll(async () => {
    scripted();
    await post("/reset");
    expect((await post("/say", { text: "We need 2,000 litres of lactose-free milk for Monday." })).status).toBe(202);
    let s = await settle();
    chefCard = openCard(s);
    expect((await post("/say", { text: "again" })).status).toBe(409);
    await post(`/cards/${chefCard.id}`, { optionId: "continue" });
    s = await settle();
    approverCard = openCard(s);
    await post(`/cards/${approverCard.id}`, { optionId: "approve" });
    final = await settle();
  });

  it("stops twice for people: the chef for stock, then Sanna for the budget", () => {
    expect(chefCard.who).toBe("chef");
    expect(approverCard.who).toBe("approver");
    expect(final.session.status).toBe("done");
    expect(final.session.steps.at(-1)).toMatchObject({ kind: "say", text: "Ordered 2,000 L." });
  });

  it("shows Valio Aimo one verdict per call, with the approval made by a person", () => {
    const rows = final.feed.filter((f: any) => f.verdict !== "INFO").map((f: any) => [f.action, f.verdict, f.callerKind]);
    expect(rows).toEqual([
      ["QUOTE", "NEEDS_APPROVAL", "agent"],
      ["APPROVAL", "APPROVED", "person"],
      ["ORDER", "ALLOWED", "agent"],
    ]);
    const order = final.feed.find((f: any) => f.action === "ORDER");
    expect(order).toMatchObject({ amount: 2020, signed: true });
    expect(final.feed.find((f: any) => f.action === "APPROVAL").amount).toBe(2020);
  });

  it("serves the signed record with a valid ES256 signature", async () => {
    const id = final.feed.find((f: any) => f.action === "ORDER").orderId;
    const r = (await (await fetch(`${BASE}/api/live/orders/${id}`)).json()) as any;
    expect(r.signature.valid).toBe(true);
    expect(r.order.lines[0]).toMatchObject({ productId: "464306", quantity: 2000, riskAccepted: { by: "Demo Hotel purchasing agent on behalf of Aino (unverified)" } });
  });

  it("refuses the unvetted script over budget with no approval", async () => {
    const r = await post("/rogue");
    expect(r.body.status).toBe(409);
    const last = (await state()).feed.at(-1);
    expect(last).toMatchObject({ action: "ORDER", verdict: "REFUSED", amount: r.body.quoteTotal });
    expect(last.reason).toMatch(/spend cap.*No approval attached/);
  });
});
