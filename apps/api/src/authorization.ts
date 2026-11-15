import type { Person } from "./identity.js";

/** A person's allowed outlets come from their server-resolved identity. Every
 * outlet must be covered; permission for one part never grants the whole basket. */
export function allowsOutlets(person: Person, hotelId: string, outletIds: readonly string[]): boolean {
  return person.hotelId === hotelId && (person.hotelScope || outletIds.every((id) => person.outlets.includes(id)));
}
