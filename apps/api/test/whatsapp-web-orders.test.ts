import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { WhatsAppBrowserClient } from "../src/whatsapp/web-client.js";
process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { getPerson } = await import("../src/identity.js");
const { WhatsAppWebBridge } = await import("../src/whatsapp/web.js");
const { handleWhatsAppMessage } = await import("../src/whatsapp/service.js");
let server: Server;
let base: string;
let token: string;
beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
afterAll(() => server.close());
async function call(path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api${path}`, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  expect(response.ok).toBe(true);
  return response.json();
}

it("handles selected group orders across restarts, requiring fresh previews before edits and purchases", async () => {
  await call("/reset", {});
  token = (await call("/session", { personId: "p-aino" })).token;
  await call("/clock", { time: "2026-11-14T10:00:00Z" });
  const basket = (await call("/baskets", { name: "WhatsApp conference", deliveryDate: "2026-11-16" })).basket;
  const group = "120300001@g.us";
  const browser = new EventEmitter() as EventEmitter & WhatsAppBrowserClient;
  browser.initialize = async () => {};
  browser.destroy = async () => {};
  browser.logout = async () => {};
  browser.getAccount = () => ({ id: "test-account@c.us", name: "Test account" });
  browser.getGroups = async () => [{ id: group, name: "Conference kitchen" }];
  const sendText = vi.fn(async (_destination: string, _text: string) => {});
  browser.sendText = sendText;
  const createBridge = () => new WhatsAppWebBridge(handleWhatsAppMessage, { createClient: async () => browser });
  let bridge = createBridge();
  const person = getPerson("p-aino")!;
  const restart = async () => {
    await bridge.close();
    bridge = createBridge();
    expect(await bridge.restore()).toBe(true);
    browser.emit("ready");
    await vi.waitFor(() => expect(bridge.status(person).phase).toBe("ready"));
    expect(bridge.status(person).selectedGroupId).toBe(group);
  };
  try {
    await bridge.connect(person, token);
    browser.emit("ready");
    await vi.waitFor(() => expect(bridge.status(person).phase).toBe("ready"));
    bridge.selectGroup(person, group);
    let sequence = 0;
    const send = async (text: string, from = group, id = `event-${sequence++}`) => {
      await bridge.receive({ id: { _serialized: id }, from, author: "sender@lid", body: text, fromMe: false, timestamp: Math.floor(Date.now() / 1000), type: "chat" });
      return sendText.mock.calls.at(-1)?.[1] ?? "";
    };
    await send(basket.id);
    const proposal = await send("add 10 kg salmon 469672");
    expect(proposal).toContain("*Add these items to your basket?*");
    expect(proposal).toContain("Reply *confirm change* or *cancel*.");
    expect(proposal).not.toContain("FAKE WhatsApp");
    await restart();
    await send("confirm change");
    expect((await call(`/baskets/${basket.id}`)).requests).toHaveLength(0);
    const freshProposal = await send("add 10 kg salmon 469672");
    expect(freshProposal).toContain("*Add these items to your basket?*");
    await send("confirm change", "unselected@g.us");
    expect((await call(`/baskets/${basket.id}`)).requests).toHaveLength(0);
    await send("confirm change");
    expect((await call(`/baskets/${basket.id}`)).requests).toHaveLength(1);
    await send("confirm order");
    await restart();
    await send("confirm order");
    expect((await call("/orders")).orders).toHaveLength(0);
    await send("confirm order", "private@c.us");
    expect((await call("/orders")).orders).toHaveLength(0);
    const receipt = await send("confirm order", group, "final-order");
    expect(receipt).toContain("Mock order placed");
    expect(receipt).toContain("Demo receipt");
    const calls = sendText.mock.calls.length;
    await send("confirm order", group, "final-order");
    expect(sendText.mock.calls).toHaveLength(calls);
    expect((await call("/orders")).orders).toHaveLength(1);
    expect(sendText.mock.calls.every(([destination]) => destination === group)).toBe(true);
  } finally { await bridge.close(); }
});
