import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "test-preparation-key";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getDb } = await import("../src/db.js");
const { setClock } = await import("../src/clock.js");
const { shortlist } = await import("../src/agent/match.js");
const { needsFromSingle } = await import("../src/agent/plan.js");
const search = await import("../src/search.js");

let server: Server;
let base = "";
let cookie = "";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const session = await call("/session", { personId: "p-aino" });
  cookie = `aimo_session=${session.token}`;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

async function call(path: string, body: unknown, session = cookie): Promise<any> {
  const res = await fetch(`${base}/api${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: session }, body: JSON.stringify(body),
  });
  return { status: res.status, ...await res.json() as object };
}
const snapshot = () => Object.fromEntries(["plans", "questions", "quotes", "orders", "approvals", "audit"].map((table) => [table, getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n]));
const response = (value: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(value) }));
const parsed = (text: string, avoidAllergens = ["AN", "AP"]) => ({ neededByText: "tomorrow", lines: [{
  text, productWord: "milk", productType: "plain drinking milk", productId: null,
  amount: 10, unit: "l", claims: [], avoidAllergens, origin: "fi",
}] });

function stubModel(result: (body: any) => Response | Promise<Response>) {
  const nativeFetch = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (String(input).startsWith(config.openai.baseUrl)) return Promise.resolve(result(JSON.parse(String(init?.body))));
    if (!String(input).startsWith(base)) throw new Error("Preparation must not call a supplier or gateway");
    return nativeFetch(input, init);
  });
}

describe("speculative message preparation", () => {
  it("requires a session and validates the same input bounds as submission", async () => {
    expect((await call("/messages/prepare", { text: "milk" }, "")).status).toBe(401);
    for (const text of ["   ", "x".repeat(2001)]) expect((await call("/messages/prepare", { text })).status).toBe(422);
  });

  it("warms local matches without creating plans, quotes, orders or audit entries", async () => {
    const spy = stubModel(() => { throw new Error("Literal requests must stay local"); });
    const relevance = vi.spyOn(search, "relevance");
    const before = snapshot();
    expect(await call("/messages/prepare", { text: "10 kg chicken burger" })).toEqual({ status: 200, ok: true });
    expect(snapshot()).toEqual(before);
    const searches = relevance.mock.calls.length;
    expect(searches).toBeGreaterThan(0);
    const submitted = await call("/messages", { text: "10 kg chicken burger" });
    shortlist(needsFromSingle(submitted.request)[0]);
    expect(relevance).toHaveBeenCalledTimes(searches);
    expect(spy.mock.calls.every(([url]) => String(url).startsWith(base))).toBe(true);
  });

  it("reuses routing and parsing, resolving dates and person scope again at submit", async () => {
    const text = "Could you source ten litres of Finnish nut-free milk for tomorrow?";
    const names: string[] = [];
    stubModel((body) => {
      names.push(body.text.format.name);
      return response(body.text.format.name === "message_route" ? { new_request: 1, event_change: 0, neither: 0 } : parsed(text));
    });
    setClock({ time: "2026-11-14T10:00:00Z" });
    const before = snapshot();
    await call("/messages/prepare", { text });
    expect(snapshot()).toEqual(before);
    setClock({ time: "2026-11-15T10:00:00Z" });
    const session = await call("/session", { personId: "p-mikko" });
    const submitted = await call("/messages", { text }, `aimo_session=${session.token}`);
    const again = await call("/messages", { text });
    expect(names).toEqual(["message_route", "purchase_request"]);
    expect(submitted.request).toMatchObject({ neededBy: "2026-11-16", outletId: "bar", lines: [{ constraints: { avoidAllergens: ["AN", "AP"], origin: "fi" } }] });
    expect(again.request.lines[0].id).not.toBe(submitted.request.lines[0].id);
  });

  it("shares an in-flight interpretation when Search is pressed before preparation finishes", async () => {
    const text = "Please source 10 l milk without almonds from Finland by tomorrow";
    let release!: (value: Response) => void;
    let calls = 0;
    stubModel(() => { calls++; return new Promise((done) => { release = done; }); });
    const preparing = call("/messages/prepare", { text });
    await vi.waitFor(() => expect(calls).toBe(1));
    const submitting = call("/messages", { text });
    release(response(parsed(text, ["SA"])));
    const [prepared, submitted] = await Promise.all([preparing, submitting]);
    expect(prepared.status).toBe(200);
    expect(submitted.request.lines[0].constraints.avoidAllergens).toEqual(["SA"]);
    expect(calls).toBe(1);
  });

  it("does not reuse a prior draft after the person changes the allergy", async () => {
    const original = "10 l milk without nuts from Finland by tomorrow";
    const edited = "10 l milk without eggs from Finland by tomorrow";
    let calls = 0;
    stubModel((body) => { calls++; return response(parsed(body.input[1].content, body.input[1].content === edited ? ["AE"] : ["AN", "AP"])); });
    await call("/messages/prepare", { text: original });
    const submitted = await call("/messages", { text: edited });
    expect(submitted.request.lines[0].constraints.avoidAllergens).toEqual(["AE"]);
    expect(calls).toBe(2);
  });

  it("retries at submission after a model failure during preparation", async () => {
    const text = "10 l milk without peanuts from Finland by tomorrow";
    let calls = 0;
    stubModel(() => ++calls === 1 ? new Response("unavailable", { status: 503 }) : response(parsed(text, ["AP"])));
    expect((await call("/messages/prepare", { text })).status).toBe(200);
    const submitted = await call("/messages", { text });
    expect(submitted.request.parsedBy).toBe("openai");
    expect(submitted.note).toBeNull();
    expect(submitted.request.lines[0].constraints.avoidAllergens).toEqual(["AP"]);
    expect(calls).toBe(2);
  });
});
