/** Order baskets: one tile per event (name + delivery date); inside, what is ordered, what waits, and a box to add more. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Order, Question } from "@aimo/contracts";
import { api, type BasketPlan, type MessageResp, type PlanResp } from "../api";
import { splitMine, useApp, useLoad, waitingForText } from "../ctx";
import { OthersWaiting, QuestionCard } from "../ui/QuestionCard";
import { Status, planStatusKind, PLAN_STATUS_TEXT } from "../ui/Status";
import { Icon } from "../ui/icons";
import { OrderItemDialog } from "../ui/OrderItemDialog";
import { RequestReviewDialog } from "../ui/RequestReviewDialog";
import { BasketCard } from "../ui/BasketCard";
import { OrderBy } from "../ui/OrderBy";
import { OrderReviewHistory } from "../ui/OrderReviewHistory";
import { stockText } from "../ui/Popover";
import { tooLateText } from "../ui/TooLate";
import { addDays, day, eur, helsinkiDate, plural, qty, when } from "../format";
import "./baskets.css";
import { useMessagePreparation } from "../useMessagePreparation";


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
        {baskets.map((b) => <BasketCard key={b.id} basket={b} role={me.role} />)}
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
  const [reviewFeedback, setReviewFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const [requestNote, setRequestNote] = useState<string | null>(null);

  async function submitForReview() {
    setSubmitting(true);
    setSubmitError(null);
    setReviewFeedback(null);
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
  const latestReview = questions.find((q) => q.type === "order_review");
  const returned = latestReview?.state === "answered" && latestReview.answer === "reject" ? latestReview : null;
  const live = orders.filter((o) => o.state !== "rejected");
  const staged = requests.filter((r) => r.basketedAt && !r.orderIds.length);
  const { mine: waitingQs, others } = splitMine(questions.filter((q) => q.state === "open" || q.state === "waiting"), me, people);
  const pending = requests.filter((r) => !r.basketedAt && r.status !== "ordered" && r.status !== "rejected" && !r.orderIds.length);
  const orderTotal = staged.some((p) => p.totalExVat == null || p.lines.some((line) => line.lineTotal == null))
    ? null
    : live.reduce((sum, order) => sum + order.totalExVat, 0) + staged.reduce((sum, plan) => sum + plan.totalExVat!, 0);

  return (
    <div className="page stack-l">
      <div className={`bhead${data.confirmed ? " confirmed" : ""}`}>
        <h1>{ev.name}</h1>
        {data.confirmed && <span className="stamp order"><Icon n="check" s={14} /> Confirmed</span>}
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
      <div className="basket-context small muted">Delivery {day(ev.serviceDate)}<OrderBy deadline={data.orderBy} detail /></div>

      {submitError && <div className="callout red" role="alert">{submitError}</div>}
      {reviewFeedback && <div className={`callout ${reviewFeedback.error ? "red" : "green"} small`} role={reviewFeedback.error ? "alert" : "status"}>{reviewFeedback.message}</div>}
      {returned && <div className="callout yellow small" role="status"><strong>Changes requested</strong><p className="decision-note">{returned.answerNote ?? "Returned to the order builder for changes."}</p><span className="muted">{returned.answeredBy?.name} · {when(returned.answeredAt)}</span></div>}
      {requestNote && <div className="callout green small" role="status">{requestNote}</div>}
      {me.role === "chef" && review && <div className="callout green small" role="status">Submitted to finance. This order is ready for approval.</div>}

      <AddToBasket eventId={ev.id} deliveryDate={ev.serviceDate} onAdded={reload} />

      {(waitingQs.length > 0 || others.length > 0 || pending.length > 0) && (
        <section>
          <div className="sechead">
            <h2>Decisions before processing</h2>
          </div>
          {waitingQs.length > 0 && (
            <div className="qlist">
              {waitingQs.map((q) => (
                <QuestionCard key={q.id} q={q} compact orderContext onAnswered={(answered, error) => {
                  setReviewFeedback(error ? { message: error, error: true } : { message: answered.answer === "reject" ? "Refusal note sent to the order builder." : "Decision recorded.", error: false });
                  refresh();
                  reload();
                }} />
              ))}
            </div>
          )}
          <OthersWaiting others={others} />
          {pending.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              {pending.map((r) => (
                <RequestRow key={r.id} r={r} onChanged={reload} onAdded={() => { setRequestNote("Added to the order. Submit the final order for finance review."); reload(); }} question={questions.find((q) => q.planId === r.id && (q.state === "open" || q.state === "waiting"))} />
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
      <OrderReviewHistory questions={questions} />
    </div>
  );
}

function RequestRow({ r, question, onChanged, onAdded }: { r: BasketPlan; question?: Question; onChanged: () => void; onAdded: () => void }) {
  const { me, people } = useApp();
  const waitingLabel = question ? waitingForText(question, me, people) : undefined;
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="li evrow item-dialog-trigger" onClick={() => setOpen(true)}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="trunc" style={{ color: "var(--ink)", fontWeight: 600 }}>{r.title}</div>
        <div className="small muted">{r.tooLate ? tooLateText(r.tooLate) : r.summary}</div>
      </div>
      {r.tooLate ? <span className="stamp ask">Too late</span> : <Status k={planStatusKind(r.status)} title={waitingLabel ?? PLAN_STATUS_TEXT[r.status]} label={r.status === "waiting" ? waitingLabel : undefined} />}
    </button>
    {open && <SavedRequestDetails id={r.id} title={r.title} onClose={() => setOpen(false)} onChanged={onChanged} onAdded={() => { setOpen(false); onAdded(); }} />}
  </>;
}

function SavedRequestDetails({ id, title, onClose, onChanged, onAdded }: { id: string; title: string; onClose: () => void; onChanged: () => void; onAdded: () => void }) {
  const { data, error, loading, reload } = useLoad(() => api.plan(id), [id]);
  if (!data?.plan.request || !data.plan.eventId) return <OrderItemDialog eyebrow="Request details" title={title} onClose={onClose}>
    {loading && <div className="muted" role="status">Loading item details...</div>}
    {error && <div className="callout red" role="alert">{error}<button type="button" className="btn sm" onClick={reload}>Try again</button></div>}
  </OrderItemDialog>;
  return <RequestReviewDialog initialReview={data} deliveryDate={data.plan.neededBy ?? ""} onClose={onClose} onChanged={onChanged} onAdded={onAdded} />;
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

/** Search and check a new request, then use the shared saved-request review. */
function AddToBasket({ eventId, deliveryDate, onAdded }: { eventId: string; deliveryDate: string; onAdded: () => void }) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<PlanResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ cls: string; body: React.ReactNode } | null>(null);
  useMessagePreparation(busy || review ? "" : text);

  async function search() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const parsed: MessageResp = await api.message(text.trim());
      if (parsed.route === "event_change") {
        setNote({ cls: "blue", body: <>Guest changes are made on the <Link to={`/events/${eventId}`}>event page</Link>.</> });
      } else if (parsed.route === "neither") {
        setNote({ cls: "blue", body: parsed.message });
      } else {
        setReview(await api.request({ ...parsed.request, neededBy: deliveryDate }, eventId, true, true));
      }
    } catch (e) {
      setNote({ cls: "red", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="composer-wrap">
      <form className="composer" onSubmit={(event) => { event.preventDefault(); search(); }}>
        <div className="txt">
          <textarea
            rows={1}
            value={text}
            maxLength={2000}
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
          <button type="submit" className={`send ${text.trim() ? "go" : ""}`} disabled={busy} aria-label="Search">
            {busy ? "..." : <Icon n="plus" s={18} w={2.2} />}
          </button>
        </div>
      </form>
      {busy && <div className="small muted" role="status">Checking products, stock and delivery...</div>}
      {note && <div className={`callout ${note.cls} small`} role="status">{note.body}</div>}
      {review && <RequestReviewDialog initialReview={review} deliveryDate={deliveryDate} onClose={() => setReview(null)} onChanged={onAdded} onAdded={() => {
        setReview(null);
        setText("");
        setNote({ cls: "green", body: <><b>Added to the order.</b> Submit the final order for finance review.</> });
        onAdded();
      }} />}
    </section>
  );
}
