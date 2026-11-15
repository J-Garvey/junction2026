/** Shared item review used for new items and saved pending requests. */
import { useEffect, useRef, useState } from "react";
import type { SingleRequest, Unit } from "@aimo/contracts";
import { api, ApiError, type BasketResp, type PlanResp } from "../api";
import { useApp } from "../ctx";
import { claimLabel, day, eur } from "../format";
import { OrderItemDialog } from "./OrderItemDialog";
import { ProductReviewItem } from "./ProductReviewItem";
import { QuestionCard } from "./QuestionCard";
import { ProcessingTime } from "./ProcessingTime";
import { Icon } from "./icons";
import { TotalCalculation } from "./CalculationEvidence";

const UNITS: Unit[] = ["l", "dl", "ml", "kg", "g", "pcs"];

export function RequestReviewDialog({ initialReview, deliveryDate, onClose, onChanged, onAdded }: {
  initialReview: PlanResp;
  deliveryDate: string;
  onClose: () => void;
  onChanged: () => void;
  onAdded: (basket?: BasketResp) => void;
}) {
  const { me, refresh } = useApp();
  const [review, setReview] = useState(initialReview);
  const request = review.plan.request;
  const [editTarget, setEditTarget] = useState<{ lineId: string; field: "quantity" | "description"; amount: string; unit: Unit; description: string } | null>(null);
  const [busy, setBusy] = useState<"check" | "replace" | "remove" | "approve" | "quantity" | "add" | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Refresh external changes when no local decision/edit is in progress. Mutations
  // themselves return the authoritative plan, including conflicts with changed terms.
  useEffect(() => {
    if (!busy && !editTarget) setReview(initialReview);
  }, [initialReview]);
  const inScope = me.hotelScope || me.outlets.includes(review.plan.outletId);
  const editable = inScope && !review.plan.basketedAt && !review.plan.orderIds.length
    && !review.questions.some((q) => q.state === "open" || q.state === "waiting");

  async function startReview() {
    if (busy || !editable) return;
    setBusy("check");
    setDialogError(null);
    try {
      setReview(await api.reviewItems(review.plan.id));
      onChanged();
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  // A saved request is rechecked as soon as it opens, so it reads like a fresh item review.
  const autoReviewed = useRef(false);
  useEffect(() => {
    if (autoReviewed.current || !editable || review.plan.itemReviews) return;
    autoReviewed.current = true;
    startReview();
  }, []);

  async function reloadDecision() {
    setDialogError(null);
    try {
      setReview(await api.plan(review.plan.id));
      onChanged();
    } catch (e) {
      setDialogError((e as Error).message);
    }
  }

  function edit(line: SingleRequest["lines"][number], field: "quantity" | "description") {
    setDialogError(null);
    setEditTarget({ lineId: line.id, field, amount: String(line.quantity?.amount ?? ""), unit: line.quantity?.unit ?? "pcs", description: line.query });
  }
  const editReady = !!editTarget?.description.trim() && Number.isFinite(Number(editTarget.amount)) && Number(editTarget.amount) > 0;

  async function recheck(next: SingleRequest, parseAuditId?: string) {
    const { parseAuditId: _priorParsing, ...request } = next;
    const result = await api.requote(review.plan.id, { ...request, ...(parseAuditId ? { parseAuditId } : {}) });
    setReview(result);
    setEditTarget(null);
    onChanged();
  }

  async function checkChanges() {
    if (!request || !editTarget || !editReady || busy) return;
    setBusy("check");
    setDialogError(null);
    try {
      const original = request.lines.find((line) => line.id === editTarget.lineId)!;
      let parseAuditId: string | undefined;
      let updated = { ...original, quantity: { amount: Number(editTarget.amount), unit: editTarget.unit } };
      if (editTarget.description.trim() !== original.query) {
        const parsed = await api.message(`${editTarget.amount} ${editTarget.unit} ${editTarget.description.trim()}`);
        if (parsed.route === "event_change" || parsed.route === "neither" || parsed.request.lines.length !== 1) {
          throw new Error("Describe one product for this row, then check it again.");
        }
        const line = parsed.request.lines[0];
        parseAuditId = parsed.request.parseAuditId;
        updated = { ...line, id: original.id, quantity: updated.quantity, constraints: {
          ...original.constraints,
          ...line.constraints,
          claims: [...new Set([...original.constraints.claims, ...line.constraints.claims])],
          avoidAllergens: [...new Set([...original.constraints.avoidAllergens, ...line.constraints.avoidAllergens])],
          labels: [...new Set([...original.constraints.labels, ...line.constraints.labels])],
          origin: original.constraints.origin ?? line.constraints.origin,
        } };
      }
      await recheck({ ...request, lines: request.lines.map((line) => line.id === original.id ? updated : line) }, parseAuditId);
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function discard(lineId: string) {
    if (!request || busy) return;
    const lines = request.lines.filter((line) => line.id !== lineId);
    if (!lines.length && !plan?.reviewing) {
      setDialogError("Keep at least one item, or close these details without adding it.");
      return;
    }
    if (!lines.length) {
      setEditTarget(null);
      onClose();
      return;
    }
    setBusy("remove");
    setDialogError(null);
    try {
      await recheck({ ...request, lines });
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function choose(needId: string, productId: string) {
    if (!review || busy || !editable) return;
    setBusy("replace");
    setDialogError(null);
    try {
      setReview(await api.choose(review.plan.id, needId, productId));
      onChanged();
    } catch (e) {
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    if (!canAdd || busy) return;
    setBusy("add");
    setDialogError(null);
    try {
      const result = await api.basketPlan(review.plan.id);
      onAdded(result.basket);
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.body?.plan) setReview({ plan: e.body.plan, questions: [] });
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resolveItem(needId: string, salesQuantity?: { productId: string; quantity: number }) {
    const item = review?.plan.itemReviews?.find((item) => item.needId === needId);
    if (!review || !item || busy || !editable) return;
    setBusy(salesQuantity ? "quantity" : "approve");
    setDialogError(null);
    try {
      setReview(salesQuantity
        ? await api.itemSalesQuantity(review.plan.id, needId, item.fingerprint, salesQuantity.productId, salesQuantity.quantity)
        : await api.approveItem(review.plan.id, needId, item.fingerprint));
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.body?.plan) setReview({ plan: e.body.plan, questions: [] });
      setDialogError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const plan = review?.plan ?? null;
  const readyCount = plan?.itemReviews?.filter((item) => item.canApprove && (item.requiresApproval === false || item.approvedAt)).length ?? 0;
  const canAdd = editable && !!plan?.proposal && !!request?.lines.length && readyCount === request.lines.length && !plan.error && !plan.tooLate;
  if (!request) return null;
  return (
    <OrderItemDialog
      eyebrow="Add to order"
      title={canAdd ? "Ready to add" : request.lines.length === 1 ? "Review the item" : "Review the order"}
      description={initialReview.plan.reviewing || plan?.createdBy.personId === me.id
        ? "Check what was understood and whether it can arrive with this order."
        : `Requested by ${plan?.createdBy.name}. Check what was understood and whether it can arrive with this order.`}
      onClose={() => { if (!busy) onClose(); }}
    >
      <div className="add-review-date"><Icon n="cal" s={18} /><span><small>Delivery date</small><b>{day(plan?.deliveryDate ?? deliveryDate)}</b></span></div>
      <ProcessingTime processing={plan?.processing} />

      {!editable && <div className="callout blue" role="status">{inScope ? "This request is awaiting the decision below or has already been added." : "This request is outside your outlet scope. The order builder must review it."}</div>}
      {review.questions.filter((q) => q.state === "open" || q.state === "waiting").map((q) => <QuestionCard key={q.id} q={q} onAnswered={reloadDecision} />)}
      <div className="item-dialog-section add-review-section">
        <h3>Products</h3>
        <div className="add-review-table-wrap">
          <table className="add-review-table" aria-label="Products to review">
            <thead><tr><th scope="col">Product</th><th scope="col">Quantity</th><th scope="col">Total ex VAT</th><th scope="col">Review</th></tr></thead>
          {request.lines.map((line) => (
            <ProductReviewItem
              key={line.id}
              line={line}
              need={plan?.needs.find((need) => need.id === line.id)}
              lines={plan?.lines.filter((product) => product.needIds.includes(line.id) && !product.removed) ?? []}
              deliveryDate={deliveryDate}
              checked={!!plan}
              disabled={!!busy || !!editTarget || !editable}
              review={plan?.itemReviews?.find((item) => item.needId === line.id)}
              onApprove={() => resolveItem(line.id)}
              onSalesQuantity={(productId, quantity) => resolveItem(line.id, { productId, quantity })}
              onEdit={(field) => edit(line, field)}
              onDiscard={request.lines.length > 1 || plan?.reviewing ? () => discard(line.id) : undefined}
              onChoose={(productId) => choose(line.id, productId)}
            >
              {editTarget?.lineId === line.id && (
                <form className="add-review-editor" onSubmit={(event) => { event.preventDefault(); checkChanges(); }}>
                  <div className="add-review-edit-fields">
                    <label className="field"><span className="small muted">Quantity</span><input autoFocus={editTarget.field === "quantity"} aria-label={`Quantity for ${line.query}`} type="number" min="0" step="any" disabled={!!busy} value={editTarget.amount} onChange={(event) => setEditTarget({ ...editTarget, amount: event.target.value })} /></label>
                    <label className="field"><span className="small muted">Unit</span><select aria-label={`Unit for ${line.query}`} disabled={!!busy} value={editTarget.unit} onChange={(event) => setEditTarget({ ...editTarget, unit: event.target.value as Unit })}>{UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></label>
                    <label className="field"><span className="small muted">Description</span><input autoFocus={editTarget.field === "description"} aria-label={`Description for ${line.query}`} disabled={!!busy} value={editTarget.description} onChange={(event) => setEditTarget({ ...editTarget, description: event.target.value })} /></label>
                  </div>
                  {line.constraints.claims.length > 0 && <div className="small muted">Requirements: {line.constraints.claims.map(claimLabel).join(", ")}</div>}
                  <div className="row">
                    <button type="submit" className="btn sm primary" disabled={!!busy || !editReady}>{busy === "check" ? "Checking…" : "Check item"}</button>
                    <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => { setEditTarget(null); setDialogError(null); }}>Cancel edit</button>
                  </div>
                </form>
              )}
            </ProductReviewItem>
          ))}
          </table>
        </div>
      </div>

      {busy === "check" && !plan?.itemReviews && <div className="add-review-loading">Checking products, stock and delivery…</div>}
      {dialogError && <div className="callout red" role="alert">{dialogError} <button type="button" className="btn sm" disabled={!!busy} onClick={editable && !plan?.itemReviews ? startReview : reloadDecision}>Refresh details</button></div>}
      {busy && !(busy === "check" && !plan?.itemReviews) && <div className="small muted" role="status">{busy === "replace" ? "Checking replacement, stock and price..." : "Saving and checking current terms..."}</div>}

      {plan && editable && !editTarget && (
        <>
          {!canAdd && <div className="callout yellow add-review-result" role="status">
            <b>{readyCount} of {request.lines.length} items ready</b>
            <span>Review the items that need attention to continue.</span>
            {plan.error && <span>{plan.error}</span>}
            {plan.inputRules.length > 0 && <ul>{plan.inputRules.filter((rule) => rule.outcome !== "order").map((rule) => <li key={rule.ruleId}>{rule.message}</li>)}</ul>}
          </div>}

          <div className="add-review-actions">
            <button type="button" className="btn primary" disabled={!!busy || !canAdd} onClick={add}>{busy === "add" ? "Adding…" : "Add to order"}</button>
            <button type="button" className="btn ghost" disabled={!!busy} onClick={onClose}>Close</button>
            <span className="add-review-total"><small>Total ex VAT</small><b><TotalCalculation title="request total" total={plan.totalExVat} lines={plan.lines} /></b></span>
          </div>
        </>
      )}
    </OrderItemDialog>
  );
}
