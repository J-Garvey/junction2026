import type { OrderDeadline } from "@aimo/contracts";
import { clockTime, day } from "../format";
import { Fixture } from "./Status";

export function OrderBy({ deadline, detail = false }: { deadline: OrderDeadline; detail?: boolean }) {
  return (
    <div className={`order-deadline small ${deadline.state}`}>
      <div className="order-deadline-label">
        Order by
        {deadline.excludedItems > 0 && (
          <details className="order-deadline-info popwrap" onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.open = false;
              e.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary aria-label="About items with unknown delivery information"><sup aria-hidden="true">i</sup></summary>
            <div className="popover" role="note">
              {deadline.at && <p>This deadline covers only items with known delivery information.</p>}
              <p>{deadline.excludedItems} {deadline.excludedItems === 1 ? "item was" : "items were"} excluded from the calculation because delivery dates, schedules or cutoffs are unknown. Their delivery remains unconfirmed.</p>
              <p>Check these items with the supplier before relying on their delivery. Ordering terms and stock are rechecked when ordering.</p>
            </div>
          </details>
        )}
        <Fixture show={deadline.usesFixtures} />
      </div>
      <strong title={deadline.reason ?? "Supplier cutoff in Helsinki time; terms are rechecked when ordering."}>
        {deadline.at ? <><time dateTime={deadline.at}>{day(deadline.at)}, {clockTime(deadline.at)}</time> Helsinki{deadline.state === "expired" && " · Expired"}</> : deadline.state === "unavailable" ? "Unavailable" : "Unknown"}
      </strong>
      {deadline.reason && (detail || deadline.unconfirmedStockItems > 0 || deadline.state === "unknown") && <span className="muted">{deadline.reason}</span>}
    </div>
  );
}
