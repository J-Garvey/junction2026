import { createHash, createHmac, randomBytes } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");
export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;

/** Stable JSON: keys sorted, so hashes and fingerprints repeat. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The mock sends "2026-11-15T17:00:00+0200"; JS needs "+02:00". */
export function parseAimoTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const fixed = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Helsinki wall-clock formatting for messages (EET/EEST). */
export function fmtHelsinki(iso: string | Date, withTime = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Helsinki",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const eur = (n: number) => `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A product name short enough for one line: sizes, pack codes and marks dropped, at most three words. */
export function shortName(name: string): string {
  const s = name
    .replace(/[®™]/g, "")
    .replace(/^\d+\s*x\s*/i, "")
    .replace(/\b\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(l|dl|ml|cl|g|kg|%|pcs|kpl)\b/gi, "")
    .replace(/\b(UHT|ESL|appr\.?|approx\.?|ca\.?)\b/gi, "")
    .replace(/[,(].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.split(" ").slice(0, 3).join(" ") || name;
}
