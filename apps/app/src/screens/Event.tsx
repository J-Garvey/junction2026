/** UI-07..UI-10, CH-02, CH-07: one page per event, through the four scenes. */
import { useState } from "react";
import { Link, useParams } from "react-router";
import type { PlanLine } from "@aimo/contracts";
import { api, ApiError, type ChangeResp, type SceneKey, type StoredEvent } from "../api";
import { splitMine, useApp, useLoad } from "../ctx";
import { CoverageLine, Fixture, Status } from "../ui/Status";
import { OthersWaiting, QuestionCard } from "../ui/QuestionCard";
import { CutoffBoard, DiffView, DishView, LinesList, MoneyView, Section, sortGapsFirst, lineStatus, isGap } from "../ui/PlanView";
import { Outcome } from "./Request";
import { ProcessingTime } from "../ui/ProcessingTime";
import { day, plural, when } from "../format";
import { Icon } from "../ui/icons";

export function Events() {
  const { data, error, loading } = useLoad(() => api.events(), []);
  return (
    <div className="page stack-l">
      <h1>Events</h1>
      {error && <div className="callout red">{error}</div>}
      <div className="card">
        {loading && <div className="li muted small" role="status">Loading events…</div>}
        {(data?.events ?? []).map((e) => (
          <Link key={e.id} to={`/events/${e.id}`} className="li evrow">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "var(--ink)", fontWeight: 600 }}>{e.name}</div>

              <CoverageLine level={e.coverage.level} text={e.coverage.text} />
            </div>
            <Icon n="chev" s={16} />
          </Link>
        ))}
      </div>
    </div>
  );
}

/** docs/demo-plan.md: Onni, six, added two weeks before the wedding, allergic to tree nuts. */
const ONNI = { id: "onni", label: "Tree nuts (Onni)", count: 1, constraints: { claims: [] as string[], avoidAllergens: ["AN"], labels: [] as string[] }, standing: false };

export function EventPage() {
  const { id } = useParams();
  const { me, people, status, refresh } = useApp();
  const { data, error, reload } = useLoad(() => api.event(id!), [id]);
  const { data: rules } = useLoad(() => api.rules(), []);
  const { data: orders } = useLoad(() => api.orders(id), [id]);
  const [view, setView] = useState<"dish" | "money" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ cls: string; text: string } | null>(null);
  const [change, setChange] = useState<ChangeResp | null>(null);
  const [guests, setGuests] = useState<number | "">("");
    const [addOnni, setAddOnni] = useState(false);
    const [drill, setDrill] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ current: StoredEvent; retry: (v: number) => Promise<unknown> } | null>(null);

  if (error && !data) return <div className="callout red">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const { event: ev, coverage, decisions, warnings, questions } = data;
  const plan = data.orderPlan ?? data.viability;
  const v = view ?? (me.role === "approver" ? "money" : "dish");
  const { mine: openQs, others } = splitMine(questions.filter((q) => q.state === "open" || q.state === "waiting"), me, people);
  const order = orders?.orders.find((o) => o.state !== "rejected") ?? null;

  async function act(key: string, fn: () => Promise<unknown>, scene?: SceneKey, retryWith?: (ver: number) => Promise<unknown>) {
    setBusy(key);
    setMsg(null);
    setConflict(null);
    try {
      if (scene && status?.clock.scene !== scene) await api.clock(scene);
      await fn();
      reload();
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.error === "edit_conflict") {
        setConflict({ current: e.body.current, retry: retryWith ?? (async () => reload()) });
      } else setMsg({ cls: "red", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const changeDone = (r: ChangeResp) => {
    setChange(r);
    setMsg({ cls: r.applied ? "green" : "yellow", text: r.applied ? "Applied" : (r as { held?: boolean }).held ? "Allergy first" : "Sent for approval" });
  };

  // Guarded edits take the version, so a conflict can retry with the current one.
  const doGuests = (ver: number) => api.guests(ev.id, Number(guests), ver);
  const doChange = (ver: number) => api.change(ev.id, { guests: guests === "" ? undefined : Number(guests), group: addOnni ? ONNI : undefined }, ver);
    const changeScene = (status?.clock.scene === "4" ? "4" : "3") as SceneKey;
  async function removeWith(l: PlanLine, ver: number) {
    for (const n of l.needIds) {
      const r = await api.removeNeed(ev.id, n, ver);
      ver = r.event.version;
    }
    setMsg({ cls: "green", text: "Removed" });
  }
  const removeLine = (l: PlanLine) => act("remove", () => removeWith(l, ev.version), undefined, (ver) => removeWith(l, ver));
  async function guarded(key: string, fn: (ver: number) => Promise<ChangeResp>, scene: SceneKey) {
    setBusy(key);
    setMsg(null);
    setConflict(null);
    try {
      if (status?.clock.scene !== scene) await api.clock(scene);
      changeDone(await fn(ev.version));
      setGuests("");
      setAddOnni(false);
      reload();
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body?.error === "edit_conflict") {
        setConflict({ current: e.body.current, retry: async (ver) => changeDone(await fn(ver)) });
      } else setMsg({ cls: "red", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const gaps = plan ? sortGapsFirst(plan.lines, warnings).filter((l) => isGap(lineStatus(l, warnings))) : [];
  const decisionText = `${plural(decisions.confirmations, "confirmation")}, ${plural(decisions.decisions, "decision")}`;
  const sc = status?.clock.scenes;

  return (
    <div className="page stack-l">
      <div>

        <h1>{ev.name}</h1>
        <div className="row small" style={{ gap: 10, flexWrap: "wrap", marginTop: 2 }}>
          <span>
            <Icon n="cal" s={14} /> {day(ev.serviceDate)}
          </span>
          <span>
            <Icon n="users" s={14} /> {ev.guests} guests
          </span>
          {ev.dietGroups.map((g) => (
            <span key={g.id} className="tag">
              {g.label} {g.count}
            </span>
          ))}
          <span className="muted" title={decisionText}>{plural(decisions.decisions, "decision")}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <CoverageLine level={coverage.level} text={coverage.text} />
        </div>
      </div>

      <ProcessingTime processing={ev.processing} />

      <div className="scenebar">
        <SceneCard n="1" title="Viability" time={sc?.["1"]?.time} on={status?.clock.scene === "1"}>
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => act("via", () => api.viability(ev.id), "1")}>
            {busy === "via" ? "…" : "Check"}
          </button>
        </SceneCard>
        <SceneCard n="2" title="Order" time={sc?.["2"]?.time} on={status?.clock.scene === "2"}>
          <button type="button" className="btn sm primary" disabled={!!busy} onClick={() => act("order", () => api.orderEvent(ev.id), "2")}>
            {busy === "order" ? "…" : "Order"}
          </button>
        </SceneCard>
        <SceneCard n="3" title="Change" time={sc?.["3"]?.time} on={status?.clock.scene === "3"}>
          <div className="row" style={{ gap: 6 }}>
            <input type="number" min={0} placeholder={String(ev.guests)} value={guests} onChange={(e) => setGuests(e.target.value === "" ? "" : Number(e.target.value))} aria-label="New guest count" className="sminput" />
            <span className="small muted">guests</span>
          </div>
          {!ev.dietGroups.some((g) => g.id === "onni") && (
            <label className="row small" style={{ gap: 6 }}>
              <input type="checkbox" checked={addOnni} onChange={(e) => setAddOnni(e.target.checked)} /> Onni: tree nuts
            </label>
          )}
          <button type="button" className="btn sm" disabled={!!busy || (guests === "" && !addOnni)} onClick={() => guarded("chg", doChange, changeScene)}>
            {busy === "chg" ? "…" : "Apply"}
          </button>
        </SceneCard>
        <SceneCard n="4" title="Final check" time={sc?.["4"]?.time} on={status?.clock.scene === "4"}>
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => act("fc", () => api.finalCheck(ev.id), "4")}>
            {busy === "fc" ? "…" : "Check"}
          </button>
          <button type="button" className="btn sm danger" disabled={!!busy} onClick={() => act("cut", () => api.cutoff(ev.id), "4")}>
            {busy === "cut" ? "…" : "Cut-off"}
          </button>
        </SceneCard>
      </div>

      {msg && <div className={`callout ${msg.cls} small`}>{msg.text}</div>}
      {conflict && (
        <div className="callout yellow small stack">
          <div>
            <b>Changed by {conflict.current.changes.at(-1)?.by ?? "someone"}</b>: {conflict.current.changes.at(-1)?.what}
          </div>
          <div className="row">
            <button
              type="button"
              className="btn sm primary"
              onClick={() => {
                const c = conflict;
                setConflict(null);
                act("retry", () => c.retry(c.current.version));
              }}
            >
              Confirm again
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setConflict(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(openQs.length > 0 || others.length > 0) && (
        <section>
          <div className="sechead">
            <h2>Questions for you</h2>
            {openQs.length > 0 && <span className="countb">{openQs.length}</span>}
          </div>
          <div className="qlist">
            {openQs.map((q) => (
              <QuestionCard key={q.id} q={q} compact />
            ))}
          </div>
          <OthersWaiting others={others} />
        </section>
      )}

      {plan && (
        <>

          {gaps.length > 0 && (
            <Section title={<span style={{ color: "var(--red)" }}>Gaps ({gaps.length})</span>}>
              <LinesList plan={{ ...plan, lines: gaps }} warnings={warnings} onRemove={removeLine} />
            </Section>
          )}
          <Section
            title={
              <>
                {data.orderPlan ? "Order" : "Viability"}
                {plan.timings && (
                  <span className="small muted" style={{ fontWeight: 400, marginLeft: 8 }} title="Measured while the agent ran">
                    {plan.timings.products} products checked in {(plan.timings.totalMs / 1000).toFixed(1)} s
                  </span>
                )}
              </>
            }
            aside={
              <div className="seg">
                <button type="button" className={v === "dish" ? "on" : ""} onClick={() => setView("dish")}>
                  Dishes
                </button>
                <button type="button" className={v === "money" ? "on" : ""} onClick={() => setView("money")}>
                  Money
                </button>
              </div>
            }
          >
            {v === "dish" ? (
              <DishView plan={plan} warnings={warnings} onRemove={removeLine} />
            ) : (
              <MoneyView plan={plan} warnings={warnings} cap={rules?.mandate.spendCapEur ?? null} vatOrder={order} onRemove={removeLine} />
            )}
          </Section>
        </>
      )}
      {!plan && <div className="empty">Start with 1.</div>}

      {(ev.lastDiff || change?.diff) && (
        <Section title="Changes">
          <DiffView diff={(change?.diff ?? ev.lastDiff)!} />
        </Section>
      )}

      {plan && plan.lines.length > 0 && (
        <Section title="Cut-offs">
          <CutoffBoard lines={plan.lines} />
        </Section>
      )}

      {ev.finalCheck && (
        <Section title="Final check" aside={<span className="small">{when(ev.finalCheck.at)}</span>}>

          {ev.finalCheck.lines.map((l, i) => (
            <div key={i} className="li">
              <Status k={fcKind(l.result)} />
              <span className="trunc" style={{ flex: 1 }} title={l.detail}>
                {l.productName}
              </span>

            </div>
          ))}
        </Section>
      )}

      <div className="row small" style={{ gap: 12, flexWrap: "wrap" }}>
        <Link to={`/audit?eventId=${ev.id}`}>Audit log</Link>
        <button
          type="button"
          className="btn sm ghost drillbtn"
          title="Not part of the product. A script posing as an outside agent sends an order over budget with no approval."
          onClick={async () => {
            const r = await api.drill();
            setDrill(`Demo only · outside agent asked for ${r.quote.total.toFixed(2)} € with no approval (budget ${r.quote.cap} €). Gateway: HTTP ${r.status} ${r.refusal.error}`);
          }}
        >
          Demo only: safety drill
        </button>
      </div>
      {drill && <div className="callout red small drillout">{drill}</div>}
    </div>
  );
}

function fcKind(r: string) {
  switch (r) {
    case "covered":
      return "covered" as const;
    case "covered_at_risk":
      return "covered_at_risk" as const;
    case "short":
    case "not_available":
      return "not_available" as const;
    case "price_changed":
      return "check" as const;
    case "allergy":
    case "allergy_warning":
      return "allergy_warning" as const;
    case "unresolved":
      return "unresolved" as const;
    case "blocked":
      return "blocked" as const;
    default:
      return "check" as const;
  }
}

function SceneCard({ n, title, time, on, children }: { n: string; title: string; time?: string; on: boolean; children: React.ReactNode }) {
  return (
    <div className={`scene ${on ? "on" : ""}`}>
      <div className="row" style={{ gap: 8 }}>
        <span className="scenenum">{n}</span>
        <div>
          <div style={{ color: "var(--ink)", fontWeight: 700, fontSize: 14 }}>{title}</div>

        </div>
      </div>
      <div className="sceneacts">{children}</div>
    </div>
  );
}
