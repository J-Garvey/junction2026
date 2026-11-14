/**
 * SEED-RESET (chunk 11): one fresh database with one fictional hotel, its
 * outlets and people, the signed mandate, the demo event and the clock at
 * scene 1. All of it is fixture data and is labelled as such on screen.
 *
 * Two seeds share the same engine: "gala" is the PRD's test event, and
 * "wedding" is the story in docs/demo-plan.md that the video records.
 */
import type { EventSpec, Mandate } from "@aimo/contracts";
import { getDb, resetDb, kvGet, kvSet } from "./db.js";
import { config } from "./config.js";
import { setClock, SCENES } from "./clock.js";
import { issueFixedToken, type Person } from "./identity.js";
import { putMandate } from "./gateway/service.js";
import { audit, SYSTEM } from "./audit.js";
import { HOTEL_ID } from "./agent/plan.js";
import { saveEvent, type StoredEvent } from "./agent/events.js";

/** Documented in the README so an outside agent can call the gateway. Demo values, not secrets. */
export const OUTSIDE_AGENT_TOKEN = "agent_demo_hotel_aurora";
export const HOTEL_AGENT_TOKEN = "agent_internal_hotel_aurora";
export const VALIO_VIEWER_TOKEN = "valio_demo_viewer";

export const OUTLETS = [
  { id: "banquet", name: "Banquet kitchen" },
  { id: "bar", name: "Lobby bar" },
];

export const PEOPLE: Person[] = [
  { id: "p-anna", name: "Anna Virtanen", title: "Banquet chef", role: "chef", outlets: ["banquet"], hotelScope: false, hotelId: HOTEL_ID },
  { id: "p-mikko", name: "Mikko Laine", title: "Bar manager", role: "chef", outlets: ["bar"], hotelScope: false, hotelId: HOTEL_ID },
  { id: "p-sara", name: "Sara Nieminen", title: "Financial controller", role: "approver", outlets: ["banquet", "bar"], hotelScope: true, hotelId: HOTEL_ID },
  { id: "p-jonas", name: "Jonas Berg", title: "F&B director", role: "approver", outlets: ["banquet", "bar"], hotelScope: true, hotelId: HOTEL_ID },
];

export const MANDATE: Mandate = {
  id: "mandate-aurora-1",
  type: "IntentMandate.standing",
  hotelId: HOTEL_ID,
  customerNumber: "123",
  sites: [{ id: "site-aurora", name: "Hotel Aurora, goods entrance", address: "Fictional street 1, Helsinki" }],
  spendCapEur: 5000,
  blockedProducts: [],
  deliveryDays: [1, 2, 3, 4, 5],
  holidays: ["2026-12-06", "2026-12-24", "2026-12-25", "2026-12-26"],
  preAnswers: { partialFillMaxShortPct: null, unknownStockMaxLineEur: null, overshootMaxPct: 10, overshootMaxEur: 25, priceRiseMaxPct: 5, guestChangeMaxPct: 5 },
  version: 1,
};

export const SEED_EVENT: EventSpec = {
  id: "evt-gala",
  name: "Nordic Health Summit gala dinner",
  siteId: "site-aurora",
  serviceDate: "2026-11-18",
  guests: 500,
  dietsConfirmed: true,
  dietGroups: [
    { id: "lf", label: "Lactose-free", count: 40, constraints: { claims: ["FREE_FROM_LACTOSE"], avoidAllergens: [], labels: [] }, standing: false },
    { id: "gf", label: "Gluten-free", count: 20, constraints: { claims: ["FREE_FROM_GLUTEN"], avoidAllergens: [], labels: [] }, standing: false },
    { id: "vegan", label: "Vegan", count: 8, constraints: { claims: ["VEGAN"], avoidAllergens: [], labels: [] }, standing: false },
  ],
  dishes: [
    {
      id: "soup", name: "Creamy salmon soup", outletId: "banquet", excludesGroups: ["vegan"],
      ingredients: [
        { id: "salmon", text: "Salmon fillet", productId: "471555", perPortion: { amount: 80, unit: "g" } },
        { id: "cream", text: "Cooking cream", productId: "464249", perPortion: { amount: 0.6, unit: "dl" } },
      ],
    },
    {
      id: "bread", name: "Bread and butter", outletId: "banquet", excludesGroups: ["vegan"],
      ingredients: [
        { id: "bread", text: "Sliced bread", productId: "461404", variants: { gf: "461088" }, perPortion: { amount: 60, unit: "g" } },
        { id: "butter", text: "Butter", productId: "475797", variants: { lf: "463437" }, perPortion: { amount: 15, unit: "g" } },
      ],
    },
    {
      id: "dessert", name: "Cloudberry cream with gingerbread", outletId: "banquet", excludesGroups: ["vegan"],
      ingredients: [
        { id: "whip", text: "Whipping cream", productId: "464727", perPortion: { amount: 0.5, unit: "dl" } },
        { id: "ginger", text: "Gingerbread crumble", productId: "460743", variants: { gf: "474771" }, perPortion: { amount: 15, unit: "g" } },
      ],
    },
    {
      id: "coffee", name: "Coffee service", outletId: "bar", excludesGroups: [],
      ingredients: [{ id: "cmilk", text: "Coffee milk", productId: "463380", perPortion: { amount: 0.3, unit: "dl" } }],
    },
  ],
};

// ---------- the wedding (docs/demo-plan.md) ----------
// Products, prices and stock are real (mock, 14 Nov). Recipe amounts and Sanna's
// rule values are set for the story, as the demo plan marks them.

export const WEDDING_PEOPLE: Person[] = [
  { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet", "bar"], hotelScope: false, hotelId: HOTEL_ID },
  { id: "p-sanna", name: "Sanna", title: "Finance manager", role: "approver", outlets: ["banquet", "bar"], hotelScope: true, hotelId: HOTEL_ID },
];

export const WEDDING_MANDATE: Mandate = {
  id: "mandate-demo-hotel-1",
  type: "IntentMandate.standing",
  hotelId: HOTEL_ID,
  customerNumber: "123",
  sites: [{ id: "site-demo-hotel", name: "Demo Hotel, goods entrance", address: "Fictional street 2, Helsinki" }],
  spendCapEur: 1950,
  blockedProducts: [],
  deliveryDays: [1, 2, 3, 4, 5],
  holidays: ["2026-12-06", "2026-12-24", "2026-12-25", "2026-12-26"],
  // Unconfirmed stock always asks (D31). Overshoot €50: one case of coffee (4.4 kg for 1.8 kg) is the smallest pack and shouldn't ask.
  preAnswers: { partialFillMaxShortPct: null, unknownStockMaxLineEur: null, overshootMaxPct: 10, overshootMaxEur: 50, priceRiseMaxPct: 5, guestChangeMaxPct: 5 },
  version: 1,
};

export const WEDDING_EVENT: EventSpec = {
  id: "evt-wedding",
  name: "Emma and Lauri's wedding",
  siteId: "site-demo-hotel",
  serviceDate: "2026-11-18",
  guests: 180,
  dietsConfirmed: true,
  dietGroups: [],
  dishes: [
    {
      id: "main", name: "Salmon with button potatoes", outletId: "banquet", excludesGroups: [],
      ingredients: [
        { id: "salmon", text: "Salmon fillet pieces", productId: "469672", perPortion: { amount: 170, unit: "g" } },
        { id: "potato", text: "Button potatoes", productId: "460541", perPortion: { amount: 200, unit: "g" } },
        { id: "cream", text: "Whipping cream, lactose-free", productId: "464727", perPortion: { amount: 0.25, unit: "l" } },
      ],
    },
    {
      id: "dessert", name: "Wedding cake", outletId: "banquet", excludesGroups: [],
      ingredients: [{ id: "cake", text: "Princess cake", productId: "467767", perPortion: { amount: 1, unit: "pcs" } }],
    },
    {
      id: "coffee", name: "Coffee service", outletId: "banquet", excludesGroups: [],
      ingredients: [
        { id: "coffee", text: "Coffee, dark roast", productId: "460617", perPortion: { amount: 10, unit: "g" } },
        // Typed by Aino as a total, not per guest: "Add 40 litres of lactose-free milk for the coffee service."
        { id: "cmilk", text: "Lactose-free milk", productId: "464306", total: { amount: 40, unit: "l" } },
      ],
    },
    {
      id: "toast", name: "Toast", outletId: "bar", excludesGroups: [],
      // One glass a guest, six glasses a 75 cl bottle.
      ingredients: [{ id: "sparkling", text: "Sparkling, alcohol-free", productId: "477125", perPortion: { amount: 0.125, unit: "l" } }],
    },
  ],
};

// ---------- profiles ----------

export type SeedProfileId = "gala" | "wedding";
type SeedProfile = {
  id: SeedProfileId;
  hotelName: string;
  people: Person[];
  mandate: Mandate;
  event: EventSpec;
  valioViewer: string;
  /** The fixture overlay scene 4 uses (Q11.4). The wedding needs none: its cream is short on real stock. */
  finalCheckOverlay: string | null;
};

export const SEED_PROFILES: Record<SeedProfileId, SeedProfile> = {
  gala: { id: "gala", hotelName: "Hotel Aurora", people: PEOPLE, mandate: MANDATE, event: SEED_EVENT, valioViewer: "Valio Aimo sales rep", finalCheckOverlay: "final-check" },
  wedding: { id: "wedding", hotelName: "Demo Hotel", people: WEDDING_PEOPLE, mandate: WEDDING_MANDATE, event: WEDDING_EVENT, valioViewer: "Katri, account manager (Valio Aimo)", finalCheckOverlay: null },
};

/** The seed the database was last reset to; a reset without a profile keeps it. */
export function seedProfile(): SeedProfile {
  return SEED_PROFILES[kvGet<SeedProfileId>("seedProfile") ?? config.seedProfile];
}

export function seedReset(profileId: SeedProfileId = seedProfile().id) {
  const profile = SEED_PROFILES[profileId];
  resetDb();
  const db = getDb();
  for (const p of profile.people) db.prepare("INSERT INTO people (id, json) VALUES (?, ?)").run(p.id, JSON.stringify(p));
  putMandate(profile.mandate);
  issueFixedToken(OUTSIDE_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Outside purchasing agent (demo)", scopes: ["search", "quote", "order"] });
  issueFixedToken(HOTEL_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Hotel agent", scopes: ["search", "quote", "order"] });
  issueFixedToken(VALIO_VIEWER_TOKEN, { kind: "valio", name: profile.valioViewer });
  kvSet("seedProfile", profile.id);
  kvSet("agentToken", HOTEL_AGENT_TOKEN);
  kvSet("dataMode", { mode: "fixture", overlay: null });
  setClock({ scene: "1" });
  const e: StoredEvent = { ...profile.event, version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [] };
  saveEvent(e);
  audit({ actor: SYSTEM, action: "seed_reset", summary: `Fresh seed: ${profile.hotelName} (fixture), ${profile.people.length} people, mandate v1, event "${e.name}", clock at ${SCENES["1"].label}`, details: { profile: profile.id }, usesFixture: true, visibility: "shared" });
}
