/**
 * DLV-06: nothing arrives by the needed-by date. The person drops the request from the
 * quote or keeps it in the order for someone to review; nothing is ordered either way.
 */
import { useEffect, useState } from "react";
import type { Plan } from "@aimo/contracts";
import { api } from "../api";
import { day } from "../format";
import "../screens/baskets.css";

type TooLatePlan = Pick<Plan, "id" | "title"> & { tooLate?: Plan["tooLate"] };

export function tooLateText(t: NonNullable<Plan["tooLate"]>) {
  return `Nothing can arrive by ${day(t.neededBy)}. ${t.earliest ? `The earliest delivery is ${day(t.earliest)}.` : "No later delivery date is known yet."}`;
}

export function TooLateDialog({ plan, onDone }: { plan: TooLatePlan; onDone: (choice: "remove" | "review") => void }) {
  const [busy, setBusy] = useState<"remove" | "review" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = plan.tooLate!;
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function choose(choice: "remove" | "review") {
    setBusy(choice);
    setErr(null);
    try {
      await api.tooLate(plan.id, choice);
      onDone(choice);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="bmodal-back">
      <div className="bmodal" role="alertdialog" aria-modal="true" aria-labelledby="toolate-h" aria-describedby="toolate-b">
        <h2 id="toolate-h">No products available for delivery in time</h2>
        <div className="bmodal-item">{plan.title}</div>
        <p id="toolate-b">{tooLateText(t)}</p>
        {err && <div className="callout red small">{err}</div>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => choose("review")} autoFocus>
            {busy === "review" ? "…" : "Add to order for review"}
          </button>
          <button type="button" className="btn ghost" disabled={!!busy} onClick={() => choose("remove")}>
            {busy === "remove" ? "…" : "Remove from quote"}
          </button>
        </div>
      </div>
    </div>
  );
}
