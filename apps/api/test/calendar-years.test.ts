import { describe, expect, it } from "vitest";
import { resolveDate } from "../src/agent/parse.js";

describe("stated delivery years must survive date resolution", () => {
  it.each([["16 Nov 2027", "2027-11-16"], ["29 Feb 2028", "2028-02-29"]])("retains the explicit year in %s", (text, expected) => {
    expect(resolveDate(text, new Date("2026-11-14T10:00:00Z")).date).toBe(expected);
  });

  it("clarifies an inferred leap day that does not exist in the next year", () => {
    expect(resolveDate("29 Feb", new Date("2028-11-14T10:00:00Z")).date).toBeNull();
  });
});
