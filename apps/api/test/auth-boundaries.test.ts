import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => { process.env.PREVIEW_PASSWORD = ""; });
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

describe("malformed authentication input", () => {
  it("treats an invalid session-cookie escape as unauthenticated", async () => {
    const response = await fetch(`${base}/gateway/v1/mandate`, { headers: { cookie: "aimo_session=%E0%A4%A" } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
  });

  it("rejects an invalid gate cookie without an internal error", async () => {
    process.env.PREVIEW_PASSWORD = "fixture-password";
    const response = await fetch(`${base}/api/session`, { headers: { cookie: "aimo_gate=%E0%A4%A" } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
  });

  it("rejects equal-character-length passwords with different byte lengths", async () => {
    process.env.PREVIEW_PASSWORD = "aaaa";
    const response = await fetch(`${base}/login`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: "ääää" }),
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toContain("That password is not right.");
  });

  it("still accepts the exact UTF-8 password", async () => {
    process.env.PREVIEW_PASSWORD = "fixture-ää";
    const response = await fetch(`${base}/login`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: process.env.PREVIEW_PASSWORD }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
  });
});
