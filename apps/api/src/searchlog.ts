/**
 * Search log: every search, what was typed and what we read it as, one JSON line
 * each in apps/api/var/search-log.jsonl (untracked). For fixing misreads later;
 * nothing reads it back. Off under vitest; AIMO_SEARCH_LOG overrides the path.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REPO_ROOT } from "./config.js";

const PATH = process.env.AIMO_SEARCH_LOG ?? resolve(REPO_ROOT, "apps/api/var/search-log.jsonl");
const OFF = !!process.env.VITEST || process.env.AIMO_SEARCH_LOG === "off";

export type SearchLogEntry = {
  /** request_parse: chat box text → lines. product_search: gateway GET /products. shortlist: one need → catalogue matches. */
  source: "request_parse" | "product_search" | "shortlist";
  query: unknown;
  interpreted: unknown;
};

/** Never throws: a failed log write must not fail the search. */
export function logSearch(e: SearchLogEntry): void {
  if (OFF) return;
  try {
    mkdirSync(dirname(PATH), { recursive: true });
    appendFileSync(PATH, JSON.stringify({ at: new Date().toISOString(), ...e }) + "\n");
  } catch (err) {
    console.error("search log write failed", err);
  }
}

/** Products as id + name, enough to see a wrong match without the whole record. */
export const brief = (ps: { id: string; name: string }[], n = 10) => ps.slice(0, n).map((p) => `${p.id} ${p.name}`);
