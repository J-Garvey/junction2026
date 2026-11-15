/** Orders and receipts from the gateway. */
import { useState } from "react";
import type { Order } from "@aimo/contracts";
import { Link, useSearchParams } from "react-router";
import { api } from "../api";
import { useApp, useLoad, outletName } from "../ctx";
import { AllergenDataMark, Status } from "../ui/Status";
import { stockText } from "../ui/Popover";
import { day, eur, when } from "../format";
import { OrderItemDialog } from "../ui/OrderItemDialog";
import { LineCalculation, TotalCalculation, VatCalculation } from "../ui/CalculationEvidence";
import { CarbonEstimate } from "../ui/CarbonEstimate";

export function Orders() {
  const [sp] = useSearchParams();
  const eventId = sp.get("eventId") ?? undefined;
  const { outlets } = useApp();
  const { data, error, loading } = useLoad(() => api.orders(eventId), [eventId]);
  const orders = [...(data?.orders ?? [])].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const [selected, setSelected] = useState<{ line: Order["lines"][number]; order: Order } | null>(null);
  return (
    <div className="page stack-l">
      <div>
        <h1>Order receipts</h1>
        {eventId && (
          <Link to="/orders" className="small">All receipts</Link>
        )}
      </div>
      {error && <div className="callout red">{error}</div>}
      {loading && !data && <div className="muted">Loading…</div>}
      {data && !orders.length && <div className="empty">No order receipts yet.</div>}
      {orders.map((o) => (
        <div key={o.id} className="receipt">
          <div className="rl">
            <b>Order {o.id}</b>
            <span className="row" style={{ gap: 6 }}>
              <span className={`stamp ${o.state === "rejected" ? "block" : "order"}`}>{o.state}</span>
            </span>
          </div>
          <div className="rl muted">
            <span>Delivery {day(o.deliveryDate)}</span>
            <span>v{o.version}</span>
          </div>
          <div className="rl small">
            <span className="row" style={{ gap: 6 }}>
              {o.jws && (
                <a href="/.well-known/jwks.json" target="_blank" rel="noreferrer" className="stamp order" title="ES256 signature by Potato's gateway; verify with the public keys">
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
            <button type="button" key={l.lineNo} className={`rline item-dialog-trigger ${l.removed ? "removed" : ""}`} onClick={() => setSelected({ line: l, order: o })}>
              <div className="rl">
                <span className="trunc">
                  {l.quantity} {l.salesUnit ?? ""} {l.productName}
                </span>
                <span className="receipt-amount">{eur(l.lineTotal)}</span>
              </div>
              <AllergenDataMark line={l} />
              <CarbonEstimate line={l} />
              {(l.removed || l.stock.kind === "unknown") && (
                <div className="rl small muted">
                  <span className="row" style={{ gap: 6 }}>
                    {l.removed ? <span className="stamp block">Removed</span> : <Status k={l.riskAccepted ? "covered_at_risk" : "unknown_stock"} />}
                  </span>
                </div>
              )}
            </button>
          ))}
          <hr />
          <div className="rl">
            <span>Ex VAT</span>
            <b><TotalCalculation title={`order ${o.id} total`} total={o.totalExVat} lines={o.lines} note={`Saved receipt version ${o.version}, placed ${when(o.placedAt)}.`} /></b>
          </div>
          <div className="rl">
            <span>VAT</span>
            <span><VatCalculation totalVat={o.totalVat} lines={o.lines} scope={`order ${o.id}`} /></span>
          </div>

        </div>
      ))}
      {selected && (
        <OrderItemDialog
          eyebrow={`Order ${selected.order.id}`}
          title={selected.line.productName}
          description={selected.line.removed ? "This line was removed from the order." : selected.line.riskAccepted ? `Unconfirmed stock was accepted by ${selected.line.riskAccepted.by}.` : undefined}
          fields={[
            { label: "Quantity", value: `${selected.line.quantity} ${selected.line.salesUnit ?? ""}` },
            { label: "Unit price", value: eur(selected.line.unitPrice) },
            { label: "Line total", value: eur(selected.line.lineTotal) },
            { label: "Carbon estimate", value: <CarbonEstimate line={selected.line} /> },
            { label: "Product ID", value: selected.line.productId },
            { label: "Stock", value: stockText(selected.line.stock) },
            ...(selected.line.rules.some((r) => r.ruleId === "ALG-03") || selected.line.allergenDataAcknowledgement ? [{ label: "Allergen declaration", value: `Allergen data not confirmed${selected.line.allergenDataAcknowledgement ? `; ${selected.line.allergenDataAcknowledgement.by} chose to continue` : ""}. Safety is not confirmed.` }] : []),
            { label: "Delivery", value: day(selected.order.deliveryDate) },
            { label: "Placed by", value: selected.order.placedBy },
            { label: "Placed", value: when(selected.order.placedAt) },
            { label: "State", value: selected.line.removed ? "Removed" : selected.order.state },
          ]}
          onClose={() => setSelected(null)}
        ><LineCalculation line={selected.line} /></OrderItemDialog>
      )}
    </div>
  );
}
