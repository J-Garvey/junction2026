import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LookupLine } from "@aimo/contracts";

const isolated = mkdtempSync(join(tmpdir(), "aimo-gateway-delivery-"));
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
process.env.GATEWAY_SIGNING_KEY_FILE = join(isolated, "signing.pem");
process.env.WHATSAPP_AUTH_DIR = join(isolated, "auth");
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { kvSet } = await import("../src/db.js");
const { getMandate, putMandate } = await import("../src/gateway/service.js");
const adapter = await import("../src/aimo/lookup.js");
let base = "";
let server: Server;
const realFetch = globalThis.fetch;
const originalConfig = { aimoBase: config.aimoBase, aimoKey: config.aimoKey, fixturesDir: config.fixturesDir };
const raw = () => structuredClone(adapter.loadFixture("base")!);
const body = (deliveryDate = "2026-11-17") => ({ siteId: "site-aurora", deliveryDate, lines: [{ productId: "469363", quantity: 1, outletId: "banquet" }] });
async function call(path: string, payload?: unknown, key = "delivery-order") {
  const response = await realFetch(`${base}/gateway/v1${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer agent_demo_hotel_aurora", "Idempotency-Key": key },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() as any };
}
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => { seedReset(); setClock({ time: "2026-11-14T10:00:00Z" }); });
afterEach(() => { vi.restoreAllMocks(); Object.assign(config, originalConfig); });
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); rmSync(isolated, { recursive: true, force: true }); });

/** Stub only the synthetic supplier, keeping every gateway request over real HTTP. */
function liveSupplier() {
  const fixture = raw();
  config.aimoBase = "https://supplier.invalid";
  config.aimoKey = "synthetic-test-key";
  kvSet("dataMode", { mode: "live", overlay: null });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith(config.aimoBase)) {
      const kind = url.endsWith("/availability") ? "availability" : "price";
      return new Response(JSON.stringify({ products: [fixture[kind]["469363"]] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(input, init);
  });
  return fixture;
}

describe("gateway supplier delivery evidence", () => {
  it("blocks a requested date before original supplier availability, including direct order submission", async () => {
    const quote = await call("/quotes", body("2026-11-15"));
    expect(quote.status).toBe(201);
    expect(quote.body).toMatchObject({ outcome: "block", lines: [expect.objectContaining({ availableDate: "2026-11-16", rules: expect.arrayContaining([expect.objectContaining({ ruleId: "DLV-06", outcome: "block" })]) })] });
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 409, body: { error: "hard_rule" } });
    expect((await call("/orders")).body.orders).toHaveLength(0);
  });

  it("blocks the original expired cutoff even when a later date is requested", async () => {
    setClock({ time: "2026-11-15T18:00:00Z" });
    const quote = await call("/quotes", body());
    expect(quote.body).toMatchObject({ outcome: "block", lines: [expect.objectContaining({ availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200" })] });
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 409, body: { error: "cutoff_passed" } });
  });

  it("preserves live supplier dates and cutoffs through lookup, quote and commit", async () => {
    liveSupplier();
    const lookup = await call("/lookup", { productIds: ["469363"], requestedDate: "2026-11-17" });
    expect(lookup.body.lines[0]).toMatchObject({ source: "live", fixtureName: null, availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200" });
    expect(lookup.body.lines[0].projectedFrom).toBeUndefined();
    const quote = await call("/quotes", body());
    expect(quote.body).toMatchObject({ outcome: "order", usesFixtures: false, expiresAt: "2026-11-15T10:00:00.000Z" });
    setClock({ time: "2026-11-15T18:00:00Z" });
    const lateQuote = await call("/quotes", body());
    expect(lateQuote.body.outcome).toBe("block");
    expect(await call("/orders", { quoteId: lateQuote.body.id })).toMatchObject({ status: 409, body: { error: "cutoff_passed" } });
  });

  it("allows earlier supplier delivery by a later need, retaining the fixed price and idempotency", async () => {
    const quote = await call("/quotes", body());
    expect(quote.body.outcome).toBe("order");
    expect(quote.body.lines[0].availableDate).toBe("2026-11-16");
    const order = await call("/orders", { quoteId: quote.body.id });
    expect(order.status).toBe(201);
    expect(order.body.lines[0]).toMatchObject({ availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200", unitPrice: quote.body.lines[0].unitPrice });
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 200, body: { id: order.body.id } });
    const amended = await call(`/orders/${order.body.id}/amendments`, { changes: [{ productId: "469363", quantity: 2, outletId: "banquet" }] });
    expect(amended.status).toBe(200);
    expect(amended.body.order.lines[0]).toMatchObject({ quantity: 2, availableDate: "2026-11-16", closingTime: "2026-11-15T17:00:00+0200" });
  });

  it.each(["weekday", "holiday"])("enforces the hotel's %s restriction on actual supplier delivery", async (restriction) => {
    const mandate = getMandate("hotel-aurora");
    putMandate({ ...mandate, ...(restriction === "weekday" ? { deliveryDays: [2, 3, 4, 5] } : { holidays: ["2026-11-16"] }) });
    const quote = await call("/quotes", body());
    expect(quote.body.outcome).toBe("block");
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 409, body: { error: "hard_rule" } });
  });

  it("independently rejects projected adapter fields against original schedules", async () => {
    const fixture = raw();
    const line = adapter.normalise("469363", fixture.availability["469363"], fixture.price["469363"], "live", null, "2026-11-14T10:00:00Z");
    vi.spyOn(adapter, "lookup").mockResolvedValue({ lines: [{ ...line, availableDate: "2026-11-17", closingTime: "2026-11-16T17:00:00+0200" } as LookupLine], fallback: null });
    setClock({ time: "2026-11-15T18:00:00Z" });
    const quote = await call("/quotes", body());
    expect(quote.body.lines[0].closingTime).toBe(line.closingTime);
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 409, body: { error: "cutoff_passed" } });
  });

  it("requires original evidence even when top-level adapter terms look valid", async () => {
    const fixture = raw();
    const line = adapter.normalise("469363", fixture.availability["469363"], fixture.price["469363"], "live", null, "2026-11-14T10:00:00Z");
    vi.spyOn(adapter, "lookup").mockResolvedValue({ lines: [{ ...line, availabilityEvidence: undefined }], fallback: null });
    const quote = await call("/quotes", body());
    expect(quote.body.outcome).toBe("block");
    expect(await call("/orders", { quoteId: quote.body.id })).toMatchObject({ status: 409, body: { error: "hard_rule" } });
  });

  it("allows an explicit labelled later-date fixture overlay with its own consistent cutoff", async () => {
    const fixture = raw();
    const availability = fixture.availability["469363"];
    availability.scheduleLines[0].availableDate = "2026-11-17";
    availability.closingTime = "2026-11-16T17:00:00+0200";
    config.fixturesDir = isolated;
    adapter.saveFixture({ name: "overlay-delivery-regression", recordedAt: "2026-11-16T10:00:00Z", timeNow: "2026-11-16T10:00:00Z", availability: { "469363": availability }, price: {} });
    kvSet("dataMode", { mode: "fixture", overlay: "delivery-regression" });
    setClock({ time: "2026-11-16T10:00:00Z" });
    const checked = await call("/lookup", { productIds: ["469363"], requestedDate: "2026-11-17" });
    expect(checked.body.lines[0]).toMatchObject({ source: "fixture", fixtureName: "base+delivery-regression", availableDate: "2026-11-17", closingTime: availability.closingTime });
    const quote = await call("/quotes", body());
    expect(quote.body).toMatchObject({ outcome: "order", usesFixtures: true });
    expect((await call("/orders", { quoteId: quote.body.id })).status).toBe(201);
    setClock({ time: "2026-11-16T15:00:00Z" });
    expect((await call("/quotes", body())).body.outcome).toBe("block");
  });

  it.each(["date", "cutoff", "price", "calendar"])("rechecks changed supplier %s or mandate terms before commit", async (term) => {
    const fixture = liveSupplier();
    const quote = await call("/quotes", body());
    expect(quote.body.outcome).toBe("order");
    if (term === "date") fixture.availability["469363"].scheduleLines[0].availableDate = "2026-11-18";
    if (term === "cutoff") fixture.availability["469363"].closingTime = "2026-11-13T17:00:00+0200";
    if (term === "price") fixture.price["469363"].catalogPrice.value += 1;
    if (term === "calendar") putMandate({ ...getMandate("hotel-aurora"), holidays: ["2026-11-16"] });
    const order = await call("/orders", { quoteId: quote.body.id });
    expect(order).toMatchObject({ status: 409, body: { error: term === "cutoff" ? "cutoff_passed" : "quote_stale" } });
    expect((await call("/orders")).body.orders).toHaveLength(0);
  });
});
