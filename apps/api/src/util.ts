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

const brandByName = new Map<string, string>();
/** The catalogue registers each product's brand so short names can drop it. */
export function registerBrand(name: string, brand: string | null) {
  if (brand) brandByName.set(name, brand);
}

/**
 * A product name short enough for one line: the brand, sizes, pack codes and marks
 * dropped, all-caps names in sentence case, at most three words.
 */
export function shortName(name: string): string {
  let s = name;
  const brand = brandByName.get(name);
  // A one-word brand (Valio, Arla) tells similar products apart, so it stays; a longer one is dropped.
  if (brand && brand.trim().includes(" ") && s.toLowerCase().startsWith(brand.toLowerCase()) && s.length > brand.length + 3) s = s.slice(brand.length);
  s = s
    .replace(/[®™]/g, "")
    // Marketing sub-brands that crowd out the product (e.g. "Hyvä suomalainen Arki").
    .replace(/\b(Hyvä suomalainen|Arki|Keittiön|food service)\b/gi, "")
    .replace(/^\s*\d+\s*x\s*/i, "")
    .replace(/\b\d+([.,]\d+)?\s*(x\s*\d+([.,]\d+)?\s*)?(l|dl|ml|cl|g|kg|%|pcs|kpl)\b/gi, "")
    .replace(/\bready to (eat|use|serve)\b/gi, "")
    .replace(/\b(UHT|ESL|appr\.?|approx\.?|ca\.?)\b/gi, "")
    .replace(/\d+([.,]\d+)?\s*vol-?%/gi, "")
    .replace(/\b[A-Z]{2}\b(?=\s)/g, "")
    .replace(/[,(].*$/, "")
    .replace(/^\s*[A-Z]{1,3}\s+(?=[A-Z]{3,})/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s === s.toUpperCase() && /[A-Z]{3,}/.test(s)) s = s.charAt(0) + s.slice(1).toLowerCase();
  const out = s.split(" ").slice(0, 3).join(" ");
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : name;
}
