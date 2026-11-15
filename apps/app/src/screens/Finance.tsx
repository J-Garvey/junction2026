/** The manager's desk: decisions, committed spend and the hotel's purchasing rules. */
import { Link } from "react-router";
import type { Question } from "@aimo/contracts";
import { api } from "../api";
import { canAnswer, useApp, useLoad } from "../ctx";
import { day, eur, parseTime, plural, when } from "../format";
import { BasketCard } from "../ui/BasketCard";
import { Icon } from "../ui/icons";
import "./baskets.css";
import "./finance.css";

const reviewTotal = (q: Question) => typeof q.facts.total === "number" && Number.isFinite(q.facts.total) ? q.facts.total : null;
const totalOf = (values: (number | null)[]) => values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
const deadlineTime = (q: Question) => parseTime(q.deadline)?.getTime() ?? Infinity;

export function FinanceHome() {
  const { me, people, now } = useApp();
  const { data, error, loading, reload } = useLoad(async () => {
    // Reading baskets retires stale reviews before the personal approval queue is read.
    const { baskets } = await api.baskets();
    const [home, receipts] = await Promise.all([api.home(), api.orders()]);
    return { baskets, questions: home.questions, orders: receipts.orders };
  }, [me.id]);
  const nowTime = parseTime(now)?.getTime() ?? Date.now();
  const decisions = (data?.questions ?? []).filter((q) => q.state === "open" && canAnswer(q, me, people) && deadlineTime(q) > nowTime)
    .sort((a, b) => deadlineTime(a) - deadlineTime(b) || a.createdAt.localeCompare(b.createdAt));
  const reviews = decisions.filter((q) => q.type === "order_review");
  const placed = (data?.orders ?? []).filter((order) => order.state !== "rejected");
  const baskets = [...(data?.baskets ?? [])].sort((a, b) => b.waiting - a.waiting || a.deliveryDate.localeCompare(b.deliveryDate));

  return (
    <div className="page orders-page stack-l">
      <div className="finance-heading">
        <div><h1>Approvals &amp; spend</h1><p className="muted">Review the kitchen's orders, approve spend and keep track of commitments.</p></div>
        <nav className="finance-links" aria-label="Finance tools">
          <Link to="/orders"><Icon n="box" s={16} /> Order receipts</Link>
          <Link to="/rules"><Icon n="shield" s={16} /> Hotel rules</Link>
          <Link to="/audit"><Icon n="list" s={16} /> Audit log</Link>
        </nav>
      </div>
      {error && <div className="callout red" role="alert">{error} <button type="button" className="btn sm" onClick={reload}>Try again</button></div>}
      {loading && !data && <div className="muted" role="status">Loading approvals and spend…</div>}
      {data && <>
        <dl className="finance-metrics" aria-label="Finance overview">
          <div className="finance-metric-accent"><dt>Decisions waiting for you</dt><dd>{decisions.length}<span>{plural(reviews.length, "final order review")}</span></dd></div>
          <div><dt>Submitted for your approval · ex VAT</dt><dd>{eur(totalOf(reviews.map(reviewTotal)))}<span>Final order review totals, including any already placed items</span></dd></div>
          <div><dt>Placed order spend · ex VAT</dt><dd>{eur(placed.reduce((sum, order) => sum + order.totalExVat, 0))}<span>{plural(placed.length, "supplier order")} · all recorded orders</span></dd></div>
        </dl>
        <section aria-labelledby="finance-decisions">
          <div className="sechead"><h2 id="finance-decisions">Needs your decision</h2>{decisions.length > 0 && <span className="countb">{decisions.length}</span>}</div>
          {decisions.length ? <div className="card finance-queue">
            {decisions.map((q) => {
              const basket = baskets.find((b) => b.id === q.eventId);
              return <article key={q.id} className="finance-review">
                <div className="finance-review-context">
                  <h3>{q.type === "order_review" ? basket?.name ?? q.title.replace(/^Review order: /, "") : q.title}</h3>
                  <span className="small muted">{basket && <>Delivery {day(basket.deliveryDate)} · </>}Submitted {when(q.createdAt)}</span>
                  {q.deadline && <span className="small">Review valid until <time dateTime={q.deadline}>{when(q.deadline)}</time> Helsinki</span>}
                </div>
                <div className="finance-review-action"><strong>{eur(reviewTotal(q))}<small>ex VAT</small></strong><Link className="btn primary" to={q.eventId ? `/baskets/${encodeURIComponent(q.eventId)}#question-${q.id}` : `/requests/${encodeURIComponent(q.planId)}`}>{q.type === "order_review" ? "Review order" : "Review decision"}<Icon n="chev" s={14} /></Link></div>
              </article>;
            })}
          </div> : <div className="empty"><Icon n="check" s={18} /> You're up to date. New approvals will appear here when the kitchen submits an order.</div>}
        </section>
        <section aria-labelledby="finance-orders">
          <div className="sechead"><h2 id="finance-orders">All event orders</h2><Link to="/orders" className="small">View receipts</Link></div>
          {baskets.length ? <div className="bgrid">{baskets.map((basket) => <BasketCard key={basket.id} basket={basket} role={me.role} />)}</div> : <div className="empty">No event orders yet. Orders created by the kitchen will appear here.</div>}
        </section>
      </>}
    </div>
  );
}

export function FinanceOrderSummary({ total, placed, pending, review }: { total: number | null; placed: number; pending: number | null; review: Question | null }) {
  const issues = Array.isArray(review?.facts.items) ? review.facts.items.filter((item): item is { text: string } => !!item && typeof item.text === "string") : [];
  // Submission gets a fresh quote; its signed-off amount can differ from the saved draft prices.
  const approvalTotal = review ? reviewTotal(review) : total;
  const awaitingPlacement = review ? approvalTotal === null ? null : approvalTotal - placed : pending;
  return <section className="stack" aria-label="Financial summary">
    <dl className="finance-metrics">
      <div className="finance-metric-accent"><dt>{review ? "Submitted order total" : "Current order total"} · ex VAT</dt><dd>{eur(approvalTotal)}</dd></div>
      <div><dt>Already placed · ex VAT</dt><dd>{eur(placed)}</dd></div>
      <div><dt>Awaiting placement · ex VAT</dt><dd>{eur(awaitingPlacement)}</dd></div>
    </dl>
    {review ? <div className="finance-submission">
      <h2>Submitted for approval</h2><p className="small">{review.body}</p>
      {issues.length > 0 && <><h3>Exceptions to review</h3><ul className="small">{issues.map((item, index) => <li key={index}>{item.text}</li>)}</ul></>}
    </div> : <p className="small muted">No final order approval is pending. The kitchen submits orders here when they are ready for review.</p>}
  </section>;
}
