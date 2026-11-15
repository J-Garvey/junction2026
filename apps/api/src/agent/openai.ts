/**
 * The only model provider: OpenAI, Responses API with structured outputs.
 * Model and effort come from env (OPENAI_MODEL, default gpt-6-astra; low effort).
 * The model sits only at the edges (D10): it parses requests, answers bounded
 * yes/no or choice questions, and rephrases explanations. It never decides.
 */
import { config } from "../config.js";
import { createHash } from "node:crypto";

export class ModelUnavailable extends Error {}

export const modelName = () => config.openai.model;
export const modelConfigured = () => Boolean(config.openai.apiKey);

type StructuredOptions<T> = {
  name: string; system: string; user: string; schema: Record<string, unknown>;
  /** Only validated interpretations may be reused after the request completes. */
  validate?: (value: unknown) => T;
};

const pending = new Map<string, Promise<unknown>>();
const interpretations = new Map<string, { json: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_LIMIT = 128;
const CACHE_MAX_BYTES = 100_000;

/** Share identical in-flight calls; reuse validated, immutable interpretations briefly. */
export async function structured<T>(opts: StructuredOptions<T>): Promise<T> {
  if (!config.openai.apiKey) throw new ModelUnavailable("OPENAI_API_KEY is not set");
  // Exact prompt/schema/settings, including credential changes. Keys and values stay in memory.
  const key = createHash("sha256").update(JSON.stringify([
    config.openai.baseUrl, config.openai.apiKey, config.openai.model, config.openai.reasoningEffort,
    opts.name, opts.system, opts.user, opts.schema,
  ])).digest("hex");
  const cached = interpretations.get(key);
  if (cached) {
    if (cached.expiresAt > Date.now() && opts.validate) {
      try {
        const result = opts.validate(JSON.parse(cached.json));
        interpretations.delete(key);
        interpretations.set(key, cached);
        return result;
      } catch (error) {
        interpretations.delete(key);
        throw error;
      }
    }
    interpretations.delete(key);
  }
  let work = pending.get(key);
  if (!work) {
    work = requestStructured(opts);
    pending.set(key, work);
  }
  try {
    const value = await work;
    // Each caller owns its result, including simultaneous callers sharing one network request.
    const copy = structuredClone(value);
    const result = opts.validate ? opts.validate(copy) : copy as T;
    if (opts.validate) {
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json) <= CACHE_MAX_BYTES) {
        interpretations.delete(key);
        if (interpretations.size >= CACHE_LIMIT) interpretations.delete(interpretations.keys().next().value!);
        interpretations.set(key, { json, expiresAt: Date.now() + CACHE_TTL_MS });
      }
    }
    return result;
  } finally {
    if (pending.get(key) === work) pending.delete(key);
  }
}

async function requestStructured(opts: StructuredOptions<unknown>): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), config.openai.timeoutMs);
  try {
    const res = await fetch(`${config.openai.baseUrl}/responses`, {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.openai.model,
        reasoning: { effort: config.openai.reasoningEffort },
        input: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        text: { format: { type: "json_schema", name: opts.name, schema: opts.schema, strict: true } },
        store: false,
      }),
    });
    if (!res.ok) throw new ModelUnavailable(`OpenAI returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    const text =
      data.output_text ??
      (data.output ?? [])
        .flatMap((o: any) => o.content ?? [])
        .filter((c: any) => c.type === "output_text")
        .map((c: any) => c.text)
        .join("");
    if (!text) throw new ModelUnavailable("OpenAI returned no text");
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof ModelUnavailable) throw e;
    throw new ModelUnavailable(`OpenAI call failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}
