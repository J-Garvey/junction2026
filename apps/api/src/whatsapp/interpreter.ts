/**
 * Synthetic channel input edge. The parser can read products; only these rules
 * select an order or a command. No order, proposal or conversation is mutated.
 */
import type { WhatsAppInterpretContext, WhatsAppInterpretation, WhatsAppLine, WhatsAppOrderRef } from "@aimo/contracts";
import { parseRequest, resolveDate } from "../agent/parse.js";
import { ALLERGEN_NAMES } from "../rules/checks.js";

type Span = { start: number; end: number; reference: string };
type Resolution = { order: WhatsAppOrderRef | null; body: string; explicit: boolean; question: string | null; choices: WhatsAppOrderRef[] };

const normal = (text: string) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phrase = (haystack: string, needle: string) => (` ${haystack} `).includes(` ${needle} `);
const uniqueOrders = (orders: WhatsAppOrderRef[]) => [...new Map(orders.map((order) => [order.id, order])).values()];
const result = (intent: WhatsAppInterpretation["intent"], fields: Partial<WhatsAppInterpretation> = {}): WhatsAppInterpretation => ({
  intent, orderId: null, request: null, lineIds: [], question: null, choices: [], ...fields,
});
const ask = (question: string, fields: Partial<WhatsAppInterpretation> = {}) => result("clarify", { question, ...fields });

const ACTION = /\b(?:add|include|put|need|want|buy|remove|delete|drop|confirm|place|submit|show|view|summary|summari[sz]e|select|switch|open|use)\b/i;
const ADD = /\b(?:add|include|put|need|want|buy)\b/i;
const REMOVE = /\b(?:remove|delete|drop)\b/i;
const CONFIRM = /\b(?:confirm|place|submit|checkout)\b/i;
const SUMMARY = /\b(?:summary|summari[sz]e|show|view|status|details)\b|^what(?:'s| is| are)?\b/i;
const DATE = /\b(?:20\d{2}-\d{2}-\d{2}|today|tomorrow|(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?|\d{1,2}\s*(?:\.|st|nd|rd|th)?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)\b/gi;

function referenceMatches(reference: string, context: WhatsAppInterpretContext): WhatsAppOrderRef[] {
  let query = reference.trim().replace(/^[#\s"']+|[\s"'.!?]+$/g, "");
  query = query.replace(/^(?:(?:the|my|our|order|basket|id|number|named|called|for|on|of|dated|delivery)\s+)+/i, "")
    .replace(/\s+(?:order|basket)$/i, "");
  if (/^(?:this|that|it|current|active|my|our)(?:\s+(?:order|basket))?$/i.test(query)) {
    return context.orders.filter((order) => order.id === context.activeOrderId);
  }
  const direct = context.orders.filter((order) => order.id.toLowerCase() === query.toLowerCase());
  if (direct.length) return direct;
  const dates = [...query.matchAll(DATE)];
  const wantedDates = dates.map(([text]) => resolveDate(text).date);
  for (const [text] of dates) query = query.replace(text, " ");
  query = query.replace(/\b(?:on|for|dated|delivery)\b/gi, " ").replace(/\s+/g, " ").trim();
  let candidates = context.orders.filter((order) => wantedDates.every((date) => date === order.deliveryDate));
  if (!query) return dates.length ? candidates : [];
  const byId = candidates.filter((order) => order.id.toLowerCase() === query.toLowerCase());
  if (byId.length) return byId;
  query = normal(query);
  const exact = candidates.filter((order) => normal(order.name) === query);
  return exact.length ? exact : candidates.filter((order) => phrase(normal(order.name), query));
}

/** Extract scoped references before parsing products, including unknown references. */
function resolveOrder(text: string, context: WhatsAppInterpretContext): Resolution {
  const spans: Span[] = [];
  const masked = () => {
    const chars = text.split("");
    for (const span of spans) for (let i = span.start; i < span.end; i++) chars[i] = " ";
    return chars.join("");
  };
  const addSpan = (start: number, end: number, reference: string) => spans.push({ start, end, reference: reference.trim() });
  // A labelled unknown order must never fall back to the active order.
  for (const match of text.matchAll(/\b(?:order|basket)\b(?![-_])(?:\s+(?:id|number|named|called))?\s*[:#]?\s*/gi)) {
    const labelStart = match.index!;
    const scope = text.slice(0, labelStart).match(/\b(?:(?:to|for|from|into|in|on|of)\s+)?(?:the|my|our|this|that|current|active)\s+$|\b(?:to|for|from|into|in|on|of)\s+$/i);
    const start = scope ? scope.index! : labelStart;
    const after = labelStart + match[0].length;
    const tail = text.slice(after);
    const stop = tail.search(/[,;]|\b(?:and\s+)?(?:add|include|put|need|want|buy|remove|delete|drop|confirm|place|submit|show|view|summary|select|switch)\b/i);
    const end = stop < 0 ? text.length : after + stop;
    const reference = text.slice(after, end).replace(/\b(?:please|now)\b[.!?\s]*$/i, "").replace(/\s+and\s*$/i, "").trim();
    addSpan(start, end, /^(?:please|now|it|this|that)?[.!?\s]*$/i.test(reference) ? "" : reference);
  }
  // Product identifiers are not order identifiers, even if a numeric ID collides.
  for (const order of context.orders) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_-])${escape(order.id)}(?![\\p{L}\\p{N}_-])`, "giu");
    for (const match of masked().matchAll(re)) {
      const start = match.index!;
      const prefix = text.slice(0, start);
      if (/\b(?:sku|product|item)\s*#?\s*$/i.test(prefix)) continue;
      if (/^\d+$/.test(order.id) && (ADD.test(text) || REMOVE.test(text))) continue;
      addSpan(start, start + match[0].length, order.id);
    }
  }
  // Scope after a preposition is an order name, phrase, date, or unknown reference.
  // "free from milk" is a dietary restriction, not an order reference.
  const connector = /\b(?:to|for|from|into|in|on|of)\s+(?:the\s+)?/gi;
  for (const match of masked().matchAll(connector)) {
    const start = match.index!;
    if (/\bfree\s*$/i.test(text.slice(0, start))) continue;
    const after = start + match[0].length;
    const tail = masked().slice(after);
    const stop = tail.search(/[,;]|\b(?:and\s+)?(?:add|include|put|need|want|buy|remove|delete|drop|confirm|place|submit|show|view|summary|select|switch)\b/i);
    const end = stop < 0 ? text.length : after + stop;
    const reference = masked().slice(after, end).replace(/\bplease\b[.!?\s]*$/i, "").trim();
    // "10 l of milk" and "put milk in" are product grammar.
    if (/^of\b/i.test(match[0]) && ADD.test(text)) continue;
    if (/^(?:from|in)\b/i.test(match[0]) && ADD.test(text) && reference) {
      // "salmon from Finland" and "salmon in sauce" describe the product.
      // A basket called Finland/Sauce must not capture and erase those words.
      const matches = referenceMatches(reference, context);
      if (matches.length) return {
        order: null, body: text, explicit: true, choices: uniqueOrders(matches),
        question: "Is that part of the product description or an order reference? Please identify the target with 'to order' and keep the complete product description.",
      };
      continue;
    }
    if (reference) addSpan(start, end, reference);
  }
  for (const match of masked().matchAll(DATE)) addSpan(match.index!, match.index! + match[0].length, match[0]);
  // Recognisable unknown IDs remain explicit even without the word "order".
  for (const match of masked().matchAll(/\b(?:evt|ord|order|basket)[_-][\w-]+\b/gi)) addSpan(match.index!, match.index! + match[0].length, match[0]);

  let body = masked();
  const action = body.match(ACTION);
  if (action?.index) {
    const prefix = body.slice(0, action.index).replace(/\b(?:please|can|could|would|you|i|we|like|to|what|is|the|in)\b/gi, "").replace(/[:\s,.!?]+/g, " ").trim();
    if (prefix) addSpan(0, action.index, prefix);
  }
  body = masked().replace(/\s+/g, " ").trim();
  const quantityFirst = /^\d[\d,.\s]*[\p{L}]/u.test(body) && !SUMMARY.test(body);
  if (!ADD.test(body) && !REMOVE.test(body) && !quantityFirst) {
    const remainder = body
      .replace(/^(?:(?:please|can you|could you)\s+)?(?:show(?:\s+me)?|view|summari[sz]e|select|switch(?:\s+to)?|open|use|confirm|place|submit|summary|status|details|what(?:'s| is| are)?(?:\s+(?:in|on))?)\s*/i, "")
      .replace(/^(?:me\s+)?(?:(?:the|my|current|active)\s+)?(?:summary|status|details)\b\s*/i, "")
      .replace(/^(?:of|for|on|in|to)\s+/i, "").replace(/\b(?:please|now)\b[.!?\s]*$/i, "").trim();
    if (remainder && !/^(?:(?:yes|ok|okay|confirm|accept|apply|approve|cancel|discard|change|changes|addition|removal|pending|proposal|never|mind|nevermind|that|it|this|the|my|order|basket|checkout|no)\b[\s,.!?]*)+$/i.test(remainder)) {
      const start = text.indexOf(remainder);
      if (start >= 0) addSpan(start, start + remainder.length, remainder);
    }
  }
  body = masked().replace(/\b(?:to|for|from|into|in|on|of)\s*$/i, "").replace(/\s+/g, " ").trim();
  const references = spans.map((span) => span.reference).filter(Boolean);
  if (references.length) {
    const matches = references.map((reference) => referenceMatches(reference, context));
    const candidates = context.orders.filter((order) => matches.every((set) => set.some((candidate) => candidate.id === order.id)));
    if (candidates.length === 1) return { order: candidates[0], body, explicit: true, question: null, choices: [] };
    const choices = candidates.length ? candidates : uniqueOrders(matches.flat());
    const available = choices.length ? choices : context.orders;
    return {
      order: null, body, explicit: true, choices: available,
      question: matches.some((set) => !set.length) ? "I couldn't identify that order. Which order do you mean?" : "Which order do you mean?",
    };
  }
  const order = context.orders.find((candidate) => candidate.id === context.activeOrderId)
    ?? (!context.activeOrderId && context.orders.length === 1 ? context.orders[0] : null);
  return {
    order, body, explicit: false, choices: order ? [] : context.orders,
    question: order ? null : context.orders.length ? "Which order do you mean?" : "There are no orders to select.",
  };
}

function command(text: string): string {
  return text.toLowerCase().replace(/^[\s,.!?]+|[\s,.!?]+$/g, "").replace(/^(?:yes[,\s]+)?(?:please\s+)?/, "").replace(/\s+please$/, "").replace(/\s+/g, " ");
}

function allergenRequirements(text: string): string[] {
  const codes: string[] = [];
  const names = { ...ALLERGEN_NAMES, dairy: "dairy", soy: "soy", soya: "soya" };
  for (const [code, name] of Object.entries(names)) {
    // A lactose-free claim is handled by parseRequest; it is not a milk allergy.
    if (code === "ML") continue;
    const word = escape(name.replace(/s$/, "")) + "s?";
    if (new RegExp(`\\b(?:(?:no|without|avoid|free (?:from|of)|allerg(?:ic|y) to)\\s+(?:any\\s+)?${word}|${word}[- ]free|${word} allerg(?:y|ies))\\b`, "i").test(text)) {
      codes.push(code === "dairy" ? "AM" : code === "soy" || code === "soya" ? "AY" : code);
    }
  }
  if (/\b(?:nut[- ]free|(?:no|without) (?:any )?nuts|nut allergy)\b/i.test(text)) codes.push("AN", "AP");
  return [...new Set(codes)];
}

/** "2", "#2", "line 2" select the numbered line from the last summary. null = out of range. */
function lineNumber(raw: string, context: WhatsAppInterpretContext): WhatsAppLine | null | undefined {
  const match = normal(raw).match(/^(?:(?:line|item|number|no)\s+)?(\d{1,3})$/);
  if (!match) return undefined;
  return context.lines[Number(match[1]) - 1] ?? null;
}

/** One line by number, line ID, product ID or a unique product name. */
function pickLine(raw: string, context: WhatsAppInterpretContext): { line: WhatsAppLine } | { question: string } {
  const numbered = lineNumber(raw, context);
  if (numbered === null) return { question: `There is no line ${normal(raw)}. Say 'summary' to see the numbered lines.` };
  if (numbered) return { line: numbered };
  const ref = normal(raw).replace(/^(?:(?:the|product|sku|item|line)\s+)+/, "").trim();
  let matches = context.lines.filter((line) => normal(line.id) === ref || (line.productId !== null && normal(line.productId) === ref));
  if (!matches.length && ref) matches = context.lines.filter((line) => phrase(normal(line.name), ref));
  if (matches.length === 1) return { line: matches[0] };
  if (!matches.length) return { question: `Which line do you mean by "${raw}"? Say 'summary' to see the numbered lines.` };
  return { question: `Which line do you mean? ${matches.map((line) => `${context.lines.indexOf(line) + 1}. ${line.name}`).join("; ")}. Reply with the line number.` };
}

const activeOrder = (context: WhatsAppInterpretContext) => context.orders.find((order) => order.id === context.activeOrderId)
  ?? (!context.activeOrderId && context.orders.length === 1 ? context.orders[0] : null);

const HELP = /^(?:help|menu|commands|options|\?|what can (?:you|i) do|how does (?:this|it) work)$/;
const CHANGE = /^(?:change|set|make|update|adjust|edit)\s+(?:the\s+)?(?:(?:quantity|qty|amount)\s+(?:of|for)\s+)?(.+?)\s+(?:to|=)\s+(\d+(?:[.,]\d+)?)\s*(\p{L}*)$/u;
const APPROVE = /^(?:approve|sign off)(?:\s+(?:the|this|my))?(?:\s+(?:order|basket|review|it))?$/;
const REFUSE = /^(?:refuse|reject|decline|return)(?:\s+(?:the|this|my))?(?:\s+(?:order|basket|review|it))?(?:(?:\s*[:,\-–—]\s*|\s+(?:because|as|with note|note)\s+)([\s\S]*))?$/i;
const NEW_ORDER = /^(?:please\s+)?(?:new|create|start)\s+(?:a\s+)?(?:new\s+)?(?:order|basket)\b\s*(?:(?:called|named|for)\s+|:\s*)?([\s\S]*)$/i;

/** Commands on the active order that must not be read as order references or products. */
function directCommand(text: string, context: WhatsAppInterpretContext): WhatsAppInterpretation | null {
  const cmd = command(text);
  if (HELP.test(cmd)) return result("help", { orderId: activeOrder(context)?.id ?? null });
  const created = text.replace(/[.!]+$/, "").match(NEW_ORDER);
  if (created) {
    const rest = created[1].trim();
    const last = [...rest.matchAll(DATE)].at(-1);
    const deliveryDate = last ? resolveDate(last[0]).date : null;
    const name = (last ? rest.slice(0, last.index) + rest.slice(last.index! + last[0].length) : rest)
      .replace(/\b(?:on|for|delivery|delivered|by|dated)\s*$/i, "").replace(/^["'\s]+|["'\s,]+$/g, "").trim();
    if (!name || !deliveryDate) return ask("What should the order be called, and when is delivery? For example: 'new order Emma's wedding on 17 Nov'.");
    if (name.length > 120) return ask("Please use an order name of at most 120 characters.");
    return result("new_order", { newOrder: { name, deliveryDate } });
  }
  const change = cmd.match(CHANGE);
  if (change) {
    const order = activeOrder(context);
    if (!order) return ask("Which order should I change?", { choices: context.orders });
    // context.lines belongs only to the active order; the service hydrates and re-runs.
    if (order.id !== context.activeOrderId) return result("change_quantity", { orderId: order.id });
    const amount = Number(change[2].replace(",", "."));
    if (!Number.isInteger(amount)) return ask("Quantities are whole packs. How many should I order?", { orderId: order.id });
    const picked = pickLine(change[1], context);
    if ("question" in picked) return ask(picked.question, { orderId: order.id });
    const { line } = picked;
    const unit = change[3] ? normal(change[3]) : "";
    if (unit && line.unit && unit !== normal(line.unit) && !/^(?:x|pcs?|packs?|units?)$/.test(unit)) {
      return ask(`${line.name} is ordered in ${line.unit}. How many ${line.unit} should I order? For example: 'change ${context.lines.indexOf(line) + 1} to 10'.`, { orderId: order.id });
    }
    if (amount === line.quantity) return ask(`${line.name} is already ${amount}${line.unit ? ` ${line.unit}` : ""}.`, { orderId: order.id });
    if (amount === 0) return result("remove_items", { orderId: order.id, lineIds: [line.id] });
    return result("change_quantity", { orderId: order.id, lineIds: [line.id], quantity: amount });
  }
  if (APPROVE.test(cmd)) {
    const order = activeOrder(context);
    return order ? result("approve", { orderId: order.id }) : ask("Which order would you like to approve?", { choices: context.orders });
  }
  const refused = text.replace(/[.!]+$/, "").match(REFUSE);
  if (refused) {
    const order = activeOrder(context);
    if (!order) return ask("Which order would you like to refuse?", { choices: context.orders });
    return result("refuse", { orderId: order.id, note: refused[1]?.trim() || undefined });
  }
  return null;
}

function removeItems(body: string, orderId: string, context: WhatsAppInterpretContext): WhatsAppInterpretation {
  const target = body.replace(/^(?:(?:please|can you|could you)\s+)?(?:remove|delete|drop)\s*/i, "").trim();
  if (!target) return ask("Which products should I remove?", { orderId });
  // context.lines belongs ONLY to activeOrderId. The service must hydrate the
  // resolved order and re-run this same message before using any line IDs.
  if (orderId !== context.activeOrderId) return result("remove_items", { orderId });
  const selected = new Set<string>();
  for (const raw of target.split(/\s*(?:,|\band\b|&)\s*/i)) {
    const numbered = lineNumber(raw, context);
    if (numbered === null) return ask(`There is no line ${normal(raw)}. Say 'summary' to see the numbered lines.`, { orderId });
    if (numbered) { selected.add(numbered.id); continue; }
    const all = /\ball\b/i.test(raw);
    const ref = normal(raw).replace(/^(?:(?:all|the|of|product|sku|item|line)\s+)+/, "").trim();
    const byLine = context.lines.filter((line) => normal(line.id) === ref);
    const byProduct = context.lines.filter((line) => line.productId && normal(line.productId) === ref);
    const universal = /^(?:all|everything|all items|all products|all lines)$/.test(normal(raw));
    let matches = byLine.length ? byLine : byProduct;
    if (!matches.length && universal) matches = context.lines;
    if (!matches.length && ref && !/\b\d+\b/.test(ref)) matches = context.lines.filter((line) => phrase(normal(line.name), ref));
    if (!matches.length) return ask(`Which product do you mean by "${raw}"? Please use its product ID or full name.`, { orderId });
    const identities = new Set(matches.map((line) => line.productId ?? normal(line.name)));
    if (!all && !universal && !byLine.length && !byProduct.length && identities.size > 1) {
      return ask(`Which product should I remove? ${matches.map((line) => `${line.name}${line.productId ? ` (${line.productId})` : ""}`).join("; ")}.`, { orderId });
    }
    for (const line of matches) selected.add(line.id);
  }
  return result("remove_items", { orderId, lineIds: [...selected] });
}

/** Interpret text without persisting it. Only the parent service performs mutations. */
export async function interpretWhatsApp(text: string, context: WhatsAppInterpretContext): Promise<WhatsAppInterpretation> {
  text = text.normalize("NFKC").replace(/[’‘]/g, "'").trim();
  if (!text) return ask("Which order would you like to view or change?");
  if (/\b(?:all|both|every|each|multiple|several|two)\s+(?:the\s+)?(?:orders|baskets)\b/i.test(text)) {
    return ask("I can work on one order at a time. Please identify one order by its name or ID.", { choices: context.orders });
  }
  // Negated commands and compound instructions cannot authorize a change.
  if (/\b(?:do\s+not|don't|dont|never|not|cannot|can't)\s+(?:(?:please|ever|yet)\s+)*(?:add|include|put|remove|delete|drop|confirm|place|submit|accept|apply|approve)\b/i.test(text)) {
    return ask("Please send one positive instruction: view an order, add items, remove items, or confirm the order.");
  }
  // These need more than the supported add/whole-line-remove operation. Do not
  // let the product parser reduce a choice, replacement or condition to an add.
  if ((ADD.test(text) || REMOVE.test(text) || CONFIRM.test(text))
    && /\b(?:instead\s+of|rather\s+than|replace|replacement|swap|if|unless|otherwise|or)\b/i.test(text)) {
    return ask("Please send one unconditional change for one order. For a replacement, remove the original line and add the replacement separately.");
  }
  const pendingCommand = command(text);
  const accepting = /^(?:confirm|accept|apply|approve)\s+(?:the\s+)?(?:change|changes|addition|removal|amendment|approval|refusal)$/.test(pendingCommand);
  const cancelling = /^(?:cancel|discard)(?:\s+(?:the\s+)?(?:pending\s+)?(?:change|changes|proposal|that|it))?$|^(?:never\s?mind|forget (?:that|it))$/.test(pendingCommand);
  if (accepting || cancelling) {
    const pending = context.pending;
    if (!pending || (accepting && pending.kind === "confirm_order")) return ask("There is no pending item change to confirm or cancel. Say 'confirm order' to place an order.");
    if (!context.orders.some((order) => order.id === pending.orderId)) return ask("The pending change's order is no longer available. Please select an order.", { choices: context.orders });
    return result(accepting ? "accept_change" : "cancel", { orderId: pending.orderId });
  }
  const direct = directCommand(text, context);
  if (direct) return direct;
  const resolution = resolveOrder(text, context);
  const body = command(resolution.body);
  const add = ADD.test(body);
  const remove = REMOVE.test(body);
  const confirm = CONFIRM.test(body);
  if (Number(add) + Number(remove) + Number(confirm) > 1 || (confirm && /\b(?:and|then|also|after)\b|[;\n]/i.test(body))) {
    return ask("Please send add, remove, and confirm instructions separately. What would you like to do first?");
  }
  if (resolution.question || !resolution.order) return ask(resolution.question ?? "Which order do you mean?", { choices: resolution.choices });
  const orderId = resolution.order.id;
  if (confirm) {
    if (/^(?:confirm|place|submit)(?:\s+(?:the|my|this|that|current|active))?(?:\s+(?:order|basket))?(?:\s+now)?$|^checkout$/.test(body)
      && (resolution.explicit || /\b(?:order|basket|checkout)\b/i.test(text))) {
      return result("confirm_order", { orderId });
    }
    return ask("To place this order, say 'confirm order'. To accept a pending item change, say 'confirm change'.", { orderId });
  }
  if (remove) return removeItems(body, orderId, context);
  const implicitItems = /\d/.test(body) && !SUMMARY.test(body);
  if (add || implicitItems) {
    const productText = resolution.body.replace(/^(?:(?:please|can you|could you)\s+)?(?:(?:i|we)\s+)?(?:add|include|put|need|want|buy)\s*/i, "")
      .replace(/\s+please[.!?\s]*$/i, "").replace(/\s*&\s*|\n+/g, "; ").trim();
    if (!productText) return ask("Which products and quantities should I add?", { orderId });
    let request: WhatsAppInterpretation["request"];
    try { ({ request } = await parseRequest(productText)); }
    catch { return ask("I couldn't read those items. Please give each product and quantity, for example 'add 10 l lactose-free milk'.", { orderId }); }
    request.neededBy = resolution.order.deliveryDate;
    request.neededByText = resolution.order.deliveryDate;
    if (!request.lines.length) return ask("Which products and quantities should I add?", { orderId, request });
    // The fallback parser can drop a fragment containing only a restriction,
    // or read just one number in "2 x 500 ml". Neither may silently change the request.
    const fragments = productText.replace(/(\d)[,\s](\d{3})(?!\d)/g, "$1$2").split(/\s*(?:,(?!\d)|\band\b|\+|;)\s*/i).filter((part) => part.trim());
    if (fragments.length !== request.lines.length) return ask("Please give each product with its quantity and dietary requirements together.", { orderId, request });
    const missing: string[] = [];
    for (const line of request.lines) {
      const evidence = line.text.replace(/\d+(?:[.,]\d+)?\s*%/g, "")
        .replace(/\b\d{6}\b(?!\s*(?:litres?|liters?|ltr|l|kg|kilos?|grams?|g|ml|dl|pcs|pieces?|pc)\b)/gi, "");
      if ([...evidence.replace(/(\d)[,\s](\d{3})(?!\d)/g, "$1$2").matchAll(/\d+(?:[.,]\d+)?/g)].length > 1) {
        return ask("Please specify one total quantity per product, including the unit.", { orderId, request });
      }
      if (!/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?/u.test(evidence) || !line.quantity || !(line.quantity.amount > 0) || !Number.isFinite(line.quantity.amount)) {
        line.quantity = null;
        missing.push(line.query || line.text);
      }
      line.constraints.avoidAllergens = [...new Set([...line.constraints.avoidAllergens, ...allergenRequirements(line.text)])];
      if (/\bdairy[- ]free\b/i.test(line.text)) line.constraints.claims = [...new Set([...line.constraints.claims, "FREE_FROM_MILK"])];
    }
    if (missing.length) return ask(`What quantity should I add for ${missing.join(", ")}?`, { orderId, request });
    if (/(?:^|\s)[-−]\s*\d|\b(?:halal|kosher|vegetarian)\b/i.test(productText)
      || (/\ballerg(?:y|ic|ies)\b/i.test(productText) && !request.lines.some((line) => line.constraints.avoidAllergens.length))) {
      return ask("Please specify the quantity and dietary requirements explicitly so I can preserve them safely.", { orderId, request });
    }
    return result("add_items", { orderId, request });
  }
  if (SUMMARY.test(text)) return result("summary", { orderId });
  if (resolution.explicit || /^(?:select|switch|open|use)\b/.test(body)
    || /^(?:(?:the|my|our|this|that|current|active)\s+)?(?:order|basket)[.!?]*$/i.test(text)) return result("select_order", { orderId });
  return ask(context.pending ? "Say 'confirm change' to accept the pending item change, or 'cancel change'. To place the order, say 'confirm order'." : "Would you like a summary, to add or remove items, or to confirm this order?", { orderId });
}
