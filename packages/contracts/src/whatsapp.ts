/** Shared facts for the live WhatsApp channel and offline simulator. */
import type { SingleRequest } from "./index.js";

export interface WhatsAppOrderRef {
  id: string;
  name: string;
  deliveryDate: string;
  version: number;
}

export interface WhatsAppLine {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  lineTotal: number | null;
  stock: "confirmed" | "unknown" | null;
  /** True when the line is already in a placed mock order; changing it amends that order. */
  ordered?: boolean;
}

export interface WhatsAppPending {
  kind: "add_items" | "remove_items" | "change_quantity" | "confirm_order" | "answer_question";
  orderId: string;
  fingerprint: string;
  planId?: string;
  lineIds?: string[];
  /** change_quantity: the new whole sales units for lineIds[0]. */
  quantity?: number;
  /** answer_question: the approver card and the chosen option. */
  questionId?: string;
  optionId?: string;
  note?: string;
}

export interface WhatsAppConversation {
  activeOrderId: string | null;
  pending: WhatsAppPending | null;
}

export interface WhatsAppInterpretContext extends WhatsAppConversation {
  orders: WhatsAppOrderRef[];
  lines: WhatsAppLine[];
}

export interface WhatsAppInterpretation {
  intent: "select_order" | "add_items" | "remove_items" | "change_quantity" | "confirm_order" | "accept_change" | "cancel" | "summary"
    | "approve" | "refuse" | "new_order" | "help" | "clarify";
  orderId: string | null;
  /** change_quantity: whole sales units; new_order: unused. */
  quantity?: number;
  /** refuse: the note for the order builder. */
  note?: string;
  /** new_order: the basket to create. */
  newOrder?: { name: string; deliveryDate: string };
  request: Omit<SingleRequest, "siteId" | "outletId"> | null;
  lineIds: string[];
  question: string | null;
  choices: WhatsAppOrderRef[];
}

export interface WhatsAppReplyFacts {
  status: "clarification" | "summary" | "proposal" | "updated" | "approval_required" | "ordered" | "blocked";
  headline: string;
  detail?: string;
  order?: WhatsAppOrderRef | null;
  lines?: WhatsAppLine[];
  totalExVat?: number | null;
  warnings?: string[];
  actions?: { label: string; text: string }[];
  orderIds?: string[];
  orderChoices?: WhatsAppOrderRef[];
  change?: "add" | "remove" | "quantity" | "submit" | "approve" | "refuse";
  /** Number the lines so the person can reply "remove 2" or "change 2 to 10". */
  numbered?: boolean;
  /** Short reply examples shown as a list. */
  tips?: string[];
  appLink?: { label: string; path: string };
}

export interface WhatsAppReply {
  text: string;
  status: WhatsAppReplyFacts["status"];
  actions: { label: string; text: string }[];
}

export interface WhatsAppMessage {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  reply?: WhatsAppReply;
}

export interface WhatsAppSession {
  connected: boolean;
  simulated: true;
  displayName: string;
  groupId: string;
  messages: WhatsAppMessage[];
  conversation: WhatsAppConversation;
}

export interface WhatsAppGroupConfig {
  selectedGroupId: string;
  groups: { id: string; name: string }[];
}

/** Ignored messages return transport feedback only, never a reply or chat history. */
export type WhatsAppMessageResult = WhatsAppSession | { ignored: "other_group" | "direct_message" };

export interface WhatsAppWebStatus {
  phase: "disconnected" | "starting" | "qr" | "authenticated" | "ready" | "error";
  qrDataUrl: string | null;
  accountName: string | null;
  ownerName: string | null;
  groups: { id: string; name: string }[];
  selectedGroupId: string | null;
  busy: boolean;
  lastError: string | null;
  lastMessageAt: string | null;
  handledMessages: number;
}
