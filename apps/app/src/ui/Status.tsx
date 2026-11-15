/** Q10.2: one set of status labels, always words, never colour alone. */
import type { StatusLabel } from "@aimo/contracts";
import { ROLE_LABEL } from "../format";
import type { CoverageLevel } from "../api";

type Kind = StatusLabel | "fixture" | "ordered" | "needs_input";

const DEF: Record<Kind, { text: string; cls: string; warn?: boolean }> = {
  covered: { text: "Ready", cls: "order" },
  check: { text: "Check", cls: "ask" },
  not_available: { text: "Not available", cls: "block" },
  unknown_stock: { text: "Stock not confirmed", cls: "unknown" },
  covered_at_risk: { text: "Stock not confirmed", cls: "unknown" },
  waiting: { text: "Waiting", cls: "ask" },
  blocked: { text: "Blocked", cls: "block" },
  unresolved: { text: "Unresolved", cls: "block" },
  allergy_warning: { text: "Allergy warning", cls: "block", warn: true },
  fixture: { text: "Fixture", cls: "fixture" },
  ordered: { text: "Ordered", cls: "order" },
  needs_input: { text: "Needs input", cls: "ask" },
};

export function Status({ k, role, title, label }: { k: Kind; role?: string | null; title?: string; label?: string }) {
  const d = DEF[k] ?? { text: String(k), cls: "unknown" };
  const text = label ?? (k === "waiting" && role ? `Waiting for ${ROLE_LABEL[role]?.toLowerCase() === "approver" ? "the approver" : ROLE_LABEL[role]?.toLowerCase() === "chef" ? "the chef" : role}` : d.text);
  return (
    <span className={`stamp ${d.cls}`} title={title}>
      {d.warn && <span aria-hidden="true">⚠ </span>}
      {text}
    </span>
  );
}

/**
 * D34: a product whose stock Valio Aimo can't confirm is listed like any other match, with this
 * small marker. Its accessible name keeps the words, so it never reads as confirmed (D31).
 */
export function UnknownStockMark({ reason }: { reason?: "terminal_sentinel" | "stock_sentinel" | string }) {
  const why = reason === "terminal_sentinel" ? "ships from the supplier, so Valio Aimo reports no figure" : "Valio Aimo sent a placeholder figure";
  return (
    <span className="stock-unknown-mark" role="img" aria-label="Stock not confirmed" title={`Stock not confirmed: ${why}`}>
      ?
    </span>
  );
}

export const Fixture = ({ show = true, name }: { show?: boolean; name?: string | null }) =>
  show ? (
    <span className="stamp fixture" title={name ? `Saved fixture: ${name}` : "Seed or saved test data, not a live answer"}>
      Fixture
    </span>
  ) : null;

/** Plan status → a status label. */
export function planStatusKind(s: string): Kind {
  switch (s) {
    case "ordered":
      return "ordered";
    case "waiting":
      return "waiting";
    case "blocked":
    case "rejected":
    case "failed":
      return "blocked";
    case "needs_input":
      return "needs_input";
    case "kept_short":
      return "check";
    default:
      return "check";
  }
}
export const PLAN_STATUS_TEXT: Record<string, string> = {
  needs_input: "Needs input",
  viability: "Viability check",
  waiting: "Waiting for order decision",
  ordered: "Ordered",
  blocked: "Blocked",
  rejected: "Rejected",
  kept_short: "Ordered short",
  failed: "Failed",
};

export function CoverageLine({ level, text }: { level: CoverageLevel; text: string }) {
  const k: Kind = level === "covered" || level === "at_risk" ? "covered" : level === "warning" ? "allergy_warning" : level === "not_covered" ? "check" : "check";
  return (
    <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {level === "none" ? <span className="stamp unknown">Not ordered</span> : <Status k={k} />}
      {/* The stamp already names the state; show only the numbers after it. */}
      {(() => {
        const rest = text.replace(/^(Allergy warning|Covered|Ready|Blocked|Not ordered|Rejected)\s*(·\s*)?/i, "");
        return rest ? (
          <span className="small" style={{ color: "var(--ink)" }}>
            {rest}
          </span>
        ) : null;
      })()}
    </span>
  );
}

export const RuleChip = ({ id }: { id: string }) => <span className="rulechip mono">{id}</span>;
