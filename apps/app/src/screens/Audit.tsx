/** AP-05, VA-06: the audit log, as the hotel or as Valio Aimo sees it. */
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import { useLoad } from "../ctx";
import { Fixture, RuleChip } from "../ui/Status";
import { when, fi, ROLE_LABEL } from "../format";

export function Audit() {
  const [sp] = useSearchParams();
  const eventId = sp.get("eventId") ?? undefined;
  const [viewer, setViewer] = useState<"hotel" | "valio">("hotel");
  const [q, setQ] = useState("");
  const { data, error, loading } = useLoad(() => api.audit(viewer, eventId), [viewer, eventId]);
  const entries = (data?.entries ?? []).filter((e) => !q || `${e.summary} ${e.action} ${e.actor.name} ${e.ruleIds.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page stack-l">
      <div className="row" style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <div>
          <h1>Audit log</h1>
          {eventId && (
            <Link to="/audit" className="small">All entries</Link>
          )}
        </div>
        <label className="row small" style={{ gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={viewer === "valio"} onChange={(e) => setViewer(e.target.checked ? "valio" : "hotel")} />
          Valio Aimo view
        </label>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {data && (
          <span className={`stamp ${data.chain.ok ? "order" : "block"}`}>
            {data.chain.ok ? "Chain intact" : `Chain broken at #${data.chain.brokenAt}`}
          </span>
        )}

        <input className="search" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted">Loading…</div>}
      <div className="card audit">
        <table className="t">
          <thead>
            <tr>
              <th>Time</th>
              <th>Who</th>
              <th>What</th>
              <th className="hide-m">Seen by</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="small mono nowrap">
                  {when(e.simTime)}

                </td>
                <td className="small">
                  <b>{e.actor.name}</b>

                </td>
                <td>
                  <div className="row small" style={{ gap: 6, flexWrap: "wrap" }}>

                    {e.ruleIds.map((r) => (
                      <RuleChip key={r} id={r} />
                    ))}
                    <Fixture show={e.usesFixture} />
                  </div>
                  <div style={{ color: "var(--ink)" }}>{e.summary}</div>
                  {e.judgements.length > 0 && (
                    <details className="small">
                      <summary className="muted">Model ({e.judgements.length})</summary>
                      {e.judgements.map((j, i) => (
                        <div key={i} className="muted">
                          {j.question} {j.verdict}, p {j.probability == null ? "none" : fi(j.probability, 2)} (fact ≥ {fi(j.threshold.fact, 2)}, reject ≤ {fi(j.threshold.reject, 2)}), {j.source.replace("_", " ")}
                        </div>
                      ))}
                    </details>
                  )}

                </td>
                <td className="hide-m">
                  <span className={`stamp ${e.visibility === "shared" ? "info" : "unknown"}`}>{e.visibility === "shared" ? "Shared" : "Hotel"}</span>
                </td>
              </tr>
            ))}
            {data && !entries.length && (
              <tr>
                <td colSpan={4} className="muted">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
