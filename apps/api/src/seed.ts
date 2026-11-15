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
  { id: "bar", name: "Bar" },
];

export const PEOPLE: Person[] = [
  { id: "p-aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet", "bar"], hotelScope: false, hotelId: HOTEL_ID },
  { id: "p-sanna", name: "Sanna", title: "Finance manager", role: "approver", outlets: ["banquet", "bar"], hotelScope: true, hotelId: HOTEL_ID },
  { id: "p-mikko", name: "Mikko", title: "Bar manager", role: "chef", outlets: ["bar"], hotelScope: false, hotelId: HOTEL_ID },
  { id: "p-jonas", name: "Jonas", title: "F&B director", role: "approver", outlets: ["banquet", "bar"], hotelScope: true, hotelId: HOTEL_ID },
];

/** docs/demo-plan.md, "Sanna's rules". Values are set for the story. */
export const MANDATE: Mandate = {
  id: "mandate-demo-hotel-1",
  type: "aimo.mandate.standing.1",
  hotelId: HOTEL_ID,
  customerNumber: "123",
  sites: [{ id: "site-aurora", name: "Demo Hotel, goods entrance", address: "Esimerkkikatu 1, 00100 Helsinki" }],
  spendCapEur: 1950,
  blockedProducts: [],
  // Explicit category scope and mixed-bucket limits: docs/category-origin-policy.md.
  categoryOriginRequirements: [{ categories: ["18701", "18702", "18705", "18706", "18707", "18708", "41720", "41722", "41723"], origin: "fi" }],
  deliveryDays: [1, 2, 3, 4, 5],
  holidays: ["2026-12-06", "2026-12-24", "2026-12-25", "2026-12-26"],
  preAnswers: { partialFillMaxShortPct: null, unknownStockMaxLineEur: null, overshootMaxPct: 10, overshootMaxEur: 25, priceRiseMaxPct: 5, guestChangeMaxPct: 5 },
  version: 1,
};

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

export function seedReset() {
  resetDb();
  const db = getDb();
  for (const p of PEOPLE) db.prepare("INSERT INTO people (id, json) VALUES (?, ?)").run(p.id, JSON.stringify(p));
  putMandate(MANDATE);
  issueFixedToken(OUTSIDE_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Unvetted script (safety drill)", scopes: ["search", "quote", "order"] });
  issueFixedToken(HOTEL_AGENT_TOKEN, { kind: "agent", hotelId: HOTEL_ID, name: "Demo Hotel purchasing agent", scopes: ["search", "quote", "order"] });
  issueFixedToken(VALIO_VIEWER_TOKEN, { kind: "valio", name: "Katri, Valio Aimo account manager" });
  kvSet("agentToken", HOTEL_AGENT_TOKEN);
  kvSet("dataMode", { mode: "fixture", overlay: null });
  setClock({ scene: "1" });
  const e: StoredEvent = { ...SEED_EVENT, version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null, orderedGuests: null, lastDiff: null, finalCheck: null, changes: [] };
  saveEvent(e);
  audit({ actor: SYSTEM, action: "seed_reset", summary: `Fresh seed: Demo Hotel (fixture), 4 people, mandate v1, event "${e.name}", clock at ${SCENES["1"].label}`, details: {}, usesFixture: true, visibility: "shared" });
}
