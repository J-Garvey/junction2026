/** Interface icons and the Potato emoji logo. */
const P = {
  home: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  chat: "M4 5h16v11H9l-5 4z",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5 9-10",
  box: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  q: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 110-18 9 9 0 010 18z",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  cal: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
  chev: "M9 18l6-6-6-6",
  down: "M6 9l6 6 6-6",
  refresh: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
  back: "M15 18l-6-6 6-6",
  clock: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z",
  send: "M5 12h14M13 6l6 6-6 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  info: "M12 21a9 9 0 110-18 9 9 0 010 18zM12 11v6M12 7.5h.01",
} as const;
export type IconName = keyof typeof P;

export const Icon = ({ n, s = 18, c = "currentColor", w = 1.8 }: { n: IconName; s?: number; c?: string; w?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className="ic" aria-hidden="true">
    <path d={P[n]} />
  </svg>
);

/** Decorative beside the Potato name or an accessible link label. */
export const Mark = ({ s = 28 }: { s?: number }) => (
  <span className="brand-mark" style={{ width: s, height: s, fontSize: s }} aria-hidden="true">🥔</span>
);

export const Lockup = ({ s = 24 }: { s?: number }) => (
  <div className="lockup">
    <Mark s={s} />
    <b>Potato</b>
  </div>
);
