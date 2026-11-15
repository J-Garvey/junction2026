/** Shared read boundary for gateway and direct UI detail routes. */
import type { Identity } from "../identity.js";
import { GatewayRefusal, getOrder, getQuote } from "./service.js";

export function requireRead(id: Identity, resource: "quote" | "order" | "audit" | "mandate") {
  // Existing quote/order grants include reading those resources; audit is separate.
  if (id.kind === "agent" && !id.scopes.includes(`${resource}:read`) && !id.scopes.includes(resource) && !(resource === "mandate" && id.scopes.includes("quote")))
    throw new GatewayRefusal(403, { error: "forbidden", message: `Token needs ${resource}:read scope` });
}
export function requireOwner(id: Identity, hotelId: string) {
  if (id.kind === "valio" ? !id.hotelIds.includes(hotelId) : id.hotelId !== hotelId)
    throw new GatewayRefusal(403, { error: "forbidden", message: "Resource belongs to another hotel" });
}
export function readableQuote(id: Identity, key: string) {
  requireRead(id, "quote");
  const q = getQuote(key);
  requireOwner(id, q.hotelId);
  return q;
}
export function readableOrder(id: Identity, key: string) {
  requireRead(id, "order");
  const o = getOrder(key);
  requireOwner(id, o.hotelId);
  return o;
}
export { sharedOrder, sharedQuote } from "./shared.js";
