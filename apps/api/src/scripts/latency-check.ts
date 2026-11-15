/** Isolated HTTP latency check. The default model is scripted; --live-model uses configured OpenAI. */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";

const live = process.argv.includes("--live-model");
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const modelDelayMs = process.argv.includes("--model-delay-ms") ? Number(arg("--model-delay-ms")) : 100;
process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
process.env.AIMO_SEARCH_LOG = "off";
if (!live) process.env.OPENAI_API_KEY = "scripted-latency-check";
const { config } = await import("../config.js");
if (live && !config.openai.apiKey) throw new Error("--live-model needs the existing OPENAI_API_KEY");
const nativeFetch = globalThis.fetch;
let modelCalls = 0;
globalThis.fetch = async (input, init) => {
  if (!String(input).startsWith(`${config.openai.baseUrl}/responses`)) {
    if (!String(input).startsWith("http://127.0.0.1:")) throw new Error("Supplier/external calls are disabled in the latency check");
    return nativeFetch(input, init);
  }
  modelCalls++;
  if (live) return nativeFetch(input, init);
  await delay(modelDelayMs);
  const body = JSON.parse(String(init?.body));
  const name = body.text.format.name;
  const output = name === "message_route" ? { new_request: 1, event_change: 0, neither: 0 } : {
    neededByText: "tomorrow",
    lines: [{ text: body.input[1].content, productWord: "milk", productType: "plain drinking milk", productId: null, amount: 10, unit: "l", claims: [], avoidAllergens: ["AN", "AP"], origin: "fi" }],
  };
  return new Response(JSON.stringify({ output_text: JSON.stringify(output) }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const { createApp } = await import("../server.js");
const { searchMatches } = await import("../catalog.js");
const { setClock } = await import("../clock.js");
const server = createApp().listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.gatewayUrl = `${base}/gateway/v1`;
setClock({ time: "2026-11-14T10:00:00Z" });
let token = "";
const samples: { scenario: string; elapsedMs: number; modelCalls: number | null; route?: string; parsedBy?: string; lines?: number; note?: string | null; query?: string; limit?: number; resultHash?: string }[] = [];
const resultHash = (matches: ReturnType<typeof searchMatches>) => createHash("sha256").update(JSON.stringify(matches.map((m) => [m.product.id, m.tier, m.role]))).digest("hex");
async function call(path: string, body: unknown) {
  const response = await fetch(`${base}/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const result: any = await response.json();
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return result;
}
async function message(scenario: string, text: string) {
  const start = performance.now(), calls = modelCalls;
  const result = await call("/messages", { text });
  samples.push({ scenario, elapsedMs: +(performance.now() - start).toFixed(2), modelCalls: scenario === "complex-concurrent" ? null : modelCalls - calls, route: result.route, parsedBy: result.request?.parsedBy, lines: result.request?.lines.length, note: result.note });
  if (!result.request) throw new Error(`${scenario}: no interpreted request (${result.route})`);
}
try {
  let concurrent: { elapsedMs: number; modelCalls: number; requests: number } | null = null;
  if (!process.argv.includes("--search-only")) {
  token = (await call("/session", { personId: "p-aino" })).token;
  for (let i = 0; i < 10; i++) await message("literal", "10 kg chicken burger");
  const complex = "Please source 10 l of milk without nuts from Finland by tomorrow";
  for (let i = 0; i < 3; i++) await message("complex-repeat", complex);
  const concurrentStart = performance.now(), concurrentCalls = modelCalls;
  await Promise.all(Array.from({ length: live ? 4 : 8 }, () => message("complex-concurrent", `${complex} for breakfast`)));
  concurrent = { elapsedMs: +(performance.now() - concurrentStart).toFixed(2), modelCalls: modelCalls - concurrentCalls, requests: live ? 4 : 8 };
  for (let i = 0; i < 3; i++) await message("route-and-parse-repeat", "Please find Finnish nut-free milk for tomorrow");
  const large = Array.from({ length: 60 }, (_, i) => `${i + 1} kg ${["salmon fillet", "chicken burger", "butter", "potatoes"][i % 4]}`).join("; ");
  for (let i = 0; i < 5; i++) await message("literal-60-items", large);
  }
  const queries = ["milk", "butter", "salmon fillet", "chicken burger", "oat milk", "coffee", "cheese", "bread", "potatoes", "cream cheese"];
  for (let pass = 0; pass < 2; pass++) for (const q of queries) {
    const start = performance.now();
    const matches = searchMatches({ q, limit: 50 });
    samples.push({ scenario: pass ? "catalog-warm" : "catalog-cold", elapsedMs: +(performance.now() - start).toFixed(2), modelCalls: 0, query: q, limit: 50, resultHash: resultHash(matches) });
  }
  for (const limit of [5, 10, 25]) for (const q of queries) {
    const start = performance.now();
    const matches = searchMatches({ q, limit });
    samples.push({ scenario: "catalog-varied-limit", elapsedMs: +(performance.now() - start).toFixed(2), modelCalls: 0, query: q, limit, resultHash: resultHash(matches) });
  }
  const percentile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * p) - 1)];
  const scenarios = [...new Set(samples.map((s) => s.scenario))].map((scenario) => {
    const rows = samples.filter((s) => s.scenario === scenario), times = rows.map((s) => s.elapsedMs);
    return { scenario, requests: rows.length, p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), firstMs: times[0], lastMs: times.at(-1) };
  });
  const report = { at: new Date().toISOString(), sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), worktreeDirty: Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()), modelMode: live ? "configured-real-model" : "scripted-model", model: live ? config.openai.model : "scripted", modelDelayMs: live ? null : modelDelayMs, modelCalls, concurrent, scenarios, samples, limitations: ["Synthetic database; no supplier calls or placed orders", "Catalog timings measure local search, message timings measure actual HTTP routing and parsing", "Concurrent per-request model call counts are null; aggregate counts are reported separately", ...(!live ? ["Model network time is simulated; this measures avoided calls and HTTP overhead, not live OpenAI latency"] : [])] };
  if (process.argv.includes("--out")) writeFileSync(arg("--out"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
