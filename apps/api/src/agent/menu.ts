/**
 * Menu → order (CH-01, CH-12, Q01.1, Q03.3). The chef enters dishes with an amount per
 * guest for each ingredient, plus the head count and diet groups. NEED-TOTAL scales each
 * ingredient by the guests who eat that dish, combines identical needs across dishes
 * (rounded once later by PACK-ROUND, D25), and hands the result to the same request
 * pipeline as a typed product lookup. The chef then reviews it in the same dialog.
 */
import { z } from "zod";
import { DietGroup, Dish, type Constraints, type FiredRule, type SingleLine, type SingleRequest } from "@aimo/contracts";
import { fire } from "../rules/catalogue.js";
import { newId } from "../util.js";
import { getProduct } from "../catalog.js";
import { rulesParse, toBase, quantitySanity } from "./parse.js";
import { editEvent, type StoredEvent } from "./events.js";
import type { Person } from "../identity.js";

export const MenuBody = z.object({
  version: z.number().int(),
  guests: z.number().int().min(0).max(100_000),
  dietsConfirmed: z.boolean(),
  dietGroups: z.array(DietGroup).max(50),
  dishes: z.array(Dish).max(100),
});
export type MenuBody = z.infer<typeof MenuBody>;

/** One dish's (and diet group's) part of a combined order line. */
export interface MenuShare {
  dishId: string;
  dishName: string;
  ingredientId: string;
  groupId: string;
  groupLabel: string;
  guests: number | null;
  perPortion: { amount: number; unit: string } | null;
  amount: number;
}

export interface MenuLine {
  lineId: string;
  text: string;
  productId: string | null;
  query: string;
  productType: string | null;
  category: string | null;
  total: { amount: number; unit: "kg" | "l" | "pcs" };
  constraints: Constraints;
  shares: MenuShare[];
}

export interface MenuScale {
  guests: number;
  regularGuests: number;
  lines: MenuLine[];
  /** Problems that stop the order being generated (missing head count, diets, amounts). */
  problems: FiredRule[];
  /** Quantity sanity questions (QTY-02): shown to the chef, never corrected. */
  warnings: FiredRule[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const sortU = (xs: string[] | undefined) => [...new Set(xs ?? [])].sort();

/** REQUEST-VALIDATE for the menu, then NEED-TOTAL. Deterministic: same menu, same lines. */
export function scaleMenu(e: Pick<StoredEvent, "name" | "guests" | "dietGroups" | "dishes" | "dietsConfirmed">): MenuScale {
  const problems: FiredRule[] = [];
  const warnings: FiredRule[] = [];
  const dietTotal = e.dietGroups.reduce((s, g) => s + g.count, 0);
  if (!e.guests) problems.push(fire("REQ-06", { event: e.name }));
  if (dietTotal > e.guests) problems.push(fire("DIET-03", { dietTotal, guests: e.guests }));
  if (!e.dietsConfirmed) problems.push(fire("REQ-05", { event: e.name }));
  const regular = Math.max(0, e.guests - dietTotal);

  const combined = new Map<string, MenuLine>();
  for (const dish of e.dishes) {
    const groups = [
      { id: "regular", label: "No restrictions", count: regular, constraints: { claims: [], avoidAllergens: [], labels: [] } as Constraints },
      ...e.dietGroups.filter((g) => !dish.excludesGroups.includes(g.id)).map((g) => ({ id: g.id, label: g.label, count: g.count, constraints: g.constraints })),
    ];
    for (const ing of dish.ingredients) {
      if (!ing.text.trim()) continue;
      if (!ing.total && !(ing.perPortion && ing.perPortion.amount > 0)) {
        problems.push(fire("REQ-02", { need: `${ing.text} (${dish.name})` }));
        continue;
      }
      // The ingredient words carry claims, allergies and origin the same way a typed request does.
      const parsed = rulesParse(ing.text).lines;
      const read = parsed.length === 1 ? parsed[0] : null;
      for (const g of groups) {
        if (g.count <= 0) continue;
        // A fixed total belongs to the whole event: one share, carried by the unrestricted guests.
        if (ing.total && g.id !== "regular") continue;
        const productId = ing.variants?.[g.id] ?? ing.productId ?? null;
        const base = ing.total ? toBase(ing.total) : toBase(ing.perPortion!);
        const amount = ing.total ? base.value : base.value * g.count;
        if (ing.perPortion && !ing.total) warnings.push(...quantitySanity(`${ing.text} (${dish.name})`, ing.perPortion, g.count));
        const constraints: Constraints = {
          claims: sortU([...(g.constraints.claims ?? []), ...(ing.claims ?? []), ...(read?.constraints.claims ?? [])]),
          avoidAllergens: sortU([...(g.constraints.avoidAllergens ?? []), ...(read?.constraints.avoidAllergens ?? [])]),
          labels: sortU(g.constraints.labels),
          ...((ing.origin ?? read?.constraints.origin ?? g.constraints.origin) ? { origin: ing.origin ?? read?.constraints.origin ?? g.constraints.origin } : {}),
        };
        const query = (ing.query ?? read?.query ?? ing.text).trim().toLowerCase();
        const productType = ing.productType ?? read?.productType ?? null;
        const category = ing.category ?? read?.category ?? (productId ? getProduct(productId)?.category ?? null : null);
        // Q03.3: identical needs (same product or same spec, same diet rules, same unit) become one line.
        const key = JSON.stringify([productId ?? query, productType, category, base.unit, constraints]);
        const share: MenuShare = {
          dishId: dish.id, dishName: dish.name, ingredientId: ing.id, groupId: g.id, groupLabel: g.label,
          guests: ing.total ? null : g.count, perPortion: ing.total ? null : ing.perPortion!, amount: round3(amount),
        };
        const prev = combined.get(key);
        if (prev) {
          prev.total.amount = round3(prev.total.amount + amount);
          prev.shares.push(share);
        } else {
          combined.set(key, {
            lineId: newId("menu"),
            text: ing.text.trim(),
            productId,
            query,
            productType,
            category,
            total: { amount: round3(amount), unit: base.unit },
            constraints,
            shares: [share],
          });
        }
      }
    }
  }
  if (!combined.size && !problems.some((p) => p.ruleId === "REQ-02")) problems.push(fire("REQ-02", { need: "the menu" }));
  return { guests: e.guests, regularGuests: regular, lines: [...combined.values()], problems, warnings: dedupe(warnings) };
}

function dedupe(rules: FiredRule[]) {
  return [...new Map(rules.map((r) => [`${r.ruleId}|${r.message}`, r])).values()];
}

/** Where each line's amount came from, e.g. "Dessert 45 l, Sauce 9 l". */
export function shareText(line: MenuLine): string {
  return line.shares.map((s) => `${s.dishName}${s.groupId === "regular" ? "" : ` (${s.groupLabel})`} ${+s.amount.toFixed(3)} ${line.total.unit}`).join(", ");
}

/** The scaled menu as the same request a typed lookup produces, so review, basket and approval are shared. */
export function menuRequest(e: StoredEvent, scale: MenuScale, siteId: string, outletId: string): SingleRequest {
  const lines: SingleLine[] = scale.lines.map((l) => ({
    id: l.lineId,
    text: `${l.text} · ${shareText(l)}`,
    query: l.query,
    productType: l.productType,
    category: l.category,
    productId: l.productId,
    quantity: { amount: l.total.amount, unit: l.total.unit },
    constraints: l.constraints,
  }));
  return {
    kind: "single",
    originalText: `Menu for ${e.name}: ${e.guests} guests, ${e.dishes.length} dish${e.dishes.length === 1 ? "" : "es"}`,
    siteId,
    outletId,
    neededBy: e.serviceDate,
    neededByText: null,
    lines,
    parsedBy: "rules",
  };
}

/** EDIT-GUARD: the menu is saved against the version the chef opened. */
export function saveMenu(eventId: string, body: MenuBody, p: Person): StoredEvent {
  return editEvent(eventId, body.version, p.name, `Menu: ${body.dishes.length} dish${body.dishes.length === 1 ? "" : "es"}, ${body.guests} guests`, (e) => {
    e.guests = body.guests;
    e.dietsConfirmed = body.dietsConfirmed;
    e.dietGroups = body.dietGroups;
    e.dishes = body.dishes;
  });
}
