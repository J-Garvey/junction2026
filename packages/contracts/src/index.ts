/**
 * Shared contracts for the Aimo Agent Gateway and the hotel agent.
 * Every request body the gateway accepts is validated with these schemas,
 * and /openapi.json is generated from them (SPEC-PUBLISH), so the spec
 * cannot drift from the code.
 */
import { z } from "zod";
import { CarbonBasis } from "./carbon.js";
export { CarbonBasis, carbonEstimateKg } from "./carbon.js";

// ---------- basics ----------

export const Role = z.enum(["chef", "approver"]);
export type Role = z.infer<typeof Role>;

export const Unit = z.enum(["g", "kg", "ml", "dl", "l", "pcs"]);
export type Unit = z.infer<typeof Unit>;

export const BaseUnit = z.enum(["kg", "l", "pcs"]);
export type BaseUnit = z.infer<typeof BaseUnit>;

export const Amount = z.object({ amount: z.number().nonnegative(), unit: Unit });
export type Amount = z.infer<typeof Amount>;

export const Constraints = z.object({
  /** Diet claims every product on the line must carry, e.g. FREE_FROM_LACTOSE. */
  claims: z.array(z.string()).default([]),
  /** GS1 allergen codes the line must avoid, e.g. AF (fish). */
  avoidAllergens: z.array(z.string()).default([]),
  /** ISO country code, e.g. "fi". A required origin is a hard rule for the event. */
  origin: z.string().optional(),
  /** Required labels, e.g. MSC. */
  labels: z.array(z.string()).default([]),
});
export type Constraints = z.infer<typeof Constraints>;

// ---------- catalogue (PRODUCT-SEARCH, VA-01) ----------

export const ProductSearchQuery = z.object({
  q: z.string().optional().describe("What the product is, read against the English and Finnish names: 'cheese' finds cheeses, not cheesecake"),
  category: z.string().optional().describe("Category code or prefix, e.g. 10400"),
  claims: z.array(z.string()).optional().describe("Every listed claim must be present"),
  excludeAllergens: z.array(z.string()).optional().describe("Products that contain or may contain these, or have no allergen declaration, are excluded"),
  origin: z.string().optional(),
  labels: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(50),
});
export type ProductSearchQuery = z.infer<typeof ProductSearchQuery>;

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  nameFi: z.string().nullable(),
  brand: z.string().nullable(),
  vendor: z.string().nullable(),
  category: z.string(),
  claims: z.array(z.string()),
  contains: z.array(z.string()),
  mayContain: z.array(z.string()),
  hasAllergenData: z.boolean(),
  origin: z.string().nullable(),
  labels: z.array(z.string()),
  catalogueSalesUnit: z.string(),
  packContent: z.object({ value: z.number(), unit: BaseUnit }).nullable().describe("Content per sales unit from the catalogue formula; unverified until checked against the price API"),
  temperature: z.number().nullable(),
  temperatureLabel: z.string().nullable(),
  reliability: z.number().nullable().describe("Share of deliveries made as ordered, 0..1; null means unknown"),
  co2KgPerKg: z.number().nullable(),
  substitutes: z.array(z.string()),
  nutrition: z.record(z.string(), z.number()).nullable(),
  ingredients: z.string().nullable(),
});
export type Product = z.infer<typeof Product>;

/** Extra local catalogue fields used by the hotel's expanded product view. */
export const ProductDetails = Product.extend({
  catalogueDetails: z.object({
    gtin: z.string().nullable(),
    baseUnit: z.string().nullable(),
    units: z.record(z.string(), z.number()),
    salesUnitInBaseUnits: z.number().nullable(),
    allowedLotSize: z.number().nullable(),
    vatCategory: z.string().nullable(),
    variableWeight: z.boolean().nullable(),
    freeFrom: z.array(z.string()),
    allergenUndeclared: z.array(z.string()),
    netWeightKg: z.number().nullable(),
    netVolumeL: z.number().nullable(),
    netContentSource: z.string().nullable(),
    deposits: z.array(z.object({ material: z.string(), unit: z.string(), quantity: z.number() })),
    hotelTags: z.array(z.string()),
    ingredientsEn: z.string().nullable(),
    ingredientsFi: z.string().nullable(),
  }),
});
export type ProductDetails = z.infer<typeof ProductDetails>;

// ---------- lookup (LOOKUP) ----------

export const StockFact = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("known"), amount: z.number() }),
  z.object({ kind: z.literal("unknown"), reason: z.enum(["terminal_sentinel", "stock_sentinel"]) }),
  z.object({ kind: z.literal("none") }),
]);
export type StockFact = z.infer<typeof StockFact>;

/** Original supplier schedules, retained before the demo adapter projects dates. */
export const AvailabilityEvidence = z.object({
  salesBlock: z.boolean(),
  schedules: z.array(z.object({
    availableDate: z.string().nullable(),
    closingTime: z.string().nullable(),
    salesUnit: z.string().nullable(),
    stock: StockFact,
    salesBlock: z.boolean(),
  })),
});
export type AvailabilityEvidence = z.infer<typeof AvailabilityEvidence>;

export const LookupLine = z.object({
  productId: z.string(),
  source: z.enum(["live", "fixture"]),
  fixtureName: z.string().nullable(),
  fetchedAt: z.string(),
  known: z.boolean().describe("False when the id is not in the local catalogue"),
  deliverable: z.boolean(),
  salesBlock: z.boolean(),
  logisticModel: z.enum(["Stock", "Terminal"]).nullable(),
  salesUnit: z.string().nullable(),
  stock: StockFact,
  availableDate: z.string().nullable(),
  closingTime: z.string().nullable().describe("Order cut-off, ISO 8601 with offset"),
  availabilityEvidence: AvailabilityEvidence.optional().describe("Unprojected supplier schedules; absent on older saved snapshots"),
  projectedFrom: z
    .string()
    .nullable()
    .optional()
    .describe("The mock ignores requestedDate and offers its own date. When the requested date is later, availableDate is the requested date and closingTime is the mock's cut-off moved forward by the same number of days. This holds the mock's original date. The cut-off is an estimate"),
  price: z
    .object({
      value: z.number().describe("catalogPrice.value per sales unit, ex VAT"),
      withTax: z.number().nullable(),
      taxRate: z.number().nullable(),
      listPrice: z.number().nullable(),
      comparisonPrice: z.number().nullable(),
      comparisonUnit: z.string().nullable(),
      validFrom: z.string().nullable(),
      validTo: z.string().nullable(),
      currency: z.string(),
    })
    .nullable(),
});
export type LookupLine = z.infer<typeof LookupLine>;

export const LookupBody = z.object({
  productIds: z.array(z.string()).min(1).max(5000),
  requestedDate: z.string().describe("YYYY-MM-DD. The upstream mock ignores it; stated as an assumption."),
});

// ---------- rules ----------

export const Outcome = z.enum(["order", "ask_approver", "ask_chef", "block"]);
export type Outcome = z.infer<typeof Outcome>;

export const FiredRule = z.object({
  ruleId: z.string(),
  label: z.string().optional().describe("One to three words for screens"),
  outcome: Outcome,
  message: z.string(),
  facts: z.record(z.string(), z.unknown()),
  /** Whether a person may override it (mandate and soft rules) or not (hard rules). */
  overridable: z.boolean(),
});
export type FiredRule = z.infer<typeof FiredRule>;

/** Read-only supplier evidence for a single catalogue product; never a quote. */
export const ProductInspection = z.object({
  product: ProductDetails,
  lookup: LookupLine,
  site: z.object({ id: z.string(), name: z.string() }),
  requestedDate: z.string(),
  evaluatedAt: z.string(),
  fallback: z.string().nullable(),
  delivery: z.object({
    state: z.enum(["not_available", "sales_blocked", "cutoff_passed", "stock_unconfirmed", "scheduled", "unknown", "after_requested_date", "out_of_stock"]),
    message: z.string(),
    rules: z.array(FiredRule),
  }),
});
export type ProductInspection = z.infer<typeof ProductInspection>;

export const ModelJudgement = z.object({
  fn: z.string(),
  question: z.string(),
  subject: z.string(),
  probability: z.number().nullable(),
  threshold: z.object({ fact: z.number(), reject: z.number() }),
  verdict: z.enum(["yes", "no", "unsure"]),
  source: z.enum(["model", "cache", "hand_checked", "unavailable"]),
  model: z.string().nullable(),
});
export type ModelJudgement = z.infer<typeof ModelJudgement>;

// ---------- mandate (AP-06, AP2-style) ----------

export const PreAnswers = z.object({
  partialFillMaxShortPct: z.number().nullable().default(null),
  unknownStockMaxLineEur: z.number().nullable().default(null),
  overshootMaxPct: z.number().default(10),
  overshootMaxEur: z.number().default(25),
  priceRiseMaxPct: z.number().default(5),
  guestChangeMaxPct: z.number().default(5),
});
export type PreAnswers = z.infer<typeof PreAnswers>;

export const CategoryOriginRequirement = z.object({
  categories: z.array(z.string().regex(/^\d{5}$/)).min(1).describe("Exact catalogue category codes, never prefixes"),
  origin: z.string().regex(/^[a-z]{2}$/).describe("Required catalogue country of origin, ISO alpha-2 lowercase; missing evidence fails"),
});
export type CategoryOriginRequirement = z.infer<typeof CategoryOriginRequirement>;

export const Mandate = z.object({
  id: z.string(),
  type: z.literal("aimo.mandate.standing.1").describe("The hotel's standing rules. AP2 v0.2 has no field for spend caps, sites or tolerances, so this is our own object, signed the same way"),
  hotelId: z.string(),
  customerNumber: z.string(),
  sites: z.array(z.object({ id: z.string(), name: z.string(), address: z.string() })),
  spendCapEur: z.number().nonnegative().describe("Per order, ex VAT, inclusive"),
  blockedProducts: z.array(z.string()),
  categoryOriginRequirements: z.array(CategoryOriginRequirement).optional().describe("Standing origin requirements, all applicable entries must pass in addition to request constraints. Omitted on older mandates; no category origin restriction then"),
  deliveryDays: z.array(z.number().int().min(0).max(6)).describe("0 = Sunday"),
  holidays: z.array(z.string()),
  preAnswers: PreAnswers,
  version: z.number().int(),
  signature: z.string().optional().describe("Compact JWS (typ aimo-mandate+jwt, alg ES256) over the mandate"),
});
export type Mandate = z.infer<typeof Mandate>;

// ---------- quotes (QUOTE-CREATE, VA-02) ----------

export const QuoteLineInput = z.object({
  productId: z.string(),
  quantity: z.number().int().positive().describe("Whole sales units"),
  outletId: z.string(),
  ref: z.string().optional().describe("Caller's line reference, echoed back"),
  requires: Constraints.optional().describe("Diet and allergen constraints the product must meet. No guest details are sent."),
});

export const QuoteCreateBody = z.object({
  siteId: z.string(),
  deliveryDate: z.string().describe("YYYY-MM-DD, the date the hotel needs delivery"),
  eventId: z.string().optional(),
  lines: z.array(QuoteLineInput).min(1).max(1000),
});
export type QuoteCreateBody = z.infer<typeof QuoteCreateBody>;

export const QuoteLine = z.object({
  lineNo: z.number().int(),
  ref: z.string().nullable(),
  productId: z.string(),
  productName: z.string(),
  outletId: z.string(),
  quantity: z.number().int(),
  salesUnit: z.string().nullable(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable(),
  taxRate: z.number().nullable(),
  stock: StockFact,
  availableDate: z.string().nullable(),
  closingTime: z.string().nullable(),
  availabilityEvidence: AvailabilityEvidence.optional(),
  priceValidTo: z.string().nullable(),
  carbonBasis: CarbonBasis.nullable().optional().describe("Informational product-group carbon factor with checked kilograms per sales unit; absent in older snapshots"),
  logisticModel: z.string().nullable(),
  source: z.enum(["live", "fixture"]),
  rules: z.array(FiredRule),
  outcome: Outcome,
  requires: Constraints.optional().describe("Hard product requirements retained for rechecks and amendments"),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

export const Quote = z.object({
  id: z.string(),
  hotelId: z.string(),
  siteId: z.string(),
  eventId: z.string().nullable(),
  deliveryDate: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
  urgent: z.boolean().describe("Delivery inside the 4-day lead time: real stock counts"),
  lines: z.array(QuoteLine),
  totalExVat: z.number(),
  totalVat: z.number(),
  fingerprint: z.string().describe("APPROVAL-BIND: hash of site, lines, quantities, prices, total and delivery dates"),
  mandateCheck: z.object({
    pass: z.boolean(),
    rules: z.array(FiredRule),
    approvalsNeeded: z.array(z.string()),
  }),
  outcome: Outcome,
  usesFixtures: z.boolean(),
  unconfirmedStock: z.array(z.string()).default([]).describe("D31: product IDs whose stock Valio Aimo can't confirm. An order must list them in continueWithUnconfirmedStock"),
  stockPolicy: z.string().optional().describe("Fingerprint of the hotel policy used for the stock decision; changes require a new review"),
  jws: z.string().optional().describe("AP2 v0.2 merchant checkout_jwt: compact JWS, typ aimo-quote+jwt, alg ES256, signed by Valio Aimo. Verify with /.well-known/jwks.json"),
  checkoutHash: z.string().optional().describe("AP2 checkout_hash: base64url(SHA-256(jws))"),
});
export type Quote = z.infer<typeof Quote>;

// ---------- approvals (AP-07) ----------

export const ApprovalBody = z.object({
  quoteId: z.string(),
  fingerprint: z.string(),
  grants: z
    .array(z.enum(["spend_cap", "partial_fill", "overshoot", "price_change", "reliability", "blocked_product"]))
    .describe("Policy exceptions approved. Empty when finance reviews an order already inside the mandate."),
});
export type ApprovalBody = z.infer<typeof ApprovalBody>;

export const Approval = z.object({
  id: z.string(),
  type: z.literal("mandate.checkout.1").describe("AP2 v0.2 closed Checkout Mandate: the approver's yes, bound to the quote's checkout_hash. grants is our extension"),
  checkoutHash: z.string().describe("AP2 checkout_hash of the quote it approves: base64url(SHA-256(quote.jws))"),
  quoteId: z.string(),
  fingerprint: z.string(),
  grants: z.array(z.string()),
  approvedBy: z.object({ personId: z.string(), name: z.string(), role: Role }),
  createdAt: z.string(),
  signature: z.string().describe("Compact JWS (typ aimo-approval+jwt, alg ES256) carrying the closed Checkout Mandate"),
});
export type Approval = z.infer<typeof Approval>;

// ---------- orders (ORDER-PLACE, VA-03) ----------

export const OrderCreateBody = z.object({
  quoteId: z.string(),
  approvalId: z.string().optional(),
  continueWithUnconfirmedStock: z.array(z.string()).optional().describe("D31: product IDs whose stock Valio Aimo can't confirm and the hotel chose to order anyway"),
  decidedBy: z.string().optional().describe("Who at the hotel made that choice, for the record"),
});

export const OrderState = z.enum(["placed", "amended", "checked", "locked", "rejected"]);

export const OrderLine = QuoteLine.extend({
  removed: z.boolean().default(false),
  riskAccepted: z.object({ by: z.string(), at: z.string() }).nullable(),
});
export type OrderLine = z.infer<typeof OrderLine>;

export const Order = z.object({
  id: z.string(),
  quoteId: z.string(),
  hotelId: z.string(),
  siteId: z.string(),
  eventId: z.string().nullable(),
  deliveryDate: z.string(),
  state: OrderState,
  lines: z.array(OrderLine),
  totalExVat: z.number(),
  totalVat: z.number(),
  placedAt: z.string(),
  placedBy: z.string(),
  approvalId: z.string().nullable(),
  idempotencyKey: z.string(),
  version: z.number().int(),
  flags: z.array(z.string()),
  jws: z.string().optional().describe("AP2 v0.2 Checkout Receipt as a compact JWS (typ aimo-order+jwt, alg ES256); verify with /.well-known/jwks.json"),
});
export type Order = z.infer<typeof Order>;

export const AmendmentBody = z.object({
  changes: z
    .array(
      z.object({
        productId: z.string(),
        outletId: z.string(),
        quantity: z.number().int().nonnegative().describe("New whole sales units; 0 removes the line"),
      }),
    )
    .min(1),
  approvalId: z.string().optional(),
  stockQuoteId: z.string().optional().describe("Amendment quote the builder reviewed when continuing with unconfirmed stock; changes require a fresh decision"),
  continueWithUnconfirmedStock: z.array(z.string()).optional(),
  decidedBy: z.string().optional(),
});
export type AmendmentBody = z.infer<typeof AmendmentBody>;

export const Refusal = z.object({
  error: z.enum(["mandate_violation", "stock_unconfirmed", "quote_stale", "quote_consumed", "cutoff_passed", "hard_rule", "idempotency_conflict", "not_found", "forbidden", "invalid", "upstream_unavailable"]),
  message: z.string(),
  rules: z.array(FiredRule).optional(),
  approvalsNeeded: z.array(z.string()).optional(),
  changes: z.array(z.record(z.string(), z.unknown())).optional(),
  newQuoteId: z.string().optional(),
});
export type Refusal = z.infer<typeof Refusal>;

// ---------- audit (AUDIT-APPEND, VA-06) ----------

export const AuditAction = z.enum([
  "request_received",
  "request_parsed",
  "constraint_asked",
  "quote_created",
  "line_verdict_set",
  "question_asked",
  "question_answered",
  "question_expired",
  "question_replaced",
  "approval_granted",
  "order_placed",
  "order_refused",
  "order_amended",
  "substitute_applied",
  "final_check_run",
  "flag_sent_to_valio_aimo",
  "allergy_warning",
  "allergy_resolved",
  "mandate_changed",
  "preference_changed",
  "clock_moved",
  "model_judgement",
  "gateway_error",
  "seed_reset",
  "basket_created",
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEntry = z.object({
  seq: z.number().int(),
  id: z.string(),
  simTime: z.string(),
  realTime: z.string(),
  actor: z.object({ kind: z.enum(["agent", "person", "gateway", "outside_agent", "system"]), id: z.string(), name: z.string(), role: z.string().nullable(), outletId: z.string().nullable(), testSession: z.boolean() }),
  action: AuditAction,
  summary: z.string(),
  eventId: z.string().nullable(),
  quoteId: z.string().nullable(),
  orderId: z.string().nullable(),
  questionId: z.string().nullable(),
  ruleIds: z.array(z.string()),
  judgements: z.array(ModelJudgement),
  details: z.record(z.string(), z.unknown()),
  usesFixture: z.boolean(),
  visibility: z.enum(["shared", "hotel"]).describe("shared = Valio Aimo can read it; hotel = hotel only"),
  prevHash: z.string(),
  hash: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

// ---------- hotel side: requests, events, questions ----------

export const DietGroup = z.object({
  id: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  constraints: Constraints,
  standing: z.boolean().default(false),
});
export type DietGroup = z.infer<typeof DietGroup>;

export const Ingredient = z.object({
  id: z.string(),
  text: z.string(),
  query: z.string().optional(),
  category: z.string().optional(),
  productId: z.string().optional().describe("Recipe-approved product"),
  variants: z.record(z.string(), z.string()).optional().describe("Recipe-approved product per diet group id"),
  perPortion: Amount.optional().describe("Amount per guest; pieces use the pack's piece count"),
  total: Amount.optional().describe("A fixed total for the event instead of an amount per guest"),
  claims: z.array(z.string()).optional().describe("Claims this ingredient always needs, e.g. FREE_FROM_LACTOSE"),
  origin: z.string().optional().describe("Required origin for this ingredient, e.g. fi"),
  productType: z.string().optional(),
  frozen: z.boolean().optional(),
});
export type Ingredient = z.infer<typeof Ingredient>;

export const Dish = z.object({
  id: z.string(),
  name: z.string(),
  outletId: z.string(),
  /** Diet group ids this dish does NOT serve (they get another dish). */
  excludesGroups: z.array(z.string()).default([]),
  ingredients: z.array(Ingredient),
});
export type Dish = z.infer<typeof Dish>;

export const EventSpec = z.object({
  id: z.string(),
  name: z.string(),
  siteId: z.string(),
  serviceDate: z.string(),
  guests: z.number().int().nonnegative(),
  dietGroups: z.array(DietGroup),
  dishes: z.array(Dish),
  dietsConfirmed: z.boolean().describe("PF-01: 'no allergies' must be stated, never assumed"),
});
export type EventSpec = z.infer<typeof EventSpec>;

/** A single free-text request (CH-09) becomes one or more of these lines. */
export const SingleLine = z.object({
  id: z.string(),
  text: z.string(),
  query: z.string(),
  productType: z.string().nullable(),
  category: z.string().nullable(),
  productId: z.string().nullable(),
  quantity: Amount.nullable(),
  constraints: Constraints,
});
export type SingleLine = z.infer<typeof SingleLine>;

export const SingleRequest = z.object({
  kind: z.literal("single"),
  originalText: z.string(),
  siteId: z.string().nullable(),
  outletId: z.string(),
  neededBy: z.string().nullable(),
  neededByText: z.string().nullable(),
  lines: z.array(SingleLine),
  parsedBy: z.enum(["openai", "rules"]),
});
export type SingleRequest = z.infer<typeof SingleRequest>;

export const QuestionType = z.enum([
  "missing_details",
  "ambiguous_type",
  "quantity_sanity",
  "substitute",
  "unknown_stock",
  "partial_fill",
  "overshoot",
  "spend_cap",
  "price_change",
  "reliability",
  "change_outside_tolerance",
  "allergy_conflict",
  "delivery_alignment",
  "order_review",
]);
export type QuestionType = z.infer<typeof QuestionType>;

export const QuestionOption = z.object({ id: z.string(), label: z.string(), primary: z.boolean().default(false) });

export const Question = z.object({
  id: z.string(),
  planId: z.string(),
  eventId: z.string().nullable(),
  type: QuestionType,
  forRole: Role,
  outletId: z.string().nullable(),
  quoteId: z.string().nullable(),
  fingerprint: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  facts: z.record(z.string(), z.unknown()),
  ruleIds: z.array(z.string()),
  options: z.array(QuestionOption),
  deadline: z.string().nullable(),
  state: z.enum(["open", "waiting", "answered", "expired", "replaced"]),
  answer: z.string().nullable(),
  /** Required for a manager returning an order review; absent on older decisions. */
  answerNote: z.string().optional(),
  answeredBy: z.object({ personId: z.string(), name: z.string() }).nullable(),
  answeredAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Question = z.infer<typeof Question>;

export const AnswerBody = z.object({ optionId: z.string(), note: z.string().trim().max(2000).optional() });

export const ClockSetBody = z.object({ time: z.string().optional(), scene: z.enum(["1", "2", "3", "4", "live"]).optional() });
export * from "./hotel.js";
export * from "./whatsapp.js";
