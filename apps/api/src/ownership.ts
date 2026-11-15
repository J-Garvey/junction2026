/** Resolve ownership from stored records, never from request filters or names. */
import { allJson, getJson } from "./db.js";

type Subject = { hotelId?: string | null; quoteId?: string | null; orderId?: string | null; eventId?: string | null; questionId?: string | null; details?: Record<string, unknown>; actor?: { kind: string; id: string } };
export function hotelFor(subject: Subject): string | null {
  if (subject.hotelId === null) return null;
  const owners = new Set<string>();
  let unresolved = false;
  const add = (hotel?: string | null) => { if (hotel) owners.add(hotel); else unresolved = true; };
  if (subject.hotelId) add(subject.hotelId);
  for (const [table, id] of [["quotes", subject.quoteId], ["orders", subject.orderId]] as const) {
    if (id) add(getJson<{ hotelId: string }>(table, id)?.hotelId);
  }
  // Trade objects are authoritative even when the caller supplied an arbitrary event label.
  if (!subject.quoteId && !subject.orderId && subject.eventId) {
    const event = getJson<{ hotelId?: string; siteId?: string }>("events", subject.eventId);
    if (event?.hotelId) add(event.hotelId);
    else {
      const matches = event?.siteId ? allJson<{ hotelId: string; sites: { id: string }[] }>("SELECT json FROM mandates").filter(m => m.sites.some(s => s.id === event.siteId)) : [];
      add(matches.length === 1 ? matches[0].hotelId : null);
    }
  }
  if (!subject.quoteId && !subject.orderId && !subject.eventId && subject.questionId) {
    const question = getJson<{ quoteId?: string; eventId?: string; planId?: string }>("questions", subject.questionId);
    if (!question) unresolved = true;
    else if (question.quoteId || question.eventId) add(hotelFor(question));
    else add(planHotel(question.planId));
  }
  if (!subject.quoteId && !subject.orderId && !subject.eventId && !subject.questionId && typeof subject.details?.planId === "string")
    add(planHotel(subject.details.planId));
  if (!subject.quoteId && !subject.orderId && !subject.eventId && subject.actor?.kind === "person")
    add(getJson<{ hotelId: string }>("people", subject.actor.id)?.hotelId);
  if (owners.size === 1 && !unresolved) return [...owners][0];
  if (owners.size || unresolved || subject.questionId) return null;
  // Legacy system-only logs are attributable only in an actual single-hotel database.
  const hotels = allJson<{ hotelId: string }>("SELECT json FROM mandates");
  return hotels.length === 1 ? hotels[0].hotelId : null;
}

function planHotel(id?: string): string | null {
  const plan = id ? getJson<{ createdBy?: { personId: string } }>("plans", id) : null;
  return plan?.createdBy ? getJson<{ hotelId: string }>("people", plan.createdBy.personId)?.hotelId ?? null : null;
}
