import type { Constraints, Dish, EventSpec, FiredRule, Ingredient } from "@aimo/contracts";
import { fire } from "../rules/catalogue.js";
import { rulesParse } from "./parse.js";

type ServingGroup = { id: string; label: string; count: number; constraints: Constraints };
type Allocation = { group: ServingGroup; productId: string | null };
const union = (values: string[]) => [...new Set(values)].sort();

/** Only guests served by this dish contribute constraints or recipe variants. */
export function participatingGroups(e: Pick<EventSpec, "guests" | "dietGroups">, dish: Dish): ServingGroup[] {
  const regular = Math.max(0, e.guests - e.dietGroups.reduce((sum, group) => sum + group.count, 0));
  return [
    { id: "regular", label: "No restrictions", count: regular, constraints: { claims: [], avoidAllergens: [], labels: [] } },
    ...e.dietGroups,
  ].filter((group) => group.count > 0 && !dish.excludesGroups.includes(group.id));
}

/** Fixed totals are shared event requirements, never a quantity per diet group.
 * Different recipe products or origins need explicit quantities; guest counts
 * alone do not establish how a fixed total should be split (PRD Q03.3).
 */
export function ingredientAllocations(ing: Ingredient, dish: Dish, groups: ServingGroup[]): { allocations: Allocation[]; problems: FiredRule[] } {
  const allocations = groups.map((group) => ({ group, productId: ing.variants?.[group.id] ?? ing.productId ?? null }));
  if (!ing.total || !allocations.length) return { allocations, problems: [] };

  const parsed = rulesParse(ing.text).lines;
  const read = parsed.length === 1 ? parsed[0].constraints : null;
  const products = new Set(allocations.map((allocation) => allocation.productId));
  const origins = union([ing.origin, read?.origin, ...groups.map((group) => group.constraints.origin)].filter((origin): origin is string => Boolean(origin)));
  if (products.size > 1 || origins.length > 1) {
    const reason = products.size > 1 ? "participating groups have different recipe products" : "participating groups require different origins";
    const problem = fire("REQ-02", { need: `${ing.text} (${dish.name}) for each participating group`, reason });
    problem.message = `Split the fixed ${ing.total.amount} ${ing.total.unit} total for ${ing.text} (${dish.name}) into explicit group quantities before generating: ${reason}.`;
    return { allocations: [], problems: [problem] };
  }

  const constraints = [...groups.map((group) => group.constraints), ...(read ? [read] : [])];
  return {
    allocations: [{
      productId: allocations[0].productId,
      group: {
        id: "event-total", label: "Event total", count: groups.reduce((sum, group) => sum + group.count, 0),
        constraints: {
          claims: union([...(ing.claims ?? []), ...constraints.flatMap((c) => c.claims)]),
          avoidAllergens: union(constraints.flatMap((c) => c.avoidAllergens)),
          labels: union(constraints.flatMap((c) => c.labels)),
          ...(origins.length ? { origin: origins[0] } : {}),
        },
      },
    }],
    problems: [],
  };
}
