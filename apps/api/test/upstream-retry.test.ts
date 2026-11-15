/**
 * A 429 from Valio Aimo's mock (rate limits undisclosed) is retried with a short back-off, and if it
 * persists the person gets a clear 503, never a 500 "internal". A local stand-in plays the mock.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "live";
process.env.PREVIEW_PASSWORD = "";
const { config } = await import("../src/config.js");
const { lookup, UpstreamError } = await import("../src/aimo/lookup.js");
const { createApp } = await import("../src/server.js");
const { appErrors } = await import("../src/app/routes.js");
const { GatewayError } = await import("../src/agent/gatewayClient.js");

/** How many 429s the stand-in sends before answering, and what it saw. */
let refuse = 0;
let retryAfter: string | null = null;
const calls: string[] = [];
let mock: Server;
let app: Server;
let GATEWAY = "";

beforeAll(async () => {
  mock = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push(req.url!);
      if (refuse > 0) {
        refuse--;
        res.writeHead(429, { "Content-Type": "application/json", ...(retryAfter ? { "Retry-After": retryAfter } : {}) });
        return res.end(JSON.stringify({ detail: "Too Many Requests" }));
      }
      const products: string[] = JSON.parse(body).products;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(req.url === "/api/price"
        ? { products: products.map((productId) => ({ productId, error: true })) }
        : { timeNow: "2026-11-14T12:00:00+0200", products: products.map((productId) => ({ productId, salesBlock: false, scheduleLines: [] })) }));
    });
  });
  await new Promise<void>((r) => mock.listen(0, "127.0.0.1", r));
  config.aimoBase = `http://127.0.0.1:${(mock.address() as { port: number }).port}`;
  config.aimoKey = "test-key";
  config.aimoRetryDelaysMs = [5, 5];
  config.aimoRetryAfterCapMs = 50;
  app = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => app.once("listening", r));
  GATEWAY = `http://127.0.0.1:${(app.address() as { port: number }).port}/gateway/v1`;
});
afterAll(() => {
  mock.close();
  app.close();
});
beforeEach(() => {
  refuse = 0;
  retryAfter = null;
  calls.length = 0;
});

// Ids the saved fixture doesn't hold, so the lookup has to reach the stand-in.
const IDS = ["999901", "999902"];
const live = { mode: "live" as const, overlay: null };

describe("Valio Aimo rate limits", () => {
  it("retries a 429 and succeeds once the mock answers", async () => {
    refuse = 2;
    const r = await lookup(IDS, "2026-11-16", live);
    expect(r.lines.map((l) => l.productId)).toEqual(IDS);
    expect(r.lines.every((l) => l.source === "live")).toBe(true);
    expect(calls.length).toBe(4); // two refusals, then price and availability
  });

  it("honours Retry-After, up to the cap", async () => {
    refuse = 1;
    retryAfter = "0";
    const t = Date.now();
    await lookup(IDS, "2026-11-16", live);
    expect(Date.now() - t).toBeLessThan(2000);
  });

  it("gives up after the retries with a clear rate-limit error", async () => {
    refuse = 100;
    retryAfter = "30";
    const err = await lookup(IDS, "2026-11-16", live).then(() => null, (e) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err.rateLimited).toBe(true);
    expect(err.retryAfterSeconds).toBe(30);
    expect(err.message).toMatch(/rate-limiting requests \(HTTP 429.*3 tries\)\. Try again in a minute/);
  });

  it("the gateway answers 503 upstream_rate_limited with Retry-After, not 500", async () => {
    refuse = 100;
    retryAfter = "30";
    const r = await fetch(`${GATEWAY}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer agent_demo_hotel_aurora" },
      body: JSON.stringify({ productIds: IDS, requestedDate: "2026-11-16" }),
    });
    expect(r.status).toBe(503);
    expect(r.headers.get("retry-after")).toBe("30");
    const body = (await r.json()) as any;
    expect(body).toMatchObject({ error: "upstream_rate_limited", retryAfter: 30 });
    expect(body.message).toMatch(/Nothing has been ordered/);
  });

  it("an app route turns the gateway's 503 into a clear 503, not a 500 internal", () => {
    let status = 0;
    let json: any = null;
    const headers: Record<string, string> = {};
    const res = { status: (s: number) => ((status = s), res), json: (b: unknown) => ((json = b), res), setHeader: (k: string, v: string) => (headers[k] = v) } as any;
    let passed = false;
    appErrors(new GatewayError(503, { error: "upstream_rate_limited", message: "Valio Aimo's API is rate-limiting requests.", retryAfter: 30 }), {} as any, res, () => (passed = true));
    expect(passed).toBe(false);
    expect(status).toBe(503);
    expect(headers["Retry-After"]).toBe("30");
    expect(json).toMatchObject({ error: "upstream_rate_limited", retryAfter: 30 });
  });

  it("other gateway refusals keep their own status, without Retry-After", () => {
    let status = 0;
    const headers: Record<string, string> = {};
    const res = { status: (s: number) => ((status = s), res), json: () => res, setHeader: (k: string, v: string) => (headers[k] = v) } as any;
    appErrors(new GatewayError(409, { error: "quote_stale", message: "stale" }), {} as any, res, () => undefined);
    expect(status).toBe(409);
    expect(headers["Retry-After"]).toBeUndefined();
  });
});
