/* Tukku UI kit v0.3. Valio Aimo design language (square corners, National-style
   condensed caps, teal + lime) on the PostHog app layout (labelled left
   sidebar, breadcrumbs, filter bar, insight tiles, right rail with vertical
   tabs, AI chat home). Numbers and dates use Finnish formats. */

const { createContext, useContext } = React;
const Mobile = createContext(false);
const useMobile = () => useContext(Mobile);

/* ---------- icons ---------- */
const P = {
  chat: "M4 5h16v11H9l-5 4z",
  dash: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l5 5 9-10",
  box: "M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  plug: "M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4",
  search: "M11 19a8 8 0 110-16 8 8 0 010 16zM21 21l-4.3-4.3",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  q: "M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01M12 21a9 9 0 110-18 9 9 0 010 18z",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  cal: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
  chev: "M9 18l6-6-6-6",
  down: "M6 9l6 6 6-6",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  refresh: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
  up: "M3 17l6-6 4 4 8-8M15 7h6v6",
  arrow: "M5 12h14M13 6l6 6-6 6",
  dl: "M12 3v12M7 10l5 5 5-5M4 21h16",
  back: "M15 18l-6-6 6-6",
  clock: "M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z",
  book: "M4 4h6a2 2 0 012 2v14a2 2 0 00-2-2H4zM20 4h-6a2 2 0 00-2 2v14a2 2 0 012-2h6z",
  help: "M12 21a9 9 0 110-18 9 9 0 010 18zM12 17h.01M12 13c0-2 3-2 3-4a3 3 0 00-6 0",
  bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  at: "M16 12a4 4 0 11-8 0 4 4 0 018 0zM16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.5 7.1",
  bars: "M5 20V10M12 20V4M19 20v-7",
  cart: "M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01",
  swap: "M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  send: "M5 12h14M13 6l6 6-6 6",
};
const I = ({ n, s = 18, c = "currentColor", w = 1.8 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className="ic">
    <path d={P[n]} />
  </svg>
);

/* ---------- logo: a milk carton that is also a speech bubble ---------- */
const Mark = ({ s = 28 }) => (
  <svg width={s} height={s * 1.15} viewBox="0 0 32 37" className="ic">
    <path d="M4 11L10 3h12l6 8v20H15l-6 5v-5H4z" fill="#f7a501" stroke="#23251d" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M4 11h24M10 3l2.5 8M22 3l-2.5 8" fill="none" stroke="#23251d" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="10.5" cy="21" r="2" fill="#23251d" />
    <circle cx="16" cy="21" r="2" fill="#23251d" />
    <circle cx="21.5" cy="21" r="2" fill="#23251d" />
  </svg>
);
const Lockup = ({ s = 24 }) => (
  <div className="lockup">
    <Mark s={s} />
    <b>Aimo Copilot</b>
  </div>
);
const Carton = () => (
  <svg width="18" height="24" viewBox="0 0 22 30" fill="none" stroke="#6c6e63" strokeWidth="1.6" strokeLinejoin="round" className="ic">
    <path d="M5 8l3-5h6l3 5v20H5z" />
    <path d="M5 8h12" />
  </svg>
);

/* ---------- Finnish formatting ---------- */
const fi = (v, d = 2) => v.toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (v) => fi(v) + " €";
const Price = ({ v, size = 28, unit, per }) => {
  const [a, b] = fi(v).split(",");
  return (
    <div style={{ textAlign: "right" }}>
      <span className="price" style={{ fontSize: size }}>
        {a}
        <sup>,{b}</sup>
        <span className="cur">€</span>
      </span>
      {(unit || per) && (
        <div className="unitp">
          {unit && "/" + unit}
          {unit && per && " · "}
          {per}
        </div>
      )}
    </div>
  );
};

/* ---------- status ---------- */
const ST = { order: "Ordered", ask: "Ask", block: "Blocked", unknown: "Unknown", info: "Info" };
const Stamp = ({ k, children }) => <span className={"stamp " + k}>{children || ST[k]}</span>;
const Chk = ({ ok, warn, children }) => (
  <div className="chk">
    <span className={"tick" + (ok ? "" : warn ? " warn" : " no")}>
      <I n={ok ? "check" : warn ? "q" : "x"} s={10} c="#fff" w={3.4} />
    </span>
    <span>{children}</span>
  </div>
);

/* ---------- tile ---------- */
const Tile = ({ title, bar = "#005670", act, children, style, bodyStyle }) => (
  <div className="tile" style={style}>
    {title && (
      <div className="tile-h">
        <span className="bar" style={{ background: bar }} />
        <h3>{title}</h3>
        {act && <div className="act">{act}</div>}
      </div>
    )}
    <div className="tile-b" style={bodyStyle}>
      {children}
    </div>
  </div>
);

/* ---------- shell ---------- */
const NAV = [
  ["ask", "chat", "Ask Aimo"],
  ["approvals", "q", "Approvals", 2],
  ["orders", "box", "Orders"],
  ["events", "cal", "Events"],
  ["dashboard", "bars", "Dashboard"],
];
const NAV2 = [
  ["audit", "list", "Audit log"],
  ["policy", "shield", "Policy"],
  ["agents", "plug", "Agent access"],
];
const TABS = [
  ["ask", "chat", "Ask"],
  ["approvals", "q", "Approvals", 2],
  ["orders", "box", "Orders"],
  ["more", "menu", "More"],
];
const SideItem = ({ k, ic, l, n, nav }) => (
  <a className={nav === k ? "on" : ""}>
    <I n={ic} s={17} />
    {l}
    {n && <span className="n">{n}</span>}
  </a>
);

function Shell({ nav, tab, title, titleAside, filters, children, back, bare }) {
  const m = useMobile();
  if (m)
    return (
      <div className="mshell">
        <div className="mstatus">
          <span>15.05</span>
          <span style={{ fontSize: 11 }}>5G ▮▮▮</span>
        </div>
        <div className="mbar">
          {back ? <I n="back" s={22} c="#005670" w={2.4} /> : <I n="menu" s={22} c="#005670" w={2.2} />}
          {bare ? <Lockup s={20} /> : <h1 style={{ fontSize: 22 }}>{title}</h1>}
          <div className="avatar" style={{ marginLeft: "auto" }}>ML</div>
        </div>
        <div className="mcontent">{children}</div>
        <div className="mtabs">
          {TABS.map(([k, ic, l, n]) => (
            <a key={k} className={(tab || nav) === k ? "on" : ""}>
              <I n={ic} s={22} />
              {l}
              {n && <span className="n">{n}</span>}
            </a>
          ))}
        </div>
      </div>
    );
  return (
    <div className="shell">
      <aside className="side">
        <Lockup />
        <div className="switch">
          <span className="sq">HA</span>
          <span style={{ flex: 1 }}>Hotel Aurora</span>
          <I n="down" s={14} />
        </div>
        {NAV.map(([k, ic, l, n]) => (
          <SideItem key={k} k={k} ic={ic} l={l} n={n} nav={nav} />
        ))}
        <div className="sec">Chats</div>
        <a className="sub">Lactose-free milk</a>
        <a className="sub">Wedding, 132 guests</a>
        <div className="gap" />
        {NAV2.map(([k, ic, l]) => (
          <SideItem key={k} k={k} ic={ic} l={l} nav={nav} />
        ))}
        <div className="me">
          <div className="avatar">ML</div>
          <b>Mikko Laine</b>
        </div>
      </aside>
      <div className="main">
        {!bare && (
          <div className="head">
            <h1>{title}</h1>
            {titleAside}
          </div>
        )}
        {!bare && filters && <div className="filters">{filters}</div>}
        <div className="content" style={bare ? { padding: 0 } : null}>
          {children}
        </div>
      </div>
    </div>
  );
}
const Drop = ({ children, icon }) => (
  <button className="fbtn">
    {icon && <I n={icon} s={15} />}
    {children}
    <I n="down" s={14} />
  </button>
);
const Updated = ({ t = "Prices checked 15.05" }) => (
  <span className="right">
    <I n="refresh" s={14} /> {t}
  </span>
);

/* ---------- shared fixture data ---------- */
const MILK = [
  { id: "464306", name: "Valio Arki Eila semi-skimmed milk drink 1 l", pack: "1 l carton", su: "ST", price: 1.01, perL: 1.01, stock: "640", cut: "SU 15.11. 17.00", model: "Stock", o: "order", why: "What you asked for. 640 l in stock." },
  { id: "463335", name: "Valio Eila 3 % milk drink 1 l", pack: "1 l carton", su: "ST", price: 1.4, perL: 1.4, stock: "500", cut: "SU 15.11. 17.00", model: "Stock", o: "ask", why: "Higher fat. A different ingredient, so a person signs off." },
  { id: "464201", name: "Valio semi-skimmed milk 1 l UHT", pack: "1 l carton", su: "ST", price: 1.56, perL: 1.56, stock: null, cut: "SU 15.11. 17.00", model: "Stock", o: "unknown", why: "API sends a placeholder stock figure. We don't count it." },
  { id: "463038", name: "Valio Eila semi-skimmed 10 l Novobox", pack: "2 × 10 l", su: "KI", price: 31.31, perL: 1.57, stock: null, cut: "TO 12.11. 15.00", model: "Terminal", o: "block", why: "Order cut-off passed on Thursday." },
  { id: "464179", name: "Arla semi-skimmed 10 l Novobox ESL", pack: "10 l", su: "ST", price: 27.22, perL: 2.72, stock: null, cut: "TO 12.11. 15.00", model: "Terminal", o: "block", why: "Order cut-off passed on Thursday." },
];
