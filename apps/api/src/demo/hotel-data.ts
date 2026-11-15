/** Fictional hotel operations; SKUs and pack/price evidence come from the saved Junction fixtures. */
import type { EventSpec, SingleLine } from "@aimo/contracts";

export const HOTEL_DEMO_TIME = "2026-11-11T08:00:00.000Z";
export const HOTEL_DEMO_VERSION = 1;
export const HOTEL_DEMO_IDS = {
  breakfast: "evt-breakfast-monday",
  forum: "evt-nordic-leadership-forum",
  bar: "evt-partner-reception",
  milk: "evt-breakfast-milk-topup",
  allergy: "evt-board-dinner",
  draft: "evt-december-planning-lunch",
} as const;

type HotelBooking = Omit<EventSpec, "siteId">;
export const HOTEL_BOOKINGS: HotelBooking[] = [
  {
    id: HOTEL_DEMO_IDS.breakfast, name: "Monday breakfast · 144 residents", serviceDate: "2026-11-16", guests: 144,
    dietsConfirmed: true, dietGroups: [],
    dishes: [{ id: "breakfast", name: "Breakfast bakery and coffee", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "croissant", text: "Butter croissant", productId: "460768", perPortion: { amount: 1, unit: "pcs" } },
      { id: "bread", text: "Potato flatbread", productId: "460944", perPortion: { amount: 1, unit: "pcs" } },
      { id: "coffee", text: "Filter coffee", productId: "460617", total: { amount: 4.4, unit: "kg" } },
    ] }],
  },
  {
    id: HOTEL_DEMO_IDS.forum, name: "Nordic Leadership Forum · 320 delegates", serviceDate: "2026-11-16", guests: 320,
    dietsConfirmed: true, dietGroups: [],
    dishes: [
      { id: "lunch", name: "Finnish salmon buffet", outletId: "banquet", excludesGroups: [], ingredients: [
        { id: "salmon", text: "Finnish salmon", productId: "469672", origin: "fi", perPortion: { amount: 180, unit: "g" } },
        { id: "potatoes", text: "Button potatoes", productId: "460541", perPortion: { amount: 200, unit: "g" } },
      ] },
      { id: "breaks", name: "Morning and afternoon coffee", outletId: "banquet", excludesGroups: [], ingredients: [
        { id: "coffee", text: "Filter coffee", productId: "460617", perPortion: { amount: 20, unit: "g" } },
        { id: "milk", text: "Lactose-free coffee milk", productId: "464306", claims: ["FREE_FROM_LACTOSE"], perPortion: { amount: 250, unit: "ml" } },
      ] },
    ],
  },
  {
    id: HOTEL_DEMO_IDS.bar, name: "Partner reception · 96 guests", serviceDate: "2026-11-16", guests: 96,
    dietsConfirmed: true, dietGroups: [],
    dishes: [{ id: "welcome", name: "Alcohol-free welcome toast", outletId: "bar", excludesGroups: [], ingredients: [
      { id: "sparkling", text: "Alcohol-free sparkling", productId: "477125", perPortion: { amount: 125, unit: "ml" } },
    ] }],
  },
  {
    id: HOTEL_DEMO_IDS.milk, name: "Breakfast coffee service · milk top-up", serviceDate: "2026-11-16", guests: 144,
    dietsConfirmed: true, dietGroups: [],
    dishes: [{ id: "coffee", name: "Additional coffee milk", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "milk", text: "Lactose-free milk", productId: "464306", claims: ["FREE_FROM_LACTOSE"], total: { amount: 40, unit: "l" } },
    ] }],
  },
  {
    id: HOTEL_DEMO_IDS.allergy, name: "Board dinner · dessert allergy review", serviceDate: "2026-11-16", guests: 24,
    dietsConfirmed: true,
    dietGroups: [{ id: "tree-nut-free", label: "Tree-nut allergy", count: 1, standing: false, constraints: { claims: [], avoidAllergens: ["AN"], labels: [] } }],
    dishes: [{ id: "dessert", name: "Dessert for the whole table", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "cake", text: "Princess cake", productId: "467767", perPortion: { amount: 1, unit: "pcs" } },
    ] }],
  },
  {
    id: HOTEL_DEMO_IDS.draft, name: "December planning lunch · provisional", serviceDate: "2026-12-03", guests: 60,
    dietsConfirmed: false, dietGroups: [],
    dishes: [{ id: "lunch", name: "Salmon lunch · dietary counts to follow", outletId: "banquet", excludesGroups: [], ingredients: [
      { id: "salmon", text: "Finnish salmon", productId: "469672", origin: "fi", perPortion: { amount: 170, unit: "g" } },
      { id: "potatoes", text: "Button potatoes", productId: "460541", perPortion: { amount: 200, unit: "g" } },
    ] }],
  },
];

/** Explicitly selected products keep loading the preset independent of a model or live search. */
function line(id: string, productId: string, query: string, amount: number, unit: "kg" | "l" | "pcs", constraints: Partial<SingleLine["constraints"]> = {}): SingleLine {
  return { id, productId, query, text: `${amount} ${unit} ${query}`, quantity: { amount, unit }, category: null, productType: null,
    constraints: { claims: [], avoidAllergens: [], labels: [], ...constraints } };
}

export const HOTEL_REQUESTS = {
  breakfast: [line("croissant", "460768", "croissant", 144, "pcs"), line("bread", "460944", "potato flatbread", 144, "pcs"), line("coffee", "460617", "coffee", 4.4, "kg")],
  forum: [line("salmon", "469672", "salmon", 57.6, "kg", { origin: "fi" }), line("potatoes", "460541", "button potatoes", 64, "kg"), line("coffee", "460617", "coffee", 6.4, "kg"), line("milk", "464306", "milk", 80, "l", { claims: ["FREE_FROM_LACTOSE"] })],
  bar: [line("sparkling", "477125", "sparkling", 12, "l")],
  milk: [line("milk", "464306", "milk", 40, "l", { claims: ["FREE_FROM_LACTOSE"] })],
  allergy: [line("cake", "467767", "princess cake", 24, "pcs", { avoidAllergens: ["AN"] })],
};
