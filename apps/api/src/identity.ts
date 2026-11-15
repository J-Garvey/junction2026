/**
 * IDENTITY-RESOLVE (chunk 08) and SESSION-SWITCH (chunk 06). The server works
 * out hotel, outlet, role and person from the credential; it never trusts a
 * value the client sends.
 */
import type { Request } from "express";
import { getDb, getJson, allJson } from "./db.js";
import { randomBytes } from "node:crypto";

export type Person = { id: string; name: string; role: "chef" | "approver"; outlets: string[]; hotelScope: boolean; hotelId: string; title: string };
export type Identity =
  | { kind: "person"; token: string; hotelId: string; person: Person; testSession: boolean }
  | { kind: "agent"; token: string; hotelId: string; name: string; scopes: string[] }
  | { kind: "valio"; token: string; name: string };

type TokenRow = { kind: Identity["kind"]; personId?: string; hotelId?: string; name?: string; scopes?: string[]; testSession?: boolean };

export function issueToken(row: TokenRow): string {
  const token = `${row.kind}_${randomBytes(18).toString("hex")}`;
  getDb().prepare("INSERT INTO tokens (token, json) VALUES (?, ?)").run(token, JSON.stringify(row));
  return token;
}
/** Fixed tokens let the seeded outside agent and the Valio Aimo viewer be documented. */
export function issueFixedToken(token: string, row: TokenRow) {
  getDb().prepare("INSERT OR REPLACE INTO tokens (token, json) VALUES (?, ?)").run(token, JSON.stringify(row));
}

export function getPerson(id: string): Person | null {
  return getJson<Person>("people", id);
}
export function allPeople(): Person[] {
  return allJson<Person>("SELECT json FROM people ORDER BY id");
}

export function resolveToken(token: string | undefined | null): Identity | null {
  if (!token) return null;
  const row = getJson<TokenRow>("tokens", token, "token");
  if (!row) return null;
  if (row.kind === "person") {
    const person = row.personId ? getPerson(row.personId) : null;
    if (!person) return null;
    return { kind: "person", token, hotelId: person.hotelId, person, testSession: row.testSession ?? true };
  }
  if (row.kind === "agent") return { kind: "agent", token, hotelId: row.hotelId!, name: row.name ?? "agent", scopes: row.scopes ?? [] };
  return { kind: "valio", token, name: row.name ?? "Valio Aimo" };
}

export function tokenFrom(req: Request): string | null {
  const h = req.header("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  const cookie = req.header("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)aimo_session=([^;]+)/);
  try {
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

export function actorOf(id: Identity) {
  if (id.kind === "person")
    return { kind: "person" as const, id: id.person.id, name: id.person.name, role: id.person.role, outletId: id.person.outlets[0] ?? null, testSession: id.testSession };
  if (id.kind === "agent") return { kind: "outside_agent" as const, id: id.token.slice(0, 12), name: id.name, role: "agent", outletId: null, testSession: false };
  return { kind: "system" as const, id: "valio", name: id.name, role: "valio_aimo", outletId: null, testSession: false };
}
