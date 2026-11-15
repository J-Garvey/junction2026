import { afterAll, beforeAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const temporary = mkdtempSync(join(tmpdir(), "aimo-supplier-privacy-"));
process.env.GATEWAY_SIGNING_KEY_FILE = join(temporary, "signing.pem");
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(temporary, { recursive: true, force: true });
});
async function call(path: string, token: string, body?: unknown, extra: Record<string, string> = {}) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}

it("keeps hotel policy and identity out of supplier trade projections", async () => {
  await call("/api/reset", "", {});
  await call("/api/clock", "", { time: "2026-11-14T10:00:00Z" });
  const person = (await call("/api/session", "", { personId: "p-aino" })).body.token;
  const agent = "agent_demo_hotel_aurora";
  const valio = "valio_demo_viewer";
  const quote = await call("/gateway/v1/quotes", agent, { siteId: "site-aurora", deliveryDate: "2026-11-16", lines: [{ productId: "469672", outletId: "banquet", quantity: 80 }] });
  expect(quote.status).toBe(201);
  expect(quote.body.mandateCheck.approvalsNeeded).toContain("spend_cap");
  const finance = (await call("/api/session", "", { personId: "p-sanna" })).body.token;
  const approval = await call("/gateway/v1/approvals", finance, { quoteId: quote.body.id, fingerprint: quote.body.fingerprint, grants: ["spend_cap"] });
  expect(approval.status).toBe(201);
  const order = await call("/gateway/v1/orders", person, { quoteId: quote.body.id, approvalId: approval.body.id }, { "idempotency-key": "supplier-privacy" });
  expect(order.status).toBe(201);
  for (const path of [`/gateway/v1/quotes/${quote.body.id}`, `/gateway/v1/orders/${order.body.id}`]) {
    const supplier = await call(path, valio);
    expect(supplier.status, path).toBe(200);
    expect(supplier.body.totalExVat).toBe(quote.body.totalExVat);
    expect(JSON.stringify(supplier.body)).not.toMatch(/spend_cap|spendCap|mandateCheck|approvedBy|placedBy|riskAccepted|allergen/);
    expect(supplier.body.jws).toBeUndefined();
    for (const token of [agent, person]) {
      const hotel = await call(path, token);
      expect(hotel.status).toBe(200);
      expect(hotel.body.jws).toBeTruthy();
    }
  }
  expect((await call("/gateway/v1/quotes/not-a-quote", valio)).status).toBe(404);
  expect((await call("/gateway/v1/orders/not-an-order", valio)).status).toBe(404);
  expect((await call("/gateway/v1/mandate", valio)).status).toBe(403);
  expect((await call("/gateway/v1/orders", valio)).status).toBe(403);
  expect((await call("/gateway/v1/audit", valio)).status).toBe(200);
});
