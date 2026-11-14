/**
 * The three test cases the PRD requires (prd-context "Test cases"), run against the
 * real HTTP stack on fixtures, from a fresh reset, twice in a row with the same result.
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
  const port = (server.address() as { port: number }).port;
  BASE = `http://127.0.0.1:${port}`;
  config.gatewayUrl = `${BASE}/gateway/v1`;
});
afterAll(() => server.close());

class Client {
  cookie = "";
  constructor(public person: string) {}
  async login() {
    const r = await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: this.person }) });
    this.cookie = r.headers.get("set-cookie")!.split(";")[0];
    return this;
  }
  async call(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${BASE}/api${path}`, { method, headers: { "Content-Type": "application/json", Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  }
}
async function gateway(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${BASE}/gateway/v1${path}`, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer agent_demo_hotel_aurora", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as any };
}

async function fresh() {
  await fetch(`${BASE}/api/reset`, { method: "POST" });
  const anna = await new Client("p-anna").login();
  const mikko = await new Client("p-mikko").login();
  const sara = await new Client("p-sara").login();
  const jonas = await new Client("p-jonas").login();
  return { anna, mikko, sara, jonas };
}

async function milkCase() {
  const { anna, sara, jonas } = await fresh();
  await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
  await anna.call("POST", "/data-mode", { mode: "fixture", overlay: null });
  const m = await anna.call("POST", "/messages", { text: "I need 1,000 litres of lactose-free milk by Monday" });
  const r = await anna.call("POST", "/requests", { request: m.request });
  const plan = r.plan;
  const q = r.questions.find((x: any) => x.forRole === "approver");
  const chefTry = await anna.call("POST", `/questions/${q.id}/answer`, { optionId: "approve" });
  const a = await sara.call("POST", `/questions/${q.id}/answer`, { optionId: "approve" });
  const second = await jonas.call("POST", `/questions/${q.id}/answer`, { optionId: "reject" });
  const orders = (await anna.call("GET", "/orders")).orders;
  return { plan, q, chefTry, a, second, orders };
}

async function eventCase() {
  const { anna, mikko, sara, jonas } = await fresh();
  const v = async () => (await anna.call("GET", "/events/evt-gala")).event.version;
  const out: Record<string, any> = {};
  await anna.call("POST", "/clock", { scene: "1" });
  out.viability = (await anna.call("POST", "/events/evt-gala/viability")).plan;
  await anna.call("POST", "/clock", { scene: "2" });
  out.blocked = (await anna.call("POST", "/events/evt-gala/order")).plan;
  out.staleEdit = await mikko.call("POST", "/events/evt-gala/remove-need", { needId: "coffee:cmilk:vegan", version: 0 });
  await mikko.call("POST", "/events/evt-gala/remove-need", { needId: "coffee:cmilk:vegan", version: await v() });
  out.order = (await anna.call("POST", "/events/evt-gala/order")).plan;
  out.saraQs = (await sara.call("GET", "/home")).questions;
  out.annaQs = (await anna.call("GET", "/home")).questions;
  out.approved = await sara.call("POST", `/questions/${out.saraQs[0].id}/answer`, { optionId: "approve" });
  await anna.call("POST", "/clock", { scene: "3" });
  out.g510 = await anna.call("POST", "/events/evt-gala/guests", { guests: 510, version: await v() });
  out.g600 = await anna.call("POST", "/events/evt-gala/guests", { guests: 600, version: await v() });
  out.change = await jonas.call("POST", `/questions/${out.g600.questionId}/answer`, { optionId: "approve" });
  out.allergy = await anna.call("POST", "/events/evt-gala/diet-groups", { group: { id: "fish", label: "Fish allergy", count: 12, constraints: { claims: [], avoidAllergens: ["AF"], labels: [] }, standing: false }, version: await v() });
  await anna.call("POST", "/clock", { scene: "4" });
  out.final = (await anna.call("POST", "/events/evt-gala/final-check")).finalCheck;
  out.subQ = (await anna.call("GET", "/home")).questions.find((q: any) => q.type === "substitute");
  out.mikkoQs = (await mikko.call("GET", "/home")).questions;
  out.useSub = await anna.call("POST", `/questions/${out.subQ.id}/answer`, { optionId: "use" });
  await anna.call("POST", "/clock", { time: "2026-11-15T15:30:00Z" });
  out.cutoff = await anna.call("POST", "/events/evt-gala/cutoff");
  out.view = await sara.call("GET", "/events/evt-gala");
  out.orders = (await anna.call("GET", "/orders?eventId=evt-gala")).orders;
  out.valio = await sara.call("GET", "/audit?viewer=valio");
  return out;
}

describe("Test case 2: the brief's milk request", () => {
  it("splits real stock across products and offers unknown stock as a risk for one Approver yes", async () => {
    const r = await milkCase();
    expect(r.plan.urgent).toBe(true);
    expect(r.plan.status).toBe("waiting");
    const real = r.plan.lines.filter((l: any) => l.stock?.kind === "known");
    expect(real.map((l: any) => l.productId).sort()).toEqual(["462775", "469363"]);
    expect(real.reduce((s: number, l: any) => s + l.quantity, 0)).toBe(435);
    const unknown = r.plan.lines.filter((l: any) => l.stock?.kind === "unknown");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].status).toBe("unknown_stock");
    expect(r.plan.lines.every((l: any) => !["463380", "462626", "464237", "463203"].includes(l.productId))).toBe(true); // no coffee milk or creamers
    expect(r.q.ruleIds).toEqual(expect.arrayContaining(["STK-01", "STK-02"]));
    expect(r.chefTry.status).toBe(409);
    expect(r.a.plan.status).toBe("ordered");
    expect(r.second.status).toBe(409);
    expect(r.second.reason).toMatch(/Answered by Sara Nieminen/);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].lines.find((l: any) => l.stock.kind === "unknown").riskAccepted.by).toBe("Sara Nieminen");
  });
});

describe("Test case 1: the hotel event through four scenes", () => {
  let a: Record<string, any>;
  let b: Record<string, any>;
  beforeAll(async () => {
    a = await eventCase();
    b = await eventCase();
  });
  it("scene 1: green, amber and red lines, each with a reason; no stock counted", () => {
    const v = a.viability.lines.map((l: any) => l.verdict);
    expect(v).toContain("green");
    expect(v).toContain("amber");
    expect(v).toContain("red");
    const red = a.viability.lines.find((l: any) => l.verdict === "red");
    expect(red.rules.map((r: any) => r.ruleId)).toContain("DIET-04");
    expect(a.viability.lines.find((l: any) => l.productId === "461088").status).toBe("unknown_stock");
    const frozen = a.viability.needs.find((n: any) => n.id === "soup:salmon:regular");
    expect(frozen.neededBy).toBe("2026-11-16");
  });
  it("scene 2: a blocked line stops the order; one Approver card for unknown stock; outlets routed", () => {
    expect(a.blocked.status).toBe("blocked");
    expect(a.staleEdit.status).toBe(409);
    expect(a.order.status).toBe("waiting");
    expect(a.saraQs).toHaveLength(1);
    expect(a.saraQs[0].ruleIds).toContain("STK-01");
    expect(a.annaQs).toHaveLength(0);
    expect(a.approved.plan.status).toBe("ordered");
  });
  it("scene 3: +2% applied with no question; +18% asks once; a late allergy warns and keeps the line", () => {
    expect(a.g510.applied).toBe(true);
    expect(a.g600.applied).toBe(false);
    expect(a.change.ok).toBe(true);
    expect(a.allergy.warnings).toHaveLength(1);
    expect(a.allergy.warnings[0].text).toMatch(/contains fish\. 12 guests must avoid it\. Still in the order\./);
  });
  it("scene 4: the final check finds the shortfall; the chef gets a side-by-side with the cut-off as deadline", () => {
    expect(a.final.lines.find((l: any) => l.productId === "464727").result).toBe("short");
    expect(a.final.lines.some((l: any) => l.result === "covered_at_risk")).toBe(true);
    expect(a.subQ.facts.sideBySide.length).toBeGreaterThan(5);
    expect(a.subQ.deadline).toBe("2026-11-15T15:00:00.000Z");
    expect(a.mikkoQs.some((q: any) => q.id === a.subQ.id)).toBe(false);
    const o = a.orders[0];
    expect(o.lines.find((l: any) => l.productId === "464727").removed).toBe(true);
  });
  it("silence never changes the order; Valio Aimo is told; it sees no guest details", () => {
    expect(a.cutoff.flags.length).toBe(1);
    expect(a.view.coverage.level).toBe("warning");
    expect(a.view.decisions.decisions).toBe(3);
    const shared = a.valio.entries;
    expect(shared.every((e: any) => e.visibility === "shared")).toBe(true);
    expect(shared.some((e: any) => e.action === "flag_sent_to_valio_aimo")).toBe(true);
    expect(JSON.stringify(shared)).not.toMatch(/Fish allergy|guests at/);
    expect(a.valio.chain.ok).toBe(true);
  });
  it("repeats: two runs from a fresh reset give the same result", () => {
    const shape = (x: any) => ({
      v: x.viability.lines.map((l: any) => [l.productId, l.quantity, l.verdict]),
      o: x.orders[0].lines.map((l: any) => [l.productId, l.quantity, l.removed]),
      f: x.final.lines.map((l: any) => [l.productId, l.result]),
      c: x.view.coverage,
    });
    expect(shape(b)).toEqual(shape(a));
  });
});

describe("Test case 3: blocked paths no approval can push through", () => {
  it("a past cut-off is refused at the gateway even though the mock shows Monday", async () => {
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "463038", quantity: 5, outletId: "banquet" }] });
    expect(q.body.outcome).toBe("block");
    const o = await gateway("POST", "/orders", { quoteId: q.body.id }, { "Idempotency-Key": "k1" });
    expect(o.status).toBe(409);
    expect(o.body.error).toBe("cutoff_passed");
  });
  it("a diet failure on the quote can't be approved by the Approver", async () => {
    const { anna, sara } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "475797", quantity: 5, outletId: "banquet", requires: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] } }] });
    expect(q.body.lines[0].rules.map((r: any) => r.ruleId)).toContain("DIET-01");
    const token = (await (await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-sara" }) })).json()).token;
    const ap = await fetch(`${BASE}/gateway/v1/approvals`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }) });
    expect(ap.status).toBe(409);
    expect(((await ap.json()) as any).error).toBe("hard_rule");
  });
  it("over the cap is refused without an approval, accepted with one; a retry is one order", async () => {
    const { anna } = await fresh();
    await anna.call("POST", "/clock", { time: "2026-11-14T10:00:00Z" });
    const q = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469363", quantity: 380, outletId: "banquet" }, { productId: "471555", quantity: 400, outletId: "banquet" }] });
    expect(q.body.mandateCheck.approvalsNeeded).toEqual(["spend_cap"]);
    const refused = await gateway("POST", "/orders", { quoteId: q.body.id }, { "Idempotency-Key": "cap-1" });
    expect(refused.body.error).toBe("mandate_violation");
    const login = await (await fetch(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-sara" }) })).json();
    const ap = (await (await fetch(`${BASE}/gateway/v1/approvals`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${(login as any).token}` }, body: JSON.stringify({ quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: ["spend_cap"] }) })).json()) as any;
    const ok = await gateway("POST", "/orders", { quoteId: q.body.id, approvalId: ap.id }, { "Idempotency-Key": "cap-2" });
    expect(ok.status).toBe(201);
    const again = await gateway("POST", "/orders", { quoteId: q.body.id, approvalId: ap.id }, { "Idempotency-Key": "cap-2" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(ok.body.id);
  });
});
