import type { StageProcessing } from "@aimo/contracts";
import { Pop } from "./Popover";

const MILESTONES: Record<StageProcessing["milestone"], string> = {
  review_ready: "Ready for review",
  chef_input: "Chef input needed",
  approval_ready: "Ready for approval",
  blocked: "Blocked result",
  ordered: "Order placed",
  rejected: "Rejected result",
  failed: "Processing failed",
  viability_checked: "Viability checked",
  change_applied: "Change applied",
  change_checked: "Change checked",
  final_checked: "Final check complete",
};

const seconds = (ms: number) => ms < 10 ? "<0.01 s" : `${(ms / 1000).toFixed(2)} s`;

/** Saved measurements only: opening details or rendering never starts a timer. */
export function ProcessingTime({ processing }: { processing?: StageProcessing }) {
  if (!processing || !Number.isFinite(processing.totalMs) || processing.totalMs < 0) return null;
  return (
    <Pop className="small muted" label={`${processing.stage} · ${MILESTONES[processing.milestone]} · ${seconds(processing.totalMs)} processing`}>
      <div className="stack" style={{ marginTop: 8 }}>
        <span>Measured from submission to the saved result shown above, before sending it to the browser. Human review and approval waiting time is excluded.</span>
        <span>{processing.segments} processing {processing.segments === 1 ? "call" : "calls"}{processing.parsingMs !== undefined ? " after message parsing" : ""}; resumed decisions add only their processing time.</span>
        {processing.parsingMs !== undefined ? (
          <span>Message parsing: {seconds(processing.parsingMs)}. Subsequent processing, including quote creation when needed: {seconds(processing.totalMs - processing.parsingMs)}.</span>
        ) : (
          <span>Starts at the submitted request or change. Earlier message parsing was not recorded for this stage.</span>
        )}
        <span>This milestone was recorded when processing finished. Reading a saved result does not measure it again.</span>
      </div>
    </Pop>
  );
}
