import { CandidateRanking } from "./CandidateRanking";
import { type ReactNode, useId, useState } from "react";
import type { Candidate, ItemReview, Need, PlanLine, SingleLine } from "@aimo/contracts";
import { useApp } from "../ctx";
import { claimLabel, day, eur, parseTime, qty, when } from "../format";
import { stockText } from "./Popover";
import { AllergenDataMark, UnknownStockMark } from "./Status";
import { Icon } from "./icons";
import { useCategoryFilter, useShowAll } from "./ShowAll";
import { ProductDetailsPanel, allergenLabel } from "./ProductDetails";
import { SelectionFunnel } from "./SelectionFunnel";
import { CarbonEstimate } from "./CarbonEstimate";

/** One compact table group per requested item; supporting evidence opens on demand. */
export function ProductReviewItem({ line, need, lines, deliveryDate, checked, disabled, review, onApprove, onSalesQuantity, onEdit, onDiscard, onChoose, onSearch, children }: {
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
  /** Check this item again with another description: a corrected spelling, or a product the person picked. */
  onSearch?: (description: string) => void;
  children?: ReactNode;
}) {
  const { now } = useApp();
  const headingId = useId();
  const [showReplacements, setShowReplacements] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const exactMatch = review?.requiresApproval === false && review.canApprove;
  const hasDietRequirements = !!(line.constraints.claims.length || line.constraints.avoidAllergens.length || line.constraints.labels.length || line.constraints.origin);
  const found = lines.filter((product) => product.productId);
  const hasUnconfirmedStock = found.some((product) => product.stock?.kind === "unknown");
  const selected = new Set(found.map((product) => product.productId));
  const rules = [...(need?.rules ?? []), ...lines.flatMap((product) => product.rules)];
  const unknownProduct = rules.some((rule) => rule.ruleId === "REQ-04");
  const noMatch = rules.some((rule) => rule.ruleId === "DIET-04");
  const tooLate = rules.some((rule) => rule.ruleId === "DLV-06");
  // Unknown stock (STK-01) keeps its own notice, including after the item is approved.
  const warnings = [...new Set(rules.filter((rule) => rule.outcome !== "order" && !["REQ-04", "DIET-04", "DLV-06", "STK-01"].includes(rule.ruleId)).map((rule) => rule.message))];
  // Every other product that passed, usable ones first; the first few show and the rest load on request.
  const outsideBrief = new Set(need?.replacementCandidates?.map((candidate) => candidate.productId));
  const alternatives = [...(need?.candidates ?? []), ...(need?.replacementCandidates ?? [])].filter((candidate) => !selected.has(candidate.productId))
    .sort((a, b) => replacementScore(a, deliveryDate) - replacementScore(b, deliveryDate) || a.rank - b.rank);
  const replacementRanges = useCategoryFilter(alternatives);
  const replacementList = useShowAll(replacementRanges.filtered, 3, "replacements");
  const help = need?.searchHelp ?? null;
  const possibleList = useShowAll(help?.possible ?? [], 5, "possible products");
  const lateList = useShowAll(need?.lateDeliveryOptions ?? [], 2, "later options");
  const lateOptions = lateList.visible;
  const products = found.length ? found : [null];
  const decisionNote = review && !exactMatch && !review.approvedAt
    ? review.reason
    : null;
  const hasIssue = unknownProduct || noMatch || tooLate || !found.length;
  // Keep the sales-unit correction available after checking a manual quantity.
  // A known weight per pack still cannot convert a request for pieces.
  const canEditSalesQuantity = !!review && found.length === 1 && !!found[0].salesUnit
    && (!found[0].packContent || found[0].packContent.unit !== (need?.amount.unit ?? line.quantity?.unit));
  const expanded = !!children || !checked || hasIssue || hasUnconfirmedStock || warnings.length > 0 || !!decisionNote || canEditSalesQuantity || showDetails;

  return (
    <tbody className="add-review-item" aria-labelledby={headingId} aria-busy={disabled && !checked}>
      {products.map((product, index) => (
        <ReviewProductRow key={product?.id ?? line.id}
          product={<>
            <b>{product?.productName ?? line.query}{product?.stock?.kind === "unknown" && <UnknownStockMark reason={product.stock.reason} />}</b>
            {product && <AllergenDataMark line={product} />}
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
          </>}
          quantity={<button type="button" className="poptrigger" aria-label={`Explain quantity for ${product?.productName ?? line.query}`} aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>{product && product.quantity > 0 ? `${qty(product.quantity)} ${product.salesUnit ?? ""}` : "TBC"}</button>}
          price={<button type="button" className="poptrigger" aria-label={`Explain line amount for ${product?.productName ?? line.query}`} aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}><b>{eur(product && product.quantity > 0 ? product.lineTotal : null)}</b></button>}
          actionRows={products.length}
          actions={index === 0 ? <>
            {checked && review && !exactMatch && (review.approvedAt
              ? <span className="add-review-approved small" title={`Approved by ${review.approvedBy}`}><Icon n="check" s={14} /> Approved</span>
              : <button type="button" className="btn sm primary" disabled={disabled || !review.canApprove} onClick={onApprove} aria-label={`Approve ${line.query}`}>Approve item</button>)}
            {checked && exactMatch && <span className="small muted">Matches your request</span>}
            <div className="add-review-row-tools">
              {checked && <button type="button" className="btn sm ghost" aria-expanded={showDetails} onClick={() => setShowDetails(!showDetails)}>{showDetails ? "Hide details" : "View details"}</button>}
              {onDiscard && <button type="button" className="btn sm ghost" disabled={disabled} onClick={onDiscard} aria-label={`Discard ${line.query} from order`} title="Discard item"><Icon n="x" s={14} /></button>}
            </div>
          </> : undefined}
        />
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

              {showDetails && need && <SelectionFunnel need={need} lines={lines} />}

              {(unknownProduct || noMatch || tooLate || !found.length) && (
                <div className="callout yellow add-review-item-issue" role="status">
                  <b>{unknownProduct ? "Product not found" : noMatch ? "No matching product" : tooLate ? "Nothing available in time" : "No product selected"}</b>
                  <span>{unknownProduct ? "This product is not in the Valio Aimo catalogue." : noMatch ? "No product matched this item and its requirements." : tooLate ? `Nothing can arrive by ${day(deliveryDate)}.${need?.earliestDelivery ? ` Earliest delivery: ${day(need.earliestDelivery)}.` : " No later delivery date is known yet."}` : "Refine this item's description or quantity and try again."}</span>
                  <button type="button" className="btn sm" disabled={disabled} onClick={() => onEdit("description")} aria-label={`Refine search for ${line.query}`}>Refine search</button>
                </div>
              )}
              {noMatch && help && (help.didYouMean.length > 0 || help.possible.length > 0) && (
                <div className="search-help" role="region" aria-label={`Suggestions for ${line.query}`}>
                  {help.didYouMean.length > 0 && (
                    <p className="small">
                      Did you mean{" "}
                      {help.didYouMean.map((q, i) => (
                        <span key={q}>{i > 0 && " or "}<button type="button" className="linkbtn" disabled={disabled || !onSearch} onClick={() => onSearch?.(q)}>{q}</button></span>
                      ))}?
                    </p>
                  )}
                  {help.possible.length > 0 && (
                    <>
                      <h4>Possible matches</h4>
                      <p className="small muted">These may be outside your brief and are not ordered unless you pick one. Choose one to override the product match and check it again; dietary and delivery rules still apply.</p>
                      <SuggestedProducts label={`Possible matches for ${line.query}`}>
                        {possibleList.visible.map((p) => (
                          <ReviewProductRow key={p.productId} tone="outside"
                            product={<><SuggestionMark outside /><b>{p.name}</b><small className="muted">Product {p.productId} · {p.categoryLabel}</small><small>{p.reason}</small><small className="muted">Price, stock and delivery not checked.</small></>}
                            quantity="TBC"
                            price={<b>{eur(null)}</b>}
                            actions={<button type="button" className="btn sm" disabled={disabled || !onSearch} onClick={() => onSearch?.(`${p.productId} ${p.query}`)} aria-label={`Use ${p.name}`}>Choose &amp; check</button>}
                          />
                        ))}
                      </SuggestedProducts>
                      {possibleList.toggle}
                      {help.possibleTotal > help.possible.length && <p className="small muted">{help.possibleTotal - help.possible.length} more mention it. Refine the description to narrow them.</p>}
                    </>
                  )}
                </div>
              )}
              {warnings.length > 0 && <ul className="add-review-item-warnings small">{warnings.map((message) => <li key={message}>{message}</li>)}</ul>}
              {showDetails && hasDietRequirements && <p className="small muted">{[
                ...line.constraints.claims.map(claimLabel),
                ...line.constraints.avoidAllergens.map((code) => `Avoid ${allergenLabel(code)}`),
                ...line.constraints.labels.map(claimLabel),
                ...(line.constraints.origin ? [`Required origin: ${line.constraints.origin}`] : []),
              ].join(" · ")}</p>}

              {review && canEditSalesQuantity && (
                <form key={review.fingerprint} className="add-review-sales-quantity" onSubmit={(event) => {
                  event.preventDefault();
                  onSalesQuantity(found[0].productId!, Number(new FormData(event.currentTarget).get("salesQuantity")));
                }}>
                  <label className="field"><span className="small">Sales units to order ({found[0].salesUnit})</span><input name="salesQuantity" aria-label={`Sales units for ${line.query}`} type="number" min="1" max="1000000" step="1" required defaultValue={found[0].quantity > 0 ? found[0].quantity : ""} disabled={disabled} /></label>
                  <p className="small muted">The conversion to your requested amount is unknown. Enter or correct whole sales units, then check the price before approving.</p>
                  <button type="submit" className="btn sm" disabled={disabled}>Check quantity</button>
                </form>
              )}

              {hasUnconfirmedStock && <div className="callout yellow add-review-stock-warning">
                <Icon n="alert" s={18} />
                <div>
                  <b>Stock not confirmed</b>
                  {review && !exactMatch && !review.approvedAt && review.canApprove && <p>Approving continues with stock not confirmed.</p>}
                </div>
              </div>}
              {decisionNote && <p className="small muted add-review-decision-note" role="status">{decisionNote}</p>}

              {showDetails && !tooLate && need && !(!found.length && outsideBrief.size > 0) && <button type="button" className="btn sm" disabled={disabled} aria-expanded={showReplacements} onClick={() => setShowReplacements(!showReplacements)}>Suggest replacements</button>}
              {showDetails && showReplacements && !tooLate && !alternatives.length && <p className="small muted" role="status">No other matching products were returned. Refine the description to search again.</p>}
              {((showDetails && showReplacements) || (!found.length && outsideBrief.size > 0)) && !tooLate && alternatives.length > 0 && need && (
                <div className="add-review-replacements">
                  <h4>Suggested replacements</h4>
                  {outsideBrief.size > 0 && <p className="small muted">These differ from your requested product and were checked against the same dietary rules. Choose one to check the substitution; the original item stays blocked.</p>}
                  {replacementRanges.chips}
                  <SuggestedProducts label={`Suggested replacements for ${line.query}`}>
                    {replacementList.visible.map((candidate) => {
                      const quantity = replacementQuantity(candidate, need);
                      const blockedReason = replacementBlock(candidate, quantity, deliveryDate, now);
                      const outside = outsideBrief.has(candidate.productId);
                      return (
                        <ReviewProductRow key={candidate.productId} tone={outside ? "outside" : "suggested"}
                          product={<>
                            <SuggestionMark outside={outside} />
                            <b>{candidate.name}{candidate.stock.kind === "unknown" && <UnknownStockMark reason={candidate.stock.reason} />}</b>
                            <AllergenDataMark line={{ rules: candidate.notes }} />
                            <small className="muted">Product {candidate.productId}{candidate.stock.kind !== "unknown" && ` · ${stockText(candidate.stock, candidate.salesUnit)}`} · {candidate.availableDate ? `delivery ${day(candidate.availableDate)}` : "delivery date not supplied"}{candidate.source === "fixture" ? " · Fixture" : ""}</small>
                            <small className="muted">Cutoff (Helsinki): {candidate.closingTime ? when(candidate.closingTime) : "Not supplied"}</small>
                            <SupplierSchedule terms={candidate} />
                            <small className="muted"><CandidateRanking candidate={candidate} /></small>
                            {quantity === null && <small>Enter whole sales units after choosing, then check the price before approving.</small>}
                            {blockedReason && <small className="add-review-suggestion-block">{blockedReason}</small>}
                          </>}
                          quantity={quantity === null ? "TBC" : `${qty(quantity)} ${candidate.salesUnit ?? "sales units"}`}
                          price={<><b>{eur(quantity === null || candidate.unitPrice === null ? null : quantity * candidate.unitPrice)}</b><small className="muted">{eur(candidate.unitPrice)} / {candidate.salesUnit ?? "sales unit"}</small></>}
                          actions={<button type="button" className="btn sm" disabled={disabled || !!blockedReason} onClick={() => onChoose(candidate.productId)} aria-label={outside ? `Use ${candidate.name}` : undefined}>{outside ? "Choose & check" : "Use replacement"}</button>}
                        />
                      );
                    })}
                  </SuggestedProducts>
                  {replacementList.toggle}
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
                  {lateList.toggle}
                </div>
              )}
            </>
          )}
        </div>}
      </td></tr>}
    </tbody>
  );
}

/** Selected products and suggestions share the same columns, spacing and mobile layout. */
function ReviewProductRow({ product, quantity, price, actions, actionRows, tone }: {
  product: ReactNode; quantity: ReactNode; price: ReactNode; actions?: ReactNode; actionRows?: number; tone?: "suggested" | "outside";
}) {
  return <tr className={`add-review-row${tone ? ` add-review-suggestion ${tone}` : ""}`}>
    <td className="add-review-row-product">{product}</td>
    <td className="add-review-row-quantity">{quantity}</td>
    <td className="add-review-row-price">{price}</td>
    {actions !== undefined && <td rowSpan={actionRows} className="add-review-row-actions">{actions}</td>}
  </tr>;
}

function SuggestedProducts({ label, children }: { label: string; children: ReactNode }) {
  return <table className="add-review-table add-review-suggestions" aria-label={label}>
    <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Price ex VAT</th><th scope="col">Your choice</th></tr></thead>
    <tbody>{children}</tbody>
  </table>;
}

function SuggestionMark({ outside = false }: { outside?: boolean }) {
  return <span className="add-review-suggestion-mark"><Icon n={outside ? "alert" : "swap"} s={14} />{outside ? "Outside brief · check match" : "Suggested replacement"}</span>;
}

/** A manual product choice still needs valid supplier terms and must pass hard rules. */
function replacementBlock(candidate: Candidate, quantity: number | null, deliveryDate: string, now: string): string | null {
  const hardRule = candidate.notes.find((rule) => rule.outcome === "block");
  if (hardRule) return hardRule.message;
  if (candidate.unitPrice === null) return "Price not confirmed. Check again before choosing.";
  if (!candidate.availableDate) return "Delivery date not supplied. Choose another product.";
  if (candidate.availableDate > deliveryDate) return "Arrives after your delivery date. Choose another product.";
  const cutoff = parseTime(candidate.closingTime);
  if (!cutoff) return "Order cutoff not supplied. Check again before choosing.";
  if (cutoff <= (parseTime(now) ?? new Date())) return "Order cutoff has passed. Choose another product.";
  if (candidate.stock.kind === "none" || (candidate.stock.kind === "known" && candidate.stock.amount < (quantity ?? 1))) return "Not enough confirmed stock for this quantity.";
  return null;
}

function SupplierSchedule({ terms }: { terms: Pick<PlanLine, "availabilityEvidence" | "availableDate" | "closingTime"> }) {
  const schedule = terms.availabilityEvidence?.schedules[0];
  if (!schedule) return <p className="add-review-supplier-note small muted">Original supplier schedule not saved. Recheck the item terms before ordering.</p>;
  if (schedule.availableDate === terms.availableDate && schedule.closingTime === terms.closingTime) return null;
  return <p className="add-review-supplier-note small muted">Quoted delivery and cutoff are demo estimates. Original supplier schedule: {schedule.availableDate ? day(schedule.availableDate) : "date not supplied"}; cutoff (Helsinki): {schedule.closingTime ? when(schedule.closingTime) : "not supplied"}. A delivery hour is not supplied.</p>;
}

function replacementQuantity(candidate: Candidate, need: Need) {
  const pack = candidate.packContent;
  return pack && (need.amount.unit !== "pcs" || pack.verified) && pack.unit === need.amount.unit && pack.value > 0 ? Math.ceil(need.amount.value / pack.value - 1e-9) : null;
}

/** Unknown stock is not a shortage (D34): it keeps its rank and carries the "stock not confirmed" marker. */
function replacementScore(candidate: Candidate, deliveryDate: string) {
  const inTime = !!candidate.availableDate && candidate.availableDate <= deliveryDate;
  const stocked = candidate.stock.kind === "unknown" || (candidate.stock.kind === "known" && candidate.stock.amount > 0);
  return inTime && stocked ? 0 : 1;
}
