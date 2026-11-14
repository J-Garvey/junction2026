# Chunk 07: Changes, substitutes and the final check

| | |
|---|---|
| **Owner** | Darragh |
| **Track** | B: trust core |
| **Needs from** | 02 (ranking), 04 (stock and cut-off rules), 06 (questions), 08 (amendments) |
| **Feeds** | 09 (audit), 10 (the diff view and the "covered" summary) |

This chunk is scenes 3 and 4: the change about 2–3 weeks out, and the automatic check before the cut-off.

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| CH-06 | P0 | Judge a substitute side by side with one yes/no question so that I can decide fast whether my dish still works |
| CH-07 | P0 | Update guest and diet counts and see the full order with every change colour-coded so that I check the changes in context without redoing the order |
| CH-08 | P0 | See the cut-off as the deadline on any final-check question so that I know how long I have to answer |
| CH-11 | P1 | Have a substitute I approved remembered for that recipe, and be told each time it's used, so that I'm never asked twice but never surprised |
| CH-13 | P1 | Have every line re-checked when a new allergy arrives so that nothing unsafe stays in the order |
| CH-14 | P1 | Get a one-line "covered" when the final check passes so that I know the event is safe without opening anything |
| AP-08 | P1 | Have small changes at the 2–3-week point applied without me so that the clarification call disappears for normal changes |
| AP-10 | P1 | Have unanswered lines flagged to me and our Valio Aimo rep at the cut-off so that both sides know before picking |
| VA-12 | P1 | Send unresolved-at-cut-off flags to the rep so that they can call the hotel before picking |
| UI-11 | P1 | Get one "all covered" summary instead of a notification per line so that an alert always means action |

## How: what's already settled

- **A change re-runs the same pipeline** with the new guest and diet counts and shows the full order, compact, with every changed line colour-coded. [D4, CH-07]
- **Changes inside the tolerance are applied with no human.** Others become one question. [AP-08]
- **A new allergy re-checks every line.** A line that now fails is blocked. [CH-13]
- **The final check runs automatically** a set time before each line's cut-off: stock, delivery date, price validity, cut-off. If everything passes, one "covered" line and no human. [D8]
- **Any substitute that is a different product asks the Chef**, with a side-by-side and one yes/no question. Only the same product in a different pack needs nobody. [D6]
- **A yes is remembered** for that recipe and product pair, and the chef is told each time it's used. [D6, CH-11]
- **Silence never changes the order.** At the cut-off an unanswered line stays as last approved and is flagged to the Approver and the Valio Aimo rep. [D9]
- **The cut-off is the deadline on every final-check question.** [CH-08]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `ORDER-DIFF` | Deterministic code | The placed order, the re-run result | Per line: added, removed, up, down, unchanged or needs a substitute | Compare by product ID. | Edge cases |
| `CHANGE-APPLY` | Deterministic code | The diff, the tolerance | An amendment applied, or one question | Apply within tolerance. Otherwise ask. | Q07.1 |
| `ALLERGY-RECHECK` | Deterministic code | New constraints, the placed order | The lines that now fail, and the warning state | Warn at once. If nobody resolves it by the cut-off, the order goes ahead with the warning (D28). | Q07.9, Q07.10 |
| `FINAL-CHECK` | Deterministic code | An order, the clock | Covered, or a list of shortfalls | Run 24 hours before each cut-off: `LOOKUP`, `STOCK-CHECK`, `CUTOFF-CHECK` and price validity. | Q07.2 |
| `SHORTFALL-RESOLVE` | Deterministic code | A short line | Fixed, or a question | Try the fixes in the agreed order. | Q07.3 |
| `SUBSTITUTE-FIND` | Deterministic code | The original product, the event's constraints | Up to three candidates | Listed substitutes first. Every candidate must pass `DIET-FILTER` and `TYPE-CHECK`. | Q07.4 |
| `SUBSTITUTE-CLOSENESS` | Decisions API, score (optional) | The original's and a candidate's spec, the dish | A closeness score per candidate | Only orders the candidates the chef sees. The chef still decides. | Q07.4 |
| `SPEC-COMPARE` | Deterministic code | Two products | Side-by-side rows with the differences marked | Built from the data only. | Q07.5 |
| `APPROVAL-RECALL` | Deterministic code | Recipe, original product, substitute | A remembered yes, or none | Void if the substitute's spec has changed. | Q07.6 |
| `SILENCE-RESOLVE` | Deterministic code | The questions still open at a cut-off | The order unchanged, and flags to the Approver and the rep | Never change the order. | Q07.8 |
| `COVERAGE-SUMMARY` | Deterministic code | The order's state | One summary line | Never "covered" alone while a line is at risk or carries a warning. | Q07.7 |

**Decisions API calls in this chunk.** The question wording is a recommendation for the owner to settle.

| Function | Question type | Question asked | If unsure or unreachable |
|---|---|---|---|
| `SUBSTITUTE-CLOSENESS` | score on a rubric | "How close is this product to the original for use in [dish]?", with both specs | Order by nutrient distance only |

## Questions to answer

**Q07.1 What is the default tolerance for a guest-count change?**
- Recommended: up to ±5% of guests goes through with no question, as long as every changed line still passes its rules and the order stays under the spend cap. Decreases reduce the order automatically within the same tolerance.
- **Answer:** _open_

**Q07.2 When exactly does the final check run?**
- Recommended: 24 hours before each cut-off. Lines that share a cut-off are checked together. In the test cases there is one run, started by moving the clock.
- **Answer:** _open_

**Q07.3 In what order does the agent try to fix a shortfall?**
- Recommended:
  1. The same product in another pack size: applied, no human.
  2. A substitute the chef already approved for this recipe: applied, chef notified.
  3. Up to three substitutes ranked best, better, good: one question to the chef.
  4. A partial fill: one question to the Approver.
  5. Otherwise the line is unresolved and shown at the top of the event.
- **Answer:** _open_

**Q07.4 How are substitute candidates chosen and ordered?**
- Recommended: start with the data's own listed substitutes where they exist (188 products have them). Then products of the same type and category that pass every event constraint. Order them by closeness to the original (fat, protein and sugar per 100 g, then same brand), then by the normal ranking in chunk 02.
- **Answer:** _open_

**Q07.5 What fields does the side-by-side show?** A chef hasn't yet confirmed these are enough.
- Recommended: ingredient statement, fat, protein and sugar per 100 g, claims, allergens, pack size, price per kg or L, delivery reliability. Differences are highlighted; identical rows are collapsed.
- **Answer:** _open_

**Q07.6 How long does a remembered approval last, and what cancels it?**
- Recommended: it lasts until the chef removes it, and it applies within the outlet that gave it. It is cancelled automatically if the substitute's ingredient statement, allergens or claims change.
- **Answer:** _open_

**Q07.7 What does the hotel see when the final check finishes?**
- Recommended: one of three summaries per event, and never "covered" alone while anything is at risk:
  - "Covered."
  - "Covered, 2 lines at risk (unknown stock)."
  - "Not covered: 1 line needs an answer by Sun 17:00."
- **Answer:** _open_

**Q07.8 What reaches the Valio Aimo rep at the cut-off, and how?** (VA-12)
- Recommended: one audit entry per unresolved line, tagged for Valio Aimo, with the product, quantity, what was short and when the hotel was asked. A screen for the rep is an add-on.
- **Answer:** _open_

**Q07.9 A new allergy makes an already-ordered line unsafe, and nobody answers. What happens?** Two decisions collide here: "silence never changes the order" (D9) and "no hard-rule violation reaches an order" (D14).
- Recommended: this is the one case that doesn't wait for the cut-off.
  - The event shows "Not covered: unsafe line" at once, to the chef, the Approver and the rep.
  - The agent still doesn't remove the line by itself. Either role can remove or replace it with one tap.
  - If it is still there at the cut-off, the flag to the rep says "hotel has not confirmed; line conflicts with a stated allergy".
- **Answer:** **Ruled** (Jack, 14 Nov, recorded as D28). The order goes ahead unchanged, with a big warning that is impossible to miss. The warning starts the moment the conflict is found and stays until someone resolves it. The agent never removes the line by itself. The recommendation above is replaced by this ruling.

**Q07.10 Where does the allergy warning appear, and what does it say?** D28 asks for it to be very, very visible.
- Recommended: in every one of these places, in the same words, until it is resolved:
  - a banner at the top of home for the chef and the Approver of that outlet;
  - a banner at the top of the event page;
  - on the line itself in the order, the receipt and the change view;
  - in the summary, which reads "Warning: 1 line conflicts with a stated allergy", never "covered";
  - in the audit, and in the flag sent to the Valio Aimo rep at the cut-off.
- Recommended wording: "[Product] contains [allergen]. [N] guests at [event] must avoid it. This line is still in the order." with two buttons: remove the line, or replace it.
- **Answer:** **Agreed** (Jack, team review 14 Nov): the warning shows in every place listed, in the same words, until it is resolved. An allergy conflict is a major concern and has to be shown consistently everywhere. The wording is still for the owner to finalise.

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The guest count drops but pack rounding means no pack changes | Shown as "no change"; nothing is asked | _open_ |
| The guest count rises after a line's cut-off | That line can't change; the shortfall is a new urgent request | _open_ |
| A late allergy conflict is resolved after the cut-off | The order can't change; the warning stays and says the delivery will include the product | _open_ |
| A new diet group has no passing product for one dish | That dish's line for the group is red; the chef changes the dish | _open_ |
| A substitute passes with the chef but costs more than the price tolerance | Chef first, then one Approver question | _open_ |
| The price changed between order and final check | A price question to the Approver unless a pre-answer covers it | _open_ |
| Real stock equals the need exactly | Passes | _open_ |
| The final check itself can't reach the API | Nothing is marked covered; the event shows "check failed, retrying" and the cut-off deadline | _open_ |

## Done when

- Raising guests from 500 to 510 shows the full order with only the changed lines coloured, and no question.
- Raising guests to 600 produces one Approver question.
- At the final check, a short line produces a chef card with a side-by-side and the cut-off as deadline.
- Answering yes, then hitting the same shortfall again, applies the substitute with a notice and no question.
- Leaving a question unanswered past the cut-off leaves the order unchanged and writes a flag for both sides.
