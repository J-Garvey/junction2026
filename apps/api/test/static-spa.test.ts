import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { resolve } from "node:path";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";

// Keep the real catalogue/configuration, but host a tiny built app beneath a
// dot-directory even when the checkout running this test has no hidden ancestor.
vi.mock("../src/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config.js")>();
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  return { ...actual, REPO_ROOT: mkdtempSync(join(tmpdir(), ".aimo-spa-")) };
});

const { REPO_ROOT } = await import("../src/config.js");
const { createApp } = await import("../src/server.js");
const INDEX = "<!doctype html><html><body>Static SPA hosting fixture</body></html>";
const SECRET = "synthetic-secret-must-never-be-served";
let server: Server;
let base: string;
let cookie: string;
const authHeaders = (path: string): Record<string, string> => path.startsWith("/api/")
  ? { Cookie: cookie }
  : { Authorization: "Bearer agent_demo_hotel_aurora" };

beforeAll(async () => {
  const web = resolve(REPO_ROOT, "apps/app/dist");
  mkdirSync(resolve(web, "assets"), { recursive: true });
  mkdirSync(resolve(web, ".git"));
  writeFileSync(resolve(web, "index.html"), INDEX);
  writeFileSync(resolve(web, "assets/app.js"), "console.log('static asset fixture');");
  for (const path of [".env", ".git/config", "assets/.token"]) writeFileSync(resolve(web, path), SECRET);
  writeFileSync(resolve(web, "../outside.txt"), SECRET);
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const login = await fetch(`${base}/api/session`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personId: "p-aino" }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
});

afterAll(async () => {
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  rmSync(REPO_ROOT, { recursive: true, force: true });
});

describe("built SPA hosted below a dot-directory", () => {
  it.each(["/", "/index.html", "/requests", "/events/evt-wedding", "/events/evt-wedding?reload=1"])("serves HTML for direct GET %s", async (path) => {
    const response = await fetch(base + path);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await response.text()).toBe(INDEX);
  });

  it("still serves public assets from the static root", async () => {
    const response = await fetch(`${base}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console.log('static asset fixture');");
  });

  it.each(["/api/products/not-a-product", "/gateway/v1/products/not-a-product", "/gateway/v1/orders/not-an-order"])("preserves JSON 404 for missing resource %s", async (path) => {
    const response = await fetch(base + path, { headers: authHeaders(path) });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toHaveProperty("error");
  });

  it.each(["/api/not-a-route", "/gateway/v1/not-a-route", "/gateway/not-a-route"])("keeps unknown endpoint %s out of the SPA", async (path) => {
    const response = await fetch(base + path, { headers: authHeaders(path) });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Static SPA hosting fixture");
  });

  it.each(["/.env", "/%2eenv", "/.git/config", "/assets/.token", "/..%2foutside.txt", "/%2e%2e%5coutside.txt"])("does not expose hidden or out-of-root file %s", async (path) => {
    const response = await fetch(base + path);
    // The fallback may serve only the known index, never the requested file.
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe(INDEX);
    expect(body).not.toContain(SECRET);
  });
});
