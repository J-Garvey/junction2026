import { CandidateRanking } from "./CandidateRanking";
import { useId, useRef, useState, type ReactNode } from "react";
import type { ModelJudgement, Need, PlanLine } from "@aimo/contracts";
import { eur, fi } from "../format";
import { stockText } from "./Popover";
import { selectionFunnel, type FunnelProduct } from "./selection-funnel-model";
import "./selection-funnel.css";

/** A disclosure keeps every stage keyboard reachable without opening a modal inside item review. */
function Disclosure({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  return <div className="selection-step" onKeyDown={(event) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} id={`${id}-label`} type="button" className="selection-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span aria-hidden="true">{open ? "▾" : "▸"}</span> {label}
    </button>
    <div id={id} role="region" aria-labelledby={`${id}-label`} hidden={!open}>
      {open && children}
    </div>
  </div>;
}

function Judgement({ judgement: j }: { judgement: ModelJudgement }) {
  const sources: Record<ModelJudgement["source"], string> = { hand_checked: "hand checked", model: "model", cache: "cached judgement", unavailable: "unavailable" };
  return <div className="selection-evidence small">
    <p>{j.question}</p>
    <p><b>{j.verdict === "unsure" ? "Uncertain" : j.verdict === "yes" ? "Yes" : "No"}</b> · {j.fn} · probability {j.probability == null ? "not recorded" : fi(j.probability, 2)} · source: {sources[j.source]}{j.model ? ` (${j.model})` : ""}</p>
    <p className="muted">Saved thresholds: fact ≥ {fi(j.threshold.fact, 2)}; reject ≤ {fi(j.threshold.reject, 2)}.</p>
  </div>;
}

function productJudgements(need: Need, productId: string) {
  // A candidate may carry the only judgement in an older snapshot. Prefer it to duplicate records.
  const candidate = need.candidates.find((c) => c.productId === productId)?.judgement;
  return [...new Map([...need.judgements.filter((j) => j.fn === "TYPE-CHECK" && j.subject === productId), ...(candidate ? [candidate] : [])]
    .map((j) => [`${j.fn}:${j.question}`, j])).values()];
}

export function SelectionFunnel({ need, lines }: { need: Need; lines: PlanLine[] }) {
  // Older event snapshots may carry dish allocations without selection evidence.
  if (need.pinnedProductId || !Array.isArray(need.candidates) || !Array.isArray(need.excluded) || !Array.isArray(need.judgements)) return null;
  const funnel = selectionFunnel(need);
  const selected = new Map(lines.filter((l) => !l.removed && l.quantity > 0 && l.productId && l.needIds.includes(need.id)).map((l) => [l.productId!, l]));
  const outsideRanking = [...selected.values()].filter((l) => !funnel.candidates.some((c) => c.productId === l.productId));
  const checked = funnel.products.filter((p) => productJudgements(need, p.productId).length);
  const uncertain = checked.filter((p) => productJudgements(need, p.productId).some((j) => j.verdict === "unsure"));
  const renderProducts = (products: FunnelProduct[], lookup = false) => products.length ? <ul className="selection-products">
    {products.map((p) => {
      const reasons = need.excluded.filter((e) => e.productId === p.productId);
      return <li key={p.productId}>
        <b>{p.name}</b> <span className="small muted">Product {p.productId}</span>
        {lookup && <p className="small">No supplier lookup evidence was recorded. Not evaluated; no rejection rule recorded.</p>}
        {reasons.length > 0 && <ul className="small">{reasons.map((e, i) => <li key={`${e.ruleId}:${i}`}><code>{e.ruleId}</code> — {e.reason}</li>)}</ul>}
        {productJudgements(need, p.productId).map((j, i) => <Judgement key={i} judgement={j} />)}
      </li>;
    })}
  </ul> : <p className="small muted">No products removed at this stage.</p>;

  return <section className="selection-funnel" aria-label={`Selection evidence for ${need.label}`}>
    <Disclosure label={`Selection funnel for ${need.label}`}>
      <p className="small muted">Counts describe the bounded shortlist passed to ranking, after catalogue search filters and saved buyer exclusions, not the whole catalogue. Products leave the funnel once; all saved exclusion reasons remain visible.</p>
      {!funnel.complete && <p className="callout yellow small">{!need.selectionTrace
        ? "This older plan has no saved shortlist trace. Counts below cover only products with saved evidence; the full search funnel cannot be reconstructed."
        : "The saved trace and candidate counts do not reconcile. This is partial evidence; recheck the plan for a complete funnel."}</p>}
      <Disclosure label={`${need.selectionTrace ? "Bounded shortlist" : "Products with saved evidence"}: ${funnel.products.length}`}>
        {renderProducts(funnel.products)}
      </Disclosure>
      {funnel.stages.map((s) => <Disclosure key={s.key} label={`${s.label}: ${s.before} → ${s.after} · ${s.removed.length} ${s.key === "lookup" ? "not evaluated" : "removed"}`}>
        {s.key === "type" && <p className="small muted">{checked.length} product-type checks recorded; {uncertain.length} uncertain. Checks may also cover products already removed by cutoff. Uncertain judgements stay uncertain; a policy may exclude them without a negative type finding.</p>}
        {renderProducts(s.removed, s.key === "lookup")}
      </Disclosure>)}
      <Disclosure label={`Product-type evidence: ${checked.length} checked · ${uncertain.length} uncertain`}>
        {checked.length ? renderProducts(checked) : <p className="small muted">No product-type judgement was recorded.</p>}
      </Disclosure>
      <Disclosure label={`Final ranking: ${funnel.candidates.length} candidates · ${selected.size} selected in plan`}>
        <p className="small muted">Retained alternatives were not rejected. Ranking is separate from quantity allocation, stock confirmation and approval; a selected product is not an order confirmation.</p>
        {outsideRanking.length > 0 && <p className="callout yellow small">Selected in plan, outside the saved ranking: {outsideRanking.map((l) => `${l.productName} (${l.productId})`).join(", ")}. Selection evidence for these products is incomplete.</p>}
        {!funnel.candidates.length && <p className="small">No ranked candidates recorded.</p>}
        <ol className="selection-products">
          {funnel.candidates.map((c) => {
            const line = selected.get(c.productId);
            return <li key={c.productId} value={c.rank}>
              <b>{c.name}</b> <span className="small muted">Product {c.productId} · {c.source === "fixture" ? "Fixture" : "Live lookup"}</span>
              <p className="small"><b>{line ? "Selected in plan" : "Retained alternative · not selected"}</b></p>
              {line && <p className="small">{c.rank === 1
                ? `Selection ranking reason: ${line.rankStep ?? "not recorded"}.`
                : "Selected from the ranked alternatives. A separate buyer-choice or allocation reason was not recorded."}</p>}
              <p className="small">Rank {c.rank} · ranking comparison: <CandidateRanking candidate={c} /></p>
              <p className="small">{stockText(c.stock, c.salesUnit)}</p>
              {c.notes.length > 0 && <ul className="small">{c.notes.map((r, i) => <li key={i}><code>{r.ruleId}</code> — {r.message}</li>)}</ul>}
              {productJudgements(need, c.productId).map((j, i) => <Judgement key={i} judgement={j} />)}
            </li>;
          })}
        </ol>
      </Disclosure>
    </Disclosure>
  </section>;
}
