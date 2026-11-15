import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagePreparation } from "../src/messagePreparation";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

describe("preparing a request while typing", () => {
  it("debounces rapid edits and prepares only the latest trimmed input", async () => {
    const prepare = vi.fn().mockResolvedValue({ ok: true });
    const draft = new MessagePreparation(prepare);
    draft.update("10 kg chic");
    await vi.advanceTimersByTimeAsync(400);
    draft.update(" 10 kg chicken burger ");
    await vi.advanceTimersByTimeAsync(599);
    expect(prepare).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(prepare).toHaveBeenCalledExactlyOnceWith("10 kg chicken burger", expect.any(AbortSignal));
    draft.update("10 kg chicken burger");
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).toHaveBeenCalledTimes(1);
    draft.dispose();
  });

  it("keeps one request in flight and replaces queued obsolete drafts", async () => {
    const pending = deferred();
    const prepare = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue({ ok: true });
    const draft = new MessagePreparation(prepare);
    draft.update("milk");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("milk and butter");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("milk and butter without nuts");
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(prepare.mock.calls.map(([text]) => text)).toEqual(["milk", "milk and butter without nuts"]);
    draft.dispose();
  });

  it("cancels scheduled and queued preparation when submitting or clearing", async () => {
    const pending = deferred();
    const prepare = vi.fn().mockReturnValue(pending.promise);
    const draft = new MessagePreparation(prepare);
    draft.update("milk");
    draft.update("");
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).not.toHaveBeenCalled();
    draft.update("milk");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("butter");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("");
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(prepare).toHaveBeenCalledTimes(1);
    // Submission can share current server work: it never waits for this queue.
    expect(prepare.mock.calls[0][1].aborted).toBe(false);
    draft.dispose();
  });

  it("ignores preparation failures and can prepare a later edit", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true });
    const draft = new MessagePreparation(prepare);
    draft.update("milk");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("butter");
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).toHaveBeenCalledTimes(2);
    draft.dispose();
  });

  it("aborts on unmount and never starts queued work afterward", async () => {
    const pending = deferred();
    const prepare = vi.fn().mockReturnValue(pending.promise);
    const draft = new MessagePreparation(prepare);
    draft.update("milk");
    await vi.advanceTimersByTimeAsync(600);
    draft.update("butter");
    await vi.advanceTimersByTimeAsync(600);
    draft.dispose();
    expect(prepare.mock.calls[0][1].aborted).toBe(true);
    pending.resolve();
    draft.update("salmon");
    await vi.advanceTimersByTimeAsync(600);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("skips empty, short and oversized drafts", async () => {
    const prepare = vi.fn();
    const draft = new MessagePreparation(prepare);
    for (const text of ["", "  ", "mi", "x".repeat(2001)]) {
      draft.update(text);
      await vi.advanceTimersByTimeAsync(600);
    }
    expect(prepare).not.toHaveBeenCalled();
    draft.dispose();
  });
});
