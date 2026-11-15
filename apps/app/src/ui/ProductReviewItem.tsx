import { type ReactNode, useId } from "react";
import type { Candidate, Need, PlanLine, SingleLine } from "@aimo/contracts";
import { useApp } from "../ctx";
import { claimLabel, day, eur, parseTime, qty } from "../format";
import { stockText } from "./Popover";
import { Status } from "./Status";

/** Keep a request, its matches and its alternatives together, including unresolved items. */
export function ProductReviewItem({ line, need, lines, deliveryDate, checked, disabled, onEdit, onDiscard, onChoose, children }: {
  line: SingleLine;
  need?: Need;
  lines: PlanLine[];
  deliveryDate: string;
  checked: boolean;
  disabled: boolean;
  onEdit: (field: "quantity" | "description") => void;
  onDiscard: () => void;
  onChoose: (productId: string) => void;
  children?: ReactNode;
}) {
  const { now } = useApp();
  const headingId = useId();
  const found = lines.filter((product) => product.productId);
  const selected = new Set(found.map((product) => product.productId));
  const rules = [...(need?.rules ?? []), ...lines.flatMap((product) => product.rules)];
  const unknownProduct = rules.some((rule) => rule.ruleId === "REQ-04");
  const noMatch = rules.some((rule) => rule.ruleId === "DIET-04");
  const tooLate = rules.some((rule) => rule.ruleId === "DLV-06");
  const warnings = [...new Set(rules.filter((rule) => rule.outcome !== "order" && !["REQ-04", "DIET-04", "DLV-06"].includes(rule.ruleId)).map((rule) => rule.message))];
  const alternatives = need?.candidates.filter((candidate) => !selected.has(candidate.productId))
    .sort((a, b) => replacementScore(a, deliveryDate) - replacementScore(b, deliveryDate) || a.rank - b.rank).slice(0, 2) ?? [];
  const lateOptions = need?.lateDeliveryOptions?.slice(0, 2) ?? [];

  return (
    <article className="add-review-item" aria-labelledby={headingId} aria-busy={disabled && !checked}>
      <div className="add-review-item-head">
        <button type="button" className="add-review-edit-value" disabled={disabled} onClick={() => onEdit("quantity")} aria-label={`Edit quantity for ${line.query}`}>
          <small>Quantity</small>
          <b>{line.quantity ? `${qty(line.quantity.amount)} ${line.quantity.unit}` : "Amount needed"}</b>
        </button>
        <button type="button" className="add-review-edit-value" disabled={disabled} onClick={() => onEdit("description")} aria-label={`Edit description for ${line.query}`}>
          <small>Description</small>
          <span id={headingId}>{line.constraints.claims.map(claimLabel).concat(line.query).join(" ")}</span>
        </button>
        <button type="button" className="btn sm ghost" disabled={disabled} onClick={onDiscard} aria-label={`Discard ${line.query} from order`}>Discard</button>
      </div>

      {children || (
        <div className="add-review-item-body">
          {!checked ? <p className="small muted" role="status">Checking this item…</p> : (
            <>
              {found.length > 0 && (
                <div className="add-review-matches">
                  <h4>Product{found.length > 1 ? "s" : ""} found</h4>
                  {found.map((product) => (
                    <div key={product.id} className="add-review-product">
                      <span className="add-review-product-name">
                        <b>{product.productName}</b>
                        <small>{product.packContent ? `${qty(product.packContent.value)} ${product.packContent.unit} per ${product.salesUnit ?? "sales unit"}` : `Product ${product.productId}`}{product.source === "fixture" ? " · Fixture" : ""}</small>
                        {product.needIds.length > 1 && <small>Shared pack: quantity and price also cover {product.shares.filter((share) => share.needId !== line.id).map((share) => share.label).join(", ")}.</small>}
                        <Status k={product.status} />
                      </span>
                      <span className="add-review-product-quantity"><small>Quantity</small><b>{qty(product.quantity)} {product.salesUnit ?? ""}</b></span>
                      <span className="add-review-product-price"><small>Price ex VAT</small><b>{eur(product.lineTotal)}</b><small>{eur(product.unitPrice)} / {product.salesUnit ?? "sales unit"}</small></span>
                    </div>
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

              {!tooLate && alternatives.length > 0 && need && (
                <div className="add-review-replacements">
                  <h4>Suggested replacements</h4>
                  {alternatives.map((candidate) => {
                    const quantity = replacementQuantity(candidate, need);
                    const cutoff = parseTime(candidate.closingTime);
                    const usable = quantity !== null && candidate.unitPrice !== null && replacementScore(candidate, deliveryDate) === 0
                      && candidate.stock.kind === "known" && candidate.stock.amount >= quantity && !!cutoff && cutoff > (parseTime(now) ?? new Date());
                    return (
                      <div key={candidate.productId} className="add-review-product add-review-replacement">
                        <span className="add-review-product-name"><b>{candidate.name}</b><small>{stockText(candidate.stock, candidate.salesUnit)} · {candidate.availableDate ? `delivery ${day(candidate.availableDate)}` : "delivery date not supplied"}{candidate.source === "fixture" ? " · Fixture" : ""}</small><button type="button" className="btn sm" disabled={disabled || !usable} title={!usable ? "Stock, price, pack size or delivery needs checking." : undefined} onClick={() => onChoose(candidate.productId)}>Use replacement</button></span>
                        <span className="add-review-product-quantity"><small>Quantity</small><b>{quantity === null ? "TBC" : `${qty(quantity)} ${candidate.salesUnit ?? "sales units"}`}</b></span>
                        <span className="add-review-product-price"><small>Price ex VAT</small><b>{eur(quantity === null || candidate.unitPrice === null ? null : quantity * candidate.unitPrice)}</b><small>{eur(candidate.unitPrice)} / {candidate.salesUnit ?? "sales unit"}</small></span>
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
        </div>
      )}
    </article>
  );
}

function replacementQuantity(candidate: Candidate, need: Need) {
  const pack = candidate.packContent;
  return pack && pack.unit === need.amount.unit && pack.value > 0 ? Math.ceil(need.amount.value / pack.value - 1e-9) : null;
}

function replacementScore(candidate: Candidate, deliveryDate: string) {
  if (candidate.stock.kind === "known" && candidate.stock.amount > 0 && candidate.availableDate && candidate.availableDate <= deliveryDate) return 0;
  return candidate.stock.kind === "unknown" ? 1 : 2;
}
