/**
 * Chunk 01: REQUEST-PARSE, REQUEST-VALIDATE, CONSTRAINT-CHECK, QUANTITY-SANITY.
 * Free text becomes the same structured lines as the table editor. The model
 * fills in only what the text says; a deterministic parser covers the same
 * grammar when the model can't be reached, and the result is echoed back as
 * editable chips before anything is quoted (UI-04).
 */
import type { Amount, SingleLine, SingleRequest, Unit, FiredRule } from "@aimo/contracts";
import { now } from "../clock.js";
import { fire } from "../rules/catalogue.js";
import { isoDate } from "../util.js";
import { structured, ModelUnavailable } from "./openai.js";
import { headIndex, isLiteralProductQuery, queryTerms, QUERY_FORMS } from "../search.js";
import { z } from "zod";

/** Known product words: the type asked for and a category hint (CATEGORY-HINT, deterministic tier). */
export const PRODUCT_WORDS: { re: RegExp; word: string; type: string | null; category: string | null }[] = [
  { re: /\bcoffee milk\b/, word: "coffee milk", type: "coffee milk", category: "10400" },
  { re: /\bwhipping cream\b/, word: "whipping cream", type: "whipping cream", category: "10401" },
  { re: /\bcooking cream\b/, word: "cooking cream", type: "cooking cream", category: "10401" },
  { re: /\bcoffee cream\b/, word: "coffee cream", type: "coffee cream", category: "10401" },
  { re: /\bsour cream\b/, word: "sour cream", type: "sour cream", category: "10419" },
  { re: /\bmilk\b|\bmaito\b/, word: "milk", type: "plain drinking milk", category: "10400" },
  { re: /\bcream\b|\bkerma\b/, word: "cream", type: null, category: "10401" },
  { re: /\bbutter\b/, word: "butter", type: "butter", category: "1050" },
  { re: /\bsalmon\b|\blohi\b/, word: "salmon", type: "salmon", category: null },
  { re: /\bpotato(es)?\b/, word: "potatoes", type: "potatoes", category: "17421" },
  { re: /\beggs?\b/, word: "eggs", type: "eggs", category: null },
  { re: /\bbread\b/, word: "bread", type: null, category: null },
];

/**
 * The product word only counts as the head of the phrase: "cream cheese" is a cheese, not
 * cream, and gets no cream category. Form words may follow ("salmon fillet").
 */
export function productWord(phrase: string): (typeof PRODUCT_WORDS)[number] | undefined {
  const s = phrase.toLowerCase();
  const terms = queryTerms(s);
  for (const w of PRODUCT_WORDS) {
    const m = s.match(w.re);
    if (!m) continue;
    // A compound identity (oat milk, cream cheese) owns the whole phrase.
    if (terms[headIndex(terms)]?.key !== queryTerms(w.word)[0]?.key) continue;
    const rest = s.slice(m.index! + m[0].length).split(/[^\p{L}]+/u).filter(Boolean);
    if (rest.every((r) => QUERY_FORMS.has(r))) return w;
  }
  return undefined;
}

const CLAIM_WORDS: [RegExp, string][] = [
  [/lactose[- ]?free|laktoositon/, "FREE_FROM_LACTOSE"],
  [/gluten[- ]?free|gluteeniton/, "FREE_FROM_GLUTEN"],
  [/\bvegan\b/, "VEGAN"],
  [/milk[- ]?free|maidoton/, "FREE_FROM_MILK"],
];

const UNIT_MAP: Record<string, Unit> = { l: "l", litre: "l", litres: "l", liter: "l", liters: "l", ltr: "l", kg: "kg", kilo: "kg", kilos: "kg", g: "g", gram: "g", grams: "g", ml: "ml", dl: "dl", pcs: "pcs", pieces: "pcs", piece: "pcs", pc: "pcs" };

const NUMBER = "[+-]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)";
const UNIT_AMOUNT = new RegExp(`(?<![\\d.,])(${NUMBER})\\s*(litres?|liters?|ltr|l|kg|kilos?|grams?|g|ml|dl|pcs|pieces?|pc)\\b`);
/** A number on its own, with an optional "x" either side; not a 6-digit product code or a day of the month. */
const BARE_COUNT = /(?:\bx\s*)?(?<![\d.,/-])([+-]?(?:\d{1,5}(?:[.,]\d+)?|[.,]\d+))(?![\d.,/-])(?!\s*(?:\.|st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))(?:\s*x\b)?/;

/** Consume complete groups only, without joining separate lines or decimal commas. */
const normalizeNumbers = (text: string) => text.replace(/\b\d{1,3}(?:[, \u00a0]\d{3})+(?!\d)/g, (s) => s.replace(/[, \u00a0]/g, ""));
const LIST_SEPARATOR = /\s*(?:,(?!\d)|\band\b|\+|;|\r?\n)\s*/i;
const DATE_WORD = "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|today|tomorrow|20\\d\\d-\\d\\d-\\d\\d)";

/** Only explicit countries are facts; a brand or missing origin proves nothing. */
function restrictions(text: string) {
  let rest = text;
  const claims = CLAIM_WORDS.filter(([re]) => re.test(text)).map(([, claim]) => claim);
  rest = rest.replace(/\b(?:lactose[- ]?free|laktoositon|gluten[- ]?free|gluteeniton|vegan|milk[- ]?free|maidoton)\b/g, " ");
  const avoidAllergens: string[] = [];
  const allergens: [string, string[]][] = [
    ["(?:tree[- ]?)?nuts?", ["AN", "AP"]], ["peanuts?", ["AP"]], ["almonds?", ["SA"]],
    ["milk|dairy", ["AM"]], ["eggs?", ["AE"]], ["soy|soya", ["AY"]], ["sesame", ["AS"]],
    ["fish", ["AF"]], ["shellfish", ["UN", "AC", "UM"]], ["wheat", ["UW"]], ["gluten", ["AW"]],
  ];
  for (const [word, codes] of allergens) {
    rest = rest.replace(new RegExp(`\\b(?:${word})[- ]free\\b|\\b(?:without|no)\\s+(?:${word})\\b`, "g"), () => {
      avoidAllergens.push(...codes);
      return " ";
    });
  }
  const origins = new Set<string>();
  for (const [word, code] of [["finnish|from finland|suomalainen|kotimainen", "fi"], ["swedish|from sweden", "se"], ["norwegian|from norway", "no"]]) {
    rest = rest.replace(new RegExp(`\\b(?:${word})\\b`, "g"), () => { origins.add(code); return " "; });
  }
  return { rest, claims, avoidAllergens: [...new Set(avoidAllergens)], origin: [...origins][0], conflictingOrigin: origins.size > 1 };
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** A relative date ("Monday") resolves to the next one and is shown back in the chips (Q01.5). */
export function resolveDate(text: string, from: Date = now()): { date: string | null; text: string | null } {
  const t = text.toLowerCase();
  const iso = t.match(/\b(20\d\d-\d\d-\d\d)\b/);
  if (iso) return { date: iso[1], text: iso[1] };
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(from.getTime() + 86_400_000);
    return { date: isoDate(d), text: "tomorrow" };
  }
  if (/\btoday\b/.test(t)) return { date: isoDate(from), text: "today" };
  for (let i = 0; i < 7; i++) {
    const m = t.match(new RegExp(`\\b(${DAYS[i]}|${DAYS[i].slice(0, 3)})\\b`));
    if (m) {
      const helsinkiDay = new Date(from.toLocaleString("en-US", { timeZone: "Europe/Helsinki" })).getDay();
      let delta = (i - helsinkiDay + 7) % 7;
      if (delta === 0) delta = 7;
      const d = new Date(from.getTime() + delta * 86_400_000);
      return { date: isoDate(new Date(d.toLocaleString("en-US", { timeZone: "Europe/Helsinki" }))), text: DAYS[i][0].toUpperCase() + DAYS[i].slice(1) };
    }
  }
  const dm = t.match(/\b(\d{1,2})\s*(?:\.|st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (dm) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(dm[2]);
    const y = from.getUTCFullYear();
    let d = new Date(Date.UTC(y, month, Number(dm[1])));
    if (d.getTime() < from.getTime() - 86_400_000) d = new Date(Date.UTC(y + 1, month, Number(dm[1])));
    return { date: isoDate(d), text: dm[0] };
  }
  return { date: null, text: null };
}

let lineSeq = 0;
const lineId = () => `ln${Date.now().toString(36)}${(lineSeq++).toString(36)}`;

/** Deterministic parser for the same grammar the model is asked to fill. */
export function rulesParse(text: string): Omit<SingleRequest, "siteId" | "outletId"> {
  const date = resolveDate(text);
  // "1,000 litres" and "1 000 l" are thousands, not two items; "1,5 l" stays a decimal.
  let clean = normalizeNumbers(text.toLowerCase());
  let global = restrictions("");
  const globalPrefix = clean.match(/^(?:all(?:\s+(?:items|products))?|everything)(?:\s+(?:must|should))?(?:\s+be)?\s+([^:]+):\s*/);
  if (globalPrefix) {
    const parsed = restrictions(globalPrefix[1]);
    if (!parsed.rest.trim() && (parsed.claims.length || parsed.avoidAllergens.length || parsed.origin)) {
      global = parsed;
      clean = clean.slice(globalPrefix[0].length);
    }
  }
  const globalText = clean.match(/(?:[,;]\s*|\s+)(?:all(?:\s+(?:items|products))?|everything)(?:\s+(?:must|should))?(?:\s+be)?\s+(.+)$/);
  if (globalText) {
    const parsed = restrictions(globalText[1]);
    if (!parsed.rest.trim() && (parsed.claims.length || parsed.avoidAllergens.length || parsed.origin)) {
      global = {
        ...parsed,
        claims: [...new Set([...global.claims, ...parsed.claims])],
        avoidAllergens: [...new Set([...global.avoidAllergens, ...parsed.avoidAllergens])],
        origin: parsed.origin ?? global.origin,
        conflictingOrigin: global.conflictingOrigin || parsed.conflictingOrigin || Boolean(global.origin && parsed.origin && global.origin !== parsed.origin),
      };
      clean = clean.slice(0, globalText.index);
    }
  }
  const parts = clean
    .replace(new RegExp(`\\b(?:by|before|on|for)\\s+${DATE_WORD}\\b`, "gi"), "")
    .split(LIST_SEPARATOR)
    .filter((s) => s.trim());
  const lines: SingleLine[] = [];
  for (const raw of parts) {
    const s = raw.toLowerCase();
    const q = s.match(UNIT_AMOUNT);
    // A bare count ("10 cheese", "12 x birthday cakes") is pieces; no number at all is one piece.
    const count = q ? null : s.match(BARE_COUNT);
    const parsedQuantity: Amount = q
      ? { amount: Number(q[1].replace(/\s/g, "").replace(",", ".")), unit: UNIT_MAP[q[2]] ?? "pcs" }
      : { amount: count ? Number(count[1].replace(",", ".")) : 1, unit: "pcs" };
    const local = restrictions(s);
    const conflictingOrigin = local.conflictingOrigin || global.conflictingOrigin || Boolean(local.origin && global.origin && local.origin !== global.origin);
    const quantity = parsedQuantity.amount >= 0 && Number.isFinite(parsedQuantity.amount) && !conflictingOrigin ? parsedQuantity : null;
    const claims = [...new Set([...global.claims, ...local.claims])];
    const pid = s.match(/\b(4\d{5})\b/);
    const leftover = local.rest
      .replace(q ? UNIT_AMOUNT : BARE_COUNT, "")
      .replace(/\bof\b|\bi need\b|\bwe need\b|\bplease\b|\border\b|^\s*add\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const pw = productWord(leftover || s);
    if (!pw && !pid && !leftover) continue;
    lines.push({
      id: lineId(),
      text: raw.trim(),
      // "salmon fillet" keeps its form word for the search; "lactose-free milk" is just milk.
      query: leftover || pw?.word || s,
      productType: pw?.type ?? null,
      category: pw?.category ?? null,
      productId: pid?.[1] ?? null,
      quantity,
      constraints: {
        claims,
        avoidAllergens: [...new Set([...global.avoidAllergens, ...local.avoidAllergens])],
        labels: [],
        ...(local.origin || global.origin ? { origin: local.origin ?? global.origin } : {}),
      },
    });
  }
  return { kind: "single", originalText: text, neededBy: date.date, neededByText: date.text, lines, parsedBy: "rules" };
}

const PARSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["neededByText", "lines"],
  properties: {
    neededByText: { type: ["string", "null"], description: "The date words exactly as written, e.g. 'Monday', '16 Nov', or null" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "productWord", "productType", "productId", "amount", "unit", "claims", "avoidAllergens", "origin"],
        properties: {
          text: { type: "string" },
          productWord: { type: "string", description: "The complete product description in English, preserving brand, species, form and modifiers, e.g. 'chicken burger', 'oat milk', 'unsalted butter'. Never shorten to a broader product." },
          productType: { type: ["string", "null"], description: "Specific type if the text names one, e.g. 'plain drinking milk' for 'milk'; null if it could be several types" },
          productId: { type: ["string", "null"] },
          amount: { type: ["number", "null"] },
          unit: { type: ["string", "null"], enum: ["g", "kg", "ml", "dl", "l", "pcs", null] },
          claims: { type: "array", items: { type: "string", enum: ["FREE_FROM_LACTOSE", "FREE_FROM_GLUTEN", "VEGAN", "FREE_FROM_MILK"] } },
          avoidAllergens: { type: "array", items: { type: "string" }, description: "GS1 allergen codes to avoid, only if stated" },
          origin: { type: ["string", "null"], description: "Required ISO alpha-2 country of origin, lowercase (Finnish = fi); null if none. Never infer origin from a brand." },
        },
      },
    },
  },
};

const MODEL_RESULT = z.object({
  neededByText: z.string().nullable(),
  lines: z.array(z.object({
    text: z.string().min(1), productWord: z.string().min(1), productType: z.string().nullable(),
    productId: z.string().regex(/^\d{6}$/).nullable(), amount: z.number().nullable(),
    unit: z.enum(["g", "kg", "ml", "dl", "l", "pcs"]).nullable(),
    claims: z.array(z.enum(["FREE_FROM_LACTOSE", "FREE_FROM_GLUTEN", "VEGAN", "FREE_FROM_MILK"])),
    avoidAllergens: z.array(z.string().regex(/^[A-Z]{2,3}$/)),
    origin: z.string().regex(/^[a-z]{2}$/).nullable().optional(),
  })),
});

/**
 * Fully consumed literal product lists need no model: quantity, supported diet claims,
 * product vocabulary, and an optional date suffix. Anything richer stays on the model
 * path, especially allergy instructions, alternatives, delivery times and unknown words.
 */
export function parseSimpleRequest(text: string): Omit<SingleRequest, "siteId" | "outletId"> | null {
  let body = normalizeNumbers(text.toLowerCase().trim());
  const dateSuffix = body.match(/\s+(?:by|before|on|for)\s+(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|today|tomorrow|20\d\d-\d\d-\d\d)$/);
  if (dateSuffix) body = body.slice(0, dateSuffix.index);
  body = body.replace(/^(?:(?:i|we) need\s+|please\s+|add\s+|order\s+)+/, "");
  const parts = body.split(LIST_SEPARATOR);
  if (!parts.length) return null;
  const amountPrefix = /^(\d+(?:[.,]\d+)?)\s*(?:(litres?|liters?|ltr|kg|kilos?|grams?|ml|dl|pcs|pieces?|pc|l|g)\b|x\b)?\s*/;
  for (let part of parts) {
    if (/^4\d{5}$/.test(part)) continue;
    part = part.replace(amountPrefix, "").replace(/^of\s+/, "");
    // Claim removal must consume whole phrases; an unrecognised restriction is never dropped.
    part = part.replace(/\b(?:lactose[- ]free|gluten[- ]free|milk[- ]free|vegan)\b/g, "").trim();
    if (!/^4\d{5}$/.test(part) && !isLiteralProductQuery(part)) return null;
  }
  // Parse the date separately so tomorrow/ISO dates don't become part of the product.
  const request = rulesParse(body);
  if (dateSuffix) {
    const date = resolveDate(dateSuffix[1]);
    request.neededBy = date.date;
    request.neededByText = date.text;
  }
  request.originalText = text;
  return request;
}

/** REQUEST-PARSE: literal product lists locally; other language through OpenAI with a visible fallback. */
export async function parseRequest(text: string): Promise<{ request: Omit<SingleRequest, "siteId" | "outletId">; note: string | null }> {
  const simple = parseSimpleRequest(text);
  if (simple) return { request: simple, note: null };
  try {
    const rawResult = await structured<unknown>({
      name: "purchase_request",
      system:
        "You turn a hotel kitchen's purchasing message to a food wholesaler into structured lines. Fill in only what the text says. Never invent a quantity, unit, date or product. Retain EVERY requested item, including long lists and repetitions. Translate Finnish to English in productWord but keep the original text. Preserve brand, species and form. Use diet claims, allergen exclusions and required origin only when stated. Apply item-specific constraints only to that item; apply explicit global constraints to every item. Nut-free excludes both tree nuts (AN) and peanuts (AP). Never infer origin from a brand. Keep country requirements in origin, not in productWord. Do not turn an alternative into an additional ordered item. Unsupported or unclear quantities must have null amount and unit.",
      user: text,
      schema: PARSE_SCHEMA,
    });
    const parsed = MODEL_RESULT.safeParse(rawResult);
    if (!parsed.success) throw new ModelUnavailable("The parser returned an invalid request");
    const r = parsed.data;
    const date = resolveDate(r.neededByText ?? text);
    const lines: SingleLine[] = r.lines.map((l) => {
      const pw = productWord(String(l.productWord));
      return {
        id: lineId(),
        text: l.text,
        query: l.productWord,
        productType: l.productType ?? pw?.type ?? null,
        category: pw?.category ?? null,
        productId: l.productId && /^\d{6}$/.test(l.productId) ? l.productId : null,
        // A count without a unit is pieces; an unclear or invalid amount needs clarification.
        quantity: typeof l.amount === "number" ? (l.amount >= 0 ? { amount: l.amount, unit: l.unit ?? "pcs" } : null) : null,
        constraints: { claims: l.claims, avoidAllergens: l.avoidAllergens, labels: [], ...(l.origin ? { origin: l.origin } : {}) },
      };
    });
    return { request: { kind: "single", originalText: text, neededBy: date.date, neededByText: date.text, lines, parsedBy: "openai" }, note: null };
  } catch (e) {
    if (!(e instanceof ModelUnavailable)) throw e;
    return { request: rulesParse(text), note: `Read by the built-in parser (${e.message}). Check the chips.` };
  }
}

/** REQUEST-VALIDATE + CONSTRAINT-CHECK for a single request: one grouped question, never a default. */
export function checkSingle(r: SingleRequest): FiredRule[] {
  const out: FiredRule[] = [];
  const today = isoDate(now());
  if (!r.neededBy || r.neededBy <= today) out.push(fire("REQ-03", { need: r.lines.map((l) => l.query).join(", ") || "this" }));
  if (!r.lines.length) out.push(fire("REQ-02", { need: "what" }));
  for (const l of r.lines) if (!l.quantity || !(l.quantity.amount > 0)) out.push(fire("REQ-02", { need: l.query, lineId: l.id }));
  return out;
}

/** UNIT-CONVERT: g, kg, ml, dl, l and pieces to kg, L or pieces. Never weight to volume. */
export function toBase(a: Amount): { value: number; unit: "kg" | "l" | "pcs" } {
  switch (a.unit) {
    case "g": return { value: a.amount / 1000, unit: "kg" };
    case "kg": return { value: a.amount, unit: "kg" };
    case "ml": return { value: a.amount / 1000, unit: "l" };
    case "dl": return { value: a.amount / 10, unit: "l" };
    case "l": return { value: a.amount, unit: "l" };
    default: return { value: a.amount, unit: "pcs" };
  }
}

/** QUANTITY-SANITY (Q01.7): per-guest bounds and the 10/100/1,000 check. Never corrects. */
export function quantitySanity(need: string, perPortion: Amount, guests: number, statedTotal?: Amount): FiredRule[] {
  const out: FiredRule[] = [];
  const b = toBase(perPortion);
  if (b.unit !== "pcs") {
    if (b.value > 1) out.push(fire("QTY-02", { need, amount: `${perPortion.amount} ${perPortion.unit}`, suggest: `${perPortion.amount} ${b.unit === "l" ? "dl" : "g"}` }));
    else if (b.value < 0.001) out.push(fire("QTY-02", { need, amount: `${perPortion.amount} ${perPortion.unit}`, suggest: `${perPortion.amount} ${b.unit === "l" ? "dl" : "kg"}` }));
  }
  if (statedTotal) {
    const t = toBase(statedTotal);
    const expected = b.value * guests;
    for (const f of [10, 100, 1000]) if (expected > 0 && t.unit === b.unit && (Math.abs(t.value / expected - f) < 0.01 || Math.abs(expected / t.value - f) < 0.01))
      out.push(fire("QTY-02", { need, amount: `${statedTotal.amount} ${statedTotal.unit} total`, suggest: `${+(expected).toFixed(2)} ${b.unit}` }));
  }
  return out;
}
