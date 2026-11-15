/** Loads settings from the environment, the repo .env and the untracked .env.local. */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k] !== undefined) continue;
    process.env[k] = raw.replace(/^["']|["']$/g, "");
  }
}
// .env.local (untracked, owner-only) wins over the tracked .env.
loadEnvFile(resolve(REPO_ROOT, ".env.local"));
loadEnvFile(resolve(REPO_ROOT, ".env"));

export const config = {
  port: Number(process.env.PORT ?? 8787),
  publicAppUrl: process.env.PUBLIC_APP_URL ?? "https://junction.hewston.ie",
  dbPath: process.env.AIMO_DB ?? resolve(REPO_ROOT, "apps/api/var/aimo.db"),
  aimoBase: process.env.AIMO_BASE_URL ?? "https://junction26.valioaimo.fi",
  aimoKey: process.env.AIMO_API_KEY ?? "",
  aimoTimeoutMs: Number(process.env.AIMO_TIMEOUT_MS ?? 8000),
  /** live | fixture. Per-call modes can override; see aimo/lookup.ts. */
  aimoMode: (process.env.AIMO_MODE ?? "live") as "live" | "fixture",
  fixturesDir: resolve(REPO_ROOT, "data/fixtures/aimo"),
  dataDir: resolve(REPO_ROOT, "data"),
  signingKey: process.env.GATEWAY_SIGNING_KEY ?? "junction-demo-signing-key-not-secret",
  /** Base URL the hotel agent uses to reach the gateway over HTTP (Q08.2). */
  gatewayUrl: process.env.GATEWAY_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}/gateway/v1`,
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT ?? "low",
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 20000),
  },
  contextDev: {
    apiKey: process.env.CONTEXT_DEV_API_KEY ?? "",
    baseUrl: process.env.CONTEXT_DEV_BASE_URL ?? "https://api.context.dev/v1",
    timeoutMs: Number(process.env.CONTEXT_DEV_TIMEOUT_MS ?? 15000),
  },
  testMode: process.env.AIMO_TEST_MODE !== "0",
  whatsappWeb: {
    authDir: process.env.WHATSAPP_AUTH_DIR ?? resolve(REPO_ROOT, "apps/api/var/whatsapp-web"),
    chromePath: process.env.WHATSAPP_CHROME_PATH ?? "",
  },
};
