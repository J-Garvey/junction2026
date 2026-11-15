import type { WhatsAppLine, WhatsAppReply, WhatsAppReplyFacts } from "@aimo/contracts";

// Keep the chat bubble concise. Routing text is never edited.
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_ITEMS = 8;
const MAX_WARNINGS = 4;
const MAX_ACTIONS = 3;
const MAX_RECEIPTS = 3;

const STATUS: Record<WhatsAppReplyFacts["status"], { heading: string; note?: string; next: string }> = {
  clarification: { heading: "More details needed", next: "reply with the missing details." },
  summary: { heading: "Basket summary", next: "review the basket in the app." },
  proposal: { heading: "Proposed basket change", note: "Proposal only · not ordered.", next: "review the proposal in the app." },
  updated: { heading: "Basket updated", note: "Staged basket · not a placed order.", next: "review the basket in the app." },
  approval_required: { heading: "Approval required", note: "Basket awaiting approval · not ordered.", next: "open the basket in the app for approval." },
  ordered: { heading: "Mock order placed", note: "Simulated receipt · no real purchase.", next: "review the mock order in the app." },
  blocked: { heading: "Request blocked", note: "No order placed by this request.", next: "review the block in the app." },
};

/** Collapse untrusted text to one line; WhatsApp markup must come from this file. */
function plain(value: string, identifier = false): string {
  return value
    .replace(/<\/?[a-z][^<>]*>/giu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/</gu, "＜")
    .replace(/>/gu, "＞")
    .replace(/~/gu, "∼")
    // Identifiers live inside generated monospace, so keep e.g. ord_123 exact.
    .replace(identifier ? /`/gu : /[*_`|]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function clip(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let end = limit - 1;
  // Do not leave half an emoji at the truncation boundary.
  if (/[\uD800-\uDBFF]/u.test(value[end - 1])) end--;
  return `${value.slice(0, end).trimEnd()}…`;
}

function money(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? `EUR ${value.toFixed(2)}` : "EUR TBC";
}

/** Pure presentation of supplied facts: no quoting, stock checks or order decisions. */
export function formatWhatsAppReply(facts: WhatsAppReplyFacts): WhatsAppReply {
  const status = STATUS[facts.status];
  let shortened = false;
  const display = (value: string, limit: number, identifier = false): string => {
    const text = plain(value, identifier);
    if (text.length > limit) shortened = true;
    return clip(text, limit);
  };
  const id = (value: string): string => `\`\`\`${display(value, 80, true) || "TBC"}\`\`\``;
  const actions = (facts.actions ?? []).slice(0, MAX_ACTIONS).map(({ label, text }) => ({ label, text }));
  const primaryLabel = actions[0] ? display(actions[0].label, 80) : "";
  const moreActions = (facts.actions?.length ?? 0) - actions.length;
  const headline = display(facts.headline, 180);
  const detail = facts.detail ? display(facts.detail, 360) : "";
  const order = facts.order;
  const orderText = order ? [
    `*${display(order.name, 100) || "Basket"}*`,
    `Basket ID: ${id(order.id)}`,
    `Delivery date: ${display(order.deliveryDate, 48) || "TBC"}`,
  ].join("\n") : "";

  const lines = facts.lines ?? [];
  const itemText = (line: WhatsAppLine): string => {
    const quantity = Number.isFinite(line.quantity) ? String(line.quantity) : "TBC";
    const unit = (line.unit && display(line.unit, 24)) || "sales unit TBC";
    const name = display(line.name, 100) || "Unnamed item";
    const stock = line.stock === "confirmed" ? "stock confirmed" : "stock unknown";
    return `• ${quantity} × ${unit} — ${name}\n  ${money(line.lineTotal)} · ${stock}`;
  };
  const items = lines.slice(0, MAX_ITEMS).map(itemText);
  const unknownStock = lines.filter((line) => line.stock !== "confirmed").length;
  const warnings = (facts.warnings ?? []).map((warning) => plain(warning)).filter(Boolean);
  const shownWarnings = warnings.slice(0, MAX_WARNINGS).map((warning) => display(warning, 180));
  // A basket ID is not a receipt. Only an ordered status may expose mock receipts.
  const receipts = facts.status === "ordered" ? (facts.orderIds ?? []) : [];
  const shownReceipts = receipts.slice(0, MAX_RECEIPTS).map(id);
  let shownItems = items.length;
  let shownWarningCount = shownWarnings.length;

  const render = (): string => {
    const omittedItems = lines.length - shownItems;
    const omittedWarnings = warnings.length - shownWarningCount;
    const omittedReceipts = receipts.length - shownReceipts.length;
    const sections = [
      ["FAKE WhatsApp · demo", `*${status.heading}*`, status.note, headline].filter(Boolean).join("\n"),
      orderText,
      detail,
    ];
    if (lines.length) {
      sections.push([
        "*Items · line totals ex VAT*",
        ...items.slice(0, shownItems),
        omittedItems ? `… ${omittedItems} more ${omittedItems === 1 ? "item" : "items"} in the full basket.` : "",
      ].filter(Boolean).join("\n"));
    }
    sections.push(`*Total (ex VAT): ${money(facts.totalExVat)}*`);
    if (unknownStock) sections.push(`Stock unknown for ${unknownStock} ${unknownStock === 1 ? "item" : "items"}; availability is unconfirmed.`);
    if (warnings.length) {
      sections.push([
        "*Warnings*",
        ...shownWarnings.slice(0, shownWarningCount).map((warning) => `• ${warning}`),
        omittedWarnings ? `… ${omittedWarnings} more ${omittedWarnings === 1 ? "warning" : "warnings"} in the app.` : "",
      ].filter(Boolean).join("\n"));
    }
    if (facts.status === "ordered") {
      sections.push([
        "*Mock receipt*",
        ...(shownReceipts.length ? shownReceipts.map((receipt) => `Mock order ID: ${receipt}`) : ["Mock order ID: not supplied."]),
        omittedReceipts ? `… ${omittedReceipts} more mock order IDs in the app.` : "",
      ].filter(Boolean).join("\n"));
    }
    if (shortened) sections.push("Text shortened; full details and warnings are in the app.");
    if (moreActions) sections.push(`${moreActions} more ${moreActions === 1 ? "action" : "actions"} in the app.`);
    const needsApp = shortened || omittedWarnings || omittedReceipts || moreActions;
    const next = omittedItems ? "open the full basket in the app."
      : needsApp ? "open the basket in the app for full details."
      : primaryLabel ? `choose “${primaryLabel}”.`
      : status.next;
    sections.push(`Next: ${next}`);
    return sections.filter(Boolean).join("\n\n");
  };

  // Remove whole entries, never slice off a warning, status, total or CTA.
  let text = render();
  while (text.length > MAX_MESSAGE_LENGTH && shownItems > 0) {
    shownItems--;
    text = render();
  }
  while (text.length > MAX_MESSAGE_LENGTH && shownWarningCount > 0) {
    shownWarningCount--;
    text = render();
  }
  return { text, status: facts.status, actions };
}
