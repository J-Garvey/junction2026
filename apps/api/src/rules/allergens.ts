import type { Product } from "@aimo/contracts";

/** An allergy to a family also excludes its individually coded members. */
const FAMILIES: Record<string, string[]> = {
  AN: ["AN", "SA", "SC", "SH", "SW", "SP", "ST", "SM", "SR"],
  AW: ["AW", "UW", "GB", "NR", "GO", "GS", "GK"],
  AM: ["AM", "ML"],
};
export const expandAllergens = (codes: string[]) => [...new Set(codes.flatMap((c) => FAMILIES[c] ?? [c]))];

/** Q02.3: explicit UNDECLARED is an allergy exclusion, distinct from missing data. */
export function allergenConflicts(p: Pick<Product, "contains" | "mayContain" | "allergenUndeclared">, avoid: string[]) {
  return expandAllergens(avoid).flatMap((code) => {
    if (code === "X99") return [];
    const level: "contains" | "may contain" | "undeclared" | null = p.contains.includes(code) ? "contains"
      : p.mayContain.includes(code) ? "may contain"
      : p.allergenUndeclared?.includes(code) ? "undeclared" : null;
    return level ? [{ code, level }] : [];
  });
}
