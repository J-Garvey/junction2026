/** Plan lines, candidates, the dish and money views, the cut-off board and the change view. */
import { useState, type ReactNode } from "react";
import type { Need, Plan, PlanLine, StatusLabel, WarningRecord } from "@aimo/contracts";
import { countdown, eur, qty, when, fi, plural, parseTime } from "../format";
import { useApp, outletName } from "../ctx";
import type { DiffLine } from "../api";
import { Status, Fixture, UnknownStockMark } from "./Status";
import { Pop, LineSource, CandidateSource, stockText } from "./Popover";
import { Icon } from "./icons";
import { useShowAll } from "./ShowAll";

const ORDER: Record<string, number> = { allergy_warning: 0, blocked: 1, not_available: 2, unresolved: 3, unknown_stock: 4, covered_at_risk: 5, waiting: 6, check: 7, covered: 8 };

export function lineStatus(l: PlanLine, warnings: WarningRecord[]): StatusLabel {
  if (warnings.some((w) => w.state === "open" && w.productId === l.productId)) return "allergy_warning";
  return l.status;
}
export const isGap = (s: StatusLabel) => ORDER[s] <= 5;

/** UI-08: gaps first, then the rest. */
export function sortGapsFirst(lines: PlanLine[], warnings: WarningRecord[]) {
  return [...lines].sort((a, b) => ORDER[lineStatus(a, warnings)] - ORDER[lineStatus(b, warnings)] || (b.lineTotal ?? 0) - (a.lineTotal ?? 0));
}

function judgementsFor(plan: Plan, l: PlanLine) {
  return plan.needs.filter((n) => l.needIds.includes(n.id)).flatMap((n) => n.judgements.filter((j) => j.subject === l.productId));
}

export function LineRow({ plan, line, warnings, onRemove, showPrice = true, share }: { plan: Plan; line: PlanLine; warnings: WarningRecord[]; onRemove?: (l: PlanLine) => void; showPrice?: boolean; share?: number }) {
  const { outlets } = useApp();
  const st = lineStatus(line, warnings);
  const pop = <LineSource line={line} judgements={judgementsFor(plan, line)} />;
  return (
    <div className={`pline ${line.removed ? "removed" : ""} v-${line.verdict}`}>
      <div className="pline-st">
        <Pop label={<Status k={st} />}>{pop}</Pop>
      </div>
      <div className="pline-name">
        <Pop label={<span className="trunc">{line.productName}</span>} className="namepop">
          {pop}
        </Pop>
        {(() => {
          const r = line.rules.find((x) => x.outcome !== "order" && x.ruleId !== "STK-01");
          const co2 = line.co2Kg != null ? `≈ ${Math.round(line.co2Kg)} kg CO₂e` : null;
          return r || co2 ? (
            <div className="small muted trunc">
              {r && <span title={r.message}>{r.label ?? r.ruleId}</span>}
              {r && co2 ? " · " : ""}
              {co2 && <span title="Product-group average, not this product's own figure (63% of products have one)">{co2}</span>}
            </div>
          ) : null;
        })()}
      </div>
      <div className="pline-q num">
        <Pop label={<span>{share != null ? `${qty(share)} ${line.needAmount.unit}` : `${line.quantity} ${line.salesUnit ?? ""}`}</span>}>{pop}</Pop>

      </div>
      {showPrice && (
        <div className="pline-p num">
          <Pop label={<b>{eur(line.lineTotal)}</b>}>{pop}</Pop>

        </div>
      )}
      {onRemove && line.verdict === "red" && !line.removed && (
        <button type="button" className="btn sm danger" onClick={() => onRemove(line)}>
          Remove
        </button>
      )}
    </div>
  );
}

/** UI-08: gaps first, fine lines collapse when there are many. */
export function LinesList({ plan, warnings, onRemove }: { plan: Plan; warnings: WarningRecord[]; onRemove?: (l: PlanLine) => void }) {
  const sorted = sortGapsFirst(plan.lines, warnings);
  const gaps = sorted.filter((l) => isGap(lineStatus(l, warnings)) || l.status !== "covered");
  const fine = sorted.filter((l) => !gaps.includes(l));
  const [showFine, setShowFine] = useState(fine.length <= 8);
  return (
    <div className="plines">
      {gaps.map((l) => (
        <LineRow key={l.id} plan={plan} line={l} warnings={warnings} onRemove={onRemove} />
      ))}
      {fine.length > 0 && !showFine && (
        <button type="button" className="collapsed" onClick={() => setShowFine(true)}>
          <Status k="covered" /> {fine.length} more
        </button>
      )}
      {showFine && fine.map((l) => <LineRow key={l.id} plan={plan} line={l} warnings={warnings} onRemove={onRemove} />)}

    </div>
  );
}

/** UI-09 dish view: lines grouped by dish and diet group. */
export function DishView({ plan, warnings, onRemove }: { plan: Plan; warnings: WarningRecord[]; onRemove?: (l: PlanLine) => void }) {
  const { me } = useApp();
  const groups = new Map<string, Need[]>();
  for (const n of plan.needs) {
    const k = n.dishName ?? n.label;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const ordered = [...groups.entries()].sort(([, a], [, b]) => Number(!a.some((n) => me.outlets.includes(n.outletId))) - Number(!b.some((n) => me.outlets.includes(n.outletId))));
  return (
    <div className="stack">
      {ordered.map(([dish, needs]) => (
        <section key={dish} className="dishgroup">
          <h3 className="small-h">{dish}</h3>
          {needs.map((n) => {
            const ls = sortGapsFirst(
              plan.lines.filter((l) => l.needIds.includes(n.id)),
              warnings,
            );
            return (
              <div key={n.id} className="needblock">
                {n.groupId !== "regular" && n.groupId !== "request" && <div className="small muted">{n.groupLabel.replace(/ guests$/, "")}</div>}
                {ls.map((l) => (
                  <LineRow key={l.id} plan={plan} line={l} warnings={warnings} onRemove={onRemove} share={l.shares.find((s) => s.needId === n.id)?.amount} showPrice={false} />
                ))}
                {!ls.length && (
                  <div className="pline v-red">
                    <div className="pline-st">
                      <Status k={n.rules.some((r) => r.outcome === "block") ? "blocked" : "not_available"} />
                    </div>
                    <div className="pline-name small" title={n.rules[0]?.message}>{n.text}</div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** UI-09 money view: by cost, with total, VAT and distance from the cap. */
export function MoneyView({ plan, warnings, cap, vat, onRemove }: { plan: Plan; warnings: WarningRecord[]; cap: number | null; vat?: number | null; onRemove?: (l: PlanLine) => void }) {
  const lines = [...plan.lines].filter((l) => !l.removed).sort((a, b) => (b.lineTotal ?? 0) - (a.lineTotal ?? 0));
  const total = lines.some((line) => line.lineTotal == null)
    ? null
    : plan.totalExVat ?? (lines.length > 0 ? lines.reduce((sum, line) => sum + line.lineTotal!, 0) : null);
  return (
    <div>
      <div className="moneybar">
        <div>
          <div className="small muted">Ex VAT</div>
          <div className="price" style={{ fontSize: 26 }}>
            {eur(total)}
          </div>
        </div>
        <div>
          <div className="small muted">VAT</div>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>{eur(vat)}</div>
        </div>
        {cap != null && (
          <div>
            <div className="small muted">Cap {eur(cap)}</div>
            <div style={{ color: total != null && total > cap ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
              {total == null ? "TBC" : total > cap ? `+${eur(total - cap)}` : `${eur(cap - total)} left`}
            </div>
          </div>
        )}
      </div>
      <div className="plines">
        {lines.map((l) => (
          <LineRow key={l.id} plan={plan} line={l} warnings={warnings} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

/** Candidates per need, best first, with the ranking step that decided each. */
export function Candidates({ need }: { need: Need }) {
  // The best few first; every product that passed can be loaded.
  const { visible: top, toggle } = useShowAll(need.candidates, CANDIDATES_SHOWN, "products");
  return (
    <div className="cands">
      <b className="small" style={{ color: "var(--ink)" }}>{need.label}</b>
      <table className="t cands-t">
        <thead>
          <tr>
            <th />
            <th>Product</th>
            <th className="num">Price</th>
            <th className="num">Per {need.amount.unit}</th>
            <th className="hide-m">Stock</th>
          </tr>
        </thead>
        <tbody>
          {top.map((c) => (
            <tr key={c.productId}>
              <td>
                <span className={`rank r-${c.label}`}>{c.label}</span>
              </td>
              <td>
                <Pop label={<span className="trunc">{c.name}</span>} className="namepop">
                  <CandidateSource c={c} />
                </Pop>
                {c.stock.kind === "unknown" && <UnknownStockMark reason={c.stock.reason} />}
                {c.source === "fixture" && <Fixture />}
              </td>
              <td className="num">
                {eur(c.unitPrice)}

              </td>
              <td className="num">{eur(c.pricePerBase)}</td>
              <td className="hide-m small">{c.stock.kind === "unknown" ? <span className="muted">Not confirmed</span> : stockText(c.stock, c.salesUnit)}</td>

            </tr>
          ))}
          {!top.length && (
            <tr>
              <td colSpan={6} className="muted small">
                Nothing passes
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {toggle}
    </div>
  );
}

/** Products shown per need before "Show all". */
export const CANDIDATES_SHOWN = 5;

/** UI-10: lines grouped by order cut-off. "Order in 5 h 20 min" under 48 h, else "Order by Sun 15 Nov, 17:00". */
export function CutoffBoard({ lines }: { lines: PlanLine[] }) {
  const { now } = useApp();
  const groups = new Map<string, PlanLine[]>();
  for (const l of lines.filter((x) => !x.removed)) {
    const k = l.closingTime ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const rows = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) return null;
  return (
    <ul className="cutoffs" aria-label="Order cut-offs">
      {rows.map(([k, ls]) => {
        const t = k === "none" ? null : parseTime(k);
        const ms = t ? t.getTime() - (parseTime(now) ?? new Date()).getTime() : 0;
        const text = !t ? "Cannot be delivered" : ms <= 0 ? `Too late: cut-off was ${when(k)}` : ms < 48 * 3600000 ? `Order in ${countdown(k, now).text}` : `Order by ${when(k)}`;
        return (
          <li key={k} className={!t || ms <= 0 ? "late" : undefined}>
            <b>{text}</b> <span className="muted small">{plural(ls.length, "line")}</span>
          </li>
        );
      })}
    </ul>
  );
}

const CH: Record<string, { cls: string; text: string }> = {
  up: { cls: "up", text: "More" },
  down: { cls: "down", text: "Less" },
  added: { cls: "added", text: "Added" },
  removed: { cls: "removed", text: "Removed" },
  unchanged: { cls: "same", text: "Same" },
  needs_substitute: { cls: "removed", text: "No product" },
};
export function DiffView({ diff }: { diff: DiffLine[] }) {
  const [showSame, setShowSame] = useState(false);
  const changed = diff.filter((d) => d.change !== "unchanged");
  const same = diff.filter((d) => d.change === "unchanged");
  return (
    <div className="diff">
      {changed.map((d) => (
        <DiffRow key={d.productId + d.outletId} d={d} />
      ))}
      {same.length > 0 &&
        (showSame ? (
          same.map((d) => <DiffRow key={d.productId + d.outletId} d={d} />)
        ) : (
          <button type="button" className="collapsed" onClick={() => setShowSame(true)}>
            {same.length} unchanged
          </button>
        ))}
    </div>
  );
}
function DiffRow({ d }: { d: DiffLine }) {
  const c = CH[d.change] ?? CH.unchanged;
  return (
    <div className={`drow ${c.cls}`}>
      <span className={`dchip ${c.cls}`}>{c.text}</span>
      <span className="trunc" style={{ flex: 1 }}>
        {d.productName}
      </span>
      <span className="num mono">
        {d.change === "added" ? "" : `${d.was} → `}
        {d.now} {d.unit ?? ""}
      </span>
    </div>
  );
}

export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="tile">
      <div className="tile-h">
        <h3>{title}</h3>
        {aside && <div className="act">{aside}</div>}
      </div>
      <div className="tile-b">{children}</div>
    </section>
  );
}

export const shortfallText = (p: Plan) => (p.shortfall ? `${qty(p.shortfall.covered)} of ${qty(p.shortfall.need)} ${p.shortfall.unit} in stock` : null);
export { fi };
