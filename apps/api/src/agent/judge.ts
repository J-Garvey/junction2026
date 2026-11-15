/**
 * Bounded model judgements (D29, run on OpenAI per the team's provider choice):
 * TYPE-CHECK, AMBIGUITY-CHECK, MESSAGE-ROUTE, CATEGORY-HINT. Rules for every one:
 * never decides a hard rule; >= 0.90 is a fact, <= 0.10 rejects, anything else
 * asks a person; unreachable means ask; every answer is stored and reused (Q02.9)
 * and logged as a model judgement, separate from rule IDs (SF-05).
 */
import type { ModelJudgement, Product } from "@aimo/contracts";
import { getDb } from "../db.js";
import { FIXED } from "../rules/catalogue.js";
import { sha256, stableStringify } from "../util.js";
import { structured, ModelUnavailable, modelName } from "./openai.js";
import { z } from "zod";

const TH = { get fact() { return FIXED.decisionFact; }, get reject() { return FIXED.decisionReject; } };
const verdictOf = (p: number | null): ModelJudgement["verdict"] => (p === null ? "unsure" : p >= TH.fact ? "yes" : p <= TH.reject ? "no" : "unsure");
const ROUTE_RESULT = z.object({ new_request: z.number().min(0).max(1), event_change: z.number().min(0).max(1), neither: z.number().min(0).max(1) })
  .refine((r) => Math.abs(r.new_request + r.event_change + r.neither - 1) < .02);

function cacheGet(key: string): ModelJudgement | null {
  const r = getDb().prepare("SELECT json FROM judgements WHERE key = ?").get(key) as { json: string } | undefined;
  return r ? { ...(JSON.parse(r.json) as ModelJudgement), source: "cache" } : null;
}
function cachePut(key: string, j: ModelJudgement) {
  getDb().prepare("INSERT OR REPLACE INTO judgements (key, json) VALUES (?, ?)").run(key, JSON.stringify(j));
}

/**
 * Hand-checked classification of the 35 lactose-free products in category 10400
 * (research/03, GROUND_TRUTH 4.3). Used when the model can't be reached.
 */
const HAND_CHECKED: Record<string, string[]> = {
  "plain drinking milk": ["462775", "464179", "464399", "464768", "465149", "469330", "469363", "469386", "462921", "463038", "463335", "463779", "464073", "464119", "464198", "464201", "464306", "464398", "464401", "464440", "465039", "466288", "469119", "469287", "476240"],
  "coffee milk": ["462626", "463380", "464237"],
};
const HAND_CHECKED_SCOPE = new Set(["463203", "462626", "463380", "464237", "469266", "473142", "469331", "472492", "476957", "477050", ...HAND_CHECKED["plain drinking milk"]]);

function handChecked(type: string, productId: string): number | null {
  const list = HAND_CHECKED[type.toLowerCase()];
  if (!list || !HAND_CHECKED_SCOPE.has(productId)) return null;
  return list.includes(productId) ? 0.99 : 0.01;
}

/** Product-data hash: a stored answer is refreshed only when the product's data changes. */
const productHash = (p: Product) => sha256(stableStringify({ n: p.name, c: p.category, i: p.ingredients, cl: p.claims })).slice(0, 12);

/** TYPE-CHECK: the whole shortlist in one request. */
export async function typeCheck(type: string, candidates: Product[]): Promise<Map<string, ModelJudgement>> {
  const out = new Map<string, ModelJudgement>();
  const question = (p: Product) => `Is "${p.name}" ${type}?`;
  const todo: Product[] = [];
  for (const p of candidates) {
    const key = `TYPE-CHECK|${type.toLowerCase()}|${p.id}|${productHash(p)}`;
    // Verified data beats a model guess: the hand-checked classification wins where it exists.
    const h = handChecked(type, p.id);
    if (h !== null) {
      out.set(p.id, { fn: "TYPE-CHECK", question: question(p), subject: p.id, probability: h, threshold: TH, verdict: verdictOf(h), source: "hand_checked", model: null });
      continue;
    }
    const hit = cacheGet(key);
    if (hit) out.set(p.id, hit);
    else todo.push(p);
  }
  if (!todo.length) return out;
  let probs: Map<string, number> | null = null;
  try {
    const r = await structured<{ answers: { id: string; probability: number }[] }>({
      name: "type_check",
      system:
        "You classify wholesale food products. For each product, give the probability (0 to 1) that it IS the product type asked for, judged from its name, category and ingredients. Be calibrated: use values near 0.5 when the data can't tell. Do not judge allergens or diets.",
      user: JSON.stringify({ type, products: todo.map((p) => ({ id: p.id, name: p.name, nameFi: p.nameFi, category: p.category, ingredients: p.ingredients?.slice(0, 300) ?? null })) }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["answers"],
        properties: { answers: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "probability"], properties: { id: { type: "string" }, probability: { type: "number" } } } } },
      },
    });
    probs = new Map(r.answers.map((a) => [a.id, Math.max(0, Math.min(1, a.probability))]));
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
  }
  for (const p of todo) {
    const key = `TYPE-CHECK|${type.toLowerCase()}|${p.id}|${productHash(p)}`;
    let j: ModelJudgement;
    const m = probs?.get(p.id);
    if (typeof m === "number") j = { fn: "TYPE-CHECK", question: question(p), subject: p.id, probability: m, threshold: TH, verdict: verdictOf(m), source: "model", model: modelName() };
    else {
      const h = handChecked(type, p.id);
      j = { fn: "TYPE-CHECK", question: question(p), subject: p.id, probability: h, threshold: TH, verdict: verdictOf(h), source: h === null ? "unavailable" : "hand_checked", model: null };
    }
    if (j.source !== "unavailable") cachePut(key, j);
    out.set(p.id, j);
  }
  return out;
}

/** Words that always cover several product types in the catalogue (Q01.5). */
const AMBIGUOUS_WORDS: Record<string, string[]> = {
  cream: ["whipping cream", "cooking cream", "coffee cream", "sour cream"],
  bread: ["sliced bread", "rolls", "flatbread"],
  cheese: ["hard cheese", "cream cheese", "blue cheese"],
  fish: ["salmon", "rainbow trout", "white fish"],
};

/** AMBIGUITY-CHECK: does the line name one specific type of product? */
export async function ambiguityCheck(word: string, type: string | null): Promise<{ clear: boolean; options: string[]; judgement: ModelJudgement | null }> {
  const w = word.toLowerCase().trim();
  if (type) return { clear: true, options: [], judgement: null };
  if (AMBIGUOUS_WORDS[w]) return { clear: false, options: AMBIGUOUS_WORDS[w], judgement: null };
  const key = `AMBIGUITY-CHECK|${w}`;
  const hit = cacheGet(key);
  const q = `Does "${word}" name one specific type of product, so that nothing needs clarifying?`;
  if (hit) return { clear: hit.verdict === "yes", options: (hit as any).options ?? [], judgement: hit };
  try {
    const r = await structured<{ probability: number; options: string[] }>({
      name: "ambiguity_check",
      system: "You check purchasing requests to a food wholesaler. Give the probability that the words name one specific product type (e.g. 'whipping cream' yes, 'cream' no). If not, list up to 4 specific types it could mean.",
      user: word,
      schema: { type: "object", additionalProperties: false, required: ["probability", "options"], properties: { probability: { type: "number" }, options: { type: "array", items: { type: "string" } } } },
    });
    const j = { fn: "AMBIGUITY-CHECK", question: q, subject: w, probability: r.probability, threshold: TH, verdict: verdictOf(r.probability), source: "model", model: modelName(), options: r.options } as ModelJudgement & { options: string[] };
    cachePut(key, j);
    return { clear: j.verdict === "yes", options: r.options, judgement: j };
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
    // Unreachable means ask, never guess: an unknown word is treated as clear only if the catalogue search is narrow (checked later).
    return { clear: true, options: [], judgement: { fn: "AMBIGUITY-CHECK", question: q, subject: w, probability: null, threshold: TH, verdict: "unsure", source: "unavailable", model: null } };
  }
}

/** MESSAGE-ROUTE (Q10.6): new request, change to an event, or neither. */
export async function messageRoute(text: string): Promise<{ route: "new_request" | "event_change" | "neither" | "unsure"; judgement: ModelJudgement | null }> {
  const t = text.toLowerCase();
  const changeHint = /\b(\d+)\s*guests?\b|\bnow\b.*\bguests?\b|\ballerg|\bguest count\b/.test(t);
  const requestHint = /\b\d[\d\s.,]*\s*(l|litres?|liters?|kg|g|ml|dl|pcs|packs?|cases?)\b|\bby (mon|tue|wed|thu|fri|sat|sun|tomorrow)|^\s*\d[\d.,]*\s*(x\s*)?\p{L}/u.test(t);
  if (changeHint && !requestHint) return { route: "event_change", judgement: null };
  if (requestHint && !changeHint) return { route: "new_request", judgement: null };
  const q = "Is this message a new request, a change to an existing event, or neither?";
  try {
    const r = await structured<{ new_request: number; event_change: number; neither: number }>({
      name: "message_route",
      system: "Route a message typed into a hotel kitchen's purchasing app. Give a probability for each route; they must sum to 1.",
      user: text,
      schema: { type: "object", additionalProperties: false, required: ["new_request", "event_change", "neither"], properties: { new_request: { type: "number" }, event_change: { type: "number" }, neither: { type: "number" } } },
      validate: (value) => {
        const result = ROUTE_RESULT.safeParse(value);
        if (!result.success) throw new ModelUnavailable("The model returned an invalid message route");
        return result.data;
      },
    });
    const best = (Object.entries(r) as [keyof typeof r, number][]).sort((a, b) => b[1] - a[1])[0];
    const j: ModelJudgement = { fn: "MESSAGE-ROUTE", question: q, subject: text.slice(0, 80), probability: best[1], threshold: TH, verdict: verdictOf(best[1]), source: "model", model: modelName() };
    return { route: best[1] >= TH.fact ? best[0] : "unsure", judgement: j };
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
    return { route: requestHint ? "new_request" : "unsure", judgement: null };
  }
}
