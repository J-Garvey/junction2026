/** Shared saved line arithmetic, independent of product lookups and popover state. */
import type { PlanLine } from "@aimo/contracts";
import { eur, fi } from "../format";

export type CalculationLine = Pick<PlanLine, "productName" | "quantity" | "salesUnit" | "lineTotal"> &
  Partial<Pick<PlanLine, "unitPrice" | "removed" | "source" | "packContent" | "needAmount" | "allocation" | "shares" | "stock">> & { taxRate?: number | null };
export const knownAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const preciseNumber = (value: number) => value.toLocaleString("fi-FI", { maximumFractionDigits: 10 });
const price = (value: number) => `${value === roundMoney(value) ? fi(value) : preciseNumber(value)} €`;

export function LineCalculation({ line }: { line: CalculationLine }) {
  const expected = knownAmount(line.unitPrice) ? roundMoney(line.unitPrice * line.quantity) : null;
  const pack = line.packContent;
  const need = line.needAmount;
  const comparable = pack && need && pack.value > 0 && pack.unit === need.unit;
  const roundedPacks = comparable ? Math.ceil(need.value / pack.value - 1e-9) : null;
  return <div className="calculation-source small">
    <p>{line.removed ? "Removed · excluded from the total." : "Included in this snapshot."}{line.source === "fixture" ? " Fixture evidence." : ""}</p>
    {line.quantity <= 0 && <p>No positive sales quantity is saved. A request review shows TBC until the sales quantity is specified.</p>}
    <dl className="kv small">
      <dt>Saved line amount</dt><dd>{eur(line.lineTotal)} ex VAT</dd>
      <dt>Price × quantity</dt><dd>{expected === null ? "Unit price not saved; the multiplication cannot be verified." : <>{price(line.unitPrice!)} / {line.salesUnit ?? "sales unit"} × {preciseNumber(line.quantity)} {line.salesUnit ?? "sales units"} = {eur(expected)} (rounded to cents)</>}</dd>
      {knownAmount(line.lineTotal) && expected !== null && roundMoney(line.lineTotal) !== expected && <><dt>Difference</dt><dd>The saved amount differs by {eur(roundMoney(line.lineTotal - expected))}. The saved amount is retained; these terms do not fully reconcile.</dd></>}
      {need && <><dt>Required for this allocation</dt><dd>{preciseNumber(need.value)} {need.unit}</dd></>}
      {pack && <><dt>Pack conversion</dt><dd>{preciseNumber(pack.value)} {pack.unit} per {line.salesUnit ?? "sales unit"} · {pack.source}{pack.verified ? ", checked" : ", not checked"}</dd></>}
      {roundedPacks !== null && <><dt>Whole-pack rounding</dt><dd>{preciseNumber(need!.value)} ÷ {preciseNumber(pack!.value)} = {preciseNumber(need!.value / pack!.value)}; round up to {preciseNumber(roundedPacks)} sales units.{roundedPacks !== line.quantity && " The saved order quantity differs; this may be a partial fill or a human quantity choice."}</dd></>}
      {pack && <><dt>Ordered amount</dt><dd>{preciseNumber(line.quantity)} × {preciseNumber(pack.value)} = {preciseNumber(line.quantity * pack.value)} {pack.unit}{line.stock?.kind === "unknown" ? " · stock not confirmed" : ""}</dd></>}
      {need && !comparable && <><dt>Quantity comparison</dt><dd>No matching pack conversion was saved. Required and ordered amounts cannot be compared in the same unit.</dd></>}
    </dl>
    {line.allocation && line.allocation !== "primary" && <p>Split / partial allocation: {line.allocation.replaceAll("_", " ")}. This line contributes only its saved quantity and amount; other split lines are counted separately.</p>}
    {!!line.shares?.length && <div>Original need shares (before pack rounding; these can repeat across split lines and must not be added across allocations):<ul>{line.shares.map((share, index) => <li key={`${share.needId}:${index}`}>{share.label}: {preciseNumber(share.amount)} {need?.unit}</li>)}</ul></div>}
  </div>;
}
