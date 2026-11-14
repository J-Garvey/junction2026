/* Design system page. Tokens from designs/posthog/DESIGN.md. */
const SW = [
  ["primary", "#f7a501"], ["ink", "#23251d"], ["body", "#4d4f46"], ["mute", "#6c6e63"],
  ["canvas", "#eeefe9"], ["soft", "#e5e7e0"], ["card", "#ffffff"], ["hairline", "#bfc1b7"],
  ["green", "#2c8c66"], ["red", "#cd4239"], ["blue", "#2c84e0"], ["purple", "#7c44a6"],
];
const Sec = ({ t, children }) => (
  <section style={{ marginBottom: 56 }}>
    <h2 style={{ marginBottom: 16 }}>{t}</h2>
    {children}
  </section>
);
function System() {
  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: "56px 64px", maxWidth: 1100 }}>
      <div className="row" style={{ gap: 16, marginBottom: 56 }}>
        <Mark s={56} />
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: 0 }}>Aimo Copilot</h1>
          <div className="muted">Design system · based on PostHog DESIGN.md</div>
        </div>
      </div>
      <Sec t="Colour">
        <div className="grid" style={{ gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {SW.map(([n, h]) => (
            <div key={n}>
              <div style={{ height: 56, background: h, borderRadius: 6, border: "1px solid var(--hairline)" }} />
              <div className="small" style={{ marginTop: 6, color: "var(--ink)", fontWeight: 600 }}>{n}</div>
              <div className="mono muted">{h}</div>
            </div>
          ))}
        </div>
      </Sec>
      <Sec t="Type">
        <div className="card stack" style={{ padding: 24 }}>
          <div style={{ fontSize: 36, fontWeight: 700, color: "var(--ink)" }}>What does the kitchen need?</div>
          <h1>Lactose-free milk</h1>
          <h3>Basket · MA 16.11.</h3>
          <div>Valio has 640 l of your semi-skimmed. IBM Plex Sans, 15–16 px body.</div>
          <div className="mono">464306 · SU 15.11. 17.00 · Source Code Pro</div>
        </div>
      </Sec>
      <Sec t="Controls">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn primary">Approve</button>
          <button className="btn">Only 640 l</button>
          <button className="btn danger">Decline</button>
          <button className="fbtn"><I n="cal" s={14} /> This week <I n="down" s={13} /></button>
          <div className="stepper"><b>–</b><span>640</span><b>+</b></div>
          <span className="toggle on" /><span className="toggle" />
          <div className="seg"><span>Explain</span><span className="on">Just handle it</span></div>
        </div>
      </Sec>
      <Sec t="Status">
        <div className="row" style={{ gap: 8 }}>
          <Stamp k="order" /><Stamp k="ask" /><Stamp k="block" /><Stamp k="unknown" />
          <span style={{ width: 24 }} />
          <Price v={1.01} size={28} per="1,01 €/l" />
          <span className="pricetag"><Price v={1150.4} size={24} /></span>
        </div>
      </Sec>
      <Sec t="Patterns">
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
          <Composer go />
          <Board />
          <Tile title="Ordered without a person"><div className="big">86 %</div></Tile>
          <div className="callout red"><b>Cake base has no allergen data.</b> Pick one with a gluten-free claim.</div>
        </div>
      </Sec>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<System />);
