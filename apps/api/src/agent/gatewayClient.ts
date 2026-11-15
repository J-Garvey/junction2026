/**
 * The hotel agent reaches the gateway only through the published HTTP routes,
 * like any outside agent (Q08.2). It holds its own scoped agent token; an
 * approval is sent with the approving person's own session token.
 */
import type { Approval, LookupLine, Order, Quote, QuoteCreateBody, Refusal, AmendmentBody } from "@aimo/contracts";
import { config } from "../config.js";
import { kvGet } from "../db.js";

export class GatewayError extends Error {
  constructor(public status: number, public body: Refusal) {
    super(body?.message ?? `HTTP ${status}`);
  }
}

async function call<T>(method: string, path: string, body?: unknown, opts: { token?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const token = opts.token ?? kvGet<string>("agentToken");
  const res = await fetch(config.gatewayUrl + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      // The hotel agent reaches the gateway over HTTP like an outside agent, so it passes the preview gate the same way.
      ...(process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {}),
      ...(opts.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GatewayError(res.status, data as Refusal);
  return data as T;
}

export const gw = {
  lookup: (productIds: string[], requestedDate: string) => call<{ lines: LookupLine[]; fallback: string | null }>("POST", "/lookup", { productIds, requestedDate }),
  quote: (body: QuoteCreateBody) => call<Quote>("POST", "/quotes", body),
  getQuote: (id: string) => call<Quote>("GET", `/quotes/${id}`),
  approve: (personToken: string, quoteId: string, fingerprint: string, grants: string[]) => call<Approval>("POST", "/approvals", { quoteId, fingerprint, grants }, { token: personToken }),
  consent: (personToken: string, quote: Quote, productIds: string[]) => call<{ id: string }>("POST", "/builder-consents", { quoteId: quote.id, fingerprint: quote.fingerprint, productIds }, { token: personToken }),
  order: (quoteId: string, idemKey: string, approvalId?: string, continueWithUnconfirmedStock: string[] = [], decidedBy?: string, builderConsentId?: string) =>
    call<Order>("POST", "/orders", { quoteId, approvalId, continueWithUnconfirmedStock, builderConsentId: builderConsentId ?? undefined }, { headers: { "Idempotency-Key": idemKey } }),
  getOrder: (id: string) => call<Order>("GET", `/orders/${id}`),
  orders: (eventId?: string) => call<{ orders: Order[] }>("GET", `/orders${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`),
  amend: (orderId: string, body: AmendmentBody) => call<{ order: Order; quote: Quote }>("POST", `/orders/${orderId}/amendments`, body),
};
