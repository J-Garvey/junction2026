// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StageProcessing } from "@aimo/contracts";
import { ProcessingTime } from "../src/ui/ProcessingTime";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const measured: StageProcessing = { stage: "Event change", totalMs: 1250, parsingMs: 250, segments: 2, milestone: "approval_ready" };

describe("saved stage processing display", () => {
  it("shows the measured result once and makes its boundaries keyboard-accessible", async () => {
    const user = userEvent.setup();
    render(<ProcessingTime processing={measured} />);
    const summary = screen.getByRole("button", { name: "Event change · Ready for approval · 1.25 s processing" });
    await user.tab();
    expect(document.activeElement).toBe(summary);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Human review and approval waiting time is excluded/)).toBeTruthy();
    expect(screen.getByText(/Message parsing: 0.25 s/)).toBeTruthy();
    expect(screen.getByText(/including quote creation when needed: 1.00 s/)).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(summary);
  });

  it.each([
    ["blocked", "Blocked result"], ["chef_input", "Chef input needed"],
    ["failed", "Processing failed"], ["change_applied", "Change applied"],
    ["final_checked", "Final check complete"], ["ordered", "Order placed"],
  ] as const)("labels %s with the actual milestone", (milestone, label) => {
    render(<ProcessingTime processing={{ ...measured, milestone }} />);
    expect(screen.getByText(`Event change · ${label} · 1.25 s processing`)).toBeTruthy();
    expect(screen.queryByText(/Ready for approval/)).toBeNull();
  });

  it("keeps the saved value across rerenders/reloads and omits missing legacy timing", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(100_000);
    const { rerender, unmount } = render(<ProcessingTime processing={measured} />);
    now.mockReturnValue(200_000);
    rerender(<ProcessingTime processing={{ ...measured }} />);
    expect(screen.getByText(/1.25 s processing/)).toBeTruthy();
    unmount();
    render(<ProcessingTime processing={JSON.parse(JSON.stringify(measured))} />);
    expect(screen.getAllByText(/1.25 s processing/)).toHaveLength(1);
    cleanup();
    render(<ProcessingTime />);
    expect(screen.queryByText(/processing/)).toBeNull();
  });

  it("explains partial scope when parsing was not measured", async () => {
    const user = userEvent.setup();
    render(<ProcessingTime processing={{ ...measured, parsingMs: undefined }} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/Earlier message parsing was not recorded/)).toBeTruthy();
    expect(screen.queryByText(/Message parsing:/)).toBeNull();
  });
});
