/** Read-only rules: the hotel's mandate, the rule catalogue, fixed parameters and gateway access. */
import { api, type RuleDef } from "../api";
import { useLoad } from "../ctx";
import { eur, when } from "../format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OUTCOME: Record<string, { cls: string; text: string }> = {
  order: { cls: "order", text: "Order" },
  ask_approver: { cls: "ask", text: "Ask" },
  ask_chef: { cls: "ask", text: "Ask" },
  block: { cls: "block", text: "Blocked" },
};
const PRE: Record<string, (v: number | null) => string> = {
  partialFillMaxShortPct: (v) => (v == null ? "Always ask" : `Accept up to ${v} % short`),
  unknownStockMaxLineEur: (v) => (v == null ? "Always ask" : `Accept unknown stock up to ${eur(v)} a line`),
  overshootMaxPct: (v) => `Up to ${v} % extra from pack rounding`,
  overshootMaxEur: (v) => `and up to ${eur(v)} extra`,
  priceRiseMaxPct: (v) => `Accept price rises up to ${v} %`,
  guestChangeMaxPct: (v) => `Apply guest changes up to ${v} % without asking`,
};

export function Rules() {
  const { data, error } = useLoad(() => api.rules(), []);
  if (error) return <div className="callout red">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const m = data.mandate;
  const byArea = new Map<string, RuleDef[]>();
  for (const r of data.rules) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="page stack-l">
      <div>
        <h1>Rules</h1>

      </div>

      <section className="tile">
        <div className="tile-h">
          <h3>Hotel mandate</h3>

        </div>
        <div className="tile-b">
          <dl className="kv wide">
            <dt>Spend cap</dt>
            <dd>{eur(m.spendCapEur)} ex VAT</dd>
            <dt>Delivery days</dt>
            <dd>{m.deliveryDays.map((d) => DAYS[d]).join(", ")}</dd>

            {Object.entries(m.preAnswers).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>Auto-yes</dt>
                <dd>{PRE[k] ? PRE[k](v as number | null) : `${k}: ${v}`}</dd>
              </div>
            ))}
          </dl>

        </div>
      </section>

      <section className="tile">
        <div className="tile-h">
          <h3>Rules ({data.rules.length})</h3>
        </div>
        <div className="tile-b">
          {[...byArea.entries()].map(([area, rs]) => (
            <div key={area} className="rulearea">
              <h4>{area}</h4>
              <table className="t">
                <thead>
                  <tr>
                    <th>Rule</th>
                    <th />
                    <th>Outcome</th>

                  </tr>
                </thead>
                <tbody>
                  {rs.map((r) => (
                    <tr key={r.id}>
                      <td className="mono small nowrap">{r.id}</td>
                      <td className="small" title={r.trigger}>{r.label}</td>
                      <td>
                        <span className={`stamp ${OUTCOME[r.outcome]?.cls ?? "unknown"}`}>{OUTCOME[r.outcome]?.text ?? r.outcome}</span>

                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {data.remembered.length > 0 && <section className="tile">
        <div className="tile-h">
          <h3>Remembered swaps</h3>
        </div>
        <div className="tile-b">
          {data.remembered.length ? (
            <table className="t">
              <thead>
                <tr>
                  <th>Dish</th>
                  <th>Original</th>
                  <th>Substitute</th>
                  <th className="hide-m">Approved by</th>
                </tr>
              </thead>
              <tbody>
                {data.remembered.map((r, i) => (
                  <tr key={i}>
                    <td>{r.dish}</td>
                    <td className="mono small">{r.original}</td>
                    <td className="mono small">{r.sub}</td>
                    <td className="small hide-m">
                      {r.by}, {when(r.at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            null
            )}
            </div>
            </section>}

      <section className="tile">
        <div className="tile-h">
          <h3>Gateway</h3>
        </div>
        <div className="tile-b stack">

          <div className="code">
            <span className="k">GET</span> {origin}/gateway/v1/…{"\n"}
            Authorization: Bearer <span className="s">{data.tokens.outsideAgent}</span>
          </div>

          <a className="btn sm" href="/openapi.json" target="_blank" rel="noreferrer">
            OpenAPI spec
          </a>
        </div>
      </section>
    </div>
  );
}
