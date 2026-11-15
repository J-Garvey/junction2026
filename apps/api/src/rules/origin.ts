/** Exact category scope from the signed mandate; names and allergens never establish origin. */
import type { FiredRule, Mandate, Product } from "@aimo/contracts";
import { fire } from "./catalogue.js";

export type OriginPolicy = Pick<Mandate, "categoryOriginRequirements">;

export function requiredOrigins(p: Pick<Product, "category">, mandate?: OriginPolicy): string[] {
  return [...new Set((mandate?.categoryOriginRequirements ?? [])
    .filter((r) => r.categories.includes(p.category)).map((r) => r.origin))];
}

export function passesMandateOrigin(p: Pick<Product, "category" | "origin">, mandate?: OriginPolicy): boolean {
  return (mandate?.categoryOriginRequirements ?? []).every((r) => !r.categories.includes(p.category) || p.origin === r.origin);
}

/** Standing requirements cannot be waived by a recipe's configurable ORG-01 outcome. */
export function mandateOriginRules(p: Product, mandate?: OriginPolicy): FiredRule[] {
  return requiredOrigins(p, mandate).filter((origin) => p.origin !== origin).map((required) => ({
    ...fire("ORG-01", { product: p.name, productId: p.id, category: p.category, origin: p.origin || "unknown", required, source: "mandate" }),
    outcome: "block",
    overridable: false,
  }));
}
