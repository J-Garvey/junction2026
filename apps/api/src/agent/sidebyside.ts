/** SPEC-COMPARE (Q07.5): a side-by-side built from the data only, differences marked. */
import { getProduct } from "../catalog.js";
import { allergenName } from "../rules/checks.js";

export function specCompare(originalId: string, subId: string, extra: { originalPrice?: number | null; subPrice?: number | null; originalPack?: string; subPack?: string } = {}) {
  const a = getProduct(originalId);
  const b = getProduct(subId);
  if (!a || !b) return [];
  const n = (p: typeof a, k: string) => (p.nutrition?.[k] !== undefined ? `${p.nutrition[k]} g` : "unknown");
  const rows: [string, string, string][] = [
    ["Product", a.name, b.name],
    ["Brand", a.brand ?? "–", b.brand ?? "–"],
    ["Ingredients", a.ingredients ?? "not stated", b.ingredients ?? "not stated"],
    ["Fat /100 g", n(a, "fat"), n(b, "fat")],
    ["Protein /100 g", n(a, "prot"), n(b, "prot")],
    ["Sugar /100 g", n(a, "sugar"), n(b, "sugar")],
    ["Claims", a.claims.join(", ") || "none", b.claims.join(", ") || "none"],
    ["Contains", a.hasAllergenData ? a.contains.map(allergenName).join(", ") || "none declared" : "no declaration", b.hasAllergenData ? b.contains.map(allergenName).join(", ") || "none declared" : "no declaration"],
    ["May contain", a.mayContain.map(allergenName).join(", ") || "–", b.mayContain.map(allergenName).join(", ") || "–"],
    ["Pack", extra.originalPack ?? (a.packContent ? `${a.packContent.value} ${a.packContent.unit}` : "unknown"), extra.subPack ?? (b.packContent ? `${b.packContent.value} ${b.packContent.unit}` : "unknown")],
    ["Price per kg or L", extra.originalPrice != null ? `€${extra.originalPrice.toFixed(2)}` : "–", extra.subPrice != null ? `€${extra.subPrice.toFixed(2)}` : "–"],
    ["Delivery reliability", a.reliability === null ? "unknown" : `${Math.round(a.reliability * 100)}%`, b.reliability === null ? "unknown" : `${Math.round(b.reliability * 100)}%`],
  ];
  return rows.map(([field, original, substitute]) => ({ field, original, substitute, differs: original !== substitute }));
}
