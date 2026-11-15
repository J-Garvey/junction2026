# Pitch knowledge base

> **What this is:** every claim the pitch can make, one per row, each with how strong it is, where it comes from, and how to say it. It is written to be read by a person or handed to an AI model as the only source for drafting pitch text, slides and answers to judges' questions.
>
> **Compiled:** 15 Nov 2026, against commit `a808b5c`. The longer argument behind these claims is in [research/09-business-case.md](../research/09-business-case.md).

## How to use this file

**If you are an AI model drafting pitch material from this file, follow these rules.**

1. Use only the claims in this file. Do not add facts, figures or examples from general knowledge.
2. Keep each claim's strength. A claim marked "Told to us", "Interview" or "Inference" must be worded that way: "Valio Aimo told us…", "the chef we spoke to said…", "we think…". Never restate it as a measured fact.
3. Use numbers exactly as written in section 9, with their unit and what they are a share of. Do not round them into something else, combine them, or compute new ones.
4. Never use anything in section 11, "Do not say".
5. If asked something this file doesn't answer, say it isn't known. Section 12 lists what isn't known.
6. When you use a claim, keep its ID (for example `B4`) in your notes so a person can check it.

**Strength, strongest first**

| Strength | Means |
|---|---|
| **Tested** | Asserted by the build's automated tests. 56 test files and 882 tests passed at commit `a808b5c`, on a clean install with no model key set |
| **Data** | Computed from the challenge's catalogue, or observed on Valio Aimo's mock API |
| **Brief** | Stated in the challenge brief |
| **Build notes** | Stated in [build.md](build.md) by the people who built it. Not re-checked for this file |
| **Public source** | A published source, cited in the research file named |
| **Told to us** | Said by Valio Aimo staff at Junction on 14 Nov. Spoken, not documented |
| **Interview** | Said by Owen, a hotel chef and kitchen manager. One person |
| **Inference** | Our own reading. Say "we think" |

## 1. The pitch in five sentences

Each sentence is built only from the claims named.

1. A hotel orders the food for a big event months ahead and changes it on one phone call with its Valio Aimo rep, and none of the event's details reach Valio Aimo as data (`P1`, `P2`, `P3`).
2. We built the interface that lets a hotel's purchasing agent order from Valio Aimo, where Valio Aimo's own gateway enforces the hotel's limits, so it never has to trust the agent's code (`B1`, `B2`).
3. AI reads the request and makes narrow yes/no judgements; plain rules make every decision about allergens, money and stock (`B8`, `B9`).
4. It runs end to end on Valio Aimo's real catalogue: a wedding for 180 guests, through a booking, a change two weeks out and a final check, with every approval signed and on record (`B5`, `B6`, `B7`, `B10`).
5. Along the way the agent caught things a search would miss, such as a cake listed as both "free from tree nuts" and "contains almond" (`D7`).

## 2. The problem

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| P1 | The order for a hotel event is placed months ahead and amended on one call between the hotel and its Valio Aimo rep, about 2–3 weeks before | Told to us | research/07 | "Valio Aimo's team told us…" |
| P2 | That call mostly changes the guest count and the items and quantities, and sometimes allergen information | Told to us | research/07 | As P1 |
| P3 | No order field carries the guest count, the menu or the event type, so Valio Aimo learns the event's context only through the rep, by phone | Public source, Told to us | research/07 | Safe to state |
| P4 | Valio Aimo's own customer interviews found hotel and restaurant recipes kept in Word and Excel | Public source | research/07 | Safe to state; it is Valio Aimo's own finding |
| P5 | Daily breakfast orders are templated and already automated; catering events have no templates and are "high labour, high complexity" | Told to us | research/06 | "Valio Aimo told us…" |
| P6 | Ingredients are not interchangeable by category: two "blue milks" may not be interchangeable in a recipe, and sugar with additives can break bakery recipes | Told to us | research/06 | A strong line, in their own words |
| P7 | The kitchen that serves the food owes diners the allergen information, under EU Regulation 1169/2011 and Finnish decree MMM 834/2014 | Public source | GROUND_TRUTH 6 | Safe to state |
| P8 | Finnish hotels take final numbers and diets about two weeks before an event and still accept guest-count changes up to 3 working days before | Public source | research/07 | Safe to state |

## 3. The customer, and why

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| C1 | Valio Aimo named hotels first, then restaurants, as its priority segment, and said revenue is concentrated in large hotel chains | Told to us | research/06 | "Valio Aimo told us hotels come first" |
| C2 | The brief's own example is a hotel chain's agent ordering lactose-free milk | Brief | challenge/brief.txt | Safe to state |
| C3 | The team called 30 hotels and spoke with a hotel chef and kitchen manager, who said the way we describe event ordering is accurate | Interview | research/08 | "We called 30 hotels and spoke with a chef who…". Say "a chef", not "hotels" |
| C4 | In his kitchen the sequence is: the guest is consulted, the kitchen settles the menu and exact ingredients, the finance manager approves, then the order goes to the wholesaler | Interview | research/08 | This is the order our product follows |
| C5 | His hotel is contractually obliged to stay with the same supplier | Interview | research/08 | "The chef we spoke to…". One hotel |
| C6 | His main concerns when ordering are allergies, quantities and forecasting | Interview | research/08 | As C3 |
| C7 | We turned down public kitchens because tenders and regulation make adoption slow, and independents because their recipes live in the chef's head | Inference | research/01, 02, 04 | Only if asked why not other segments |
| C8 | The hotel's event clients never deal with Valio Aimo directly; the hotel places the order | Told to us | research/06 | Safe to state |

## 4. What we built

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| B1 | A gateway on Valio Aimo's side with search, lookup, quotes, orders, amendments, approvals and an audit log, published as OpenAPI 3.1 | Tested, Build notes | build.md | Safe to state |
| B2 | The gateway enforces the hotel's limits itself. An order over the limit with no approval is refused; with a matching approval it is accepted | Tested | e2e test case 3 | The central claim. Say it plainly |
| B3 | The hotel's agent has no back door: it calls the same gateway routes as any outside agent, with its own token | Build notes | build.md | Safe to state |
| B4 | An approval can only be given by a person. An agent's token is refused | Build notes | build.md | Safe to state |
| B5 | A wedding for 180 guests runs through four stages on real catalogue products and prices: €2,003.37 at booking, which is €53.37 over a €1,950 limit, so the finance manager gets one card | Tested | e2e scene 2 | Safe to state, with the figures |
| B6 | Two weeks out, 14 more guests and a child's tree-nut allergy arrive together. The allergy is checked first. The cake is stopped because it contains almond, and the chef replaces it. The sparkling is also stopped, because its data lists an allergen as undeclared, and is replaced with one whose stock is confirmed. The finance manager then gets one card for the whole change | Tested | e2e scene 3 | Safe to state |
| B7 | Before the cut-off, six guests drop out. Finance is not asked. The chef confirms the change, because one line carries unconfirmed allergen data. The final check then finds the cream short, 37 in stock for 47 ordered; the chef keeps the 37 and adds 10 litres of another cream. The event ends as "Ready · 4 stock not confirmed · 1 allergen data not confirmed" | Tested | e2e scene 4 | Safe to state. Quote the result line exactly |
| B8 | The language model sits only at the edges: it reads requests and answers bounded yes/no questions. It never decides a hard rule | Build notes | build.md | "AI reads and judges. Rules decide." |
| B9 | Model judgements use fixed thresholds: 0.90 or above counts as a fact, 0.10 or below rejects, anything between asks a person | Build notes | rules/catalogue.ts | Safe to state |
| B10 | Every quote, order, approval and the hotel's standing limits carry a signature that anyone can verify against published keys | Tested | e2e signature tests | Safe to state |
| B11 | One audit log, hash-chained. Valio Aimo's view shows the sale and the flags, never the allergy or the guests | Tested | e2e | Safe to state |
| B12 | The same order sent twice creates one order | Tested | e2e test case 3 | If asked about reliability |
| B13 | A line past its cut-off is refused at the gateway, even though the mock still shows a delivery date | Tested | e2e test case 3 | Good example of not trusting the data blindly |
| B14 | An unvetted agent holding the hotel's token and ordering over the limit is refused by the gateway | Build notes | build.md | The safety drill |
| B15 | A chef can continue past a product with no allergen declaration, and the line stays marked "allergen data not confirmed". A product that lists the allergen is still blocked. In the wedding this happens with the potatoes | Tested | e2e scene 3, decision D35 | Only if asked. It is a deliberate, visible trade-off |
| B18 | For items counted in pieces, replacements are ranked on what they cost to serve the guests, not on price per kg. For 194 guests the agent offers a raspberry pastry cake at €310.60 ahead of a caramel cake at €316.42, though the caramel cake is cheaper per kg | Tested | e2e scene 3, decision D36 | A good example of matching what the buyer needs |
| B16 | Orders can be exported as Peppol ordering documents | Build notes | build.md | If asked about standards |
| B17 | Approvals and limits follow the shape of AP2 version 0.2. Aligned, not certified | Build notes | build.md | Say "aligned with", never "compliant" or "certified" |

## 5. What the catalogue showed us

These are from the challenge's own data and mock. They are the strongest evidence that the problem is real.

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| D1 | 46% of products have no allergen declaration (8,122 of 17,546) | Data | GROUND_TRUTH 4.2 | Safe to state |
| D2 | 24% of priced products in a 1,000-product sample could not be delivered (239 of 1,000) | Data | GROUND_TRUTH 3 | Say "in a sample of 1,000" |
| D3 | 44% of the deliverable products in that sample had unknown stock (337 of 761) | Data | GROUND_TRUTH 3 | Say "in the mock" and "in a sample" |
| D4 | Only 1.1% of products list a substitute (188) | Data | GROUND_TRUTH 4.1 | Safe to state |
| D5 | Four products claim to be lactose-free and list lactose as an ingredient | Data | GROUND_TRUTH 4.2 | Safe to state |
| D6 | Of 95 products with "salmon" in the name, 50 are Finnish, 36 of those can be delivered, and 3 of those are plain salmon fillet | Data | demo-plan.md | The count of 3 was made by reading names by hand. Say "we counted" |
| D7 | A princess cake in the catalogue is listed as both "free from tree nuts" and "contains almond". Our agent stops it | Data, Tested | e2e scene 3 | Safe to state. A strong moment |
| D8 | The mock still shows a Monday delivery for products whose order cut-off has already passed | Data | GROUND_TRUTH 3 | Safe to state |

## 6. What it means for Valio Aimo

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| V1 | Valio Aimo can let outside agents order without trusting their code, because its own gateway checks every order | Tested | B2 | The headline for Valio Aimo |
| V2 | The brief calls how a wholesaler exposes itself to agents "existential for data ownership, trust, and who owns the customer relationship" | Brief | challenge/brief.txt | Quote it |
| V3 | The brief's stated aim is to define this interface "before that interface gets defined by someone else's platform" | Brief | challenge/brief.txt | Quote it |
| V4 | Other wholesalers and ordering platforms already ship AI ordering: Choco, US Foods and Sysco | Public source | research/05 | Safe to state |
| V5 | With our product, the event's context (guest counts, changes and why) reaches Valio Aimo as data instead of by phone | Inference | P3, B5 | "We think this means…" |
| V6 | Routine changes no longer need a call to the rep | Inference | P1, B7 | "We think". We have no figure for calls or minutes |
| V7 | A short line is found before the cut-off, and the kitchen chooses the substitute | Tested | e2e scene 4 | Safe to state what the product does. What happens today at picking is not known |
| V8 | Kespro holds an estimated 49.2% of the Finnish food-service wholesale peer group | Public source | GROUND_TRUTH 5 | Say "an estimated", and "of the peer group" |
| V9 | If hotels are contractually tied to their wholesaler, the product's value to Valio Aimo is serving contracted customers better and being the easier wholesaler at renewal, not winning orders inside a contract | Inference | C5 | "We think". Rests on one hotel |
| V10 | Risk: an honest agent says "can't confirm" often. The wedding ends with 4 lines whose stock isn't confirmed and 1 whose allergen data isn't | Tested | e2e scene 4 | Raise it yourself; it shows honesty |
| V11 | Risk: the agent ranks on price, then reliability, and does not favour Valio's own brand. For lactose-free milk it happens to pick Valio's Eila | Tested | e2e test case 2, decision D34 | If asked |
| V12 | Risk: My Aimo already has a recipe tool, and we don't know how far it overlaps | Public source | research/07 | If asked |

## 7. What it means for the hotel

| ID | Claim | Strength | Source | Use in the pitch |
|---|---|---|---|---|
| H1 | The menu and guest count become whole-pack order quantities without hand arithmetic | Tested | e2e scene 2 | Safe to state what the product does |
| H2 | A change in guest count re-runs the order and shows what changed. In the wedding, six no-shows need no approval from finance | Tested | e2e scene 4 | Don't say "nobody is asked": the chef confirms, because of the unconfirmed allergen data |
| H3 | An allergy to a family catches its members: tree nuts catch almond. "Free from" never outweighs "contains" | Tested | rules tests | Safe to state |
| H4 | A substitute that is a different product goes to the chef with a side-by-side comparison | Tested | e2e scene 4 | Safe to state |
| H5 | Unconfirmed stock is shown as unconfirmed, and the person building the order decides whether to continue | Tested | e2e scene 2 | Safe to state |
| H6 | The finance manager sets limits once and sees only what breaks them | Tested | e2e scene 2 | Note the chef we spoke to has every order approved today (C4) |
| H7 | The hotel remains responsible to its guests for allergen information | Public source | P7 | If asked about liability |

## 8. Why this should win, by judging criterion

The brief's five criteria and weights, with what we show for each.

| ID | Criterion (weight) | What we show | Claims |
|---|---|---|---|
| W1 | Working end-to-end demo (30%): "a full request → lookup → order/approval flow… not just isolated pieces" | A plain-words request, a real lookup, an order placed or sent for approval, an amendment, a final check and a refusal, on one clock, covered by 882 passing tests | B1, B5, B6, B7 |
| W2 | Solving the problem and user need (20%): "how precisely the agent matches what the buyer actually asked for, with the least manual correction" | Claims and allergens matched from data, never names; whole-pack arithmetic; desserts ranked on what they cost to serve the guests; the wrong kinds of "salmon" and "milk" filtered out; data contradictions caught | B18, D6, D7, H1, H3 |
| W3 | Autonomy and controls (20%): "what the agent can decide alone, what needs human sign-off, and how decisions are logged" | The hotel's limits enforced by the gateway; approvals only from a person, signed and tied to the exact order; one hash-chained log for both sides | B2, B4, B10, B11 |
| W4 | Robustness to exceptions (15%): "partial availability, substitutions and delivery constraints" | Partial stock, a substitute chosen by the chef, a past cut-off refused, unconfirmed stock disclosed, a retry that creates one order | B7, B12, B13, H4, H5 |
| W5 | Openness and a path to production (15%): "open, documented standards… clear visibility of assumptions" | OpenAPI 3.1; signatures verifiable by anyone; aligned with AP2; Peppol export; the mock's quirks and our assumptions written down | B1, B10, B16, B17 |

**What we can't say here:** how we compare with other teams. We haven't seen their work.

## 9. Numbers, exactly as they may be used

| ID | Number | What it is | Source |
|---|---|---|---|
| N1 | 882 tests in 56 files, all passing | The API's test suite at commit `a808b5c`, no model key set | Our run, 15 Nov |
| N2 | 17,546 products, 648 vendors | The challenge catalogue | GROUND_TRUTH 4.1 |
| N3 | 46% | Products with no allergen declaration | D1 |
| N4 | 24% | Priced products in a 1,000-product sample that can't be delivered | D2 |
| N5 | 44% | Deliverable products in that sample with unknown stock | D3 |
| N6 | 1.1% | Products that list a substitute | D4 |
| N7 | 180 → 194 → 188 | Guests in the wedding at booking, two weeks out, and before the cut-off | B5, B6, B7 |
| N8 | €2,003.37, €53.37 over €1,950 | The wedding's booking total and the amount over the limit | B5 |
| N9 | 37 of 47 | Litres of cream in stock against litres ordered at the final check | B7 |
| N14 | €310.60 against €316.42 | What two replacement cakes cost to serve 194 guests: 5 cases of one, 13 cases of the other | B18 |
| N15 | 4 and 1 | Lines in the finished wedding order with unconfirmed stock, and with unconfirmed allergen data | B7 |
| N10 | 0.8 seconds | Stock for 1,000 products from the mock. The lookup alone, not the whole pipeline | Our measurement, 14 Nov |
| N11 | 30 hotels called, 1 chef spoken with | The team's outreach | C3 |
| N12 | About 20,000 customers, 700 suppliers, 350 staff | Valio Aimo | GROUND_TRUTH 5 |
| N13 | 49.2%, estimated | Kespro's share of the food-service wholesale peer group | V8 |

## 10. Hard questions, and honest answers

| ID | Question | Answer | Claims |
|---|---|---|---|
| Q1 | How much time does this save a hotel? | We don't have a measured figure. We know the conversion is manual today and the change is a phone call. The chef we spoke to confirmed the process; we didn't time it | P1, P4, C3 |
| Q2 | Why would Valio Aimo trust an outside agent? | It doesn't have to. Its own gateway checks every order against the hotel's limits and the hard rules, and refuses what breaks them | B2, B13, B14 |
| Q3 | What if the AI gets it wrong? | The AI doesn't decide. It reads the request and answers narrow yes/no questions with a confidence; below 0.90 a person is asked. Allergens, money and stock are decided by rules | B8, B9 |
| Q4 | What about allergens when the data is missing? | Missing data is never treated as safe. The chef is asked, can continue, and the line stays marked. A product that lists the allergen is blocked outright | B15, D1 |
| Q5 | Does it favour Valio's own products? | No. It ranks on price, then reliability, among products that meet every requirement | V11 |
| Q6 | Isn't this what My Aimo's recipe tool does? | My Aimo scales a recipe into a cart. We don't know whether it handles a whole event. Our part is the gateway, the limits, the approvals and the changes | V12 |
| Q7 | Is this just a chatbot on the webshop? | No. The brief asks for the interface an outside agent uses. Ours is a documented API with signed records. The chat box is one way in | B1, B10 |
| Q8 | Which standards? | OpenAPI 3.1, signed records anyone can verify, alignment with AP2 version 0.2, and Peppol export. We don't claim certification | B1, B10, B16, B17 |
| Q9 | Who pays? | Undecided. Valio Aimo, the hotel, or both. Nobody has been asked | research/09, section 9 |
| Q10 | How many hotels did you talk to? | We called 30 and spoke with one chef and kitchen manager | N11 |
| Q11 | Does it work with real systems? | It runs against the challenge's mock, which ignores the customer and the requested date. Connecting to real systems is not done | D8 |

## 11. Do not say

| ID | Don't say | Why |
|---|---|---|
| X1 | Any figure for time saved, money saved, or "X times faster" | Nothing has been measured |
| X2 | "Hotels told us…" or "customers want…" | One chef was spoken with |
| X3 | "Gemini" or "Google's decision model" | The build runs OpenAI. The model is a temporary choice |
| X4 | "Deterministic AI" | The model returns a probability. The rules are the deterministic part |
| X5 | "AP2 compliant", "Peppol certified" | Aligned and exportable, not certified |
| X6 | "Prevents allergic reactions" or "guarantees safety" | It checks the data, and the data comes from manufacturers. The hotel stays responsible |
| X7 | "Stock is confirmed" or "fully covered" for the wedding | It ends with 4 lines whose stock isn't confirmed and 1 whose allergen data isn't |
| X8 | Any number of taps or decisions as a headline | Decided against on 14 Nov; the count isn't a strong figure |
| X9 | "Better than other teams" | We haven't seen their work |
| X10 | That hotels would pay, or what they would pay | Nobody has been asked |
| X11 | "Valio Aimo's revenue is mostly hotels" as a fact | It was a spoken remark; no split is published |

## 12. What isn't known

How long event ordering takes a hotel today. How often guest counts change late in Finland. Valio Aimo's revenue or customers by segment. Which wholesaler the large chains use. What happens at Valio Aimo when a line is short at picking. Whether real stock is as hard to see as the mock's. Whether a finance manager would accept approving exceptions only. Who would pay. The full list, with who could answer each, is in [research/09-business-case.md](../research/09-business-case.md), section 10.
