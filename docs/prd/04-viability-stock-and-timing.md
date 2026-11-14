# Chunk 04: Viability, stock and timing

| | |
|---|---|
| **Owner** | _unassigned_ |
| **Track** | A: request to basket |
| **Needs from** | 02 (candidates), 03 (pack quantities), 11 (the simulated clock) |
| **Feeds** | 06 (questions), 07 (the final check uses the same stock and cut-off rules) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| CH-02 | P0 | See every line as green, amber or red months ahead so that I know whether I can realistically make the menu from Valio Aimo goods |
| CH-05 | P0 | Still see products with unknown stock, flagged as unknown and needing approval, so that I keep options without ever mistaking them for confirmed stock |
| CH-17 | P1 | Have delivery planned for when prep starts, including thawing, not just for the service date, so that frozen and long-prep items arrive in time |
| SF-07 | P0 | Use real stock straight away when the delivery date is inside the lead time so that urgent requests are checked against what can actually ship |
| AP-14 | P1 | Be asked when lines can't all arrive on one agreed delivery day so that I choose between a split delivery and a different product |

## How: what's already settled

- **Months ahead, each line is green, amber or red, and stock plays no part.** [D7]
  - Green: in the catalogue, deliverable, passes diet and allergen rules by claim, priced, pack size verified.
  - Amber: reliability unknown or below 0.95, pack size guessed, or only a substitute matches.
  - Red: nothing passes the diet rules, or nothing is deliverable.
- **Stock counts only close to delivery.** Until then it is shown as "today's stock, not a promise for your date". [D8]
- **Inside the lead time, real stock is used straight away** (SF-07). This is what the milk request needs.
- **Unknown stock is suggested, never confirmed** (D23). It ranks below real stock, is labelled, and needs the Approver to accept the risk. At the final check it reads "covered at risk".
- **A past cut-off is always caught by us**, because the mock still shows a Monday delivery after a cut-off has passed. [GROUND_TRUTH 3]
- **Delivery is planned for when prep starts**, including thawing, not for the service date. [CH-17]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `NEEDED-BY` | Deterministic code | Service date, temperature class, delivery days, holidays | The needed-by date | Step back for prep and thawing, then back to an agreed delivery day. | Q04.3, Q04.4 |
| `URGENCY-CHECK` | Deterministic code | Needed-by date, the clock | Urgent or not | Urgent when the needed-by date is 4 days or fewer away. | Q04.1 |
| `STOCK-CHECK` | Deterministic code | Quantity, the `LOOKUP` result | Enough, partial (with the amount), none or unknown | Never treat unknown as enough. | Q04.6 |
| `CUTOFF-CHECK` | Deterministic code | The cut-off from `LOOKUP`, the clock | Open (with time left) or passed | Decide from the cut-off time itself, never from the mock's delivery date. | Edge cases |
| `LINE-VERDICT` | Deterministic code | Everything above for one line | Green, amber or red, with reasons | Months ahead, ignore stock. When urgent, include `STOCK-CHECK` and `CUTOFF-CHECK`. | Q04.5 |
| `DELIVERY-ALIGN` | Deterministic code | Available dates and needed-by dates of all lines | One delivery date, or a question with the options | Offer the options in the agreed order. | Q04.7 |

## Questions to answer

**Q04.1 What exactly is "inside the lead time"?** Lead times run from next day to about 4 days, and the mock always answers for next Monday.
- Recommended: a request is urgent when its needed-by date is 4 days or fewer from the clock's "now". Urgent requests skip the stock-blind step and get the full check at once.
- **Answer:** _open_

**Q04.2 When is the price fixed for an order placed months ahead?**
- Recommended: at the moment the order is placed, from the quote (the brief says fixed prices). If the price's `validTo` is before the delivery date, that is a question to the Approver, as the approval rules already say.
- **Answer:** _open_

**Q04.3 What is the default needed-by date?**
- Recommended: one day before the service date for chilled and ambient goods, two days before for frozen (temperature class 7), so there is time to thaw. A recipe line can override it.
- **Answer:** _open_

**Q04.4 Which days can the hotel receive deliveries, and which holidays count?**
- Recommended: the mandate fixture lists Monday to Friday as agreed delivery days, plus a short list of Finnish public holidays for the test period. A needed-by date that falls on any other day moves to the delivery day before it, and that move is shown.
- **Answer:** _open_

**Q04.5 Does very poor delivery reliability do more than turn a line amber?** Twelve products have a reliability of 0.0.
- Recommended: below 0.80, the line also raises a question when the order is placed: "This product was delivered as ordered only X% of the time. Order it anyway?"
- **Answer:** _open_

**Q04.6 Once the Approver accepts unknown stock, does the final check ask again?**
- Recommended: no. The acceptance stays with the line. The final check restates it as "covered at risk, accepted by [person] on [date]". It asks again only if the product or quantity changed.
- **Answer:** _open_

**Q04.7 What are the options when lines can't all arrive on one day?** (AP-14)
- Recommended, offered in this order on one card:
  1. Take the latest of the dates, if it is still on or before the needed-by date.
  2. Switch the late line to another product that arrives in time.
  3. Accept two deliveries, recorded as two linked orders, since the API can't express a split.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| Stock amount is 0 and there is no available date | Treated as not available now; amber months ahead, a shortfall when urgent | _open_ |
| Real stock covers part of the need | Partial availability: a partial-fill question (chunk 06) | _open_ |
| `salesBlock` is true (never seen in the mock) | Not deliverable | _open_ |
| The service date is a Sunday or a holiday | Needed-by moves back to the last agreed delivery day | _open_ |
| The chef changes a dish after viability ran | Only the changed lines are re-checked; the rest keep their verdict | _open_ |
| A line is green months ahead and red at the final check | It enters the shortfall flow in chunk 07 | _open_ |

## Done when

- The seed event shows at least one green, one amber and one red line months ahead, each with its reason.
- The milk request "by Monday" is checked against real stock at once.
- A Terminal product appears as "unknown stock" and never as available.
- A frozen line's delivery is planned two days before service.
