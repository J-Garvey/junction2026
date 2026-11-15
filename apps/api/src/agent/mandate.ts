import type { Mandate } from "@aimo/contracts";
import { getJson } from "../db.js";

export const HOTEL_ID = "hotel-aurora";

export function mandate(): Mandate {
  return getJson<Mandate>("mandates", HOTEL_ID, "hotel_id")!;
}
