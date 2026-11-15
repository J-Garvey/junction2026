import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { WhatsAppReply } from "@aimo/contracts";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getPlan, savePlan } = await import("../src/agent/plan.js");
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
  const output = await call("/whatsapp/messages", { id, text, groupId: "demo-hotel-orders" });
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
  it("lists all five candidate orders once and lets the person answer with an order name", async () => {
    const examples = [
      ["Pavit's Date", "2026-11-22"], ["Darragh's Birthday", "2026-11-30"],
      ["Ben's Wedding", "2026-11-22"], ["HackJunction", "2026-11-22"],
    ];
    for (const [name, deliveryDate] of examples) await call("/baskets", { name, deliveryDate });
    const reply = await send("show order missing");
    expect(reply.status).toBe("clarification");
    expect(reply.actions).toHaveLength(5);
    for (const [name] of examples) expect(reply.text.split(name)).toHaveLength(2);
    expect(reply.text).toContain("Reply with the *order name*.");
    expect(reply.text).not.toMatch(/Total|TBC|Reply options|Next:|shortened|in the app/);
    expect((await send("HackJunction")).status).toBe("summary");
  });

  it("asks which order, previews an addition, confirms one complete mock order, and avoids duplicates", async () => {
    const id = await basket();
    await basket("Breakfast");
    expect((await send("add 10 kg salmon")).status).toBe("clarification");
    expect((await send(id)).status).toBe("summary");
    const proposal = await send("add 10 kg salmon 469672");
    expect(proposal.status, proposal.text).toBe("proposal");
    expect(proposal.text).toContain(`/baskets/${id}`);
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
    const changed = await send("confirm change");
    expect(changed.status, changed.text).toBe("updated");
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(1);
    expect((await call("/orders")).orders).toHaveLength(0);
    expect((await send("confirm order")).status).toBe("proposal");
    const receipt = await send("confirm order", "checkout-final");
    expect(receipt.status, receipt.text).toBe("ordered");
    expect(await send("confirm order", "checkout-final")).toEqual(receipt);
    // A placed order goes to finance review on the next submit; it is never placed twice.
    expect((await send("confirm order")).text).toContain("finance review");
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

  it("summarises only the newly changed items after adding to an existing basket", async () => {
    const id = await basket();
    await stage(id, "10 kg salmon 469672");
    await send(id);
    expect((await send("add 2 kg salmon 469672")).status).toBe("proposal");
    const updated = await send("confirm change");
    expect(updated.status, updated.text).toBe("updated");
    expect(updated.text).toContain("*2 KG*");
    expect(updated.text).not.toContain("*10 KG*");
    expect(updated.text).toContain(`/baskets/${id}`);
  });

  it("keeps unknown stock unconfirmed and requires the existing stock decision", async () => {
    const id = await basket();
    await send(id);
    const proposal = await send("add 1000 l lactose-free milk");
    expect(proposal.status, proposal.text).toBe("proposal");
    const blocked = await send("confirm change");
    expect(blocked.status).toBe("blocked");
    expect(blocked.text).toContain("Stock is not confirmed");
    const proposalId = (await call(`/baskets/${id}`)).requests[0].id;
    expect(blocked.text).toContain(`/requests/${proposalId}`);
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
    expect(response.text).toContain(`/baskets/${id}#question-${questions[0].id}`);
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

  it("does not confirm an older addition after a newer request needs clarification", async () => {
    const id = await basket();
    await send(id);
    expect((await send("add 10 kg salmon 469672")).status).toBe("proposal");
    expect((await send("add milk")).status).toBe("clarification");
    expect((await call("/whatsapp/session")).conversation.pending).toBeNull();
    expect((await send("confirm change")).status).toBe("clarification");
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("requires a fresh final review after an intervening ambiguous request", async () => {
    const id = await basket();
    await stage(id, "10 kg salmon 469672");
    await send(id);
    expect((await send("confirm order")).status).toBe("proposal");
    expect((await send("add milk")).status).toBe("clarification");
    expect((await send("confirm order")).status).toBe("proposal");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("does not mutate either named basket for an unsupported multi-order change", async () => {
    const darragh = await basket("Darragh");
    const pavit = await basket("Pavit");
    await send(darragh);
    for (const text of ["add 1 kg salmon 469672 to Darragh and Pavit", "add 1 kg salmon 469672 to all orders", `confirm order ${darragh} and ${pavit}`]) {
      expect((await send(text)).status).toBe("clarification");
      expect((await call("/whatsapp/session")).conversation.pending).toBeNull();
      expect((await call(`/baskets/${darragh}`)).requests).toHaveLength(0);
      expect((await call(`/baskets/${pavit}`)).requests).toHaveLength(0);
    }
  });

  it("clarifies an instead-of replacement without staging an accidental addition (AUD-WA-001)", async () => {
    const darragh = await basket("Darragh");
    const pavit = await basket("Pavit");
    await stage(darragh, "2 kg salmon 469672");
    await stage(pavit, "2 kg salmon 469672");
    await send(darragh);
    const response = await send("add 1 kg salmon 469672 instead of milk to Darragh");
    expect(response.status).toBe("clarification");
    expect((await send("confirm change")).status).toBe("clarification");
    for (const id of [darragh, pavit]) {
      const requests = (await call(`/baskets/${id}`)).requests;
      expect(requests).toHaveLength(1);
      expect(requests[0].lines[0].quantity).toBe(2);
    }
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("keeps an old message retry consistent with the proposal a later confirmation will apply", async () => {
    const id = await basket();
    await send(id);
    expect((await send("add 1 kg salmon 469672", "older-proposal")).status).toBe("proposal");
    expect((await send("add 3 kg salmon 469672", "newer-proposal")).status).toBe("proposal");
    const replay = await call("/whatsapp/messages", { id: "older-proposal", text: "add 1 kg salmon 469672", groupId: "demo-hotel-orders" });
    const displayedPlan = getPlan(replay.conversation.pending.planId)!;
    expect((await send("confirm change")).status).toBe("updated");
    const requests = (await call(`/baskets/${id}`)).requests;
    expect(requests).toHaveLength(1);
    expect(requests[0].lines[0].quantity).toBe(displayedPlan.lines[0].quantity);
    expect(requests[0].lines[0].quantity).toBe(3);
  });

  it("keeps a confirmed addition additive and changes a placed order only after a second confirmation", async () => {
    const id = await basket("Darragh");
    await stage(id, "10 kg salmon 469672");
    await send(id);
    expect((await send("add another 1 kg salmon 469672")).status).toBe("proposal");
    expect((await send("confirm change")).status).toBe("updated");
    const requests = (await call(`/baskets/${id}`)).requests;
    expect(requests).toHaveLength(2);
    expect(requests.map((r: any) => r.lines[0].quantity)).toEqual([10, 1]);
    await send("confirm order");
    expect((await send("confirm order")).status).toBe("ordered");
    expect((await call(`/orders?eventId=${id}`)).orders[0].lines[0].quantity).toBe(11);

    const summary = await send("summary");
    expect(summary.text).toContain("1. *11 KG*");
    expect(summary.text).toContain("placed");
    expect(summary.text).toContain("change 2 to 15");
    // Emptying a placed order is refused; the order is untouched.
    expect((await send("remove 1")).text).toContain("empty the placed order");
    const proposal = await send("change 1 to 12");
    expect(proposal.status, proposal.text).toBe("proposal");
    expect(proposal.text).toContain("amends the placed mock order");
    expect(proposal.text).toContain("Not changed yet.");
    expect((await call(`/orders?eventId=${id}`)).orders[0].lines[0].quantity).toBe(11);
    const changed = await send("confirm change");
    expect(changed.status, changed.text).toBe("updated");
    expect(changed.text).toContain("Placed mock order amended");
    const [order] = (await call(`/orders?eventId=${id}`)).orders;
    expect(order.lines.filter((l: any) => !l.removed).map((l: any) => l.quantity)).toEqual([12]);
    expect(order.version).toBe(2);
    expect((await send("confirm change")).status).not.toBe("updated");
  });

  it("adds to a placed order, removes a placed line and sends the additions to finance review", async () => {
    const id = await basket("Emma and Lauri's wedding");
    await stage(id, "10 kg salmon 469672");
    await send(id);
    await send("confirm order");
    expect((await send("confirm order")).status).toBe("ordered");
    expect((await send("add 2 kg butter")).status).toBe("proposal");
    expect((await send("confirm change")).status).toBe("updated");
    expect((await send("add 3 kg salmon 469672")).status).toBe("proposal");
    expect((await send("confirm change")).status).toBe("updated");
    const summary = await send("summary");
    expect(summary.text).toMatch(/2\. \*\d+ \w+\* /);
    const submit = await send("confirm order");
    expect(submit.text).toContain("Submit this order for finance review?");
    const sent = await send("confirm order");
    expect(sent.status, sent.text).toBe("approval_required");
    expect(sent.text).toContain("#question-");

    // The finance manager approves from chat with a second, explicit confirmation.
    token = (await call("/session", { personId: "p-sanna" })).token;
    await call("/whatsapp/connect", {});
    await send(id);
    const approve = await send("approve");
    expect(approve.status, approve.text).toBe("proposal");
    expect(approve.text).toContain("Nothing decided yet.");
    expect((await call(`/orders?eventId=${id}`)).orders).toHaveLength(1);
    const ordered = await send("confirm approval");
    expect(ordered.status, ordered.text).toBe("ordered");
    expect((await call(`/orders?eventId=${id}`)).orders).toHaveLength(2);
  });

  it("refuses a finance review from chat only with a note", async () => {
    const id = await basket();
    await stage(id, "10 kg salmon 469672");
    await send(id);
    await send("confirm order");
    await send("confirm order");
    await stage(id, "2 kg salmon 469672");
    await send("confirm order");
    expect((await send("confirm order")).status).toBe("approval_required");
    token = (await call("/session", { personId: "p-sanna" })).token;
    await call("/whatsapp/connect", {});
    await send(id);
    expect((await send("refuse")).text).toContain("What should I tell the order builder?");
    expect((await send("refuse: too much salmon")).status).toBe("proposal");
    const refused = await send("confirm refusal");
    expect(refused.status, refused.text).toBe("updated");
    const review = allQuestions().find((q) => q.eventId === id && q.type === "order_review")!;
    expect(review.answer).toBe("reject");
    expect(review.answerNote).toBe("too much salmon");
  });

  it("changes a staged line's quantity after a preview", async () => {
    const id = await basket();
    await stage(id, "10 kg salmon 469672");
    await send(id);
    const proposal = await send("change 1 to 4");
    expect(proposal.status, proposal.text).toBe("proposal");
    expect((await call(`/baskets/${id}`)).requests[0].lines[0].quantity).toBe(10);
    expect((await send("confirm change")).status).toBe("updated");
    const [request] = (await call(`/baskets/${id}`)).requests;
    expect(request.lines[0].quantity).toBe(4);
    expect(request.totalExVat).toBeCloseTo(request.lines[0].unitPrice * 4, 2);
    expect((await send("change 1 to 4 kg")).text).toContain("already 4");
    expect((await send("change 9 to 4")).text).toContain("There is no line 9");
  });

  it("creates a new order and explains the commands", async () => {
    const created = await send("new order Emma's wedding on 17 Nov");
    expect(created.status, created.text).toBe("updated");
    expect(created.text).toContain("Emma's wedding");
    expect((await call("/baskets")).baskets.some((b: any) => b.name === "Emma's wedding" && b.deliveryDate === "2026-11-17")).toBe(true);
    const help = await send("help");
    expect(help.text).toContain("*remove 2*");
    expect(help.text).toContain("*approve*");
    expect(help.text).toContain("https://junction.hewston.ie");
  });

  it("does not reveal a placed banquet basket to a bar-only person", async () => {
    const id = await basket("Darragh banquet");
    await stage(id, "10 kg salmon 469672");
    await send(id);
    await send("confirm order");
    expect((await send("confirm order")).status).toBe("ordered");
    token = (await call("/session", { personId: "p-mikko" })).token;
    await call("/whatsapp/connect", {});
    const response = await send(`show ${id}`);
    expect(response.status).toBe("clarification");
    expect(response.text).not.toContain("salmon");
    expect((await call("/whatsapp/session")).conversation.activeOrderId).toBeNull();
  });

  it.each([
    { origin: "zz" },
    { labels: ["REQUIRED_TEST_CERTIFICATION"] },
  ])("rechecks origin and certification requirements in the final basket quote: %j", async (requires) => {
    const id = await basket();
    const source = getPlan(await stage(id, "10 kg salmon 469672"))!;
    // A saved requirement must reach the fresh gateway check even if the
    // existing source quote predates it. Neither origin nor labels are optional.
    Object.assign(source.needs[0].constraints, requires);
    savePlan(source);
    await send(id);
    expect((await send("confirm order")).status).toBe("proposal");
    expect((await send("confirm order")).status).toBe("blocked");
    expect((await call("/orders")).orders).toHaveLength(0);
  });

  it("blocks a product that fails the request's stated dietary restriction", async () => {
    const id = await basket();
    await send(id);
    const response = await send("add 1 kg salmon 469672 fish-free");
    expect(response.status, response.text).toBe("blocked");
    expect((await call("/orders")).orders).toHaveLength(0);
    expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
  });

  it("does not apply changes or submit an order from a different group or a direct message", async () => {
    const id = await basket();
    await send(id);
    expect((await send("add 10 kg salmon 469672")).status).toBe("proposal");
    const pending = (await call("/whatsapp/session")).conversation.pending;
    for (const groupId of ["demo-conference-kitchen", null]) {
      const ignored = await call("/whatsapp/messages", { id: `ignored-change-${groupId}`, text: "confirm change", groupId });
      expect(ignored.ignored).toBeTruthy();
      expect(ignored).not.toHaveProperty("messages");
      expect((await call("/whatsapp/session")).conversation.pending).toEqual(pending);
      expect((await call(`/baskets/${id}`)).requests).toHaveLength(0);
    }
    expect((await send("confirm change")).status).toBe("updated");
    expect((await send("confirm order")).status).toBe("proposal");
    expect((await call("/whatsapp/messages", { id: "ignored-final", text: "confirm order", groupId: "demo-hotel-staff" })).ignored).toBe("other_group");
    expect((await call("/orders")).orders).toHaveLength(0);
    expect((await send("confirm order")).status).toBe("ordered");
  });
});
