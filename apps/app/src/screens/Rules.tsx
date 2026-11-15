/** Rules: the hotel's mandate and every rule's outcome and limits. Approvers edit; everyone else reads. */
import { useMemo, useState } from "react";
import { api, ApiError, type Outcome, type ParamDef, type ParamValue, type RuleDef, type RulesResp } from "../api";
import { useLoad } from "../ctx";
import { eur, when } from "../format";
import { Icon } from "../ui/icons";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OUTCOME_NAME: Record<Outcome, string> = { order: "Order", ask_chef: "Ask chef", ask_approver: "Ask approver", block: "Block" };
const OUTCOME_CLS: Record<Outcome, string> = { order: "order", ask_chef: "ask", ask_approver: "ask", block: "block" };
const MANDATE_TILE = ["spendCapEur", "deliveryDays", "holidays", "blockedProducts"];
const PRE_KEYS = new Set(["unknownStockMaxLineEur", "partialFillMaxShortPct", "overshootMaxPct", "overshootMaxEur", "priceRiseMaxPct", "guestChangeMaxPct"]);

type Draft = { outcomes: Record<string, Outcome>; params: Record<string, ParamValue> };
const emptyDraft = (): Draft => ({ outcomes: {}, params: {} });

function savedValue(data: RulesResp, key: string): ParamValue {
  const d = data.params[key];
  if (!d) return null;
  if (d.scope === "policy") return data.policy.params[key] ?? null;
  const m = data.mandate as unknown as Record<string, unknown>;
  return (PRE_KEYS.has(key) ? (data.mandate.preAnswers as Record<string, unknown>)[key] : m[key]) as ParamValue;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A number outside its range, or not a number, blocks saving. */
function paramError(d: ParamDef, v: ParamValue): string | null {
  if (v === null) return d.nullLabel ? null : "Needs a number";
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return "Needs a number";
  if (d.min !== undefined && v < d.min) return `At least ${fmtNum(d, d.min)}`;
  if (d.max !== undefined && v > d.max) return `At most ${fmtNum(d, d.max)}`;
  return null;
}
const fmtNum = (d: ParamDef, v: number) => (d.kind === "fraction" ? `${Math.round(v * 100)} %` : d.kind === "eur" ? eur(v) : `${v}${d.unit ? ` ${d.unit}` : ""}`);

export function Rules() {
  const { data, error, setData } = useLoad(() => api.rules(), []);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState<"all" | "editable" | "changed">("all");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[] | null>(null);

  const value = (key: string): ParamValue => (key in draft.params ? draft.params[key] : data ? savedValue(data, key) : null);
  const outcome = (r: RuleDef): Outcome => draft.outcomes[r.id] ?? r.outcome;

  const pending = useMemo(() => {
    if (!data) return { outcomes: {}, params: {}, count: 0 };
    const outcomes = Object.fromEntries(Object.entries(draft.outcomes).filter(([id, o]) => data.rules.find((r) => r.id === id)?.outcome !== o));
    const params = Object.fromEntries(Object.entries(draft.params).filter(([k, v]) => !same(savedValue(data, k), v)));
    return { outcomes, params, count: Object.keys(outcomes).length + Object.keys(params).length };
  }, [data, draft]);

  const invalid = data ? Object.entries(pending.params).some(([k, v]) => data.params[k] && paramError(data.params[k], v)) : false;

  if (error) return <div className="callout red">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const ro = !data.canEdit;

  const setOutcome = (id: string, o: Outcome) => { setSaved(null); setDraft((d) => ({ ...d, outcomes: { ...d.outcomes, [id]: o } })); };
  const setParam = (key: string, v: ParamValue) => { setSaved(null); setDraft((d) => ({ ...d, params: { ...d.params, [key]: v } })); };

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.saveRules({ outcomes: pending.outcomes, params: pending.params });
      setData(r);
      setDraft(emptyDraft());
      setSaved(r.changes ?? []);
    } catch (e) {
      setSaveError(e instanceof ApiError ? (e.body as any)?.error ?? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function resetAll() {
    if (!window.confirm("Put every rule and limit back to the defaults?")) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.resetRules();
      setData(r);
      setDraft(emptyDraft());
      setSaved(r.changes ?? []);
    } catch (e) {
      setSaveError(e instanceof ApiError ? (e.body as any)?.error ?? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // "Changed" compares the effective values with defaults; pending only tracks unsaved edits.
  const isChanged = (r: RuleDef) => outcome(r) !== r.defaultOutcome || (r.control.params ?? []).some((k) => !same(value(k), data.defaultParams[k]));
  const editable = (r: RuleDef) => r.control.choices.length > 1 || (r.control.params ?? []).length > 0;
  const shown = data.rules.filter((r) => (filter === "all" ? true : filter === "editable" ? editable(r) : isChanged(r)));
  const byArea = new Map<string, RuleDef[]>();
  for (const r of shown) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const nEditable = data.rules.filter(editable).length;

  const param = (key: string) => {
    const d = data.params[key];
    return d ? <ParamInput key={key} def={d} value={value(key)} onChange={(v) => setParam(key, v)} disabled={ro} dirty={key in pending.params} /> : null;
  };

  return (
    <div className="page stack-l rules-page">
      <div className="rules-head">
        <div>
          <h1>Rules</h1>
          <div className="small muted">
            {data.policy.updatedBy ? `Last changed by ${data.policy.updatedBy}, ${when(data.policy.updatedAt!)}` : "Default rules"} · mandate v{data.mandate.version}
          </div>
        </div>
        {!ro && <button className="btn sm ghost" onClick={resetAll} disabled={saving}><Icon n="refresh" s={15} /> Reset to defaults</button>}
      </div>

      {ro && <div className="callout yellow">Only an approver can change these rules. You can see what the agent checks and what it does.</div>}
      {saved && <div className="callout green">{saved.length ? <>Saved. The next quote uses the new rules; quotes already made keep the rules they were checked with.<ul className="small">{saved.map((c) => <li key={c}>{c}</li>)}</ul></> : "Nothing changed."}</div>}

      <section className="tile">
        <div className="tile-h"><h3>Hotel mandate</h3><span className="act">Signed; outside agents read it too</span></div>
        <div className="tile-b">
          <div className="mandate-grid">
            {MANDATE_TILE.map((k) => param(k))}
            <div className="pfield">
              <span className="plabel">Delivery sites</span>
              <span className="small">{data.mandate.sites.map((s) => s.name).join(", ")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="tile">
        <div className="tile-h">
          <h3>Rules ({data.rules.length})</h3>
          <span className="act">{nEditable} can change · {data.rules.length - nEditable} locked</span>
          <div className="seg rule-filter" role="tablist">
            {(["all", "editable", "changed"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} role="tab" aria-selected={filter === f}>
                {f === "all" ? "All" : f === "editable" ? "Can change" : "Changed"}
              </button>
            ))}
          </div>
        </div>
        <div className="tile-b">
          {!shown.length && <div className="muted small">No rules changed from the defaults.</div>}
          {[...byArea.entries()].map(([area, rs]) => (
            <div key={area} className="rulearea">
              <h4>{area}</h4>
              {rs.map((r) => (
                <RuleRow key={r.id} rule={r} current={outcome(r)} onOutcome={(o) => setOutcome(r.id, o)} disabled={ro} changed={isChanged(r)}>
                  {(r.control.params ?? []).map((k) => param(k))}
                </RuleRow>
              ))}
            </div>
          ))}
        </div>
      </section>

      {data.remembered.length > 0 && (
        <section className="tile">
          <div className="tile-h"><h3>Remembered swaps</h3></div>
          <div className="tile-b">
            <table className="t">
              <thead><tr><th>Dish</th><th>Original</th><th>Substitute</th><th className="hide-m">Approved by</th></tr></thead>
              <tbody>
                {data.remembered.map((r, i) => (
                  <tr key={i}>
                    <td>{r.dish}</td>
                    <td className="mono small">{r.original}</td>
                    <td className="mono small">{r.sub}</td>
                    <td className="small hide-m">{r.by}, {when(r.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="tile">
        <div className="tile-h"><h3>Gateway</h3></div>
        <div className="tile-b stack">
          <div className="code">
            <span className="k">GET</span> {origin}/gateway/v1/…{"\n"}
            Authorization: Bearer <span className="s">{data.tokens.outsideAgent}</span>
          </div>
          <a className="btn sm" href="/openapi.json" target="_blank" rel="noreferrer">OpenAPI spec</a>
        </div>
      </section>

      {(pending.count > 0 || saveError) && (
        <div className="savebar" role="region" aria-label="Unsaved rule changes">
          <span className="small">{saveError ? <span className="err">{saveError}</span> : invalid ? <span className="err">Fix the highlighted values</span> : `${pending.count} unsaved change${pending.count === 1 ? "" : "s"}`}</span>
          <button className="btn sm ghost" onClick={() => { setDraft(emptyDraft()); setSaveError(null); }} disabled={saving}>Discard</button>
          <button className="btn sm primary" onClick={save} disabled={saving || invalid || !pending.count}>{saving ? "Saving…" : "Save rules"}</button>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, current, onOutcome, disabled, changed, children }: { rule: RuleDef; current: Outcome; onOutcome: (o: Outcome) => void; disabled: boolean; changed: boolean; children: React.ReactNode }) {
  const c = rule.control;
  const locked = c.choices.length === 1;
  const name = (o: Outcome) => c.names?.[o] ?? OUTCOME_NAME[o];
  const hasParams = (c.params ?? []).length > 0;
  return (
    <div className={`rulerow${changed ? " changed" : ""}`}>
      <div className="rr-name">
        <div className="rr-title">
          <span className="mono small muted">{rule.id}</span>
          <b>{rule.label}</b>
          {c.active === false && <span className="stamp unknown" title="Nothing in this build fires this rule yet">Not used yet</span>}
          {changed && <span className="stamp info">Changed</span>}
        </div>
        <div className="small muted">{rule.trigger}</div>
      </div>
      <div className="rr-outcome">
        {locked ? (
          <div className="rr-locked" title={c.lock}>
            <span className={`stamp ${OUTCOME_CLS[current]}`}>{name(current)}</span>
            <span className="small muted"><Icon n="lock" s={13} /> {c.lock}</span>
          </div>
        ) : (
          <>
            <div className="seg outcome-seg" role="radiogroup" aria-label={`${rule.id} outcome`}>
              {c.choices.map((o) => (
                <button key={o} role="radio" aria-checked={current === o} className={current === o ? `on ${OUTCOME_CLS[o]}` : ""} disabled={disabled} onClick={() => onOutcome(o)}>
                  {name(o)}
                </button>
              ))}
            </div>
            {current !== rule.defaultOutcome && <div className="small muted">Default: {name(rule.defaultOutcome)}</div>}
          </>
        )}
      </div>
      {hasParams && <div className="rr-params">{children}</div>}
    </div>
  );
}

function ParamInput({ def, value, onChange, disabled, dirty }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void; disabled: boolean; dirty: boolean }) {
  const err = paramError(def, value);
  const cls = `pfield${dirty ? " dirty" : ""}${err ? " bad" : ""}`;
  if (def.kind === "bool")
    return (
      <label className={`${cls} pcheck`}>
        <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="small">{def.label}</span>
      </label>
    );
  if (def.kind === "weekdays") {
    const days = (value as number[] | null) ?? [];
    return (
      <div className={cls}>
        <span className="plabel">{def.label}</span>
        <div className="daypick">
          {DAY_ORDER.map((d) => (
            <label key={d} className={`daychip${days.includes(d) ? " on" : ""}`}>
              <input type="checkbox" checked={days.includes(d)} disabled={disabled || (days.length === 1 && days.includes(d))} onChange={(e) => onChange(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))} />
              {DAY[d]}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (def.kind === "dates" || def.kind === "products") return <ListInput def={def} value={(value as string[] | null) ?? []} onChange={onChange} disabled={disabled} cls={cls} />;

  const nullable = Boolean(def.nullLabel);
  const off = nullable && value === null;
  const shownNum = typeof value === "number" ? (def.kind === "fraction" ? +(value * 100).toFixed(2) : value) : "";
  const k = def.kind === "fraction" ? 100 : 1;
  const unit = def.kind === "fraction" ? def.unit ?? "%" : def.unit;
  return (
    <div className={cls}>
      <span className="plabel">{def.label}</span>
      <div className="pnum">
        {nullable && (
          <label className="pcheck small">
            <input type="checkbox" checked={off} disabled={disabled} onChange={(e) => onChange(e.target.checked ? null : def.kind === "eur" ? 100 : 10)} />
            {def.nullLabel}
          </label>
        )}
        {!off && (
          <>
            <input
              type="number"
              inputMode="decimal"
              className="sminput"
              value={shownNum}
              min={def.min !== undefined ? def.min * k : undefined}
              max={def.max !== undefined ? def.max * k : undefined}
              step={def.step !== undefined ? +(def.step * k).toFixed(4) : undefined}
              disabled={disabled}
              aria-label={def.label}
              onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value) / k)}
            />
            {unit && <span className="small muted">{unit}</span>}
          </>
        )}
      </div>
      {err ? <span className="small err">{err}</span> : def.help ? <span className="small muted">{def.help}</span> : null}
    </div>
  );
}

function ListInput({ def, value, onChange, disabled, cls }: { def: ParamDef; value: string[]; onChange: (v: string[]) => void; disabled: boolean; cls: string }) {
  const [text, setText] = useState("");
  const isDate = def.kind === "dates";
  const add = () => {
    const v = text.trim();
    if (!v || value.includes(v)) return setText("");
    onChange([...value, v].sort());
    setText("");
  };
  const label = (v: string) => (isDate ? new Date(`${v}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : v);
  return (
    <div className={cls}>
      <span className="plabel">{def.label}</span>
      <div className="plist">
        {value.length === 0 && <span className="small muted">None</span>}
        {value.map((v) => (
          <span key={v} className={`chip${isDate ? "" : " mono"}`}>
            {label(v)}
            {!disabled && <button aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>×</button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="pnum">
          <input
            type={isDate ? "date" : "text"}
            className="sminput"
            value={text}
            placeholder={isDate ? undefined : "Product code"}
            aria-label={`Add to ${def.label}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button className="btn sm" onClick={add} disabled={!text.trim()}>Add</button>
        </div>
      )}
    </div>
  );
}
