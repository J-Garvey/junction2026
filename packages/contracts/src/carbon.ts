import { z } from "zod";

/** Informational product-group factor and checked mass per supplier sales unit. */
export const CarbonBasis = z.object({
  co2KgPerKg: z.number().nonnegative(),
  kgPerSalesUnit: z.number().positive(),
  massSource: z.string(),
});
export type CarbonBasis = z.infer<typeof CarbonBasis>;

/** Use the actual whole sales quantity, including pack rounding, never the requested litres or pieces. */
export function carbonEstimateKg(quantity: number, basis: CarbonBasis | null | undefined): number | null {
  if (!basis || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(basis.co2KgPerKg) || basis.co2KgPerKg < 0
    || !Number.isFinite(basis.kgPerSalesUnit) || basis.kgPerSalesUnit <= 0
    || typeof basis.massSource !== "string" || !basis.massSource.trim()) return null;
  const estimate = quantity * basis.kgPerSalesUnit * basis.co2KgPerKg;
  return Number.isFinite(estimate) ? estimate : null;
}
