import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import type { Question } from "@aimo/contracts";
import { api, ApiError } from "../api";
import { canAnswer, useApp } from "../ctx";
import { countdown, when } from "../format";
import { Icon } from "./icons";

/** The manager's final basket decision. Reject returns it for changes, never cancels supplier orders. */
export function ManagerApprovalPanel({ q: initial, orderContext, onAnswered }: {
  q: Question;
  orderContext?: boolean;
  onAnswered?: (q: Question, error?: string) => void;
}) {
  const { me, people, now, refresh } = useApp();
  const [q, setQ] = useState(initial);
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const card = useRef<HTMLElement>(null);
  const refuseButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const noteField = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const { hash } = useLocation();
  const dl = countdown(q.deadline, now);
  const mine = canAnswer(q, me, people);
  const actionable = q.state === "open" && mine && !dl.past;
  const closed = q.state !== "open" && q.state !== "waiting";

  useEffect(() => { setQ(initial); }, [initial]);
  useEffect(() => {
    if (!actionable) setRefusing(false);
  }, [actionable]);
  useEffect(() => {
    if (refusing) noteField.current?.focus();
    else if (restoreFocus.current) {
      refuseButton.current?.focus();
      restoreFocus.current = false;
    }
  }, [refusing]);
  useEffect(() => {
    if (hash !== `#question-${encodeURIComponent(q.id)}`) return;
    const frame = requestAnimationFrame(() => { card.current?.scrollIntoView({ block: "start" }); card.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [hash, q.id]);

  function cancel() {
    if (pending.current) return;
    restoreFocus.current = true;
    setRefusing(false);
    setNote("");
    setError(null);
  }

  async function decide(optionId: "approve" | "reject") {
    if (pending.current || !actionable || !q.options.some((option) => option.id === optionId)) return;
    if (optionId === "reject" && (!note.trim() || note.trim().length > 2000)) {
      setError("Add a refusal note for the order builder (1–2000 characters).");
      noteField.current?.focus();
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.answer(q.id, optionId, optionId === "reject" ? note.trim() : undefined);
      setQ(result.question);
      setRefusing(false);
      setNote("");
      setError(result.error ?? null);
      onAnswered?.(result.question, result.error);
      refresh();
    } catch (err) {
      const latest = err instanceof ApiError ? err.body?.question as Question | undefined : undefined;
      const message = err instanceof ApiError ? err.body?.reason ?? err.message : (err as Error).message;
      setError(message);
      if (latest) {
        setQ(latest);
        if (latest.state !== "open") onAnswered?.(latest, message);
      }
      refresh();
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const title = q.state === "answered" ? (q.answer === "reject" ? "Returned for changes" : "Approval recorded")
    : q.state === "replaced" ? "Review replaced" : q.state === "expired" || dl.past ? "Review expired" : "Waiting for approval";

  return (
    <article ref={card} id={`question-${q.id}`} tabIndex={-1} className={`manager-approval ${q.state}`} aria-labelledby={`${fieldId}-title`} aria-busy={busy}>
      <div className="manager-approval-main">
        <div className="stack-s">
          <h3 id={`${fieldId}-title`}>{title}</h3>
          {!orderContext && q.eventId && <Link className="small" to={`/baskets/${encodeURIComponent(q.eventId)}`}>{q.title.replace(/^Review order: /, "")}</Link>}
        </div>
        {q.deadline && !closed && (
          <div className="manager-approval-expiry small">
            <span className={`qdl ${dl.past ? "past" : ""}`}><Icon n={dl.past ? "lock" : "clock"} s={14} />{dl.past ? "Review expired" : `Review expires in ${dl.text}`}</span>
            <span>Review valid until <time dateTime={q.deadline}>{when(q.deadline)}</time> Helsinki; then submit for review again.</span>
          </div>
        )}
        {actionable && !refusing && (
          <div className="qopts">
            {q.options.some((o) => o.id === "approve") && <button type="button" className="btn primary" disabled={busy} onClick={() => decide("approve")}>{busy ? "Saving…" : "Approve order"}</button>}
            {q.options.some((o) => o.id === "reject") && <button ref={refuseButton} type="button" className="btn" disabled={busy} onClick={() => { setError(null); setRefusing(true); }}>Refuse order</button>}
          </div>
        )}
      </div>
      {actionable && refusing && (
        <form className="manager-refusal" onSubmit={(event) => { event.preventDefault(); void decide("reject"); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }}>
          <label htmlFor={fieldId}>Note to order builder (required)</label>
          <p id={`${fieldId}-help`} className="small">Explain what needs to change. This returns the order for editing; supplier orders already placed remain in place.</p>
          <textarea ref={noteField} id={fieldId} required maxLength={2000} rows={3} value={note} disabled={busy} aria-describedby={`${fieldId}-help`} aria-invalid={!!error} onChange={(event) => { setNote(event.target.value); setError(null); }} />
          <div className="qopts">
            <button type="submit" className="btn primary" disabled={busy || !note.trim()}>{busy ? "Sending…" : "Send refusal"}</button>
            <button type="button" className="btn" disabled={busy} onClick={cancel}>Cancel</button>
          </div>
        </form>
      )}
      {error && <div className="callout red small" role="alert">{error}</div>}
      {q.state === "answered" && <div className="small" role="status">{q.answer === "reject" ? "Refusal note sent to the order builder." : "The decision has been recorded."}{q.answerNote && <p className="decision-note">{q.answerNote}</p>}</div>}
      {!closed && !mine && <p className="small">Manager approval is required.</p>}
      {q.state === "waiting" && mine && <p className="small">The chef finishes the order first.</p>}
    </article>
  );
}
