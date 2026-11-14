/** One SQLite database owned by this server (TechStack). JSON columns keep the prototype small. */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS mandates (hotel_id TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL, event_id TEXT, idem_key TEXT NOT NULL UNIQUE, body_hash TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL, json TEXT NOT NULL, hash TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS judgements (key TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, json TEXT NOT NULL, version INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, event_id TEXT, json TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, state TEXT NOT NULL, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS remembered (key TEXT PRIMARY KEY, json TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS warnings (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, state TEXT NOT NULL, json TEXT NOT NULL);`,
];

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  if (config.dbPath !== ":memory:") mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  for (const m of MIGRATIONS) db.exec(m);
  return db;
}

export function resetDb() {
  const d = getDb();
  for (const t of ["kv", "people", "tokens", "mandates", "quotes", "approvals", "orders", "audit", "events", "plans", "questions", "remembered", "warnings"]) {
    d.exec(`DELETE FROM ${t}`);
  }
  d.exec("DELETE FROM sqlite_sequence WHERE name = 'audit'");
}

/** Run fn inside one transaction (ORDER-PLACE, ANSWER-RECORD). */
export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// Small JSON-row helpers.
export function getJson<T>(table: string, id: string, idCol = "id"): T | null {
  const row = getDb().prepare(`SELECT json FROM ${table} WHERE ${idCol} = ?`).get(id) as { json: string } | undefined;
  return row ? (JSON.parse(row.json) as T) : null;
}
export function allJson<T>(sql: string, ...params: (string | number | null)[]): T[] {
  return (getDb().prepare(sql).all(...params) as { json: string }[]).map((r) => JSON.parse(r.json) as T);
}
export function kvGet<T>(key: string): T | null {
  const row = getDb().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}
export function kvSet(key: string, value: unknown) {
  getDb().prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
}
