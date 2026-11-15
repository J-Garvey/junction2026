/** Order baskets: one tile per event (name + delivery date); inside, what is ordered, what waits, and a box to add more. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Order, Plan, Question, SingleRequest, Unit } from "@aimo/contracts";
import { api, type BasketPlan, type MessageResp, type PlanResp } from "../api";
import { splitMine, useApp, useLoad, waitingForText } from "../ctx";
import { OthersWaiting, QuestionCard } from "../ui/QuestionCard";
import { Status, planStatusKind, PLAN_STATUS_TEXT } from "../ui/Status";
import { Icon } from "../ui/icons";
import { OrderItemDialog } from "../ui/OrderItemDialog";
import { stockText } from "../ui/Popover";
import { tooLateText } from "../ui/TooLate";
import { addDays, claimLabel, day, eur, helsinkiDate, plural, qty } from "../format";
import "./baskets.css";

const UNITS: Unit[] = ["l", "dl", "ml", "kg", "g", "pcs"];

export function BasketsHome() {
  const { me } = useApp();
  const { data, error, loading } = useLoad(() => api.baskets(), []);
  const baskets = [...(data?.baskets ?? [])].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  return (
    <div className="page orders-page stack-l">
      <h1>Orders</h1>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted small">Loading…</div>}
      <div className="bgrid">
        {baskets.map((b) => (
          <Link key={b.id} to={`/baskets/${b.id}`} className="btile">
            <div className="btile-name">{b.name}</div>
            <div className="btile-context small muted">
              <span><Icon n="cal" s={14} /> Delivery {day(b.deliveryDate)}</span>
              {b.guests > 0 && <span>{plural(b.guests, "guest")}</span>}
            </div>
            <div className="btile-stats" aria-label="Order summary">
              <div><strong>{b.lines}</strong><span>Items in order</span></div>
              <div><strong>{eur(b.totalExVat)}</strong><span>Total ex VAT</span></div>
            </div>
            <div className="btile-approvals" aria-label="Waiting for approval">
              {b.approvalLevels.map((level) => (
                <div key={level.role} className={level.role === me.role ? "current" : undefined}>
                  <span>{level.role === "chef" ? "Chef review" : "Manager approval"}</span>
                  <strong>{level.count}</strong>
                </div>
              ))}
            </div>
            <div className="btile-foot small muted">
              <span>{b.approvalLevels.reduce((sum, level) => sum + level.count, 0)} waiting for approval</span>
              <Icon n="chev" s={16} />
            </div>
          </Link>
        ))}
        <NewBasketTile />
      </div>
    </div>
  );
}

function NewBasketTile() {
  const nav = useNavigate();
  const { now, refresh } = useApp();
  const today = helsinkiDate(now);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(addDays(today, 7));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open)
    return (
      <button type="button" className="btile new" onClick={() => setOpen(true)}>
        <Icon n="plus" s={22} />
        <span>New order</span>
      </button>
    );

  async function create() {
    if (!name.trim() || !date) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.newBasket(name.trim(), date);
      refresh();
      nav(`/baskets/${r.basket.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form
      className="btile form"
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <label className="field">
        <span className="small muted">Event</span>
        <input autoFocus value={name} placeholder="e.g. Nokia sales kick-off" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="small muted">Delivery date</span>
        <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {err && <div className="callout red small">{err}</div>}
      <div className="row">
        <button type="submit" className="btn sm primary" disabled={busy || !name.trim() || !date}>
          {busy ? "…" : "Create"}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function BasketPage() {
  const { me, people } = useApp();
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api.basket(id!), [id]);

  if (error && !data) return <div className="callout red">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const { event: ev, questions, requests, orders } = data;
  const live = orders.filter((o) => o.state !== "rejected");
  const staged = requests.filter((r) => r.basketedAt && !r.orderIds.length);
  const { mine: waitingQs, others } = splitMine(questions.filter((q) => q.state === "open" || q.state === "waiting"), me, people);
  const pending = requests.filter((r) => !r.basketedAt && r.status !== "ordered" && !r.orderIds.length);
  const orderTotal = staged.some((p) => p.totalExVat == null || p.lines.some((line) => line.lineTotal == null))
    ? null
    : live.reduce((sum, order) => sum + order.totalExVat, 0) + staged.reduce((sum, plan) => sum + plan.totalExVat!, 0);

  return (
    <div className="page stack-l">
      <div className="bhead">
        <h1>{ev.name}</h1>
        <div className="row small" style={{ gap: 12, marginLeft: "auto", flexWrap: "wrap" }}>
          {ev.dishes.length > 0 && <Link to={`/events/${ev.id}`}>Menu and guests</Link>}
          <Link to={`/audit?eventId=${ev.id}`}>Audit log</Link>
        </div>
      </div>

      <AddToBasket eventId={ev.id} deliveryDate={ev.serviceDate} onAdded={reload} />

      <section>
        <div className="sechead">
          <h2>Decisions before processing</h2>
          {waitingQs.length > 0 && <span className="countb">{waitingQs.length}</span>}
        </div>
        {waitingQs.length ? (
          <div className="qlist">
            {waitingQs.map((q) => (
              <QuestionCard key={q.id} q={q} compact onAnswered={reload} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon n="check" s={18} /> Nothing waiting for you.
          </div>
        )}
        <OthersWaiting others={others} />
        {pending.length > 0 && (
          <div className="card" style={{ marginTop: 12 }}>
            {pending.map((r) => (
              <RequestRow key={r.id} r={r} question={questions.find((q) => q.planId === r.id && (q.state === "open" || q.state === "waiting"))} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="sechead">
          <h2>In the order</h2>
          {(live.length > 0 || staged.length > 0) && <span className="small muted">{eur(orderTotal)} ex VAT</span>}
        </div>
        <StagedLines plans={staged} />
        <OrderedLines orders={live} showEmpty={!staged.length} />
      </section>
    </div>
  );
}

function RequestRow({ r, question }: { r: BasketPlan; question?: Question }) {
  const { me, people } = useApp();
  const waitingLabel = question ? waitingForText(question, me, people) : undefined;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function showDetails() {
    setOpen(true);
    if (plan || loading) return;
    setLoading(true);
    setError(null);
    try {
      setPlan((await api.plan(r.id)).plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="li evrow item-dialog-trigger" onClick={showDetails}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="trunc" style={{ color: "var(--ink)", fontWeight: 600 }}>
            {r.title}
          </div>
          <div className="small muted">{r.tooLate ? tooLateText(r.tooLate) : r.summary}</div>
        </div>
        {/* Too late is something to review, not a hard block: no "Blocked" stamp. */}
        {r.tooLate ? <span className="stamp ask">Too late</span> : <Status k={planStatusKind(r.status)} title={waitingLabel ?? PLAN_STATUS_TEXT[r.status]} label={r.status === "waiting" ? waitingLabel : undefined} />}
      </button>
      {open && (
        <OrderItemDialog
          eyebrow="Awaiting approval"
          title={r.title}
          description={plan?.summary ?? r.summary}
          fields={[
            { label: "Status", value: PLAN_STATUS_TEXT[r.status] ?? r.status },
            { label: "Total ex VAT", value: eur(plan ? plan.totalExVat : r.totalExVat) },
            { label: "Delivery", value: plan?.deliveryDate ? day(plan.deliveryDate) : "Not confirmed" },
            ...(plan ? [{ label: "Requested by", value: plan.createdBy.name }] : []),
          ]}
          onClose={() => setOpen(false)}
        >
          {loading && <div className="muted">Loading item details…</div>}
          {error && <div className="callout red">{error}</div>}
          {plan && plan.lines.length > 0 && (
            <div className="item-dialog-section">
              <h3>Items in this request</h3>
              <div className="item-dialog-lines">
                {plan.lines.map((line) => (
                  <div key={line.id} className="item-dialog-line">
                    <span>
                      <b>{line.productName}</b>
                      <small>Product {line.productId ?? "not selected"}</small>
                    </span>
                    <span>{qty(line.quantity)} {line.salesUnit ?? ""}</span>
                    <b>{eur(line.lineTotal)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </OrderItemDialog>
      )}
    </>
  );
}

function StagedLines({ plans }: { plans: BasketPlan[] }) {
  const lines = plans.flatMap((plan) => plan.lines.map((line) => ({ ...line, planId: plan.id })));
  if (!lines.length) return null;
  return (
    <div className="card staged-lines">
      {lines.map((line) => (
        <div key={`${line.planId}-${line.id}`} className="li">
          <span className="bqty">{qty(line.quantity)} {line.salesUnit ?? ""}</span>
          <span className="trunc" style={{ flex: 1, color: "var(--ink)" }}>{line.productName}</span>
          <span className="stamp ask">Awaiting final order</span>
          <span className="small">{eur(line.lineTotal)}</span>
        </div>
      ))}
    </div>
  );
}

function OrderedLines({ orders, showEmpty = true }: { orders: Order[]; showEmpty?: boolean }) {
  const lines = orders.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => ({ ...l, orderId: o.id })));
  const [selected, setSelected] = useState<(typeof lines)[number] | null>(null);
  if (!lines.length) return showEmpty ? <div className="empty">Nothing ordered yet. Add something above.</div> : null;
  return (
    <>
      <div className="card">
        {lines.map((l) => (
          <button key={`${l.orderId}-${l.lineNo}`} type="button" className="li item-dialog-trigger" onClick={() => setSelected(l)}>
            <span className="bqty">
              {qty(l.quantity)} {l.salesUnit ?? ""}
            </span>
            <span className="trunc" style={{ flex: 1, color: "var(--ink)" }}>
              {l.productName}
            </span>
            {l.stock.kind === "unknown" && <Status k={l.riskAccepted ? "covered_at_risk" : "unknown_stock"} />}
            <span className="small">{eur(l.lineTotal)}</span>
          </button>
        ))}
        <div className="li small muted">
          <span style={{ flex: 1 }}>{plural(orders.length, "order")} placed with Valio Aimo</span>
          <Link to={`/orders?eventId=${orders[0].eventId}`}>Receipts</Link>
        </div>
      </div>
      {selected && (
        <OrderItemDialog
          eyebrow="In the order"
          title={selected.productName}
          description={selected.riskAccepted ? `Unconfirmed stock was accepted by ${selected.riskAccepted.by}.` : undefined}
          fields={[
            { label: "Quantity", value: `${qty(selected.quantity)} ${selected.salesUnit ?? ""}` },
            { label: "Unit price", value: eur(selected.unitPrice) },
            { label: "Line total", value: eur(selected.lineTotal) },
            { label: "Product ID", value: selected.productId },
            { label: "Stock", value: stockText(selected.stock) },
            { label: "Order", value: selected.orderId },
            { label: "Available date", value: selected.availableDate ? day(selected.availableDate) : "Not supplied" },
            { label: "Order cutoff", value: selected.closingTime ?? "Not supplied" },
            { label: "Price valid to", value: selected.priceValidTo ?? "Not supplied" },
          ]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

/** Search, interpret and check an item in one modal before staging it in the order. */
function AddToBasket({ eventId, deliveryDate, onAdded }: { eventId: string; deliveryDate: string; onAdded: () => void }) {
  const { refresh } = useApp();
  const [text, setText] = useState("");
  const [request, setRequest] = useState<SingleRequest | null>(null);
  const [review, setReview] = useState<PlanResp | null>(null);
  const [editTarget, setEditTarget] = useState<{ lineId: string; field: "quantity" | "description" } | null>(null);
  const [busy, setBusy] = useState<"search" | "check" | "replace" | "add" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [note, setNote] = useState<{ cls: string; body: React.ReactNode } | null>(null);

  async function search() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy("search");
    setNote(null);
    try {
      const parsed: MessageResp = await api.message(value);
      if (parsed.route === "event_change") {
        setNote({ cls: "blue", body: <>Guest changes are made on the <Link to={`/events/${eventId}`}>event page</Link>.</> });
        return;
      }
      if (parsed.route === "neither") {
        setNote({ cls: "blue", body: parsed.message });
        return;
      }
      const next = { ...parsed.request, neededBy: deliveryDate };
      setRequest(next);
      setReview(null);
      setEditTarget(null);
      setDialogError(null);
      setBusy("check");
      setReview(await api.request(next, eventId, true));
    } catch (e) {
      setDialogError((e as Error).message);
      if (!request) setNote({ cls: "red", body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const setLine = (i: number, patch: Partial<SingleRequest["lines"][number]>) =>
    request && setRequest({ ...request, lines: request.lines.map((line, j) => (j === i ? { ...line, ...patch } : line)) });
  const requestReady = !!request && request.lines.length > 0 && request.lines.every((line) => line.query.trim() && line.quantity && line.quantity.amount > 0);

  async function checkChanges() {
    if (!request || !requestReady) return;
    setBusy("check");
    setDialogError(null);
    try {
      setReview(review ? await api.requote(review.plan.id, request) : await api.request(request, eventId, true));
      setEditTarget(null);
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function choose(needId: string, productId: string) {
    if (!review) return;
    setBusy("replace");
    setDialogError(null);
    try {
      setReview(await api.choose(review.plan.id, needId, productId));
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!review) return;
    setBusy("add");
    setDialogError(null);
    try {
      await api.basketPlan(review.plan.id, !noIssues);
      setRequest(null);
      setReview(null);
      setText("");
      setNote({ cls: "green", body: <><b>Added to the order.</b> It will go to finance when the final order is submitted.</> });
      onAdded();
      refresh();
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const plan = review?.plan ?? null;
  const lateOptions = plan?.needs.flatMap((need) => (need.lateDeliveryOptions ?? []).map((candidate) => ({ need, candidate })))
    .sort((a, b) => a.candidate.availableDate!.localeCompare(b.candidate.availableDate!) || a.candidate.productId.localeCompare(b.candidate.productId))
    .slice(0, 2) ?? [];
  const notFoundRules = plan?.needs.flatMap((need) => need.rules).filter((rule) => rule.ruleId === "REQ-04" || rule.ruleId === "DIET-04") ?? [];
  const productNotFound = notFoundRules.some((rule) => rule.ruleId === "REQ-04");
  const noMatch = notFoundRules.length > 0;
  const tooLate = plan?.tooLate ?? null;
  const foundLines = plan?.lines.filter((line) => line.productId) ?? [];
  const issues = plan ? [...new Set([
    ...(plan.error ? [plan.error] : []),
    ...plan.inputRules.filter((rule) => rule.outcome !== "order").map((rule) => rule.message),
    ...plan.lines.flatMap((line) => line.rules.filter((rule) => rule.outcome !== "order" && rule.ruleId !== "REQ-04" && rule.ruleId !== "DIET-04" && rule.ruleId !== "DLV-06").map((rule) => rule.message)),
  ])] : [];
  const blockingRules = plan ? [...plan.inputRules, ...plan.lines.flatMap((line) => line.rules)]
    .filter((rule) => rule.outcome === "block" || !rule.overridable) : [];
  const selected = new Set(plan?.lines.map((line) => line.productId).filter(Boolean));
  const alternatives = plan?.needs.flatMap((need) => need.candidates
    .filter((candidate) => !selected.has(candidate.productId))
    .sort((a, b) => replacementScore(a, deliveryDate) - replacementScore(b, deliveryDate) || a.rank - b.rank)
    .slice(0, 2)
    .map((candidate) => ({ need, candidate }))) ?? [];
  const noIssues = !!plan?.proposal && issues.length === 0 && plan.lines.length > 0;
  const canAdd = !!plan?.proposal && plan.lines.length > 0 && !plan.error && !plan.tooLate && blockingRules.length === 0;

  return (
    <section className="composer-wrap">
      <form className="composer" onSubmit={(event) => { event.preventDefault(); search(); }}>
        <div className="txt">
          <textarea
            rows={1}
            value={text}
            placeholder="Add to this order, e.g. 40 l lactose-free milk"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                search();
              }
            }}
            aria-label="Add to this order"
          />
          <button type="submit" className={`send ${text.trim() ? "go" : ""}`} disabled={!!busy} aria-label="Search">
            {busy === "search" ? "…" : <Icon n="plus" s={18} w={2.2} />}
          </button>
        </div>
      </form>
      {note && <div className={`callout ${note.cls} small`}>{note.body}</div>}

      {request && (
        <OrderItemDialog
          eyebrow="Add to order"
          title="Review the item"
          description="Check what was understood and whether it can arrive with this order."
          onClose={() => { if (!busy) { setRequest(null); setReview(null); } }}
        >
          <div className="add-review-date"><Icon n="cal" s={18} /><span><small>Delivery date</small><b>{day(deliveryDate)}</b></span></div>

          <div className="item-dialog-section add-review-section">
            <div className="add-review-section-head">
              <h3>Interpreted request</h3>
            </div>
            {editTarget ? (
              <div className="add-review-editor">
                {request.lines.map((line, i) => (
                  <div key={line.id} className="chipline">
                    <label className="chip">
                      <span className="chip-k">Amount</span>
                      <input autoFocus={editTarget.lineId === line.id && editTarget.field === "quantity"} type="number" min={0} value={line.quantity?.amount ?? ""} onChange={(event) => setLine(i, { quantity: event.target.value === "" ? null : { amount: Number(event.target.value), unit: line.quantity?.unit ?? "l" } })} style={{ width: 80 }} />
                      <select value={line.quantity?.unit ?? "l"} onChange={(event) => setLine(i, { quantity: { amount: line.quantity?.amount ?? 0, unit: event.target.value as Unit } })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select>
                    </label>
                    <label className="chip"><span className="chip-k">Description</span><input autoFocus={editTarget.lineId === line.id && editTarget.field === "description"} value={line.query} onChange={(event) => setLine(i, { query: event.target.value })} /></label>
                    {line.constraints.claims.map((claim) => <span key={claim} className="chip on">{claimLabel(claim)}</span>)}
                  </div>
                ))}
                <button type="button" className="btn primary" disabled={!!busy || !requestReady} onClick={checkChanges}>{busy === "check" ? "Checking…" : "Check changes"}</button>
              </div>
            ) : (
              <div className="add-review-interpreted">
                {request.lines.map((line) => (
                  <div key={line.id}>
                    <button type="button" className="add-review-edit-value" disabled={!!busy} onClick={() => setEditTarget({ lineId: line.id, field: "quantity" })} aria-label={`Edit quantity for ${line.query}`}>
                      <small>Quantity</small>
                      <b>{line.quantity ? `${qty(line.quantity.amount)} ${line.quantity.unit}` : "Amount needed"}</b>
                    </button>
                    <button type="button" className="add-review-edit-value" disabled={!!busy} onClick={() => setEditTarget({ lineId: line.id, field: "description" })} aria-label={`Edit description for ${line.query}`}>
                      <small>Description</small>
                      <span>{line.constraints.claims.map(claimLabel).concat(line.query).join(" ")}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {busy === "check" && !plan && <div className="add-review-loading">Checking products, stock and delivery…</div>}
          {dialogError && <div className="callout red" role="alert">{dialogError}</div>}

          {plan && !editTarget && (
            <>
              {foundLines.length > 0 && (
                <div className="item-dialog-section add-review-section">
                  <h3>Products found</h3>
                  <div className="item-dialog-lines">
                    {foundLines.map((line) => (
                    <div key={line.id} className="item-dialog-line add-review-product">
                      <span><b>{line.productName}</b><small>{line.packContent ? `${qty(line.packContent.value)} ${line.packContent.unit} per ${line.salesUnit ?? "sales unit"}` : `Product ${line.productId}`}</small></span>
                      <span>{qty(line.quantity)} {line.salesUnit ?? ""}</span>
                      <span><Status k={line.status} /></span>
                      <b>{eur(line.lineTotal)}</b>
                    </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={`callout ${noIssues ? "green" : "yellow"} add-review-result`} role={!noIssues ? "alert" : undefined}>
                <b>{noIssues ? "Ready to add" : productNotFound ? "Product not found" : noMatch ? "No matching product" : tooLate ? "Nothing available in time" : "Needs attention"}</b>
                {noIssues ? (
                  <span>Stock and delivery timing are confirmed for {day(deliveryDate)}.</span>
                ) : productNotFound ? (
                  <span>That product is not in the Valio Aimo catalogue. Refine the product search and try again.</span>
                ) : noMatch ? (
                  <span>No product matched this search and its requirements. Refine the product or requirements and try again.</span>
                ) : tooLate ? (
                  <span>Nothing can arrive by {day(tooLate.neededBy)}. {tooLate.earliest ? <>The earliest available delivery is <b>{day(tooLate.earliest)}</b>.</> : "No later delivery date is known yet."}</span>
                ) : issues.length ? (
                  <><ul>{issues.map((message) => <li key={message}>{message}</li>)}</ul>{canAdd && <span>You can approve a replacement below, or add this item with the warning.</span>}</>
                ) : (
                  <span>{plan.summary}</span>
                )}
                {(noMatch || tooLate) && request.lines[0] && (
                  <button type="button" className="btn sm" disabled={!!busy} onClick={() => setEditTarget({ lineId: request.lines[0].id, field: "description" })}>Refine search</button>
                )}
              </div>

              {tooLate && lateOptions.length > 0 && (
                <div className="item-dialog-section add-review-section">
                  <h3>Available after your delivery date</h3>
                  <div className="replacement-list">
                    {lateOptions.map(({ need, candidate }) => (
                      <div key={`${need.id}:${candidate.productId}`} className="replacement-row late-delivery-row">
                        <span>
                          <b>{candidate.name}</b>
                          <small>{qty(candidate.quantity)} {candidate.salesUnit ?? "sales units"} · covers {qty(need.amount.value)} {need.amount.unit}{candidate.source === "fixture" ? " · Fixture" : ""}</small>
                          {candidate.deliveryEstimated && <small>Cutoff passed · delivery and stock need rechecking.</small>}
                        </span>
                        <span className="late-delivery-date"><b>{candidate.deliveryEstimated ? "Estimated delivery" : "Delivery"} {day(candidate.availableDate!)}</b><small>After requested {day(tooLate.neededBy)}</small></span>
                        <span>{eur(candidate.unitPrice === null ? null : candidate.unitPrice * candidate.quantity)}<small>ex VAT</small></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!tooLate && !noIssues && alternatives.length > 0 && (
                <div className="item-dialog-section add-review-section">
                  <h3>Suggested replacements</h3>
                  <div className="replacement-list">
                    {alternatives.map(({ need, candidate }) => {
                      const usable = !!plan.proposal && replacementScore(candidate, deliveryDate) === 0;
                      return (
                        <div key={`${need.id}:${candidate.productId}`} className="replacement-row">
                          <span><b>{candidate.name}</b><small>{stockText(candidate.stock, candidate.salesUnit)} · {candidate.availableDate ? `delivery ${day(candidate.availableDate)}` : "delivery date not supplied"}</small></span>
                          <span>{eur(candidate.unitPrice)}</span>
                          {usable && <button type="button" className="btn sm" disabled={!!busy} onClick={() => choose(need.id, candidate.productId)}>{busy === "replace" ? "Checking…" : "Approve replacement"}</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="add-review-actions">
                {canAdd && <button type="button" className="btn primary" disabled={!!busy} onClick={add}>{busy === "add" ? "Adding…" : noIssues ? "Add to order" : "Add to order anyway"}</button>}
                <button type="button" className="btn ghost" disabled={!!busy} onClick={() => { setRequest(null); setReview(null); }}>Cancel</button>
                <span className="add-review-total"><small>Total ex VAT</small><b>{eur(plan.totalExVat)}</b></span>
              </div>
            </>
          )}
        </OrderItemDialog>
      )}
    </section>
  );
}

function replacementScore(candidate: Plan["needs"][number]["candidates"][number], deliveryDate: string) {
  if (candidate.stock.kind === "known" && candidate.stock.amount > 0 && (!candidate.availableDate || candidate.availableDate <= deliveryDate)) return 0;
  return candidate.stock.kind === "unknown" ? 1 : 2;
}
