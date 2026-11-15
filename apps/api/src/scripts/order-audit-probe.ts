/** Auditor-owned, offline evidence capture. Expected intent lives in JSON, not parser code. */
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const destination = process.argv[2];
if (!destination) throw new Error("Pass an external evidence JSONL path");
const allCases = JSON.parse(readFileSync(new URL("../../../../scripts/fixtures/order-audit-cases.json", import.meta.url), "utf8"));
const selectedIds = process.argv[3]?.split(",");
const cases = selectedIds ? allCases.filter((c: any) => selectedIds.includes(c.caseId)) : allCases;
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const { createApp } = await import("../server.js");
const { config } = await import("../config.js");
const { kvSet } = await import("../db.js");
const { searchMatches } = await import("../catalog.js");
const { interpretWhatsApp } = await import("../whatsapp/interpreter.js");
const nativeFetch = globalThis.fetch;
const intercepted: string[] = [];
const gatewayQuoteRequests: any[] = [];
globalThis.fetch = (async (url: any, options: any) => {
  const target = new URL(String(url));
  if (target.hostname !== "127.0.0.1") {
    intercepted.push(`${target.origin}${target.pathname}`);
    throw new Error("Auditor network boundary: nonlocal call intercepted");
  }
  if (target.pathname === "/gateway/v1/quotes" && options?.method === "POST") {
    gatewayQuoteRequests.push({ method: "POST", path: target.pathname, body: JSON.parse(options.body) });
  }
  return nativeFetch(url, options);
}) as typeof fetch;
const server = createApp().listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.gatewayUrl = `${base}/gateway/v1`;
let token = "";
async function call(path: string, body?: any) {
  const r = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, response: await r.json() };
}
try {
  await call("/reset", {});
  kvSet("dataMode", { mode: "fixture", overlay: null });
  token = (await call("/session", { personId: "p-aino" })).response.token;
  await call("/clock", { time: "2026-11-14T10:00:00Z" });
  for (const c of cases) {
    intercepted.length = 0;
    gatewayQuoteRequests.length = 0;
    const start = performance.now();
    let result: any;
    if (c.channel === "whatsapp_coordinator") {
      await call("/reset", {});
      kvSet("dataMode", { mode: "fixture", overlay: null });
      token = (await call("/session", { personId: "p-aino" })).response.token;
      await call("/clock", { time: c.clock ?? "2026-11-14T10:00:00Z" });
      await call("/whatsapp/connect", {});
      const baskets: Record<string, string> = {};
      for (const name of ["Darragh", "Pavit", "Conference"]) {
        baskets[name] = (await call("/baskets", { name, deliveryDate: "2026-11-16" })).response.basket.id;
      }
      const setup: any[] = [];
      if (c.seed) {
        for (const name of ["Darragh", "Pavit"]) {
          const parsed = (await call("/messages", { text: "2 kg salmon 469672" })).response;
          const planned = await call("/requests", { request: { ...parsed.request, neededBy: "2026-11-16" }, eventId: baskets[name], reviewing: true });
          const plan = planned.response.plan;
          const staged = plan ? await call(`/plans/${plan.id}/basket`, { continueWithWarnings: true }) : null;
          setup.push({ name, planned, staged });
        }
      }
      const observations: any[] = [];
      const snapshots = async () => Object.fromEntries(await Promise.all(Object.entries(baskets).map(async ([name, id]) => [name, await call(`/baskets/${id}`)])));
      const initial = await snapshots();
      for (let i = 0; i < c.sequence.length; i++) {
        const step = c.sequence[i];
        const text = typeof step === "string" ? step : step.text;
        const deliveryId = typeof step === "string" ? `${c.caseId}-${i}` : `${c.caseId}-${step.id}`;
        const output = await call("/whatsapp/messages", { id: deliveryId, text, groupId: "demo-hotel-orders" });
        const pending = output.response.conversation?.pending;
        observations.push({ text, deliveryId, output, baskets: await snapshots(), orders: await call("/orders"),
          plan: pending?.planId ? await call(`/plans/${pending.planId}`) : null });
      }
      result = { status: 200, response: { setup, initial, observations }, scenario: { clock: c.clock ?? "2026-11-14T10:00:00Z", baskets } };
    } else if (c.channel === "whatsapp_interpreter") {
      const context = { activeOrderId: "ord-darragh", pending: null, lines: [], orders: [
        { id: "ord-darragh", name: "Darragh", deliveryDate: "2026-11-16", version: 1 },
        { id: "ord-pavit", name: "Pavit", deliveryDate: "2026-11-17", version: 1 },
      ], ...c.context };
      result = { status: 200, response: { interpretation: await interpretWhatsApp(c.input, context) } };
    } else {
      result = await call("/messages", { text: c.input });
      if (c.inspectCatalog && result.response.request) {
        result.response.catalogSearch = result.response.request.lines.map((line: any) => ({ query: line.query,
          matches: searchMatches({ q: line.query, limit: 50 }).map((m) => ({ tier: m.tier, id: m.product.id, name: m.product.name })) }));
      }
      if (c.plan && result.response.request) {
        const planning = await call("/requests", { request: { ...result.response.request, neededBy: "2026-11-16" }, reviewing: true });
        result.response.planResponse = planning;
      }
    }
    const row = { ...c, attemptId: `${c.caseId}-${sha.slice(0, 8)}-${Date.now()}`, timestamp: new Date().toISOString(),
      codeSha: sha, source: "auditor-hand-authored", parserModelMode: "disabled/fallback", stage: c.plan ? "plan" : "parse",
      http: c.channel === "whatsapp_interpreter" ? null : { method: "POST", path: c.channel === "whatsapp_coordinator" ? "/api/whatsapp/messages" : "/api/messages", body: { text: c.input } },
      ...result, gatewayQuoteRequests: [...gatewayQuoteRequests], elapsedMs: performance.now() - start, network: { upstreamBlocked: true, intercepted: [...intercepted] } };
    appendFileSync(destination, JSON.stringify(row) + "\n");
    console.log(JSON.stringify({ caseId: c.caseId, status: result.status, parsedLines: result.response.request?.lines?.length, intercepted: intercepted.length }));
  }
} finally {
  server.close();
  globalThis.fetch = nativeFetch;
}
