import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type { Plan, Question, SingleRequest } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { gw } = await import("../src/agent/gatewayClient.js");
const { getPlan, savePlan } = await import("../src/agent/plan.js");
const { planMilestone, savedParsingMs, processingClock } = await import("../src/app/processing.js");
const messages = await import("../src/agent/message.js");

let server: Server, base = "", cookie = "";
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
beforeEach(async () => {
  seedReset();
  cookie = "";
  const session = await call("/session", { personId: "p-aino" });
  cookie = `aimo_session=${session.token}`;
  setClock({ time: "2026-11-14T10:00:00Z" });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => server.close());

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${base}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { httpStatus: res.status, ...await res.json() as object };
}

/** Advance only inside real processing operations; long gaps simulate human waiting. */
function measuredOperations() {
  let elapsed = 0;
  vi.spyOn(processingClock, "now").mockImplementation(() => elapsed);
  const interpret = messages.interpretMessage;
  vi.spyOn(messages, "interpretMessage").mockImplementation(async (...args) => { elapsed += 250; return interpret(...args); });
  const lookup = gw.lookup, quote = gw.quote, order = gw.order;
  vi.spyOn(gw, "lookup").mockImplementation(async (...args) => { elapsed += 100; return lookup(...args); });
  vi.spyOn(gw, "quote").mockImplementation(async (...args) => { elapsed += 300; return quote(...args); });
  vi.spyOn(gw, "order").mockImplementation(async (...args) => { elapsed += 200; return order(...args); });
  return { wait: () => { elapsed += 3_600_000; } };
}

describe("submitted stage processing", () => {
  it("includes saved parsing and quote creation, excludes human waits, and preserves step timings", async () => {
    const clock = measuredOperations();
    const parsed = await call("/messages", { text: "40 l lactose-free milk by Monday" });
    expect(savedParsingMs(parsed.request, "p-aino")).toBe(250);
    clock.wait(); // The chef reviews the editable chips for an hour.
    const proposed = await call("/requests", { request: parsed.request });
    expect(proposed.httpStatus).toBe(200);
    expect(proposed.plan.processing).toEqual({ stage: "Request", milestone: "chef_input", parsingMs: 250, totalMs: 650, segments: 1 });
    expect(proposed.plan.timings).toMatchObject({ searchMs: expect.any(Number), lookupMs: expect.any(Number), rankMs: expect.any(Number), quoteMs: expect.any(Number), totalMs: expect.any(Number) });
    expect(proposed.plan.timings.totalMs).toBeGreaterThanOrEqual(proposed.plan.timings.quoteMs);
    clock.wait();
    const accepted = await call(`/plans/${proposed.plan.id}/accept`, {});
    expect(accepted.plan.processing).toMatchObject({ totalMs: 1050, parsingMs: 250, segments: 2, milestone: "chef_input" });
    const stock = accepted.questions.find((q: Question) => q.type === "unknown_stock" && q.state === "open");
    clock.wait();
    const answered = await call(`/questions/${stock.id}/answer`, { optionId: "continue" });
    expect(answered.plan.processing).toMatchObject({ totalMs: 1650, parsingMs: 250, segments: 3, milestone: "ordered" });
    expect(answered.plan.timings.totalMs).toBeGreaterThanOrEqual(answered.plan.timings.quoteMs);
    // Saved reads, duplicate decisions and arbitrary fixture-clock movement cannot add time.
    clock.wait();
    setClock({ time: "2026-08-01T10:00:00Z" });
    const saved = (await call(`/plans/${proposed.plan.id}`)).plan.processing;
    expect(saved).toEqual(answered.plan.processing);
    expect((await call(`/questions/${stock.id}/answer`, { optionId: "continue" })).httpStatus).toBe(409);
    expect((await call(`/plans/${proposed.plan.id}`)).plan.processing).toEqual(saved);
  });

  it("omits unknown legacy timing and ignores forged or unrelated parsing references", async () => {
    measuredOperations();
    const parsed = await call("/messages", { text: "1 kg salmon 469672" });
    expect(savedParsingMs(parsed.request, "p-sanna")).toBeUndefined();
    expect(savedParsingMs({ ...parsed.request, originalText: "another message" }, "p-aino")).toBeUndefined();
    expect(savedParsingMs({ ...parsed.request, parseAuditId: "invented", processingMs: 999 } as SingleRequest, "p-aino")).toBeUndefined();
    const request = { ...parsed.request, parseAuditId: undefined, neededBy: "2026-11-16" };
    const result = await call("/requests", { request });
    expect(result.plan.processing).toMatchObject({ totalMs: 400, segments: 1, milestone: "review_ready" });
    expect(result.plan.processing.parsingMs).toBeUndefined();
    const legacy = getPlan(result.plan.id)!;
    delete legacy.processing;
    savePlan(legacy);
    expect((await call(`/plans/${legacy.id}`)).plan.processing).toBeUndefined();
  });

  it("starts independent event-stage totals, including changes with no order plan", async () => {
    const clock = measuredOperations();
    setClock({ time: "2026-08-14T10:00:00Z" });
    const initial = await call("/events/evt-wedding/viability", {});
    expect(initial.plan.processing).toMatchObject({ stage: "Viability check", milestone: "viability_checked", totalMs: 100, segments: 1 });
    clock.wait();
    setClock({ time: "2026-08-14T10:00:00Z" });
    const view = await call("/events/evt-wedding");
    const changed = await call("/events/evt-wedding/change", { guests: 194, version: view.event.version });
    expect(changed.event.processing).toMatchObject({ stage: "Event change", milestone: "change_checked", totalMs: 100, segments: 1 });
    clock.wait();
    const ordered = await call("/events/evt-wedding/order", {});
    expect(ordered.plan.processing).toMatchObject({ stage: "Event order", milestone: "chef_input", totalMs: 400, segments: 1 });
    expect((await call("/events/evt-wedding")).event.processing).toEqual(ordered.plan.processing);
    expect((await call(`/plans/${initial.plan.id}`)).plan.processing).toEqual(initial.plan.processing);
  });

  it("measures blocked input without describing it as approval-ready", async () => {
    measuredOperations();
    const parsed = await call("/messages", { text: "1 kg salmon 469672" });
    parsed.request.lines[0].constraints.avoidAllergens = ["AF"];
    const result = await call("/requests", { request: { ...parsed.request, neededBy: "2026-11-16" } });
    expect(result.plan.status).toBe("blocked");
    expect(result.plan.processing).toMatchObject({ totalMs: 350, milestone: "blocked" });
    expect(result.plan.timings.quoteMs).toBeUndefined();
  });

  it("includes fresh parsing in a request edit, while starting a separate change total", async () => {
    const clock = measuredOperations();
    const parsed = await call("/messages", { text: "40 l lactose-free milk by Monday" });
    const initial = await call("/requests", { request: parsed.request });
    clock.wait();
    const changed = await call("/messages", { text: "1 kg salmon 469672" });
    const request = { ...initial.plan.request, parseAuditId: changed.request.parseAuditId, lines: [{ ...changed.request.lines[0], id: initial.plan.request.lines[0].id }] };
    clock.wait();
    const edited = await call(`/plans/${initial.plan.id}/requote`, { request });
    expect(edited.plan.processing).toMatchObject({ stage: "Request change", totalMs: 650, parsingMs: 250, segments: 1, milestone: "review_ready" });
    const checkedAgain = await call(`/plans/${initial.plan.id}/requote`, { request });
    expect(checkedAgain.plan.processing).toMatchObject({ totalMs: 400, segments: 1 });
    expect(checkedAgain.plan.processing.parsingMs).toBeUndefined();
    const missing = await call(`/plans/${initial.plan.id}/requote`, { request: { ...request, lines: [{ ...request.lines[0], quantity: null }] } });
    expect(missing.plan.processing).toMatchObject({ totalMs: 0, milestone: "chef_input" });
    expect(missing.plan.timings).toBeNull();
  });

  it("includes interpreted event changes without counting the event-selection pause", async () => {
    const clock = measuredOperations();
    setClock({ time: "2026-08-14T10:00:00Z" });
    const parsed = await call("/messages", { text: "The wedding now has 194 guests" });
    expect(parsed.route).toBe("event_change");
    clock.wait();
    // Correcting the interpreted headcount still includes the submitted interpretation.
    const result = await call("/events/evt-wedding/guests", { guests: 195, version: 1, parseAuditId: parsed.parseAuditId });
    expect(result.event.processing).toMatchObject({ stage: "Event change", totalMs: 350, parsingMs: 250, segments: 1, milestone: "change_checked" });
  });
});

describe("measured result milestones", () => {
  const plan = { status: "waiting", lines: [], inputRules: [] } as unknown as Plan;
  const chef = { state: "open", forRole: "chef" } as Question;
  const approver = { state: "open", forRole: "approver" } as Question;
  it("requires chef input before claiming readiness for an approver", () => {
    expect(planMilestone(plan, [chef, approver])).toBe("chef_input");
    expect(planMilestone(plan, [{ ...chef, state: "answered" }, approver])).toBe("approval_ready");
    expect(planMilestone({ ...plan, status: "needs_input" }, [approver])).toBe("chef_input");
    expect(planMilestone({ ...plan, status: "blocked" }, [approver])).toBe("blocked");
    expect(planMilestone({ ...plan, status: "failed" }, [approver])).toBe("failed");
  });
});
