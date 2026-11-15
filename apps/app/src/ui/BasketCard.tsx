import { Link } from "react-router";
import type { Basket } from "../api";
import { day, eur, plural } from "../format";
import { Icon } from "./icons";
import { OrderBy } from "./OrderBy";

export function BasketCard({ basket: b, role }: { basket: Basket; role: string }) {
  const levels = b.approvalLevels.filter((level) => level.count > 0);
  const waiting = levels.reduce((sum, level) => sum + level.count, 0);
  return (
    <Link to={`/baskets/${b.id}`} className={`btile${b.confirmed ? " confirmed" : ""}`}>
      <div className="btile-name">{b.name}</div>
      <div className="btile-context small muted">
        <span><Icon n="cal" s={14} /> Delivery {day(b.deliveryDate)}</span>
        {b.guests > 0 && <span>{plural(b.guests, "guest")}</span>}
      </div>
      <OrderBy deadline={b.orderBy} />
      <div className="btile-stats" aria-label="Order summary">
        <div><strong>{b.lines}</strong><span>Items in order</span></div>
        <div><strong>{eur(b.totalExVat)}</strong><span>Total ex VAT</span></div>
      </div>
      {levels.length > 0 && (
        <div className="btile-approvals" aria-label="Waiting for approval">
          {levels.map((level) => (
            <div key={level.role} className={level.role === role ? "current" : undefined}>
              <span>{level.role === "chef" ? "Chef review" : "Manager approval"}</span>
              <strong>{level.count}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="btile-foot small muted">
        {b.confirmed ? <span className="stamp order"><Icon n="check" s={14} /> Confirmed</span> : <span>{waiting > 0 ? `${waiting} waiting for approval` : "View order"}</span>}
        <Icon n="chev" s={16} />
      </div>
    </Link>
  );
}
