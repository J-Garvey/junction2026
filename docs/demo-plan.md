# Demo plan: Emma and Lauri's wedding

> **What this is:** the story for the three-minute demo video. It is separate from the PRD (D30): the PRD says what to build, this says what to show. Jack reviewed it on 14 Nov 2026; the rest of the team hasn't yet.
>
> **Format:** a recorded video, three minutes. The team records it, with different people taking different parts. Each beat is its own take, cut together.
>
> **How values are marked:** **real** means read from the catalogue or looked up on the Valio Aimo mock on 14 Nov 2026. **Agreed** means decided by Jack or the team. **Set for the story** means chosen so the story works; these are Aino's recipe amounts and Sanna's rule values, which in real use the hotel would enter.

## ESSENTIAL: jobs to be done before recording

Added 15 Nov. **Pavit left the team on 15 Nov.** Everything that was his is now shared by the group: Jack, Darragh and Ben. A shared item that has to be built still needs one named person before work starts; the ranking job below went to Darragh. These are the jobs the video can't be recorded without. Each one is somebody's, and each has a check that says it is done. The full detail is in [demo-deliverables.md](demo-deliverables.md) under the item numbers given.

| Who | Job (ESSENTIAL) | Why it is needed | Done when |
|---|---|---|---|
| **Darragh** | **Let the chef continue past missing allergen data, and keep it marked** (B23, decision D35). Change rule ALG-03 from a stop to a question, for missing declarations only | The wedding's potatoes have no allergen declaration, so today they stop on Onni's allergy and the first clarification can't go the way the story tells it | After Onni's allergy is added, the potatoes produce a question that can be continued past. A product listing the allergen under "contains" or "may contain" is still blocked. A test asserts both |
| **Jack** | **Build the card and the label for that question** (B23) | The concern has to stay visible after the chef continues, the same way unconfirmed stock does | Aino sees one question naming the product, the allergen and the number of guests. After she continues, "allergen data not confirmed" shows on the event page, the order, the result line and the audit |
| **Darragh** (took it over from Pavit) | **Rank lines counted in pieces on the cost to cover the need** (B24, decision D36) | On price per kg the agent offers the Fazer caramel cake first, though it costs more for the event. The story has Aino choose the Elonen raspberry pastry cake | With Onni's allergy added, the replacement card offers the Elonen cake (473522) first, at 5 cases and €310.60, and the Fazer cake (466509) second, at 13 cases and €316.42. Lines in kg or L rank as before. A test asserts both |
| **Ben** | **Re-record the fixtures and update the tests that those two jobs change** | The wedding has to give the same result twice from a fresh Reset, or takes recorded at different times won't match | The full test suite passes, and two runs from Reset produce the same orders and the same totals |
| **Jack** | **Bring this plan in line with the build** (B21) | The figures and wording below were written before the build settled. The voiceover is read from this file | Every figure in this plan can be read off the running app: the ranking under D34, no vendor named for the model, the potatoes' question, the coffee case on Sanna's first card, and the finished wedding order as Katri's record |
| **Everyone** | **Verify your own items on the running app** (B1 to B20) | 478 tests pass, but nine built items have no test, and no test shows how a screen looks on camera | Each item's check in demo-deliverables.md has been done by its owner after a Reset |

Order: Darragh (both of his jobs) and Jack (the card) first, in parallel. Then Ben. Then Jack's update of this plan. Then everyone verifies, and the team records.

## The story in one line

A hotel is catering a wedding. It books the food months ahead. Two weeks before, more guests are added, one of them a child with a nut allergy. Just before the cut-off a few guests drop out and one ingredient runs short. Three people each deal with their own part.

## Why this story

- **Hotels are Valio Aimo's largest customers**, and event orders are the ones with no template, so they take the most work. Valio Aimo told us this at their stand ([research/06](../research/06-valio-aimo-conversation-2026-11-14.md)).
- **Today the order goes in months ahead and changes on one phone call** with the Valio Aimo rep about 2–3 weeks out ([research/07](../research/07-hotel-event-ordering-journey.md)).
- **A wedding makes the stakes obvious.** A missing main course or an allergen on a child's plate needs no explaining.

## The people

| Name | Who | Their problem |
|---|---|---|
| **Aino** | Head chef at Demo Hotel | "Can I make this menu from Valio Aimo, and will it all turn up?" |
| **Sanna** | Finance manager at Demo Hotel | "I can't check every order, but an agent can't spend freely." |
| **Katri** | Account manager at Valio Aimo | "How do we let outside agents order without trusting their code?" |

Onni is a six-year-old guest, added two weeks before the wedding. None of these is a real person, and none shares a name with a Valio Aimo mentor.

## The fixed setup

| Variable | Value | Status |
|---|---|---|
| Hotel | Demo Hotel | Agreed |
| Guests at booking | 180 | Agreed |
| Service date | Tue 17 Nov 2026 | Agreed (PRD chunk 11, Q11.2) |
| Delivery date | Mon 16 Nov 2026 | Real: the only date the mock returns |
| Cut-off for most lines | Sun 15 Nov, 17:00 | Real |
| Cut-off for lines shipped by the supplier (the cake, the sparkling) | Thu 12 Nov, 15:00 and 12:30 | Real |

## The three minutes

| Time | Beat | Seat | What a person decides |
|---|---|---|---|
| 0:00–0:18 | The problem, and why hotels | None | |
| 0:18–0:30 | Meet Aino, Sanna and Katri | All three | |
| 0:30–0:40 | Sanna's rules | Sanna | |
| 0:40–1:08 | **Booking**, months ahead | Aino, then Sanna | Aino: continue with unconfirmed stock. Sanna: approve the booking |
| 1:08–1:42 | **First clarification**, two weeks before | Aino, then Sanna | Aino: replace the cake. Sanna: approve the changes |
| 1:42–2:10 | **Second clarification**, before the cut-off | Aino | Aino: pick a cream. The no-shows need nobody |
| 2:10–2:30 | The safety drill | Katri | |
| 2:30–3:00 | The sale record, and close | Sanna briefly, then Katri | |

That is 180 seconds, which allows about 420 words of voiceover.

### Whose seat, in order

1. **Sanna** sets the rules. This is brief, so that her later approvals make sense.
2. **Aino** books the wedding.
3. **Sanna** approves the booking.
4. **Aino** handles the extra guests and the allergy.
5. **Sanna** approves the changes.
6. **Aino** handles the no-shows and the short cream. Nobody else is needed.
7. **Katri** sees the sale as Valio Aimo received it, next to the drill order her gateway refused.

## Sanna's rules (0:30–0:40)

One read-only page. All values are set for the story.

| Rule | Value |
|---|---|
| Budget per order, before VAT | €1,950 |
| Fish origin | Finland only |
| Carbon | Shown on every line; blocks nothing |
| Guest-count change that needs no question | 5%, rounded down (Darragh's answer to PRD question Q07.1). That is 9 guests on a booking of 180 |
| Unconfirmed stock | Always ask the person building the order |

## The menu

Seven lines, every one a real catalogue product with a real price. Where the pack is sold in pieces, the amount is one piece a guest. The other amounts are Aino's recipe, set for the story.

| Line | Product | ID | Sold as | Price | Amount per guest |
|---|---|---|---|---|---|
| Salmon main | Kalavapriikki salmon fillet pieces, ASC, 10 × 170 g, Finnish | 469672 | per kg | €29.84 per kg | One 170 g piece (from the pack) |
| Potatoes | Button potato, washed, 30–35 mm, Finnish | 460541 | case of 15 kg | €10.54 a case | 200 g (recipe) |
| Whipping cream | Arla whipping cream 1 L, lactose-free | 464727 | 1 L | €7.37 | 0.25 L (recipe). Aino's recipe names this cream |
| Dessert | Reuter & Stolt princess cake, 15 pieces × 100 g, Finnish | 467767 | case of 15 | €34.58 a case | One piece (from the pack) |
| Coffee | Paulig Juhla Mokka, dark roast, 44 × 100 g | 460617 | case of 4.4 kg | €75.90 a case | 10 g (recipe) |
| Coffee milk | Valio Eila semi-skimmed milk drink 1 L, lactose-free | 464306 | 1 L | €1.01 | 40 L in total, typed by Aino |
| Toast, from the bar | Codorniu Sparkling Zero, 75 cl | 477125 | case of 6 bottles | €36.76 a case | One glass, six glasses a bottle (recipe) |

The bar line means the event has two outlets, the kitchen and the bar.

## Booking, months ahead (0:40–1:08)

**Clock:** mid-August.

Aino opens the wedding with the menu entered, and adds the milk in plain words: "Add 40 litres of lactose-free milk for the coffee service."

| Line | Need for 180 guests | Ordered | Line total | Stock |
|---|---|---|---|---|
| Salmon | 30.6 kg | 31 kg | €925.04 | 311 kg |
| Potatoes | 36 kg | 3 cases (45 kg) | €31.62 | Not confirmed |
| Whipping cream | 45 L | 45 | €331.65 | 37 |
| Princess cake | 180 pieces | 12 cases (180) | €414.96 | Not confirmed |
| Coffee | 1.8 kg | 1 case (4.4 kg) | €75.90 | 164 cases |
| Coffee milk | 40 L | 40 | €40.40 | Not confirmed |
| Sparkling | 30 bottles | 5 cases (30) | €183.80 | Not confirmed |
| **Order total** | | | **€2,003.37** | |

Prices and stock are real. Stock is shown for information: this far ahead it plays no part in whether a line is covered.

One thing the data doesn't settle: the salmon comes in packs of 10 pieces (1.7 kg), but the mock sells and prices it per kg. The plan orders whole kilograms. If it has to be whole packs, 180 pieces is exactly 18 packs (30.6 kg) and the totals move by a few euros.

**What the agent is seen doing:**

- **Reads:** turns the typed line into a quantity, a product need and a constraint, shown as chips Aino can edit.
- **Judges:** asks "is this plain drinking milk?", which rules out Arla Café milk, a coffee milk in the same category.
- **Decides:**
  - Sanna's Finnish-fish rule removes the Norwegian salmon (461814), even though it is cheaper at €27.39 per kg.
  - One Finnish fillet (461955) shows as "not available": it has a price but no delivery dates.
  - For each line the agent picks the product that is best on recipe match, delivery reliability and price. Stock is only the last tie-breaker (PRD decision D32).

**Why Valio's own milk is picked, though its stock isn't confirmed.** Of the 34 lactose-free products in the milk category that can be delivered, Valio's Eila is the best on delivery reliability (1.0) and price (€1.01 per litre). Arla's milk has confirmed stock (384) but costs €2.48 and has no reliability figure. Milk is perishable, so today's stock says nothing about a delivery three months away. The agent picks Eila and asks about the stock; it doesn't let stock alone hand the line to a product costing more than twice as much.

**Aino decides:** one question covering four lines, not a warning. "Valio Aimo can't confirm stock for the potatoes, the princess cake, the sparkling or the milk. Continue with them?" She can continue, or pick others line by line. She continues.

**Sanna approves:** one card. "The order total of €2,003.37 is €53.37 over your €1,950 limit." She approves, and the order is placed.

## First clarification, two weeks before (1:08–1:42)

**Clock:** Fri 30 Oct (the PRD's agreed date; about two and a half weeks before).

| What changes | From → to | Why it matters |
|---|---|---|
| Guests | 180 → 194 (+14, +7.8%) | More than the 9 guests Sanna's rule allows |
| New allergy | Onni, one of the new guests, tree nuts | The princess cake contains almond |

**What the agent does:**

- Re-runs the order and shows the whole list with the changed lines coloured.
- Re-checks every line against the new allergy and stops on the cake. There is no approve button.

**A catch worth showing.** The catalogue lists this princess cake as both "free from tree nuts" and "contains almond", and almond is a tree nut. The agent never lets a "free from" entry outweigh a "contains" entry, so the cake fails.

**Aino decides:** she replaces the cake for everyone with the Elonen raspberry pastry cake, 40 pieces (473522). It is Finnish, sold in pieces like the original, and the catalogue declares it free from tree nuts and from peanuts. Its stock is not confirmed, which the card shows; choosing it is her answer.

| Line | Before | After | Line total |
|---|---|---|---|
| Salmon | 31 kg | 33 kg | €984.72 |
| Potatoes | 3 cases | 3 cases (no change) | €31.62 |
| Whipping cream | 45 | 49 | €361.13 |
| Dessert | 12 cases of princess cake | 5 cases of raspberry pastry cake (200 pieces) | €310.60 |
| Coffee | 1 case | 1 case (no change) | €75.90 |
| Coffee milk | 40 | 40 (no change) | €40.40 |
| Sparkling | 5 cases | 6 cases (36 bottles for 33 needed) | €220.56 |
| **Order total** | €2,003.37 | | **€2,024.93** |

**Sanna approves:** one card for the changes. "14 more guests than booked (+7.8%). The new total of €2,024.93 is €74.93 over your €1,950 limit." Her first approval no longer counts, because the order changed. She approves.

## Second clarification, before the cut-off (1:42–2:10)

**Clock:** Sat 14 Nov, 17:00, which is 24 hours before the main cut-off. The cake and the sparkling were locked on Thu 12 Nov, when their own cut-off passed.

| What changes | From → to | Why it matters |
|---|---|---|
| Guests | 194 → 188 (6 no-shows, −3.1%) | Inside the 9 guests Sanna's rule allows, so nobody is asked |

**What the agent does:**

- Applies the smaller guest count and shows the coloured list: salmon goes from 33 kg to 32 kg, cream from 49 to 47. No question. This is where the video shows the agent acting alone: a change inside Sanna's rules needs nobody.
- Runs the final check, which nobody starts:

| Line | Ordered | Real stock | Result |
|---|---|---|---|
| Salmon | 32 kg | 311 kg | Passes |
| Coffee | 1 case | 164 cases | Passes |
| Whipping cream | 47 | 37 | **Short by 10** |
| Potatoes, cake, sparkling, milk | | Not confirmed | Already continued |

**Aino decides:** she picks between two substitutes for the missing 10 litres, shown side by side with the original, with the cut-off as the deadline:

| Substitute | Price | Stock |
|---|---|---|
| Valio whipping cream 1 L UHT, lactose-free (464194) | €3.91 per litre | Not confirmed |
| Valio food service whipping cream 1.75 L, lactose-free (465193) | €3.33 per litre | Not confirmed |

She keeps the 37 litres of Arla and takes 10 litres of the Valio 1 L (€39.10). The final order comes to €1,945.75, which is back under Sanna's €1,950.

**Result line (wording proposed):** "Ready for Tuesday. Valio Aimo can't confirm stock on 5 lines." The five are the potatoes, the raspberry cake, the sparkling, the milk and the Valio cream.

## The safety drill (2:10–2:30)

| Variable | Value |
|---|---|
| Who acts | A script posing as an outside agent, started on purpose |
| What it sends | An order over €1,950 with no approval attached |
| Gateway's answer | Refused, naming the budget rule |

**How it's started:** a demo-only control, shown as a pop-up and made to look obviously separate from the app. It is labelled as not part of the product. It exists only so the video can show a real refusal.

The line: "Our agent stays inside Sanna's rules. Katri shouldn't have to take our word for it."

## The sale record, and close (2:30–3:00)

The video ends on Katri's seat, because the judges are from Valio Aimo.

Sanna's view comes first, briefly: every step, with the rule behind it and each model judgement with its confidence.

Then Katri's sale record: a brief still picture of a report, not a designed screen, labelled as an illustration. It uses the wedding's own figures, set out under headings that each say what the information is and why Valio Aimo would want it:

| Heading | What it holds, from the wedding | Why it matters to Valio Aimo |
|---|---|---|
| **Customer and delivery** | Demo Hotel, one site, delivery Mon 16 Nov 2026 | Who to deliver to, and when |
| **Order lines** | Eight products (the seven menu lines, with the cream split across two) with quantities and fixed prices; final total €1,945.75 before VAT | What to pick and what to invoice |
| **Authority** | Sanna's two approvals, each tied to the exact order it covered, and the hotel's €1,950 limit | Proof the order was authorised, if it is ever disputed |
| **Changes** | Booked in August; changed on 30 Oct (180 to 194 guests, dessert replaced); changed on 14 Nov (194 to 188, cream substituted) | Why the order differs from the booking, without a phone call to the rep |
| **Stock not confirmed** | Five lines the hotel chose to continue with | What the rep may want to check before picking |
| **Refused** | The drill order, with the rule that stopped it | That the gateway enforces the hotel's limits itself |
| **Not included** | Recipes, the guest list, and anything about Onni's allergy | The hotel's own information stays with the hotel |

**What the voiceover says about the sale record:** this isn't a screen we designed. It is the kind of information that flows into your sales system, and it can be tailored to it.

**Use the wedding order's own figures in the picture.** They cost nothing extra, and different numbers twenty seconds after the order was on screen would be noticed.

**The video doesn't quote a number of taps or decisions.** With two approvals from Sanna and three choices from Aino, the count isn't a strong figure. The closing line is about what the record proves. Proposed: "One wedding, three rounds of changes. Nothing was ordered that someone didn't decide, and every decision is on record for both sides."

## Showing how it works

A small strip stays on screen for the whole video, with three lights. The light for whichever part is working comes on.

| Light | What it is | Example in the story |
|---|---|---|
| **Reads** | A language model turns what Aino typed into a structured request | "Add 40 litres of lactose-free milk…" becomes quantity, product, constraint |
| **Judges** | Gemini's decision model answers narrow yes/no questions and says how sure it is | "Is this plain drinking milk?" answered with a confidence, for example 0.94 (an illustrative figure) |
| **Decides** | Plain rules decide everything that matters: allergens, money, stock. The same input always gives the same answer | The almond in the cake, the budget, the short cream |

The line for the video: **"AI reads and judges. Rules decide."**

Don't call the decision model deterministic. It returns a probability, not a guarantee, and Valio Aimo's technical judges will know that. The deterministic part is the rules.

## Showing speed and accuracy

Both are shown inside the beats above, as figures on screen. Neither adds time.

### Speed

- **A timer on every agent step**, measured by the product while it runs and never typed in. For example: "95 salmon products checked in 1.2 s."
- **A total for each stage**: the time from Aino's request to an order ready for approval.
- **What it replaces, said in the voiceover**: today the change at two weeks is a phone call to the Valio Aimo rep.

What we measured on 14 Nov, against the live mock, for the lookup alone:

| Lookup | Time |
|---|---|
| Stock for 95 salmon products | 0.42 s |
| Prices for the same 95 | 0.80 s |
| Stock for 1,000 products, the most one call allows | 0.80 s |

These include starting the script, and they don't include our own matching, rules or the model calls. The figures in the video must come from the finished product at recording time.

**We have no figure for how long this takes by hand today.** No chef has answered that question yet. So the video shouldn't claim "ten times faster" or similar. If someone gets a number from a chef before recording, use it and say where it came from.

### Accuracy

Shown as the things the agent gets right that a quick search would get wrong, each with its real count:

| Moment | What is shown | Figures |
|---|---|---|
| Choosing the salmon | A funnel on screen. Each step can be clicked to show the reasoning behind it | 95 products with "salmon" in the name → 50 Finnish → 36 of those deliverable → 3 plain salmon fillets → 1 sold as 170 g pieces |
| The "not available" fillet | A product with a price that can't be delivered | 41 of the 95 salmon products can't be delivered |
| The coffee milk | Coffee milks and soured milks left out of "milk", then the best of what remains | Of 34 deliverable lactose-free products in the category, Valio's Eila is the best on reliability and price |
| Onni's allergy | A contradiction in the data, caught | The cake is listed both "free from tree nuts" and "contains almond" |
| The replacement cake | A declared free-from, not just an absence | Declared free from tree nuts and from peanuts |
| Quantities | Whole packs, worked out exactly | 180 pieces is 12 cases of 15; 194 pieces is 5 cases of 40, with 6 spare |
| Every figure | Tap any number to see where it came from | |

**The funnel has to open.** Showing the numbers isn't enough: a click on any step shows why the number dropped, with the rule that was applied and the products it removed. In the video one step is clicked briefly; all of them have to work.

| Step | What the click shows |
|---|---|
| 95 → 50 | Sanna's rule, "fish from Finland only", and the 45 it removed: 25 Norwegian, 10 Dutch, 5 Polish and 5 from elsewhere |
| 50 → 36 | The 14 Finnish products that have a price but no delivery dates, so they can't be delivered |
| 36 → 3 | The 33 that have "salmon" in the name but aren't plain salmon fillet: soups, casseroles, pies, sandwiches, smoked and cured salmon, and a jar of baby food. This is the decision model's judgement, shown with its confidence |
| 3 → 1 | Aino's recipe asks for 170 g pieces. One product is sold that way. The other two are whole fillets, cheaper per kg (€16.65 and €20.74), and are offered as alternatives if the kitchen portions the fish itself |

The count of 3 plain fillets comes from reading the 36 product names by hand. The decision model has to reach the same answer in the product.

In the story Aino never corrects a product or a quantity the agent chose. That is the brief's own test: "least manual correction".

**We have not measured accuracy over a set of test requests.** The video shows correct handling of the cases in the story, and shouldn't quote a percentage unless someone runs that test first.

## Where this differs from the PRD

| In this plan | In the PRD today |
|---|---|
| "Finnish fish only" is shown | Story CH-16, which is P1, not P0 |
| Carbon is shown on each line | An add-on (VA-A3, PF-A1) with no owner. The data is a product-group average for about 63% of products and must be labelled that way |
| A timer on each agent step, and the salmon funnel | The timer and the funnel aren't in any story. Opening the reasoning behind a number is story UI-05, which is P0 |
| The Reads, Judges, Decides strip | Not in any story |
| A demo-only control that starts the safety drill | Deliberately not part of the product, and made to look that way. The refusal it triggers (VA-04) is real and P0 |
| Katri's sale record | A still picture for the video, labelled as an illustration. Nothing is built for it. In the PRD, Valio Aimo gets a view of the audit (chunk 09), and a screen for the rep is an add-on (VA-A2) |

## What has to work on camera

| Owner | Must work |
|---|---|
| **The group** (was Pavit's) | Search and lookup on the live mock, including the origin filter. Quote. Order from a quote, with the approval attached. Amending an order. The over-budget refusal for the safety drill. The time each lookup took |
| **Darragh** | Line verdicts, including "not available". The budget rule behind Sanna's first card, and the tolerance rule behind her second. The allergy re-check with no approve button, where "contains" beats "free from". The final check and the shortfall. Finding substitutes. For the salmon funnel, the count at each step, the rule applied and the products it removed |
| **Jack** | Sanna's rules page, read-only. Request chips. The stock question, the two approval cards and the substitute card. The event page with the coloured list. The seat label and switcher. The strip and the timer. The funnel, with each step opening its reasoning on a click. The demo-only drill control. A still picture of Katri's sale record |
| **Ben** | Whole-pack rounding. The audit with two views. The wedding above as seed data, the clock and the reset command |

## If the build slips, cut in this order

1. Carbon on each line.
2. The "not available" salmon.
3. The six no-shows.
4. The choice between two creams. The final check would then only flag the short line.

The four to protect: the plain-words line, the booking with Sanna's approval, the gateway refusal, and Katri's sale record.

## Still open

| Question | Who |
|---|---|
| The final wording of the result line and the closing line | Jack |
| Who takes which part of the recording, and when it starts | Team |

## To ask Valio Aimo

- Does a customer or Valio Aimo ever set Valio's own products as the default choice? Under our ranking Valio's milk now wins on reliability and price, but a default would settle cases where it doesn't.
- What do the placeholder stock figures in the mock stand for in the real system?
