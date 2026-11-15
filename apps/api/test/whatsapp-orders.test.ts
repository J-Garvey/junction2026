import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { WhatsAppReply } from "@aimo/contracts";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getPlan } = await import("../src/agent/plan.js");
const { mandate } = await import("../src/agent/plan.js");
const { putMandate } = await import("../src/gateway/service.js");
const { allQuestions } = await import("../src/agent/questions.js");
let server: Server;
let base = "";
let token = "";
let seq = 0;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
async function call(path: string, body?: unknown, auth = token): Promise<any> {
  const response = await fetch(`${base}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  expect(response.ok, `${path}: ${response.status}`).toBe(true);
  return response.json();
}
beforeEach(async () => {
  await call("/reset", {});
  token = (await call("/session", { personId: "p-aino" })).token;
  await call("/clock", { time: "2026-11-14T10:00:00Z" });
  await call("/whatsapp/connect", {});
});
async function basket(name = "Conference") { return (await call("/baskets", { name, deliveryDate: "2026-11-16" })).basket.id as string; }
async function send(text: string, id = `test-${seq++}`): Promise<WhatsAppReply> {
  const output = await call("/whatsapp/messages", { id, text });
  return output.messages.at(-1).reply;
}
async function stage(id: string, text = "10 kg salmon") {
  const parsed = await call("/messages", { text });
  const { plan } = await call("/requests", { request: { ...parsed.request, neededBy: "2026-11-16" }, eventId: id, reviewing: true });
  expect(plan.proposal, plan.summary).toBe(true);
  await call(`/plans/${plan.id}/basket`, { continueWithWarnings: true });
  return plan.id as string;
}

describe("synthetic WhatsApp order flow", () => {
  it("asks which order, previews an addition, confirms one complete mock order, and avoids duplicates", async () => {
    const id = await basket();
    await basket("Breakfast");
    expect((await send("add 10 kg salmon")).status).toBe("clarification");
    expect((await send(id)).status).toBe("summary");
    const proposal = await send("add 10 kg salmon 469672");
    expect(proposal.status, proposal.text).toBe("proposal");
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
    const changed = await send("confirm change");
    expect(changed.status, changed.text).toBe("updated");
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(1);
    expect((await call("/orders")).orders).toHaveLength(0);
    expect((await send("confirm order")).status).toBe("proposal");
    const receipt = await send("confirm order", "checkout-final");
    expect(receipt.status, receipt.text).toBe("ordered");
    expect(await send("confirm order", "checkout-final")).toEqual(receipt);
    expect((await send("confirm order")).status).toBe("ordered");
    expect((await call(`/orders?eventId=${id}`)).orders).toHaveLength(1);
    expect((await call(`/baskets/${id}`)).requests[0].orderIds).toHaveLength(1);
  });

  it("previews removal and removes only the selected basket's line", async () => {
    const id = await basket();
    const other = await basket("Breakfast");
    await stage(id);
    await stage(other);
    await send(id);
    const proposal = await send("remove salmon");
    expect(proposal.status, proposal.text).toBe("proposal");
    expect((await call(`/baskets/${id}`)).requests[0].lines).toHaveLength(1);
    expect((await send("confirm change")).status).toBe("updated");
    expect((await call(`/baskets/${id}`)).requests[0].lines).toHaveLength(0);
    expect((await call(`/baskets/${other}`)).requests[0].lines).toHaveLength(1);
  });

  it("keeps unknown stock unconfirmed and requires the existing stock decision", async () => {
    const id = await basket();
    await send(id);
    const proposal = await send("add 1000 l lactose-free milk");
    expect(proposal.status, proposal.text).toBe("proposal");
    const blocked = await send("confirm change");
    expect(blocked.status).toBe("blocked");
    expect(blocked.text).toContain("Stock is not confirmed");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("evaluates spend and stock over all staged messages and creates one existing app approval", async () => {
    const id = await basket();
    const first = await stage(id, "10 kg salmon 469672");
    putMandate({ ...mandate(), spendCapEur: getPlan(first)!.totalExVat! * 1.5 });
    await stage(id, "10 kg salmon 469672");
    await send(id);
    await send("confirm order");
    const response = await send("confirm order");
    expect(response.status, response.text).toBe("approval_required");
    expect((await send("confirm order")).status).toBe("approval_required");
    const questions = allQuestions().filter((q) => q.eventId === id && q.state === "open");
    expect(questions).toHaveLength(1);
    expect((await call("/orders")).orders).toHaveLength(0);
    const sanna = (await call("/session", { personId: "p-sanna" })).token;
    const approved = await call(`/questions/${questions[0].id}/answer`, { optionId: "approve" }, sanna);
    expect(approved.error).toBeUndefined();
    const orders = (await call(`/orders?eventId=${id}`)).orders;
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toHaveLength(1);
    expect(orders[0].lines[0].quantity).toBe(20);
  });

  it("does not count the same stock again for a second staged request", async () => {
    const id = await basket();
    await stage(id, "40 kg salmon");
    await stage(id, "40 kg salmon");
    await send(id);
    await send("confirm order");
    const response = await send("confirm order");
    expect(response.status, response.text).toBe("blocked");
    expect(response.text).toContain("in stock");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("rejects an approval if any staged request changed after review", async () => {
    const id = await basket();
    await stage(id, "80 kg salmon");
    await send(id);
    await send("confirm order");
    expect((await send("confirm order")).status).toBe("approval_required");
    const question = allQuestions().find((q) => q.eventId === id && q.state === "open")!;
    await stage(id, "1 kg salmon");
    const sanna = (await call("/session", { personId: "p-sanna" })).token;
    await call(`/questions/${question.id}/answer`, { optionId: "approve" }, sanna);
    expect(getPlan(question.planId)!.status).toBe("blocked");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("blocks an expired cutoff even after the basket was reviewed", async () => {
    const id = await basket();
    await stage(id);
    await send(id);
    await send("confirm order");
    await call("/clock", { time: "2026-11-16T18:00:00Z" });
    expect((await send("confirm order")).status).toBe("blocked");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("invalidates a pending change when another request is staged", async () => {
    const id = await basket();
    await send(id);
    expect((await send("add 10 kg salmon")).status).toBe("proposal");
    await stage(id, "2 kg salmon");
    const result = await send("confirm change");
    expect(result.status).toBe("blocked");
    expect(result.text).toContain("basket changed");
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(1);
  });

  it("blocks a product that fails the request's stated dietary restriction", async () => {
    const id = await basket();
    await send(id);
    const response = await send("add 1 kg salmon 469672 fish-free");
    expect(response.status, response.text).toBe("blocked");
    expect((await call("/orders")).orders).toHaveLength(0);
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
  });
});
