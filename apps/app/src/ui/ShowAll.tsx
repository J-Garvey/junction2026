import { useState } from "react";

/**
 * The first few items of a list, and a button that loads the rest. A list of products is never cut
 * short for good: "Show all 12" reveals every one, and "Show fewer" folds them away again.
 */
export function useShowAll<T>(items: T[], initial: number, noun = "") {
  const [all, setAll] = useState(false);
  const extra = items.length > initial;
  const visible = all || !extra ? items : items.slice(0, initial);
  const toggle = extra ? (
    <button type="button" className="linkbtn small show-all" aria-expanded={all} onClick={() => setAll(!all)}>
      {all ? "Show fewer" : `Show all ${items.length}${noun ? ` ${noun}` : ""}`}
    </button>
  ) : null;
  return { visible, toggle, hidden: items.length - visible.length };
}
