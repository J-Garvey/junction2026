/** AP-05, VA-06: the audit log, as the hotel or as Valio Aimo sees it. */
import { Link, useSearchParams } from "react-router";
import type { AuditEntry } from "@aimo/contracts";
import { api } from "../api";
import { useLoad } from "../ctx";
import { Fixture } from "../ui/Status";
import { when, fi } from "../format";

type Viewer = "hotel" | "valio";
const TRAIL_KEYS = ["orderId", "quoteId", "approvalId"] as const;
const HOTEL_KEYS = ["eventId", "questionId", "planId"] as const;
const REFERENCE_LABEL = { orderId: "Order", quoteId: "Quote", approvalId: "Approval", eventId: "Event", questionId: "Question", planId: "Request" };

/** Only named, scalar references; never index arbitrary audit details or payloads. */
function references(entry: AuditEntry, viewer: Viewer) {
  return [...TRAIL_KEYS, ...(viewer === "hotel" ? HOTEL_KEYS : [])].flatMap((key) => {
    const stored = key in entry ? entry[key as keyof AuditEntry] : undefined;
    const ids = [stored, entry.details[key]].filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    return [...new Set(ids)].map((id) => ({ key, id }));
  });
}

function filterEntries(entries: AuditEntry[], viewer: Viewer, query: string) {
  const rows = entries.filter((e) => viewer !== "valio" || e.visibility === "shared").map((entry) => ({ entry, refs: references(entry, viewer) }));
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;

  // Follow explicit order/quote/approval edges only within this loaded, scoped response.
  // Event and request IDs must not join unrelated quote versions into one trail.
  const trail = new Set<string>();
  const related = new Set<AuditEntry>();
  const refKey = (ref: { key: string; id: string }) => `${ref.key}:${ref.id.toLowerCase()}`;
  for (const row of rows) {
    if (row.refs.some((ref) => TRAIL_KEYS.some((key) => key === ref.key) && ref.id.toLowerCase().includes(needle))) {
      related.add(row.entry);
      row.refs.filter((ref) => TRAIL_KEYS.some((key) => key === ref.key)).forEach((ref) => trail.add(refKey(ref)));
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (related.has(row.entry) || !row.refs.some((ref) => trail.has(refKey(ref)))) continue;
      related.add(row.entry);
      row.refs.filter((ref) => TRAIL_KEYS.some((key) => key === ref.key)).forEach((ref) => trail.add(refKey(ref)));
      changed = true;
    }
  }
  return rows.filter(({ entry: e, refs }) => related.has(e) || [e.id, e.summary, e.action, e.actor.name, e.actor.id, ...e.ruleIds, ...refs.map((ref) => ref.id)].some((value) => value.toLowerCase().includes(needle)));
}

export function Audit() {
  const [sp] = useSearchParams();
  const eventId = sp.get("eventId") ?? undefined;
  const viewer = sp.get("viewer") === "valio" ? "valio" : "hotel";
  // Remount on scope changes so a pending supplier response cannot show hotel entries.
  return <AuditLog key={`${viewer}:${eventId ?? ""}`} viewer={viewer} eventId={eventId} />;
}

function AuditLog({ viewer, eventId }: { viewer: Viewer; eventId?: string }) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const { data, error, loading } = useLoad(() => api.audit(viewer, eventId), [viewer, eventId]);
  const entries = filterEntries(data?.viewer === viewer ? data.entries : [], viewer, q);
  const filterParams = (value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set("q", value);
    else next.delete("q");
    return next;
  };
  const allParams = new URLSearchParams(sp);
  allParams.delete("eventId");

  return (
    <div className="page stack-l">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <div>
          <h1>Audit log</h1>
          {eventId && (
            <Link to={{ pathname: "/audit", search: `?${allParams}` }} className="small">All entries</Link>
          )}
        </div>
        {data && (
          <span className={`stamp ${data.chain.ok ? "order" : "block"}`} role="status">
            {data.chain.ok ? "Hash chain verified" : `Hash chain broken at entry ${data.chain.brokenAt}`} · {data.chain.entries} entries
          </span>
        )}
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="audit-search">Filter audit log
          <input className="search audit-filter" aria-describedby="audit-filter-help" placeholder="Text or reference ID" value={q} onChange={(e) => setSp(filterParams(e.target.value), { replace: true })} />
        </label>
        {q && <button type="button" className="linkbtn small" onClick={() => setSp(filterParams(""), { replace: true })}>Clear filter</button>}
      </div>
      <p id="audit-filter-help" className="small muted">Filter by text or reference ID. Select an order, quote or approval reference to follow related entries in the loaded audit history.</p>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted">Loading…</div>}
      <div className="card audit" role="region" aria-label="Audit entries" tabIndex={0}>
        <table className="t">
          <thead>
            <tr>
              <th>Time</th>
              <th>Who</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ entry: e, refs }) => (
              <tr key={e.id}>
                <td className="small mono nowrap">
                  {when(e.simTime)}

                </td>
                <td className="small">
                  <b>{e.actor.name}</b>

                </td>
                <td>
                  <div className="row small" style={{ gap: 6, flexWrap: "wrap" }}>

                    <Fixture show={e.usesFixture} />
                  </div>
                  <div style={{ color: "var(--ink)" }}>{e.summary}</div>
                  {refs.length > 0 && (
                    <div className="row small" style={{ gap: "4px 12px", flexWrap: "wrap", overflowWrap: "anywhere" }} aria-label="References">
                      {refs.map((ref) => (
                        <Link key={`${ref.key}:${ref.id}`} to={{ pathname: "/audit", search: `?${filterParams(ref.id)}` }} title={`Filter by ${REFERENCE_LABEL[ref.key].toLowerCase()} ${ref.id}`}>
                          {REFERENCE_LABEL[ref.key]} <span className="mono">{ref.id}</span>
                        </Link>
                      ))}
                    </div>
                  )}
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
              </tr>
            ))}
            {data && !entries.length && (
              <tr>
                <td colSpan={3} className="muted">
                  {q.trim() ? "No entries match this filter." : "No entries."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
