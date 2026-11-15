import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { Server } from "node:http";
Object.assign(process.env, { AIMO_DB: ":memory:", AIMO_MODE: "fixture", AIMO_TEST_MODE: "0", OPENAI_API_KEY: "", PREVIEW_PASSWORD: "" });
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { issueToken } = await import("../src/identity.js");
let server: Server, base: string, chef: string, finance: string, demo: string;
const agent = "agent_demo_hotel_aurora";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  server.keepAliveTimeout = 60_000;
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
beforeEach(() => {
  config.testMode = false;
  seedReset(); setClock({ time: "2026-11-14T10:00:00Z" });
  chef = issueToken({ kind: "person", personId: "p-aino", testSession: false });
  finance = issueToken({ kind: "person", personId: "p-sanna", testSession: false });
  demo = issueToken({ kind: "person", personId: "p-aino", testSession: true });
});
afterAll(() => server.close());
async function post(path: string, body: unknown, token = agent) {
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": path }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
it("requires genuine chef authentication for dietary acknowledgement and separate stock consent", async () => {
  const q = (await post("/gateway/v1/quotes", { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "460541", quantity: 1, outletId: "banquet", requires: { claims: [], labels: [], avoidAllergens: ["AN"] } }] })).body;
  expect(q.outcome).toBe("ask_chef");
  const terms = { quoteId: q.id, fingerprint: q.fingerprint, productIds: ["460541"] };
  for (const [token, status] of [[agent, 403], [finance, 403], [demo, 401], ["", 401]] as const)
    expect((await post("/gateway/v1/allergen-acknowledgements", terms, token)).status).toBe(status);
  const acknowledgement = await post("/gateway/v1/allergen-acknowledgements", terms, chef);
  expect(acknowledgement.status).toBe(201);
  const order = { quoteId: q.id, continueWithUnconfirmedStock: ["460541"], allergenAcknowledgements: [acknowledgement.body.token], decidedBy: "Unverified agent claim" };
  expect((await post("/gateway/v1/orders", order)).body.error).toBe("stock_unconfirmed");
  const consent = await post("/gateway/v1/builder-consents", terms, chef);
  expect(consent.status).toBe(201);
  const placed = await post("/gateway/v1/orders", { ...order, builderConsentId: consent.body.id });
  expect(placed.status).toBe(201);
  expect(placed.body.lines[0]).toMatchObject({ stock: { kind: "unknown" }, riskAccepted: { by: "Aino" }, allergenDataAcknowledgement: { by: "Aino", personId: "p-aino" } });
});
it("keeps dietary question answers behind the authenticated chef role outside demo mode", async () => {
  const message = (await post("/api/messages", { text: "1 kg potatoes" }, chef)).body;
  const request = { ...message.request, neededBy: "2026-11-16", lines: message.request.lines.map((line: any) => ({ ...line, productId: "460541", constraints: { claims: [], labels: [], avoidAllergens: ["AN"] } })) };
  const proposal = await post("/api/requests", { request }, chef);
  expect(proposal.status).toBe(200);
  const accepted = await post(`/api/plans/${proposal.body.plan.id}/accept`, {}, chef);
  const question = accepted.body.questions.find((q: any) => q.type === "missing_allergen_data");
  expect(question).toBeTruthy();
  const path = `/api/questions/${question.id}/answer`;
  expect((await post(path, { optionId: "continue" }, demo)).status).toBe(401);
  expect((await post(path, { optionId: "continue" }, agent)).status).toBe(401);
  const refused = await post(path, { optionId: "continue" }, finance);
  expect(refused.status).toBe(409);
  const continued = await post(path, { optionId: "continue" }, chef);
  expect(continued.status).toBe(200);
  expect(continued.body.error).toBeUndefined();
});
