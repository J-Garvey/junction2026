import type { OrderDeadline } from "@aimo/contracts";
import { clockTime, day } from "../format";
import { Fixture } from "./Status";

export function OrderBy({ deadline, detail = false }: { deadline: OrderDeadline; detail?: boolean }) {
  return (
    <div className={`order-deadline small ${deadline.state}`}>
      <span className="order-deadline-label">Order by <Fixture show={deadline.usesFixtures} /></span>
      <strong title={deadline.reason ?? "Supplier cutoff in Helsinki time; terms are rechecked when ordering."}>
        {deadline.at ? <><time dateTime={deadline.at}>{day(deadline.at)}, {clockTime(deadline.at)}</time> Helsinki{deadline.state === "expired" && " · Expired"}</> : deadline.state === "unavailable" ? "Unavailable" : "Unknown"}
      </strong>
      {detail && deadline.reason && <span className="muted">{deadline.reason}</span>}
    </div>
  );
}
