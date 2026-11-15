import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { ProductInspection, type LookupLine } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { getDb } = await import("../src/db.js");
const { setClock } = await import("../src/clock.js");
const { issueToken } = await import("../src/identity.js");
const { seedReset, PEOPLE } = await import("../src/seed.js");
const { normalise, loadFixture } = await import("../src/aimo/lookup.js");
const { inspectDelivery } = await import("../src/app/productInspection.js");
const fixture = loadFixture("base")!;
const at = new Date("2026-11-10T10:00:00Z");
const date = "2026-11-16";
const original = (id = "469672"): LookupLine => normalise(id, fixture.availability[id], fixture.price[id], "fixture", "base", fixture.recordedAt);
const inspect = (line: LookupLine, time = at, requestedDate = date) => inspectDelivery({ name: "Test product" }, line, requestedDate, time);

describe("supplier inspection using recorded evidence", () => {
  it("keeps the real fixed-price salmon with empty schedules distinct from unknown evidence", () => {
    const salmon = original("461955");
    expect(salmon.price?.value).toBe(28.84);
    expect(salmon.availabilityEvidence?.schedules).toEqual([]);
    expect(inspect(salmon)).toMatchObject({ state: "not_available", rules: [expect.objectContaining({ ruleId: "DLV-01" })] });
    const oldSnapshot = { ...salmon, availabilityEvidence: undefined };
    expect(inspect(oldSnapshot)).toMatchObject({ state: "unknown", rules: [] });
  });

  it.each(["467767", "464306"])("does not call unknown stock alone undeliverable (%s)", (id) => {
    const line = original(id);
    expect(line.stock.kind).toBe("unknown");
    expect(inspect(line)).toMatchObject({ state: "stock_unconfirmed", rules: [expect.objectContaining({ ruleId: "STK-01", outcome: "ask_chef" })] });
    expect(inspect(line).rules.some((rule) => rule.ruleId.startsWith("DLV-"))).toBe(false);
  });

  it("uses the original cutoff at the boundary, including legacy snapshots with projected fields", () => {
    const line = original();
    expect(inspect(line, new Date("2026-11-15T14:59:59Z")).state).toBe("scheduled");
    expect(inspect(line, new Date("2026-11-15T15:00:00Z"))).toMatchObject({ state: "cutoff_passed", rules: [expect.objectContaining({ ruleId: "CUT-01" })] });
    const projected = { ...line, availableDate: "2026-11-23", closingTime: "2026-11-22T17:00:00+0200" };
    expect(projected.closingTime).toContain("2026-11-22");
    expect(inspect(projected, new Date("2026-11-16T10:00:00Z"), "2026-11-23").state).toBe("cutoff_passed");
    expect(inspect(original("467767"), new Date("2026-11-14T10:00:00Z")).state).toBe("cutoff_passed");
  });

  it("keeps product and schedule sales blocks separate from missing schedules", () => {
    const blocked = original();
    blocked.availabilityEvidence!.salesBlock = true;
    expect(inspect(blocked)).toMatchObject({ state: "sales_blocked", rules: [expect.objectContaining({ ruleId: "DLV-02" })] });
    blocked.availabilityEvidence!.salesBlock = false;
    blocked.availabilityEvidence!.schedules[0].salesBlock = true;
    expect(inspect(blocked).state).toBe("sales_blocked");
    // A blocked first alternative cannot hide another eligible original schedule.
    blocked.salesBlock = true;
    blocked.availabilityEvidence!.schedules.push(original().availabilityEvidence!.schedules[0]);
    expect(inspect(blocked).state).toBe("scheduled");
  });

  it("handles incomplete schedules, zero stock and late dates without inventing availability", () => {
    const line = original();
    line.availabilityEvidence!.schedules[0].closingTime = null;
    expect(inspect(line).state).toBe("unknown");
    line.availabilityEvidence!.schedules[0].closingTime = "2026-11-15T17:00:00";
    expect(inspect(line).state).toBe("unknown");
    line.availabilityEvidence!.schedules[0].availableDate = null;
    expect(inspect(line).state).toBe("unknown");
    const noStock = original();
    noStock.availabilityEvidence!.schedules[0].stock = { kind: "known", amount: 0 };
    expect(inspect(noStock).state).toBe("out_of_stock");
    expect(inspect(original(), at, "2026-11-15")).toMatchObject({ state: "after_requested_date", rules: [expect.objectContaining({ ruleId: "DLV-03" })] });
  });
});

describe("read-only catalogue and supplier endpoints", () => {
  let server: Server;
  let base: string;
  let token: string;
  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  beforeEach(() => {
    seedReset();
    setClock({ time: at.toISOString() });
    token = issueToken({ kind: "person", personId: "p-aino" });
  });
  afterAll(() => server.close());
  const get = (path: string, credential = token) => fetch(`${base}/api${path}`, { headers: { Authorization: `Bearer ${credential}` } });
  const supplier = (id: string, query = `siteId=site-aurora&requestedDate=${date}`) => `/products/${id}/supplier?${query}`;

  it("finds and inspects the real salmon without changing any buying or event state", async () => {
    const snapshot = () => Object.fromEntries(["plans", "quotes", "approvals", "orders", "questions", "events", "kv", "audit"].map((table) => [table, getDb().prepare(`SELECT * FROM ${table}`).all()]));
    const before = snapshot();
    const search = await get("/products?q=461955");
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({ products: [{ id: "461955" }], sites: [{ id: "site-aurora" }] });
    const named = await get("/products?q=salmon");
    expect((await named.json() as any).products.some((product: any) => product.id === "461955")).toBe(true);
    const response = await get(supplier("461955"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = ProductInspection.parse(await response.json());
    expect(body).toMatchObject({ lookup: { source: "fixture", fixtureName: "base", price: { value: 28.84 }, availabilityEvidence: { schedules: [] } }, delivery: { state: "not_available", rules: [{ ruleId: "DLV-01" }] } });
    expect(snapshot()).toEqual(before);
  });

  it("returns distinct unknown-stock and expired-cutoff states with the shared clock", async () => {
    expect(ProductInspection.parse(await (await get(supplier("467767"))).json()).delivery.state).toBe("stock_unconfirmed");
    setClock({ time: "2026-11-15T15:00:00Z" });
    expect(ProductInspection.parse(await (await get(supplier("469672"))).json()).delivery.state).toBe("cutoff_passed");
  });

  it("enforces person, account and site access before any supplier fetch", async () => {
    expect((await get("/products?q=461955", "")).status).toBe(401);
    expect((await get(supplier("461955"), "")).status).toBe(401);
    expect((await get(supplier("461955"), "agent_internal_hotel_aurora")).status).toBe(401);
    expect((await get(supplier("461955", `siteId=other-site&requestedDate=${date}`))).status).toBe(403);
    const other = { ...PEOPLE[0], id: "other-hotel", hotelId: "other-hotel" };
    getDb().prepare("INSERT INTO people (id, json) VALUES (?, ?)").run(other.id, JSON.stringify(other));
    const outsideToken = issueToken({ kind: "person", personId: other.id });
    expect((await get("/products?q=461955", outsideToken)).status).toBe(403);
    expect((await get(supplier("461955"), outsideToken)).status).toBe(403);
    // Product inspection is account-wide; a bar builder can inspect the same supplier catalogue.
    expect((await get(supplier("461955"), issueToken({ kind: "person", personId: "p-mikko" }))).status).toBe(200);
  });

  it("rejects invalid dates and preserves unknown-product 404 without creating state", async () => {
    expect((await get(supplier("461955", "siteId=site-aurora&requestedDate=2026-02-30"))).status).toBe(422);
    expect((await get(supplier("461955", `requestedDate=${date}`))).status).toBe(422);
    expect((await get(supplier("not-a-product"))).status).toBe(404);
  });
});
