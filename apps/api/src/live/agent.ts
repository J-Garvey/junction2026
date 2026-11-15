/**
 * The hotel's purchasing agent, as a real tool-using model. Its only tools are
 * the gateway's published operations (see /openapi.json), called over HTTP with
 * the hotel's agent token, exactly as any outside agent would. Two extra tools
 * stop the loop and put a one-tap card in front of a person: the chef (stock the
 * gateway can't confirm) or the approver (anything outside the hotel's rules).
 */
import { EventEmitter } from "node:events";
import { config } from "../config.js";
import { now } from "../clock.js";
import { kvGet } from "../db.js";
import { issueToken, resolveToken } from "../identity.js";
import { newId, shortName } from "../util.js";

// ---------- session state, shown on the left half ----------

export type CallStep = { kind: "call"; n: number; method: string; path: string; summary: string; tone: "ok" | "warn" | "err" | "run"; ms: number | null };
export type SayStep = { kind: "say"; text: string };
export type ChefStep = { kind: "chef"; text: string; at: string };
export type CardOption = { id: string; label: string; sub?: string };
export type CardStep = {
  kind: "card";
  id: string;
  who: "chef" | "approver";
  person: string;
  title: string;
  body: string;
  options: CardOption[];
  answer: { optionId: string; label: string; by: string } | null;
};
export type Step = CallStep | SayStep | ChefStep | CardStep;

export type Session = {
  id: string;
  status: "idle" | "running" | "waiting" | "done" | "error";
  steps: Step[];
  error: string | null;
  model: string;
};

type Pending = { callId: string; card: CardStep; quoteId?: string; approvalsNeeded?: string[] };

const bus = new EventEmitter();
bus.setMaxListeners(100);
export const agentBus = bus;

let session: Session = blank();
let input: any[] = [];
let pending: Pending | null = null;
let lastQuoteId: string | null = null;
const builderConsents = new Map<string, string>();
let runId = 0;

function blank(): Session {
  return { id: newId("run"), status: "idle", steps: [], error: null, model: config.openai.model };
}
export const currentSession = () => session;
const emit = () => bus.emit("session", session);

export function resetSession() {
  runId++;
  session = blank();
  input = [];
  pending = null;
  lastQuoteId = null;
  builderConsents.clear();
  emit();
}

// ---------- the model call (swappable in tests) ----------

export type ModelTurn = (req: { instructions: string; input: any[]; tools: any[] }) => Promise<{ output: any[] }>;

const openaiTurn: ModelTurn = async ({ instructions, input, tools }) => {
  if (!config.openai.apiKey) throw new Error("OPENAI_API_KEY is not set, so the live agent can't run");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), Math.max(config.openai.timeoutMs, 60000));
  try {
    const res = await fetch(`${config.openai.baseUrl}/responses`, {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${config.openai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.openai.model,
        reasoning: { effort: config.openai.reasoningEffort },
        instructions,
        input,
        tools,
        parallel_tool_calls: false,
        store: false,
        include: ["reasoning.encrypted_content"],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as { output: any[] };
  } finally {
    clearTimeout(t);
  }
};
let modelTurn: ModelTurn = openaiTurn;
export function setModelTurn(fn: ModelTurn | null) {
  modelTurn = fn ?? openaiTurn;
}

// ---------- tools: the gateway's operations, plus two that ask a person ----------

const nul = (t: string | string[]) => ({ type: Array.isArray(t) ? [...t, "null"] : [t, "null"] });
const strArr = { type: ["array", "null"], items: { type: "string" } };

export const TOOLS = [
  {
    type: "function",
    name: "search_products",
    description: "GET /gateway/v1/products. Search Valio Aimo's catalogue. Use filters, not only text: lactose-free is claim FREE_FROM_LACTOSE; milk is category 10400.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["q", "category", "claims", "excludeAllergens", "limit"],
      properties: {
        q: { ...nul("string"), description: "Text in the English or Finnish name" },
        category: { ...nul("string"), description: "Category code or prefix, e.g. 10400" },
        claims: { ...strArr, description: "Every claim must be present, e.g. FREE_FROM_LACTOSE, FREE_FROM_GLUTEN" },
        excludeAllergens: { ...strArr, description: "GS1 allergen codes to exclude, e.g. AN (tree nuts), AM (milk)" },
        limit: { ...nul("integer"), description: "Max 50" },
      },
    },
  },
  {
    type: "function",
    name: "check_price_and_stock",
    description: "POST /gateway/v1/lookup. Fixed price, stock and delivery date for up to 30 products. Stock 'unknown' means Valio Aimo can't confirm the amount.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["productIds", "requestedDate"],
      properties: { productIds: { type: "array", items: { type: "string" } }, requestedDate: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    type: "function",
    name: "read_hotel_rules",
    description: "GET /gateway/v1/mandate. The hotel's signed rules: budget per order, sites, delivery days.",
    strict: true,
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
  },
  {
    type: "function",
    name: "create_quote",
    description: "POST /gateway/v1/quotes. A signed quote at fixed prices. The gateway checks the hotel's rules and says whether a person must decide.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["deliveryDate", "lines"],
      properties: {
        deliveryDate: { type: "string", description: "YYYY-MM-DD" },
        lines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["productId", "quantity", "outletId", "lactoseFree", "glutenFree", "avoidAllergens"],
            properties: {
              productId: { type: "string" },
              quantity: { type: "integer", description: "Whole sales units, rounded up" },
              outletId: { type: "string", enum: ["banquet", "bar"] },
              lactoseFree: { type: "boolean", description: "The buyer asked for lactose-free" },
              glutenFree: { type: "boolean" },
              avoidAllergens: { type: "array", items: { type: "string" }, description: "GS1 codes the product must not contain" },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "place_order",
    description: "POST /gateway/v1/orders. Orders a quote. Attach approvalId when the quote needed approval. List products with unconfirmed stock in continueWithUnconfirmedStock only after the chef chose to continue.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["quoteId", "approvalId", "continueWithUnconfirmedStock"],
      properties: {
        quoteId: { type: "string" },
        approvalId: nul("string"),
        continueWithUnconfirmedStock: strArr,
      },
    },
  },
  {
    type: "function",
    name: "ask_chef",
    description: "Stops and asks the head chef one question with 2 or 3 short options. Use when a quote has unconfirmedStock, or when the request is unclear.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title", "question", "options"],
      properties: {
        title: { type: "string", description: "Max 4 words, e.g. 'Stock not confirmed'" },
        question: { type: "string", description: "One sentence" },
        options: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "sub"],
            properties: { id: { type: "string" }, label: { type: "string", description: "Max 4 words" }, sub: { ...nul("string"), description: "Optional short detail, e.g. '435 of 1,000 L'" } },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "request_approval",
    description: "Stops and asks the hotel's approver (finance manager) to sign off a quote whose mandateCheck did not pass. Returns an approvalId to attach to the order.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["quoteId", "reason"],
      properties: { quoteId: { type: "string" }, reason: { type: "string", description: "One sentence, plain words, with the amount" } },
    },
  },
];

const PATHS: Record<string, [string, string]> = {
  search_products: ["GET", "/products"],
  check_price_and_stock: ["POST", "/lookup"],
  read_hotel_rules: ["GET", "/mandate"],
  create_quote: ["POST", "/quotes"],
  place_order: ["POST", "/orders"],
  request_approval: ["POST", "/approvals"],
};

function instructions(): string {
  const t = now();
  const date = t.toISOString().slice(0, 10);
  const weekday = t.toLocaleDateString("en-GB", { weekday: "long", timeZone: "Europe/Helsinki" });
  return [
    "You are Demo Hotel's purchasing agent (Helsinki). You buy from Valio Aimo only through its Agent Gateway tools.",
    `Today is ${weekday} ${date}. Site: site-aurora. Outlets: banquet (default) and bar.`,
    "Work in this order, with as few calls as possible:",
    "1. search_products with filters. Lactose-free = claim FREE_FROM_LACTOSE. Milk = category 10400. 'Milk' means plain drinking milk: not coffee milk, piimä/buttermilk, flavoured drinks or portion creamers.",
    "2. check_price_and_stock for the matching shortlist (max 30 ids). requestedDate = the date the buyer needs delivery.",
    "3. Pick products meeting every requirement. Preserve a product explicitly chosen by the buyer or recipe if it passes the rules and has a price. For automatic picks measured in kg or litres, prioritise lowest price per litre or kg (comparisonPrice). For a piece need (D36), compare fixed ex-VAT cost of the whole sales packs needed to cover the quantity, then delivery reliability. Use only checked piece conversions; ask the builder for whole sales units if unknown, and never infer pieces per ordered kg from a product name. Stock does not affect ranking, including ties. Mention unknown stock and ask the chef whether to continue in step 6, even if a more expensive product has confirmed stock. Missing prices go last and cannot be ordered. Never treat zero or unknown stock as confirmed availability.",
    "4. Convert the need to whole sales units with packContent (round up). Never invent prices; use the gateway's.",
    "5. create_quote. Set lactoseFree/glutenFree/avoidAllergens from what the buyer asked.",
    "6. If the quote lists unconfirmedStock, ask_chef: options 'continue' (Continue) and 'confirmed' (Use confirmed stock, with sub showing how much confirmed stock exists, e.g. '435 of 1,000 L'). If the chef picks confirmed stock, quote again using only products with known stock, split across them.",
    "7. If mandateCheck.pass is false, request_approval with the quoteId. If rejected, stop.",
    "8. place_order with the quoteId, approvalId if any, and continueWithUnconfirmedStock (the server attaches the authenticated chef consent) if the chef chose to continue.",
    "If the gateway refuses, say why in one sentence and fix it only if you can without guessing.",
    "Between tool calls do not write prose. At the end write one short sentence: what was ordered, the total ex VAT and the delivery date. No markdown.",
  ].join("\n");
}

// ---------- gateway calls, over HTTP with the hotel agent's own token ----------

async function gateway(method: string, path: string, body?: unknown, opts: { token?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(config.gatewayUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token ?? kvGet<string>("agentToken")}`,
      ...(process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {}),
      ...(opts.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Compact views keep the model's context small and the facts exact. */
const slimProduct = (p: any) => ({ id: p.id, name: p.name, brand: p.brand, claims: p.claims, packContent: p.packContent, salesUnit: p.catalogueSalesUnit, reliability: p.reliability, hasAllergenData: p.hasAllergenData });
const slimLine = (l: any) => ({
  productId: l.productId,
  deliverable: l.deliverable,
  salesBlock: l.salesBlock,
  salesUnit: l.salesUnit,
  price: l.price?.value ?? null,
  comparisonPrice: l.price?.comparisonPrice ?? null,
  comparisonUnit: l.price?.comparisonUnit ?? null,
  stock: l.stock.kind === "known" ? l.stock.amount : l.stock.kind === "none" ? 0 : "unknown",
  availableDate: l.availableDate,
  closingTime: l.closingTime,
});
const slimQuote = (q: any) => ({
  quoteId: q.id,
  totalExVat: q.totalExVat,
  outcome: q.outcome,
  mandateCheck: { pass: q.mandateCheck.pass, approvalsNeeded: q.mandateCheck.approvalsNeeded, rules: q.mandateCheck.rules.map((r: any) => r.message) },
  unconfirmedStock: q.unconfirmedStock,
  lines: q.lines.map((l: any) => ({ productId: l.productId, name: l.productName, quantity: l.quantity, salesUnit: l.salesUnit, unitPrice: l.unitPrice, lineTotal: l.lineTotal, outcome: l.outcome, rules: l.rules.map((r: any) => r.message) })),
});

type ToolResult = { output: unknown; summary: string; tone: CallStep["tone"]; status?: number };

async function runTool(name: string, args: any): Promise<ToolResult> {
  if (name === "search_products") {
    const qs = new URLSearchParams();
    if (args.q) qs.set("q", args.q);
    if (args.category) qs.set("category", args.category);
    if (args.claims?.length) qs.set("claims", args.claims.join(","));
    if (args.excludeAllergens?.length) qs.set("excludeAllergens", args.excludeAllergens.join(","));
    qs.set("limit", String(Math.min(args.limit ?? 50, 50)));
    const r = await gateway("GET", `/products?${qs}`);
    if (!r.ok) return { output: r.data, summary: `Search refused: ${r.data.message}`, tone: "err", status: r.status };
    const ps = r.data.products ?? [];
    return { output: { products: ps.map(slimProduct) }, summary: `Searched catalogue: ${ps.length} product${ps.length === 1 ? "" : "s"}`, tone: "ok", status: r.status };
  }
  if (name === "check_price_and_stock") {
    const ids = (args.productIds ?? []).slice(0, 30);
    const r = await gateway("POST", "/lookup", { productIds: ids, requestedDate: args.requestedDate });
    if (!r.ok) return { output: r.data, summary: `Lookup failed: ${r.data.message}`, tone: "err", status: r.status };
    const lines = r.data.lines ?? [];
    const unknown = lines.filter((l: any) => l.stock.kind === "unknown").length;
    return { output: { lines: lines.map(slimLine) }, summary: `Checked price and stock for ${lines.length}${unknown ? ` · ${unknown} stock not confirmed` : ""}`, tone: "ok", status: r.status };
  }
  if (name === "read_hotel_rules") {
    const r = await gateway("GET", "/mandate");
    if (!r.ok) return { output: r.data, summary: "Couldn't read the rules", tone: "err", status: r.status };
    const m = r.data;
    return { output: { spendCapEur: m.spendCapEur, sites: m.sites, deliveryDays: m.deliveryDays, blockedProducts: m.blockedProducts }, summary: `Read the hotel's rules: ${eur(m.spendCapEur)} per order`, tone: "ok", status: r.status };
  }
  if (name === "create_quote") {
    const lines = (args.lines ?? []).map((l: any) => {
      const claims = [l.lactoseFree ? "FREE_FROM_LACTOSE" : null, l.glutenFree ? "FREE_FROM_GLUTEN" : null].filter(Boolean);
      const requires = claims.length || l.avoidAllergens?.length ? { claims, avoidAllergens: l.avoidAllergens ?? [], labels: [] } : undefined;
      return { productId: l.productId, quantity: l.quantity, outletId: l.outletId, ...(requires ? { requires } : {}) };
    });
    const r = await gateway("POST", "/quotes", { siteId: "site-aurora", deliveryDate: args.deliveryDate, lines });
    if (!r.ok) return { output: r.data, summary: `Quote refused: ${r.data.message}`, tone: "err", status: r.status };
    const q = r.data;
    const first = q.lines[0];
    const what = q.lines.length === 1 ? `${shortName(first.productName)} × ${first.quantity}` : `${q.lines.length} lines`;
    const flag = q.outcome === "block" ? " · blocked" : !q.mandateCheck.pass ? " · needs approval" : q.unconfirmedStock.length ? " · stock not confirmed" : "";
    lastQuoteId = q.id;
    return { output: slimQuote(q), summary: `Quote: ${what}, ${eur(q.totalExVat)}${flag}`, tone: q.outcome === "block" ? "err" : flag ? "warn" : "ok", status: r.status };
  }
  if (name === "place_order") {
    const body = { quoteId: args.quoteId, approvalId: args.approvalId ?? undefined, continueWithUnconfirmedStock: args.continueWithUnconfirmedStock ?? [], builderConsentId: builderConsents.get(args.quoteId) };
    // One key per decision: a retry of the same order returns the same order (ORDER-PLACE idempotency).
    const key = `live-${args.quoteId}-${args.approvalId ?? "none"}`;
    const r = await gateway("POST", "/orders", body, { headers: { "Idempotency-Key": key } });
    if (!r.ok) return { output: r.data, summary: `Refused: ${r.data.message}`, tone: "err", status: r.status };
    const o = r.data;
    return { output: { orderId: o.id, state: o.state, totalExVat: o.totalExVat, deliveryDate: o.deliveryDate, signed: Boolean(o.jws) }, summary: `Order placed: ${eur(o.totalExVat)} · signed by Valio Aimo`, tone: "ok", status: r.status };
  }
  return { output: { error: `Unknown tool ${name}` }, summary: `Unknown tool ${name}`, tone: "err" };
}

// ---------- the loop ----------

function nextN() {
  return session.steps.filter((s) => s.kind === "call").length + 1;
}

function textOf(item: any): string {
  return (item.content ?? [])
    .filter((c: any) => c.type === "output_text")
    .map((c: any) => c.text)
    .join("")
    .trim();
}

async function loop(myRun: number) {
  session.status = "running";
  emit();
  try {
    for (let i = 0; i < 16; i++) {
      const res = await modelTurn({ instructions: instructions(), input, tools: TOOLS });
      if (myRun !== runId) return;
      input.push(...res.output);
      for (const m of res.output.filter((o: any) => o.type === "message")) {
        const text = textOf(m);
        if (text) session.steps.push({ kind: "say", text });
      }
      const call = res.output.find((o: any) => o.type === "function_call");
      if (!call) {
        session.status = "done";
        emit();
        return;
      }
      let args: any = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: "Arguments were not valid JSON" }) });
        continue;
      }
      if (call.name === "ask_chef") {
        const card: CardStep = {
          kind: "card",
          id: newId("card"),
          who: "chef",
          person: "Aino · Head chef",
          title: args.title,
          body: args.question,
          options: (args.options ?? []).slice(0, 3).map((o: any) => ({ id: o.id, label: o.label, ...(o.sub ? { sub: o.sub } : {}) })),
          answer: null,
        };
        session.steps.push({ kind: "call", n: nextN(), method: "ASK", path: "chef", summary: `Asked the chef: ${args.title}`, tone: "warn", ms: null });
        session.steps.push(card);
        pending = { callId: call.call_id, card, quoteId: lastQuoteId ?? undefined };
        session.status = "waiting";
        emit();
        return;
      }
      if (call.name === "request_approval") {
        const q = await gateway("GET", `/quotes/${encodeURIComponent(args.quoteId)}`);
        if (!q.ok) {
          input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(q.data) });
          continue;
        }
        const card: CardStep = {
          kind: "card",
          id: newId("card"),
          who: "approver",
          person: "Sanna · Finance manager",
          title: "Approval needed",
          body: args.reason,
          options: [
            { id: "approve", label: `Approve ${eur(q.data.totalExVat)}` },
            { id: "reject", label: "Reject" },
          ],
          answer: null,
        };
        session.steps.push({ kind: "call", n: nextN(), method: "ASK", path: "approver", summary: `Asked Sanna to approve ${eur(q.data.totalExVat)}`, tone: "warn", ms: null });
        session.steps.push(card);
        pending = { callId: call.call_id, card, quoteId: q.data.id, approvalsNeeded: q.data.mandateCheck.approvalsNeeded };
        session.status = "waiting";
        emit();
        return;
      }
      const [method, path] = PATHS[call.name] ?? ["?", call.name];
      const step: CallStep = { kind: "call", n: nextN(), method, path: `/gateway/v1${path}`, summary: "…", tone: "run", ms: null };
      session.steps.push(step);
      emit();
      const t0 = Date.now();
      const r = await runTool(call.name, args);
      if (myRun !== runId) return;
      Object.assign(step, { summary: r.summary, tone: r.tone, ms: Date.now() - t0 });
      input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(r.output) });
      emit();
    }
    session.steps.push({ kind: "say", text: "Stopped: too many steps. Nothing more was ordered." });
    session.status = "done";
  } catch (e) {
    session.status = "error";
    session.error = (e as Error).message;
  }
  emit();
}

/** The chef types a request. Starts a run, or adds to the current one. */
export function say(text: string) {
  if (session.status === "running") throw new Error("The agent is still working");
  if (session.status === "waiting") throw new Error("Answer the card first");
  const myRun = runId;
  session.steps.push({ kind: "chef", text, at: new Date().toISOString() });
  input.push({ role: "user", content: text });
  session.error = null;
  void loop(myRun);
}

/** A person taps a card. The answer goes back to the agent as the tool's result. */
export async function answer(cardId: string, optionId: string, personToken?: string) {
  if (!pending || pending.card.id !== cardId) throw new Error("That card is no longer open");
  const p = pending;
  const opt = p.card.options.find((o) => o.id === optionId);
  if (!opt) throw new Error("No such option");
  const token = personToken ?? (config.testMode ? issueToken({ kind: "person", personId: p.card.who === "chef" ? "p-aino" : "p-sanna", testSession: true }) : undefined);
  const identity = resolveToken(token);
  if (identity?.kind !== "person" || identity.person.role !== (p.card.who === "chef" ? "chef" : "approver"))
    throw new Error("An authenticated person with the card role is required");
  const by = identity.person.name;

  let output: unknown = { choice: optionId, label: opt.label, decidedBy: by };
  if (p.card.who === "chef" && optionId === "continue" && p.quoteId) {
    const q = await gateway("GET", `/quotes/${encodeURIComponent(p.quoteId)}`);
    const r = await gateway("POST", "/builder-consents", { quoteId: q.data.id, fingerprint: q.data.fingerprint, productIds: q.data.unconfirmedStock }, { token });
    if (!r.ok) throw new Error(r.data.message);
    builderConsents.set(p.quoteId, r.data.id);
    output = { choice: optionId, label: opt.label, builderConsentId: r.data.id };
  }
  if (p.card.who === "approver") {
    if (optionId === "approve") {
      // The approval uses the authenticated person credential (AP-07).
      const q = await gateway("GET", `/quotes/${encodeURIComponent(p.quoteId!)}`);
      const r = await gateway("POST", "/approvals", { quoteId: p.quoteId, fingerprint: q.data.fingerprint, grants: p.approvalsNeeded }, { token });
      output = r.ok ? { approved: true, approvalId: r.data.id, approvedBy: by } : { approved: false, error: r.data };
      session.steps.push({ kind: "call", n: nextN(), method: "POST", path: "/gateway/v1/approvals", summary: r.ok ? "Sanna approved · signed" : `Approval failed: ${r.data.message}`, tone: r.ok ? "ok" : "err", ms: null });
    } else {
      output = { approved: false, rejectedBy: by };
    }
  }
  if (pending !== p) throw new Error("That card was already answered");
  pending = null;
  p.card.answer = { optionId, label: opt.label, by };
  input.push({ type: "function_call_output", call_id: p.callId, output: JSON.stringify(output) });
  void loop(runId);
}
