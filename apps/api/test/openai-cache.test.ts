import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.OPENAI_API_KEY = "test-cache-key";
process.env.AIMO_DB = ":memory:";
const { config } = await import("../src/config.js");
const { structured, ModelUnavailable } = await import("../src/agent/openai.js");
const original = { ...config.openai };
const response = (value: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(value) }), { status: 200 });
let seq = 0;
function options() {
  return { name: `cache-test-${seq++}`, system: "Test structured interpretation", user: "same exact input", schema: { type: "object" }, validate: (value: unknown) => {
    if (!value || typeof (value as any).answer !== "string") throw new ModelUnavailable("invalid interpretation");
    return value as { answer: string; values?: number[] };
  } };
}
beforeEach(() => Object.assign(config.openai, original));
afterEach(() => { vi.restoreAllMocks(); Object.assign(config.openai, original); });

describe("model request reuse", () => {
  it("shares one in-flight call and gives simultaneous callers independent results", async () => {
    let release!: (value: Response) => void;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const opts = options();
    const requests = Array.from({ length: 8 }, () => structured(opts));
    expect(fetch).toHaveBeenCalledTimes(1);
    release(response({ answer: "yes", values: [1] }));
    const results = await Promise.all(requests);
    results[0].values!.push(2);
    results[0].answer = "edited";
    expect(results[1]).toEqual({ answer: "yes", values: [1] });
    expect(await structured(opts)).toEqual({ answer: "yes", values: [1] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("expires a validated interpretation after five minutes without extending its TTL on a hit", async () => {
    const date = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const opts = options();
    await structured(opts);
    date.mockReturnValue(1_299_999);
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(1);
    date.mockReturnValue(1_300_000);
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("separates exact inputs, prompts, schemas, model settings and credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const opts = options();
    await structured(opts);
    await structured({ ...opts, user: "different input" });
    await structured({ ...opts, system: "different instructions" });
    await structured({ ...opts, schema: { type: "object", title: "new schema" } });
    config.openai.model += "-changed";
    await structured(opts);
    config.openai.reasoningEffort = "high";
    await structured(opts);
    config.openai.baseUrl += "/different";
    await structured(opts);
    config.openai.apiKey = "different-test-key";
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(8);
    config.openai.apiKey = "";
    await expect(structured(opts)).rejects.toThrow("OPENAI_API_KEY is not set");
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it("does not retain model errors, invalid JSON or failed validations", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary failure", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "not JSON" })))
      .mockResolvedValueOnce(response({ answer: 12 }))
      .mockResolvedValueOnce(response({ answer: "recovered" }));
    const opts = options();
    for (let i = 0; i < 3; i++) await expect(structured(opts)).rejects.toBeInstanceOf(ModelUnavailable);
    expect(await structured(opts)).toEqual({ answer: "recovered" });
    expect(fetch).toHaveBeenCalledTimes(4);
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("revalidates cached data and evicts it if the caller's validation changes", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const opts = options();
    await structured(opts);
    await expect(structured({ ...opts, validate: () => { throw new ModelUnavailable("stricter validation"); } })).rejects.toThrow("stricter validation");
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("only coalesces unvalidated answers while they are in flight", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const { validate: _validate, ...opts } = options();
    await Promise.all([structured(opts), structured(opts)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await structured(opts);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache and skips oversized responses", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const first = options();
    await structured(first);
    for (let i = 0; i < 128; i++) await structured(options());
    await structured(first);
    expect(fetch).toHaveBeenCalledTimes(130);
    const big = options();
    fetch.mockImplementation(async () => response({ answer: "x".repeat(100_001) }));
    await structured(big);
    await structured(big);
    expect(fetch).toHaveBeenCalledTimes(132);
  });

  it("does not evict unrelated interpretations for each caller of one shared request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => response({ answer: "yes" }));
    const retained = Array.from({ length: 127 }, options);
    for (const opts of retained) await structured(opts);
    const shared = options();
    await Promise.all(Array.from({ length: 8 }, () => structured(shared)));
    await structured(retained[0]);
    expect(fetch).toHaveBeenCalledTimes(128);
  });
});

describe("cached request interpretations retain parser boundaries", () => {
  it("uses fresh line IDs and resolves relative dates against the current business clock", async () => {
    const { parseRequest } = await import("../src/agent/parse.js");
    const { setClock } = await import("../src/clock.js");
    const text = "Please source 10 l milk without nuts from Finland by tomorrow";
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ neededByText: "tomorrow", lines: [{ text, productWord: "milk", productType: "plain drinking milk", productId: null, amount: 10, unit: "l", claims: [], avoidAllergens: ["AN", "AP"], origin: "fi" }] }));
    setClock({ time: "2026-11-14T10:00:00Z" });
    const first = await parseRequest(text);
    first.request.lines[0].constraints.avoidAllergens.push("AE");
    setClock({ time: "2026-11-15T10:00:00Z" });
    const second = await parseRequest(text);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.request.neededBy).toBe("2026-11-15");
    expect(second.request.neededBy).toBe("2026-11-16");
    expect(second.request.lines[0].id).not.toBe(first.request.lines[0].id);
    expect(second.request.lines[0].constraints).toMatchObject({ origin: "fi", avoidAllergens: ["AN", "AP"] });
  });

  it("does not remember a model answer that drops an explicit allergy", async () => {
    const { parseRequest } = await import("../src/agent/parse.js");
    const text = "10 kg butter without nuts from Finland";
    const line = { text, productWord: "butter", productType: "butter", productId: null, amount: 10, unit: "kg", claims: [], avoidAllergens: [], origin: "fi" };
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ neededByText: null, lines: [line] }))
      .mockResolvedValueOnce(response({ neededByText: null, lines: [{ ...line, avoidAllergens: ["AN", "AP"] }] }));
    expect((await parseRequest(text)).note).toContain("missed an explicit allergy");
    expect((await parseRequest(text)).request.parsedBy).toBe("openai");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses validated routing without caching malformed route scores", async () => {
    const { messageRoute } = await import("../src/agent/judge.js");
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response({ new_request: -1, event_change: 2, neither: 0 }))
      .mockResolvedValueOnce(response({ new_request: 1, event_change: 0, neither: 0 }));
    const text = "Could you source Finnish nut-free milk for the kitchen?";
    expect((await messageRoute(text)).route).toBe("unsure");
    expect((await messageRoute(text)).route).toBe("new_request");
    expect((await messageRoute(text)).route).toBe("new_request");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
