# Chunk 03: Quantities, packs and rounding

| | |
|---|---|
| **Owner** | Ben |
| **Track** | A: request to basket |
| **Needs from** | 01 (amounts per portion, guest and diet counts), 02 (the chosen product) |
| **Feeds** | 04 (viability), 06 (overshoot questions), 08 (order lines) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| CH-04 | P0 | Get my per-portion amounts as whole packs so that the order is something Valio Aimo can actually pick |
| CH-12 | P1 | Get one order line per product, with each dish's share visible, so that the order is clean but still traceable to my menu |

## How: what's already settled

- **The rounding policy is decided (D25):**
  1. Combine the same product across dishes, then round the total once.
  2. Round up to whole sales units by default. Never round down automatically.
  3. Among pack sizes of the same product with identical spec, pick the mix with the least overshoot.
  4. Overshoot within the hotel's tolerance goes through. Above it, one question to the Approver.
  5. Round down only when a person chooses it.
  6. Any buffer is added before rounding.
- **Use the API's sales unit**, not the catalogue's. [GROUND_TRUTH 3]
- **Litres or kg per pack** come from catalogue price ÷ comparison price when the API gives both, otherwise from `net × su_in_bu`, and then the line is amber. [GROUND_TRUTH 4.4]
- **The data's 0.01 lot size is ignored.** [D25]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `UNIT-CONVERT` | Deterministic code | An amount and its unit | The amount in kg, L or pieces | Convert g, kg, ml, dl, l and pieces. Never convert between weight and volume. | Q03.1, Q03.5 |
| `PACK-CONTENT` | Deterministic code | A product and its `LOOKUP` result | kg, L or pieces per sales unit, and whether that figure is verified | Prefer catalogue price ÷ comparison price. Fall back to the formula and mark the result unverified. | Edge cases |
| `NEED-TOTAL` | Deterministic code | The `Request`, the chosen products | Total need per product, with each dish's and diet group's share | Amount per portion × guests in each group. Combine identical product IDs. | Q03.3, Q03.6 |
| `PACK-ROUND` | Deterministic code | Total need, pack content, pack variants | Whole sales units to order, and the overshoot | Apply D25 in order: round the total once, round up, pick the best-fitting pack mix. | Q03.4 |
| `OVERSHOOT-CHECK` | Deterministic code | The overshoot, the tolerance from pre-answers | Pass, or an Approver question with three options | Ask only when both limits are exceeded. | Q03.2 |

## Questions to answer

**Q03.1 Which units can a recipe line use?**
- Recommended: g, kg, ml, dl, l and pieces. Everything is converted to kg, L or pieces before any maths. A "pieces" line needs a product sold by the piece or with a known count per pack.
- **Answer:** _open_

**Q03.2 What is the default overshoot tolerance?** Small lines always overshoot by a large percentage: needing 0.3 of a case means buying 1.
- Recommended: ask only when the overshoot is both more than 10% of the line **and** worth more than €25. Either one alone goes through. Both numbers live in the hotel's pre-answers (chunk 05).
- **Answer:** _open_

**Q03.3 When is the same product combined across diet groups?**
- Recommended: each diet group's lines are matched separately, so regular guests are never silently moved onto the lactose-free product. If two groups end up on the same product ID, their quantities are combined into one order line, with each group's share still shown.
- **Answer:** _open_

**Q03.4 How do we know two catalogue entries are "the same product in a different pack"?**
- Recommended: same vendor and brand, identical ingredient statement, identical allergens and claims, and they differ only in size. If any of that is missing or different, they are different products and a swap asks the chef. If no such pairs exist among the seed products, pack mixing is skipped for Junction.
- **Answer:** _open_

**Q03.5 What happens when the recipe's unit and the product's unit don't match?** For example grams of milk against a product sold in litres.
- Recommended: no density conversion. The line asks the chef to restate the amount in the product's unit.
- **Answer:** _open_

**Q03.6 Are recipe amounts as-purchased or as-served?**
- Recommended: as-purchased. Waste and yield factors are not in core.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The formula and the API disagree on pack content by more than 5% | Use the API's figure; the line is amber | _open_ |
| A product is only measured in the dairy unit ZML | Never use ZML in quantity maths; the line asks | _open_ |
| Pack content can't be worked out at all | The line is amber and asks; no order from a guessed size | _open_ |
| The total need for a line is 0 after a guest-count change | The line is removed and shown as removed in the diff (chunk 07) | _open_ |
| Exactly a whole number of packs is needed | No rounding and no overshoot shown | _open_ |
| A substitute has a different pack size from the original | Round again from the need, not from the old pack count | _open_ |

## Done when

- A product used in three dishes appears as one order line, rounded once, with each dish's share visible.
- A need of 1.5 cases orders 2 and shows the overshoot.
- An overshoot above the tolerance produces one Approver question with three options: accept, round down, switch pack.
