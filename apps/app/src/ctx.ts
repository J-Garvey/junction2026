import { createContext, useContext, useEffect, useState, useCallback } from "react";
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
