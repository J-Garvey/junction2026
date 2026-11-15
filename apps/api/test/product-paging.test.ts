/**
 * PRODUCT-SEARCH is never limited to its first page: `total` counts every match and
 * `offset` / `nextOffset` load the rest in the same order. Local catalogue only.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { searchMatches, searchPage } = await import("../src/catalog.js");

let BASE = "";
let server: Server;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/gateway/v1`;
});
afterAll(() => server.close());

const search = async (qs: string) => {
  const r = await fetch(`${BASE}/products?${qs}`, { headers: { Authorization: "Bearer agent_demo_hotel_aurora" } });
  return { status: r.status, body: (await r.json()) as any };
};

describe("product search loads every match", () => {
  it("pages through all cheese matches in one fixed order", () => {
    const { total } = searchPage({ q: "cheese", limit: 50 });
    expect(total).toBeGreaterThan(50);
    const ids: string[] = [];
    for (let offset = 0; offset < total; offset += 50) ids.push(...searchPage({ q: "cheese", limit: 50, offset }).matches.map((m) => m.product.id));
    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(ids.slice(0, 50)).toEqual(searchMatches({ q: "cheese", limit: 50 }).map((m) => m.product.id));
    expect(searchPage({ q: "cheese", limit: 50, offset: total }).matches).toEqual([]);
  });

  it("pages without text too, by product id", () => {
    const { total, matches } = searchPage({ category: "10400", limit: 10 });
    expect(total).toBeGreaterThan(10);
    const next = searchPage({ category: "10400", limit: 10, offset: 10 }).matches;
    expect(next[0].product.id > matches[9].product.id).toBe(true);
  });

  it("the gateway returns total and nextOffset until the last page", async () => {
    const first = await search("q=cheese&limit=200");
    expect(first.status).toBe(200);
    expect(first.body.products).toHaveLength(200);
    expect(first.body.total).toBeGreaterThan(200);
    expect(first.body.nextOffset).toBe(200);
    let offset: number | null = first.body.nextOffset;
    let loaded = first.body.products.length;
    while (offset !== null) {
      const page = await search(`q=cheese&limit=200&offset=${offset}`);
      expect(page.body.offset).toBe(offset);
      loaded += page.body.products.length;
      offset = page.body.nextOffset;
    }
    expect(loaded).toBe(first.body.total);
  });

  it("refuses a page size above 200", async () => {
    expect((await search("q=cheese&limit=201")).status).toBe(422);
  });
});
