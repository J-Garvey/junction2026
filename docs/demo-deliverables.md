# Demo deliverables

> **What this is:** every individual thing the three-minute video in [demo-plan.md](demo-plan.md) needs, ranked by priority. Each one says what it is, where it stands in the build today, what to do, who owns it, and how to tell it is done.
>
> **Where the states come from:** the code on `main` on 15 Nov 2026, the team's [build notes](build.md), and the end-to-end test file (`apps/api/test/e2e.test.ts`). See "Test run" at the end for whether the tests were re-run for this list.
>
> **The main finding:** almost everything the video needs is already built and covered by tests. The decisions in section A were answered on 15 Nov. They leave two new things to build (B23, the allergen-data question, and B24, ranking desserts on the cost to cover the need) and the demo plan to bring in line (B21).

## How to read it

**Priority**

| Rank | Means |
|---|---|
| **A** | Decide first. Each one changes numbers or wording that later items depend on. |
| **B** | The spine of the video: the four beats the plan says to protect, and what they stand on. |
| **C** | Shown in the video, but the video survives without it. |
| **D** | Cut first. |

**State**

| State | Means |
|---|---|
| Built, tested | In the code and asserted by a test |
| Built | In the code; no test found that asserts this exact behaviour |
| Differs | Built, but not as the demo plan describes it |
| Missing | Not in the code |

**"Done when"** is a check someone can do on the running app after pressing Reset, with the value they should see.

## A. Decisions

Seven places where the build and the demo plan disagreed. Jack answered them on 15 Nov. All seven are settled.

| # | Question | Ruling | What follows |
|---|---|---|---|
| A1 | Which ranking rule the video follows | **Settled by D34** (pull request #125): price first, then reliability; stock doesn't affect rank. The build now gives the plan's booking exactly: Valio's Eila, €2,003.37, four lines in the stock question, €53.37 over | The plan cites D34 instead of D32 (B21) |
| A2 | What the video calls the model | **The current model is temporary.** The build runs OpenAI (`gpt-6-astra`) for now. Choosing and wiring the final model is a deliverable | New item C10. Until then the script says "a language model" and "a yes/no judgement with a confidence", and names no vendor |
| A3 | The potatoes and Onni's allergy | **A person can continue past missing allergen data, and it stays marked as a concern**, the same way unconfirmed stock does (new decision D35). "Contains" and "may contain" stay blocked | New item B23, which has to be built. The seed's potato stays as it is |
| A4 | Which cake replaces the princess cake | **Use the agent's pick. It optimises for price**, once every constraint is met (D34). **For a line counted in pieces, price means the cost to cover the need**, not price per kg (D36) | New item B24, which has to be built. With it, the first pick is the Elonen raspberry pastry cake, the one in the demo plan |
| A5 | The coffee case on Sanna's first card | **Keep it**, as the agent has it | The script's line for Sanna's first card names the budget and the coffee case |
| A6 | Katri's sale record | **Use the finished wedding order from the demo** as the example | The closing beat shows that order's record. See B14 |
| A7 | WhatsApp | **Not in the video** | Nothing. It stays built, and out of the plan |

### A4: what "price" means for a dessert

There are two real contenders, both Finnish, both declared free from tree nuts, both sold in pieces. Prices are from the mock on 15 Nov.

| | Fazer gluten-free caramel cake (466509) | Elonen raspberry pastry cake (473522) |
|---|---|---|
| Pack | 15 pieces of 75 g, €24.34 | 40 pieces of 55 g, €62.12 |
| Price per kg | **€21.64** | €28.24 |
| Price per piece | €1.62 | **€1.55** |
| To serve 194 guests | 13 cases (195 pieces), €316.42 | 5 cases (200 pieces), **€310.60** |

The build ranks on price per kg, so the Fazer cake comes first. But the dessert is one piece a guest, and on that measure the Elonen cake costs €5.82 less for the event. Price per kg favours whichever cake has heavier pieces.

**Ruling (Jack, 15 Nov, D36):** for a line counted in pieces, rank on the cost to cover the need after rounding to whole packs, not on price per kg. This isn't built yet: it is item B24.

## B. The spine

These carry the four beats the plan protects: the plain-words line, the booking with Sanna's approval, the gateway refusal, and the sale record.

### Lookup and search

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B1 | **`LOOKUP`**: price and availability from Valio Aimo's mock, in batches of up to 1,000, with both stock placeholders turned into "unknown", empty schedules into "not deliverable", and live or fixture mode. `POST /gateway/v1/lookup`; code in `aimo/lookup.ts` | Built | Pavit | Verify | A lookup of 469672, 467767 and 461955 returns: 311 kg in stock at €29.84 per kg; stock unknown; and a price with no delivery. Each line says whether it came from the live mock or a fixture |
| B2 | **`PRODUCT-SEARCH`**: the local catalogue filtered by text, category, claims, allergens to exclude, origin and labels, capped at 50. `GET /gateway/v1/products`; code in `search.ts` | Built, tested (`search.test.ts`) | Pavit | Verify | `q=salmon&origin=fi` returns only Finnish products. `category=10400&claims=FREE_FROM_LACTOSE` returns only lactose-free products. The same query twice gives the same order |
| B3 | **`TYPE-CHECK`**: a yes/no judgement on whether a product is the type asked for, with a confidence. 0.90 or above is a fact, 0.10 or below rejects, anything between asks. Answers are stored and reused. Code in `agent/judge.ts` | Built | Pavit | Verify with the key set, and once with it unset | For the milk line, Arla Café milk (463380) and the soured milks are rejected. Each judgement in the audit shows its probability and whether it came from the model, the store or the hand-checked list |
| B4 | **`RANK`**: the fixed order (D34). A recipe-approved product first; then price per kg or L, delivery reliability and product ID. Products with no price go last. Stock doesn't affect rank; unconfirmed stock is disclosed and the person decides. Code in `agent/match.ts` | Built, tested (test case 2: "picks the cheapest milk, discloses unknown stock and asks the chef before ordering") | Pavit | Verify | The milk line picks Valio's Eila (464306) and shows the step that decided it |
| B24 | **`RANK`, for lines counted in pieces: price is the cost to cover the need** (D36). After rounding to whole packs, compare what each candidate costs to serve the guests, not its price per kg | **Missing.** The price step compares price per kg or L for every line | Pavit | Build | With Onni's allergy added, the replacement card offers the Elonen raspberry pastry cake (473522) first, at 5 cases and €310.60, and the Fazer gluten-free caramel cake (466509) second, at 13 cases and €316.42. Lines measured in kg or L rank as before. A test asserts both |

### Parameters and rules

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B5 | **Sanna's rules (the mandate)**: budget €1,950 per order; delivery days Monday to Friday; holidays; guest change 5%; overshoot 10% and €25; price rise 5%; partial fill and unconfirmed stock always ask. Signed, and served at `GET /gateway/v1/mandate` | Built | Darragh | Verify | The Rules page shows each value, read-only. The mandate from the gateway carries a signature that verifies |
| B6 | **Fixed parameters**: judgement thresholds 0.90 and 0.10; reliability 0.95 and 0.80; urgent at 4 days; final check 24 hours before cut-off; quotes valid 24 hours; 50 search results; 3 candidates shown; 1,000 per lookup; 5% pack disagreement; per-guest bounds 1 kg or L and 1 g or ml | Built (`rules/catalogue.ts`) | Darragh | Verify | Each value is visible somewhere a judge could find it: the Rules page or the OpenAPI description |
| B7 | **Allergy and diet rules** (ALG-01, 02, 03, 10; DIET-01 to 05): an allergy to a family catches its members, so tree nuts catch almond; "free from" never outweighs "contains"; missing data is never safe | Built, tested (`rules.test.ts`, `model-allergy-boundary.test.ts`) | Darragh | Verify | Adding Onni's tree-nut allergy stops the princess cake (467767) with "Contains almond", and the card has no approve button |
| B8 | **Quantity rules** (QTY-01, 06): amount per guest × guests, combined per product, rounded up once to whole sales units; ask only when the overshoot is above both limits | Built, tested (`quantity-boundaries.test.ts`) | Ben | Verify | 180 guests gives 31 kg, 3 cases, 45, 12 cases, 1 case, 40 and 5 cases, in the menu's order |
| B9 | **Stock question** (STK-01, 03): one card for every line whose stock can't be confirmed; the chef continues or picks another | Built, tested (scene 2) | Darragh, Jack | Verify | After the booking is built, Aino sees one card listing the unconfirmed lines, and Sanna sees nothing until Aino has answered |
| B10 | **Budget rule and approval** (MAN-01, MAN-04): over the cap needs Sanna; her approval is signed and tied to that exact quote | Built, tested (scene 2 and test case 3) | Darragh, Pavit | Verify | Sanna gets one card naming MAN-01 and the amount over, €53.37. After she approves, the plan's status is "ordered". Changing the order voids the approval |
| B23 | **Missing allergen data: a question, kept as a concern** (D35). When a line for a guest with an allergy has a product with no allergen declaration, the chef is asked and can continue. The line keeps the label "allergen data not confirmed" everywhere afterwards. A product that lists the allergen under "contains" or "may contain" is still blocked, with no way past | **Missing.** Today rule ALG-03 stops the line, and the only way forward is another product | Darragh (the rule), Jack (the card and the label) | Build | After Onni's allergy is added, Aino gets one question on the potatoes (460541): no allergen information, one guest must avoid tree nuts, continue or pick another. Continuing lets the change go on. The potatoes then show "allergen data not confirmed" on the event page, the order, the result line and the audit. The princess cake still has no approve button. A test asserts all four |

### Orders and the gateway

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B11 | **Quote and order**: a signed quote; an order made only from a quote; price, stock and cut-off rechecked at commit; the same key returns the same order | Built, tested (test case 3, signature tests) | Pavit | Verify | Placing the wedding order returns one order with a signature that verifies. Sending it again with the same key returns the same order, not a second one |
| B12 | **Gateway refusals**: `mandate_violation`, `hard_rule`, `cutoff_passed`, `quote_stale`, each naming the rule | Built, tested (test case 3) | Pavit | Verify | An order over €1,950 with no approval is refused with `mandate_violation`. With the approval attached it is accepted |
| B13 | **The safety drill**: a demo-only button, "Send unvetted agent", that orders about €2,387 of salmon with no approval | Built (live console) | Pavit, Jack | Verify | Pressing it shows a REFUSED row on the gateway side naming the budget rule, and no order is created |
| B14 | **The signed record**: tap an order in the live console to see it, check its signature and open the Peppol XML | Built, tested (signature tests) | Pavit | Verify, using the finished wedding order (A6) | The wedding order opens, the signature check passes, and the XML opens |

### The story's moving parts

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B15 | **Plain-words request**: text becomes a quantity, product, constraint and date, shown back as chips | Built, tested (`parse-request.test.ts`) | Jack | Verify | "Add 40 litres of lactose-free milk for the coffee service" gives chips for 40 L, milk and lactose-free, and nothing is quoted until they are confirmed |
| B16 | **Seed and Reset**: Demo Hotel; Aino, Sanna, Mikko, Jonas, and Katri's read-only view; the mandate; the wedding with seven lines; the clock at scene 1 | Built, tested ("two runs from a fresh reset give the same result") | Ben | Verify | Reset twice, run the booking twice: the two orders are identical |
| B17 | **The clock**: scenes at 14 Aug, 30 Oct and 14 Nov 17:00; every time check reads it | Built | Ben | Verify | Moving to 14 Nov 17:00 locks the lines whose cut-off was 12 Nov, and a change to one of them is refused |
| B18 | **Switching seats**: "viewing as" a seeded person, with every action recorded against them | Built | Jack | Verify | The current person's name and role are on screen throughout. An answer given as Sanna appears in the audit under her name |
| B19 | **The first clarification**: 194 guests and Onni's allergy in one step. The allergy is checked first and the change waits; then one card for Sanna (CHG-02) | Built, tested (scene 3) | Darragh | Build B23 and B24, then verify | The change is held until Aino has replaced the cake and answered the question on the potatoes. Sanna then gets exactly one card for the whole change |
| B20 | **The audit, in two views**: every step with its rule IDs and model judgements; a hash chain; Valio Aimo's view without dishes, guests or allergies | Built, tested ("Valio Aimo sees the sale and the flags, never the allergy or the guests") | Ben | Verify | The audit screen shows the chain as intact. Katri's view has the order and the refusal and no mention of Onni |
| B21 | **demo-plan.md brought in line with the build** | Differs | Jack | Rewrite the wording and figures from the rulings in section A: D34 for ranking, no vendor named for the model, the potatoes' question, the agent's cake, the coffee case on Sanna's card, the finished order as Katri's record | Every figure in the plan can be read off the running app |
| B22 | **The recording**: one take per beat from a fresh Reset, then cut together | Not started | Team | Agree who voices which part and when recording starts | A three-minute file exists |

## C. Shown, but the video survives without it

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| C1 | **Suggestion: a replacement dessert**. The top candidates that are cakes and declare themselves free from the allergen | Built, tested (scene 3: the first option is a replacement) | Darragh | Build B24, then verify | The card offers at least two cakes, none with tree nuts in "contains", "may contain" or "undeclared" |
| C2 | **The no-shows**: 194 to 188 applied with no question, inside the 5% | Built, tested (scene 4) | Darragh | Verify | Salmon goes from 33 kg to 32 kg and nobody is asked |
| C3 | **The final check** (FIN-01, 02; STK-02, 04): run 24 hours before the cut-off; finds the cream short | Built, tested (scene 4) | Darragh | Verify | The card reads "37 of 47 in stock · 10 l to fill" |
| C4 | **Suggestion: cream substitutes, side by side** (SUB-01) | Built, tested (scene 4: the candidates include 464194) | Darragh, Jack | Verify | Aino keeps 37 L of the Arla cream and adds 10 L of the Valio cream; the order shows both |
| C5 | **The result line** | Differs in wording only: the build says "Ready · 5 stock not confirmed"; the plan says "Ready for Tuesday. Valio Aimo can't confirm stock on 5 lines" | Jack | Use the build's line in the plan | The plan quotes the line the app shows |
| C6 | **Finnish fish** (ORG-01) | Differs: the origin sits on Aino's recipe line for the salmon, not in Sanna's rules | Jack | Change the script to "Aino's recipe asks for Finnish salmon", or ask Darragh to add an origin rule to the mandate | The video's claim about who set the rule matches where the rule lives |
| C7 | **Time per step**: milliseconds on each gateway call in the live console | Built | Jack | Verify it is readable on camera | Each row on the gateway side shows its time |
| C8 | **Fixture labels** | Built | Ben | Verify | In fixture mode, lines fed by saved data carry the label |
| C9 | **The funnel, with a click on each step** | Missing in the app. The data behind it exists: each line keeps its candidates and the products it excluded, with the rule for each | Jack | Build it on the **milk line**, the only line that searches. The salmon is fixed by Aino's recipe, so it has no funnel. Group the excluded products by rule and show a count per step | On the milk line, each step shows a count, and a click lists the products removed and the rule that removed them. The counts are read from the app, not typed in |
| C10 | **The final model for reading requests and for yes/no judgements** (A2). OpenAI is in place as a temporary choice. D29 named the Gemini Decisions API | Temporary | Pavit | Decide: keep OpenAI or wire the Decisions API. Then update D29, the build notes and the plan to say the same thing | The model the docs and the script name is the one the build runs. With no key set, the app still says it is using the built-in parser and the hand-checked list |

## D. Cut first

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| D1 | **Carbon on each line** | Built in the plan view; not checked on the screens the video uses | Ben | Verify, or drop from Sanna's rules in the script | Each line shows a figure labelled as a product-group average, or "no figure" |
| D2 | **The Reads, Judges, Decides strip** | Missing | Jack | Drop it. The live console's gateway side already labels every call ALLOWED, NEEDS APPROVAL, ASKS CHEF or REFUSED, which shows the same thing. Keep the voiceover line "AI reads and judges. Rules decide." | The plan no longer promises the strip |
| D3 | **The "not available" salmon fillet** | Built as a rule (DLV-01); not in the seed's story, because the salmon is fixed by the recipe | Jack | Drop from the script, or show it with one product search | The script doesn't promise a moment the app won't show |
| D4 | **A test title that no longer matched** | Done. Pull request #125 brought the test and its title back in line: €2,003.37 and 4 lines | Ben | Nothing | Already true |

## Rules that fire in the video

For whoever writes the voiceover. Every one is in the rule catalogue (`apps/api/src/rules/catalogue.ts`) with a stable ID.

| Beat | Rules |
|---|---|
| Booking | TYP-01, TYP-02 (product type); STK-01, STK-03 (stock not confirmed, continued); QTY-06, QTY-01 (rounded up, overshoot); MAN-01 (over the budget) |
| First clarification | CHG-02 (change outside tolerance); ALG-01, ALG-10 (contains allergen, allergy conflict); ALG-03 (no allergen data: a question the chef can continue past, once B23 is built); SUB-01 (substitute) |
| Second clarification | CHG-01 (change inside tolerance); FIN-01, FIN-02 (final check); STK-02 (partial stock); CUT-02 (locked); SUB-01 |
| Safety drill | MAN-01, MAN-04 (over the budget, approval mismatch) |

## Order of work

1. **B23**, the allergen-data question (Darragh and Jack), and **B24**, ranking desserts on the cost to cover the need (Pavit). They are the only new behaviour, and the first clarification depends on both.
2. **Re-record the fixtures and update the tests** that B23 and B24 change, so the wedding still runs the same twice.
3. **B21**: Jack brings the demo plan in line with the build and the rulings.
4. **Verify B1 to B20** on the running app, one person per table.
5. **C9**, the funnel, and **C10**, the model, if there is time.
6. **B22**: record.

## Test run

The API's test suite was run for this list on 15 Nov 2026, on a clean install, with no model key set (so the scripted model and the hand-checked list were used). It was run twice:

| Commit | When | Result |
|---|---|---|
| `0cb5841` | Before the ranking change (D33) | 28 files, 477 tests, all passed |
| `0d02ad9` | After the ranking change (D34, pull request #125) | 28 files, 478 tests, all passed |

That covers every item marked "Built, tested" above, including the wedding through its four scenes, run twice from a fresh reset.

What the tests don't cover: anything marked "Built" without "tested", how the screens look on camera, and the live model. Items B1, B3, B5, B6, B13, B17, B18, C7 and C8 still need a person to check them on the running app.
