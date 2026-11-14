/**
 * APPROVAL-RECALL (CH-11): a chef's yes to a substitute is remembered for that
 * recipe and product pair, within the outlet, and void if the substitute's
 * ingredients, allergens or claims change (Q07.6).
 */
import { getDb } from "../db.js";
import { getProduct } from "../catalog.js";
import { sha256, stableStringify } from "../util.js";

const specHash = (id: string) => {
  const p = getProduct(id);
  return p ? sha256(stableStringify({ i: p.ingredients, c: p.contains, m: p.mayContain, cl: p.claims })).slice(0, 16) : "missing";
};
const key = (dish: string, original: string, sub: string) => `${dish}|${original}|${sub}`;

export function rememberSubstitute(dish: string, original: string, sub: string, by: string, at: string) {
  getDb().prepare("INSERT OR REPLACE INTO remembered (key, json) VALUES (?, ?)").run(key(dish, original, sub), JSON.stringify({ dish, original, sub, by, at, spec: specHash(sub) }));
}

export function recallSubstitute(dish: string, original: string, sub: string): { by: string; at: string } | null {
  const r = getDb().prepare("SELECT json FROM remembered WHERE key = ?").get(key(dish, original, sub)) as { json: string } | undefined;
  if (!r) return null;
  const m = JSON.parse(r.json);
  return m.spec === specHash(sub) ? { by: m.by, at: m.at } : null;
}

export function listRemembered() {
  return (getDb().prepare("SELECT json FROM remembered").all() as { json: string }[]).map((r) => JSON.parse(r.json));
}
