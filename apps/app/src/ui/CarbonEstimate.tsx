import { carbonEstimateKg, type CarbonBasis } from "@aimo/contracts";
import { qty } from "../format";

/** Read saved evidence only. Never trust a legacy co2Kg total without its mass basis. */
export function CarbonEstimate({ line, shared = false }: {
  line: { quantity: number; carbonBasis?: CarbonBasis | null; removed?: boolean };
  shared?: boolean;
}) {
  const estimate = line.removed ? null : carbonEstimateKg(line.quantity, line.carbonBasis);
  return <span className="small muted" style={{ display: "block", whiteSpace: "normal" }}>
    {estimate == null
      ? `No carbon estimate${line.removed ? " · removed line" : ""}`
      : `${estimate > 0 && estimate < 0.01 ? "< 0,01" : `≈ ${qty(estimate)}`} kg CO₂e · product-group average${shared ? " · whole shared line" : ""}`}
  </span>;
}
