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

/**
 * Category chips for an ambiguous word: "pepper" finds ground spice and fresh peppers, "water"
 * finds mineral water and tonic. With products from two or more ranges, a chip per range narrows
 * the list; with one range there are no chips.
 */
export function useCategoryFilter<T extends { categoryLabel?: string }>(items: T[]) {
  const [picked, setPicked] = useState<string | null>(null);
  const counts = new Map<string, number>();
  for (const item of items) if (item.categoryLabel) counts.set(item.categoryLabel, (counts.get(item.categoryLabel) ?? 0) + 1);
  const ranges = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const active = picked && counts.has(picked) ? picked : null;
  const filtered = active ? items.filter((item) => item.categoryLabel === active) : items;
  const chips = ranges.length > 1 ? (
    <div className="category-chips" role="group" aria-label="Narrow by range">
      <button type="button" className="chip" aria-pressed={!active} onClick={() => setPicked(null)}>All {items.length}</button>
      {ranges.map(([label, n]) => (
        <button key={label} type="button" className="chip" aria-pressed={active === label} onClick={() => setPicked(active === label ? null : label)}>{label} {n}</button>
      ))}
    </div>
  ) : null;
  return { filtered, chips };
}
