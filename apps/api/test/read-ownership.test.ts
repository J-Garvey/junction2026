import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "aimo-read-ownership-"));
Object.assign(process.env, { AIMO_DB: ":memory:", AIMO_MODE: "fixture", OPENAI_API_KEY: "", PREVIEW_PASSWORD: "", GATEWAY_SIGNING_KEY_FILE: join(dir, "key.pem"), WHATSAPP_AUTH_DIR: join(dir, "auth") });
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getDb } = await import("../src/db.js");
const { issueToken } = await import("../src/identity.js");
const { MANDATE, SEED_EVENT, HOTEL_AGENT_TOKEN, VALIO_VIEWER_TOKEN } = await import("../src/seed.js");
const { putMandate } = await import("../src/gateway/service.js");
const { setClock } = await import("../src/clock.js");
const { audit, auditView, verifyChain, SYSTEM } = await import("../src/audit.js");
const { sha256, stableStringify } = await import("../src/util.js");
let server: Server, base: string;
let other: string, person: string, foreignPerson: string, noScope: string, valioBoth: string;
let first: any, second: any;
async function call(token: string, path: string, body?: unknown, key?: string) {
  const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text, body: r.headers.get("content-type")?.includes("json") ? JSON.parse(text) : null };
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
  setClock({ time: "2026-11-14T10:00:00Z" });
  putMandate({ ...MANDATE, id: "mandate-second", hotelId: "hotel-second", sites: [{ id: "site-second", name: "Second Hotel", address: "Other street, 00100 Helsinki" }] });
  getDb().prepare("INSERT INTO events (id, json, version) VALUES (?, ?, ?)").run("event-second", JSON.stringify({ ...SEED_EVENT, id: "event-second", siteId: "site-second", version: 1, name: "PRIVATE_SECOND_EVENT", removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [] }), 1);
  getDb().prepare("INSERT INTO people (id, json) VALUES (?, ?)").run("p-other", JSON.stringify({ id: "p-other", hotelId: "hotel-second", name: "Other chef", role: "chef", outlets: ["banquet"], hotelScope: true, title: "Chef" }));
  person = issueToken({ kind: "person", personId: "p-aino" });
  foreignPerson = issueToken({ kind: "person", personId: "p-other" });
  other = issueToken({ kind: "agent", hotelId: "hotel-second", name: "Other buyer", scopes: ["quote", "order", "audit:read"] });
  noScope = issueToken({ kind: "agent", hotelId: MANDATE.hotelId, name: "No grants", scopes: [] });
  valioBoth = issueToken({ kind: "valio", name: "Assigned account manager", hotelIds: [MANDATE.hotelId, "hotel-second"] });
  async function trade(token: string, siteId: string, eventId: string) {
    const q = await call(token, "/gateway/v1/quotes", { siteId, eventId, deliveryDate: "2026-11-16", lines: [{ productId: "469363", quantity: 1, outletId: "banquet", requires: { lactoseFree: true } }] });
    expect(q.status).toBe(201);
    const o = await call(token, "/gateway/v1/orders", { quoteId: q.body.id }, `order-${eventId}`);
    expect(o.status).toBe(201);
    return { q: q.body, o: o.body };
  }
  first = await trade(HOTEL_AGENT_TOKEN, "site-aurora", "event-first");
  second = await trade(other, "site-second", "event-second");
  audit({ actor: SYSTEM, hotelId: "hotel-second", orderId: second.o.id, action: "order_placed", summary: "PRIVATE_GUEST_NAME", details: { nested: { spendCapEur: 1950, secret: "PRIVATE_RECIPE" } }, visibility: "shared" });
  audit({ actor: SYSTEM, hotelId: MANDATE.hotelId, action: "request_received", summary: "HOTEL_ONLY_HISTORY", visibility: "hotel" });
});
afterAll(() => { server?.close(); rmSync(dir, { recursive: true, force: true }); });

describe("hotel ownership on every trade read", () => {
  it("permits each hotel's real quote/order/Peppol and denies the other hotel", async () => {
    for (const [token, own, foreign] of [[HOTEL_AGENT_TOKEN, first, second], [other, second, first], [person, first, second], [foreignPerson, second, first]] as const) {
      for (const path of [`/quotes/${own.q.id}`, `/orders/${own.o.id}`, `/orders/${own.o.id}/peppol`]) expect((await call(token, `/gateway/v1${path}`)).status).toBe(200);
      for (const path of [`/quotes/${foreign.q.id}`, `/orders/${foreign.o.id}`, `/orders/${foreign.o.id}/peppol`]) expect((await call(token, `/gateway/v1${path}`)).status).toBe(403);
      const list = await call(token, `/gateway/v1/orders?eventId=${foreign.q.eventId}`);
      expect(list.body.orders).toEqual([]);
    }
  });
  it("enforces token read grants including lists, audit and mandate", async () => {
    for (const path of [`/quotes/${first.q.id}`, `/orders/${first.o.id}`, `/orders/${first.o.id}/peppol`, "/orders", "/audit", "/mandate"])
      expect((await call(noScope, `/gateway/v1${path}`)).status).toBe(403);
  });
  it("narrows audit by ownership before filters, including unknown and empty filters", async () => {
    for (const token of [person, foreignPerson, other]) {
      const ownHotel = token === person ? MANDATE.hotelId : "hotel-second";
      const unfiltered = await call(token, "/gateway/v1/audit");
      expect(unfiltered.body.entries.length).toBeGreaterThan(0);
      expect(unfiltered.body.entries.every((e: any) => e.hotelId === ownHotel)).toBe(true);
      const foreign = token === person ? second : first;
      for (const filter of [`orderId=${foreign.o.id}`, `eventId=${foreign.q.eventId}`, "eventId=does-not-exist", "orderId=does-not-exist"])
        expect((await call(token, `/gateway/v1/audit?${filter}`)).body.entries).toEqual([]);
      for (const filter of ["eventId=", "orderId=", "eventId=a&eventId=b"])
        expect((await call(token, `/gateway/v1/audit?${filter}`)).status).toBe(422);
    }
    expect((await call(person, "/gateway/v1/audit")).text).toContain("HOTEL_ONLY_HISTORY");
  });
  it("keeps Valio to assigned hotels and explicit shared trade fields", async () => {
    expect((await call(VALIO_VIEWER_TOKEN, `/gateway/v1/orders/${second.o.id}`)).status).toBe(403);
    expect((await call(VALIO_VIEWER_TOKEN, `/gateway/v1/orders/${second.o.id}/peppol`)).status).toBe(403);
    expect((await call(VALIO_VIEWER_TOKEN, "/gateway/v1/audit?eventId=event-second")).body.entries).toEqual([]);
    for (const path of [`/quotes/${first.q.id}`, `/orders/${first.o.id}`, "/audit"]) {
      const r = await call(VALIO_VIEWER_TOKEN, `/gateway/v1${path}`);
      expect(r.status).toBe(200);
      expect(r.text).not.toMatch(/requires|mandateCheck|spendCapEur|preAnswers|jws|fingerprint|approvedBy|placedBy|judgement.*PRIVATE|HOTEL_ONLY_HISTORY/);
    }
    const q = (await call(VALIO_VIEWER_TOKEN, `/gateway/v1/quotes/${first.q.id}`)).body;
    expect(q).toMatchObject({ id: first.q.id, totalExVat: first.q.totalExVat, siteId: "site-aurora", lines: [{ productId: "469363", quantity: 1, unitPrice: first.q.lines[0].unitPrice }] });
    expect((await call(VALIO_VIEWER_TOKEN, "/gateway/v1/mandate")).status).toBe(403);
    expect((await call(valioBoth, "/gateway/v1/audit")).text).not.toMatch(/PRIVATE_GUEST_NAME|PRIVATE_RECIPE|spendCapEur/);
    expect((await call(VALIO_VIEWER_TOKEN, "/gateway/v1/audit?eventId=event-first")).body.entries.length).toBeGreaterThan(0);
    const unassigned = issueToken({ kind: "valio", name: "No hotel assignments" });
    expect((await call(unassigned, "/gateway/v1/audit")).body.entries).toEqual([]);
    expect((await call(unassigned, `/gateway/v1/quotes/${first.q.id}`)).status).toBe(403);
  });
  it("closes direct app and live console backdoors, including SSE", async () => {
    for (const path of ["/home", "/rules", "/plans", "/events", "/events/evt-wedding", "/baskets", "/baskets/evt-wedding"])
      expect((await call(foreignPerson, `/api${path}`)).status).toBe(403);
    expect((await call(foreignPerson, `/api/orders/${first.o.id}`)).status).toBe(403);
    expect((await call(person, `/api/orders/${first.o.id}`)).status).toBe(200);
    for (const path of ["/events/event-second", "/baskets/event-second", "/events/%65vent-second"])
      expect((await call(person, `/api${path}`)).status, path).toBe(403);
    for (const path of ["/home", "/events", "/baskets"])
      expect((await call(person, `/api${path}`)).text).not.toContain("PRIVATE_SECOND_EVENT");
    expect((await call(foreignPerson, "/api/audit?eventId=event-first")).body.entries).toEqual([]);
    expect((await call(foreignPerson, "/api/orders?eventId=event-first")).body.orders).toEqual([]);
    for (const token of [other, VALIO_VIEWER_TOKEN, foreignPerson, ""]) {
      for (const path of ["/state", "/stream", `/orders/${first.o.id}`, `/orders/${first.o.id}/peppol`])
        expect([401, 403]).toContain((await call(token, `/api/live${path}`)).status);
    }
    const state = await call(person, "/api/live/state");
    expect(state.status).toBe(200);
    expect(state.body.feed.every((e: any) => e.hotelId === MANDATE.hotelId)).toBe(true);
    expect((await call(person, `/api/live/orders/${second.o.id}`)).status).toBe(403);
  });
  it("resolves preexisting logs without rewriting their chain, fails closed on unknown owners", () => {
    const original = audit({ actor: SYSTEM, quoteId: first.q.id, action: "quote_created", summary: "Legacy trade", visibility: "shared" });
    // An actual pre-migration JSON row has no hotelId in its hashed body.
    const { hotelId, seq, hash, ...legacy } = original;
    const legacyHash = sha256(legacy.prevHash + stableStringify(legacy));
    getDb().prepare("UPDATE audit SET json = ?, hash = ? WHERE seq = ?").run(JSON.stringify({ seq, ...legacy, hash: legacyHash }), legacyHash, seq);
    expect(auditView("hotel", { hotelId: MANDATE.hotelId }).some(e => e.id === original.id)).toBe(true);
    expect(auditView("hotel", { hotelId: "hotel-second" }).some(e => e.id === original.id)).toBe(false);
    const before = verifyChain();
    expect(before.ok).toBe(true);
    const unknown = audit({ actor: SYSTEM, orderId: "missing-order", action: "order_refused", summary: "UNKNOWN_OWNER", visibility: "shared" });
    expect(unknown.hotelId).toBeNull();
    expect(auditView("hotel").some(e => e.id === unknown.id)).toBe(false);
    expect(verifyChain()).toEqual({ ...before, entries: before.entries + 1 });
  });
});
