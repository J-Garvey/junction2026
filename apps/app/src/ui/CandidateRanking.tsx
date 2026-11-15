import type { Candidate } from "@aimo/contracts";
import { eur, qty } from "../format";

export function CandidateRanking({ candidate: c }: { candidate: Candidate }) {
  return <span>{c.rankStep}.{c.costToCover
    ? ` ${qty(c.costToCover.quantity)} ${c.salesUnit ?? "sales units"} · ${eur(c.costToCover.totalExVat)} ex VAT to cover ${qty(c.costToCover.need)} pcs, rounded to whole packs.`
    : c.costToCover === null ? c.unitPrice === null ? " Price unavailable; cost to cover the need is unknown." : " Cost to cover the need is unknown; enter a sales quantity if selected."
    : ` ${eur(c.pricePerBase)} per ${c.baseUnit ?? "unit"}, ex VAT.`}</span>;
}
