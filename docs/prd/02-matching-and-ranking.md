# Chunk 02: Product matching and ranking

| | |
|---|---|
| **Owner** | Pavit |
| **Second check** | Darragh signs off Q02.3 (the diet-to-data table) and the ranking order (Q02.4 to Q02.6) |
| **Track** | A: request to basket |
| **Needs from** | 01 (the `Request` object), 05 (the diet-to-claim table sits with the hard rules) |
| **Feeds** | 03 (quantities), 04 (viability), 07 (substitutes reuse this ranking) |
| **Also Pavit's** | Two major questions to answer first: [Q08.2](08-gateway-and-orders.md) and [Q09.2](09-audit-and-explanations.md). See the index. |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| CH-03 | P0 | Get the right product type, not a lookalike from the same category, so that I don't have to correct the basket |
| CH-15 | P1 | See certificates and labels on each pick, and require one when I need it, so that sourcing promises like "MSC fish" are kept |
| CH-16 | P1 | Set an origin requirement such as "Finnish fish only" so that the organiser's sourcing rules are kept |
| SF-06 | P0 | Rank candidates good-better-best in one fixed order so that the same request always gives the same pick and the pick can be explained |
| VA-01 | P0 | Let agents search my catalogue by text, category, claim and allergen so that they find products without scraping the webshop |
| VA-13 | P1 | Shortlist locally and batch lookups so that agents don't hammer my rate limits |

## How: what's already settled

- **Shortlist locally, then ask the API.** Candidates come from `data/products_slim.jsonl`. The mock is called only for the shortlist, at most 1,000 IDs per call. [SPEC, VA-13]
- **Diets are matched on claims and allergen codes, never on names.** No allergen declaration means unknown, never safe. [GROUND_TRUTH 4.2]
- **Product type is a model judgement.** Where claims can't tell types apart (plain milk vs coffee milk in category 10400), the Gemini Decisions API answers yes/no per candidate. Below the threshold the line becomes a question. The Decisions API is in the build. [D12, D29]
- **Ranking is one fixed order** (SF-06): passes hard rules, then recipe-approved or brand match, delivery reliability, price per kg or L after rounding, then labels, origin and carbon as preferences weigh them, and confirmed stock only as the last tie-breaker (D32, which moved stock from first to last). Ties break on product ID.
- **Labels and origin** come from the data's `labels` and `origin` fields. A required one is a hard rule for that event; a preferred one only changes rank. [CH-15, CH-16]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `PRODUCT-SEARCH` | Deterministic code | Text, category, claims, allergens to exclude, origin, labels, limit | Up to 50 product records from the local catalogue | Filter `products_slim.jsonl` only, with no API call. Text is read for what the product *is*: "cheese" returns cheeses, not cheesecake, cheese snacks or a cheese slicer (head word in English and Finnish compounds, and home categories worked out from the catalogue; see `apps/api/src/search.ts`). The same input gives the same list in the same order. Also served as `GET /products`. | Q02.1, Q02.8 |
| `CATEGORY-HINT` | Decisions API, choice | Ingredient text with no category | A catalogue category, or "unsure" | Used only when the line carries no category. The catalogue has 349 categories and the API takes at most 255 options, so choose a group first, then a category. | Q02.1 |
| `DIET-FILTER` | Deterministic code | Candidates, the line's diet and allergy constraints | The candidates that pass, and why each other one failed | Apply the diet-to-data table. No allergen declaration means fail for an allergy. | Q02.3 |
| `LOOKUP` | Deterministic code | Up to 1,000 product IDs, a date | Per product: price, VAT, validity, stock (a number, "unknown" or none), available date, cut-off, sales unit | Call the mock's price and availability endpoints in batches. Turn both stock sentinels into "unknown", empty schedule lines into "not deliverable" and `error: true` into "no price". | Q02.7, Q08.9 |
| `TYPE-CHECK` | Decisions API, yes/no | Candidates, the product type asked for | Per candidate: yes, no or unsure, with the probability | Send the whole shortlist in one request. Never used for diets or allergens. | Q02.2, Q02.9 |
| `RANK` | Deterministic code | Candidates that passed every check, preferences | The same candidates in order, each with the step that placed it | Apply the fixed order in SF-06. Ties break on product ID. | Q02.4, Q02.5, Q02.6 |

**Decisions API calls in this chunk.** The question wording is a recommendation for the owner to settle.

| Function | Question type | Question asked | If unsure or unreachable |
|---|---|---|---|
| `CATEGORY-HINT` | choice, in two steps | "Which of these product groups does this ingredient belong to?", then the same for categories inside the group | Text search across all categories |
| `TYPE-CHECK` | yes/no, one per candidate | "Is this product [the type asked for]?", with the product's name, category and ingredient statement | Ask the chef to pick |

## Questions to answer

**Q02.1 How does an ingredient line find its candidate products?**
- Recommended, in order:
  1. If the line names a product ID, use it.
  2. Otherwise take the line's category hint plus a text match on the English and Finnish names, capped at 50 candidates.
  3. Apply the hard filters: claims, allergens, origin, labels, deliverable, priced.
  4. Check product type with the Decisions API.
  - In the seed event, every recipe line carries a category hint, so step 2 is reliable.
- **Answer:** _open_

**Q02.2 Is the Decisions API in, and what are the thresholds?** It is three days old.
- Recommended: confidence of 0.90 or more counts as a fact, 0.10 or less rejects the candidate, and anything between asks the chef. If the API can't be reached, use the hand-checked list that exists (the 25 plain lactose-free milks are classified in research/03) and ask for everything else.
- **Answer:** **It's in** (D29), and the thresholds are **agreed** (Jack, team review 14 Nov): 0.90 or above is a fact, 0.10 or below rejects, anything between asks a person. Still open for the owner: what happens when the API can't be reached.

**Q02.3 What is the exact table from diet or allergy to data check?**
- Recommended starting rows, to be signed off by this chunk's owner:
  - Lactose-free: has claim `FREE_FROM_LACTOSE`, and lactose (ML) is not in CONTAINS.
  - Gluten-free: has claim `FREE_FROM_GLUTEN`.
  - Vegan: has claim `VEGAN`.
  - Allergy to X: the product has an allergen declaration, and X is in neither CONTAINS nor MAY_CONTAIN.
  - A product that claims lactose-free but lists lactose as CONTAINS (4 known products) fails.
- **Answer:** **Signed off** (Darragh, 14 Nov): agreed, with one addition. Lactose-free, gluten-free and vegan rows as recommended. **Allergic to X:** the product must have an allergen declaration, and X must not be listed as CONTAINS, MAY_CONTAIN **or UNDECLARED**. The 4 products that claim lactose-free but list lactose fail.

**Q02.4 How does delivery reliability order candidates?**
- Recommended: three bands. Known and 0.95 or above ranks first, unknown second, known and below 0.95 last. Inside a band, higher is better, compared to two decimal places.
- **Answer:** **Signed off, changed** (Darragh, 14 Nov): **unreliable is 90% or lower** (not below 0.95). Other ranking factors can come before reliability where needed; reliability is not automatically the first sort key.

**Q02.5 Where do "recipe-approved" and "brand match" come from?**
- Recommended: a brand or product ID written on the recipe line, plus the remembered substitute approvals from chunk 07. Nothing is inferred.
- **Answer:** **Signed off** (Darragh, 14 Nov): agreed as recommended.

**Q02.6 How many candidates does the user see?**
- Recommended: three, labelled best, better and good, with the ranking step that separated them. The rest sit behind "more options".
- **Answer:** **Signed off, changed** (Darragh, 14 Nov): **don't label** the options best, better and good. Show them in the order the agent thinks is best, but make the trade-offs between them clearer, without an obvious ranking the reviewer would just pick. **Highlight one only if there is a clear winner.**

**Q02.7 How is price compared when the API gives no comparison price?** This happens on 164 of 999 priced products.
- Recommended: compute price per kg or L from the pack content. If that can't be computed either, the product ranks last in the price step and its line is amber.
- **Answer:** _open_

**Q02.8 What does the gateway's search endpoint accept and return?** (VA-01)
- Recommended: filters for text, category, claims, free-from codes, excluded allergens, origin, labels and a limit. It returns ID, names, brand, vendor, category, claims, allergen lists, origin, labels, sales unit and pack content. Field names are agreed with chunk 08.
- **Answer:** _open_

**Q02.9 Are Decisions API answers stored and reused?** Google doesn't say whether the same question always returns the same probability, and SF-06 promises the same request always gives the same pick.
- Recommended: store each answer against the question and the product, and reuse it. A stored answer is refreshed only when the product's data changes. The audit shows whether an answer was fresh or reused.
- **Answer:** **Agreed** (Jack, team review 14 Nov): answers are stored and reused.

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| Allergen code X99 ("no obligatory allergens") appears in CONTAINS | Never treat X99 as an allergen | _open_ |
| An allergen is listed as UNDECLARED | Not confirmed safe; fails an allergy check | _open_ |
| A product has a price but empty `scheduleLines` | Not deliverable; never a candidate | _open_ |
| The price lookup returns `error: true` | Not a candidate | _open_ |
| The API's sales unit differs from the catalogue's | Use the API's | _open_ |
| No candidate passes the hard filters | The line is red, with the filter that removed the last candidates named | _open_ |
| Two candidates tie on every ranking step | Lower product ID first, so the result repeats | _open_ |

## Done when

- "Lactose-free milk" returns only plain drinking milks, with coffee milks and piimä excluded or asked about.
- The same request run twice returns the same three candidates in the same order.
- Each candidate shows which ranking step decided its place.
