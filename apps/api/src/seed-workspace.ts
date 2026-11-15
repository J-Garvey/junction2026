/** Populated demo preset. Decisions and receipts go through the app and gateway, never fabricated rows. */
import type { Question, SingleLine, SingleRequest } from "@aimo/contracts";
import { config } from "./config.js";
import { kvSet } from "./db.js";
import { setClock, nowIso } from "./clock.js";
import { seedReset } from "./seed.js";
import { getPerson, issueToken } from "./identity.js";
import { saveEvent, personActor, type StoredEvent } from "./agent/events.js";
import type { StoredPlan } from "./agent/plan.js";
import { loadFixture } from "./aimo/lookup.js";
import { audit, SYSTEM } from "./audit.js";
import { HOTEL_BOOKINGS, HOTEL_DEMO_IDS, HOTEL_DEMO_TIME, HOTEL_DEMO_VERSION, HOTEL_REQUESTS } from "./demo/hotel-data.js";

export async function seedHotelWorkspace() {
  // Fail before clearing anything if the committed fixture pool is incomplete.
  const fixture = loadFixture("base");
  for (const productId of new Set(Object.values(HOTEL_REQUESTS).flat().map((l) => l.productId!))) {
    if (!fixture?.availability[productId] || !fixture.price[productId]) throw new Error(`Hotel demo fixture missing product ${productId}`);
  }
  seedReset();
  try {
    const base = new URL("/api", config.gatewayUrl).href;
    const tokens = new Map<string, string>();
    async function call<T>(personId: string, path: string, body: unknown): Promise<T> {
      let token = tokens.get(personId);
      if (!token) { token = issueToken({ kind: "person", personId, testSession: true }); tokens.set(personId, token); }
      const res = await fetch(base + path, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`,
          ...(process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Hotel demo ${path} failed (${res.status}): ${await res.text()}`);
      return await res.json() as T;
    }
    function booking(id: string, personId: string) {
      const spec = HOTEL_BOOKINGS.find((e) => e.id === id)!;
      const e: StoredEvent = { ...structuredClone(spec), siteId: "site-aurora", version: 1, removedNeeds: [], viabilityPlanId: null, orderPlanId: null,
        createdBy: getPerson(personId)!.name, createdAt: nowIso(),
        orderedGuests: null, lastDiff: null, finalCheck: null, changes: [{ at: nowIso(), by: getPerson(personId)!.name, what: "Booking entered (demo fixture)" }] };
      saveEvent(e);
      audit({ actor: personActor(getPerson(personId)!), action: "basket_created", summary: `${getPerson(personId)!.name} opened ${e.name} (demo fixture)`, eventId: id, details: {}, visibility: "hotel", usesFixture: true });
    }
    async function request(eventId: string, lines: SingleLine[], personId = "p-aino", reviewing = true) {
      const spec = HOTEL_BOOKINGS.find((e) => e.id === eventId)!;
      const input: SingleRequest = { kind: "single", originalText: lines.map((l) => l.text).join(", "), siteId: "site-aurora", outletId: personId === "p-mikko" ? "bar" : "banquet",
        neededBy: spec.deliveryDate ?? spec.serviceDate, neededByText: null, lines, parsedBy: "rules" };
      return (await call<{ plan: StoredPlan }>(personId, "/requests", { request: input, eventId, reviewing })).plan;
    }
    async function stage(eventId: string, lines: SingleLine[], personId = "p-aino") {
      const plan = await request(eventId, lines, personId);
      await call(personId, `/plans/${plan.id}/basket`, { continueWithWarnings: true });
      return (await call<{ review: Question }>(personId, `/baskets/${eventId}/submit-review`, {})).review;
    }

    setClock({ time: "2026-11-09T08:00:00Z" });
    booking(HOTEL_DEMO_IDS.breakfast, "p-aino");
    const breakfast = await stage(HOTEL_DEMO_IDS.breakfast, HOTEL_REQUESTS.breakfast);
    await call("p-sanna", `/questions/${breakfast.id}/answer`, { optionId: "approve" });

    setClock({ time: "2026-11-10T09:00:00Z" });
    booking(HOTEL_DEMO_IDS.bar, "p-mikko");
    const reception = await stage(HOTEL_DEMO_IDS.bar, HOTEL_REQUESTS.bar, "p-mikko");
    await call("p-sanna", `/questions/${reception.id}/answer`, { optionId: "reject", note: "Please confirm the final reception head count with events before resubmitting. Keep the alcohol-free option." });

    setClock({ time: "2026-11-11T07:30:00Z" });
    booking(HOTEL_DEMO_IDS.forum, "p-aino");
    await stage(HOTEL_DEMO_IDS.forum, HOTEL_REQUESTS.forum);

    setClock({ time: "2026-11-11T07:40:00Z" });
    booking(HOTEL_DEMO_IDS.milk, "p-aino");
    const milk = await request(HOTEL_DEMO_IDS.milk, HOTEL_REQUESTS.milk, "p-aino", false);
    // Leave the genuine D31 question open for Aino; no consent is prefilled on this request.
    await call("p-aino", `/plans/${milk.id}/accept`, {});

    setClock({ time: "2026-11-11T07:50:00Z" });
    booking(HOTEL_DEMO_IDS.allergy, "p-aino");
    await request(HOTEL_DEMO_IDS.allergy, HOTEL_REQUESTS.allergy, "p-aino", false);
    booking(HOTEL_DEMO_IDS.draft, "p-aino");

    setClock({ time: HOTEL_DEMO_TIME });
    kvSet("seedProfile", { id: "hotel", version: HOTEL_DEMO_VERSION, label: "Hotel workspace (fictional fixture)" });
    audit({ actor: SYSTEM, action: "seed_reset", summary: "Hotel workspace fixture ready: 7 bookings, signed receipt, pending decisions and draft menus", details: { profile: "hotel", version: HOTEL_DEMO_VERSION }, visibility: "shared", usesFixture: true });
  } catch (error) {
    // A failed rehearsal should leave a usable story reset, never half a populated preset.
    seedReset();
    throw error;
  }
}
