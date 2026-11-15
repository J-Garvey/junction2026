# Demo deliverables

> **What this is:** every individual thing the three-minute video in [demo-plan.md](demo-plan.md) needs, ranked by priority. Each one says what it is, where it stands in the build today, what to do, who owns it, and how to tell it is done.
>
> **Where the states come from:** the code on `main` on 15 Nov 2026, the team's [build notes](build.md), and the end-to-end test file (`apps/api/test/e2e.test.ts`). See "Test run" at the end for whether the tests were re-run for this list.
>
> **The main finding:** almost everything the video needs is already built and covered by tests. What is left is mostly decisions, because the build and the demo plan have drifted apart in seven places.

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

## A. Decide first

Seven places where the build and the demo plan disagree. None needs code to decide; five of them only need the plan's numbers or wording updated.

| # | Decision | What the plan says | What the build does | Recommended | Who | Done when |
|---|---|---|---|---|---|---|
| A1 | **Which ranking rule the video follows** | D32: best on reliability and price. Milk is Valio's Eila; booking €2,003.37; four lines in the stock question | D33, recorded on 15 Nov, replaced D32: enough confirmed stock first, then price. Milk is Arla's (469363); booking €2,062.17; three lines in the stock question; Sanna's card says €112.17 over | Follow the build. D33 is the later decision and the tests assert it | Jack, with the team | The booking table in demo-plan.md shows the same products, total and overage as the app after Reset |
| A2 | **What the video calls the model** | "Gemini's decision model" | OpenAI only (`gpt-6-astra`), for reading requests and for the yes/no judgements. With no key, a built-in parser and a hand-checked list run instead, and the app says so | Say "a language model" and "a yes/no judgement with a confidence". Don't name Gemini | Jack | No line of the script or the plan names a model the build doesn't run |
| A3 | **The potatoes and Onni's allergy** | Only the cake stops | The potatoes (460541) stop too: they have no allergen declaration, and rule ALG-03 says missing data is never safe for an allergy. Aino has to give Onni another side | Swap the seed's potato for one that has an allergen declaration. It keeps the rule intact and the story to one stop | Darragh picks the product; Ben changes the seed | The first clarification shows one allergy stop, the cake |
| A4 | **Which cake replaces the princess cake** | Elonen raspberry pastry cake (473522) | The agent's own top two that declare themselves free from tree nuts and are cakes. Today the first is a Fazer gluten-free caramel cake | Use the agent's pick. It is the real behaviour, and it is what "suggestions" means | Jack | The plan's totals after the first clarification match the app |
| A5 | **The coffee case on Sanna's first card** | Not mentioned | A 4.4 kg case for a 1.8 kg need is over both 10% and €25, so rule QTY-01 adds it to Sanna's card | Keep it. It shows the rounding rule working, and costs one clause of voiceover | Jack | The script's line for Sanna's first card names both the budget and the coffee case |
| A6 | **Katri's sale record** | A still picture under headings | A real signed order record in the live console: the order, its ES256 signature with a "verify" check, and the Peppol XML | Use the real one. It is stronger than a picture and already there | Jack | The closing beat shows the signed record for the wedding order, verified |
| A7 | **WhatsApp** | Channels are cut | WhatsApp ordering is built, with its own [demo notes](whatsapp-demo.md) | Team call. It isn't in the three-minute plan; adding it means cutting something else | Team | The plan says yes or no |

## B. The spine

These carry the four beats the plan protects: the plain-words line, the booking with Sanna's approval, the gateway refusal, and the sale record.

### Lookup and search

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B1 | **`LOOKUP`**: price and availability from Valio Aimo's mock, in batches of up to 1,000, with both stock placeholders turned into "unknown", empty schedules into "not deliverable", and live or fixture mode. `POST /gateway/v1/lookup`; code in `aimo/lookup.ts` | Built | Pavit | Verify | A lookup of 469672, 467767 and 461955 returns: 311 kg in stock at €29.84 per kg; stock unknown; and a price with no delivery. Each line says whether it came from the live mock or a fixture |
| B2 | **`PRODUCT-SEARCH`**: the local catalogue filtered by text, category, claims, allergens to exclude, origin and labels, capped at 50. `GET /gateway/v1/products`; code in `search.ts` | Built, tested (`search.test.ts`) | Pavit | Verify | `q=salmon&origin=fi` returns only Finnish products. `category=10400&claims=FREE_FROM_LACTOSE` returns only lactose-free products. The same query twice gives the same order |
| B3 | **`TYPE-CHECK`**: a yes/no judgement on whether a product is the type asked for, with a confidence. 0.90 or above is a fact, 0.10 or below rejects, anything between asks. Answers are stored and reused. Code in `agent/judge.ts` | Built | Pavit | Verify with the key set, and once with it unset | For the milk line, Arla Café milk (463380) and the soured milks are rejected. Each judgement in the audit shows its probability and whether it came from the model, the store or the hand-checked list |
| B4 | **`RANK`**: the fixed order. Recipe-approved product, then enough confirmed stock, partial stock, unknown stock, then price, reliability, product ID. Products with no price go last. Code in `agent/match.ts` | Built (D33) | Pavit | Settle A1, then verify | The milk line picks the product the plan names, and shows the step that decided it |

### Parameters and rules

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B5 | **Sanna's rules (the mandate)**: budget €1,950 per order; delivery days Monday to Friday; holidays; guest change 5%; overshoot 10% and €25; price rise 5%; partial fill and unconfirmed stock always ask. Signed, and served at `GET /gateway/v1/mandate` | Built | Darragh | Verify | The Rules page shows each value, read-only. The mandate from the gateway carries a signature that verifies |
| B6 | **Fixed parameters**: judgement thresholds 0.90 and 0.10; reliability 0.95 and 0.80; urgent at 4 days; final check 24 hours before cut-off; quotes valid 24 hours; 50 search results; 3 candidates shown; 1,000 per lookup; 5% pack disagreement; per-guest bounds 1 kg or L and 1 g or ml | Built (`rules/catalogue.ts`) | Darragh | Verify | Each value is visible somewhere a judge could find it: the Rules page or the OpenAPI description |
| B7 | **Allergy and diet rules** (ALG-01, 02, 03, 10; DIET-01 to 05): an allergy to a family catches its members, so tree nuts catch almond; "free from" never outweighs "contains"; missing data is never safe | Built, tested (`rules.test.ts`, `model-allergy-boundary.test.ts`) | Darragh | Verify | Adding Onni's tree-nut allergy stops the princess cake (467767) with "Contains almond", and the card has no approve button |
| B8 | **Quantity rules** (QTY-01, 06): amount per guest × guests, combined per product, rounded up once to whole sales units; ask only when the overshoot is above both limits | Built, tested (`quantity-boundaries.test.ts`) | Ben | Verify | 180 guests gives 31 kg, 3 cases, 45, 12 cases, 1 case, 40 and 5 cases, in the menu's order |
| B9 | **Stock question** (STK-01, 03): one card for every line whose stock can't be confirmed; the chef continues or picks another | Built, tested (scene 2) | Darragh, Jack | Verify | After the booking is built, Aino sees one card listing the unconfirmed lines, and Sanna sees nothing until Aino has answered |
| B10 | **Budget rule and approval** (MAN-01, MAN-04): over the cap needs Sanna; her approval is signed and tied to that exact quote | Built, tested (scene 2 and test case 3) | Darragh, Pavit | Verify | Sanna gets one card naming MAN-01 and the amount over. After she approves, the plan's status is "ordered". Changing the order voids the approval |

### Orders and the gateway

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B11 | **Quote and order**: a signed quote; an order made only from a quote; price, stock and cut-off rechecked at commit; the same key returns the same order | Built, tested (test case 3, signature tests) | Pavit | Verify | Placing the wedding order returns one order with a signature that verifies. Sending it again with the same key returns the same order, not a second one |
| B12 | **Gateway refusals**: `mandate_violation`, `hard_rule`, `cutoff_passed`, `quote_stale`, each naming the rule | Built, tested (test case 3) | Pavit | Verify | An order over €1,950 with no approval is refused with `mandate_violation`. With the approval attached it is accepted |
| B13 | **The safety drill**: a demo-only button, "Send unvetted agent", that orders about €2,387 of salmon with no approval | Built (live console) | Pavit, Jack | Verify | Pressing it shows a REFUSED row on the gateway side naming the budget rule, and no order is created |
| B14 | **The signed record**: tap an order in the live console to see it, check its signature and open the Peppol XML | Built, tested (signature tests) | Pavit | Settle A6, then verify | The wedding order opens, the signature check passes, and the XML opens |

### The story's moving parts

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| B15 | **Plain-words request**: text becomes a quantity, product, constraint and date, shown back as chips | Built, tested (`parse-request.test.ts`) | Jack | Verify | "Add 40 litres of lactose-free milk for the coffee service" gives chips for 40 L, milk and lactose-free, and nothing is quoted until they are confirmed |
| B16 | **Seed and Reset**: Demo Hotel; Aino, Sanna, Mikko, Jonas, and Katri's read-only view; the mandate; the wedding with seven lines; the clock at scene 1 | Built, tested ("two runs from a fresh reset give the same result") | Ben | Settle A3, then verify | Reset twice, run the booking twice: the two orders are identical |
| B17 | **The clock**: scenes at 14 Aug, 30 Oct and 14 Nov 17:00; every time check reads it | Built | Ben | Verify | Moving to 14 Nov 17:00 locks the lines whose cut-off was 12 Nov, and a change to one of them is refused |
| B18 | **Switching seats**: "viewing as" a seeded person, with every action recorded against them | Built | Jack | Verify | The current person's name and role are on screen throughout. An answer given as Sanna appears in the audit under her name |
| B19 | **The first clarification**: 194 guests and Onni's allergy in one step. The allergy is checked first and the change waits; then one card for Sanna (CHG-02) | Built, tested (scene 3) | Darragh | Settle A3 and A4, then verify | The change is held until Aino resolves the allergy. Sanna then gets exactly one card for the whole change |
| B20 | **The audit, in two views**: every step with its rule IDs and model judgements; a hash chain; Valio Aimo's view without dishes, guests or allergies | Built, tested ("Valio Aimo sees the sale and the flags, never the allergy or the guests") | Ben | Verify | The audit screen shows the chain as intact. Katri's view has the order and the refusal and no mention of Onni |
| B21 | **demo-plan.md brought in line with the build** | Differs | Jack | Rewrite the numbers and wording once A1 to A6 are settled | Every figure in the plan can be read off the running app |
| B22 | **The recording**: one take per beat from a fresh Reset, then cut together | Not started | Team | Agree who voices which part and when recording starts | A three-minute file exists |

## C. Shown, but the video survives without it

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| C1 | **Suggestion: a replacement dessert**. The top candidates that are cakes and declare themselves free from the allergen | Built, tested (scene 3: the first option is a replacement) | Darragh | Settle A4, then verify | The card offers at least two cakes, none with tree nuts in "contains", "may contain" or "undeclared" |
| C2 | **The no-shows**: 194 to 188 applied with no question, inside the 5% | Built, tested (scene 4) | Darragh | Verify | Salmon goes from 33 kg to 32 kg and nobody is asked |
| C3 | **The final check** (FIN-01, 02; STK-02, 04): run 24 hours before the cut-off; finds the cream short | Built, tested (scene 4) | Darragh | Verify | The card reads "37 of 47 in stock · 10 l to fill" |
| C4 | **Suggestion: cream substitutes, side by side** (SUB-01) | Built, tested (scene 4: the candidates include 464194) | Darragh, Jack | Verify | Aino keeps 37 L of the Arla cream and adds 10 L of the Valio cream; the order shows both |
| C5 | **The result line** | Differs: the build says "Ready · 4 stock not confirmed"; the plan says "Ready for Tuesday. Valio Aimo can't confirm stock on 5 lines" | Jack | Use the build's line in the plan | The plan quotes the line the app shows |
| C6 | **Finnish fish** (ORG-01) | Differs: the origin sits on Aino's recipe line for the salmon, not in Sanna's rules | Jack | Change the script to "Aino's recipe asks for Finnish salmon", or ask Darragh to add an origin rule to the mandate | The video's claim about who set the rule matches where the rule lives |
| C7 | **Time per step**: milliseconds on each gateway call in the live console | Built | Jack | Verify it is readable on camera | Each row on the gateway side shows its time |
| C8 | **Fixture labels** | Built | Ben | Verify | In fixture mode, lines fed by saved data carry the label |
| C9 | **The funnel, with a click on each step** | Missing in the app. The data behind it exists: each line keeps its candidates and the products it excluded, with the rule for each | Jack | Build it on the **milk line**, the only line that searches. The salmon is fixed by Aino's recipe, so it has no funnel. Group the excluded products by rule and show a count per step | On the milk line, each step shows a count, and a click lists the products removed and the rule that removed them. The counts are read from the app, not typed in |

## D. Cut first

| # | Deliverable | State | Owner | Do | Done when |
|---|---|---|---|---|---|
| D1 | **Carbon on each line** | Built in the plan view; not checked on the screens the video uses | Ben | Verify, or drop from Sanna's rules in the script | Each line shows a figure labelled as a product-group average, or "no figure" |
| D2 | **The Reads, Judges, Decides strip** | Missing | Jack | Drop it. The live console's gateway side already labels every call ALLOWED, NEEDS APPROVAL, ASKS CHEF or REFUSED, which shows the same thing. Keep the voiceover line "AI reads and judges. Rules decide." | The plan no longer promises the strip |
| D3 | **The "not available" salmon fillet** | Built as a rule (DLV-01); not in the seed's story, because the salmon is fixed by the recipe | Jack | Drop from the script, or show it with one product search | The script doesn't promise a moment the app won't show |
| D4 | **A test title that no longer matches**: scene 2 is titled "€2,003.37 … 4 lines" and asserts €2,062.17 and 3 lines | Differs | Ben | Rename the test | The title states what the test asserts |

## Rules that fire in the video

For whoever writes the voiceover. Every one is in the rule catalogue (`apps/api/src/rules/catalogue.ts`) with a stable ID.

| Beat | Rules |
|---|---|
| Booking | TYP-01, TYP-02 (product type); STK-01, STK-03 (stock not confirmed, continued); QTY-06, QTY-01 (rounded up, overshoot); MAN-01 (over the budget) |
| First clarification | CHG-02 (change outside tolerance); ALG-01, ALG-10 (contains allergen, allergy conflict); ALG-03 (no allergen data, unless A3 is changed); SUB-01 (substitute) |
| Second clarification | CHG-01 (change inside tolerance); FIN-01, FIN-02 (final check); STK-02 (partial stock); CUT-02 (locked); SUB-01 |
| Safety drill | MAN-01, MAN-04 (over the budget, approval mismatch) |

## Order of work

1. **A1 to A7**, together, in one sitting. They are decisions, not work.
2. **A3's seed change** (Ben), since it changes what the tests should expect.
3. **B21**: Jack brings the demo plan in line with the build.
4. **Verify B1 to B20** on the running app, one person per table.
5. **C9**, the funnel, if there is time. It is the only real build left.
6. **B22**: record.

## Test run

The API's test suite was run for this list on 15 Nov 2026 at commit `0cb5841`, on a clean install, with no model key set (so the scripted model and the hand-checked list were used):

- **28 test files, 477 tests, all passed**, in 37 seconds.
- That covers every item marked "Built, tested" above, including the wedding through its four scenes, run twice from a fresh reset.

What the tests don't cover: anything marked "Built" without "tested", how the screens look on camera, and the live model. Items B1, B3, B5, B6, B13, B17, B18, C7 and C8 still need a person to check them on the running app.
