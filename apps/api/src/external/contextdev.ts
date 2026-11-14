/**
 * Supplier brand enrichment from context.dev (external web data). It adds a
 * logo, domain, description and registered country to a product's brand. It is
 * never used by a rule: Valio Aimo's catalogue stays the source of truth, and
 * every value is labelled with where it came from. Cached per brand name.
 */
import { config } from "../config.js";
import { getDb } from "../db.js";
import { nowIso } from "../clock.js";

export type BrandProfile = {
  source: "context.dev";
  query: string;
  fetchedAt: string;
  cached: boolean;
  domain: string | null;
  title: string | null;
  description: string | null;
  country: string | null;
  logo: string | null;
  industries: string[];
};

export class ExternalUnavailable extends Error {}

const ensureTable = () => getDb().exec("CREATE TABLE IF NOT EXISTS brands (key TEXT PRIMARY KEY, json TEXT NOT NULL)");

export async function brandProfile(name: string): Promise<BrandProfile | null> {
  const query = name.trim().slice(0, 30);
  if (query.length < 3) return null;
  ensureTable();
  const key = query.toLowerCase();
  const hit = getDb().prepare("SELECT json FROM brands WHERE key = ?").get(key) as { json: string } | undefined;
  if (hit) return { ...(JSON.parse(hit.json) as BrandProfile), cached: true };
  if (!config.contextDev.apiKey) throw new ExternalUnavailable("CONTEXT_DEV_API_KEY is not set");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), config.contextDev.timeoutMs);
  let data: any;
  try {
    const res = await fetch(`${config.contextDev.baseUrl}/brand/retrieve`, {
      method: "POST",
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${config.contextDev.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "by_name", name: query, country_gl: "fi" }),
    });
    data = await res.json().catch(() => ({}));
    if (res.status === 400) data = { brand: null };
    else if (!res.ok) throw new ExternalUnavailable(`context.dev returned HTTP ${res.status}`);
  } catch (e) {
    if (e instanceof ExternalUnavailable) throw e;
    throw new ExternalUnavailable(`context.dev call failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
  const b = data.brand;
  const profile: BrandProfile = {
    source: "context.dev",
    query,
    fetchedAt: nowIso(),
    cached: false,
    domain: b?.domain ?? null,
    title: b?.title ?? null,
    description: b?.description ?? null,
    country: b?.address?.country ?? null,
    logo: (b?.logos ?? []).find((l: any) => l.type === "logo")?.url ?? b?.logos?.[0]?.url ?? null,
    industries: (b?.industries?.eic ?? []).map((i: any) => i.subindustry ?? i.industry).filter(Boolean).slice(0, 3),
  };
  getDb().prepare("INSERT OR REPLACE INTO brands (key, json) VALUES (?, ?)").run(key, JSON.stringify(profile));
  return profile;
}
