import type { OrderDeadline } from "@aimo/contracts";
import type { ReactNode } from "react";
import { clockTime, day } from "../format";

const CUTOFF_NOTE = "Supplier ordering cutoff; stock and delivery terms are rechecked when ordering.";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="order-deadline-info popwrap"
      onMouseEnter={(e) => { e.currentTarget.open = true; }}
      onMouseLeave={(e) => { e.currentTarget.open = false; }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}>
      <summary aria-label={label}><sup aria-hidden="true">i</sup></summary>
      <div className="popover" role="note">{children}</div>
    </details>
  );
}

function Excluded({ deadline }: { deadline: OrderDeadline }) {
  return (
    <>
      {deadline.at && <p>This deadline covers only items with known delivery information.</p>}
      <p>{deadline.excludedItems} {deadline.excludedItems === 1 ? "item was" : "items were"} excluded from the calculation because delivery dates, schedules or cutoffs are unknown. Their delivery remains unconfirmed.</p>
      <p>Check these items with the supplier before relying on their delivery. Ordering terms and stock are rechecked when ordering.</p>
    </>
  );
}

export function OrderBy({ deadline, detail = false }: { deadline: OrderDeadline; detail?: boolean }) {
  const when = deadline.at ? <><time dateTime={deadline.at}>{day(deadline.at)}, {clockTime(deadline.at)}</time>{deadline.state === "expired" && " · Expired"}</> : deadline.state === "unavailable" ? "Unavailable" : "Unknown";
  // Card: the cutoff only; every explanation sits behind the info marker.
  if (!detail) {
    return (
      <div className={`order-deadline small ${deadline.state}`}>
        <div className="order-deadline-label">
          <strong>{when}</strong>
          <Info label="About this ordering deadline">
            <p>{CUTOFF_NOTE}</p>
            {deadline.reason && <p>{deadline.reason}</p>}
            {deadline.excludedItems > 0 && <Excluded deadline={deadline} />}
          </Info>
        </div>
      </div>
    );
  }
  return (
    <div className={`order-deadline small ${deadline.state}`}>
      <div className="order-deadline-label">
        Order by
        <Info label="About this ordering deadline">
          <p>{CUTOFF_NOTE}</p>
          {deadline.reason && <p>{deadline.reason}</p>}
          {deadline.excludedItems > 0 && <Excluded deadline={deadline} />}
        </Info>
      </div>
      <strong>{when}</strong>
    </div>
  );
}
