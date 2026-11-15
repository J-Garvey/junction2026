/** Synthetic database reads only: ephemeral HTTP port, in-memory DB, no external calls. */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

Object.assign(process.env, { AIMO_DB: ":memory:", AIMO_MODE: "fixture", AIMO_TEST_MODE: "1", OPENAI_API_KEY: "", PREVIEW_PASSWORD: "", AIMO_SEARCH_LOG: "off" });
const { createApp } = await import("../server.js");
const { config } = await import("../config.js");
const { getDb, tx } = await import("../db.js");
const { getEvent, saveEvent } = await import("../agent/events.js");
const { newPlan, savePlan } = await import("../agent/plan.js");
const { makeQuestion, saveQuestion } = await import("../agent/questions.js");
const { issueToken } = await import("../identity.js");
const { SEED_EVENT } = await import("../seed.js");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  if (!String(input).startsWith("http://127.0.0.1:")) throw new Error("External calls disabled in database benchmark");
  return nativeFetch(input, init);
};
const server = createApp().listen(0, "127.0.0.1");
server.keepAliveTimeout = 60_000;
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
config.gatewayUrl = `${base}/gateway/v1`;
const token = issueToken({ kind: "person", personId: "p-aino" });
const events = 60, plansPerEvent = 10, questionsPerEvent = 10;
try {
  const template = getEvent(SEED_EVENT.id)!;
  tx(() => {
    for (let i = 0; i < events; i++) {
      const eventId = `perf-event-${i}`;
      saveEvent({ ...template, id: eventId, name: `Synthetic event ${i}`, dishes: [] });
      for (let j = 0; j < plansPerEvent; j++) {
        savePlan(newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", {
          id: `perf-plan-${i}-${j}`, eventId, title: `Synthetic request ${j}`,
          note: "Synthetic saved request evidence. ".repeat(128),
        }));
      }
      for (let j = 0; j < questionsPerEvent; j++) {
        saveQuestion(makeQuestion({
          planId: `perf-plan-${i}-0`, eventId, quoteId: null, fingerprint: null,
          type: "ambiguous_type", forRole: "chef", outletId: "banquet", deadline: null,
          title: "Synthetic product decision", body: "Benchmark fixture", ruleIds: [], options: [],
          facts: { evidence: "Synthetic saved question evidence. ".repeat(64) },
        }));
      }
    }
  });
  const measurements = [];
  for (const path of ["/api/baskets", "/api/events", "/api/baskets/perf-event-0"]) {
    const samples = [];
    let responseHash = "";
    for (let pass = 0; pass < 4; pass++) {
      const start = performance.now();
      const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.text();
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      // Questions have random IDs; compare stable list responses across revisions.
      if (!path.endsWith("perf-event-0")) responseHash = createHash("sha256").update(body).digest("hex");
      if (pass) samples.push(+(performance.now() - start).toFixed(2));
    }
    measurements.push({ path, medianMs: [...samples].sort((a, b) => a - b)[1], samplesMs: samples, responseHash });
  }
  const report = { fixture: { events, plans: events * plansPerEvent, questions: events * questionsPerEvent }, measurements,
    limitations: "Synthetic in-memory database; local HTTP; no model or supplier calls; excludes startup and warmup." };
  const out = process.argv.indexOf("--out");
  if (out >= 0) writeFileSync(process.argv[out + 1], JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  getDb().close();
}
