/** UI-05: tap a price, quantity or status to see where it came from. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Candidate, FiredRule, ModelJudgement, PlanLine, StockFact } from "@aimo/contracts";
import { eur, qty, when, day, fi } from "../format";
import { Fixture } from "./Status";
import { get } from "../api";

export function Pop({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const dialogId = useId();
  function close() {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);
  return (
    <span
      className={`popwrap ${className ?? ""}`}
      ref={ref}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button ref={triggerRef} id={triggerId} type="button" className="poptrigger" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-controls={open ? dialogId : undefined} aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div id={dialogId} className="popover" role="dialog" aria-labelledby={triggerId}>
          <button ref={closeRef} type="button" className="popclose" onClick={close} aria-label="Close">
            ×
          </button>
          {children}
        </div>
      )}
    </span>
  );
}

export const stockText = (s: StockFact | null | undefined, unit?: string | null) => {
  if (!s) return "Not checked";
  if (s.kind === "known") return `${qty(s.amount)} ${unit ?? ""} in stock`.trim();
  if (s.kind === "none") return "None available";
  return s.reason === "terminal_sentinel" ? "Unknown: ships from the supplier (999999 placeholder)" : "Unknown: Valio Aimo sent a placeholder figure";
};

export function RulesList({ rules }: { rules: FiredRule[] }) {
  if (!rules.length) return null;
  return (
    <div className="popsec">
      <div className="pophead">Rules</div>
      {rules.map((r, i) => (
        <div key={i} className="poprule">
          <span>{r.message}</span>
          {r.facts && Object.keys(r.facts).length > 0 && (
            <div className="popfacts mono">
              {Object.entries(r.facts)
                .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                .join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Judgements({ items }: { items: (ModelJudgement | null | undefined)[] }) {
  const js = items.filter(Boolean) as ModelJudgement[];
  if (!js.length) return null;
  return (
    <div className="popsec">
      <div className="pophead">Model checks</div>
      {js.map((j, i) => (
        <div key={i} className="small">
          <div style={{ color: "var(--ink)" }}>{j.question}</div>
          <div className="muted">
            {j.fn} · answer {j.verdict} · probability {j.probability == null ? "none" : fi(j.probability, 2)} · fact at {fi(j.threshold.fact, 2)}, reject at {fi(j.threshold.reject, 2)} · source {j.source.replace("_", " ")}
            {j.model ? ` (${j.model})` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Everything known about one plan line. */
export function LineSource({ line, judgements }: { line: PlanLine; judgements?: ModelJudgement[] }) {
  return (
    <>
      <div className="popsec">
        <div className="pophead">{line.productName}</div>
        <div className="small muted mono">{line.productId ?? "no product"}</div>
        {line.productId && <BrandLine productId={line.productId} />}
      </div>
      <div className="popsec">
        <div className="pophead">Pack maths</div>
        <dl className="kv small">
          <dt>Need</dt>
          <dd>
            {qty(line.needAmount.value)} {line.needAmount.unit}
          </dd>
          <dt>Per pack</dt>
          <dd>
            {line.packContent ? (
              <>
                {qty(line.packContent.value)} {line.packContent.unit} <span className="muted">({line.packContent.source}{line.packContent.verified ? ", checked" : ", not checked"})</span>
              </>
            ) : (
              "Unknown"
            )}
          </dd>
          <dt>Order</dt>
          <dd>
            {line.quantity} {line.salesUnit ?? ""}
          </dd>
          {line.overshoot && (
            <>
              <dt>Overshoot</dt>
              <dd>
                {qty(line.overshoot.amount)} {line.needAmount.unit} ({fi(line.overshoot.pct, 1)} %, {eur(line.overshoot.eur)})
              </dd>
            </>
          )}
          {line.shares.length > 1 && (
            <>
              <dt>Shared by</dt>
              <dd>
                {line.shares.map((s) => (
                  <div key={s.needId}>
                    {s.label}: {qty(s.amount)}
                  </div>
                ))}
              </dd>
            </>
          )}
        </dl>
      </div>
      <div className="popsec">
        <div className="pophead">
          Price and stock <Fixture show={line.source === "fixture"} />
        </div>
        <dl className="kv small">
          <dt>Price</dt>
          <dd>
            {eur(line.unitPrice)} / {line.salesUnit ?? "unit"} <span className="muted">catalogPrice, ex VAT, {line.source ?? "not checked"}</span>
          </dd>
          <dt>Line</dt>
          <dd>{eur(line.lineTotal)}</dd>
          <dt>Stock</dt>
          <dd>{stockText(line.stock, line.salesUnit)}</dd>
          <dt>Delivery</dt>
          <dd>{day(line.availableDate)}</dd>
          <dt>Cut-off</dt>
          <dd>{when(line.closingTime)}</dd>
          <dt>Reliability</dt>
          <dd>{line.reliability == null ? "Unknown" : `${fi(line.reliability * 100, 1)} %`}</dd>
          {line.rankStep && (
            <>
              <dt>Chosen by</dt>
              <dd>{line.rankStep}</dd>
            </>
          )}
          {line.riskAccepted && (
            <>
              <dt>Risk</dt>
              <dd>
                Accepted by {line.riskAccepted.by}, {when(line.riskAccepted.at)}
              </dd>
            </>
          )}
        </dl>
      </div>
      <RulesList rules={line.rules} />
      <Judgements items={judgements ?? []} />
    </>
  );
}

export function CandidateSource({ c }: { c: Candidate }) {
  return (
    <>
      <div className="popsec">
        <div className="pophead">{c.name}</div>
        <div className="small muted">
          Rank {c.rank} ({c.label}), decided by: <b>{c.rankStep}</b>
        </div>
      </div>
      <div className="popsec">
        <dl className="kv small">
          <dt>Price</dt>
          <dd>
            {eur(c.unitPrice)} / {c.salesUnit ?? "unit"} <Fixture show={c.source === "fixture"} />
          </dd>
          <dt>Per {c.baseUnit ?? "unit"}</dt>
          <dd>{eur(c.pricePerBase)}</dd>
          <dt>Per pack</dt>
          <dd>{c.packContent ? `${qty(c.packContent.value)} ${c.packContent.unit} (${c.packContent.source})` : "Unknown"}</dd>
          <dt>Stock</dt>
          <dd>{stockText(c.stock, c.salesUnit)}</dd>
          <dt>Reliability</dt>
          <dd>{c.reliability == null ? "Unknown" : `${fi(c.reliability * 100, 1)} %`}</dd>
          <dt>Cut-off</dt>
          <dd>{when(c.closingTime)}</dd>
        </dl>
      </div>
      <RulesList rules={c.notes} />
      <Judgements items={[c.judgement]} />
    </>
  );
}

type BrandResp = { brand: { domain: string | null; country: string | null; logo: string | null } | null };
const brandCache = new Map<string, Promise<BrandResp | null>>();

/** Supplier brand from context.dev (external web data, not Valio Aimo's catalogue). */
function BrandLine({ productId }: { productId: string }) {
  const [b, setB] = useState<BrandResp["brand"] | undefined>(undefined);
  useEffect(() => {
    if (!brandCache.has(productId)) brandCache.set(productId, get<BrandResp>(`/gateway/v1/products/${productId}/brand`).catch(() => null));
    let live = true;
    brandCache.get(productId)!.then((r) => live && setB(r?.brand ?? null));
    return () => {
      live = false;
    };
  }, [productId]);
  if (!b?.domain) return null;
  return (
    <div className="row small muted" style={{ gap: 6, marginTop: 4 }} title="Brand data from context.dev">
      {b.logo && <img src={b.logo} alt="" style={{ height: 14, maxWidth: 48, objectFit: "contain" }} />}
      <span>
        {b.domain}
        {b.country ? ` · ${b.country}` : ""}
      </span>
    </div>
  );
}
