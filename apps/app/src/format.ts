/** Finnish number formats and Europe/Helsinki times. */
const TZ = "Europe/Helsinki";

export const fi = (v: number, d = 2) => v.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });
/** 1 150,40 € */
export const eur = (v: number | null | undefined) => (v == null ? "–" : `${fi(v)} €`);
/** Quantity with up to 2 decimals, no trailing zeros. */
export const qty = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("fi-FI", { maximumFractionDigits: 2 }));

/** The API sends "+0200" offsets without a colon; Date needs "+02:00". */
export function parseTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const fixed = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  return isNaN(d.getTime()) ? null : d;
}

const dtf = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const df = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
const tf = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });

/** "Sun 15 Nov, 17:00" in Helsinki time. */
export const when = (s: string | null | undefined) => {
  const d = parseTime(s);
  return d ? dtf.format(d) : "–";
};
/** A plain date (YYYY-MM-DD) shown as "Mon 16 Nov 2026". */
export const day = (s: string | null | undefined) => {
  if (!s) return "–";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : parseTime(s);
  return d ? df.format(d) : s;
};
/** The Helsinki calendar date (YYYY-MM-DD) of an instant, e.g. the simulated now. */
export const helsinkiDate = (s: string | null | undefined) => {
  const d = parseTime(s) ?? new Date();
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
/** A plain date plus n calendar days. */
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const clockTime = (s: string | null | undefined) => {
  const d = parseTime(s);
  return d ? tf.format(d) : "–";
};

/** "25 h 55 min" from the simulated now to the target, or null when past. */
export function countdown(target: string | null | undefined, nowIso: string | null | undefined): { text: string; past: boolean } {
  const t = parseTime(target);
  const n = parseTime(nowIso) ?? new Date();
  if (!t) return { text: "–", past: false };
  const ms = t.getTime() - n.getTime();
  if (ms <= 0) return { text: "Passed", past: true };
  const min = Math.floor(ms / 60000);
  const days = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (days >= 2) return { text: `${days} days`, past: false };
  if (days === 1) return { text: `${24 + h} h ${m} min`, past: false };
  return { text: h ? `${h} h ${m} min` : `${m} min`, past: false };
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ROLE_LABEL: Record<string, string> = { chef: "Chef", approver: "Approver", agent: "Agent" };

/** Short display for a claim code, e.g. FREE_FROM_LACTOSE → lactose-free. */
export function claimLabel(c: string) {
  const m = c.match(/^FREE_FROM_(.+)$/);
  if (m) return `${m[1].toLowerCase().replace(/_/g, " ")}-free`;
  return c.toLowerCase().replace(/_/g, " ");
}
