/** Orders and receipts from the gateway. */
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import { useApp, useLoad, outletName } from "../ctx";
import { Fixture, Status } from "../ui/Status";
import { stockText } from "../ui/Popover";
import { day, eur, when } from "../format";

export function Orders() {
  const [sp] = useSearchParams();
  const eventId = sp.get("eventId") ?? undefined;
  const { outlets } = useApp();
  const { data, error, loading } = useLoad(() => api.orders(eventId), [eventId]);
  const orders = [...(data?.orders ?? [])].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  return (
    <div className="page stack-l">
      <div>
        <h1>Orders</h1>
        {eventId && (
          <Link to="/orders" className="small">All orders</Link>
        )}
      </div>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted">Loading…</div>}
      {data && !orders.length && <div className="empty">No orders yet.</div>}
      {orders.map((o) => (
        <div key={o.id} className="receipt">
          <div className="rl">
            <b>Order {o.id}</b>
            <span className="row" style={{ gap: 6 }}>
              <span className={`stamp ${o.state === "rejected" ? "block" : "order"}`}>{o.state}</span>
              <Fixture show={o.lines.some((l) => l.source === "fixture")} />
            </span>
          </div>
          <div className="rl muted">
            <span>Delivery {day(o.deliveryDate)}</span>
            <span>v{o.version}</span>
          </div>
          <div className="rl small">
            <span className="row" style={{ gap: 6 }}>
              {o.jws && (
                <a href="/.well-known/jwks.json" target="_blank" rel="noreferrer" className="stamp order" title="ES256 signature by Valio Aimo's gateway; verify with the public keys">
                  Signed
                </a>
              )}
              <a href={`/gateway/v1/orders/${o.id}/peppol`} target="_blank" rel="noreferrer">
                Peppol XML
              </a>
            </span>
          </div>
          <hr />
          {o.lines.map((l) => (
            <div key={l.lineNo} className={`rline ${l.removed ? "removed" : ""}`}>
              <div className="rl">
                <span className="trunc">
                  {l.quantity} {l.salesUnit ?? ""} {l.productName}
                </span>
                <span>{eur(l.lineTotal)}</span>
              </div>
              {(l.removed || l.stock.kind === "unknown") && (
                <div className="rl small muted">
                  <span className="row" style={{ gap: 6 }}>
                    {l.removed ? <span className="stamp block">Removed</span> : <Status k={l.riskAccepted ? "covered_at_risk" : "unknown_stock"} />}
                  </span>
                </div>
              )}
            </div>
          ))}
          <hr />
          <div className="rl">
            <span>Ex VAT</span>
            <b>{eur(o.totalExVat)}</b>
          </div>
          <div className="rl">
            <span>VAT</span>
            <span>{eur(o.totalVat)}</span>
          </div>

        </div>
      ))}
    </div>
  );
}
