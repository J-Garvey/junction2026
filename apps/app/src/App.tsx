/** Shell: the order-first main view, the top bar with the profile, the allergy banner,
 * and the person picker with the demo settings (test clock and reset). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import type { WarningRecord } from "@aimo/contracts";
import { api, authHooks, type Outlet, type Person, type StatusResp, type SceneKey } from "./api";
import { Ctx, type AppCtx, useLoad } from "./ctx";
import { Icon, Lockup, Mark, type IconName } from "./ui/icons";
import { AllergyBanner } from "./ui/Banner";
import { day, initials, when } from "./format";
import { Home } from "./screens/Home";
import { FinanceHome } from "./screens/Finance";
import { BasketPage, BasketsHome } from "./screens/Baskets";
import { RequestNew, RequestPlan, Requests } from "./screens/Request";
import { EventPage, Events } from "./screens/Event";
import { Orders } from "./screens/Orders";
import { Audit } from "./screens/Audit";
import { Rules } from "./screens/Rules";
import { WhatsApp, WhatsAppSimulator } from "./screens/WhatsApp";
import { WhatsAppWebConnection } from "./screens/WhatsAppWebConnection";

const NAV: [string, IconName, string][] = [
  ["/", "home", "Home"],
  ["/inbox", "q", "Waiting"],
  ["/events", "cal", "Events"],
  ["/requests", "chat", "Requests"],
  ["/orders", "box", "Orders"],
  ["/whatsapp", "chat", "WhatsApp"],
];

export function App() {
  const [me, setMe] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [needPick, setNeedPick] = useState(false);
  const [tick, setTick] = useState(0);
  const [warnings, setWarnings] = useState<WarningRecord[]>([]);
  const [bootErr, setBootErr] = useState<string | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    authHooks.onUnauthorized = () => {
      setMe(null);
      setNeedPick(true);
    };
    api
      .people()
      .then((r) => {
        setPeople(r.people);
        setOutlets(r.outlets);
      })
      .catch((e: Error) => setBootErr(e.message));
    api
      .me()
      .then((r) => setMe(r.person))
      .catch(() => setNeedPick(true));
  }, []);

  useEffect(() => {
    api.status().then(setStatus).catch(() => {});
    const t = setInterval(() => api.status().then(setStatus).catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [tick]);

  useEffect(() => {
    if (!me) return;
    const load = () =>
      api
        .home()
        .then((h) => {
          setWarnings(h.warnings);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [me, tick]);

  async function pick(id: string) {
    const r = await api.session(id);
    setMe(r.person);
    setNeedPick(false);
    refresh();
  }

  const ctx: AppCtx | null = useMemo(
    () =>
      me
        ? {
            me,
            people,
            outlets,
            status,
            now: status?.clock.now ?? new Date().toISOString(),
            tick,
            refresh,
            switchPerson: () => setNeedPick(true),
          }
        : null,
    [me, people, outlets, status, tick, refresh],
  );

  if (bootErr && !people.length)
    return (
      <div className="picker">
        <Lockup />
        <div className="callout red">{bootErr}</div>
      </div>
    );
  if (!ctx || needPick) return <PersonPicker people={people} current={me} status={status} onChange={refresh} onPick={pick} onCancel={me ? () => setNeedPick(false) : undefined} />;

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <div className="main">
          <TopBar status={status} me={ctx.me} onSwitch={() => setNeedPick(true)} />
          <WorkspaceNav me={ctx.me} />
          <AllergyBanner warnings={warnings} />
          <div className="content">
            <Routes>
              <Route path="/" element={me?.role === "approver" ? <FinanceHome /> : <BasketsHome />} />
              <Route path="/baskets/:id" element={<BasketPage />} />
              <Route path="/inbox" element={me?.role === "approver" ? <FinanceHome /> : <Home />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/requests/new" element={<RequestNew />} />
              <Route path="/requests/:id" element={<RequestPlan />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventPage />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/whatsapp/simulator" element={<WhatsAppSimulator />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="*" element={<div className="muted">Page not found.</div>} />
            </Routes>
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

/** Keep the main destinations visible without expanding the order/account menus. */
function WorkspaceNav({ me }: { me: Person }) {
  const { pathname } = useLocation();
  const homeCurrent = pathname === "/" ? "page" : pathname.startsWith("/baskets/") ? "location" : undefined;
  const destinations: [string, IconName, string][] = [
    ["/inbox", "q", "Waiting"],
    ["/requests", "chat", "Requests"],
    ["/events", "cal", "Events"],
    ["/orders", "box", "Order receipts"],
  ];

  return (
    <nav className="workspace-nav" aria-label="Main navigation">
      <Link to="/" className={homeCurrent ? "on" : ""} aria-current={homeCurrent}>
        <Icon n="home" s={16} />{me.role === "approver" ? "Approvals & spend" : "My orders"}
      </Link>
      {destinations.map(([to, icon, label]) => (
        <NavLink key={to} to={to} className={({ isActive }) => isActive ? "on" : ""}>
          <Icon n={icon} s={16} />{label}
        </NavLink>
      ))}
    </nav>
  );
}

function Sidebar({ badge, me }: { badge: number; me: Person }) {
  const loc = useLocation();
  const basketId = loc.pathname.match(/^\/baskets\/([^/]+)$/)?.[1];

  return (
    <aside className="side">
      {basketId ? (
        <OrderSwitcher currentId={decodeURIComponent(basketId)} />
      ) : loc.pathname === "/" ? (
        <div className="acct acct-static" title={`Viewing as ${me.name}`}>
          <Mark s={20} />
          <span>
            <b>{me.name}</b>
            <span className="small muted">{me.title}</span>
          </span>
        </div>
      ) : (
        <div className="side-brand"><Lockup /></div>
      )}
      {NAV.map(([to, ic, l]) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
          <Icon n={ic} s={17} />
          {l}
          {to === "/inbox" && badge > 0 && (
            <span className="n" aria-label={`${badge} waiting`}>
              {badge}
            </span>
          )}
        </NavLink>
      ))}
    </aside>
  );
}

function OrderSwitcher({ currentId }: { currentId?: string }) {
  const { data } = useLoad(() => api.baskets(), []);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const orders = [...(data?.baskets ?? [])].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  const current = orders.find((order) => order.id === currentId);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="order-switcher" ref={ref}>
      <button type="button" className="profile order-switcher-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <b>{current?.name ?? (currentId ? "Loading…" : "My orders")}</b>
        <Icon n="down" s={14} />
      </button>
      {open && (
        <div className="order-switcher-menu" role="menu" aria-label="Switch order">
          <div className="order-switcher-list">
            {orders.map((order) => (
              <Link
                key={order.id}
                to={`/baskets/${order.id}`}
                role="menuitem"
                className={order.id === currentId ? "selected" : ""}
                aria-current={order.id === currentId ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="order-switcher-order">
                  <b>{order.name}</b>
                  <span>Delivery {day(order.deliveryDate)}</span>
                </span>
                {order.waiting > 0 && <span className="order-switcher-count">{order.waiting}</span>}
              </Link>
            ))}
          </div>
          <Link to="/" role="menuitem" className="order-switcher-all" onClick={() => setOpen(false)}>
            <span>View all orders</span>
            <Icon n="chev" s={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

export function ModelStatus({ status }: { status: StatusResp | null }) {
  if (!status) return null;
  const m = status.model;
  const name = `${m.provider === "openai" ? "OpenAI" : m.provider} ${m.model}`;
  return (
    <div className="small modelst" title="Which model reads requests and checks product types">
      <span className={`dot ${m.configured ? "ok" : "off"}`} />
      {m.configured ? `${name}: on` : `${name}: not configured`}
    </div>
  );
}

function TopBar({ status, me, onSwitch }: { status: StatusResp | null; me: Person; onSwitch: () => void }) {
  const loc = useLocation();
  const basketId = loc.pathname.match(/^\/baskets\/([^/]+)$/)?.[1];

  return (
    <div className="topbar">
      <div className="order-switcher-slot">
        <Link to="/" className="home-logo-button" aria-label="Go to homepage" title="Go to homepage">
          <Mark s={22} />
        </Link>
        <OrderSwitcher currentId={basketId ? decodeURIComponent(basketId) : undefined} />
      </div>
      {status && !status.chain.ok && <span className="stamp block">Audit chain broken</span>}
      <div className="account-slot"><AccountMenu me={me} onSwitch={onSwitch} /></div>
    </div>
  );
}

function AccountMenu({ me, onSwitch }: { me: Person; onSwitch: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button type="button" className="profile" onClick={() => setOpen((value) => !value)} aria-label={`Signed in as ${me.name}`} aria-haspopup="menu" aria-expanded={open} title={`Signed in as ${me.name}`}>
        <span className="avatar">{initials(me.name)}</span>
        <span className="account-details">
          <b>{me.name}</b>
          <span className="small muted">{me.title}</span>
        </span>
        <span className="account-chevron"><Icon n="down" s={14} /></span>
      </button>
      {open && (
        <div className="account-panel" role="menu">
          <div className="account-current">
            <span className="avatar">{initials(me.name)}</span>
            <span>
              <span className="small muted">Signed in as</span>
              <b>{me.name}</b>
              <span className="small muted">{me.title}</span>
            </span>
          </div>
          <NavLink to="/audit" role="menuitem" onClick={() => setOpen(false)}><Icon n="list" s={17} /> Audit log</NavLink>
          <NavLink to="/rules" role="menuitem" onClick={() => setOpen(false)}><Icon n="shield" s={17} /> Rules</NavLink>
          <button type="button" className="account-action" role="menuitem" onClick={() => { setOpen(false); onSwitch(); }}><Icon n="users" s={17} /> Switch user</button>
        </div>
      )}
    </div>
  );
}

function PersonPicker({
  people,
  current,
  status,
  onChange,
  onPick,
  onCancel,
}: {
  people: Person[];
  current: Person | null;
  status: StatusResp | null;
  onChange: () => void;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const [settings, setSettings] = useState(false);
  const [whatsAppPending, setWhatsAppPending] = useState(false);
  const navigate = useNavigate();

  function openWhatsApp() {
    navigate("/whatsapp");
    if (current && onCancel) onCancel();
    else setWhatsAppPending(true);
  }

  return (
    <div className="picker">
      <Lockup s={30} />
      <h1>Who are you?</h1>
      <div className="pickgrid">
        {people.map((p) => (
          <button key={p.id} type="button" className={`pickcard ${current?.id === p.id ? "on" : ""}`} onClick={() => onPick(p.id)}>
            <span className="avatar big-av">{initials(p.name)}</span>
            <span>
              <b>{p.name}</b>
              <span className="small muted">{p.title}</span>
            </span>
          </button>
        ))}
        {!people.length && <div className="muted">Loading people…</div>}
      </div>
      <div className="pickfoot">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="button" className="btn ghost" style={{ marginLeft: "auto" }} aria-expanded={settings} onClick={() => setSettings((v) => !v)}>
          <Icon n="clock" s={14} /> Demo settings
        </button>
      </div>
      {settings && <DemoSettings status={status} onChange={onChange} onOpenWhatsApp={openWhatsApp} person={current} />}
      {whatsAppPending && <p className="callout" role="status">Choose a demo person above to open WhatsApp, then select “Connect WhatsApp Web”.</p>}
    </div>
  );
}

/** Demo controls: move the clock, link WhatsApp Web, and reset. */
function DemoSettings({ status, onChange, onOpenWhatsApp, person }: { status: StatusResp | null; onChange: () => void; onOpenWhatsApp: () => void; person: Person | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!status) return <div className="demoset muted">Loading demo settings…</div>;
  const dm = typeof status.dataMode === "string" ? status.dataMode : status.dataMode.mode;
  const overlay = typeof status.dataMode === "string" ? null : status.dataMode.overlay;
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const scenes = Object.entries(status.clock.scenes) as [SceneKey, { label: string; time: string }][];
  return (
    <section className="demoset" aria-label="Demo settings">
      <div className="demohead">
        <h2>Demo settings</h2>
        <span className="small muted">
          <Icon n="clock" s={14} /> {when(status.clock.now)}
        </span>
        <span className={`stamp ${dm === "fixture" ? "fixture" : "info"}`} title={overlay ? `Fixture: ${overlay}` : undefined}>
          {dm === "fixture" ? "Fixture" : "Live"}
        </span>
      </div>
      <div className="small muted">Time</div>
      <div className="demotimes" role="group" aria-label="Demo time">
        {scenes.map(([k, s]) => (
          <button key={k} type="button" className={`demotime ${status.clock.scene === k ? "on" : ""}`} disabled={!!busy} onClick={() => run(k, () => api.clock(k))}>
            <b>{s.label}</b>
            <span className="small muted">{when(s.time)}</span>
          </button>
        ))}
        <button type="button" className={`demotime ${status.clock.mode !== "fixed" ? "on" : ""}`} disabled={!!busy} onClick={() => run("live", () => api.clock("live"))}>
          <b>Real time</b>
          <span className="small muted">Live clock and live mock data</span>
        </button>
      </div>
      {person ? <WhatsAppWebConnection key={person.id} person={person} /> : <div className="democonnection">
        <div>
          <b>WhatsApp Web</b>
          <p className="small muted">Link your regular WhatsApp account, then select one real group.</p>
        </div>
        <button type="button" className="btn sm" disabled={!!busy} onClick={onOpenWhatsApp}>
          <Icon n="chat" s={16} /> Link WhatsApp Web
        </button>
      </div>}
      <div className="demofoot">
        {err && <span className="small" style={{ color: "var(--red)" }}>{err}</span>}
        <button
          type="button"
          className="btn sm ghost"
          style={{ marginLeft: "auto" }}
          disabled={!!busy}
          onClick={() => {
            if (confirm("Reset the demo? This clears orders, questions and the audit log.")) run("reset", () => api.reset());
          }}
        >
          <Icon n="refresh" s={14} /> {busy === "reset" ? "Resetting…" : "Reset demo"}
        </button>
      </div>
    </section>
  );
}
