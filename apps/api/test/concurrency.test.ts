import { describe, expect, it } from "vitest";
import { forEachConcurrent } from "../src/agent/concurrency.js";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

describe("independent item work", () => {
  it("starts independent items together, bounds concurrency and drains every item", async () => {
    const gates = Array.from({ length: 9 }, deferred);
    const started: number[] = [], finished: number[] = [];
    const run = forEachConcurrent(gates, 4, async (gate) => {
      const index = gates.indexOf(gate);
      started.push(index);
      await gate.promise;
      finished.push(index);
    });
    expect(started).toEqual([0, 1, 2, 3]);
    gates[2].resolve();
    await gates[2].promise;
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    gates.forEach((gate) => gate.resolve());
    await run;
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(finished.toSorted((a, b) => a - b)).toEqual(started);
  });

  it("stops scheduling on failure and waits for already active items before rejecting", async () => {
    const gate = deferred();
    const started: number[] = [];
    const error = new Error("item failed");
    let settled = false;
    const run = forEachConcurrent([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      if (item === 0) throw error;
      await gate.promise;
    });
    void run.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(settled).toBe(false);
    gate.resolve();
    await expect(run).rejects.toBe(error);
    expect(started).toEqual([0, 1]);
  });
});
