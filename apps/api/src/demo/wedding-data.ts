import type { EventSpec } from "@aimo/contracts";

export const WEDDING_AUTHOR = "Aino";

/**
 * docs/demo-plan.md: Emma and Lauri's wedding. Every product is real; amounts are Aino's
 * recipe. Frozen lines thaw overnight in the cold room (a recipe override of Q04.3's
 * two-day default), so Monday's delivery serves Tuesday's wedding.
 */
export const SEED_EVENT: EventSpec = {
  id: "evt-wedding",
  name: "Emma and Lauri's wedding",
  siteId: "site-aurora",
  serviceDate: "2026-11-17",
  deliveryDate: "2026-11-16",
  guests: 180,
  dietsConfirmed: true,
  dietGroups: [],
  dishes: [
    {
      id: "main", name: "Salmon main", outletId: "banquet", excludesGroups: [],
      ingredients: [
        { id: "salmon", text: "Salmon fillet pieces", productId: "469672", origin: "fi", frozen: false, perPortion: { amount: 170, unit: "g" } },
        { id: "potato", text: "Button potatoes", productId: "460541", perPortion: { amount: 200, unit: "g" } },
      ],
    },
    {
      id: "dessert", name: "Dessert", outletId: "banquet", excludesGroups: [],
      ingredients: [
        { id: "cream", text: "Whipping cream", productId: "464727", claims: ["FREE_FROM_LACTOSE"], perPortion: { amount: 2.5, unit: "dl" } },
        { id: "cake", text: "Princess cake", productType: "cake", productId: "467767", frozen: false, perPortion: { amount: 1, unit: "pcs" } },
      ],
    },
    {
      id: "coffee", name: "Coffee service", outletId: "banquet", excludesGroups: [],
      ingredients: [
        { id: "coffee", text: "Coffee", productId: "460617", perPortion: { amount: 10, unit: "g" } },
        { id: "milk", text: "Lactose-free milk for coffee", query: "milk", category: "10400", productType: "plain drinking milk", claims: ["FREE_FROM_LACTOSE"], total: { amount: 40, unit: "l" } },
      ],
    },
    {
      id: "toast", name: "Toast", outletId: "bar", excludesGroups: [],
      ingredients: [{ id: "sparkling", text: "Sparkling, alcohol-free", productId: "477125", perPortion: { amount: 1.25, unit: "dl" } }],
    },
  ],
};

