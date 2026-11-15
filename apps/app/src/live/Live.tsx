/**
 * The demo screen. Left: the hotel's purchasing agent, a real model calling the
 * gateway's public API. Right: what Valio Aimo sees at its front door, live.
 */
import { useEffect, useId, useRef, useState } from "react";
import "./live.css";

type CallStep = { kind: "call"; n: number; method: string; path: string; summary: string; tone: "ok" | "warn" | "err" | "run"; ms: number | null };
type SayStep = { kind: "say"; text: string };
type ChefStep = { kind: "chef"; text: string; at: string };
type CardStep = {
  kind: "card";
  id: string;
  who: "chef" | "approver";
  person: string;
  title: string;
  body: string;
  options: { id: string; label: string; sub?: string }[];
  answer: { optionId: string; label: string; by: string } | null;
};
type Step = CallStep | SayStep | ChefStep | CardStep;
type Session = { id: string; status: "idle" | "running" | "waiting" | "done" | "error"; steps: Step[]; error: string | null; model: string };
type Verdict = "ALLOWED" | "NEEDS_APPROVAL" | "ASKS_CHEF" | "REFUSED" | "APPROVED" | "INFO";
type FeedEntry = {
  id: string;
  at: string;
  agent: string;
  callerKind: string;
  method: string;
  path: string;
  status: number;
  action: string;
  verdict: Verdict;
  amount: number | null;
  reason: string | null;
  signed: boolean;
  quoteId: string | null;
  orderId: string | null;
};
type Rules = { hotel: string; spendCapEur: number; delivery: string; site: string; unconfirmedStock: string; signed: boolean };
type State = { session: Session; feed: FeedEntry[]; rules: Rules; clock: string; model: string; modelReady: boolean };

const PRESETS = ["I need 1,000 litres of lactose-free milk by Monday.", "The conference grew. We need 2,000 litres of lactose-free milk for Monday."];

const eur = (n: number | null | undefined) => n == null ? "TBC" : `€${n.toLocaleString("en-IE", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Helsinki" });
const VERDICT_LABEL: Record<Verdict, string> = { ALLOWED: "ALLOWED", NEEDS_APPROVAL: "NEEDS APPROVAL", ASKS_CHEF: "ASKS CHEF", REFUSED: "REFUSED", APPROVED: "APPROVED", INFO: "" };

async function post(path: string, body: unknown = {}) {
  const r = await fetch(path, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
  return data;
}

export function Live() {
  const [s, setS] = useState<State | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showReads, setShowReads] = useState(true);
  const [connected, setConnected] = useState(false);
  const leftEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let stop = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      es = new EventSource("/api/live/stream", { withCredentials: true });
      es.addEventListener("state", (e) => { setS(JSON.parse((e as MessageEvent).data)); setConnected(true); });
      es.addEventListener("session", (e) => setS((p) => (p ? { ...p, session: JSON.parse((e as MessageEvent).data) } : p)));
      es.addEventListener("feed", (e) => setS((p) => (p ? { ...p, feed: [...p.feed, JSON.parse((e as MessageEvent).data)] } : p)));
      es.onerror = () => {
        es?.close();
        setConnected(false);
        if (!stop) retry = setTimeout(connect, 1500);
      };
    };
    void fetch("/api/live/state", { credentials: "same-origin" }).then(async r => {
      if (!r.ok) throw new Error("Sign in as a Demo Hotel user to open this console.");
      if (!stop) { setS(await r.json()); connect(); }
    }).catch(e => { if (!stop) setErr(e.message); });
    return () => {
      stop = true;
      clearTimeout(retry);
      es?.close();
    };
  }, []);

  useEffect(() => {
    const t = leftEnd.current?.parentElement;
    if (t) t.scrollTo({ top: t.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [s?.session.steps.length, s?.session.status]);

  async function act(fn: () => Promise<unknown>) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const send = (t: string) =>
    act(async () => {
      await post("/api/live/say", { text: t });
      setText("");
    });

  if (!s) return <div className="lv-boot">{err ? <span>{err} <a href="/">Open hotel sign-in</a></span> : "Connecting to the gateway..."}</div>;
  const sess = s.session;
  const working = sess.status === "running";
  const waiting = sess.status === "waiting";
  const feed = [...s.feed].reverse().filter((f) => showReads || f.verdict !== "INFO");

  return (
    <div className="lv">
      <header className="lv-top">
        <div className="lv-brand">
          <b>Valio Aimo</b>
          <span className="lv-sep" />
          <span>Aimo Agent Gateway</span>
        </div>
        <div className="lv-tools">
          <span className={`lv-live ${connected ? "connected" : ""}`} role="status">
            <i aria-hidden="true" /> {connected ? "Live API monitor" : "Reconnecting to gateway"}
          </span>
          <button className="lv-ghost" disabled={busy} onClick={() => act(() => post("/api/live/rogue"))}>
            Send unvetted agent
          </button>
          <button className="lv-ghost" disabled={busy} onClick={() => act(() => post("/api/live/reset"))}>
            Reset
          </button>
          <a className="lv-link" href="/">
            Hotel app
          </a>
        </div>
      </header>

      <main className="lv-main">
        <section className="lv-left">
          <div className="lv-h">
            <h1>Hotel agent</h1>
            <p>
              Live purchasing AI · <code>{s.model}</code> · uses only <a href="/openapi.json">/openapi.json</a>
            </p>
          </div>

          <div className="lv-thread">
            {sess.steps.length === 0 && <div className="lv-empty">Ask for something. The agent will call the gateway and you'll see every call on both sides.</div>}
            {sess.steps.map((st, i) => {
              if (st.kind === "chef")
                return (
                  <div key={i} className="lv-chef">
                    <div className="lv-chef-h">
                      <span>Hotel chef</span>
                      <span>{hhmm(st.at)}</span>
                    </div>
                    <div className="lv-chef-t">{st.text}</div>
                  </div>
                );
              if (st.kind === "call")
                return (
                  <div key={i} className={`lv-step t-${st.tone}`}>
                    <span className="lv-n">{st.n}</span>
                    <span className={`lv-api ${st.method === "ASK" ? "ask" : ""}`}>{st.method === "ASK" ? "ASK" : "API"}</span>
                    <code className="lv-path">{st.method === "ASK" ? st.path : `${st.method} ${st.path.replace("/gateway/v1", "")}`}</code>
                    <span className="lv-sum">{st.summary}</span>
                    <span className="lv-dot" />
                  </div>
                );
              if (st.kind === "card") return <Card key={i} c={st} disabled={busy} onPick={(o) => act(() => post(`/api/live/cards/${st.id}`, { optionId: o }))} />;
              return (
                <div key={i} className="lv-say">
                  {st.text}
                </div>
              );
            })}
            {working && (
              <div className="lv-thinking">
                <span />
                <span />
                <span /> Agent working
              </div>
            )}
            {sess.status === "error" && <div className="lv-err">The agent stopped: {sess.error}. Nothing more was ordered.</div>}
            <div ref={leftEnd} />
          </div>

          <form
            className="lv-compose"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) send(text.trim());
            }}
          >
            {!working && !waiting && (
              <div className="lv-presets">
                {PRESETS.map((p) => (
                  <button type="button" key={p} disabled={busy} onClick={() => send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            <div className="lv-row">
              <input aria-label="Kitchen request" value={text} onChange={(e) => setText(e.target.value)} placeholder={waiting ? "Answer the card above" : "Type what the kitchen needs…"} disabled={working || waiting} />
              <button className="lv-send" disabled={busy || working || waiting || !text.trim()}>
                Send
              </button>
            </div>
            {err && <div className="lv-err">{err}</div>}
            {!s.modelReady && <div className="lv-err">No OpenAI key on the server, so the agent can't run.</div>}
          </form>
        </section>

        <section className="lv-right">
          <div className="lv-rh">
            <div className="lv-h">
              <h2>Valio Aimo gateway</h2>
              <p>Incoming external agent requests</p>
            </div>
            <div className="lv-rules">
              <h3>
                Hotel rules {s.rules.signed && <span className="lv-signed-sm">signed</span>}
              </h3>
              <dl>
                <dt>Budget per order</dt>
                <dd>{eur(s.rules.spendCapEur)}</dd>
                <dt>Delivery</dt>
                <dd>{s.rules.delivery}</dd>
                <dt>Unconfirmed stock</dt>
                <dd>{s.rules.unconfirmedStock}</dd>
              </dl>
            </div>
          </div>

          <div className="lv-feedbar">
            <span className="lv-feedhint">Scroll for amount and verdict.</span>
            <label>
              <input type="checkbox" checked={showReads} onChange={(e) => setShowReads(e.target.checked)} /> Show lookups
            </label>
          </div>

          <div className="lv-table" role="region" aria-label="Gateway activity, scroll for all columns" tabIndex={0}>
            <div className="lv-tr lv-th">
              <span>Time</span>
              <span>Agent</span>
              <span>Action</span>
              <span>Amount</span>
              <span>Verdict</span>
            </div>
            {feed.length === 0 && <div className="lv-empty">No agent has called yet.</div>}
            {feed.map((f) =>
              f.verdict === "INFO" ? (
                <div key={f.id} className="lv-tr lv-info">
                  <span>{hhmm(f.at)}</span>
                  <span>{f.agent}</span>
                  <span>
                    <code>
                      {f.method} {f.path.replace("/gateway/v1", "")}
                    </code>
                  </span>
                  <span />
                  <span>{f.reason}</span>
                </div>
              ) : (
                <div key={f.id} className={`lv-tr lv-row-${f.verdict} ${f.orderId ? "lv-click" : ""}`}
                  role={f.orderId ? "button" : undefined} tabIndex={f.orderId ? 0 : undefined}
                  aria-label={f.orderId ? `View signed order ${f.orderId}` : undefined}
                  onClick={() => f.orderId && setOpen(f.orderId)}
                  onKeyDown={(event) => {
                    if (f.orderId && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setOpen(f.orderId);
                    }
                  }}>
                  <span className="lv-time">{hhmm(f.at)}</span>
                  <span className="lv-agent">{f.agent}</span>
                  <span>
                    <span className={`lv-act a-${f.action}`}>{f.action}</span>
                  </span>
                  <span className="lv-amt">{eur(f.amount)}</span>
                  <span className="lv-v">
                    <span className={`lv-badge v-${f.verdict}`}>{VERDICT_LABEL[f.verdict]}</span>
                    {f.signed && (f.verdict === "ALLOWED" || f.verdict === "APPROVED") && (
                      <span className="lv-seal" title="Signed ES256, verify with /.well-known/jwks.json">
                        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                          <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </span>
                  {f.reason && <span className={`lv-reason ${f.verdict === "REFUSED" ? "bad" : ""}`}>{f.reason}</span>}
                </div>
              ),
            )}
          </div>
        </section>
      </main>
      {open && <Record id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Card({ c, onPick, disabled }: { c: CardStep; onPick: (o: string) => void; disabled: boolean }) {
  return (
    <div className={`lv-card ${c.who} ${c.answer ? "done" : ""}`}>
      <div className="lv-card-h">
        <span className="lv-warn">!</span>
        <div>
          <div className="lv-card-who">{c.person}</div>
          <h2>{c.title}</h2>
        </div>
      </div>
      <p>{c.body}</p>
      {c.answer ? (
        <div className="lv-answered">
          {c.answer.by} chose <b>{c.answer.label}</b>
        </div>
      ) : (
        <div className="lv-opts">
          {c.options.map((o, i) => (
            <button key={o.id} className={i === 0 ? "pri" : ""} disabled={disabled} onClick={() => onPick(o.id)}>
              {o.label}
              {o.sub && <small>{o.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type RecordResp = {
  order: { id: string; state: string; totalExVat: number; deliveryDate: string; placedAt: string; placedBy: string; approvalId: string | null; lines: { productId: string; name: string; quantity: number; salesUnit: string | null; unitPrice: number | null; lineTotal: number | null; riskAccepted: { by: string } | null }[] };
  signature: { present: boolean; valid: boolean; alg: string; jwks: string; jws: string | null; claims: Record<string, unknown> | null };
};

function Record({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<RecordResp | null>(null);
  const [e, setE] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    element.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    fetch(`/api/live/orders/${id}`, { credentials: "same-origin" })
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error(`HTTP ${x.status}`))))
      .then(setR)
      .catch((x) => setE(x.message));
  }, [id]);
  return (
    <dialog ref={dialog} className="lv-modal" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex='0']")];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="lv-sheet" onClick={(ev) => ev.stopPropagation()}>
        <button className="lv-x" aria-label="Close signed order" onClick={onClose}>
          ×
        </button>
        <h2 id={titleId}>Signed order {id}</h2>
        {e && <div className="lv-err">{e}</div>}
        {r && (
          <>
            <div className={`lv-verify ${r.signature.valid ? "ok" : "bad"}`}>{r.signature.valid ? `Signature valid · ${r.signature.alg} · key in ${r.signature.jwks}` : "Signature not valid"}</div>
            <ul className="lv-lines" aria-label="Order items">
              {r.order.lines.map((l, index) => (
                <li key={`${l.productId}-${index}`}>
                  <span className="lv-line-name">{l.name}</span>
                  <span>{l.quantity} {l.salesUnit}</span>
                  <span>{eur(l.lineTotal)}</span>
                  {l.riskAccepted && <span className="lv-line-risk">Stock not confirmed · {l.riskAccepted.by} accepted</span>}
                </li>
              ))}
            </ul>
            <p>
              <b>{eur(r.order.totalExVat)}</b> ex VAT · delivery {r.order.deliveryDate} · {r.order.approvalId ? "approval attached" : "no approval needed"}
            </p>
            <div className="lv-links">
              <a href={`/api/live/orders/${id}/peppol`} target="_blank" rel="noreferrer">
                Peppol BIS Order (UBL XML)
              </a>
              <a href="/.well-known/jwks.json" target="_blank" rel="noreferrer">
                Public keys (JWKS)
              </a>
            </div>
            {r.signature.jws && <div className="lv-jws" role="region" aria-label="Signed receipt token" tabIndex={0}><code>{r.signature.jws}</code></div>}
          </>
        )}
      </div>
    </dialog>
  );
}
