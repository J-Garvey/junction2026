import type { WhatsAppLine, WhatsAppReply, WhatsAppReplyFacts } from "@aimo/contracts";
import { DEFAULT_APP_URL, whatsAppLink } from "./links.js";

const MAX_LENGTH = 4_000;
const MAX_ITEMS = 8;
const MAX_CHOICES = 12;
const NOTE: Partial<Record<WhatsAppReplyFacts["status"], string>> = {
  proposal: "Not ordered yet.",
  updated: "Saved to your basket · not ordered yet.",
  approval_required: "Waiting for manager approval · not ordered.",
  ordered: "Demo receipt · no real purchase.",
  blocked: "Nothing ordered by this request.",
};

/** Untrusted product/name text cannot create WhatsApp markup or extra paragraphs. */
function plain(value: string, identifier = false): string {
  return value.replace(/<\/?[a-z][^<>]*>/giu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/</gu, "＜").replace(/>/gu, "＞").replace(/~/gu, "∼")
    .replace(identifier ? /`/gu : /[*_`|]/gu, "")
    .replace(/\s+/gu, " ").trim();
}
function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = limit - 1;
  if (/[\uD800-\uDBFF]/u.test(value[end - 1])) end--;
  return `${value.slice(0, end).trimEnd()}…`;
}
function date(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
  }
  return clip(plain(value), 48);
}
const money = (value: number | null) => value !== null && Number.isFinite(value) ? `€${value.toFixed(2)}` : "Price not confirmed";
const command = (value: string) => value.length <= 120 && /^[\p{L}\p{N} _'’-]+$/u.test(value) ? value : null;

/** Presentation only: one question/action, with facts and links relevant to it. */
export function formatWhatsAppReply(facts: WhatsAppReplyFacts, _channel: "web" | "simulator" = "simulator", appUrl = DEFAULT_APP_URL): WhatsAppReply {
  const choices = facts.status === "clarification" ? facts.orderChoices ?? [] : [];
  const choosingOrder = choices.length > 0;
  const actions = (facts.actions ?? []).slice(0, choosingOrder ? MAX_CHOICES : 3).map((a) => ({ ...a }));
  const clean = (value: string, max = 240) => clip(plain(value), max);
  const question = choosingOrder && /which order (?:do you mean|would you like)/i.test(facts.headline) ? "Which order do you mean?" : facts.headline;
  const heading = facts.status === "summary" && facts.headline === "Your current order basket" ? "Order summary" : question;
  const lines = facts.lines ?? [];
  const warnings = [...new Set((facts.warnings ?? []).map((w) => plain(w)).filter(Boolean))];
  const receipts = facts.status === "ordered" ? facts.orderIds ?? [] : [];
  let itemCount = Math.min(lines.length, MAX_ITEMS);
  let warningCount = Math.min(warnings.length, 4);
  let choiceCount = Math.min(choices.length, MAX_CHOICES);
  let receiptCount = Math.min(receipts.length, 3);
  let actionCount = actions.length;
  const order = facts.order;
  const itemText = (line: WhatsAppLine) => {
    const quantity = Number.isFinite(line.quantity) ? `${line.quantity} ${clean(line.unit ?? "units (unit unconfirmed)", 36)}` : "Quantity not confirmed";
    const unknownStock = facts.change !== "remove" && line.stock !== "confirmed";
    return [`*${quantity}* ${clean(line.name, 140)}`, `_${money(line.lineTotal)}${line.lineTotal !== null && Number.isFinite(line.lineTotal) ? " ex VAT" : ""}${unknownStock ? " · stock unconfirmed" : ""}_`].join("\n");
  };
  const render = () => {
    const sections: string[] = [`*${clean(heading)}*`];
    let chatAsk = "";
    if (facts.detail) sections.push(clean(facts.detail, 500));
    let appLink = facts.appLink ?? (order && facts.status !== "clarification" ? {
      label: facts.status === "ordered" ? "View receipt" : "View this order",
      path: facts.status === "ordered" ? `/orders?eventId=${encodeURIComponent(order.id)}` : `/baskets/${encodeURIComponent(order.id)}`,
    } : undefined);

    if (choosingOrder) {
      const sameNames = new Set(choices.filter((o, i) => choices.some((other, j) => i !== j && other.name.toLowerCase() === o.name.toLowerCase())).map((o) => o.name.toLowerCase()));
      sections.push(choices.slice(0, choiceCount).map((choice) => [
        `• *${clean(choice.name, 120)}*`,
        `  _${date(choice.deliveryDate)}_`,
        sameNames.has(choice.name.toLowerCase()) ? `  Reply with: \`${clip(plain(choice.id, true), 128)}\`` : "",
      ].filter(Boolean).join("\n")).join("\n\n"));
      const omitted = choices.length - choiceCount;
      if (omitted) sections.push(`_${omitted} more orders are available._`);
      sections.push(sameNames.size ? "Reply with the *order name*, or its *ID* if the name is shared." : "Reply with the *order name*.");
      if (omitted || choices.some((o) => plain(o.name).length > 120)) appLink ??= { label: "See all orders", path: "/" };
    } else {
      if (order) sections.push(`*${clean(order.name, 120)}*\n_Delivery ${date(order.deliveryDate)}_`);
      if (lines.length) {
        const displayed = lines.slice(0, itemCount).map(itemText);
        if (lines.length > itemCount) displayed.push(`_${lines.length - itemCount} more items._`);
        sections.push(displayed.join("\n\n"));
        const hiddenUnknown = facts.change === "remove" ? 0 : lines.slice(itemCount).filter((l) => l.stock !== "confirmed").length;
        if (hiddenUnknown) sections.push(`_Stock is also unconfirmed for ${hiddenUnknown} more item${hiddenUnknown === 1 ? "" : "s"}._`);
      }
      // A question without a quote has no total. An explicit null total remains unknown.
      if (facts.status !== "clarification" && facts.totalExVat !== undefined) {
        const label = facts.change === "add" && facts.status === "proposal" ? "Addition total" : "Order total";
        sections.push(`*${label}: ${money(facts.totalExVat)}*${facts.totalExVat !== null && Number.isFinite(facts.totalExVat) ? "\n_ex VAT_" : ""}`);
      }
      if (NOTE[facts.status]) sections.push(`_${NOTE[facts.status]}_`);
      if (receipts.length) {
        sections.push(receipts.slice(0, receiptCount).map((id) => `Reference: \`${clip(plain(id, true), 128)}\``).join("\n\n"));
        if (receipts.length > receiptCount) sections.push(`_${receipts.length - receiptCount} more receipt references._`);
      }
      const chatActions = actions.slice(0, actionCount).map((a) => ({ ...a, command: command(a.text) })).filter((a) => a.command);
      if (chatActions.length === 1) chatAsk = `Reply *${chatActions[0].command}*.`;
      else if (chatActions.length === 2) chatAsk = `Reply *${chatActions[0].command}* or *${chatActions[1].command}*.`;
      else if (chatActions.length) chatAsk = chatActions.map((a) => `${clean(a.label, 60)}: reply *${a.command}*`).join("\n\n");
    }
    if (warnings.length) {
      const displayed = warnings.slice(0, warningCount).map((warning) => `• ${clip(warning, 220)}`);
      if (warnings.length > warningCount) displayed.push(`_${warnings.length - warningCount} more warnings._`);
      sections.push(`*Please note*\n\n${displayed.join("\n\n")}`);
    }
    if (chatAsk) sections.push(chatAsk);
    if (appLink) {
      const url = whatsAppLink(appLink.path, appUrl);
      if (url) sections.push(`*${clean(appLink.label, 60)}*\n${url}`);
    }
    return sections.filter(Boolean).join("\n\n");
  };
  // Remove complete entries to preserve markup, safety notes, the ask and full URLs.
  let text = render();
  while (text.length > MAX_LENGTH && itemCount) { itemCount--; text = render(); }
  while (text.length > MAX_LENGTH && warningCount) { warningCount--; text = render(); }
  while (text.length > MAX_LENGTH && choiceCount > 1) { choiceCount--; text = render(); }
  while (text.length > MAX_LENGTH && receiptCount) { receiptCount--; text = render(); }
  while (text.length > MAX_LENGTH && actionCount) { actionCount--; text = render(); }
  return { text, status: facts.status, actions };
}
