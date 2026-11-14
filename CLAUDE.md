# Junction 2026 — Valio Aimo "Trusted Trade Agents"

Hackathon context pack. Read this first; open the linked files only when needed. **Verified facts are in `GROUND_TRUTH.md`; it wins where another file disagrees.**

**Final submission deadline: Sun 15 Nov 2026, 10:00** (junction2026.com/about.md).

## Goal
Prototype the interface and operating model that lets an external purchasing agent work with Valio Aimo's (mocked) wholesale systems. Not a marketplace, not a chatbot skin on the webshop.

Must have:
1. Structured product, price and availability lookup for an external agent.
2. Inquiry → order on fixed prices (no negotiation).
3. Permission and human-approval management: what the agent decides alone, what needs sign-off.

Optional: delivery reliability and sustainability comparison; substitution and exception handling; human-readable audit trail.

Reference request: "I need 1,000 litres of lactose-free milk by Monday. Find an option that meets our requirements based on price and availability."

## Judging
| Weight | Criterion |
|---|---|
| 30% | Working end-to-end demo: request → lookup → order/approval in the mock environment, not just isolated pieces |
| 20% | Matches what the buyer asked for, least manual correction |
| 20% | Autonomy and controls: guardrails, sign-off rules, logged and auditable decisions |
| 15% | Robustness: partial availability, substitutions, delivery constraints |
| 15% | Openness: open documented standards, stated assumptions, well-justified technical choices, credible path to production |

## Team rules
- Valio Aimo mentors are on site and can be asked anything.
- Public/private data exposure is not a design constraint. All data is synthetic. *(The second sentence is in the brief. The first is not, and no source is recorded; the brief's headline asks how to work "without exposing real systems, confidential data or the marketplace roadmap".)*
- SI units. *(Team convention; not in the brief.)*

## Files
| Path | What |
|---|---|
| `README.md` | Team entry point: goal, open team decisions, repo map, key findings |
| `GROUND_TRUTH.md` | Verified facts (data, API, brief, codes, public sources), each tagged with how it was checked |
| `challenge/brief.txt` | Full challenge text (source of truth for requirements) |
| `challenge/resources.md` | Download links, API docs, auth, mentors |
| `challenge/product_data_schema.json` | JSON Schema of the raw catalogue |
| `research/01-customer-options-brief.md` | Segment candidates A–G (shortlist A, B, C, E), glossary, scoring criteria |
| `research/02-initial-deep-dive.md` | Archived public-kitchen pass; draft guardrails, trust protocol, audit trail, demo pattern |
| `research/03-data-profile.md` | Data coverage and API behaviour |
| `research/04-segment-research-chain-first.md` | Chain-first segment research, order-quantity primer |
| `research/05-spike-orders-under-time-pressure.md` | Which customers place large, urgent, variable orders; best-fit segments for the agent; how wholesalers and ordering tools handle rush orders |
| `research/06-valio-aimo-conversation-2026-11-14.md` | First-hand notes from Valio Aimo (14 Nov): hotels first, catering/event orders, substitution pitfalls, lead times |
| `research/notes/spike-orders/` | Cited source notes behind research/05 |
| `research/mentor-questions.md` | The single list of mentor questions (Q1–49) |
| `docs/data-dictionary.md` | Every field of the slim dataset, code glossaries, measured facts |
| `api/openapi.json` | Full OpenAPI 3.1 spec of the mock API |
| `data/products_slim.jsonl` | Main product table, 17 546 rows, carbon and reliability joined in |
| `data/products_core.csv` | Flat subset for grep |
| `data/ingredients.jsonl` | Ingredient statements |
| `data/categories.csv` | Category code decode by example |
| `scripts/aimo_api.py` | API client (stdlib) and CLI |
| `scripts/build_slim.py` | Rebuilds `data/` from the raw files |
| `scripts/fetch_raw.sh` | Downloads the raw 87 MB catalogue and CSVs into `data/raw/` |
| `scripts/profile_products.py` | Data-coverage profile from the raw files |
| `.env` | `AIMO_API_KEY`, `AIMO_PORTAL_PASSWORD` |
| `QUESTIONS.md` | Open team decisions |
| `CHANGES.md` | What changed when the two uploads were merged |

## Product direction
- Output is either a buy order or one clear question for the owner, as complex as it needs to be and no more. The goal is saving the owner's time.
- How often the agent asks is tuned per customer risk profile and situation. The agent must not make mistakes.
- Guardrails are designed separately, later. Mentors said € spend limits are not an expected pain point. (The brief itself names "spend threshold" as an example sign-off trigger.)
- Aim: sellable to Valio Aimo or a similar wholesaler after Junction. Segment and payer are open team decisions (see `QUESTIONS.md`).

## Mock API
Base `https://junction26.valioaimo.fi`. Header `X-API-Key`. Docs at `/docs`, `/redoc` (the live docs and `/openapi.json` sit behind an event-password page; use `api/openapi.json`).

| Method | Path |
|---|---|
| GET | `/api/ping` |
| POST | `/api/availability` |
| POST | `/api/price` |
| GET | `/api/products/download`, `/api/delivery-reliability/download`, `/api/carbon-footprint/download` (redirects; `curl -L`) |

Both POST endpoints take the same body:
```json
{"customer": "123", "requestedDate": "2026-11-16", "products": ["460013", "460063"]}
```
`requestedDate` = desired delivery date, **but the mock ignores it** (identical results for past, weekend and far-future dates). 1–1000 product codes; more, or an empty list, → HTTP 422. `customer` has no effect in the mock.

Availability, per product: `closingTime` (order cut-off), `salesBlock`, `logisticModel`, `scheduleLines[0]` with `availableAmount` (in sales units), `availableDate` (always the next Monday, 2026-11-16, in the mock; absent when the amount is 0), `salesUnit`. Empty `scheduleLines` = not deliverable on any date; this is 24% of real catalogue products, not just unknown ids.

Price, per product: `catalogPrice.value` (per sales unit, ex tax), `priceWithTax`, `comparisonPrice` per `comparisonUnit` (`KG` or `L`), `tax.taxRate`, `listPrice`, `netPriceFound`, `error`. `catalogPrice` is what the customer pays; `listPrice` is the pre-discount reference (higher on 997 of 999 products). `comparisonPrice` is missing on 164 of 999.

## Constraints that shape the design
- The API is READ-ONLY. No order, reservation or approval endpoint exists. The order, approval and audit layer is ours to build.
- Rate limits are undisclosed. Shortlist from `data/products_slim.jsonl`, then call the API for the shortlist only. Never sweep the catalogue.
- "Terminal" products ship from the supplier's warehouse and always report `availableAmount` 999999 (unknown). "Stock" products have real quantities **except** 142 of 566 sampled, which return a sentinel of 9,999,999,999 base units divided by the sales-unit size (e.g. `9999999999` ST, `833333333` KI). Treat both sentinels as unknown.
- Only one schedule line is returned per product, so a split delivery is not expressed by the API.
- Filter lactose-free with the `FREE_FROM_LACTOSE` claim, not by name, and not by `free_from` (Valio products have no free-from lists). Category `10400` + the claim = 35 products, all Valio or Arla: 25 plain milks, 4 piimä, 3 coffee milks, 2 flavoured coffee-milk drinks, 1 portion creamer.
- `has_allergen_data: false` means no declaration, not allergen-free. Treat as unknown.
- Reliability exists for 25% of products and carbon for 63%. Missing = unknown.
- Listed substitutions exist for 188 products only. Anything else must be inferred (category, allergens, claims, nutrition).
- Convert need → sales units with `net_l × su_in_bu` (see data dictionary), and cross-check with `catalogPrice / comparisonPrice`. Prefer the API figure when it exists. The 14 Nov rebuild fixed a double count on "12x500ml"-style names (matches the API on 909 of 924 checked); ~15 nested names ("8x8x45g") are still wrong.
- Use the API's `salesUnit`, not slim `su`: they differ on 11 of 761 sampled products.

## Observed API behaviour (first calls, 2026-11-14)
- Timestamps are ISO 8601 with a numeric offset and no colon: `timeNow` `2026-11-14T12:21:23+0200`, `closingTime` `2026-11-15T17:00:00+0200`, `requestedDate` echoed as `2026-11-16T00:00:00+0200`. `availableDate` is a plain date, `2026-11-16`.
- Cut-offs for Monday delivery: Sun 15 Nov 17:00 for most Stock products; Fri 13 Nov 13:00 for 46 Stock; 10–12 Nov for all Terminal. Cut-offs already past at `timeNow` still show Monday delivery; the mock does not resolve this.
- `logisticModel` is exactly `"Stock"` or `"Terminal"` (195 of 1,000 sampled are Terminal, all with 999999). The field is absent when `scheduleLines` is empty.
- `netPriceFound` is true on 16 of 1,000 products, the same for every customer value. `tax.taxRate` seen: 13.5, 25.5 and 10.0.
- On Windows, run the Python scripts with `python -X utf8` or use the 14 Nov versions, which open files as UTF-8.
- Unknown product id: availability returns the id with `salesBlock: false` and empty `scheduleLines` (no `closingTime` or `logisticModel`); price returns `error: true` with no price fields. HTTP 200 in both cases.
- Price: `currency` EUR; each price block has `validFrom`/`validTo` (`9999-12-31` = open-ended); `tax.taxValue` is also returned.
- The server returns 403 to Python's default `Python-urllib` User-Agent. `aimo_api.py` sends its own User-Agent.

## Not yet known
- Official meanings of unit, category and temperature codes. (Allergen, claim, label and nutrient codes are now verified against GS1; see the data dictionary.)
- Whether `allowedLotSize` 0.01 is real. The schema defines it as the order step in sales units; the API does not use it.
- What the separate `nonAllergen` group means. Its values all carry `unit: FREE_FROM`.
- Webshop test accounts (not issued).
- Junction submission format (the deadline is known: Sun 15 Nov 10:00).
