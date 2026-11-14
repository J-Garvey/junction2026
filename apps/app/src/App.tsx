/** Shell: the order-first main view, phone tabs, the top bar with the profile, the allergy banner,
 * and the person picker with the demo settings (test clock and reset). */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import type { WarningRecord } from "@aimo/contracts";
import { api, authHooks, type Outlet, type Person, type StatusResp, type SceneKey } from "./api";
import { Ctx, type AppCtx, useLoad } from "./ctx";
import { Icon, Lockup, Mark, type IconName } from "./ui/icons";
import { AllergyBanner } from "./ui/Banner";
import { day, initials, when } from "./format";
import { Home } from "./screens/Home";
import { BasketPage, BasketsHome } from "./screens/Baskets";
import { RequestNew, RequestPlan, Requests } from "./screens/Request";
import { EventPage, Events } from "./screens/Event";
import { Orders } from "./screens/Orders";
import { Audit } from "./screens/Audit";
import { Rules } from "./screens/Rules";

const NAV: [string, IconName, string][] = [
  ["/", "home", "Home"],
  ["/inbox", "q", "Waiting"],
  ["/events", "cal", "Events"],
  ["/requests", "chat", "Requests"],
  ["/orders", "box", "Orders"],
];

export function App() {
  const [me, setMe] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [needPick, setNeedPick] = useState(false);
  const [tick, setTick] = useState(0);
  const [badge, setBadge] = useState(0);
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
          setBadge(h.questions.filter((q) => q.state === "open").length);
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
          <AllergyBanner warnings={warnings} />
          <MobileHead me={ctx.me} onSwitch={() => setNeedPick(true)} />
          <div className="content">
            <Routes>
              <Route path="/" element={<BasketsHome />} />
              <Route path="/baskets/:id" element={<BasketPage />} />
              <Route path="/inbox" element={<Home />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/requests/new" element={<RequestNew />} />
              <Route path="/requests/:id" element={<RequestPlan />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:id" element={<EventPage />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/rules" element={<Rules />} />
              <Route path="*" element={<div className="muted">Page not found.</div>} />
            </Routes>
          </div>
        </div>
        <Tabs badge={badge} />
      </div>
    </Ctx.Provider>
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

function OrderSwitcher({ currentId }: { currentId: string }) {
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
      <button type="button" className="order-switcher-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open}>
        <span className="order-switcher-mark"><Icon n="box" s={16} /></span>
        <span className="order-switcher-copy">
          <span className="order-switcher-label">Current order</span>
          <b>{current?.name ?? "Loading order…"}</b>
        </span>
        <Icon n="down" s={14} />
      </button>
      {open && (
        <div className="order-switcher-menu" role="menu" aria-label="Switch order">
          <div className="order-switcher-heading">Orders</div>
          <div className="order-switcher-list">
            {orders.map((order) => (
              <Link key={order.id} to={`/baskets/${order.id}`} role="menuitem" className={order.id === currentId ? "selected" : ""} onClick={() => setOpen(false)}>
                <span className="order-switcher-order">
                  <b>{order.name}</b>
                  <span>Delivery {day(order.deliveryDate)}</span>
                </span>
                {order.waiting > 0 && <span className="order-switcher-count">{order.waiting}</span>}
                {order.id === currentId && <Icon n="check" s={16} />}
              </Link>
            ))}
          </div>
          <Link to="/" role="menuitem" className="order-switcher-all" onClick={() => setOpen(false)}>
            <span className="order-switcher-all-icon"><Icon n="box" s={15} /></span>
            <span><b>All orders</b><small>View and create orders</small></span>
            <Icon n="chev" s={15} />
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
      {basketId && <OrderSwitcher currentId={decodeURIComponent(basketId)} />}
      {status && !status.chain.ok && <span className="stamp block">Audit chain broken</span>}
      <div className="hide-m account-slot"><AccountMenu me={me} onSwitch={onSwitch} /></div>
    </div>
  );
}

function MobileHead({ me, onSwitch }: { me: Person; onSwitch: () => void }) {
  const loc = useLocation();
  const title = NAV.find(([to]) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to)))?.[2] ?? (loc.pathname.startsWith("/audit") ? "Audit" : loc.pathname.startsWith("/rules") ? "Rules" : "");
  return (
    <div className="mhead">
      <Mark s={20} />
      <h1>{title || "Aimo Copilot"}</h1>
      <AccountMenu me={me} onSwitch={onSwitch} compact />
    </div>
  );
}

function AccountMenu({ me, onSwitch, compact = false }: { me: Person; onSwitch: () => void; compact?: boolean }) {
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
    <div className={`account-menu ${compact ? "compact" : ""}`} ref={ref}>
      <button type="button" className={compact ? "avatar" : "profile"} onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} title={`Signed in as ${me.name}`}>
        <span className={compact ? "" : "avatar"}>{initials(me.name)}</span>
        {!compact && (
          <>
            <span>
              <b>{me.name}</b>
              <span className="small muted">{me.title}</span>
            </span>
            <Icon n="down" s={14} />
          </>
        )}
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

function Tabs({ badge }: { badge: number }) {
  return (
    <nav className="mtabs" aria-label="Main">
      {NAV.map(([to, ic, l]) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
          <Icon n={ic} s={21} />
          {l}
          {to === "/inbox" && badge > 0 && <span className="n">{badge}</span>}
        </NavLink>
      ))}
    </nav>
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
      {settings && <DemoSettings status={status} onChange={onChange} />}
    </div>
  );
}

/** Test-only controls, kept off the product screens: move the clock to a scene or real time, and reset the demo. */
function DemoSettings({ status, onChange }: { status: StatusResp | null; onChange: () => void }) {
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
