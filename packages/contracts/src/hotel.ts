/** Hotel-side shapes (the agent's working state). Valio Aimo never receives these. */
import type { FiredRule, ModelJudgement, StockFact, SingleRequest, Constraints, Amount, BaseUnit } from "./index.js";

/** Q10.2: one set of status labels on every screen. */
export type StatusLabel = "covered" | "check" | "not_available" | "unknown_stock" | "covered_at_risk" | "waiting" | "blocked" | "unresolved" | "allergy_warning";
export type Verdict = "green" | "amber" | "red";

export interface Candidate {
  productId: string;
  name: string;
  brand: string | null;
  rank: number;
  rankStep: string;
  label: "best" | "better" | "good" | "more";
  unitPrice: number | null;
  pricePerBase: number | null;
  baseUnit: BaseUnit | null;
  stock: StockFact;
  reliability: number | null;
  packContent: { value: number; unit: BaseUnit; verified: boolean; source: string } | null;
  salesUnit: string | null;
  closingTime: string | null;
  availableDate: string | null;
  source: "live" | "fixture";
  judgement: ModelJudgement | null;
  notes: FiredRule[];
}

export interface Need {
  id: string;
  label: string;
  text: string;
  dishId: string | null;
  dishName: string | null;
  ingredientId: string | null;
  groupId: string;
  groupLabel: string;
  guests: number | null;
  perPortion: Amount | null;
  outletId: string;
  amount: { value: number; unit: BaseUnit };
  constraints: Constraints;
  pinnedProductId: string | null;
  productType: string | null;
  category: string | null;
  query: string;
  neededBy: string | null;
  frozen: boolean;
  candidates: Candidate[];
  candidateCount: number;
  excluded: { productId: string; name: string; reason: string; ruleId: string }[];
  rules: FiredRule[];
  judgements: ModelJudgement[];
  substituteFor: string | null;
}

export interface PlanLine {
  id: string;
  needIds: string[];
  productId: string | null;
  productName: string;
  outletId: string;
  needAmount: { value: number; unit: BaseUnit };
  quantity: number;
  packContent: { value: number; unit: BaseUnit; verified: boolean; source: string } | null;
  overshoot: { amount: number; pct: number; eur: number } | null;
  unitPrice: number | null;
  lineTotal: number | null;
  salesUnit: string | null;
  stock: StockFact | null;
  availableDate: string | null;
  closingTime: string | null;
  reliability: number | null;
  source: "live" | "fixture" | null;
  verdict: Verdict;
  status: StatusLabel;
  rules: FiredRule[];
  rankStep: string | null;
  shares: { needId: string; label: string; amount: number }[];
  allocation: "primary" | "partial" | "unknown_fill" | "short";
  riskAccepted: { by: string; at: string } | null;
  removed: boolean;
  /** Product-group average kg CO2e per kg, times the kg or L ordered. An estimate, labelled as such. */
  co2Kg?: number | null;
}

export type PlanStatus = "needs_input" | "viability" | "waiting" | "ordered" | "blocked" | "rejected" | "kept_short" | "failed";

export interface Plan {
  id: string;
  kind: "single" | "event";
  eventId: string | null;
  title: string;
  createdAt: string;
  createdBy: { personId: string; name: string };
  siteId: string;
  outletId: string;
  neededBy: string | null;
  deliveryDate: string | null;
  urgent: boolean;
  stage: "viability" | "order";
  status: PlanStatus;
  request: SingleRequest | null;
  inputRules: FiredRule[];
  needs: Need[];
  lines: PlanLine[];
  quoteId: string | null;
  fingerprint: string | null;
  totalExVat: number | null;
  totalVat?: number | null;
  approvalsNeeded: string[];
  approvalId: string | null;
  orderIds: string[];
  idemKey: string;
  usesFixtures: boolean;
  note: string | null;
  summary: string;
  questionIds: string[];
  shortfall: { need: number; covered: number; unit: string } | null;
  error: string | null;
  /** Measured while running: how long each agent step took. */
  timings?: { products: number; lookupMs: number; rankMs: number; quoteMs?: number; totalMs: number } | null;
}

export interface WarningRecord {
  id: string;
  eventId: string;
  kind: "allergy";
  text: string;
  productId: string;
  productName: string;
  allergen: string;
  groupId: string;
  count: number;
  orderId: string;
  state: "open" | "resolved";
  resolvedBy: string | null;
  resolution: string | null;
  createdAt: string;
}
