import { type ReactNode, useId, useState } from "react";
import type { Candidate, ItemReview, Need, PlanLine, SingleLine } from "@aimo/contracts";
import { useApp } from "../ctx";
import { claimLabel, day, eur, parseTime, qty, when } from "../format";
import { stockText } from "./Popover";
import { UnknownStockMark } from "./Status";
import { Icon } from "./icons";
import { ProductDetailsPanel, allergenLabel } from "./ProductDetails";
import { CarbonEstimate } from "./CarbonEstimate";

/** One compact table group per requested item; supporting evidence opens on demand. */
export function ProductReviewItem({ line, need, lines, deliveryDate, checked, disabled, review, onApprove, onSalesQuantity, onEdit, onDiscard, onChoose, children }: {
  line: SingleLine;
  need?: Need;
  lines: PlanLine[];
  deliveryDate: string;
  checked: boolean;
  disabled: boolean;
  review?: ItemReview;
  onApprove: () => void;
  onSalesQuantity: (productId: string, quantity: number) => void;
  onEdit: (field: "quantity" | "description") => void;
  onDiscard?: () => void;
  onChoose: (productId: string) => void;
  children?: ReactNode;
}) {
  const { now } = useApp();
  const headingId = useId();
  const [showReplacements, setShowReplacements] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const exactMatch = review?.requiresApproval === false && review.canApprove;
  const hasDietRequirements = !!(line.constraints.claims.length || line.constraints.avoidAllergens.length || line.constraints.labels.length || line.constraints.origin);
  const found = lines.filter((product) => product.productId);
  const selected = new Set(found.map((product) => product.productId));
  const rules = [...(need?.rules ?? []), ...lines.flatMap((product) => product.rules)];
  const unknownProduct = rules.some((rule) => rule.ruleId === "REQ-04");
  const noMatch = rules.some((rule) => rule.ruleId === "DIET-04");
  const tooLate = rules.some((rule) => rule.ruleId === "DLV-06");
  // Unknown stock (STK-01) is shown by the marker on the product and decided by approving the item.
  const warnings = [...new Set(rules.filter((rule) => rule.outcome !== "order" && !["REQ-04", "DIET-04", "DLV-06", "STK-01"].includes(rule.ruleId)).map((rule) => rule.message))];
  const alternatives = need?.candidates.filter((candidate) => !selected.has(candidate.productId))
    .sort((a, b) => replacementScore(a, deliveryDate) - replacementScore(b, deliveryDate) || a.rank - b.rank).slice(0, 2) ?? [];
  const lateOptions = need?.lateDeliveryOptions?.slice(0, 2) ?? [];
  const products = found.length ? found : [null];
  const decisionNote = review && !exactMatch && !review.approvedAt
    ? review.reason ?? (found.some((product) => product.stock?.kind === "unknown") ? "Approving continues with stock not confirmed." : null)
    : null;
  const hasIssue = unknownProduct || noMatch || tooLate || !found.length;
  const expanded = !!children || !checked || hasIssue || warnings.length > 0 || !!decisionNote || review?.quantityRequired || showDetails;

  return (
    <tbody className="add-review-item" aria-labelledby={headingId} aria-busy={disabled && !checked}>
      {products.map((product, index) => (
        <tr key={product?.id ?? line.id} className="add-review-row">
          <td className="add-review-row-product">
            <b>{product?.productName ?? line.query}{product?.stock?.kind === "unknown" && <UnknownStockMark reason={product.stock.reason} />}</b>
            <CarbonEstimate line={product ?? { quantity: 0 }} />
            {index === 0 && <div className="add-review-request small muted">
              <span>Requested</span>
              <button type="button" className="add-review-edit-value" disabled={disabled} onClick={() => onEdit("quantity")} aria-label={`Edit quantity for ${line.query}`}>
                {line.quantity ? `${qty(line.quantity.amount)} ${line.quantity.unit}` : "Amount needed"}
              </button>
              <button type="button" id={headingId} className="add-review-edit-value" disabled={disabled} onClick={() => onEdit("description")} aria-label={`Edit description for ${line.query}`}>
                {line.constraints.claims.map(claimLabel).concat(line.query).join(" ")}
              </button>
            </div>}
            {product?.source === "fixture" && <small className="muted">Fixture</small>}
          </td>
          <td className="add-review-row-quantity">{product && product.quantity > 0 ? `${qty(product.quantity)} ${product.salesUnit ?? ""}` : "TBC"}</td>
          <td className="add-review-row-price"><b>{eur(product && product.quantity > 0 ? product.lineTotal : null)}</b></td>
          {index === 0 && <td rowSpan={products.length} className="add-review-row-actions">
            {checked && review && !exactMatch && (review.approvedAt
              ? <span className="add-review-approved small" title={`Approved by ${review.approvedBy}`}><Icon n="check" s={14} /> Approved</span>
              : <button type="button" className="btn sm primary" disabled={disabled || !review.canApprove} onClick={onApprove} aria-label={`Approve ${line.query}`}>Approve item</button>)}
            {checked && exactMatch && <span className="small muted">Matches your request</span>}
            <div className="add-review-row-tools">
              {checked && <button type="button" className="btn sm ghost" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>{showDetails ? "Hide details" : "View details"}</button>}
              {onDiscard && <button type="button" className="btn sm ghost" disabled={disabled} onClick={onDiscard} aria-label={`Discard ${line.query} from order`} title="Discard item"><Icon n="x" s={14} /></button>}
            </div>
          </td>}
        </tr>
      ))}
      {expanded && <tr className="add-review-support"><td colSpan={4}>
        {children || <div className="add-review-item-body">
          {!checked ? <p className="small muted" role="status">Checking this item…</p> : (
            <>
              {showDetails && found.length > 0 && (
                <div className="add-review-matches">
                  <h4>Product details</h4>
                  {found.map((product) => (
                    <ProductDetailsPanel key={`${product.id}-${product.productId}`} line={product} />
                  ))}
                </div>
              )}

              {(unknownProduct || noMatch || tooLate || !found.length) && (
                <div className="callout yellow add-review-item-issue" role="status">
                  <b>{unknownProduct ? "Product not found" : noMatch ? "No matching product" : tooLate ? "Nothing available in time" : "No product selected"}</b>
                  <span>{unknownProduct ? "This product is not in the Valio Aimo catalogue." : noMatch ? "No product matched this item and its requirements." : tooLate ? `Nothing can arrive by ${day(deliveryDate)}.${need?.earliestDelivery ? ` Earliest delivery: ${day(need.earliestDelivery)}.` : " No later delivery date is known yet."}` : "Refine this item's description or quantity and try again."}</span>
                  <button type="button" className="btn sm" disabled={disabled} onClick={() => onEdit("description")} aria-label={`Refine search for ${line.query}`}>Refine search</button>
                </div>
              )}
              {warnings.length > 0 && <ul className="add-review-item-warnings small">{warnings.map((message) => <li key={message}>{message}</li>)}</ul>}
              {showDetails && hasDietRequirements && <p className="small muted">{[
                ...line.constraints.claims.map(claimLabel),
                ...line.constraints.avoidAllergens.map((code) => `Avoid ${allergenLabel(code)}`),
                ...line.constraints.labels.map(claimLabel),
                ...(line.constraints.origin ? [`Required origin: ${line.constraints.origin}`] : []),
              ].join(" · ")}</p>}

              {review?.quantityRequired && found.length === 1 && (
                <form key={review.fingerprint} className="add-review-sales-quantity" onSubmit={(event) => {
                  event.preventDefault();
                  onSalesQuantity(found[0].productId!, Number(new FormData(event.currentTarget).get("salesQuantity")));
                }}>
                  <label className="field"><span className="small">Sales units to order ({found[0].salesUnit})</span><input name="salesQuantity" aria-label={`Sales units for ${line.query}`} type="number" min="1" max="1000000" step="1" required disabled={disabled} /></label>
                  <p className="small muted">The pack conversion is unknown. Enter whole sales units, then check the price before approving.</p>
                  <button type="submit" className="btn sm" disabled={disabled}>Check quantity</button>
                </form>
              )}

              {decisionNote && <p className="small muted add-review-decision-note" role="status">{decisionNote}</p>}

              {showDetails && !tooLate && need && <button type="button" className="btn sm" disabled={disabled} aria-expanded={showReplacements} onClick={() => setShowReplacements(!showReplacements)}>Suggest replacements</button>}
              {showDetails && showReplacements && !tooLate && !alternatives.length && <p className="small muted" role="status">No other matching products were returned. Refine the description to search again.</p>}
              {showDetails && showReplacements && !tooLate && alternatives.length > 0 && need && (
                <div className="add-review-replacements">
                  <h4>Suggested replacements</h4>
                  {alternatives.map((candidate) => {
                    const quantity = replacementQuantity(candidate, need);
                    const cutoff = parseTime(candidate.closingTime);
                    const usable = candidate.unitPrice !== null && !!candidate.availableDate && candidate.availableDate <= deliveryDate
                      && (candidate.stock.kind === "unknown" || (candidate.stock.kind === "known" && candidate.stock.amount >= (quantity ?? 1)))
                      && !candidate.notes.some((rule) => rule.outcome === "block") && !!cutoff && cutoff > (parseTime(now) ?? new Date());
                    return (
                      <div key={candidate.productId} className="add-review-product add-review-replacement">
                        <span className="add-review-product-name"><b>{candidate.name}{candidate.stock.kind === "unknown" && <UnknownStockMark reason={candidate.stock.reason} />}</b><small>Product {candidate.productId}{candidate.stock.kind !== "unknown" && ` · ${stockText(candidate.stock, candidate.salesUnit)}`} · {candidate.availableDate ? `delivery ${day(candidate.availableDate)}` : "delivery date not supplied"}{candidate.source === "fixture" ? " · Fixture" : ""}</small><small>Cutoff (Helsinki): {candidate.closingTime ? when(candidate.closingTime) : "Not supplied"}</small><button type="button" className="btn sm" disabled={disabled || !usable} title={!usable ? "Stock, price, pack size or delivery needs checking." : undefined} onClick={() => onChoose(candidate.productId)}>Use replacement</button></span>
                        <span className="add-review-product-quantity"><small>Quantity</small><b>{quantity === null ? "TBC" : `${qty(quantity)} ${candidate.salesUnit ?? "sales units"}`}</b></span>
                        <span className="add-review-product-price"><small>Price ex VAT</small><b>{eur(quantity === null || candidate.unitPrice === null ? null : quantity * candidate.unitPrice)}</b><small>{eur(candidate.unitPrice)} / {candidate.salesUnit ?? "sales unit"}</small></span>
                        <SupplierSchedule terms={candidate} />
                      </div>
                    );
                  })}
                </div>
              )}

              {tooLate && lateOptions.length > 0 && (
                <div className="add-review-replacements">
                  <h4>Available after your delivery date</h4>
                  {lateOptions.map((candidate) => (
                    <div key={candidate.productId} className="add-review-product">
                      <span className="add-review-product-name"><b>{candidate.name}</b><small>{candidate.deliveryEstimated ? "Estimated delivery" : "Delivery"} {day(candidate.availableDate)}{candidate.source === "fixture" ? " · Fixture" : ""}</small>{candidate.deliveryEstimated && <small>Cutoff passed · delivery and stock need rechecking.</small>}</span>
                      <span className="add-review-product-quantity"><small>Quantity</small><b>{qty(candidate.quantity)} {candidate.salesUnit ?? "sales units"}</b></span>
                      <span className="add-review-product-price"><small>Price ex VAT</small><b>{eur(candidate.unitPrice === null ? null : candidate.quantity * candidate.unitPrice)}</b></span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>}
      </td></tr>}
    </tbody>
  );
}

function SupplierSchedule({ terms }: { terms: Pick<PlanLine, "availabilityEvidence" | "availableDate" | "closingTime"> }) {
  const schedule = terms.availabilityEvidence?.schedules[0];
  if (!schedule) return <p className="add-review-supplier-note small muted">Original supplier schedule not saved. Recheck the item terms before ordering.</p>;
  if (schedule.availableDate === terms.availableDate && schedule.closingTime === terms.closingTime) return null;
  return <p className="add-review-supplier-note small muted">Quoted delivery and cutoff are demo estimates. Original supplier schedule: {schedule.availableDate ? day(schedule.availableDate) : "date not supplied"}; cutoff (Helsinki): {schedule.closingTime ? when(schedule.closingTime) : "not supplied"}. A delivery hour is not supplied.</p>;
}

function replacementQuantity(candidate: Candidate, need: Need) {
  const pack = candidate.packContent;
  return pack && pack.unit === need.amount.unit && pack.value > 0 ? Math.ceil(need.amount.value / pack.value - 1e-9) : null;
}

/** Unknown stock is not a shortage (D34): it keeps its rank and carries the "stock not confirmed" marker. */
function replacementScore(candidate: Candidate, deliveryDate: string) {
  const inTime = !!candidate.availableDate && candidate.availableDate <= deliveryDate;
  const stocked = candidate.stock.kind === "unknown" || (candidate.stock.kind === "known" && candidate.stock.amount > 0);
  return inTime && stocked ? 0 : 1;
}
