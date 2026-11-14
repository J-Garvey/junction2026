/**
 * SPEC-PUBLISH (VA-07): the OpenAPI 3.1 document is generated from the same Zod
 * schemas that validate requests, so it can't drift from the code. The mock's
 * quirks are stated as assumptions in the description.
 */
import { z } from "zod";
import * as C from "@aimo/contracts";

const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-2020-12", unrepresentable: "any", io: "input" });

const ASSUMPTIONS = `
**Aimo Agent Gateway** sits in front of the Valio Aimo Junction mock (\`https://junction26.valioaimo.fi\`), which only looks things up.
This gateway owns quotes, approvals, orders, amendments and the audit log. Mandates and approvals are **AP2-style, not AP2-conformant**: a signed standing mandate (IntentMandate.standing) and a signed per-quote approval (CartMandate.approval). No payments: B2B foodservice is invoiced on account.

Stated assumptions about the upstream mock (see GROUND_TRUTH.md):
- \`requestedDate\` and \`customer\` are ignored upstream; every available line says Monday 2026-11-16.
- Stock 999999 on Terminal products and ~9,999,999,999 base units on some Stock products are **unknown**, never "available". They need an Approver to accept the risk (\`unknown_stock\` grant).
- Empty \`scheduleLines\` means not deliverable, even with a price. \`error: true\` on price means no price.
- A cut-off already past is refused (\`cutoff_passed\`) even though the mock still shows a Monday date.
- Only one schedule line is returned per product, so a split delivery is two linked orders.
- Simulated orders do not reduce upstream stock (Q08.8).
- Prices are \`catalogPrice.value\` per sales unit, ex VAT. Orders are only created from a quote, at its fixed prices.
- Every lookup value says whether it came from the live mock or a saved fixture.

**Signatures.** Quotes, orders, approvals and the standing mandate carry a compact JWS (RFC 7515) signed with ES256 (ECDSA P-256), typed \`aimo-quote+jwt\`, \`aimo-order+jwt\`, \`aimo-approval+jwt\` and \`aimo-mandate+jwt\` (RFC 8725 §3.11). The payload is a JWT claim set (RFC 7519) in JCS order (RFC 8785). Verify with the public keys at \`/.well-known/jwks.json\` (RFC 7517; kid is the RFC 7638 thumbprint). No shared secret is needed.

**AP2 v0.2 alignment.** A quote's \`jws\` is the merchant-signed \`checkout_jwt\` and \`checkoutHash\` is its \`checkout_hash\` (base64url SHA-256). An approval is a closed Checkout Mandate (\`vct: "mandate.checkout.1"\`) bound to that hash; its \`grants\` list is our extension. An order's \`jws\` carries a Checkout Receipt (\`status\`, \`reference\` = the quote's checkout_hash, \`order_id\`). No Payment Mandates: B2B foodservice is invoiced on account. The standing mandate (spend cap, sites, tolerances) has no AP2 field and is our own object. Deviation: AP2 has the user sign the closed mandate on a trusted surface; here the gateway signs it as the record of the approver's authenticated decision.

**Discovery.** \`/.well-known/api-catalog\` (RFC 9727) links this spec.

Refusals are HTTP 409 with a machine-readable \`error\`: \`mandate_violation\`, \`quote_stale\`, \`cutoff_passed\`, \`hard_rule\`. A retry with the same \`Idempotency-Key\` returns the same order; the same key with a different body gives 422.
`.trim();

export function buildOpenApi() {
  const components = {
    Product: schema(C.Product),
    LookupLine: schema(C.LookupLine),
    LookupBody: schema(C.LookupBody),
    QuoteCreateBody: schema(C.QuoteCreateBody),
    Quote: schema(C.Quote),
    ApprovalBody: schema(C.ApprovalBody),
    Approval: schema(C.Approval),
    OrderCreateBody: schema(C.OrderCreateBody),
    Order: schema(C.Order),
    AmendmentBody: schema(C.AmendmentBody),
    Mandate: schema(C.Mandate),
    AuditEntry: schema(C.AuditEntry),
    Refusal: schema(C.Refusal),
  };
  const ref = (n: keyof typeof components) => ({ $ref: `#/components/schemas/${n}` });
  const json = (s: object) => ({ content: { "application/json": { schema: s } } });
  const refusals = {
    "401": { description: "No or unknown token" },
    "409": { description: "Refused: mandate_violation, quote_stale, cutoff_passed or hard_rule", ...json(ref("Refusal")) },
    "422": { description: "Invalid body", ...json(ref("Refusal")) },
    "503": { description: "Upstream mock unavailable; nothing was ordered", ...json(ref("Refusal")) },
  };
  return {
    openapi: "3.1.0",
    info: { title: "Aimo Agent Gateway", version: "0.1.0", description: ASSUMPTIONS },
    servers: [{ url: "/gateway/v1" }],
    security: [{ bearer: [] }],
    paths: {
      "/products": {
        get: {
          operationId: "searchProducts",
          summary: "Search the catalogue by text, category, claim, allergen, origin and label (no upstream call)",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "claims", in: "query", description: "Comma-separated; all required", schema: { type: "string" } },
            { name: "excludeAllergens", in: "query", description: "Comma-separated GS1 codes", schema: { type: "string" } },
            { name: "origin", in: "query", schema: { type: "string" } },
            { name: "labels", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 50 } },
          ],
          responses: {
            "200": {
              description:
                "Up to 50 products. Without q, ordered by id. With q, only products that are the thing asked for (\"cheese\" returns cheeses, not cheesecake or cheese snacks), spread across the matching categories; each has a relevance tier (0 named and in a home category, 1 in a home category, 2 named elsewhere, 3 only mentioned, returned when nothing better exists)",
              ...json({
                type: "object",
                properties: {
                  products: { type: "array", items: ref("Product") },
                  relevance: { type: "array", items: { type: "object", properties: { productId: { type: "string" }, tier: { type: "integer", minimum: 0, maximum: 3 }, role: { type: ["string", "null"], enum: ["head", "modifier", "mention", null] } } } },
                },
              }),
            },
          },
        },
      },
      "/products/{id}": { get: { operationId: "getProduct", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Product", ...json(ref("Product")) } } } },
      "/products/{id}/brand": {
        get: {
          operationId: "getProductBrand",
          summary: "Supplier brand profile from context.dev (external web data): domain, logo, description, country. Cached; never used by a rule.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Brand profile, or null when unknown" }, "503": { description: "context.dev not configured or unreachable", ...json(ref("Refusal")) } },
        },
      },
      "/lookup": {
        post: {
          operationId: "lookup",
          summary: "Price and availability for up to 5,000 ids, batched upstream in 1,000s",
          requestBody: { required: true, ...json(ref("LookupBody")) },
          responses: { "200": { description: "Normalised lines", ...json({ type: "object", properties: { lines: { type: "array", items: ref("LookupLine") }, fallback: { type: ["string", "null"] } } }) }, ...refusals },
        },
      },
      "/quotes": {
        post: {
          operationId: "createQuote",
          summary: "A dated snapshot of price, availability, cut-off and validity; expires at the earliest cut-off, at most 24 h",
          requestBody: { required: true, ...json(ref("QuoteCreateBody")) },
          responses: { "201": { description: "Quote, with rule outcomes and the approvals the mandate needs", ...json(ref("Quote")) }, ...refusals },
        },
      },
      "/quotes/{id}": { get: { operationId: "getQuote", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Quote", ...json(ref("Quote")) } } } },
      "/approvals": {
        post: {
          operationId: "approve",
          summary: "An Approver's signed approval, bound to the quote's fingerprint. Agent tokens can't call this.",
          requestBody: { required: true, ...json(ref("ApprovalBody")) },
          responses: { "201": { description: "Signed approval", ...json(ref("Approval")) }, ...refusals },
        },
      },
      "/orders": {
        post: {
          operationId: "placeOrder",
          summary: "Create an order from a quote at its fixed prices. Rechecks price, stock and cut-off at commit.",
          parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string" } }],
          requestBody: { required: true, ...json(ref("OrderCreateBody")) },
          responses: { "201": { description: "Order placed", ...json(ref("Order")) }, "200": { description: "Replay of an earlier order with the same key", ...json(ref("Order")) }, ...refusals },
        },
        get: { operationId: "listOrders", parameters: [{ name: "eventId", in: "query", schema: { type: "string" } }], responses: { "200": { description: "Orders", ...json({ type: "object", properties: { orders: { type: "array", items: ref("Order") } } }) } } },
      },
      "/orders/{id}": { get: { operationId: "getOrder", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order", ...json(ref("Order")) } } } },
      "/orders/{id}/peppol": {
        get: {
          operationId: "getOrderPeppol",
          summary: "The order as a Peppol BIS Ordering 3 document (UBL 2.1 Order, T01). Party identifiers are demo values.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "UBL 2.1 Order XML", content: { "application/xml": { schema: { type: "string" } } } } },
        },
      },
      "/orders/{id}/amendments": {
        post: {
          operationId: "amendOrder",
          summary: "Change quantities until each line's cut-off; re-runs the mandate check",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, ...json(ref("AmendmentBody")) },
          responses: { "200": { description: "Amended order", ...json({ type: "object", properties: { order: ref("Order"), quote: ref("Quote") } }) }, ...refusals },
        },
      },
      "/mandate": { get: { operationId: "getMandate", summary: "The hotel's signed standing mandate", responses: { "200": { description: "Mandate", ...json(ref("Mandate")) } } } },
      "/audit": {
        get: {
          operationId: "getAudit",
          summary: "The one shared audit log. Valio Aimo tokens see only entries tagged shared, without recipe or guest details.",
          parameters: [
            { name: "eventId", in: "query", schema: { type: "string" } },
            { name: "orderId", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Entries, newest first, with a hash-chain check", ...json({ type: "object", properties: { entries: { type: "array", items: ref("AuditEntry") } } }) } },
        },
      },
    },
    components: { schemas: components, securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
  };
}
