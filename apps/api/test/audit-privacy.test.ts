import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { AuditEntry, type AuditAction } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { seedReset } = await import("../src/seed.js");
const { audit, auditView, verifyChain, SYSTEM } = await import("../src/audit.js");
const { getDb } = await import("../src/db.js");
const { verifyJwt } = await import("../src/gateway/keys.js");

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
beforeEach(() => seedReset());
afterAll(() => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())));

async function call(path: string, token: string, body?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.ok, `${path}: ${response.status}`).toBe(true);
  return response.json();
}

const person = { kind: "person" as const, id: "p-sanna", name: "Sanna", role: "approver", outletId: "private-outlet", testSession: true };
const judgement = { fn: "PRIVATE model function", question: "PRIVATE chef question", subject: "PRIVATE dish", probability: 0.95, threshold: { fact: 0.9, reject: 0.1 }, verdict: "yes" as const, source: "model" as const, model: "fixture" };
const privateDetails = {
  dish: "PRIVATE dish", dishes: ["PRIVATE dish"], guests: 180, dietGroups: ["PRIVATE diet"],
  recipe: "PRIVATE recipe", preferences: "PRIVATE preference", personId: "p-sanna", name: "Sanna",
  approvedBy: person, signature: "PRIVATE signature", jws: "PRIVATE signed claims", credentials: "PRIVATE token",
  note: "PRIVATE chef answer", facts: { spendCapEur: 1950 }, futureField: { guest: "PRIVATE guest" },
};
const snapshot = () => Object.fromEntries(["audit", "quotes", "approvals", "orders"].map((table) => [table, getDb().prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));

describe("Q09.2 shared audit projection", () => {
  it("projects the approved salmon order through both HTTP views and preserves hotel records, signatures and chain", async () => {
    await call("/api/clock", "", { time: "2026-11-14T10:00:00Z" });
    const { token } = await call("/api/session", "", { personId: "p-sanna" });
    const quote = await call("/gateway/v1/quotes", "agent_demo_hotel_aurora", {
      siteId: "site-aurora", deliveryDate: "2026-11-16", eventId: "evt-wedding",
      lines: [{ productId: "469672", quantity: 10, outletId: "banquet" }],
    });
    const approval = await call("/gateway/v1/approvals", token, { quoteId: quote.id, fingerprint: quote.fingerprint, grants: [] });
    const order = await call("/gateway/v1/orders", "agent_demo_hotel_aurora", { quoteId: quote.id, approvalId: approval.id }, { "Idempotency-Key": "audit-privacy-salmon" });
    audit({ actor: person, action: "question_answered", summary: "Sanna answered PRIVATE chef question", eventId: "evt-wedding", details: { note: "PRIVATE decision" }, visibility: "hotel" });
    const before = snapshot();
    const supplier = await call("/gateway/v1/audit?eventId=evt-wedding", "valio_demo_viewer");
    const app = await call("/api/audit?viewer=valio&eventId=evt-wedding", token);
    expect(app.entries).toEqual(supplier.entries);
    expect(app.decisions).toBeNull();
    expect(JSON.stringify(supplier)).not.toMatch(/Sanna|p-sanna|PRIVATE|approved by|signature|fingerprint/);
    const approved = supplier.entries.find((e: AuditEntry) => e.action === "approval_granted");
    expect(approved).toMatchObject({ actor: { id: "role:approver", name: "Approver", role: "approver", outletId: null }, summary: "Approval recorded", details: { approvalId: approval.id, grants: [] } });
    const placed = supplier.entries.find((e: AuditEntry) => e.action === "order_placed");
    expect(placed).toMatchObject({ orderId: order.id, quoteId: quote.id, summary: "Order placed", details: { approvalId: approval.id, hotelId: quote.hotelId, siteId: "site-aurora", totalExVat: order.totalExVat, currency: "EUR", deliveryDate: "2026-11-16", lines: [{ productId: "469672", quantity: 10, unitPrice: order.lines[0].unitPrice }] } });
    expect(placed.details.lines[0]).not.toHaveProperty("requires");
    for (const entry of supplier.entries) expect(AuditEntry.safeParse(entry).success).toBe(true);
    const hotel = await call("/api/audit?viewer=hotel&eventId=evt-wedding", token);
    const hotelGateway = await call("/gateway/v1/audit?eventId=evt-wedding", token);
    expect(hotelGateway.entries).toEqual(hotel.entries);
    expect(hotel.entries.find((e: AuditEntry) => e.action === "approval_granted").actor).toMatchObject({ id: "p-sanna", name: "Sanna" });
    expect(hotel.entries.find((e: AuditEntry) => e.action === "order_placed").summary).toContain("approved by Sanna");
    expect(hotel.decisions).toMatchObject({ decisions: 1, items: [{ by: "Sanna" }] });
    expect(snapshot()).toEqual(before);
    expect(supplier.chain).toEqual(verifyChain());
    expect(supplier.chain.ok).toBe(true);
    expect(verifyJwt(quote.jws, "aimo-quote+jwt")).not.toBeNull();
    expect(verifyJwt(approval.signature, "aimo-approval+jwt")?.approved_by.name).toBe("Sanna");
    expect(verifyJwt(order.jws, "aimo-order+jwt")).not.toBeNull();
  });

  it.each([
    ["quote_created", { deliveryDate: "2026-11-16", totalExVat: 100, currency: "EUR", lines: [{ productId: "469672", quantity: 10, unitPrice: 10, ref: "PRIVATE guest", requires: { avoidAllergens: ["PRIVATE diet"] }, stock: { kind: "unknown", reason: "PRIVATE reason" }, ...privateDetails }] }, { deliveryDate: "2026-11-16", totalExVat: 100, currency: "EUR", lines: [{ productId: "469672", quantity: 10, unitPrice: 10, stock: { kind: "unknown" } }] }],
    ["approval_granted", { approvalId: "apr-trade", grants: ["spend_cap"] }, { approvalId: "apr-trade", grants: ["spend_cap"], decision: "approved" }],
    ["order_placed", { approvalId: "apr-trade", outlets: ["banquet"], totalExVat: 100 }, { approvalId: "apr-trade", outlets: ["banquet"], totalExVat: 100 }],
    ["order_amended", { changes: [{ productId: "469672", quantity: 12, before: { quantity: 10, ...privateDetails }, after: { quantity: 12, ...privateDetails }, ...privateDetails }], refused: [privateDetails] }, { changes: [{ productId: "469672", quantity: 12, before: { quantity: 10 }, after: { quantity: 12 } }] }],
    ["order_refused", { error: "cutoff_passed", changes: [{ now: privateDetails }], approvalsNeeded: ["PRIVATE exception"] }, { error: "cutoff_passed" }],
    ["final_check_run", { results: [{ productId: "469672", result: "covered_at_risk", detail: "Sanna accepted PRIVATE risk", ...privateDetails }] }, { results: [{ productId: "469672", result: "covered_at_risk" }] }],
    ["flag_sent_to_valio_aimo", { productId: "469672", closingTime: "2026-11-16T10:00:00Z", askedAt: "PRIVATE question time" }, { productId: "469672", closingTime: "2026-11-16T10:00:00Z" }],
  ] as [AuditAction, Record<string, unknown>, Record<string, unknown>][])("allowlists %s fields, including nested objects, without editing originals", (action, details, expected) => {
    const entry = audit({ actor: person, action, summary: "Sanna: PRIVATE guest and dish", eventId: "evt-wedding", questionId: "PRIVATE-question", ruleIds: ["MAN-01", "ORG-01", "PRIVATE rule"], judgements: [judgement], details: { ...privateDetails, ...details }, visibility: "shared", usesFixture: true });
    const before = snapshot();
    const shared = auditView("valio").find((e) => e.id === entry.id)!;
    expect(shared).toMatchObject({ actor: { id: "role:approver", name: "Approver", role: "approver", outletId: null }, eventId: null, questionId: null, judgements: [], ruleIds: ["MAN-01", "ORG-01"], quoteId: null, orderId: null, details: expected, usesFixture: true, hash: entry.hash, prevHash: entry.prevHash });
    expect(shared.details).toEqual(expected);
    expect(JSON.stringify(shared)).not.toMatch(/PRIVATE|Sanna|p-sanna|private-outlet/);
    shared.actor.name = "changed";
    shared.details.injected = "changed";
    expect(auditView("hotel").find((e) => e.id === entry.id)).toEqual(entry);
    expect(snapshot()).toEqual(before);
    expect(verifyChain().ok).toBe(true);
  });

  it("fails closed for unsupported shared actions, invalid details and unrecognised actor roles", () => {
    audit({ actor: person, action: "preference_changed", summary: "PRIVATE preference", visibility: "shared" });
    audit({ actor: SYSTEM, action: "clock_moved", summary: "PRIVATE scene", visibility: "shared" });
    const invalid = audit({ actor: { ...person, role: "PRIVATE role" }, action: "order_refused", summary: "PRIVATE refusal", details: { error: "PRIVATE free text" }, visibility: "shared" });
    const shared = auditView("valio");
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ id: invalid.id, actor: { id: "person", name: "Hotel staff", role: null }, summary: "Order refused", details: {} });
    expect(JSON.stringify(shared)).not.toContain("PRIVATE");
    expect(auditView("hotel")).toHaveLength(4);
  });

  it.each(["agent", "outside_agent", "gateway", "system"] as const)("uses fixed public labels for %s actors", (kind) => {
    audit({ actor: { ...person, kind, id: "PRIVATE-token-prefix", role: "PRIVATE role", name: "Sanna's PRIVATE agent" }, action: "quote_created", summary: "PRIVATE summary", visibility: "shared" });
    const [shared] = auditView("valio");
    expect(shared.actor.id).toBe(kind);
    expect(JSON.stringify(shared)).not.toMatch(/PRIVATE|Sanna/);
  });
});
