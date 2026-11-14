/** Order baskets: one tile per event (name + delivery date); inside, what is ordered, what waits, and a box to add more. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Order, Plan, SingleRequest, Unit } from "@aimo/contracts";
import { api, type Basket, type BasketPlan, type MessageResp } from "../api";
import { splitMine, useApp, useLoad } from "../ctx";
import { OthersWaiting, QuestionCard } from "../ui/QuestionCard";
import { Status, planStatusKind, PLAN_STATUS_TEXT } from "../ui/Status";
import { Icon } from "../ui/icons";
import { TooLateDialog, tooLateText } from "../ui/TooLate";
import { addDays, claimLabel, day, eur, helsinkiDate, plural, qty } from "../format";
import "./baskets.css";

const UNITS: Unit[] = ["l", "dl", "ml", "kg", "g", "pcs"];

/** One word for a basket's state; the numbers follow it. */
function BasketState({ b }: { b: Basket }) {
  if (b.coverage.level === "warning") return <Status k="allergy_warning" />;
  if (b.waiting) return <span className="stamp ask">{b.waiting} for you</span>;
  if (b.waitingOthers) return <span className="stamp unknown">{b.waitingOthers} waiting for others</span>;
  if (b.lines) return <Status k="ordered" />;
  return <span className="stamp unknown">Empty</span>;
}

export function BasketsHome() {
  const { data, error, loading } = useLoad(() => api.baskets(), []);
  const baskets = [...(data?.baskets ?? [])].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  return (
    <div className="page stack-l">
      <h1>Orders</h1>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted small">Loading…</div>}
      <div className="bgrid">
        {baskets.map((b) => (
          <Link key={b.id} to={`/baskets/${b.id}`} className="btile">
            <div className="btile-top">
              <BasketState b={b} />
            </div>
            <div className="btile-name">{b.name}</div>
            <div className="small">
              <Icon n="cal" s={14} /> Delivery {day(b.deliveryDate)}
            </div>
            <div className="btile-foot small muted">
              <span>{b.lines ? `${plural(b.lines, "line")} · ${eur(b.totalExVat)}` : "Nothing ordered yet"}</span>
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
  const { mine: waitingQs, others } = splitMine(questions.filter((q) => q.state === "open" || q.state === "waiting"), me, people);
  const pending = requests.filter((r) => r.status !== "ordered" && !r.orderIds.length);

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
          <h2>Awaiting your approval</h2>
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
              <RequestRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="sechead">
          <h2>In the order</h2>
          {live.length > 0 && <span className="small muted">{eur(live.reduce((n, o) => n + o.totalExVat, 0))} ex VAT</span>}
        </div>
        <OrderedLines orders={live} />
      </section>
    </div>
  );
}

function RequestRow({ r }: { r: BasketPlan }) {
  return (
    <Link to={`/requests/${r.id}`} className="li evrow">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="trunc" style={{ color: "var(--ink)", fontWeight: 600 }}>
          {r.title}
        </div>
        <div className="small muted">{r.tooLate ? tooLateText(r.tooLate) : r.summary}</div>
      </div>
      {/* Too late is something to review, not a hard block: no "Blocked" stamp. */}
      {r.tooLate ? <span className="stamp ask">Too late</span> : <Status k={planStatusKind(r.status)} title={PLAN_STATUS_TEXT[r.status]} />}
    </Link>
  );
}

function OrderedLines({ orders }: { orders: Order[] }) {
  const lines = orders.flatMap((o) => o.lines.filter((l) => !l.removed).map((l) => ({ ...l, orderId: o.id })));
  if (!lines.length) return <div className="empty">Nothing ordered yet. Add something above.</div>;
  return (
    <div className="card">
      {lines.map((l) => (
        <div key={`${l.orderId}-${l.lineNo}`} className="li">
          <span className="bqty">
            {qty(l.quantity)} {l.salesUnit ?? ""}
          </span>
          <span className="trunc" style={{ flex: 1, color: "var(--ink)" }}>
            {l.productName}
          </span>
          {l.stock.kind === "unknown" && <Status k={l.riskAccepted ? "covered_at_risk" : "unknown_stock"} />}
          <span className="small">{eur(l.lineTotal)}</span>
        </div>
      ))}
      <div className="li small muted">
        <span style={{ flex: 1 }}>{plural(orders.length, "order")} placed with Valio Aimo</span>
        <Link to={`/orders?eventId=${orders[0].eventId}`}>Receipts</Link>
      </div>
    </div>
  );
}

/** Type what to add; the parsed lines are confirmed, then quoted for this order's delivery date. */
function AddToBasket({ eventId, deliveryDate, onAdded }: { eventId: string; deliveryDate: string; onAdded: () => void }) {
  const { refresh } = useApp();
  const [text, setText] = useState("");
  const [req, setReq] = useState<SingleRequest | null>(null);
  const [note, setNote] = useState<{ cls: string; body: React.ReactNode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [late, setLate] = useState<Plan | null>(null);

  async function parse() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setNote(null);
    try {
      const r: MessageResp = await api.message(t);
      if (r.route === "new_request" || r.route === "new_request_unsure") setReq({ ...r.request, neededBy: deliveryDate });
      else if (r.route === "event_change") setNote({ cls: "blue", body: <>Guest changes are made on the <Link to={`/events/${eventId}`}>event page</Link>.</> });
      else if (r.route === "neither") setNote({ cls: "blue", body: r.message });
    } catch (e) {
      setNote({ cls: "red", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!req) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await api.request(req, eventId);
      const p = r.plan;
      setReq(null);
      setText("");
      if (p.tooLate) {
        setLate(p);
        return;
      }
      setNote({
        cls: p.status === "ordered" ? "green" : p.status === "blocked" || p.status === "failed" || p.status === "rejected" ? "red" : "yellow",
        body: (
          <>
            <b>{PLAN_STATUS_TEXT[p.status] ?? p.status}.</b> {p.summary} <Link to={`/requests/${p.id}`}>Details</Link>
          </>
        ),
      });
      onAdded();
      refresh();
    } catch (e) {
      setNote({ cls: "red", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const setLine = (i: number, patch: Partial<SingleRequest["lines"][number]>) => req && setReq({ ...req, lines: req.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const ready = !!req && req.lines.length > 0 && req.lines.every((l) => l.query.trim() && l.quantity && l.quantity.amount > 0);

  return (
    <section className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          parse();
        }}
      >
        <div className="txt">
          <textarea
            rows={1}
            value={text}
            placeholder="Add to this order, e.g. 40 l lactose-free milk"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                parse();
              }
            }}
            aria-label="Add to this order"
          />
          <button type="submit" className={`send ${text.trim() ? "go" : ""}`} disabled={busy} aria-label="Add">
            {busy && !req ? "…" : <Icon n="plus" s={18} w={2.2} />}
          </button>
        </div>
      </form>
      {req && (
        <div className="card pad stack">
          {req.lines.map((l, i) => (
            <div key={l.id} className="chipline">
              <label className="chip">
                <span className="chip-k">Quantity</span>
                <input
                  type="number"
                  min={0}
                  value={l.quantity?.amount ?? ""}
                  onChange={(e) => setLine(i, { quantity: e.target.value === "" ? null : { amount: Number(e.target.value), unit: l.quantity?.unit ?? "l" } })}
                  style={{ width: 80 }}
                />
                <select value={l.quantity?.unit ?? "l"} onChange={(e) => setLine(i, { quantity: { amount: l.quantity?.amount ?? 0, unit: e.target.value as Unit } })}>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label className="chip">
                <span className="chip-k">Product</span>
                <input value={l.query} onChange={(e) => setLine(i, { query: e.target.value })} style={{ width: 140 }} />
              </label>
              {l.constraints.claims.map((c) => (
                <span key={c} className="chip on">
                  {claimLabel(c)}
                </span>
              ))}
            </div>
          ))}
          <div className="small muted">
            <Icon n="cal" s={14} /> Delivered with this order on {day(deliveryDate)}
          </div>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy || !ready} onClick={add}>
              {busy ? "Quoting…" : "Add to order"}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setReq(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {note && <div className={`callout ${note.cls} small`}>{note.body}</div>}
      {late && (
        <TooLateDialog
          plan={late}
          onDone={(choice) => {
            setNote(choice === "remove" ? { cls: "blue", body: <>Removed {late.title} from the quote.</> } : { cls: "yellow", body: <>{late.title} is waiting for review below. Nothing is ordered yet.</> });
            setLate(null);
            onAdded();
            refresh();
          }}
        />
      )}
    </section>
  );
}
