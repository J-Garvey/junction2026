import type { Need } from "@aimo/contracts";

export type FunnelProduct = { productId: string; name: string };
const STAGES = {
  lookup: "Supplier lookup evidence",
  eligibility: "Diet, origin and supplier rules",
  cutoff: "Order cutoff",
  type: "Product type",
  delivery: "Delivery date",
};

/** Presentation only: never recomputes eligibility or selection from current catalogue data. */
export function selectionFunnel(need: Need) {
  const candidates = [...new Map(need.candidates.map((c) => [c.productId, c])).values()].sort((a, b) => a.rank - b.rank);
  const trace = need.selectionTrace;
  const products = [...new Map((trace?.shortlist ?? [...need.excluded, ...candidates])
    .map((p) => [p.productId, { productId: p.productId, name: p.name }])).values()];
  const byId = new Map(products.map((p) => [p.productId, p]));
  const remaining = new Set(byId.keys());
  let consistent = true;
  const savedStages = trace?.stages ?? [{ key: "saved" as const, removedProductIds: [...new Set(need.excluded.map((e) => e.productId))] }];
  const stages = savedStages.map((stage) => {
    const before = remaining.size;
    const removed: FunnelProduct[] = [];
    for (const id of new Set(stage.removedProductIds)) {
      if (!remaining.delete(id)) { consistent = false; continue; }
      removed.push(byId.get(id)!);
    }
    return { key: stage.key, label: stage.key === "saved" ? "Saved exclusions" : STAGES[stage.key], before, after: remaining.size, removed };
  });
  if (remaining.size !== candidates.length || candidates.some((c) => !remaining.has(c.productId)) || need.candidateCount !== candidates.length) consistent = false;
  return { products, candidates, stages, complete: !!trace && consistent, consistent };
}
