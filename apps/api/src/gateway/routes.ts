/**
 * Aimo Agent Gateway HTTP routes (Q08.1), mounted at /gateway/v1. Our own hotel
 * agent uses exactly these routes, over HTTP, with its own scoped token (Q08.2).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AmendmentBody, BuilderConsentBody, ApprovalBody, LookupBody, OrderCreateBody, ProductSearchQuery, QuoteCreateBody } from "@aimo/contracts";
import { resolveToken, tokenFrom, type Identity } from "../identity.js";
import { searchMatches, getProduct } from "../catalog.js";
import { lookup, UpstreamError } from "../aimo/lookup.js";
import { amendOrder, createBuilderConsent, createApproval, createQuote, getMandate, GatewayRefusal, listOrders, placeOrder } from "./service.js";
import { auditView, verifyChain } from "../audit.js";
import { buildOpenApi } from "./openapi.js";
import { brandProfile, ExternalUnavailable } from "../external/contextdev.js";
import { orderToUbl } from "./peppol.js";
import { readableQuote, readableOrder, requireRead, sharedQuote, sharedOrder } from "./reads.js";
import { logSearch } from "../searchlog.js";

declare global {
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

function auth(req: Request, res: Response, next: NextFunction) {
  const id = resolveToken(tokenFrom(req));
  if (!id) return res.status(401).json({ error: "forbidden", message: "Send a gateway token as 'Authorization: Bearer <token>'" });
  req.identity = id;
  next();
}

function parse<T>(schema: z.ZodType<T>, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new GatewayRefusal(422, { error: "invalid", message: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
  return r.data;
}

const csv = (v: unknown) => (typeof v === "string" && v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export function readFilter(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return parse(z.string().trim().min(1), value);
}

export function gatewayRouter(): Router {
  const r = Router();
  r.get("/openapi.json", (_req, res) => res.json(buildOpenApi()));
  r.use(auth);

  r.get("/products", (req, res) => {
    const q = parse(ProductSearchQuery, {
      q: req.query.q,
      category: req.query.category,
      claims: csv(req.query.claims),
      excludeAllergens: csv(req.query.excludeAllergens),
      origin: req.query.origin,
      labels: csv(req.query.labels),
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    const id = req.identity!;
    const ms = searchMatches(q, id.kind === "valio" ? undefined : getMandate(id.hotelId));
    logSearch({ source: "product_search", query: q, interpreted: { count: ms.length, top: ms.slice(0, 10).map((m) => ({ product: `${m.product.id} ${m.product.name}`, tier: m.tier, role: m.role })) } });
    res.json({ products: ms.map((m) => m.product), relevance: ms.map((m) => ({ productId: m.product.id, tier: m.tier, role: m.role })), source: "local catalogue (data/products_slim.jsonl)" });
  });
  r.get("/products/:id", (req, res) => {
    const p = getProduct(String(req.params.id));
    if (!p) throw new GatewayRefusal(404, { error: "not_found", message: `Product ${req.params.id} is not in the catalogue` });
    res.json(p);
  });
  // External enrichment: the product's brand from context.dev. Labelled as web data, never used by a rule.
  r.get("/products/:id/brand", async (req, res) => {
    const p = getProduct(String(req.params.id));
    if (!p) throw new GatewayRefusal(404, { error: "not_found", message: `Product ${req.params.id} is not in the catalogue` });
    if (!p.brand) return res.json({ productId: p.id, brand: null, reason: "The catalogue has no brand for this product" });
    try {
      res.json({ productId: p.id, catalogueBrand: p.brand, catalogueOrigin: p.origin, brand: await brandProfile(p.brand) });
    } catch (e) {
      if (e instanceof ExternalUnavailable) throw new GatewayRefusal(503, { error: "upstream_unavailable", message: e.message });
      throw e;
    }
  });
  r.post("/lookup", async (req, res) => {
    const b = parse(LookupBody, req.body);
    try {
      const out = await lookup(b.productIds, b.requestedDate);
      res.json(out);
    } catch (e) {
      if (e instanceof UpstreamError) throw new GatewayRefusal(503, { error: "upstream_unavailable", message: e.message });
      throw e;
    }
  });
  r.post("/quotes", async (req, res) => res.status(201).json(await createQuote(req.identity!, parse(QuoteCreateBody, req.body))));
  r.get("/quotes/:id", (req, res) => res.json(req.identity!.kind === "valio" ? sharedQuote(readableQuote(req.identity!, String(req.params.id))) : readableQuote(req.identity!, String(req.params.id))));
  r.post("/builder-consents", (req, res) => res.status(201).json(createBuilderConsent(req.identity!, parse(BuilderConsentBody, req.body))));
  r.post("/approvals", async (req, res) => res.status(201).json(await createApproval(req.identity!, parse(ApprovalBody, req.body))));
  r.post("/orders", async (req, res) => {
    const b = parse(OrderCreateBody, req.body);
    const out = await placeOrder(req.identity!, b.quoteId, req.header("idempotency-key") ?? "", b.approvalId, undefined, { continueWith: b.continueWithUnconfirmedStock, builderConsentId: b.builderConsentId });
    res.status(out.replay ? 200 : 201).json(out.order);
  });
  r.get("/orders", (req, res) => {
    const id = req.identity!;
    requireRead(id, "order");
    if (id.kind === "valio") throw new GatewayRefusal(403, { error: "forbidden", message: "Use /audit" });
    res.json({ orders: listOrders(id.hotelId, readFilter(req.query.eventId)) });
  });
  r.get("/orders/:id", (req, res) => res.json(req.identity!.kind === "valio" ? sharedOrder(readableOrder(req.identity!, String(req.params.id))) : readableOrder(req.identity!, String(req.params.id))));
  // The same order as a Peppol BIS Ordering 3 document (UBL 2.1 Order).
  r.get("/orders/:id/peppol", (req, res) => {
    const o = readableOrder(req.identity!, String(req.params.id));
    res.type("application/xml").send(orderToUbl(o));
  });
  r.post("/orders/:id/amendments", async (req, res) => res.json(await amendOrder(req.identity!, String(req.params.id), parse(AmendmentBody, req.body))));
  r.get("/mandate", (req, res) => {
    const id = req.identity!;
    requireRead(id, "mandate");
    if (id.kind === "valio") throw new GatewayRefusal(403, { error: "forbidden", message: "Valio Aimo sees whether a rule was met, not the mandate values" });
    res.json(getMandate(id.hotelId));
  });
  r.get("/audit", (req, res) => {
    const id = req.identity!;
    requireRead(id, "audit");
    const viewer = id.kind === "person" ? "hotel" : "valio";
    res.json({
      viewer,
      chain: verifyChain(),
      entries: auditView(viewer, { hotelIds: id.kind === "valio" ? id.hotelIds : undefined, hotelId: id.kind === "valio" ? undefined : id.hotelId, eventId: readFilter(req.query.eventId), orderId: readFilter(req.query.orderId) }),
    });
  });
  return r;
}

export function gatewayErrors(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof GatewayRefusal) return res.status(err.status).json(err.body);
  if (err instanceof SyntaxError) return res.status(400).json({ error: "invalid", message: "Body is not valid JSON" });
  next(err);
}
