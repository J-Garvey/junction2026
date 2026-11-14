/**
 * CLOCK-NOW and CLOCK-SET (chunk 11). The only source of "now" in the codebase:
 * no other module reads the system time for a business decision.
 */
import { kvGet, kvSet } from "./db.js";

type ClockState = { mode: "fixed"; time: string; scene: string | null } | { mode: "live"; scene: null };

/** Q11.2: scenes built around what the mock returns (delivery Mon 16 Nov, main cut-off Sun 15 Nov 17:00). */
export const SCENES: Record<string, { label: string; time: string }> = {
  "1": { label: "Scene 1 · Viability, months ahead", time: "2026-08-14T07:00:00.000Z" },
  "2": { label: "Scene 2 · Order, months ahead", time: "2026-08-14T08:00:00.000Z" },
  "3": { label: "Scene 3 · Change, ~2 weeks out", time: "2026-10-30T08:00:00.000Z" },
  "4": { label: "Scene 4 · Final check, 24 h before cut-off", time: "2026-11-14T15:00:00.000Z" },
};

export function clockState(): ClockState {
  return kvGet<ClockState>("clock") ?? { mode: "live", scene: null };
}

export function now(): Date {
  const s = clockState();
  return s.mode === "fixed" ? new Date(s.time) : new Date();
}

export const nowIso = () => now().toISOString();

/** Test mode only; callers write the audit entry (they know the actor). */
export function setClock(input: { time?: string; scene?: string }): ClockState {
  let next: ClockState;
  if (input.scene === "live") next = { mode: "live", scene: null };
  else if (input.scene && SCENES[input.scene]) next = { mode: "fixed", time: SCENES[input.scene].time, scene: input.scene };
  else if (input.time) {
    const d = new Date(input.time);
    if (Number.isNaN(d.getTime())) throw new Error("invalid time");
    next = { mode: "fixed", time: d.toISOString(), scene: null };
  } else throw new Error("time or scene required");
  kvSet("clock", next);
  return next;
}
