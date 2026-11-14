/**
 * The only model provider: OpenAI, Responses API with structured outputs.
 * Model and effort come from env (OPENAI_MODEL, default gpt-6-astra; low effort).
 * The model sits only at the edges (D10): it parses requests, answers bounded
 * yes/no or choice questions, and rephrases explanations. It never decides.
 */
import { config } from "../config.js";

export class ModelUnavailable extends Error {}

export const modelName = () => config.openai.model;
export const modelConfigured = () => Boolean(config.openai.apiKey);

export async function structured<T>(opts: { name: string; system: string; user: string; schema: Record<string, unknown> }): Promise<T> {
  if (!config.openai.apiKey) throw new ModelUnavailable("OPENAI_API_KEY is not set");
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
    return JSON.parse(text) as T;
  } catch (e) {
    if (e instanceof ModelUnavailable) throw e;
    throw new ModelUnavailable(`OpenAI call failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}
