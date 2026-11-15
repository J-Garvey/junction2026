# DARRAGH-CONTINUE

**For the AI picking this up.** This file is self-contained. It hands over Darragh's unfinished product-search work.

- **Code:** branch `DARRAGH-CONTINUE` (commit `3e5347c`; the same commit is also on `feat/search-tuning`). Nothing from it is on `main`.
- **The same work as a patch:** `docs/handoffs/search-tuning/search-tuning-wip.patch`.
- **Offline search check scripts:** `docs/handoffs/search-tuning/scripts/`. None of them call the API.

How to continue:

1. Read `AGENTS.md` and `CLAUDE.md` first. Use one worktree per task, open a pull request to `main`, and never push to `main` directly.
2. Create a worktree from branch `DARRAGH-CONTINUE`.
3. Run the tests from `apps/api` with `pnpm test`. They have **not** been run on this code yet.
4. Work through section 5 ("Not done yet") in order. Start with removing the 3-option limit, which was Darragh's first request.
5. Never sweep the Valio Aimo mock API: its rate limits are undisclosed. Test search offline against `data/products_slim.jsonl` with the scripts.

## Update, 15 Nov: continued on branch `feat/search-tuning-continue`

Darragh's branch, merged with `main`, then section 5 worked through. Sections 1 to 5 below are the original handoff, unchanged.

| Section 5 step | Done |
|---|---|
| 1. Run the tests | Run. Two failed ("chicken burger"): the looser home rules for unknown words now apply only to narrow words, not product-type words like "burger" |
| 2. Remove the 3-option limit | The best 5 show, and "Show all N" loads every candidate. Replacements show 3, later-delivery options 2, and "Or instead" 2 per need, each with "Show all". The API no longer cuts late options at 2. Product search pages: `limit` up to 200, `offset`, and `total`/`nextOffset` in the gateway response |
| 3. Possible matches and "did you mean" | `Need.searchHelp`, only when the shortlist is empty. Spellings are checked to find products ("chese" → cheese). Possible matches are mention-only products, or what the rest of the query finds ("unicorn chicken burger"), with the reason. None is looked up or ordered: picking one re-checks the item with its id pinned |
| 4. Facets | `Candidate.category` and `categoryLabel`. Chips narrow candidates and replacements when they span ranges ("Pepper, ground · ambient" or "Chili, pepper") |
| 5. Rank by relevance | **Not changed: the team decides SF-06 / D34.** Precision fixes instead, so price can pick any shortlisted product safely |
| 6. Evaluation test | `apps/api/test/search-eval.test.ts`: about 50 queries, and every shortlisted product must be the thing asked for |
| 7. Category-tags export | `pnpm --filter @aimo/api tags` writes `data/category_tags.json` |
| 8. Ask for a quantity | The rules parser no longer defaults to 1 pcs. No number at all means REQ-02 asks "How much?" |
| 9. 429 handling | Two retries with back-off, honouring Retry-After (capped). Then 503 `upstream_rate_limited` with Retry-After, never a 500 "internal" |

**Precision fixes, checked by the eval test:**
- coffee beans works again;
- honey no longer lists honey chicken or honeydew;
- eggs no longer list albumen or egg white;
- onions no longer list spring onion, leek or garlic;
- flour no longer lists breadcrumbs;
- "sparkling water" finds carbonated and Vichy water;
- "vegan cheese" finds the plant cheese range;
- peas no longer lists falafel;
- "pizzasauce" is not a tomato.

**Still open:**
- **vanilla:** no home category, so 13 flavoured products are shortlisted at tier 2.
- **cucumber, water, pepper:** they span several ranges, which the chips now handle, but the automatic shortlist still mixes the ranges.
- **Rank-by-relevance:** remains a team decision.

The offline probes are now in `apps/api/src/scripts/` as `pnpm --filter @aimo/api search:offline`, `search:shortlist` and `search:roles`.

---


Status: **work in progress, stopped on request.** Nothing here is live on `main`. The code is on branch `DARRAGH-CONTINUE` (commit `3e5347c`, based on `0d02ad9`). It is also saved as [`docs/handoffs/search-tuning/search-tuning-wip.patch`](docs/handoffs/search-tuning/search-tuning-wip.patch).

**The API test suite has not been run on this code.** A run was started and then stopped. Run it before merging anything. *(Since run and fixed: see the update above.)*

## 1. The request (Darragh's words)

First request, the search audit:

> when i search cake it only shows pancake, ricecake and ricecake no actual cake; when i search beans - nothing comes up... try many things... (on the latest version btw)... then suggest fixes

Second request, the one this work follows:

> firstly - the product look Scope is limited by three outputs. This is not the case. This is not what it should be. It should not be three outputs. it should be as many as needed and load all should be avalible
>
> maybe start generating tags and such for each item category.
> then work though all the suggestions that you did - write implementations for tjem
> write your own tests and then make sure that it is a good fit for what we need for this product lookup.
> then you should keep trying differnent implemetations and tuning to be able to accurately look up items for product search querying.

## 2. How search works today (on `main`)

1. `/api/messages` parses the request. Without an OpenAI key the rules parser handles it.
2. `/api/requests` creates the plan.
3. `shortlist()` in `apps/api/src/agent/match.ts` calls `searchMatches()` and keeps tier < 3, up to `FIXED.searchLimit` (50).
4. One gateway lookup is made for the whole shortlist.
5. `rankNeed()` sorts the candidates:
   1. known price
   2. recipe-approved
   3. price per kg or L
   4. reliability
   5. id

   This is the fixed SF-06 / D34 order.
6. The UI shows some of the candidates.

Relevance lives in `apps/api/src/search.ts`:

- Each query term is read against both names as **head**, **modifier** or **mention**.
- **Home categories** are the categories where the term is mostly the head.
- **Tiers:**
  - 0: head in a home category
  - 1: in a home category, but the name doesn't say so outright
  - 2: head outside the home categories
  - 3: mention only
- `bestGroup` keeps the best group of tiers and round-robins across categories.

## 3. Audit findings (before any change, about 70 queries, offline only)

**26 of the 70 queries returned an empty shortlist.** Any word without a `LEXICON` entry was forced to tier 3 (old `search.ts` line 531). Affected: beans, chickpeas, lentils, peas, tofu, spaghetti, pancakes, lettuce, cucumber, avocado, pepper, hummus, water, honey, kakku, papu, "chicken breast" (its head word is "breast"), frozen peas, vegan cheese.

**Other misses:**

| Problem | Queries |
|---|---|
| Required qualifiers emptied the results | birthday cake, wedding cake, sparkling water |
| Typos gave nothing | chese, strawbery |
| Wrong products in the results | "cake" mixed in pancakes (41830) and rice cakes (21120). The round-robin gave them equal slots, and price per kg then put them in the top 3. |
| "beans" included coffee beans | category 22410 |
| Price-first ranking picked the wrong thing | flour → breadcrumbs (Finnish "korppujauho"), onions → spring onion |
| Quantity default | A quantity defaults to "1 pcs", which gave an overshoot of 11,900%. |
| Rate limit | A 429 from the mock API surfaces as a 500 "internal", with no retry. |

**These already worked well:** milk, cream, cheese, butter, salmon, beef, pork, ham, yoghurt, quark, feta, oat milk, orange juice, jam*, cheesecake, chocolate cake, rice, napkins, juusto, leipä, kerma, voi, kana, lohi, mansikka.

\*Jam turned out to be weak. See section 4.

### The fixes I proposed

1. Allow unknown words in their home categories. A word with no home stays at tier 3, so "houses" stays out.
2. Rank by relevance before price, and give categories slots in proportion to their size.
3. Add a `cake` lexicon entry that excludes pan-, rice-, corn-, fish- and crab- cakes.
4. When a qualifier is unmatched, show "possible matches" with a note, without auto-shortlisting them.
5. Never show nothing when tier-3 matches exist: show them as "possible, please confirm", with "did you mean".
6. Disambiguate words like beans and pepper (a question, or category chips).
7. Build Finnish↔English word pairs automatically from the bilingual names.
8. Ask for a quantity instead of defaulting to 1 pcs.
9. Back off and retry on a 429, with a clear message.
10. Add an offline regression test over the query set.

## 4. What was done (on branch `DARRAGH-CONTINUE`)

### New: `apps/api/src/categoryTags.ts`

The vocabulary is built from the catalogue at start-up. Nothing is hand-listed.

- `buildCategoryTags(all)`: per-category **tags** in English and Finnish. A tag is a word that names at least 2 products and at least 10% of the range, and whose products are at least 10% in that category. Finnish tags are compound tails that are real words, for example "kakku" out of "juustokakku". Each category also gets a label and examples.
- `fiToEn(word)`: maps a Finnish word to the English word the catalogue uses for it:

  | Finnish | English |
  |---|---|
  | papu | bean |
  | kakku | cake |
  | herne | pea |
  | kikherne | chickpea |
  | linssi | lentil |
  | kurkku | cucumber |
  | hunaja | honey |
  | vesi | water |
  | pippuri | pepper |
  | sipuli | onion |

  A standalone word outvotes compounds, so "sipuli" maps to onion even though "valkosipuli" is garlic.
- `enToFi(word)`: finds the Finnish stems for an English word, for example bean → papu/pavu, lentil → linssi, cake → kakku, spaghetti → spagetti.
- `fiVariants`: Finnish consonant gradation, for example papu/pavu and kakku/kaku.
- `didYouMean`: Damerau edit distance against the catalogue's words, for example chese → cheese, strawbery → strawberry, tomatos → tomato.
- `isCompound(a, b)`: detects that "chick peas" is the catalogue word "chickpeas".
- `enWordCount`.

**Not yet done:** the export script. The plan was `pnpm --filter @aimo/api tags`, writing `data/category_tags.json`.

### Changes to `apps/api/src/search.ts`

- `useCatalogue(all)` is called from `catalog.ts`. It lets `queryTerms` mine words it doesn't know.
- An unknown word is now an `adhoc` term:
  - A Finnish word is mapped to English. If that English word has a lexicon entry, the entry is used, so "kakku" uses the cake entry.
  - An English word gets the Finnish stems mined from the catalogue.
- **The trust gate replaces the old blanket tier-3 rule.** An unknown word gets tier < 3 only when all of these hold:
  - the product's name calls it that word (role is head);
  - the product is in one of the word's home categories;
  - if a category hint is given, it is the word's own home;
  - the category isn't the home of another product ("coffee beans").
- **Homes for unknown words:**
  - a 10% share of the category (`HOME_SHARE_ADHOC`), or
  - at least 3 heads where at least half the products naming the word are it (`ADHOC_HEAD_RATIO`).
- **`kindOfCategories`:** a home category where at least 60% of the heads follow the same lexicon noun becomes that noun's kind. So coffee beans and vanilla beans drop out of "beans", unless the query says "coffee".
- **Stricter roles for unknown words:**
  - An English compound ("smokehouse", "chickpeas" for "pea") counts as a mention.
  - A Finnish compound with a prefix ("kikherne" for "herne") counts as a mention.
  - An unknown word after a product noun is a filling ("Gyoza Dumplings Tofu").
- **New lexicon entry `cake`:** en cake, gateau, torte; fi kakku, kakut, torttu. It excludes pancakes, rice cakes, corn cakes, oat cakes, fish cakes, crab cakes, potato cakes, salmon cakes and rye cakes, in English and Finnish (pannu-, riisi-, maissi-, kala-, rapu-, kaura-, ruis-, peruna-, lohi-).
- **Occasion words are filler:** birthday, wedding, anniversary, graduation, banquet, conference, celebration and guests are dropped. `headIndex` skips filler too. So "birthday cake" means cake.
- **Jam:** the Finnish stem now picks the longer word on a tie ("hillo", not "hill"). Jam went from 0 to 50 shortlisted.

### Offline audit after the changes (shortlist size, then a sample)

| Query | Shortlisted | Notes |
|---|---|---|
| cake, kakku, birthday cake, wedding cake | 50 | real cakes, no pancakes or rice cakes |
| beans, papu | about 50 | no coffee beans; "coffee beans" alone returns 33 |
| peas, herne | 10 | real peas; one falafel product still slips in |
| chickpeas | 12 | |
| lentils | 10 | |
| tofu | 18 | |
| spaghetti | 20 | |
| lettuce | 31 | |
| cucumber | 47 | mostly pickled; see open issues |
| avocado | 7 | |
| hummus | 20 | |
| honey | 15 | |
| water | 50 | includes tonic water |
| pepper | 50 | spice and fresh mixed |
| frozen peas | 5 | |
| jam | 50 | |
| houses | 0 | still blocked, as the AUD-MAIN-008 test requires |

**Still empty:** chese, strawbery, sparkling water, vegan cheese. These need fix 5: show possible matches and "did you mean".

The numbers above come from before the last small edit, which raised the head minimum to 3 and added the filling rule. That edit was applied, but the audit was not re-run after it.

## 5. Not done yet (next steps, in order)

1. **Run the tests:**

   ```bash
   cd apps/api && pnpm test
   ```

   Then fix what breaks. Constraints in `apps/api/test/search.test.ts` that must still hold:
   - "cheese" returns 50 results, all `^106|^4177`, across more than 8 categories;
   - juusto equals cheese;
   - houses: the shortlist is empty and every match is tier 3;
   - oregano with category 20033 is tier 3 only;
   - "unicorn chicken burger", "chicken dragonfruit burger" and "unlistedbrand milk" return `[]`;
   - "chicken" with category 18761 returns `[]`;
   - the paging-prefix test for blueberries;
   - the plant-analogue exclusions.
2. **Remove the 3-option limit (the user's first point). Not started.**
   - `apps/app/src/ui/PlanView.tsx:175`, `Candidates`: `need.candidates.slice(0, 3)`. Show more, with a "Show all (N)" toggle.
   - `apps/app/src/ui/ProductReviewItem.tsx`: replacements `.slice(0, 2)` and lateOptions `.slice(0, 2)`.
   - `apps/app/src/screens/Request.tsx:309`: Proposal alternatives `.slice(0, 2)`.
   - `apps/api/src/agent/events.ts:322`: safe dish alternatives `.slice(0, 3)`.
   - `apps/api/src/agent/match.ts`: `lateDeliveryOptions` `.slice(0, 2)`.
   - `FIXED.candidatesShown` is 3 and `FIXED.searchLimit` is 50 in `apps/api/src/rules/catalogue.ts`. Consider raising `searchLimit` to 100. One lookup batch allows at most 1,000 IDs, so check how a multi-need event adds up.
3. **Possible matches and "did you mean" (fixes 4 and 5).** When the shortlist is empty, attach to the need:
   - the tier-3 matches, or the results with the unmatched qualifier dropped, labelled "possible, confirm";
   - `didYouMean()` suggestions.

   Show them in the "No matching product" callout in `ProductReviewItem`, with a button to re-run the item. Keep them out of auto-shortlisting, which is what the existing tests protect.
4. **Facets for ambiguous words (fix 6).** When a head's home categories have different labels (pepper: spice or fresh; cucumber: pickled or fresh; water: mineral or tonic), show category chips from the tag labels. This needs a `category` field on `Candidate` in `packages/contracts`.
5. **Rank by relevance (fix 2).** This would change the decided SF-06 / D34 order (`docs/prd/02-matching-and-ranking.md`, `docs/prd-context.md`). The team should decide before anyone changes it. An alternative is to keep the shortlist precise instead, for example by treating "korppujauho" (Finnish compound only, with no English "flour") as a mention.
6. **An evaluation test.** Add `apps/api/test/search-eval.test.ts`: each query with expected and forbidden name or category patterns, checking shortlist precision across all of it (price ranking can pick any shortlisted item) and that results aren't empty. Start from the query list in `scripts/search_offline_audit.ts`.
7. **The category-tags export script** (`data/category_tags.json`), plus a package script.
8. Ask for a quantity instead of defaulting to 1 pcs (`apps/api/src/agent/parse.ts:192`, `:375`). This touches many parser tests.
9. Handle 429 from the mock: back off, retry and show a clear message, instead of a 500. The upstream client is under `apps/api/src/aimo/`.

### Known open issues

- **cucumber:** pickled cucumbers outnumber fresh ones.
- **water:** includes tonic water.
- **pepper:** spice and vegetable peppers are mixed.
- **peas:** includes "Sevan Falafel Yellow Peas".
- **vanilla:** has no home category, so tier-2 flavoured products are shortlisted.
- **eggs:** shortlists egg albumen powder (the whole egg-products range 10592 counts).

## 6. Tools in docs/handoffs/search-tuning/

`scripts/` holds offline probes. None of them call the Valio Aimo API. They import with relative paths (`../catalog.ts`), so copy them into `apps/api/src/scripts/` and run them from `apps/api`:

```bash
pnpm exec tsx src/scripts/search_offline_audit.ts            # about 70 queries: tiers, shortlist size, home, top 3
pnpm exec tsx src/scripts/search_offline_audit.ts beans peas  # just these
pnpm exec tsx src/scripts/q.ts "frozen peas" 40               # the shortlist with tier and category
pnpm exec tsx src/scripts/roles.ts jam '\bjam\b' 10           # why products get each role
pnpm exec tsx src/scripts/tags_probe.ts                       # tags, Finnish↔English mapping, did-you-mean
```

On this Windows machine `npx` is blocked in PowerShell. Run tsx through node instead:

```bash
node node_modules/tsx/dist/cli.mjs <script>
```

Run that from `apps/api`, with `C:\Program Files\nodejs` on PATH.

## 7. Rules to keep

- **Don't sweep the mock API.** Its rate limits are undisclosed, and a 429 was hit during this audit. Shortlist locally and look up only the shortlist.
- **Use one worktree and branch per task.** Open a PR to `main`; never push to `main` directly.
- **Never use a bare `git stash`.**
- **The ranking order SF-06 / D34 is a team decision.** Don't change it silently.
