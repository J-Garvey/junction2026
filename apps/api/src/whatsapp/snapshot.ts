import type { Plan } from "@aimo/contracts";
import { allJson, getJson } from "../db.js";
import { sha256, stableStringify } from "../util.js";

/** Binds chat confirmation and later approval to every staged request and event policy. */
export function basketSnapshot(eventId: string): string {
  const event = getJson<{ version: number; name: string; siteId: string; serviceDate: string; guests: number; dietGroups: unknown; dishes: unknown; dietsConfirmed: boolean; removedNeeds: string[] }>("events", eventId);
  const plans = allJson<Plan>("SELECT json FROM plans WHERE event_id = ? ORDER BY id", eventId)
    .filter((p) => p.kind === "single" && p.basketedAt && !p.reviewing && !p.orderIds.length && p.tooLateChoice !== "removed");
  return sha256(stableStringify({ event: event ? { version: event.version, name: event.name, siteId: event.siteId, serviceDate: event.serviceDate, guests: event.guests, dietGroups: event.dietGroups, dishes: event.dishes, dietsConfirmed: event.dietsConfirmed, removedNeeds: event.removedNeeds } : null, plans }));
}
