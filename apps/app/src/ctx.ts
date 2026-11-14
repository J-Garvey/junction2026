import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Question } from "@aimo/contracts";
import type { Person, StatusResp, Outlet } from "./api";

export interface AppCtx {
  me: Person;
  people: Person[];
  outlets: Outlet[];
  status: StatusResp | null;
  /** Simulated now (ISO) from /api/status. */
  now: string;
  /** Bumps after any change so every screen refetches. */
  tick: number;
  refresh: () => void;
  switchPerson: () => void;
}

export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("No app context");
  return c;
};

/** Mirrors the server's QUESTION-ROUTE (canAnswer): by role and outlet; the server still checks every answer. */
export function canAnswer(q: Question, p: Person, people: Person[]): boolean {
  if (p.role !== q.forRole) return false;
  if (q.forRole === "approver") return p.hotelScope || (q.outletId !== null && p.outlets.includes(q.outletId));
  if (!q.outletId) return true;
  const chefs = people.filter((x) => x.role === "chef" && x.outlets.includes(q.outletId!));
  return chefs.length ? p.outlets.includes(q.outletId) : true;
}

/** Everyone who can answer a question. */
export const answerers = (q: Question, people: Person[]) => people.filter((p) => canAnswer(q, p, people));

/** "Sanna (Finance manager) or Jonas (F&B director)". */
export function namesOf(ps: Person[]) {
  const n = ps.map((p) => `${p.name} (${p.title})`);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} or ${n[n.length - 1]}` : n[0] ?? "";
}

/** The person or people who must act next. */
export function waitingForText(q: Question, me: Person, people: Person[]) {
  const who = q.state === "waiting" ? people.filter((p) => p.role === "chef") : answerers(q, people);
  const names = who.some((p) => p.id === me.id) ? (who.length > 1 ? `you or ${namesOf(who.filter((p) => p.id !== me.id))}` : "you") : namesOf(who) || `the ${q.forRole}`;
  return `Waiting for ${names}`;
}

/** Splits open questions into the ones `me` answers and a count per who-it-waits-for for the rest. */
export function splitMine(qs: Question[], me: Person, people: Person[]) {
  const mine = qs.filter((q) => canAnswer(q, me, people));
  const others = new Map<string, number>();
  for (const q of qs) if (!canAnswer(q, me, people)) {
    const next = q.state === "waiting" ? people.filter((p) => p.role === "chef") : answerers(q, people);
    const k = namesOf(next) || `the ${q.forRole}`;
    others.set(k, (others.get(k) ?? 0) + 1);
  }
  return { mine, others: [...others].map(([who, n]) => ({ who, n })) };
}

export const outletName = (outlets: Outlet[], id: string | null | undefined) => outlets.find((o) => o.id === id)?.name ?? id ?? "";

/** Fetch with loading and error state; refetches when deps or the global tick change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; error: string | null; loading: boolean; reload: () => void; setData: (d: T) => void } {
  const { tick } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, n]);
  return { data, error, loading, reload, setData };
}
