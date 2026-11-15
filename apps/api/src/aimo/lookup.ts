/**
 * LOOKUP (chunk 02) and FIXTURE-LOAD (chunk 11): the adapter in front of the
 * Valio Aimo mock. Calls price and availability in batches of 1,000, turns both
 * stock sentinels into "unknown", empty schedule lines into "not deliverable"
 * and error:true into "no price". Every value carries where it came from.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { LookupLine, StockFact } from "@aimo/contracts";
import { config } from "../config.js";
import { getProduct } from "../catalog.js";
import { nowIso } from "../clock.js";
import { kvGet } from "../db.js";

export const BATCH = 1000;
const TERMINAL_SENTINEL = 999999;
/** Real Stock amounts top out near 68,293; the sentinel is 9,999,999,999 base units / pack size. */
const STOCK_SENTINEL_FLOOR = 1_000_000;

export class UpstreamError extends Error {
  constructor(message: string, public status: number | null = null, public retryAfterSeconds: number | null = null) {
    super(message);
  }
  /** The mock refused because of its (undisclosed) rate limit. */
  get rateLimited() {
    return this.status === 429;
  }
}

/** Statuses worth one more try: rate limited, or the mock briefly down. */
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Retry-After in seconds or as an HTTP date; null when absent or unreadable. */
function retryAfterMs(h: string | null): number | null {
  if (!h) return null;
  const s = Number(h);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

type RawAvail = Record<string, any>;
type RawPrice = Record<string, any>;
export type FixtureFile = { name: string; recordedAt: string; timeNow: string | null; availability: Record<string, RawAvail>; price: Record<string, RawPrice> };

export type DataMode = { mode: "live" | "fixture"; overlay: string | null };
export function dataMode(): DataMode {
  return kvGet<DataMode>("dataMode") ?? { mode: config.aimoMode, overlay: null };
}

/**
 * One call to the mock. A 429 (rate limit) or a 5xx is retried after a short back-off, using the
 * mock's Retry-After when it sends one (capped), so a busy moment doesn't fail the whole request.
 * The same request is resent: lookups only read, so a retry can't order anything twice.
 */
async function upstream(path: string, products: string[], requestedDate: string): Promise<any> {
  if (!config.aimoKey) throw new UpstreamError("AIMO_API_KEY is not set");
  const delays = config.aimoRetryDelaysMs;
  for (let attempt = 0; ; attempt++) {
    const res = await upstreamOnce(path, products, requestedDate);
    if (res.ok) return await res.json().catch((e: Error) => { throw new UpstreamError(`${path} sent unreadable JSON: ${e.message}`, res.status); });
    const wait = retryAfterMs(res.headers.get("retry-after"));
    if (RETRY_STATUS.has(res.status) && attempt < delays.length) {
      await sleep(Math.min(wait ?? delays[attempt], config.aimoRetryAfterCapMs));
      continue;
    }
    const tries = attempt + 1;
    if (res.status === 429)
      throw new UpstreamError(`Valio Aimo's API is rate-limiting requests (HTTP 429 on ${path}, ${tries} ${tries === 1 ? "try" : "tries"}). Try again in a minute.`, 429, wait === null ? null : Math.ceil(wait / 1000));
    throw new UpstreamError(`${path} returned HTTP ${res.status}${tries > 1 ? ` after ${tries} tries` : ""}`, res.status);
  }
}

async function upstreamOnce(path: string, products: string[], requestedDate: string): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), config.aimoTimeoutMs);
  try {
    return await fetch(config.aimoBase + path, {
      method: "POST",
      signal: ctl.signal,
      headers: { "X-API-Key": config.aimoKey, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "aimo-copilot-gateway/0.1" },
      body: JSON.stringify({ customer: "123", requestedDate, products }),
    });
  } catch (e) {
    throw new UpstreamError(`${path} failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

export async function fetchRaw(ids: string[], requestedDate: string) {
  const availability: Record<string, RawAvail> = {};
  const price: Record<string, RawPrice> = {};
  let timeNow: string | null = null;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const [a, p] = await Promise.all([upstream("/api/availability", batch, requestedDate), upstream("/api/price", batch, requestedDate)]);
    timeNow = a.timeNow ?? timeNow;
    for (const r of a.products ?? []) availability[String(r.productId)] = r;
    for (const r of p.products ?? []) price[String(r.productId)] = r;
  }
  return { availability, price, timeNow };
}

const fixtureCache = new Map<string, FixtureFile | null>();
export function loadFixture(name: string): FixtureFile | null {
  if (fixtureCache.has(name)) return fixtureCache.get(name)!;
  const path = resolve(config.fixturesDir, `${name}.json`);
  const f = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FixtureFile) : null;
  fixtureCache.set(name, f);
  return f;
}
export function saveFixture(f: FixtureFile) {
  mkdirSync(config.fixturesDir, { recursive: true });
  writeFileSync(resolve(config.fixturesDir, `${f.name}.json`), JSON.stringify(f, null, 1));
  fixtureCache.delete(f.name);
}

/** Overlays patch the base fixture, e.g. to lower one product's stock for the final check (Q11.4). */
function fixtureFor(overlay: string | null) {
  const base = loadFixture("base");
  if (!base) return null;
  if (!overlay) return { ...base, label: "base" };
  const o = loadFixture(`overlay-${overlay}`);
  if (!o) return { ...base, label: "base" };
  const availability = { ...base.availability };
  for (const [id, patch] of Object.entries(o.availability)) availability[id] = mergeDeep(availability[id] ?? {}, patch);
  const price = { ...base.price };
  for (const [id, patch] of Object.entries(o.price)) price[id] = mergeDeep(price[id] ?? {}, patch);
  return { ...base, availability, price, label: `base+${overlay}` };
}
function mergeDeep(a: any, b: any): any {
  if (Array.isArray(b)) return b;
  if (b && typeof b === "object") {
    const out = { ...(a ?? {}) };
    for (const k of Object.keys(b)) out[k] = mergeDeep(a?.[k], b[k]);
    return out;
  }
  return b;
}

export function normalise(id: string, a: RawAvail | undefined, p: RawPrice | undefined, source: "live" | "fixture", fixtureName: string | null, fetchedAt: string): LookupLine {
  const lines = Array.isArray(a?.scheduleLines) ? a.scheduleLines : [];
  const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value : null;
  const sl = lines[0];
  const logisticModel = (a?.logisticModel ?? null) as "Stock" | "Terminal" | null;
  const stockOf = (schedule: any): StockFact => {
    if (!schedule || typeof schedule.availableAmount !== "number" || !Number.isFinite(schedule.availableAmount) || schedule.availableAmount < 0) return { kind: "none" };
    const amt = schedule.availableAmount;
    if (logisticModel === "Terminal" || amt === TERMINAL_SENTINEL) return { kind: "unknown", reason: "terminal_sentinel" };
    if (amt >= STOCK_SENTINEL_FLOOR) return { kind: "unknown", reason: "stock_sentinel" };
    return { kind: "known", amount: amt };
  };
  const stock = stockOf(sl);
  const salesBlock = Boolean(a?.salesBlock) || Boolean(sl?.salesBlock);
  const priced = p && !p.error && typeof p.catalogPrice?.value === "number" && Number.isFinite(p.catalogPrice.value) && p.catalogPrice.value > 0;
  return {
    productId: id,
    source,
    fixtureName,
    fetchedAt,
    known: Boolean(getProduct(id)),
    deliverable: Boolean(sl) && !salesBlock && !(stock.kind === "known" && stock.amount === 0 && !sl?.availableDate),
    salesBlock,
    logisticModel,
    salesUnit: text(sl?.salesUnit),
    stock,
    availableDate: text(sl?.availableDate),
    closingTime: text(a?.closingTime),
    ...(a ? { availabilityEvidence: {
      salesBlock: Boolean(a.salesBlock),
      schedules: lines.map((schedule) => ({
        availableDate: text(schedule?.availableDate),
        closingTime: text(a.closingTime),
        salesUnit: text(schedule?.salesUnit),
        stock: stockOf(schedule),
        salesBlock: Boolean(schedule?.salesBlock),
      })),
    } } : {}),
    price: priced
      ? {
          value: Number(p.catalogPrice.value),
          withTax: p.catalogPrice.valueWithTax ?? p.priceWithTax?.value ?? null,
          taxRate: p.tax?.taxRate ?? null,
          listPrice: p.listPrice?.value ?? null,
          comparisonPrice: p.comparisonPrice?.value ?? null,
          comparisonUnit: p.comparisonUnit ?? null,
          validFrom: text(p.catalogPrice.validFrom),
          validTo: text(p.catalogPrice.validTo),
          currency: p.currency ?? p.catalogPrice.currency ?? "EUR",
        }
      : null,
  };
}

/**
 * Look up ids. Fixture mode serves saved responses where they exist and calls the
 * live mock for the rest; every line is labelled with its source. Live mode falls
 * back to the fixture for the whole call if the mock fails, and says so.
 */
export async function lookup(ids: string[], requestedDate: string, mode: DataMode = dataMode()): Promise<{ lines: LookupLine[]; fallback: string | null }> {
  const uniq = [...new Set(ids)];
  const fetchedAt = nowIso();
  const fx = fixtureFor(mode.overlay);
  const out = new Map<string, LookupLine>();
  let liveIds = uniq;
  let fallback: string | null = null;
  if (mode.mode === "fixture" && fx) {
    liveIds = [];
    for (const id of uniq) {
      if (fx.availability[id] || fx.price[id]) out.set(id, normalise(id, fx.availability[id], fx.price[id], "fixture", fx.label, fx.recordedAt));
      else liveIds.push(id);
    }
  }
  if (liveIds.length) {
    try {
      const r = await fetchRaw(liveIds, requestedDate);
      for (const id of liveIds) out.set(id, normalise(id, r.availability[id], r.price[id], "live", null, fetchedAt));
    } catch (e) {
      if (!fx) throw e;
      const missing = liveIds.filter((id) => !fx.availability[id] && !fx.price[id]);
      if (missing.length) throw e;
      fallback = `Live mock unavailable (${(e as Error).message}); using saved fixture`;
      out.clear();
      for (const id of uniq) out.set(id, normalise(id, fx.availability[id], fx.price[id], "fixture", fx.label, fx.recordedAt));
    }
  }
  // requestedDate is a query, never evidence of a supplier commitment. Explicit
  // fixture overlays can supply other schedules, but live terms are never shifted.
  return { lines: uniq.map((id) => out.get(id)!), fallback };
}
