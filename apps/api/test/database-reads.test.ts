import { beforeEach, describe, expect, it, vi } from "vitest";
Object.assign(process.env, { AIMO_DB: ":memory:", AIMO_MODE: "fixture", OPENAI_API_KEY: "" });
const { getDb, tx } = await import("../src/db.js");
const { seedReset, SEED_EVENT } = await import("../src/seed.js");
const { listPlans, newPlan, savePlan } = await import("../src/agent/plan.js");
const { allQuestions, makeQuestion, saveQuestion } = await import("../src/agent/questions.js");
const { warnings } = await import("../src/agent/events.js");
const { basketReview } = await import("../src/agent/baskets.js");
const { audit, auditView, SYSTEM } = await import("../src/audit.js");

beforeEach(() => seedReset());

function question(eventId: string) {
  return makeQuestion({ planId: "plan", eventId, quoteId: null, fingerprint: null, deadline: null,
    type: "ambiguous_type", forRole: "chef", outletId: "banquet", title: "Choose", body: "Choose a product",
    facts: {}, ruleIds: [], options: [] });
}

describe("indexed database reads", () => {
  it("keeps plan ordering and follows requests moved between events", () => {
    for (const eventId of ["a", "b", "a", ""]) {
      savePlan(newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { eventId }));
    }
    for (const eventId of ["a", "b", "", "missing"]) {
      expect(listPlans(eventId)).toEqual(listPlans().filter((plan) => plan.eventId === eventId));
    }
    const moved = listPlans("a")[0];
    moved.eventId = "b";
    savePlan(moved);
    expect(listPlans("a").map((plan) => plan.id)).not.toContain(moved.id);
    expect(listPlans("b").map((plan) => plan.id)).toContain(moved.id);
  });

  it("keeps question ordering and sees changed event/state without a stale cache", () => {
    for (const eventId of ["a", "b", "a", ""]) saveQuestion(question(eventId));
    for (const eventId of ["a", "b", "", "missing"]) {
      expect(allQuestions(eventId)).toEqual(allQuestions().filter((q) => q.eventId === eventId));
    }
    const moved = allQuestions("a")[0];
    moved.eventId = "b";
    moved.state = "answered";
    saveQuestion(moved);
    expect(allQuestions("a").map((q) => q.id)).not.toContain(moved.id);
    expect(allQuestions("b").find((q) => q.id === moved.id)?.state).toBe("answered");
  });

  it("decodes only the selected event's snapshots, regardless of unrelated history", () => {
    tx(() => {
      for (let i = 0; i < 100; i++) {
        savePlan(newPlan("single", { personId: "p-aino", name: "Aino" }, "banquet", { eventId: `event-${i}` }));
        saveQuestion(question(`event-${i}`));
        getDb().prepare("INSERT INTO warnings (id, event_id, state, json) VALUES (?, ?, ?, ?)")
          .run(`warning-${i}`, `event-${i}`, "open", JSON.stringify({ id: `warning-${i}`, eventId: `event-${i}`, state: "open" }));
      }
    });
    const parse = vi.spyOn(JSON, "parse");
    try {
      expect(listPlans("event-4")).toHaveLength(1);
      expect(allQuestions("event-4")).toHaveLength(1);
      expect(warnings("event-4")).toHaveLength(1);
      expect(parse.mock.calls.length).toBeLessThan(10);
    } finally { parse.mockRestore(); }
  });

  it("does not read or hash saved plans when no finance review is pending", () => {
    const prepare = vi.spyOn(getDb(), "prepare");
    try {
      expect(basketReview("event-with-no-review", [])).toBeNull();
      expect(prepare.mock.calls.some(([sql]) => /FROM plans|FROM events/.test(sql))).toBe(false);
    } finally { prepare.mockRestore(); }
  });

  it("filters audit history before decoding while retaining ownership and limits", () => {
    for (let i = 0; i < 50; i++) audit({ actor: SYSTEM, action: "request_received", summary: `Entry ${i}`,
      eventId: i % 2 ? SEED_EVENT.id : "unresolved-event", visibility: "hotel" });
    const expected = auditView("hotel").filter((entry) => entry.eventId === SEED_EVENT.id).slice(0, 2);
    expect(expected).toHaveLength(2);
    expect(auditView("hotel", { eventId: SEED_EVENT.id, limit: 2 })).toEqual(expected);
    expect(auditView("hotel", { eventId: SEED_EVENT.id, hotelId: "other-hotel" })).toEqual([]);
  });
});
