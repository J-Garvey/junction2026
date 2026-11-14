# Changes made when merging the two uploads

On 14 Nov 2026 the repo held two separate uploads:
- **Darragh's context pack** (commit `c222f0e`): challenge text, research export, data dictionary, OpenAPI spec, slim dataset, API client and build scripts.
- **Jack's research** (commit `5dd843e`): segment brief, archived deep-dive, data profile, profiling script, challenge brief and resources.

They overlapped and in places contradicted each other. Pull request #1 merged them into one version. This file lists every change, so anything can be queried on its own. Nothing was deleted outright: every removed file was either an exact duplicate or moved somewhere listed below.

To see any change in full, compare against Jack's commit:

```bash
git diff 5dd843e main -- <path>
```

## 1. Facts corrected

Each correction was checked against `data/products_slim.jsonl`, which `scripts/build_slim.py` builds from the same raw files Jack profiled.

| Claim | Before | After | Why |
|---|---|---|---|
| "Free from" allergen entries | 0 | 68,597 entries on 5,119 products | They're in the raw `nonAllergen` classification group. `profile_products.py` only read the `allergen` group. `build_slim.py` reads `nonAllergen` at lines 93–94. Reading `nonAllergen` as "declared free from" is an interpretation of the field name, so confirming it is mentor question Q31. |
| Products with an allergen declaration | 7,205 (41%) | 9,424 (54%) | 7,193 have contains / may contain entries; another 2,231 have "free from" entries only. *(Corrected in section 5: this row first said 7,205 + 2,231, which is 9,436; the 7,205 includes 12 products with only UNDECLARED entries.)* |
| Products with no declaration | 59% | 46% (8,122) | Follows from the line above. "Silence is not safety" still holds, on a smaller share. |
| Lactose-free milks for the brief's example | ~68 | 35 drinking milks | 68 is the count of names containing "laktoositon" and "maito". Only 31 of those are in category `10400` (milk drinks); the rest are cocoa drinks, quark, milk powder and a cooking-cream blend, and one lacks the lactose-free claim. Filtering by the `FREE_FROM_LACTOSE` claim in `10400` gives 35. |
| Products with listed substitutes | 189 | 188 | One product lists only itself as a substitute. 189 is still given as "including self-references". |
| API documentation | "Couldn't be fetched" | Available in `api/openapi.json`; calls verified | Ping, availability and price were all called successfully on 14 Nov. Jack's open API questions are answered below. |
| Prices per customer | Unknown | The mock ignores `customer`; `netPriceFound` false on every call | It's still unknown whether production prices are contract-specific (Q29). |
| Partial quantities | Unknown | One schedule line per product, `availableAmount` plus an `availableDate` that may differ from the requested date | So a split delivery can't be expressed (Q30). |

These figures matched in both uploads and were not changed: 17,546 products, 648 vendors, 349 categories, nutrition and ingredient coverage (Jack's raw-file counts kept), reliability coverage and thresholds, carbon coverage, every label count, and the counts of contains / may-contain / undeclared entries.

Source facts that differ but are both sourced were kept side by side, not corrected: Valio Aimo's 20,000 products (sustainability review) vs 25,000 product names (brief), and Valio's revenue of €2.4B vs €2.3B (both appear in the brief).

## 2. Jack's files

| File | Change |
|---|---|
| `README.md` | Rewritten as the entry point for the whole repo. **Kept:** Jack's title, intro, goal and quick-start idea. **Added:** the product direction (output is a buy order or one clear question; asking is tuned to each customer's risk; sellable to wholesalers), a status list, links to `QUESTIONS.md` and this file, the full repo map (Darragh's files were missing from it), corrected key findings, and a quick start that works with the committed data. **Changed:** the segment shortlist moved out of "Status" into `QUESTIONS.md` question 1, because the two research passes disagree on it. |
| `.gitignore` | Added a comment explaining that the `.env` line has no effect while `.env` is committed. Jack's lines are unchanged. |
| `challenge/brief.txt` | Replaced with the complete brief. Jack's version was a subset: every one of its lines is still there. **Added from Darragh's copy:** the resources section, company info, judging criteria and prizes. The credentials were replaced with a pointer to `.env`, and the dashboard navigation was left out. |
| `challenge/resources.md` | Two notes added: the repo now commits the slim data and `.env` (an open team decision), and `scripts/fetch_raw.sh` downloads the raw files through the API's download endpoints. The auth line now says the key is in `.env`, and notes that Python's default user-agent gets HTTP 403. The heading "Data files (download, do not commit)" became "Data files", since the slim data is committed. Links and the mentor table are unchanged. |
| `research/01-customer-options-brief.md` | **Header:** a "Reconciled" note. **"What we know about Valio Aimo":** added the brief's 25,000 product names, the €2.4B / €2.3B inconsistency, and Heinon Tukku's figures from Darragh's research. **"What the challenge data can and can't support":** corrected the allergen, substitute and lactose-free milk bullets, and replaced the "couldn't read the API docs" bullet. **Questions section:** moved word for word to `research/mentor-questions.md` with the same numbers (Q1–33), including "What the answers will tell us". It's replaced by a link. **"How we'll make the call", step 1:** now links to the questions file. Everything else, including the candidates, side-by-side table, scoring criteria, glossary and sources, is unchanged. |
| `research/02-initial-deep-dive.md` | One note added above the guardrails table: guardrails are deferred and will be designed later, and mentors said € spend limits aren't an expected pain point. The table itself is unchanged. |
| `research/03-data-profile.md` | Headline table corrected as in section 1, with the old figures noted beside the new ones. "What this means for design" points 1 and 5 updated to match. "Not yet checked" replaced by an "API behaviour" section answering it, plus a shorter "Still to check" list. The label table and allergen-code paragraph are unchanged. |
| `scripts/profile_products.py` | Now also counts `nonAllergen` ("free from") and any allergen declaration. It counts substitutes with and without self-references, and counts lactose-free milk by the `FREE_FROM_LACTOSE` claim in category `10400`, still printing the name-match count for comparison. The usage paths now match `fetch_raw.sh` (`data/raw/...`). The original counting is kept as separate output lines. Tested on synthetic input only, not on the raw 87 MB file. |

## 3. Darragh's files

| File | Change |
|---|---|
| `docs/challenge.txt` | **Removed.** Its content is now `challenge/brief.txt`. |
| `docs/research-export.txt` | **Removed.** Converted to `research/04-segment-research-chain-first.md`: same content, with its tables restored, outdated unknowns marked "[now known]", and the mentor questions moved to the shared list. |
| `data/product_data_schema.json` | **Removed.** It was byte-identical to `challenge/product_data_schema.json`, which stays. |
| `CLAUDE.md` | File table updated for the new layout; a "Product direction" section added. |
| `docs/data-dictionary.md` | The schema path now points to `challenge/`. The `free_from` field is documented as coming from `nonAllergen`. The allergen coverage line is broken down. |

## 4. New files

| File | What |
|---|---|
| `research/04-segment-research-chain-first.md` | Darragh's segment research, converted from the text export. |
| `research/mentor-questions.md` | One list of mentor questions. Q1–33 are Jack's, unchanged except for answered-so-far notes on Q29–31. Q34–45 were added from Darragh's list and the data review. Darragh's questions that duplicated Jack's were merged into Q1, Q2, Q25, Q28 and Q32. Questions the data already answers are listed at the end. |
| `QUESTIONS.md` | Open team decisions: segment, who pays, credentials and data in the repo. |
| `CHANGES.md` | This file. |

## 5. Ground-truth pass (14 Nov 2026)

Six review agents checked every categorical fact in the repo against the raw catalogue (fetched 14 Nov), the mock API (about 20 read-only calls), the brief, GS1 code lists and public sources. Every result was then spot-checked. The verified facts are in **[GROUND_TRUTH.md](GROUND_TRUTH.md)**; its section 9 lists each correction. Team decisions (segment, payer, credentials, guardrails, product direction) were not touched.

| File | Change |
|---|---|
| `GROUND_TRUTH.md` | **New.** Every verified fact, tagged with how it was checked. |
| `scripts/build_slim.py` | **Bug fix:** names like "12x500ml" stored the whole case as the content of one base unit, so `net × su_in_bu` counted the case twice. The "N x" multiplier is now applied only when no case-level pack unit holds N base units. Against the price API, 909 of 924 decidable products now match (215 before). Also opens files as UTF-8, so it runs on Windows. |
| `data/products_slim.jsonl`, `data/products_core.csv` | Rebuilt: `net_kg` / `net_l` changed on 787 products. Nothing else changed; `ingredients.jsonl` and `categories.csv` are byte-identical. None of the 35 lactose-free milks changed. |
| `scripts/profile_products.py` | Opens files as UTF-8; prints all 35 lactose-free products, not the first 25. Run on the real raw file: every headline figure reproduces. |
| `CLAUDE.md` | Deadline added. Judging wording restored to the brief's ("not just isolated pieces", "well-justified technical choices"). API section corrected: `requestedDate` is ignored, the Stock sentinel, empty schedules on real products, past cut-offs, `netPriceFound` true on 16 of 1,000, `catalogPrice` vs `listPrice`, `salesUnit` mismatch, Terminal string. The two unsourced team rules are marked, not removed. "Not yet known" trimmed to what is still unknown. |
| `docs/data-dictionary.md` | Allergen, claim, label and nutrient glossaries are now documented against GS1 (5 codes added, 7 resolved, X99 is an absence code). UNDECLARED defined. Units marked as inferred except ST. Temperature marked undocumented. Allergen breakdown, conversion section, VAT values, `lot` definition and contradictions corrected. |
| `research/03-data-profile.md` | Allergen breakdown, lactose-free list (25 plain milks of 35, with ids), name-match breakdown, free-from evidence and API section corrected. |
| `research/01-customer-options-brief.md` | Facts only: direct sales definition, wellbeing counties incl. Helsinki, Kespro peer group, €4B source, Nov 2025 trend context, milk count, prices, Scandic wording, Fazer year, Attendo dates. Shortlist, ratings and criteria untouched. |
| `research/02-initial-deep-dive.md` | Framework-contract and special-diet claims marked as not supported by their sources; wellbeing counties clarified. |
| `research/04-segment-research-chain-first.md` | Facts only, marked **[checked]**: Atria figures (base, tense, diners not buyers), unsourced channel table, Heinon Tukku date, NoHo date, Risku-Norja data year, allergen-duty legal basis, brief answers, prices, cut-offs, standards statuses. Recommendation and verdicts untouched. |
| `research/mentor-questions.md` | Answered or partly answered questions marked with what is now known. |
| `README.md` | Deadline, link to `GROUND_TRUTH.md`, corrected milk finding, API sentinel note. |
| `QUESTIONS.md` | One fact added under question 3 (the credentials are on the public challenge page). The decision itself is untouched. |

