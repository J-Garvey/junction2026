/** Shell: sidebar or phone tabs, the "viewing as" switcher (TM-06), the top bar with the profile, and the allergy banner. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router";
import type { WarningRecord } from "@aimo/contracts";
import { api, authHooks, type Outlet, type Person, type StatusResp } from "./api";
import { Ctx, type AppCtx } from "./ctx";
import { Icon, Lockup, Mark, type IconName } from "./ui/icons";
import { AllergyBanner } from "./ui/Banner";
import { initials } from "./format";
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
  ["/audit", "list", "Audit"],
  ["/rules", "shield", "Rules"],
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
  if (!ctx || needPick) return <PersonPicker people={people} current={me} onPick={pick} onCancel={me ? () => setNeedPick(false) : undefined} />;

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <Sidebar badge={badge} me={ctx.me} people={people} onPick={pick} />
        <div className="main">
          <TopBar status={status} me={ctx.me} onChange={refresh} onSwitch={() => setNeedPick(true)} />
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

function Sidebar({ badge, me, people, onPick }: { badge: number; me: Person; people: Person[]; onPick: (id: string) => void }) {
  return (
    <aside className="side">
      <label className="acct" title="Viewing as (test session)">
        <Mark s={20} />
        <select value={me.id} onChange={(e) => onPick(e.target.value)} aria-label="Viewing as">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}, {p.title}
            </option>
          ))}
        </select>
        <Icon n="down" s={14} />
      </label>
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

function TopBar({ status, me, onChange, onSwitch }: { status: StatusResp | null; me: Person; onChange: () => void; onSwitch: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function reset() {
    if (!confirm("Reset the demo? This clears orders, questions and the audit log.")) return;
    setBusy(true);
    setErr(null);
    try {
      await api.reset();
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="topbar">
      {status && !status.chain.ok && <span className="stamp block">Audit chain broken</span>}
      {err && <span className="small" style={{ color: "var(--red)" }}>{err}</span>}
      <button type="button" className="btn sm ghost" style={{ marginLeft: "auto" }} disabled={busy} onClick={reset}>
        <Icon n="refresh" s={14} /> {busy ? "Resetting…" : "Reset"}
      </button>
      <button type="button" className="profile hide-m" onClick={onSwitch} title="Switch person">
        <span className="avatar">{initials(me.name)}</span>
        <span>
          <b>{me.name}</b>
          <span className="small muted">{me.title}</span>
        </span>
      </button>
    </div>
  );
}

function MobileHead({ me, onSwitch }: { me: Person; onSwitch: () => void }) {
  const loc = useLocation();
  const title = NAV.find(([to]) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to)))?.[2] ?? "";
  return (
    <div className="mhead">
      <Mark s={20} />
      <h1>{title || "Aimo Copilot"}</h1>
      <button type="button" className="avatar" onClick={onSwitch} title={`Viewing as ${me.name}`}>
        {initials(me.name)}
      </button>
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

function PersonPicker({ people, current, onPick, onCancel }: { people: Person[]; current: Person | null; onPick: (id: string) => void; onCancel?: () => void }) {
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
      {onCancel && (
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
