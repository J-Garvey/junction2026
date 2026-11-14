# Junction 2026 — Valio Aimo "Trusted Trade Agents"

Hackathon context pack. Read this first; open the linked files only when needed.

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
| 30% | Working end-to-end demo: request → lookup → order/approval in the mock environment |
| 20% | Matches what the buyer asked for, least manual correction |
| 20% | Autonomy and controls: guardrails, sign-off rules, logged and auditable decisions |
| 15% | Robustness: partial availability, substitutions, delivery constraints |
| 15% | Openness: open documented standards, stated assumptions, credible path to production |

## Team rules
- Valio Aimo mentors are on site and can be asked anything.
- Public/private data exposure is not a design constraint. All data is synthetic.
- SI units.

## Files
| Path | What |
|---|---|
| `docs/challenge.txt` | Full challenge text (source of truth for requirements) |
| `docs/research-export.txt` | Customer-segment research and the mentor question list |
| `docs/data-dictionary.md` | Every field of the slim dataset, code glossaries, measured facts |
| `api/openapi.json` | Full OpenAPI 3.1 spec of the mock API |
| `data/products_slim.jsonl` | Main product table, 17 546 rows, carbon and reliability joined in |
| `data/products_core.csv` | Flat subset for grep |
| `data/ingredients.jsonl` | Ingredient statements |
| `data/categories.csv` | Category code decode by example |
| `scripts/aimo_api.py` | API client (stdlib) and CLI |
| `scripts/build_slim.py` | Rebuilds `data/` from the raw files |
| `scripts/fetch_raw.sh` | Downloads the raw 87 MB catalogue and CSVs into `data/raw/` |
| `.env` | `AIMO_API_KEY`, `AIMO_PORTAL_PASSWORD` |

## Mock API
Base `https://junction26.valioaimo.fi`. Header `X-API-Key`. Docs at `/docs`, `/redoc`.

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
`requestedDate` = desired delivery date. 1–1000 product codes; more → HTTP 422. `customer` has no effect in the mock.

Availability, per product: `closingTime` (order cut-off), `salesBlock`, `logisticModel`, `scheduleLines[0]` with `availableAmount` (in sales units), `availableDate` (may differ from the requested date), `salesUnit`. Empty `scheduleLines` = not deliverable on any date.

Price, per product: `catalogPrice.value` (per sales unit, ex tax), `priceWithTax`, `comparisonPrice` per `comparisonUnit` (`KG` or `L`), `tax.taxRate`, `listPrice`, `netPriceFound`, `error`.

## Constraints that shape the design
- The API is READ-ONLY. No order, reservation or approval endpoint exists. The order, approval and audit layer is ours to build.
- Rate limits are undisclosed. Shortlist from `data/products_slim.jsonl`, then call the API for the shortlist only. Never sweep the catalogue.
- "Terminal" products ship from the supplier's warehouse and always report `availableAmount` 999999 (unknown). Only "Stock" products have real quantities.
- Only one schedule line is returned per product, so a split delivery is not expressed by the API.
- Filter lactose-free with the `FREE_FROM_LACTOSE` claim, not by name. Category `10400` holds the milk drinks.
- `has_allergen_data: false` means no declaration, not allergen-free. Treat as unknown.
- Reliability exists for 25% of products and carbon for 63%. Missing = unknown.
- Listed substitutions exist for 188 products only. Anything else must be inferred (category, allergens, claims, nutrition).
- Convert need → sales units with `net_l × su_in_bu` (see data dictionary), and cross-check with `catalogPrice / comparisonPrice`.

## Observed API behaviour (first calls, 2026-11-14)
- Timestamps are ISO 8601 with a numeric offset and no colon: `timeNow` `2026-11-14T12:21:23+0200`, `closingTime` `2026-11-15T17:00:00+0200`, `requestedDate` echoed as `2026-11-16T00:00:00+0200`. `availableDate` is a plain date, `2026-11-16`.
- Cut-off seen for products 460000/460001 for Monday delivery: Sunday 17:00 local.
- `logisticModel` seen: `Stock`. `Terminal` not yet seen.
- Unknown product id: availability returns the id with `salesBlock: false` and empty `scheduleLines` (no `closingTime` or `logisticModel`); price returns `error: true` with no price fields. HTTP 200 in both cases.
- Price: `currency` EUR; each price block has `validFrom`/`validTo` (`9999-12-31` = open-ended); `tax.taxValue` is also returned.
- The server returns 403 to Python's default `Python-urllib` User-Agent. `aimo_api.py` sends its own User-Agent.

## Not yet known
- Exact `Terminal` logisticModel string and its response shape.
- Official meanings of unit, category, temperature and allergen codes (glossaries in the data dictionary are unverified).
- Whether `allowedLotSize` 0.01 is real.
- Webshop test accounts (not issued).
- Junction submission rules and deadline.
