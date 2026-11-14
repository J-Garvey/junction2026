/** UI-04: the parsed request as editable chips, then the plan: candidates, lines, questions, outcome. */
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import type { Plan, Question, SingleLine, SingleRequest, Unit } from "@aimo/contracts";
import { api, type MessageResp, type PlanResp } from "../api";
import { useApp, useLoad } from "../ctx";
import { Composer } from "./Home";
import { Candidates, LinesList, MoneyView, CutoffBoard, Section, shortfallText } from "../ui/PlanView";
import { stockText } from "../ui/Popover";
import { QuestionCard } from "../ui/QuestionCard";
import { Status, planStatusKind, PLAN_STATUS_TEXT, Fixture } from "../ui/Status";
import { claimLabel, day, eur, qty, when, helsinkiDate, addDays, ROLE_LABEL } from "../format";

const UNITS: Unit[] = ["l", "dl", "ml", "kg", "g", "pcs"];
const CLAIMS = ["FREE_FROM_LACTOSE", "FREE_FROM_GLUTEN", "FREE_FROM_MILK", "FREE_FROM_EGG"];
/** Needed-by shortcuts, counted from the simulated today. One week is the default. */
const DATE_PRESETS = [
  { id: "1d", label: "Tomorrow", days: 1 },
  { id: "2d", label: "In 2 days", days: 2 },
  { id: "7d", label: "In a week", days: 7 },
];
const DEFAULT_DAYS = 7;

export function Requests() {
  const { data, error } = useLoad(() => api.home(), []);
  return (
    <div className="page stack-l">
      <Composer />
      <section>
        <div className="sechead">
          <h2>Requests</h2>
        </div>
        {error && <div className="callout red">{error}</div>}
        <div className="card">
          {(data?.plans ?? []).map((p) => (
            <Link key={p.id} to={`/requests/${p.id}`} className="li evrow">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="trunc" style={{ color: "var(--ink)", fontWeight: 600 }}>
                  {p.title}
                </div>
                <div className="small muted">{p.summary}</div>
              </div>
              <Status k={planStatusKind(p.status)} title={PLAN_STATUS_TEXT[p.status]} />
            </Link>
          ))}
          {data && !data.plans.length && <div className="li muted small">No requests yet.</div>}
        </div>
      </section>
    </div>
  );
}

export function RequestNew() {
  const loc = useLocation();
  const nav = useNavigate();
  const { now } = useApp();
  const st = loc.state as { resp?: Extract<MessageResp, { request: SingleRequest }>; text?: string } | null;
  const today = helsinkiDate(now);
  const initial = st?.resp?.request ?? null;
  // A date the request itself names ("by Monday") wins; otherwise one week out.
  const [req, setReq] = useState<SingleRequest | null>(initial && { ...initial, neededBy: initial.neededBy ?? addDays(today, DEFAULT_DAYS) });
  const [custom, setCustom] = useState(() => Boolean(initial?.neededBy) && !DATE_PRESETS.some((p) => addDays(today, p.days) === initial?.neededBy));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  if (!req || !st?.resp)
    return (
      <div className="page stack-l">
        <Composer />
        <div className="muted">Type a request above to start.</div>
      </div>
    );

  const setLine = (i: number, patch: Partial<SingleLine>) => setReq({ ...req, lines: req.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  // REQUEST-VALIDATE's required inputs (REQ-01 to REQ-03), checked before leaving the page.
  const lineMissing = (l: SingleLine) => ({ product: !l.query.trim(), quantity: !l.quantity || !(l.quantity.amount > 0) });
  const dateMissing = !req.neededBy || req.neededBy <= today;
  const missing = [
    ...(req.lines.length ? [] : ["a product"]),
    ...req.lines.flatMap((l, i) => {
      const m = lineMissing(l);
      const name = l.query.trim() || `line ${i + 1}`;
      return [...(m.product ? [`the product on line ${i + 1}`] : []), ...(m.quantity ? [`how much ${name}`] : [])];
    }),
    ...(dateMissing ? ["a needed-by date after today"] : []),
  ];

  async function quote() {
    if (!req) return;
    setTried(true);
    if (missing.length) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.request(req);
      nav(`/requests/${r.plan.id}`, { state: { planResp: r } });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack-l">
      <div className="msg-me">{req.originalText}</div>
      <div className="card pad stack">
        {req.lines.map((l, i) => (
          <div key={l.id} className="chipline">
            <label className={`chip ${tried && lineMissing(l).quantity ? "missing" : ""}`}>
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
            <label className={`chip ${tried && lineMissing(l).product ? "missing" : ""}`}>
              <span className="chip-k">Product</span>
              <input value={l.query} onChange={(e) => setLine(i, { query: e.target.value })} style={{ width: 110 }} />
            </label>

            {l.constraints.claims.map((c) => (
              <span key={c} className="chip on">
                {claimLabel(c)}
                <button type="button" aria-label={`Remove ${claimLabel(c)}`} onClick={() => setLine(i, { constraints: { ...l.constraints, claims: l.constraints.claims.filter((x) => x !== c) } })}>
                  ×
                </button>
              </span>
            ))}
            <select
              className="chip add"
              value=""
              onChange={(e) => e.target.value && setLine(i, { constraints: { ...l.constraints, claims: [...l.constraints.claims, e.target.value] } })}
              aria-label="Add a diet claim"
            >
              <option value="">+ diet</option>
              {CLAIMS.filter((c) => !l.constraints.claims.includes(c)).map((c) => (
                <option key={c} value={c}>
                  {claimLabel(c)}
                </option>
              ))}
            </select>

          </div>
        ))}
        <div className={`chipline ${tried && dateMissing ? "missing" : ""}`} role="group" aria-label="Needed by">
          <span className="chip-k">Needed by</span>
          {DATE_PRESETS.map((p) => {
            const d = addDays(today, p.days);
            const on = !custom && req.neededBy === d;
            return (
              <button key={p.id} type="button" className={`datebtn ${on ? "on" : ""}`} aria-pressed={on} onClick={() => { setCustom(false); setReq({ ...req, neededBy: d }); }}>
                <span>{p.label}</span>
                <span className="small muted">{day(d)}</span>
              </button>
            );
          })}
          <label className={`datebtn ${custom ? "on" : ""}`}>
            <span>Custom</span>
            <input
              type="date"
              aria-label="Custom date"
              min={today}
              value={custom ? req.neededBy ?? "" : ""}
              onFocus={() => setCustom(true)}
              onChange={(e) => { setCustom(true); setReq({ ...req, neededBy: e.target.value || null }); }}
            />
          </label>
        </div>
        {tried && missing.length > 0 && (
          <div className="callout red small" role="alert">
            Add {missing.length > 1 ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}` : missing[0]} to get a quote.
          </div>
        )}
        {err && <div className="callout red small">{err}</div>}
        <div className="row">
          <button type="button" className="btn primary" disabled={busy} onClick={quote}>
            {busy ? "…" : "Quote"}
          </button>
          <Link to="/" className="btn ghost">
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Outcome({ plan }: { plan: Plan }) {
  const cls: Record<string, string> = { ordered: "green", kept_short: "yellow", waiting: "yellow", needs_input: "yellow", blocked: "red", rejected: "red", failed: "red", viability: "blue" };
  return (
    <div className={`callout ${cls[plan.status] ?? "yellow"}`}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Status k={planStatusKind(plan.status)} />
        <b>{plan.summary}</b>
        {plan.timings && (
          <span className="small muted" title="Measured while the agent ran">
            {plan.timings.products} products checked in {(plan.timings.totalMs / 1000).toFixed(1)} s
          </span>
        )}
        {plan.orderIds.length > 0 && (
          <Link to="/orders" className="small" style={{ marginLeft: "auto" }}>
            Receipt
          </Link>
        )}
      </div>
      {plan.inputRules.filter((r) => r.outcome !== "order").length > 0 && (
        <div className="row small" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {plan.inputRules.filter((r) => r.outcome !== "order").map((r, i) => (
            <span key={i}>{r.message}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * DLV-06: nothing arrives by the needed-by date. Only this is shown until the date moves;
 * the button re-runs the same request for the earliest date.
 */
function TooLate({ plan }: { plan: Plan }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = plan.tooLate!;
  async function move() {
    if (!plan.request || !t.earliest) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.request({ ...plan.request, neededBy: t.earliest });
      nav(`/requests/${r.plan.id}`, { state: { planResp: r } });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="callout red stack" role="alert">
      <b>No products available for delivery in time.</b>
      <span>
        Nothing can arrive by {day(t.neededBy)}.{" "}
        {t.earliest ? <>The earliest delivery is <b>{day(t.earliest)}</b>.</> : "No later delivery date is known yet."}
      </span>
      {err && <span className="small">{err}</span>}
      {t.earliest && plan.request && (
        <div className="row">
          <button type="button" className="btn primary" disabled={busy} onClick={move}>
            {busy ? "…" : `Change the date to ${day(t.earliest)}`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Products found, in stock and in time: a summary and one button to add them to the quote. */
function Proposal({ plan, onDone }: { plan: Plan; onDone: (r: PlanResp) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lines = plan.lines.filter((l) => !l.removed && l.productId);
  const used = new Set(lines.map((l) => l.productId));
  // Two other passing products per need, offered quietly below.
  const alts = plan.needs.flatMap((n) => n.candidates.filter((c) => !used.has(c.productId)).slice(0, 2).map((c) => ({ n, c })));
  async function run(key: string, f: () => Promise<PlanResp>) {
    setBusy(key);
    setErr(null);
    try {
      onDone(await f());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="stack">
      <div className="card pad stack">
        {lines.map((l) => (
          <div key={l.id} className="propline">
            <div style={{ minWidth: 0 }}>
              <div className="trunc" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {l.productName}
              </div>
              <div className="small muted">
                {qty(l.quantity)} {l.salesUnit ?? ""} · {stockText(l.stock, l.salesUnit)} · arrives {day(l.availableDate)}
              </div>
            </div>
            <b className="num">{eur(l.lineTotal)}</b>
          </div>
        ))}
        <div className="totalrow">
          <span className="muted">Ex VAT</span>
          <b className="price">{eur(plan.totalExVat)}</b>
        </div>
        {err && <div className="callout red small">{err}</div>}
        <div className="row">
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => run("accept", () => api.accept(plan.id))}>
            {busy === "accept" ? "…" : "Add to quote"}
          </button>
          <Link to="/" className="btn ghost">
            Cancel
          </Link>
        </div>
      </div>
      {alts.length > 0 && (
        <div className="alts small muted">
          <span>Or instead:</span>
          {alts.map(({ n, c }) => (
            <button key={`${n.id}:${c.productId}`} type="button" className="linkbtn" disabled={!!busy} onClick={() => run(c.productId, () => api.choose(plan.id, n.id, c.productId))}>
              {busy === c.productId ? "…" : `${c.name} · ${eur(c.pricePerBase)}/${n.amount.unit}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestPlan() {
  const { id } = useParams();
  const loc = useLocation();
  const initial = (loc.state as { planResp?: PlanResp } | null)?.planResp ?? null;
  const { data, error, setData } = useLoad(() => api.plan(id!), [id]);
  const [view, setView] = useState<"lines" | "money">("lines");
  const { data: rules } = useLoad(() => api.rules(), []);
  const { me } = useApp();
  useEffect(() => {
    if (initial && !data) setData(initial);
  }, [initial, data, setData]);
  const d = data ?? initial;
  if (error && !d) return <div className="callout red">{error}</div>;
  if (!d) return <div className="muted">Loading…</div>;
  const { plan, questions } = d;
  const open = questions.filter((q: Question) => q.state === "open" || q.state === "waiting");
  // One question at a time, and only one this person can answer; the rest are someone else's.
  const next = open.find((q) => q.state === "open" && q.forRole === me.role) ?? null;
  const elsewhere = next ? null : open[0] ?? null;
  const head = (
    <div>
      <h1>{plan.title}</h1>
      <div className="small muted row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span>By {day(plan.neededBy)}</span>
        {plan.urgent && <span className="stamp ask">Urgent</span>}
      </div>
    </div>
  );
  // Nothing arrives in time: no basket, options or cut-offs until the date moves.
  if (plan.tooLate)
    return (
      <div className="page stack-l">
        {head}
        <TooLate plan={plan} />
      </div>
    );
  if (plan.proposal)
    return (
      <div className="page stack-l">
        {head}
        <Proposal plan={plan} onDone={setData} />
      </div>
    );

  return (
    <div className="page stack-l">
      {head}
      <Outcome plan={plan} />

      {next ? (
        <QuestionCard key={next.id} q={next} onAnswered={() => api.plan(plan.id).then(setData)} />
      ) : (
        elsewhere && (
          <div className="callout blue small" role="status">
            {elsewhere.state === "waiting" ? "Waiting for the chef to answer first." : `Sent to the ${ROLE_LABEL[elsewhere.forRole].toLowerCase()} for approval.`}
          </div>
        )
      )}

      <Section
        title="Basket"
        aside={
          <div className="seg">
            <button type="button" className={view === "lines" ? "on" : ""} onClick={() => setView("lines")}>
              Lines
            </button>
            <button type="button" className={view === "money" ? "on" : ""} onClick={() => setView("money")}>
              Money
            </button>
          </div>
        }
      >
        {view === "lines" ? (
          <>
            <LinesList plan={plan} warnings={[]} />
            <div className="totalrow">
              <span className="muted">Ex VAT</span>
              <b className="price" style={{ fontSize: 22 }}>
                {eur(plan.totalExVat)}
              </b>
            </div>
          </>
        ) : (
          <MoneyView plan={plan} warnings={[]} cap={rules?.mandate.spendCapEur ?? null} vat={(questions.find((q) => typeof q.facts.totalVat === "number")?.facts.totalVat as number) ?? null} />
        )}
      </Section>

      {plan.lines.length > 0 && (
        <Section title="Cut-offs">
          <CutoffBoard lines={plan.lines} />
        </Section>
      )}

      <Section title="Options">
        <div className="stack">
          {plan.needs.map((n) => (
            <Candidates key={n.id} need={n} />
          ))}
        </div>
      </Section>
    </div>
  );
}
