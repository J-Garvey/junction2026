# Demo plan: Emma and Lauri's wedding

> **What this is:** the story for the three-minute demo video. It is separate from the PRD (D30): the PRD says what to build, this says what to show.
>
> **Brought in line with the build on 15 Nov 2026**, at commit `8143bb3`. Every stage below is what the app does today, as asserted by the end-to-end tests (56 test files, 882 tests, all passing at `a808b5c`). Where a figure is worked out from prices and not asserted by a test, it says so.
>
> **Format:** a recorded video, three minutes. The team records it, with different people taking different parts. Each beat is its own take, cut together.
>
> For wording that is safe to say, and what not to say, use [pitch-knowledge-base.md](pitch-knowledge-base.md).
>
> The latest recording checks and verified fixture totals are in [demo-verification.md](demo-verification.md).

## Where the essential jobs stand

| Job | Who | State |
|---|---|---|
| Let the chef continue past missing allergen data, and keep it marked (B23, D35) | Darragh, Jack | **Done.** Built and tested |
| Rank lines counted in pieces on the cost to cover the need (B24, D36) | Darragh | **Done.** Built and tested |
| Re-record the fixtures and update the tests | Ben | **Done.** The full suite passes |
| Bring this plan in line with the build (B21) | Jack | **Done** in this version |
| Verify your own items on the running app | Everyone | **Still to do.** See [demo-deliverables.md](demo-deliverables.md) |
| Record | Team | **Still to do** |

Pavit left the team on 15 Nov; what was his is shared by the group.

## The story in one line

A hotel is catering a wedding. It books the food months ahead. Two weeks before, more guests are added, one of them a child with a nut allergy. Just before the cut-off a few guests drop out and one ingredient runs short. Three people each deal with their own part.

## Why this story

- **Hotels are Valio Aimo's largest customers**, and event orders are the ones with no template. Valio Aimo told us this at their stand ([research/06](../research/06-valio-aimo-conversation-2026-11-14.md)).
- **Today the order goes in months ahead and changes on one phone call** with the Valio Aimo rep about 2–3 weeks out ([research/07](../research/07-hotel-event-ordering-journey.md)).
- **A hotel chef confirmed the sequence**: the guest is consulted, the kitchen settles the menu, the finance manager approves, then it goes to the wholesaler ([research/08](../research/08-interview-owen-bar-events.md)).
- **A wedding makes the stakes obvious.** An allergen on a child's plate needs no explaining.

## The people

| Name | Who | Their problem |
|---|---|---|
| **Aino** | Head chef at Demo Hotel | "Can I make this menu from Valio Aimo, and will it all turn up?" |
| **Sanna** | Finance manager at Demo Hotel | "I can't check every order, but an agent can't spend freely." |
| **Katri** | Account manager at Valio Aimo | "How do we let outside agents order without trusting their code?" |

Onni is a six-year-old guest, added two weeks before the wedding. None of these is a real person. The seed data also has Mikko (bar manager) and Jonas (F&B director), who aren't in the story.

## The fixed setup

| Variable | Value |
|---|---|
| Guests at booking | 180 |
| Service date | Tue 17 Nov 2026 |
| Delivery date | Mon 16 Nov 2026, the only date the mock returns |
| Cut-off for most lines | Sun 15 Nov, 17:00 |
| Cut-off for lines shipped by the supplier | Thu 12 Nov |
| Clock, per stage | 14 Aug · Fri 30 Oct · Sat 14 Nov 17:00 |

## The three minutes

| Time | Beat | Seat | What a person decides |
|---|---|---|---|
| 0:00–0:18 | The problem, and why hotels | None | |
| 0:18–0:30 | Meet Aino, Sanna and Katri | All three | |
| 0:30–0:40 | Sanna's rules | Sanna | |
| 0:40–1:08 | **Booking**, months ahead | Aino, then Sanna | Aino: continue with unconfirmed stock. Sanna: approve the booking |
| 1:08–1:42 | **First clarification**, two weeks before | Aino, then Sanna | Aino: replace the cake and the sparkling; continue with the potatoes. Sanna: approve the changes |
| 1:42–2:10 | **Second clarification**, before the cut-off | Aino | Aino: confirm the smaller count; pick a cream |
| 2:10–2:30 | The safety drill | Katri | |
| 2:30–3:00 | The signed record, and close | Katri | |

That is 180 seconds, about 420 words of voiceover. The first clarification is the fullest beat: it now has three things for Aino. If it runs long, see "If time is short".

### Whose seat, in order

1. **Sanna** sets the rules. Brief.
2. **Aino** books the wedding.
3. **Sanna** approves the booking.
4. **Aino** handles the extra guests and the allergy.
5. **Sanna** approves the changes.
6. **Aino** confirms the no-shows and handles the short cream.
7. **Katri** sees the signed order, next to the drill order her gateway refused.

## Sanna's rules (0:30–0:40)

One read-only page.

| Rule | Value |
|---|---|
| Budget per order, before VAT | €1,950 |
| Guest-count change that needs no approval | 5% |
| Rounding overshoot that needs no approval | Up to 10%, or up to €25 |
| Price rise that needs no approval | 5% |
| Unconfirmed stock | Always ask the person building the order |
| Delivery days | Monday to Friday |
| Origin requirement | Finnish catalogue origin for the exact fish categories in the signed mandate |

The current seed also has a standing Finnish-origin rule for the explicit fish categories documented in [category-origin-policy.md](category-origin-policy.md). Aino's salmon recipe carries its own Finnish-origin requirement too. Say "The hotel requires Finnish origin for these fish categories, and Aino's recipe asks for Finnish salmon"; the category rule does not cover every fish ingredient in the catalogue.

## The menu

Seven lines, every one a real catalogue product with a real price.

| Line | Product | ID | Price | Amount per guest |
|---|---|---|---|---|
| Salmon main | Kalavapriikki salmon fillet pieces, ASC, 10 × 170 g, Finnish | 469672 | €29.84 per kg | One 170 g piece |
| Potatoes | Button potato, washed, 30–35 mm, Finnish | 460541 | €10.54 per 15 kg case | 200 g |
| Whipping cream | Arla whipping cream 1 L, lactose-free | 464727 | €7.37 | 0.25 L |
| Dessert | Reuter & Stolt princess cake, 15 pieces × 100 g | 467767 | €34.58 a case | One piece |
| Coffee | Paulig Juhla Mokka, 44 × 100 g | 460617 | €75.90 a case | 10 g |
| Coffee milk | Chosen by the agent: Valio Eila semi-skimmed milk drink 1 L, lactose-free | 464306 | €1.01 | 40 L in total |
| Toast, from the bar | Codorniu Sparkling Zero, 75 cl | 477125 | €36.76 per 6 bottles | One glass |

Six lines name their product in Aino's recipe. The milk is the one line the agent searches for and ranks.

## Booking, months ahead (0:40–1:08)

**Clock:** 14 Aug.

| Line | Ordered | Line total |
|---|---|---|
| Salmon | 31 kg | €925.04 |
| Potatoes | 3 cases | €31.62 |
| Whipping cream | 45 | €331.65 |
| Princess cake | 12 cases | €414.96 |
| Coffee | 1 case | €75.90 |
| Coffee milk | 40 | €40.40 |
| Sparkling | 5 cases | €183.80 |
| **Order total** | | **€2,003.37** |

The quantities and the total are asserted by the tests.

**What the agent is seen doing:**

- **Reads** the milk line typed in plain words and shows it back as chips.
- **Judges** which lactose-free products are plain drinking milk, leaving out coffee milks and soured milks.
- **Decides** on price, then delivery reliability. Valio's Eila is the cheapest of the lactose-free milks that can be delivered. Its stock isn't confirmed, and that doesn't lower its rank (decision D34).
- **Shows its working.** The app has a selection funnel and shows the time each step took. Check that both appear on the milk line before recording.

**Aino decides:** one question covering four lines whose stock Valio Aimo can't confirm: the potatoes, the princess cake, the sparkling and the milk. She continues.

**Sanna approves:** one card. The order is €53.37 over her €1,950 limit. The card also names the coffee: a 4.4 kg case for a 1.8 kg need is over her rounding limit. She approves, and the order is placed.

## First clarification, two weeks before (1:08–1:42)

**Clock:** Fri 30 Oct.

| What changes | From → to |
|---|---|
| Guests | 180 → 194 (+14, +7.8%) |
| New allergy | Onni, one of the new guests, tree nuts |

The allergy is checked first, and the change waits until Aino has dealt with it. Three lines are affected, in three different ways:

| Line | What the data says | What the agent does | What Aino does |
|---|---|---|---|
| **Princess cake** | Lists almond under "contains". Almond is a tree nut. The same product is also listed "free from tree nuts" | Stops it. No approve button. Offers replacements ranked on what they cost to serve 194 guests | Replaces it with the Elonen raspberry pastry cake (473522): 5 cases, €310.60. The second offer is a Fazer caramel cake: 13 cases, €316.42 |
| **Sparkling** | Lists tree nuts as "undeclared", which doesn't meet an allergy requirement | Stops it. No approve button. Offers a replacement | Takes the replacement the agent offers first. See the caution below |
| **Potatoes** | No allergen declaration at all | Asks, naming tree nuts and the guest affected | Continues. The line stays marked "allergen data not confirmed" (decision D35) |

Because the allergy changed what the order has to satisfy, Aino is asked once more to confirm the lines with unconfirmed stock.

**Sanna approves:** one card for the whole change. The guest count rose by more than her 5%.

**A caution on the sparkling.** In the tests, the first replacement offered for the toast is a non-alcoholic red wine (Ebony Vale Cabernet Sauvignon, 477090), which has confirmed stock. A chef would not toast with red wine. Before recording, look at what the card offers and either pick a sparkling alternative if one is offered, or cut this line from the video.

**Total after the change:** €1,965.17 with the red wine at €26.80 a case, asserted by the wedding regression. Different choices can change the total.

## Second clarification, before the cut-off (1:42–2:10)

**Clock:** Sat 14 Nov, 17:00, which is 24 hours before the main cut-off.

| What changes | From → to |
|---|---|
| Guests | 194 → 188 (6 no-shows, −3.1%) |

**What happens:**

- **The change is inside Sanna's 5%**, so under her rules it needs no approval from her. The tests assert the chef's part of this step, not hers, so check on the app that no card reaches her.
- **Aino confirms it.** One line, the potatoes, carries unconfirmed allergen data, so a change to the guest count needs her yes again. Don't say "nobody is asked".
- **The final check runs** and finds the cream short: 37 in stock for 47 ordered.

**Aino decides:** she keeps the 37 litres of Arla cream and adds 10 litres of Valio whipping cream 1 L UHT (464194), shown side by side.

**Fixture totals:** €1,920.59 after the no-shows, then €1,885.99 after the cream substitution. Both are asserted by the wedding regression. The event's order view and signed receipt show the same final lines and total.

**The result line, exactly as the app shows it:** "Ready · 4 stock not confirmed · 1 allergen data not confirmed".

The four are the potatoes, the Valio cream, the milk and the raspberry cake.

## The safety drill (2:10–2:30)

This is on the live console, at `/live`: the hotel's agent on the left, Valio Aimo's gateway on the right.

- **The button:** "Send unvetted agent". It is demo-only.
- **What it does:** a script holding the hotel's token orders about €2,387 of salmon with no approval.
- **What the gateway does:** refuses it, naming the rule (`mandate_violation`). The row shows as REFUSED.

The line: "Our agent stays inside Sanna's rules. Katri shouldn't have to take our word for it."

## The signed record, and close (2:30–3:00)

The video ends on Katri's seat, because the judges are from Valio Aimo.

On the live console, tap the finished wedding order. It opens the real record, not a mock-up:

| Shown | Why it matters to Valio Aimo |
|---|---|
| The order's lines, total and delivery date | What to pick and what to invoice |
| Its signature, with a check that it verifies | Proof the order is what was agreed, checkable by anyone |
| The approval attached to it | Proof a person at the hotel authorised it |
| The Peppol document | It can go into a standard ordering system |
| The refused drill order beside it | The gateway enforces the hotel's limits itself |

What Katri's view of the audit leaves out: the recipes, the guests, and anything about Onni's allergy. That is tested.

**The video doesn't quote a number of taps or decisions.** Proposed closing line: "One wedding, three rounds of changes. Nothing was ordered that someone didn't decide, and every decision is on record for both sides."

## Showing how it works

The line for the video: **"AI reads and judges. Rules decide."**

- **Reads:** a language model turns what Aino typed into a structured request.
- **Judges:** a model answers narrow yes/no questions, such as "is this plain drinking milk?", with a confidence. At 0.90 or above it counts as a fact; at 0.10 or below it rejects; in between a person is asked.
- **Decides:** plain rules decide allergens, money and stock. The same input always gives the same answer.

Don't name a model vendor: the one in the build is a temporary choice. Don't call the model deterministic: it returns a probability. The planned on-screen "Reads, Judges, Decides" strip was not built; the live console's gateway side labels every call ALLOWED, NEEDS APPROVAL, ASKS CHEF or REFUSED, which shows the same thing.

## Showing speed and accuracy

Both are shown inside the beats above.

**Speed.** The app shows the time each step took. Use the figures on screen at recording time. Don't claim a multiple over the manual process: nobody has timed it.

**Accuracy.** The moments to point at, each real:

| Moment | What it shows |
|---|---|
| The milk's selection funnel | Coffee milks and soured milks left out; the cheapest deliverable plain milk picked |
| The princess cake | A contradiction in the data, caught: "free from tree nuts" and "contains almond" |
| The sparkling | "Undeclared" is not treated as safe |
| The potatoes | Missing data is not treated as safe either: a person is asked, and it stays marked |
| The replacement cake | Ranked on what it costs to serve the guests: €310.60 against €316.42, though the dearer one is cheaper per kg |
| Whole packs | 180 pieces is exactly 12 cases of 15 |

The salmon is fixed by Aino's recipe, so it has no funnel. The "95 salmon products" count in earlier versions of this plan belongs in the pitch, not on screen; it is claim `D6` in the knowledge base.

## If time is short, cut in this order

1. The sparkling's replacement. Show the cake and the potatoes only.
2. The six no-shows. Go straight to the final check.
3. The coffee case on Sanna's first card. Mention the budget only.

The four to protect: the plain-words milk line, the booking with Sanna's approval, the gateway refusal, and the signed record.

## Still to do

| What | Who |
|---|---|
| Check what the sparkling's replacement card offers, and decide whether that line is in the video | Jack, Darragh |
| Read the totals after each change off the app and write them into the script | Whoever records that beat |
| Decide who records and voices which beat, and when recording starts | Team |
| Final wording of the closing line | Jack |

## To ask Valio Aimo

- Does a customer or Valio Aimo ever set Valio's own products as the default choice? Our ranking is on price and reliability; here it picks Valio's milk, but nothing guarantees that elsewhere.
- What do the placeholder stock figures in the mock stand for in the real system?
