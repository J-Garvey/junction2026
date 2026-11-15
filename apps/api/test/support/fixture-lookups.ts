import { vi } from "vitest";

/** Keep catalogue alternatives outside a test's supplier pool explicitly
 * unavailable. Known fixtures still use production lookup and normalization. */
export function isolateFixtureLookups(adapter: typeof import("../../src/aimo/lookup.js")) {
  const lookup = adapter.lookup;
  const spy = vi.spyOn(adapter, "lookup").mockImplementation(async (ids, date, mode = adapter.dataMode()) => {
    if (mode.mode !== "fixture") throw new Error("This test only supports fixture supplier data");
    const fixture = adapter.loadFixture("base")!;
    const unique = [...new Set(ids)];
    const known = unique.filter((id) => fixture.availability[id] || fixture.price[id]);
    const result = await lookup(known, date, mode);
    const lines = new Map(result.lines.map((line) => [line.productId, line]));
    return { ...result, lines: unique.map((id) => lines.get(id) ?? adapter.normalise(
      id, undefined, undefined, "fixture", "Unavailable catalogue candidate (synthetic test fixture)", "2026-11-14T10:00:00Z",
    )) };
  });
  return () => spy.mockRestore();
}
