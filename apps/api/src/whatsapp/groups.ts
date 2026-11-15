import { randomUUID } from "node:crypto";
import type { WhatsAppGroupConfig } from "@aimo/contracts";
import { kvGet, kvSet } from "../db.js";

/** Fixed synthetic group identities; display names never authorize a message. */
export const DEMO_GROUPS = [
  { id: "demo-hotel-orders", name: "Demo Hotel · Orders" },
  { id: "demo-conference-kitchen", name: "Conference kitchen" },
  { id: "demo-hotel-staff", name: "Hotel staff" },
];
type Selection = { groupId: string; revision: string };
export function groupSelection(): Selection {
  const saved = kvGet<Selection>("whatsapp:selected-group");
  return saved && DEMO_GROUPS.some((g) => g.id === saved.groupId)
    ? saved : { groupId: DEMO_GROUPS[0].id, revision: "default" };
}
export function groupConfig(): WhatsAppGroupConfig {
  return { selectedGroupId: groupSelection().groupId, groups: DEMO_GROUPS.map((g) => ({ ...g })) };
}
export function selectGroup(groupId: string): WhatsAppGroupConfig {
  if (!DEMO_GROUPS.some((g) => g.id === groupId)) throw new Error("Not a demo group");
  if (groupSelection().groupId !== groupId) kvSet("whatsapp:selected-group", { groupId, revision: randomUUID() });
  return groupConfig();
}
