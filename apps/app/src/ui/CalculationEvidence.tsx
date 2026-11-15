/** Read-only arithmetic over the snapshot being displayed. No lookups or mutations. */
import type { ReactNode } from "react";
import type { Order, Plan, Question } from "@aimo/contracts";
import { eur, when } from "../format";
import { Pop } from "./Popover";
import { LineCalculation, knownAmount as known, roundMoney as round, preciseNumber as precise, type CalculationLine } from "./LineCalculation";
export { LineCalculation, type CalculationLine } from "./LineCalculation";

export interface CalculationPart { label: string; total: number | null; lines?: CalculationLine[] }
const sum = (values: (number | null | undefined)[]) => values.every(known) ? round(values.reduce<number>((total, value) => total + round(value!), 0)) : null;

export function TotalSource({ title, total, lines, parts, note }: { title: string; total: number | null; lines?: CalculationLine[]; parts?: CalculationPart[]; note?: ReactNode }) {
  const included = lines?.filter((line) => !line.removed);
  const values = parts?.map((part) => part.total) ?? included?.map((line) => line.lineTotal);
  const calculated = values ? sum(values) : null;
  const subtotal = values ? round(values.filter(known).reduce((value, next) => value + round(next), 0)) : null;
  return <div className="calculation-source small">
    <div className="pophead">{title}</div>
    <p>Displayed total: <b>{eur(total)}</b> ex VAT.</p>
    {note && <p>{note}</p>}
    {values ? <>
      <p>{calculated === null ? <>Known subtotal: {eur(subtotal)}. At least one included amount is unknown; a complete total cannot be verified.</> : <>Sum of included saved {parts ? "totals" : "line amounts"}: {values.length ? values.map((value) => eur(value)).join(" + ") : eur(0)} = {eur(calculated)}.</>}</p>
      {known(total) && calculated !== null && round(total) !== calculated && <p>The saved total differs from that sum by {eur(round(total - calculated))}. This snapshot does not contain a fully reconciling breakdown; the displayed saved total is retained.</p>}
      {!known(total) && <p>The total remains TBC because this snapshot has no confirmed total. Known lines alone do not confirm the full price.</p>}
      <p>Line amounts are rounded to cents before summing. Removed lines are excluded. Split lines each contribute once.</p>
    </> : <p>No line breakdown was saved with this value. Its calculation cannot be verified from this snapshot.</p>}
    {parts?.map((part, index) => <details key={index}><summary aria-label={`Explain ${part.label}`}>{part.label}: {eur(part.total)}</summary><TotalSource title={part.label} total={part.total} lines={part.lines} /></details>)}
    {lines?.map((line, index) => <details key={index}><summary aria-label={`Calculation for ${line.productName}, line ${index + 1}`}>{line.productName}: {eur(line.lineTotal)}{line.removed ? " · removed, excluded" : ""}</summary><LineCalculation line={line} /></details>)}
  </div>;
}

export function TotalCalculation({ label, ...props }: Parameters<typeof TotalSource>[0] & { label?: ReactNode }) {
  return <Pop className="calculation" ariaLabel={`Explain ${props.title}: ${eur(props.total)}`} label={label ?? eur(props.total)}><TotalSource {...props} /></Pop>;
}

export function BudgetCalculation({ total, cap }: { total: number | null; cap: number }) {
  const difference = total === null ? null : round(round(total) - round(cap));
  return <Pop className="calculation" ariaLabel="Explain budget over or under amount" label={difference === null ? "TBC" : difference > 0 ? `+${eur(difference)}` : `${eur(Math.abs(difference))} left`}>
    <div className="pophead">Budget comparison</div><p className="small">Order total ex VAT {eur(total)} − hotel spend cap {eur(cap)} = {eur(difference)}.{difference !== null ? difference > 0 ? " The order is over budget by this amount." : " The remaining budget is the absolute value of this amount." : " An unknown order price leaves the budget difference unknown."} Both amounts are displayed to cents.</p>
  </Pop>;
}

/** A numeric gateway VAT total alone is insufficient: older quotes use zero for missing rates. */
export const evidencedVat = (totalVat: number | null | undefined, lines?: CalculationLine[]) =>
  known(totalVat) && !!lines?.filter((line) => !line.removed).length && lines.filter((line) => !line.removed).every((line) => known(line.taxRate) && line.taxRate >= 0 && line.taxRate <= 100 && known(line.lineTotal)) ? totalVat : null;

export function VatCalculation({ totalVat, lines, scope }: { totalVat?: number | null; lines?: CalculationLine[]; scope: string }) {
  const value = evidencedVat(totalVat, lines);
  const included = lines?.filter((line) => !line.removed) ?? [];
  const calculated = value === null ? null : round(included.reduce((total, line) => total + line.lineTotal! * line.taxRate! / 100, 0));
  return <Pop className="calculation" ariaLabel={`Explain VAT for ${scope}: ${eur(value)}`} label={eur(value)}>
    <div className="pophead">VAT · {scope}</div>
    {value === null ? <p className="small">VAT is unknown: a complete saved set of line amounts and supplier tax rates is missing for this snapshot. A catalogue VAT category does not establish a tax rate.{known(totalVat) ? ` The recorded aggregate (${eur(totalVat)}) alone does not confirm VAT.` : ""}</p> : <div className="small">
      <p>{included.map((line) => `${line.productName}: ${eur(line.lineTotal)} × ${precise(line.taxRate!)}%`).join(" + ")} = {eur(calculated)}. Tax is summed before rounding the aggregate to cents; removed lines are excluded.</p>
      <p>Saved VAT: {eur(value)}.{calculated !== round(value) && ` The saved total differs by ${eur(round(value - calculated!))}; the saved evidence does not fully reconcile.`}</p>
    </div>}
  </Pop>;
}

/** Never borrow VAT from a different version of the event order. */
export function matchingVatLines(plan: Plan, order?: Order | null): CalculationLine[] | undefined {
  if (!order || !plan.orderIds.includes(order.id) || plan.quoteId !== order.quoteId || plan.deliveryDate !== order.deliveryDate || plan.totalExVat !== order.totalExVat) return;
  const active = plan.lines.filter((line) => !line.removed);
  const remaining = order.lines.filter((line) => !line.removed);
  for (const line of active) {
    const index = remaining.findIndex((other) => other.productId === line.productId && other.outletId === line.outletId && other.quantity === line.quantity && other.salesUnit === line.salesUnit && other.unitPrice === line.unitPrice && other.lineTotal === line.lineTotal);
    if (index < 0) return;
    remaining.splice(index, 1);
  }
  return remaining.length ? undefined : order.lines;
}

/** Review facts deliberately omit unit prices on older snapshots; don't substitute draft prices. */
export function reviewLines(question: Question): CalculationLine[] | undefined {
  const lines = Array.isArray(question.facts.lines) ? question.facts.lines.map((value): CalculationLine | null => {
    if (!value || typeof value !== "object") return null;
    const line = value as Record<string, unknown>;
    if (typeof line.product !== "string" || !known(line.quantity)) return null;
    return { productName: line.product, quantity: line.quantity, salesUnit: typeof line.unit === "string" ? line.unit : null, lineTotal: known(line.lineTotal) ? line.lineTotal : null };
  }) : undefined;
  return lines?.every((line) => line !== null) ? lines : undefined;
}

export function ReviewCalculation({ question }: { question: Question }) {
  return <TotalCalculation title="submitted order total" total={known(question.facts.total) ? question.facts.total : null} lines={reviewLines(question)} note={`Saved review ${question.id}, submitted ${when(question.createdAt)}. Includes already placed items when present. Draft prices are not substituted for submitted prices.`} />;
}
