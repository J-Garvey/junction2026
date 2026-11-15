/** UI-01, UI-02, UI-03: the decisions list, with the chat box pinned on top. */
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, ApiError, type MessageResp, type ChangeResp } from "../api";
import { useApp, useLoad } from "../ctx";
import { QuestionCard } from "../ui/QuestionCard";
import { CoverageLine, Status, planStatusKind, PLAN_STATUS_TEXT } from "../ui/Status";
import { Icon } from "../ui/icons";
import { DiffView } from "../ui/PlanView";
import { day, plural, when } from "../format";
import { useMessagePreparation } from "../useMessagePreparation";
import { ProcessingTime } from "../ui/ProcessingTime";

const SUGG = ["1,000 L lactose-free milk by Monday"];

export function Home() {
  const { me } = useApp();
  const { data, error, loading } = useLoad(() => api.home(), []);
  const open = (data?.questions ?? []).filter((q) => q.state === "open" || q.state === "waiting");
  const covered = (data?.events ?? []).filter((e) => e.coverage.level === "covered").length;

  return (
    <div className="page stack-l">
      <Composer />
      {error && <div className="callout red">{error}</div>}

      <section>
        <div className="sechead">
          <h2>Waiting for you</h2>
          {open.length > 0 && <span className="countb">{open.length}</span>}
        </div>
        {loading && !data ? (
          <div className="muted small">Loading…</div>
        ) : open.length ? (
          <div className="qlist">
            {open.map((q) => (
              <QuestionCard key={q.id} q={q} compact />
            ))}
          </div>
        ) : (
          <div className="empty">
            <Icon n="check" s={18} /> Nothing needs you.
          </div>
        )}
      </section>

      <section>
        <div className="sechead">
          <h2>Events</h2>
        </div>
        <div className="card">
          {(data?.events ?? []).map((e) => (
            <Link key={e.id} to={`/events/${e.id}`} className="li evrow">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "var(--ink)", fontWeight: 600 }}>{e.name}</div>
                <CoverageLine level={e.coverage.level} text={e.coverage.text} />
              </div>
              <Icon n="chev" s={16} />
            </Link>
          ))}
          {data && !data.events.length && <div className="li muted">No events.</div>}
        </div>
      </section>

    </div>
  );
}

/** The chat box: a new request, or a guest change to an event (Q10.6). */
export function Composer() {
  const nav = useNavigate();
  const { refresh } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<MessageResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useMessagePreparation(busy ? "" : text);

  async function send(t = text) {
    if (!t.trim()) return;
    setBusy(true);
    setErr(null);
    setResp(null);
    try {
      const r = await api.message(t.trim());
      if (r.route === "new_request" || r.route === "new_request_unsure") {
        nav("/requests/new", { state: { resp: r, text: t.trim() } });
        return;
      }
      setResp(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="txt">
          <textarea
            rows={1}
            value={text}
            maxLength={2000}
            placeholder="What do you need?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Type a request"
          />
          <button type="submit" className={`send ${text.trim() ? "go" : ""}`} disabled={busy} aria-label="Send">
            {busy ? "…" : <Icon n="send" s={18} w={2.2} />}
          </button>
        </div>
      </form>
      <div className="sugg">
        {SUGG.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setText(s);
              send(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
      {err && <div className="callout red small">{err}</div>}
      {resp?.route === "neither" && <div className="callout blue small">{resp.message}</div>}
      {resp?.route === "event_change" && <EventChange resp={resp} onDone={refresh} />}
    </div>
  );
}

function EventChange({ resp, onDone }: { resp: Extract<MessageResp, { route: "event_change" }>; onDone: () => void }) {
  const [guests, setGuests] = useState<number | "">(resp.guests ?? "");
  const [eventId, setEventId] = useState(resp.events.length === 1 ? resp.events[0].id : "");
  const [version, setVersion] = useState<Record<string, number>>(Object.fromEntries(resp.events.map((e) => [e.id, e.version])));
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<ChangeResp | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function apply() {
    if (!eventId || guests === "") return;
    setBusy(true);
    setErr(null);
    setConflict(null);
    try {
      const r = await api.guests(eventId, Number(guests), version[eventId], resp.parseAuditId);
      setOut(r);
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.current) {
        const cur = e.body.current;
        setVersion((v) => ({ ...v, [eventId]: cur.version }));
        const last = cur.changes?.[cur.changes.length - 1];
        setConflict(`Changed by ${last?.by ?? "someone"}: now ${cur.guests} guests.`);
      } else setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad stack">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="field">
          <span className="small muted">Guests</span>
          <input type="number" min={0} value={guests} onChange={(e) => setGuests(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span className="small muted">Event</span>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Which event?</option>
            {resp.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} (now {e.guests})
              </option>
            ))}
          </select>
        </label>
      </div>
      {conflict && <div className="callout yellow small">{conflict}</div>}
      {err && <div className="callout red small">{err}</div>}
      {out ? (
        <div className="stack">
          <div className={`callout ${out.applied ? "green" : "yellow"} small`}>
            {out.applied ? "Applied" : out.reason ?? "Change checked"}
          </div>
          <ProcessingTime processing={out.event?.processing} />
          {out.diff && <DiffView diff={out.diff} />}
          <Link to={`/events/${eventId}`} className="btn sm">
            Open event
          </Link>
        </div>
      ) : (
        <button type="button" className="btn primary" disabled={busy || !eventId || guests === ""} onClick={apply}>
          {busy ? "Applying…" : conflict ? "Confirm again" : "Apply to event"}
        </button>
      )}
    </div>
  );
}
