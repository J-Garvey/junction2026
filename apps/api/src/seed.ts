/**
 * SEED-RESET (chunk 11): one fresh database with one fictional hotel, its
 * outlets and people, the signed mandate, the demo event and the clock at
 * scene 1. All of it is fixture data and is labelled as such on screen.
 */
import type { EventSpec, Mandate } from "@aimo/contracts";
import { getDb, resetDb, kvSet } from "./db.js";
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

export function seedReset() {
  resetDb();
  const db = getDb();
  for (const p of PEOPLE) db.prepare("INSERT INTO people (id, json) VALUES (?, ?)").run(p.id, JSON.stringify(p));
  putMandate(MANDATE);
  issueFixedToken(OUTSIDE_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Outside purchasing agent (demo)", scopes: ["search", "quote", "order"] });
  issueFixedToken(HOTEL_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Hotel agent", scopes: ["search", "quote", "order"] });
  issueFixedToken(VALIO_VIEWER_TOKEN, { kind: "valio", name: "Valio Aimo sales rep" });
  kvSet("agentToken", HOTEL_AGENT_TOKEN);
  kvSet("dataMode", { mode: "fixture", overlay: null });
  setClock({ scene: "1" });
  const e: StoredEvent = { ...SEED_EVENT, version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [] };
  saveEvent(e);
  audit({ actor: SYSTEM, action: "seed_reset", summary: `Fresh seed: Hotel Aurora (fixture), 4 people, mandate v1, event "${e.name}", clock at ${SCENES["1"].label}`, details: {}, usesFixture: true, visibility: "shared" });
}
