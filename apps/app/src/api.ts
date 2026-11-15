/** Thin client for the hotel app API (/api). Shapes follow apps/api/src/app/routes.ts. */
import type { AuditEntry, BasketStatus, Order, Plan, ProductDetails, Question, SingleRequest, WarningRecord, DietGroup, FiredRule, Mandate, Unit } from "@aimo/contracts";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(body?.message ?? body?.error ?? body?.reason ?? `HTTP ${status}`);
  }
}

/** Set by the shell: called on 401 so the person picker shows. */
export const authHooks: { onUnauthorized: () => void } = { onUnauthorized: () => {} };

async function call<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, { message: "Can't reach the server right now. Nothing has been ordered." });
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 200) };
  }
  // The preview gate (not the person picker) refused us: the login expired or the password changed.
  if (res.status === 401 && typeof data?.message === "string" && data.message.includes("X-Preview-Password")) {
    window.location.href = "/login";
    throw new ApiError(res.status, data);
  }
  if (res.status === 401) authHooks.onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const get = <T>(p: string) => call<T>("GET", p);
export const post = <T>(p: string, b?: unknown) => call<T>("POST", p, b ?? {});
export const put = <T>(p: string, b?: unknown) => call<T>("PUT", p, b ?? {});

// ---------- response shapes ----------

export type SceneKey = "1" | "2" | "3" | "4";
export interface StatusResp {
  clock: { mode: string; time: string | null; scene: string | null; now: string; scenes: Record<SceneKey, { label: string; time: string }> };
  dataMode: { mode: "live" | "fixture"; overlay: string | null } | string;
  model: { provider: string; model: string; configured: boolean };
  catalogue?: number;
  testMode?: boolean;
  chain: { ok: boolean; brokenAt: number | null; entries: number };
}

export interface Person {
  id: string;
  name: string;
  title: string;
  role: "chef" | "approver";
  outlets: string[];
  hotelScope: boolean;
}
export interface Outlet {
  id: string;
  name: string;
}
export interface PeopleResp {
  people: Person[];
  outlets: Outlet[];
}

export type CoverageLevel = "covered" | "at_risk" | "not_covered" | "warning" | "none";
export interface Coverage {
  level: CoverageLevel;
  text: string;
}
export interface HomeEvent {
  id: string;
  name: string;
  serviceDate: string;
  guests: number;
  coverage: Coverage;
  version: number;
  outlets?: string[];
}
export interface HomePlan {
  id: string;
  title: string;
  status: Plan["status"];
  summary: string;
  createdAt: string;
  createdBy: string;
}
export interface HomeResp {
  questions: Question[];
  events: HomeEvent[];
  plans: HomePlan[];
  warnings: WarningRecord[];
}

export type MessageResp =
  | { route: "new_request" | "new_request_unsure"; request: SingleRequest; note: string | null }
  | { route: "event_change"; guests: number | null; events: { id: string; name: string; guests: number; version: number }[] }
  | { route: "neither"; message: string };

export interface PlanResp {
  plan: Plan;
  questions: Question[];
}

export interface AnswerResp {
  ok: boolean;
  question: Question;
  plan?: Plan | null;
  error?: string;
  reason?: string;
}

export type DiffChange = "added" | "removed" | "up" | "down" | "unchanged" | "needs_substitute";
export interface DiffLine {
  productId: string;
  productName: string;
  outletId: string;
  was: number;
  now: number;
  unit: string | null;
  change: DiffChange;
}
export interface FinalCheck {
  at: string;
  summary: string;
  lines: { productId: string; productName: string; result: string; detail: string }[];
}
export interface EventIngredient {
  id: string;
  text: string;
  query?: string;
  category?: string;
  productId?: string;
  variants?: Record<string, string>;
  perPortion?: { amount: number; unit: Unit };
  total?: { amount: number; unit: Unit };
  claims?: string[];
  origin?: string;
  productType?: string;
  frozen?: boolean;
}
export interface EventDish {
  id: string;
  name: string;
  outletId: string;
  excludesGroups: string[];
  ingredients: EventIngredient[];
}
/** The menu scaled by the head count: one line per product or spec, with each dish's share (CH-12). */
export interface MenuScale {
  guests: number;
  regularGuests: number;
  lines: {
    lineId: string;
    text: string;
    productId: string | null;
    total: { amount: number; unit: "kg" | "l" | "pcs" };
    constraints: { claims: string[]; avoidAllergens: string[]; labels: string[]; origin?: string };
    shares: { dishName: string; groupId: string; groupLabel: string; guests: number | null; perPortion: { amount: number; unit: string } | null; amount: number }[];
  }[];
  problems: FiredRule[];
  warnings: FiredRule[];
}
export interface MenuBody {
  version: number;
  guests: number;
  dietsConfirmed: boolean;
  dietGroups: DietGroup[];
  dishes: EventDish[];
}
export interface StoredEvent {
  id: string;
  name: string;
  siteId: string;
  serviceDate: string;
  guests: number;
  dietGroups: DietGroup[];
  dishes: EventDish[];
  dietsConfirmed: boolean;
  version: number;
  removedNeeds: string[];
  viabilityPlanId: string | null;
  orderPlanId: string | null;
  orderedGuests: number | null;
  lastDiff: DiffLine[] | null;
  finalCheck: FinalCheck | null;
  changes: { at: string; by: string; what: string }[];
}
export interface DecisionCount {
  decisions: number;
  confirmations: number;
  items: { at: string; by: string; summary: string; ruleIds: string[] }[];
}
export interface EventResp {
  event: StoredEvent;
  viability: Plan | null;
  orderPlan: Plan | null;
  warnings: WarningRecord[];
  coverage: Coverage;
  decisions: DecisionCount;
  questions: Question[];
}
export interface ChangeResp {
  applied?: boolean;
  reason?: string;
  diff?: DiffLine[];
  questionId?: string;
  [k: string]: unknown;
}

export interface AuditResp {
  viewer: "hotel" | "valio";
  chain: { ok: boolean; brokenAt: number | null; entries: number };
  entries: AuditEntry[];
  decisions: DecisionCount | null;
}

export type Outcome = FiredRule["outcome"];
export interface RuleControl {
  /** Outcomes the hotel may pick; one entry means locked. */
  choices: Outcome[];
  lock?: string;
  params?: string[];
  names?: Partial<Record<Outcome, string>>;
  active?: boolean;
}
export interface RuleDef {
  label: string;
  id: string;
  area: string;
  outcome: Outcome;
  defaultOutcome: Outcome;
  hard: boolean;
  who: string;
  trigger: string;
  template: string;
  control: RuleControl;
}
export type ParamKind = "pct" | "fraction" | "eur" | "days" | "number" | "grams" | "bool" | "weekdays" | "dates" | "products";
export interface ParamDef {
  key: string;
  scope: "mandate" | "policy";
  label: string;
  help?: string;
  kind: ParamKind;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  nullLabel?: string;
}
export type ParamValue = number | boolean | null | number[] | string[];
export interface RuleEdit {
  outcomes?: Record<string, Outcome>;
  params?: Record<string, ParamValue>;
}
export interface RulesResp {
  rules: RuleDef[];
  mandate: Mandate;
  params: Record<string, ParamDef>;
  defaultParams: Record<string, ParamValue>;
  policy: { params: Record<string, ParamValue>; version: number; updatedBy: string | null; updatedAt: string | null };
  canEdit: boolean;
  changes?: string[];
  fixed: Record<string, number | string>;
  remembered: { dish: string; original: string; sub: string; by: string; at: string; spec?: string }[];
  tokens: { outsideAgent: string; valioViewer: string };
}

export interface OrdersResp {
  orders: Order[];
}

/** An order basket: one event, named by the event and its delivery date. */
export interface Basket extends BasketStatus {
  id: string;
  name: string;
  deliveryDate: string;
  guests: number;
  coverage: Coverage;
  lines: number;
  totalExVat: number | null;
  /** Questions this person can answer. */
  waiting: number;
  /** Questions waiting for someone else. */
  waitingOthers: number;
  /** Open decisions at each approval level, regardless of who is signed in. */
  approvalLevels: { role: "chef" | "approver"; count: number }[];
  requests: number;
}
export interface BasketPlan {
  id: string;
  title: string;
  status: Plan["status"];
  summary: string;
  createdAt: string;
  createdBy: string;
  totalExVat: number | null;
  orderIds: string[];
  tooLate: Plan["tooLate"];
  tooLateChoice: Plan["tooLateChoice"];
  basketedAt: string | null;
  lines: Plan["lines"];
}
export interface BasketResp extends EventResp, BasketStatus {
  requests: BasketPlan[];
  orders: Order[];
  review: Question | null;
}

// ---------- calls ----------

export const api = {
  status: () => get<StatusResp>("/api/status"),
  people: () => get<PeopleResp>("/api/people"),
  session: (personId: string) => post<{ person: Person }>("/api/session", { personId }),
  me: () => get<{ person: Person }>("/api/me"),
  home: () => get<HomeResp>("/api/home"),
  message: (text: string) => post<MessageResp>("/api/messages", { text }),
  prepareMessage: (text: string, signal: AbortSignal) => call<{ ok: boolean }>("POST", "/api/messages/prepare", { text }, signal),
  request: (request: SingleRequest, eventId?: string, reviewing = false, itemReview = false) => post<PlanResp>("/api/requests", { request, eventId, reviewing, itemReview }),
  baskets: () => get<{ baskets: Basket[] }>("/api/baskets"),
  basket: (id: string) => get<BasketResp>(`/api/baskets/${encodeURIComponent(id)}`),
  submitBasketForReview: (id: string) => post<{ review: Question }>(`/api/baskets/${encodeURIComponent(id)}/submit-review`),
  newBasket: (name: string, deliveryDate: string) => post<{ basket: { id: string; name: string; deliveryDate: string } }>("/api/baskets", { name, deliveryDate }),
  plan: (id: string) => get<PlanResp>(`/api/plans/${encodeURIComponent(id)}`),
  product: (id: string) => get<ProductDetails>(`/api/products/${encodeURIComponent(id)}`),
  reviewItems: (id: string) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/review-items`),
  requote: (id: string, request: SingleRequest) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/requote`, { request }),
  basketPlan: (id: string, continueWithWarnings = false) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/basket`, { continueWithWarnings }),
  approveItem: (id: string, needId: string, fingerprint: string) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/items/${encodeURIComponent(needId)}/approve`, { fingerprint }),
  itemSalesQuantity: (id: string, needId: string, fingerprint: string, productId: string, quantity: number) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/items/${encodeURIComponent(needId)}/quantity`, { fingerprint, productId, quantity }),
  accept: (id: string) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/accept`),
  tooLate: (id: string, choice: "remove" | "review") => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/too-late`, { choice }),
  choose: (id: string, needId: string, productId: string) => post<PlanResp>(`/api/plans/${encodeURIComponent(id)}/choose`, { needId, productId }),
  answer: (id: string, optionId: string, note?: string) => post<AnswerResp>(`/api/questions/${encodeURIComponent(id)}/answer`, { optionId, ...(note !== undefined ? { note } : {}) }),
  event: (id: string) => get<EventResp>(`/api/events/${encodeURIComponent(id)}`),
  menu: (id: string) => get<{ event: StoredEvent; scale: MenuScale }>(`/api/events/${encodeURIComponent(id)}/menu`),
  saveMenu: (id: string, body: MenuBody) => call<{ event: StoredEvent; scale: MenuScale }>("PUT", `/api/events/${encodeURIComponent(id)}/menu`, body),
  menuOrder: (id: string, version: number) => post<PlanResp & { scale: MenuScale }>(`/api/events/${encodeURIComponent(id)}/menu/order`, { version }),
  events: () => get<{ events: (StoredEvent & { coverage: Coverage })[] }>("/api/events"),
  viability: (id: string) => post<{ plan: Plan }>(`/api/events/${id}/viability`),
  orderEvent: (id: string) => post<{ plan: Plan }>(`/api/events/${id}/order`),
  finalCheck: (id: string) => post<{ finalCheck: FinalCheck }>(`/api/events/${id}/final-check`),
  cutoff: (id: string) => post<{ flags: unknown }>(`/api/events/${id}/cutoff`),
  removeNeed: (id: string, needId: string, version: number) => post<{ event: StoredEvent }>(`/api/events/${id}/remove-need`, { needId, version }),
  guests: (id: string, guests: number, version: number) => post<ChangeResp>(`/api/events/${id}/guests`, { guests, version }),
  dietGroup: (id: string, group: DietGroup, version: number) => post<ChangeResp>(`/api/events/${id}/diet-groups`, { group, version }),
  change: (id: string, body: { guests?: number; group?: DietGroup }, version: number) => post<ChangeResp & { held?: boolean }>(`/api/events/${id}/change`, { ...body, version }),
  drill: () => post<{ quote: { id: string; total: number; cap: number }; status: number; refusal: { error: string; message: string } }>(`/api/drill`, {}),
  orders: (eventId?: string) => get<OrdersResp>(`/api/orders${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`),
  audit: (viewer: "hotel" | "valio", eventId?: string) => get<AuditResp>(`/api/audit?viewer=${viewer}${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}`),
  rules: () => get<RulesResp>("/api/rules"),
  saveRules: (edit: RuleEdit) => put<RulesResp>("/api/rules", edit),
  resetRules: () => post<RulesResp>("/api/rules/reset"),
  clock: (scene: SceneKey | "live") => post<unknown>("/api/clock", { scene }),
  reset: () => post<{ ok: boolean }>("/api/reset"),
};
