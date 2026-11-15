/** Lazy browser adapter: importing the API never starts WhatsApp or a browser. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

export interface WebInboundMessage {
  id: { _serialized: string };
  from: string;
  to?: string;
  author?: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  isStatus?: boolean;
  hasMedia?: boolean;
}

export interface WhatsAppBrowserClient {
  on(event: string, listener: (...args: any[]) => void): void;
  initialize(): Promise<unknown>;
  destroy(): Promise<unknown>;
  logout(): Promise<unknown>;
  getAccount(): { id: string; name: string } | null;
  getGroups(): Promise<{ id: string; name: string }[]>;
  sendText(groupId: string, text: string): Promise<unknown>;
}

export function chromeExecutable(): string | undefined {
  if (config.whatsappWeb.chromePath) return config.whatsappWeb.chromePath;
  const candidates = process.platform === "win32" ? [
    join(process.env.PROGRAMFILES ?? "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  ] : process.platform === "darwin" ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"] : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => existsSync(candidate));
}

export async function createWhatsAppBrowser(): Promise<WhatsAppBrowserClient> {
  const { default: wa } = await import("whatsapp-web.js");
  const client = new wa.Client({
    authStrategy: new wa.LocalAuth({ dataPath: config.whatsappWeb.authDir, clientId: "aimo", rmMaxRetries: 5 }),
    puppeteer: { headless: true, executablePath: chromeExecutable(), handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false },
    webVersionCache: { type: "local", path: join(config.whatsappWeb.authDir, "cache") },
    authTimeoutMs: 90_000,
    qrMaxRetries: 10,
    deviceName: "Potato",
  });
  return {
    on: (event, listener) => { client.on(event, listener); },
    initialize: () => client.initialize(),
    destroy: () => client.destroy(),
    logout: () => client.logout(),
    getAccount: () => client.info?.wid?._serialized ? { id: client.info.wid._serialized, name: client.info.pushname || "Linked WhatsApp account" } : null,
    getGroups: async () => (await client.getChats()).filter((chat) => chat.isGroup && chat.id._serialized.endsWith("@g.us")).map((chat) => ({ id: chat.id._serialized, name: chat.name })),
    sendText: (groupId, text) => client.sendMessage(groupId, text, { sendSeen: false, linkPreview: false }),
  };
}

export async function encodePairingQr(value: string): Promise<string> {
  const { default: qr } = await import("qrcode");
  return qr.toDataURL(value, { width: 320, margin: 3, errorCorrectionLevel: "M" });
}
