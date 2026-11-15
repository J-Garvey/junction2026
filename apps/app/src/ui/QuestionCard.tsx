/** UI-03, CH-06: one question, answerable with one tap. */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { Question } from "@aimo/contracts";
import { api, ApiError } from "../api";
import { answerers, canAnswer, namesOf, useApp, waitingForText } from "../ctx";
import { countdown, eur, when, qty } from "../format";
import { Icon } from "./icons";
import { OrderItemDialog } from "./OrderItemDialog";
import { ManagerApprovalPanel } from "./ManagerApprovalPanel";

type Row = { field: string; original: string; substitute: string; differs: boolean };
type ApprovalLine = { lineId: string; productId: string; product: string; quantity: number; unit: string | null; lineTotal: number | null };
type Item = { ruleId: string; text: string; grant?: string | null };

/** One line per group of questions someone else answers: who, and how many. */
export function OthersWaiting({ others }: { others: { who: string; n: number }[] }) {
  if (!others.length) return null;
  return (
    <div className="stack-s" style={{ marginTop: 8 }}>
      {others.map((o) => (
        <div key={o.who} className="small muted row" style={{ gap: 6 }}>
          <Icon n="clock" s={14} /> {o.n} waiting for {o.who}
        </div>
      ))}
    </div>
  );
}

type QuestionCardProps = { q: Question; compact?: boolean; orderContext?: boolean; onAnswered?: (q: Question, error?: string) => void };

export function QuestionCard(props: QuestionCardProps) {
  return props.q.type === "order_review" ? <ManagerApprovalPanel {...props} /> : <DecisionCard {...props} />;
}

function DecisionCard({ q: initial, compact, onAnswered }: QuestionCardProps) {
  const { me, people, now, refresh } = useApp();
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [selectedLine, setSelectedLine] = useState<ApprovalLine | null>(null);
  const [open, setOpen] = useState(!compact && !(typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches));
  const card = useRef<HTMLElement>(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash !== `#question-${encodeURIComponent(q.id)}`) return;
    setOpen(true);
    const frame = requestAnimationFrame(() => { card.current?.scrollIntoView({ block: "start" }); card.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [hash, q.id]);
  void compact;
  useEffect(() => setQ(initial), [initial]);

  const f = q.facts as Record<string, any>;
  const dl = countdown(q.deadline, now);
  const mine = canAnswer(q, me, people);
  const answered = q.state === "answered" || q.state === "expired" || q.state === "replaced";

  async function pick(optionId: string) {
    setBusy(optionId);
    setErr(null);
    try {
      const r = await api.answer(q.id, optionId);
      setQ(r.question);
      onAnswered?.(r.question);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.question) {
        setQ(e.body.question);
        setErr(e.body.reason ?? e.body.error ?? null);
      } else setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const rows: Row[] = Array.isArray(f.sideBySide) ? f.sideBySide : [];
  const diffRows = rows.filter((r) => r.differs);
  const sameRows = rows.filter((r) => !r.differs);
  const items: Item[] = Array.isArray(f.items) ? f.items : [];
  const lines: ApprovalLine[] = Array.isArray(f.lines) ? f.lines : [];
  const answerLabel = q.options.find((o) => o.id === q.answer)?.label ?? q.answer;

  return (
    <article ref={card} id={`question-${q.id}`} tabIndex={-1} style={{ scrollMarginTop: 80 }} className={`qcard ${q.state}`} aria-label={q.title}>
      <header className="qhead">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {answered ? (
              <span className="stamp order">{q.state === "answered" ? "Answered" : q.state === "expired" ? "Expired" : "Replaced"}</span>
            ) : (
              <span className={`stamp ${mine && q.state === "open" ? "ask" : "unknown"}`}>{waitingForText(q, me, people)}</span>
            )}
          </div>
          <h3 className="qtitle">{q.title}</h3>
        </div>
        {q.deadline && !answered && (
          <div className={`qdl ${dl.past ? "past" : ""}`} title={`Answer by ${when(q.deadline)}`}>
            <Icon n={dl.past ? "lock" : "clock"} s={14} />
            <span>{dl.past ? "Deadline passed" : dl.text}</span>
          </div>
        )}
      </header>

      <p className="qbody clamp">
        {q.body}
      </p>

      {open && rows.length > 0 && (
        <div className="sbs">
          <div className="sbs-row sbs-h">
            <span />
            <span>Original</span>
            <span>Substitute</span>
          </div>
          {diffRows.map((r) => (
            <div key={r.field} className="sbs-row differs">
              <span className="sbs-f">{r.field}</span>
              <span>{r.original}</span>
              <span>{r.substitute}</span>
            </div>
          ))}
          {sameRows.length > 0 && !showSame && (
            <button type="button" className="linkbtn small" onClick={() => setShowSame(true)}>
              +{sameRows.length} same
            </button>
          )}
          {showSame &&
            sameRows.map((r) => (
              <div key={r.field} className="sbs-row">
                <span className="sbs-f">{r.field}</span>
                <span>{r.original}</span>
                <span>{r.substitute}</span>
              </div>
            ))}
        </div>
      )}

      {open && items.length > 0 && (
        <ul className="qitems">
          {items.map((it, i) => (
            <li key={i}>
              {it.text}
            </li>
          ))}
        </ul>
      )}

      {open && lines.length > 0 && f.kind === "approval" && (
        <div className="qlines">
          {lines.map((l) => (
            <button key={l.lineId} type="button" className="qline item-dialog-trigger" onClick={() => setSelectedLine(l)}>
              <span className="trunc">{l.product}</span>
              <span className="num muted">
                {qty(l.quantity)} {l.unit ?? ""}
              </span>
              <span className="num">{eur(l.lineTotal)}</span>
            </button>
          ))}
          {typeof f.total === "number" && (
            <div className="qline total">
              <span>Total ex VAT</span>
              <span />
              <span className="num">{eur(f.total)}</span>
            </div>
          )}
        </div>
      )}
      {!open && (typeof f.total === "number" || rows.length > 0 || items.length > 0) && (
        <button type="button" className="linkbtn small" onClick={() => setOpen(true)}>
          Details
        </button>
      )}
      {selectedLine && (
        <OrderItemDialog
          eyebrow="Awaiting approval"
          title={selectedLine.product}
          description={q.body}
          fields={[
            { label: "Quantity", value: `${qty(selectedLine.quantity)} ${selectedLine.unit ?? ""}` },
            { label: "Line total", value: eur(selectedLine.lineTotal) },
            { label: "Product ID", value: selectedLine.productId },
            { label: "Approval", value: waitingForText(q, me, people) },
            ...(typeof f.total === "number" ? [{ label: "Order total ex VAT", value: eur(f.total) }] : []),
          ]}
          onClose={() => setSelectedLine(null)}
        />
      )}

      {err && <div className="callout red small">{err}</div>}

      {answered ? (
        <div className="qanswered small">
          {q.answeredBy ? (
            <>
              {q.answeredBy.name}: {answerLabel}
            </>
          ) : (
            <>{q.state}</>
          )}
        </div>
      ) : q.state === "waiting" ? (
        <div className="qanswered small muted">The chef finishes the order first</div>
      ) : !mine ? (
        <div className="qanswered small muted">Only {namesOf(answerers(q, people)) || `the ${q.forRole}`} can approve this</div>
      ) : (
        <div className="qopts">
          {q.options.map((o) => (
            <button key={o.id} type="button" className={`btn ${o.primary ? "primary" : ""}`} disabled={!!busy} onClick={() => pick(o.id)}>
              {busy === o.id ? "Saving…" : o.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
