/** Order baskets: one tile per event (name + delivery date); inside, what is ordered, what waits, and a box to add more. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Order, Plan, Question, SingleRequest, Unit } from "@aimo/contracts";
import { api, ApiError, type BasketPlan, type MessageResp, type PlanResp } from "../api";
import { splitMine, useApp, useLoad, waitingForText } from "../ctx";
import { OthersWaiting, QuestionCard } from "../ui/QuestionCard";
import { Status, planStatusKind, PLAN_STATUS_TEXT } from "../ui/Status";
import { Icon } from "../ui/icons";
import { OrderItemDialog } from "../ui/OrderItemDialog";
import { ProductReviewItem } from "../ui/ProductReviewItem";
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
  const { me, people, refresh } = useApp();
  const { id } = useParams();
  const { data, error, reload } = useLoad(() => api.basket(id!), [id]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function submitForReview() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.submitBasketForReview(id!);
      refresh();
      reload();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !data) return <div className="callout red">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const { event: ev, questions, requests, orders, review } = data;
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
          <button
            type="button"
            className="btn primary"
            disabled={submitting || !!review || (!staged.length && !live.some((o) => !o.approvalId))}
            onClick={submitForReview}
          >
            <Icon n={review ? "check" : "send"} s={16} />
            {submitting ? "Submitting…" : review ? "Submitted for review" : "Submit order for review"}
          </button>
        </div>
      </div>

      {submitError && <div className="callout red" role="alert">{submitError}</div>}
      {review && <div className="callout green small" role="status">Submitted to finance. This order is ready for approval.</div>}

      <AddToBasket eventId={ev.id} deliveryDate={ev.serviceDate} onAdded={reload} />

      {(waitingQs.length > 0 || others.length > 0 || pending.length > 0) && (
        <section>
          <div className="sechead">
            <h2>Decisions before processing</h2>
            {waitingQs.length > 0 && <span className="countb">{waitingQs.length}</span>}
          </div>
          {waitingQs.length > 0 && (
            <div className="qlist">
              {waitingQs.map((q) => (
                <QuestionCard key={q.id} q={q} compact onAnswered={reload} />
              ))}
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
      )}

      <section>
        <div className="sechead">
          <h2>In the order</h2>
          {(live.length > 0 || staged.length > 0) && <span className="small muted">{eur(orderTotal)} ex VAT</span>}
        </div>
        <StagedLines plans={staged} submitted={!!review} />
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

function StagedLines({ plans, submitted }: { plans: BasketPlan[]; submitted: boolean }) {
  const lines = plans.flatMap((plan) => plan.lines.map((line) => ({ ...line, planId: plan.id })));
  if (!lines.length) return null;
  return (
    <div className="card staged-lines">
      {lines.map((line) => (
        <div key={`${line.planId}-${line.id}`} className="li">
          <span className="bqty">{qty(line.quantity)} {line.salesUnit ?? ""}</span>
          <span className="trunc" style={{ flex: 1, color: "var(--ink)" }}>{line.productName}</span>
          <span className="stamp ask">{submitted ? "Awaiting finance approval" : "Awaiting final order"}</span>
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
  const [editTarget, setEditTarget] = useState<{ lineId: string; field: "quantity" | "description"; amount: string; unit: Unit; description: string } | null>(null);
  const [busy, setBusy] = useState<"search" | "check" | "replace" | "remove" | "approve" | "quantity" | "add" | null>(null);
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
      setReview(await api.request(next, eventId, true, true));
    } catch (e) {
      setDialogError((e as Error).message);
      if (!request) setNote({ cls: "red", body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  function edit(line: SingleRequest["lines"][number], field: "quantity" | "description") {
    setDialogError(null);
    setEditTarget({ lineId: line.id, field, amount: String(line.quantity?.amount ?? ""), unit: line.quantity?.unit ?? "pcs", description: line.query });
  }
  const editReady = !!editTarget?.description.trim() && Number.isFinite(Number(editTarget.amount)) && Number(editTarget.amount) > 0;

  async function recheck(next: SingleRequest) {
    const result = review ? await api.requote(review.plan.id, next) : await api.request(next, eventId, true, true);
    setRequest(next);
    setReview(result);
    setEditTarget(null);
  }

  async function checkChanges() {
    if (!request || !editTarget || !editReady || busy) return;
    setBusy("check");
    setDialogError(null);
    try {
      const original = request.lines.find((line) => line.id === editTarget.lineId)!;
      let updated = { ...original, quantity: { amount: Number(editTarget.amount), unit: editTarget.unit } };
      if (editTarget.description.trim() !== original.query) {
        const parsed = await api.message(`${editTarget.amount} ${editTarget.unit} ${editTarget.description.trim()}`);
        if (parsed.route === "event_change" || parsed.route === "neither" || parsed.request.lines.length !== 1) {
          throw new Error("Describe one product for this row, then check it again.");
        }
        const line = parsed.request.lines[0];
        updated = { ...line, id: original.id, quantity: updated.quantity, constraints: {
          claims: [...new Set([...original.constraints.claims, ...line.constraints.claims])],
          avoidAllergens: [...new Set([...original.constraints.avoidAllergens, ...line.constraints.avoidAllergens])],
          labels: [...new Set([...original.constraints.labels, ...line.constraints.labels])],
        } };
      }
      await recheck({ ...request, lines: request.lines.map((line) => line.id === original.id ? updated : line) });
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function discard(lineId: string) {
    if (!request || busy) return;
    const lines = request.lines.filter((line) => line.id !== lineId);
    if (!lines.length) {
      setRequest(null);
      setReview(null);
      setEditTarget(null);
      setText("");
      setNote({ cls: "blue", body: "Item discarded. No products were added to the order." });
      return;
    }
    setBusy("remove");
    setDialogError(null);
    try {
      await recheck({ ...request, lines });
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
      await api.basketPlan(review.plan.id);
      setRequest(null);
      setReview(null);
      setText("");
      setNote({ cls: "green", body: <><b>Added to the order.</b> It will go to finance when the final order is submitted.</> });
      onAdded();
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.body?.plan) setReview({ plan: e.body.plan, questions: [] });
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resolveItem(needId: string, salesQuantity?: { productId: string; quantity: number }) {
    const item = review?.plan.itemReviews?.find((item) => item.needId === needId);
    if (!review || !item || busy) return;
    setBusy(salesQuantity ? "quantity" : "approve");
    setDialogError(null);
    try {
      setReview(salesQuantity
        ? await api.itemSalesQuantity(review.plan.id, needId, item.fingerprint, salesQuantity.productId, salesQuantity.quantity)
        : await api.approveItem(review.plan.id, needId, item.fingerprint));
    } catch (e) {
      if (e instanceof ApiError && e.body?.plan) setReview({ plan: e.body.plan, questions: [] });
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const plan = review?.plan ?? null;
  const approvedCount = plan?.itemReviews?.filter((item) => item.approvedAt && item.canApprove).length ?? 0;
  const canAdd = !!plan?.proposal && !!request?.lines.length && approvedCount === request.lines.length && !plan.error && !plan.tooLate;

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
          title={request.lines.length === 1 ? "Review the item" : "Review the order"}
          description="Check what was understood and whether it can arrive with this order."
          onClose={() => { if (!busy) { setRequest(null); setReview(null); } }}
        >
          <div className="add-review-date"><Icon n="cal" s={18} /><span><small>Delivery date</small><b>{day(deliveryDate)}</b></span></div>

          <div className="item-dialog-section add-review-section">
            <h3>Products</h3>
            <div className="add-review-items">
              {request.lines.map((line) => (
                <ProductReviewItem
                  key={line.id}
                  line={line}
                  need={plan?.needs.find((need) => need.id === line.id)}
                  lines={plan?.lines.filter((product) => product.needIds.includes(line.id) && !product.removed) ?? []}
                  deliveryDate={deliveryDate}
                  checked={!!plan}
                  disabled={!!busy || !!editTarget}
                  review={plan?.itemReviews?.find((item) => item.needId === line.id)}
                  onApprove={() => resolveItem(line.id)}
                  onSalesQuantity={(productId, quantity) => resolveItem(line.id, { productId, quantity })}
                  onEdit={(field) => edit(line, field)}
                  onDiscard={() => discard(line.id)}
                  onChoose={(productId) => choose(line.id, productId)}
                >
                  {editTarget?.lineId === line.id && (
                    <form className="add-review-editor" onSubmit={(event) => { event.preventDefault(); checkChanges(); }}>
                      <div className="add-review-edit-fields">
                        <label className="field"><span className="small muted">Quantity</span><input autoFocus={editTarget.field === "quantity"} aria-label={`Quantity for ${line.query}`} type="number" min="0" step="any" disabled={!!busy} value={editTarget.amount} onChange={(event) => setEditTarget({ ...editTarget, amount: event.target.value })} /></label>
                        <label className="field"><span className="small muted">Unit</span><select aria-label={`Unit for ${line.query}`} disabled={!!busy} value={editTarget.unit} onChange={(event) => setEditTarget({ ...editTarget, unit: event.target.value as Unit })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                        <label className="field"><span className="small muted">Description</span><input autoFocus={editTarget.field === "description"} aria-label={`Description for ${line.query}`} disabled={!!busy} value={editTarget.description} onChange={(event) => setEditTarget({ ...editTarget, description: event.target.value })} /></label>
                      </div>
                      {line.constraints.claims.length > 0 && <div className="small muted">Requirements: {line.constraints.claims.map(claimLabel).join(", ")}</div>}
                      <div className="row">
                        <button type="submit" className="btn sm primary" disabled={!!busy || !editReady}>{busy === "check" ? "Checking…" : "Check item"}</button>
                        <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => { setEditTarget(null); setDialogError(null); }}>Cancel edit</button>
                      </div>
                    </form>
                  )}
                </ProductReviewItem>
              ))}
            </div>
          </div>

          {busy === "check" && !plan && <div className="add-review-loading">Checking products, stock and delivery…</div>}
          {dialogError && <div className="callout red" role="alert">{dialogError}</div>}

          {plan && !editTarget && (
            <>
              <div className={`callout ${canAdd ? "green" : "yellow"} add-review-result`} role="status">
                <b>{canAdd ? "All items resolved" : `${approvedCount} of ${request.lines.length} items approved`}</b>
                <span>{canAdd ? "Ready to add to the order. Any unconfirmed stock remains labelled; finance reviews the final order." : "Approve each item, or refine or discard anything that cannot be approved, to continue."}</span>
                {plan.error && <span>{plan.error}</span>}
                {plan.inputRules.length > 0 && <ul>{plan.inputRules.filter((rule) => rule.outcome !== "order").map((rule) => <li key={rule.ruleId}>{rule.message}</li>)}</ul>}
              </div>

              <div className="add-review-actions">
                <button type="button" className="btn primary" disabled={!!busy || !canAdd} onClick={add}>{busy === "add" ? "Adding…" : "Add to order"}</button>
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
