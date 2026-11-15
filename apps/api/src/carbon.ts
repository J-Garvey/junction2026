import type { CarbonBasis, LookupLine, Product } from "@aimo/contracts";
import { packContent } from "./rules/checks.js";

/** Carbon never contributes rules, ranking, approval requirements or monetary totals. */
export function carbonBasisFor(product: Product | null, lookup: LookupLine): CarbonBasis | null {
  const factor = product?.co2KgPerKg;
  if (!product || factor == null || !Number.isFinite(factor) || factor < 0 || !lookup.salesUnit) return null;
  // Ask independently of the request unit: a piece-based need may have a checked kg sales pack.
  // An L comparison, unverified catalogue weight or piece count does not establish mass.
  const mass = packContent(product, lookup, "kg");
  if (!mass?.verified || mass.unit !== "kg" || !Number.isFinite(mass.value) || mass.value <= 0) return null;
  return { co2KgPerKg: factor, kgPerSalesUnit: mass.value, massSource: mass.source };
}
