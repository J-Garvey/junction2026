# Demo plan: Emma and Lauri's wedding

> **What this is:** the story for the three-minute demo video. It is separate from the PRD (D30): the PRD says what to build, this says what to show. Jack reviewed it on 14 Nov 2026; the rest of the team hasn't yet.
>
> **Format:** a recorded video, three minutes. Each beat is recorded as its own take and cut together.
>
> **How values are marked:** **real** means looked up in the catalogue or on the Valio Aimo mock on 14 Nov 2026. **Agreed** means decided by Jack or the team. **Proposed** means a number chosen to make the story work, which nobody has agreed.

## The story in one line

A hotel is catering a wedding. It books the food months ahead. Two weeks before, more guests are added, one of them a child with a nut allergy. Just before the cut-off a few guests drop out and one ingredient runs short. Three people each deal with their own part.

## Why this story

- **Hotels are Valio Aimo's largest customers**, and event orders are the ones with no template, so they take the most work. Valio Aimo told us this at their stand ([research/06](../research/06-valio-aimo-conversation-2026-11-14.md)).
- **Today the order goes in months ahead and changes on one phone call** with the Valio Aimo rep about 2–3 weeks out ([research/07](../research/07-hotel-event-ordering-journey.md)).
- **A wedding makes the stakes obvious.** A missing main course or an allergen on a child's plate needs no explaining.

## The people

| Name | Who | Their problem |
|---|---|---|
| **Aino** | Head chef at the hotel | "Can I make this menu from Valio Aimo, and will it all turn up?" |
| **Sanna** | Finance manager at the hotel | "I can't check every order, but an agent can't spend freely." |
| **Katri** | Account manager at Valio Aimo | "How do we let outside agents order without trusting their code?" |

Onni is a six-year-old guest, added two weeks before the wedding. None of these is a real person, and none shares a name with a Valio Aimo mentor. The hotel needs a made-up name that has been checked against real hotels.

## The fixed setup

| Variable | Value | Status |
|---|---|---|
| Guests at booking | 180 | Agreed |
| Diet groups at booking | 14 lactose-free, 6 gluten-free | Proposed |
| Service date | Tue 17 Nov 2026 | Agreed (chunk 11, Q11.2) |
| Delivery date | Mon 16 Nov 2026 | Real: the only date the mock returns |
| Valio Aimo's order cut-off | Sun 15 Nov, 17:00 | Real |

## The three minutes

| Time | Beat | Seat | Human taps |
|---|---|---|---|
| 0:00–0:18 | The problem, and why hotels | None | |
| 0:18–0:30 | Meet Aino, Sanna and Katri | All three | |
| 0:30–0:42 | Sanna's rules | Sanna | |
| 0:42–1:10 | **Booking**, months ahead | Aino | 1 |
| 1:10–1:45 | **First clarification**, two weeks before | Aino, then Sanna | 2 |
| 1:45–2:15 | **Second clarification**, before the cut-off | Aino | 1 |
| 2:15–2:38 | The safety drill | Katri | |
| 2:38–3:00 | The record, and close | Sanna, then Katri | |

That is 180 seconds, which allows about 420 words of voiceover.

## Sanna's rules (0:30–0:42)

One read-only page.

| Rule | Value | Status |
|---|---|---|
| Budget per order, before VAT | €1,600 | Proposed: just above the booking's total, so the booking needs no approval |
| Fish origin | Finland only | Agreed |
| Carbon | Shown on every line; blocks nothing | Agreed |
| Guest-count change that needs no question | 5%, rounded down (9 guests on a booking of 180) | Agreed: Darragh's answer to PRD question Q07.1 |

## Booking, months ahead (0:42–1:10)

**Clock:** mid-August.

Aino opens the wedding with the menu already entered, and adds one line in plain words: "Add 40 litres of lactose-free milk for the coffee service."

| Line | Need | Product | Line total | Shown as |
|---|---|---|---|---|
| Salmon main | 180 × 170 g = 30.6 kg | Kalavapriikki salmon fillet pieces, Finnish (469672), €29.84 per kg | €913 | Covered |
| Whipping cream | 45 L | Arla whipping cream 1 L, lactose-free (464727), €7.37 per litre | €332 | Covered |
| Dessert | 23 cakes → 4 cases of 6 | Frödinge princess cake (461653), €54.50 a case | €218 | Stock not confirmed |
| Coffee milk | 40 L | Arla lactose-free milk drink 1 L (469363), €2.48 per litre | €99 | Covered |
| **Order total** | | | **€1,562** | Inside the €1,600 budget |

Products and prices are real. Amounts per guest are proposed (0.25 L of cream a guest; 8 portions a cake).

**What the agent is seen doing:**

- **Reads:** turns the typed line into a quantity, a product need and a constraint, shown as chips Aino can edit.
- **Judges:** asks "is this plain drinking milk?", which rules out Arla Café milk, a coffee milk in the same category.
- **Decides:**
  - Sanna's Finnish-fish rule removes the Norwegian salmon (461814), even though it is cheaper at €27.39 per kg.
  - One Finnish fillet (461955) shows as "not available": it has a price but no delivery dates.
  - Stock plays no part in the verdicts this far ahead.

**Why Arla's milk is picked over Valio's own.** The two are the same on carbon (1.1, a product-group average), origin (Finland) and label. Valio's Eila (464306) is cheaper at €1.01 per litre and has a known delivery reliability of 1.0. The only thing in Arla's favour is that its stock is confirmed (384), where Valio's is not. Our ranking puts confirmed stock first, so the screen says so: "Arla: stock confirmed. Valio Eila: cheaper, stock not confirmed." Valio Aimo's own data also lists this Arla milk as a substitute for Eila.

**Human tap 1, Aino:** a question, not a warning. "Valio Aimo can't confirm stock for the princess cake, because it ships from the supplier. Continue with it?" She can continue or pick another. She continues.

**Then:** the order is inside Sanna's rules, so it is placed with no approval.

## First clarification, two weeks before (1:10–1:45)

**Clock:** Fri 30 Oct (chunk 11's agreed date; about two and a half weeks before).

| What changes | From → to | Status |
|---|---|---|
| Guests | 180 → 194 (+14, +7.8%) | Proposed: outside the 5% tolerance, which allows 9 |
| New allergy | Onni, one of the new guests, tree nuts | Agreed |

**What the agent does:**

- Re-runs the order and shows the whole list with the changed lines coloured. Salmon rises to 33.0 kg, cream to 49 L.
- Re-checks every line against the new allergy. The princess cake contains almond and tree nuts (real). There is no approve button.

**Human tap 2, Aino:** she replaces the cake. The chef answers first, so Sanna is only asked about the final order. Three real candidates, none with nuts listed as "contains" or "may contain". Darragh's allergy rule (PRD question Q02.3) also fails a product that lists the allergen as "undeclared"; that field isn't in our slim data, so each candidate still has to be checked against the raw catalogue:

| Candidate | Price | Stock |
|---|---|---|
| Rollfoods cloudberry caramel cake, Finnish (465051) | €47.31 a case | Not confirmed |
| Puratos cheesecake 5 kg (463727) | €62.79 each | 4 |
| Brander gluten-free strawberry curd cake (464235) | €41.45 a case | 6 cases |

**Human tap 3, Sanna:** one card. The change is bigger than 5%, and the new total is over the €1,600 budget. With the original cake the total would be about €1,717; the exact figure depends on which dessert Aino picks. She approves.

## Second clarification, before the cut-off (1:45–2:15)

**Clock:** Sat 14 Nov, 17:00, which is 24 hours before Valio Aimo's cut-off.

| What changes | From → to | Status |
|---|---|---|
| Guests | 194 → 188 (6 no-shows, −3.1%) | Proposed: inside the tolerance, which allows 9, so nobody is asked |

**What the agent does:**

- Applies the smaller guest count and shows the coloured list. No question.
- Runs the final check, which nobody starts:

| Line | Need | Real stock | Result |
|---|---|---|---|
| Salmon | 32.0 kg | 311 kg | Passes |
| Coffee milk | 40 L | 384 | Passes |
| Whipping cream | 47 L | 37 | **Short by 10** |
| Dessert | | Not confirmed | Accepted at booking |

**Human tap 4, Aino:** she picks between two substitutes, shown side by side with the original, with the cut-off as the deadline:

| Substitute | Price | Stock |
|---|---|---|
| Valio whipping cream 1 L UHT, lactose-free (464194) | €3.91 per litre | Not confirmed |
| Valio food service whipping cream 1.75 L, lactose-free (465193) | €3.33 per litre | Not confirmed |

**Result line (wording proposed):** "Ready for Tuesday. Valio Aimo can't confirm stock on 2 lines."

## The safety drill (2:15–2:38)

| Variable | Value | Status |
|---|---|---|
| Who acts | A script posing as an outside agent, started on purpose | Agreed |
| What it sends | An order over €1,600 with no approval attached | Proposed |
| Gateway's answer | Refused, naming the budget rule | Agreed |

The line: "Our agent stays inside Sanna's rules. Katri shouldn't have to take our word for it."

## The record, and close (2:38–3:00)

| Shown | Value |
|---|---|
| Human taps | 4: Aino continues with unconfirmed stock, Aino replaces the cake, Sanna approves the bigger order, Aino picks a cream |
| Sanna's view | Every step, with the rule behind it and each model judgement with its confidence |
| Katri's view | The order, the approval and the refusal. No recipes, no guest list, and nothing about Onni |

## Showing how it works

A small strip stays on screen for the whole video, with three lights. The light for whichever part is working comes on.

| Light | What it is | Example in the story |
|---|---|---|
| **Reads** | A language model turns what Aino typed into a structured request | "Add 40 litres of lactose-free milk…" becomes quantity, product, constraint |
| **Judges** | Gemini's decision model answers narrow yes/no questions and says how sure it is | "Is this plain drinking milk?" answered with a confidence, for example 0.94 (an illustrative figure) |
| **Decides** | Plain rules decide everything that matters: allergens, money, stock. The same input always gives the same answer | The almond in the cake, the budget, the short cream |

The line for the video: **"AI reads and judges. Rules decide."**

Don't call the decision model deterministic. It returns a probability, not a guarantee, and Valio Aimo's technical judges will know that. The deterministic part is the rules.

## Where this differs from the PRD

The stock question in this plan (Aino is asked and can continue) is now also the PRD's rule, as decision D31.

| In this plan | In the PRD today |
|---|---|
| "Finnish fish only" is shown | Story CH-16, which is P1, not P0 |
| Carbon is shown on each line | An add-on (VA-A3, PF-A1) with no owner. The data is a product-group average for about 63% of products and must be labelled that way |
| The Reads, Judges, Decides strip | Not in any story |
| A button that starts the safety drill | Not in any story. The refusal behind it (VA-04) is P0 |

## What has to work on camera

| Owner | Must work |
|---|---|
| **Pavit** | Search and lookup on the live mock, including the origin filter. Quote. Order from a quote. Amending an order. The over-budget refusal for the safety drill |
| **Darragh** | Line verdicts, including "not available". The tolerance and budget rules behind Sanna's card. The allergy re-check with no approve button. The final check and the shortfall. Finding substitutes |
| **Jack** | Sanna's rules page, read-only. Request chips. The stock question, the approval card and the substitute card. The event page with the coloured list. The seat label and switcher. The strip. The safety-drill button |
| **Ben** | Whole-pack rounding. The audit with two views and the count of taps. The wedding as seed data, the clock and the reset command |

## If the build slips, cut in this order

1. Carbon on each line.
2. The "not available" salmon.
3. The six no-shows.
4. The choice between two creams. The final check would then only flag the short line.

The four to protect: the plain-words line, the booking placed inside Sanna's rules, the gateway refusal, and the audit.

## Still to decide

| Question | Who |
|---|---|
| Whether a Saturday wedding is worth changing the agreed clock for | Ben |
| The menu's other lines, the recipes and the amounts per guest | Ben and Jack |
| The exact budget, once the booking's real total is known | Ben, with Darragh |
| Which dessert Aino swaps to, and whether she swaps it for everyone or adds one nut-free dessert for Onni | Jack |
| The final wording of the result line | Jack |
| Who records, who narrates, and when recording starts | Team |
| The hotel's name | Jack |

## To ask Valio Aimo

- Does a customer or Valio Aimo ever set Valio's own products as the default choice? In our ranking Valio's milk loses to Arla's only because its stock isn't confirmed.
- What do the placeholder stock figures in the mock stand for in the real system?
