/** Synthetic WhatsApp channel. No credentials or messages go to WhatsApp. */
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
}

export interface WhatsAppPending {
  kind: "add_items" | "remove_items" | "confirm_order";
  orderId: string;
  fingerprint: string;
  planId?: string;
  lineIds?: string[];
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
  intent: "select_order" | "add_items" | "remove_items" | "confirm_order" | "accept_change" | "cancel" | "summary" | "clarify";
  orderId: string | null;
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
  messages: WhatsAppMessage[];
  conversation: WhatsAppConversation;
}
