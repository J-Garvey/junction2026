/* Banquet Copilot screens, minimal. PostHog tokens from designs/posthog/DESIGN.md. */

const BOARD = [
  ["Most products", "SU 17.00", "25 h 55"],
  ["Early group", "PE 13.00", "Passed", true],
  ["Supplier direct", "TO 15.00", "Passed", true],
];
const Board = ({ rows = BOARD }) => (
  <div className="board">
    {rows.map(([a, b, c, gone]) => (
      <div key={a} className="br">
        <span>{a}</span>
        <span className="t">{b}</span>
        <span className={gone ? "gone" : "left"}>{c}</span>
      </div>
    ))}
  </div>
);

/* ---------- composer ---------- */
const Composer = ({ go, text }) => (
  <div className="composer">
    <div className="ctx">
      <span className="add"><I n="at" s={13} /> Add context</span>
    </div>
    <div className="txt">
      <span className={text ? "" : "ph"}>{text || "Ask for products, prices or delivery"}</span>
      <span className={"send" + (go ? " go" : "")}><I n="send" s={18} w={2.2} /></span>
    </div>
  </div>
);
const SUGG = ["1 000 l lactose-free milk by Monday", "Guest count changed", "Find a substitute"];

/* =========================== 1. Home =========================== */
function Home() {
  const m = useMobile();
  if (m)
    return (
      <Shell nav="ask" bare>
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div className="chathome" style={{ paddingTop: 60 }}>
            <Mark s={48} />
            <h2 style={{ fontSize: 28, marginTop: 14 }}>What does the kitchen need?</h2>
            <div className="sugg" style={{ marginTop: 18 }}>
              {SUGG.map((l) => <span key={l}>{l}</span>)}
            </div>
          </div>
          <div style={{ marginTop: "auto", paddingBottom: 12 }}>
            <Composer go />
          </div>
        </div>
      </Shell>
    );
  return (
    <Shell nav="ask" bare>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", padding: "150px 40px 28px" }}>
        <div className="chathome" style={{ width: 640 }}>
          <Mark s={56} />
          <h2 style={{ margin: "18px 0 24px" }}>What does the kitchen need?</h2>
          <Composer go />
          <div className="sugg" style={{ marginTop: 16 }}>
            {SUGG.map((l) => <span key={l}>{l}</span>)}
          </div>
        </div>
        <div className="row" style={{ marginTop: "auto", gap: 8 }}>
          <Stamp k="ask">2</Stamp>
          <span className="small" style={{ color: "var(--ink)", fontWeight: 600 }}>questions waiting</span>
          <I n="chev" s={14} />
        </div>
      </div>
    </Shell>
  );
}

/* =========================== 2. Conversation =========================== */
const ME = "1,000 litres of lactose-free milk by Monday. Best price and availability.";
const BASKET = [
  ["Arki Eila semi-skimmed 1 l", 640],
  ["Eila 3 % 1 l", 360],
];
function Basket() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h3>Basket · MA 16.11.</h3>
        <Stamp k="ask" />
      </div>
      {BASKET.map(([n, q]) => (
        <div key={n} className="li">
          <span style={{ flex: 1, color: "var(--ink)", fontSize: 14 }}>{n}</span>
          <div className="stepper"><b>–</b><span>{q}</span><b>+</b></div>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "space-between", margin: "14px 0" }}>
        <span className="muted small">1 000 l, before VAT</span>
        <Price v={1150.4} size={26} />
      </div>
      <button className="btn primary full">Ask Sanna to approve</button>
    </div>
  );
}
function Thread() {
  const m = useMobile();
  const ai = (
    <div className="msg-ai">
      <Mark s={22} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="steps"><I n="check" s={13} w={2.4} /> Checked 25 milks, price and stock</div>
        Valio has 640 l of your semi-skimmed. The rest has to be Eila 3 %, which needs Sanna's yes.
      </div>
    </div>
  );
  const table = (
    <table className="t">
      <thead><tr><th>Product</th><th className="num">€/l</th><th>Monday</th></tr></thead>
      <tbody>
        {MILK.slice(0, 4).map((p) => (
          <tr key={p.id} className={p.o === "block" ? "dim" : ""}>
            <td>{p.name.replace("Valio ", "")}</td>
            <td className="num">{fi(p.perL)}</td>
            <td><Stamp k={p.o}>{{ order: "640 l", ask: "500 l", unknown: "Unknown", block: "Too late" }[p.o]}</Stamp></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (m)
    return (
      <Shell nav="ask" title="Lactose-free milk" back>
        <div className="stack">
          <div className="msg-me">{ME}</div>
          {ai}
          <Basket />
        </div>
      </Shell>
    );
  return (
    <Shell nav="ask" title="Lactose-free milk">
      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: 24, height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="msg-me">{ME}</div>
          {ai}
          <div className="card" style={{ padding: "14px 4px 2px", marginLeft: 34 }}>{table}</div>
          <div style={{ marginTop: "auto" }}><Composer /></div>
        </div>
        <div><Basket /></div>
      </div>
    </Shell>
  );
}

/* =========================== 3. Dashboard =========================== */
const OUTC = [[22, 3, 0], [31, 4, 1], [18, 2, 0], [40, 5, 1], [36, 3, 2], [12, 1, 0], [6, 0, 0], [28, 4, 1], [35, 2, 0], [44, 6, 1], [39, 3, 1], [47, 5, 2], [24, 2, 1]];
function Bars({ h = 150, w = 420 }) {
  const max = 56, bw = w / OUTC.length;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {OUTC.map(([o, a, b], i) => {
        const x = i * bw + 4, ww = bw - 8, ho = (o / max) * h, ha = (a / max) * h, hb = (b / max) * h;
        return (
          <g key={i}>
            <rect x={x} y={h - ho} width={ww} height={ho} fill="#23251d" rx="2" />
            <rect x={x} y={h - ho - ha - 1} width={ww} height={ha} fill="#f7a501" rx="2" />
            <rect x={x} y={h - ho - ha - hb - 2} width={ww} height={hb} fill="#cd4239" rx="2" />
          </g>
        );
      })}
    </svg>
  );
}
const EVENTS = [
  ["Nordic Fintech Summit", "MA 16.11.", "ask"],
  ["Board dinner", "TI 17.11.", "order"],
  ["Medical congress", "TO 19.11.", "order"],
  ["Lindqvist wedding", "LA 21.11.", "block"],
];
function Today() {
  const m = useMobile();
  const big = (
    <Tile title="Ordered without a person">
      <div className="big">86 %</div>
      <div className="small muted" style={{ marginTop: 8 }}>This week · up 9 pts</div>
    </Tile>
  );
  const events = (
    <Tile title="Events">
      {EVENTS.map(([n, d, o]) => (
        <div key={n} className="li">
          <span style={{ flex: 1, color: "var(--ink)" }}>{n}</span>
          <span className="small muted">{d}</span>
          <Stamp k={o} />
        </div>
      ))}
    </Tile>
  );
  if (m)
    return (
      <Shell nav="more" title="Dashboard">
        <div className="stack">
          {big}
          <Board rows={BOARD.slice(0, 2)} />
          {events}
        </div>
      </Shell>
    );
  return (
    <Shell nav="dashboard" title="Dashboard" filters={<Drop icon="cal">This week</Drop>}>
      <div className="grid" style={{ gridTemplateColumns: "280px 1fr", marginBottom: 16 }}>
        {big}
        <Tile title="Lines per day" act={<span><b style={{ color: "#23251d" }}>■</b> Ordered <b style={{ color: "#f7a501" }}>■</b> Asked <b style={{ color: "#cd4239" }}>■</b> Blocked</span>}>
          <Bars />
        </Tile>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <Tile title="Cut-offs for Monday"><Board /></Tile>
        {events}
      </div>
    </Shell>
  );
}

/* =========================== 4. Approval =========================== */
function Approval() {
  const m = useMobile();
  const rows = [["Fat", "1,5 %", "3 %"], ["Price", "1,01 €/l", "1,40 €/l"], ["Allergens", "Milk", "Milk"]];
  const body = (
    <div className="stack">
      <div className="muted small">Nordic Fintech Summit · from Aimo</div>
      <h2 style={{ fontSize: m ? 24 : 30, lineHeight: 1.25 }}>Use Eila 3 % for the last 360 l of milk?</h2>
      <div className="card" style={{ padding: "12px 4px 0" }}>
        <table className="t">
          <thead><tr><th></th><th>Asked for</th><th>Eila 3 %</th></tr></thead>
          <tbody>{rows.map(([a, b, c]) => <tr key={a}><td className="muted">{a}</td><td>{b}</td><td style={{ fontWeight: b !== c ? 700 : 400 }}>{c}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="row muted small" style={{ gap: 6 }}>
        <I n="lock" s={14} /> 1 150,40 € · MA 16.11. · expires SU 17.00
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" style={{ flex: 1 }}>Approve</button>
        <button className="btn" style={{ flex: 1 }}>Only 640 l</button>
        <button className="btn danger">Decline</button>
      </div>
    </div>
  );
  if (m) return <Shell nav="approvals" title="Approval" back>{body}</Shell>;
  return (
    <Shell nav="approvals" title="Approvals">
      <div style={{ maxWidth: 620 }}>{body}</div>
    </Shell>
  );
}

/* =========================== 5. Ordered =========================== */
function Receipt() {
  const m = useMobile();
  const r = (
    <div className="receipt">
      <div className="rl"><span>AIM-20261114-0042</span><span>MA 16.11.</span></div>
      <hr />
      <div className="rl"><span>640 × Arki Eila 1 l</span><span>646,40</span></div>
      <div className="rl"><span>360 × Eila 3 % 1 l</span><span>504,00</span></div>
      <hr />
      <div className="rl"><span>VAT 13,5 %</span><span>155,30</span></div>
      <div className="rl" style={{ fontWeight: 700 }}><span>Total €</span><span>1 305,70</span></div>
    </div>
  );
  const checks = (
    <div>
      <Chk ok>Price, stock and cut-off rechecked</Chk>
      <Chk ok>Approved by Sanna V.</Chk>
      <Chk ok>Duplicate submit ignored</Chk>
    </div>
  );
  if (m)
    return (
      <Shell nav="orders" title="Ordered" back>
        <div className="stack">{r}{checks}</div>
      </Shell>
    );
  return (
    <Shell nav="orders" title="Ordered" titleAside={<Stamp k="order" />}>
      <div className="row" style={{ alignItems: "flex-start", gap: 32 }}>
        <div style={{ width: 380 }}>{r}</div>
        {checks}
      </div>
    </Shell>
  );
}

/* =========================== 6. Event change =========================== */
function EventChange() {
  const m = useMobile();
  const lines = [["Salmon fillet", "18 kg", "20 kg", "order"], ["Cream 35 %", "12 l", "14 l", "order"], ["Butter", "4 kg", "4,5 kg", "order"], ["Gluten-free rolls", "6", "14", "order"], ["Gluten-free cake base", "1", "3", "block"]];
  const blocked = (
    <div className="callout red">
      <b>Cake base has no allergen data.</b> Pick one with a gluten-free claim.
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button className="btn sm primary">Sponge base 24 cm</button>
        <button className="btn sm" style={{ background: "#fff" }}>Tart shell</button>
      </div>
    </div>
  );
  if (m)
    return (
      <Shell nav="more" title="132 guests" back>
        <div className="stack">
          <div className="muted small">Lindqvist wedding · was 120</div>
          <Chk ok>4 lines reordered</Chk>
          {blocked}
        </div>
      </Shell>
    );
  return (
    <Shell nav="events" title="Lindqvist wedding" titleAside={<span className="tag">120 → 132 guests</span>}>
      <div className="grid" style={{ gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
        <div className="card" style={{ padding: "14px 4px 2px" }}>
          <table className="t">
            <thead><tr><th>Line</th><th className="num">Was</th><th className="num">Now</th><th></th></tr></thead>
            <tbody>{lines.map(([a, b, c, o]) => <tr key={a}><td>{a}</td><td className="num muted">{b}</td><td className="num">{c}</td><td className="num"><Stamp k={o} /></td></tr>)}</tbody>
          </table>
        </div>
        {blocked}
      </div>
    </Shell>
  );
}

/* =========================== 7. Audit =========================== */
const AUDIT = [
  ["15.05", "Mikko", "Asked for 1 000 l lactose-free milk"],
  ["15.05", "Aimo", "Checked price and stock for 5 products"],
  ["15.05", "Rule", "Blocked 2 products: cut-off passed"],
  ["15.05", "Aimo", "Asked Sanna about Eila 3 %"],
  ["15.11", "Sanna", "Approved"],
  ["15.12", "Aimo", "Ordered AIM-0042"],
  ["15.12", "Agent", "Duplicate ignored"],
];
function Audit() {
  const m = useMobile();
  const rows = AUDIT.map(([t, w, s]) => (
    <div key={s} className="arow" style={m ? { gridTemplateColumns: "48px 1fr" } : null}>
      <span className="mono muted">{t}</span>
      {!m && <span className="muted">{w}</span>}
      <span>{s}</span>
    </div>
  ));
  if (m) return <Shell nav="more" title="Audit log" back><div className="card" style={{ padding: "0 14px" }}>{rows}</div></Shell>;
  return (
    <Shell nav="audit" title="Audit log" filters={<><Drop>Lactose-free milk</Drop><button className="fbtn">Export</button></>}>
      <div className="card" style={{ padding: "0 16px", maxWidth: 760 }}>{rows}</div>
    </Shell>
  );
}

/* =========================== 8. Policy =========================== */
function Policy() {
  const m = useMobile();
  const soft = [["Order alone if rounding adds up to", "5 %"], ["Order alone if guests change up to", "10 %"], ["Ask if a substitute costs more than", "15 %"]];
  const toggles = [["Always ask before an ingredient swap", true], ["Spend limit per basket", false]];
  const body = (
    <div className="stack" style={{ maxWidth: 620 }}>
      <div className="seg"><span>Explain each choice</span><span className="on">Just handle it</span></div>
      <div className="card" style={{ padding: "0 16px" }}>
        {soft.map(([a, v]) => (
          <div key={a} className="li">
            <span style={{ flex: 1, color: "var(--ink)" }}>{a}</span>
            <div className="stepper"><b>–</b><span style={{ minWidth: 48 }}>{v}</span><b>+</b></div>
          </div>
        ))}
        {toggles.map(([a, on]) => (
          <div key={a} className="li">
            <span style={{ flex: 1, color: "var(--ink)" }}>{a}</span>
            <span className={"toggle" + (on ? " on" : "")} />
          </div>
        ))}
      </div>
      <div className="row muted small" style={{ gap: 6 }}>
        <I n="lock" s={14} /> Allergen, diet, cut-off and stock rules are always on.
      </div>
    </div>
  );
  if (m) return <Shell nav="more" title="Policy" back>{body}</Shell>;
  return <Shell nav="policy" title="Policy">{body}</Shell>;
}

/* =========================== 9. Agent access =========================== */
function Agents() {
  const m = useMobile();
  const clients = [["Aurora procurement agent", "MCP", true], ["Sanna's email assistant", "REST", true], ["Test bot", "Sandbox", false]];
  const list = (
    <div className="card" style={{ padding: "0 16px" }}>
      {clients.map(([n, t, on]) => (
        <div key={n} className="li">
          <I n="plug" s={16} />
          <span style={{ flex: 1, color: "var(--ink)" }}>{n}</span>
          <span className="small muted">{t}</span>
          <span className={"toggle" + (on ? " on" : "")} />
        </div>
      ))}
    </div>
  );
  const code = (
    <div className="code">
      {"POST /v1/inquiries\n\n{ "}<span className="k">"outcome"</span>: <span className="s">"ask"</span>
      {",\n  "}<span className="k">"question"</span>: <span className="s">"Use Eila 3 % for 360 l?"</span>
      {",\n  "}<span className="k">"expires_at"</span>: <span className="s">"2026-11-15T17:00+02:00"</span>{" }"}
    </div>
  );
  if (m) return <Shell nav="more" title="Agent access" back><div className="stack">{list}</div></Shell>;
  return (
    <Shell nav="agents" title="Agent access" filters={<><button className="fbtn"><I n="plus" s={14} /> Connect</button><button className="fbtn">openapi.json</button></>}>
      <div className="stack" style={{ maxWidth: 620 }}>{list}{code}</div>
    </Shell>
  );
}

/* =========================== canvas =========================== */
const SCREENS = [
  ["home", "Home", Home],
  ["thread", "Conversation", Thread],
  ["dashboard", "Dashboard", Today],
  ["approval", "Approval", Approval],
  ["receipt", "Ordered", Receipt],
  ["change", "Event change", EventChange],
  ["audit", "Audit log", Audit],
  ["policy", "Policy", Policy],
  ["agents", "Agent access", Agents],
];
function Canvas({ only }) {
  const list = only ? SCREENS.filter((s) => s[0] === only) : SCREENS;
  return (
    <div className="canvas">
      {!only && <div className="canvas-head"><h1>Aimo Copilot</h1></div>}
      {list.map(([k, t, C]) => (
        <section key={k} className="screen-sec">
          <h2>{t}</h2>
          <div className="frames">
            <div>
              <div className="frame-label">Desktop + tablet</div>
              <div className="frame desktop"><Mobile.Provider value={false}><C /></Mobile.Provider></div>
            </div>
            <div>
              <div className="frame-label">Mobile</div>
              <div className="frame mobile"><Mobile.Provider value={true}><C /></Mobile.Provider></div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
if (window.PAGE !== "system") ReactDOM.createRoot(document.getElementById("root")).render(<Canvas only={window.SCREEN || null} />);
