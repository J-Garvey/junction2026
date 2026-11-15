import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Server } from "node:http";
import { ProductDetails } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { getProduct, getProductDetails } = await import("../src/catalog.js");
const { config } = await import("../src/config.js");
const { createApp } = await import("../src/server.js");

describe("expanded product information", () => {
  it("serves every committed catalogue record with its extra fields under the response contract", () => {
    const records = readFileSync(resolve(config.dataDir, "products_slim.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(records.length).toBeGreaterThan(17000);
    for (const record of records) {
      const result = ProductDetails.safeParse(getProductDetails(String(record.id)));
      if (!result.success) throw new Error(`Invalid details for ${record.id}: ${result.error.message}`);
      expect(result.data.catalogueDetails.freeFrom).toEqual(record.free_from ?? []);
      expect(result.data.catalogueDetails.variableWeight).toBe(record.var_weight ?? null);
    }
  });

  it("joins both ingredient languages and retains zero nutrition values without changing the search product", () => {
    const detail = getProductDetails("460000")!;
    expect(detail).toMatchObject(getProduct("460000")!);
    expect(detail.catalogueDetails).toMatchObject({ gtin: "6409460002724", baseUnit: "RAS", netWeightKg: 0.4, units: { PAL: 50, KI: 5, RAS: 1 } });
    expect(detail.catalogueDetails.ingredientsEn).toContain("potato");
    expect(detail.catalogueDetails.ingredientsFi).toContain("peruna");
    expect(detail.nutrition?.lactose).toBe(0);
    expect(getProduct("460000")).not.toHaveProperty("catalogueDetails");
    expect(getProductDetails("not-a-product")).toBeNull();
  });

  it("retains deposit material and quantities without inventing a deposit price", () => {
    expect(getProductDetails("460123")?.catalogueDetails.deposits).toEqual([{ material: "3", unit: "ST", quantity: 12 }]);
  });
});

describe("product details endpoint", () => {
  let server: Server;
  let base: string;
  let cookie: string;
  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const login = await fetch(`${base}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-aino" }) });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
  });
  afterAll(() => server.close());

  it("requires a person session, returns full local details and preserves unknown-product 404", async () => {
    expect((await fetch(`${base}/api/products/460000`)).status).toBe(401);
    const response = await fetch(`${base}/api/products/460000`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(ProductDetails.parse(await response.json()).catalogueDetails.gtin).toBe("6409460002724");
    expect((await fetch(`${base}/api/products/not-a-product`, { headers: { Cookie: cookie } })).status).toBe(404);
  });
});
