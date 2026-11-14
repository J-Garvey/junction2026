/** D28: an unresolved allergy conflict shows the same warning on every screen. */
import { Link } from "react-router";
import type { WarningRecord } from "@aimo/contracts";
import { Icon } from "./icons";

export function AllergyBanner({ warnings }: { warnings: WarningRecord[] }) {
  const open = warnings.filter((w) => w.state === "open");
  if (!open.length) return null;
  return (
    <div className="allergy" role="alert">
      {open.map((w) => (
        <Link key={w.id} to={`/events/${w.eventId}`} className="allergy-row">
          <Icon n="alert" s={18} w={2.2} />
          <span>
            {w.text}
          </span>
        </Link>
      ))}
    </div>
  );
}
