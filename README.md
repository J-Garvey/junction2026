# Junction 2026 — Valio Aimo agentic purchasing challenge

How can a food-service wholesaler let autonomous purchasing agents find products, compare offers and place orders with the right approvals, safely and openly? Valio Aimo (Valio's wholesale arm, ~20,000 professional kitchen customers) is mocking its webshop and backend for this challenge. Full text: [challenge/brief.txt](challenge/brief.txt).

**Our goal:** save customers time and get orders right, making ordering from the wholesaler nearly invisible in their day while staying reliable. The agent's output is either a **buy order** or **one clear question** for the owner, with just enough context to answer it fast. How often it asks is tuned to each customer's risk profile and situation. We're building it to be sellable to Valio Aimo or a similar wholesaler after Junction, not only as a demo.

## Status

- ✅ Challenge material, data and mock API in the repo; API calls verified
- ✅ Facts verified against the data, API, brief and public sources: **[GROUND_TRUTH.md](GROUND_TRUTH.md)**
- ⏰ **Final submission deadline: Sun 15 Nov 2026, 10:00**
- ✅ Two research passes on customer segments (they disagree; see [QUESTIONS.md](QUESTIONS.md))
- ✅ Research on urgent, large, variable orders: event caterers and banquet venues fit best ([research/05](research/05-spike-orders-under-time-pressure.md))
- ✅ Talked to Valio Aimo: **hotels first, then restaurants; target hotel catering and event orders** ([research/06](research/06-valio-aimo-conversation-2026-11-14.md))
- ⏳ Ask the mentors ([research/stand-questions.md](research/stand-questions.md) first), then pick a segment
- ⬜ Guardrails design (deliberately later)
- ⬜ Build

## Open decisions (team)

Three decisions have no single right answer. **[QUESTIONS.md](QUESTIONS.md)** sets out both positions for each:

1. Which customer segment to build for first (the two research passes disagree).
2. Who pays: the wholesaler or the kitchens.
3. Whether the API key, portal password and data stay committed.

What changed when the two uploads were merged is in **[CHANGES.md](CHANGES.md)**.

## Repo map

| Path | What's there |
|---|---|
| [GROUND_TRUTH.md](GROUND_TRUTH.md) | **Verified facts**: data, API behaviour, brief, code meanings, Valio Aimo, standards. Wins where another file disagrees |
| [QUESTIONS.md](QUESTIONS.md) | Open team decisions, with both positions for each |
| [CHANGES.md](CHANGES.md) | Every change made when the two uploads were merged |
| [AGENTS.md](AGENTS.md) | Shared instructions for Codex and Claude Code, with the hotel demo and data workflow |
| [CLAUDE.md](CLAUDE.md) | Imports the shared instructions and keeps the team's challenge background |
| [challenge/brief.txt](challenge/brief.txt) | The full challenge text, including judging criteria (credentials removed; see `.env`) |
| [challenge/resources.md](challenge/resources.md) | Data downloads, API docs and auth, mentors |
| [challenge/product_data_schema.json](challenge/product_data_schema.json) | JSON Schema of the raw 87 MB product catalogue |
| [api/openapi.json](api/openapi.json) | OpenAPI 3.1 spec of the mock API |
| [research/01-customer-options-brief.md](research/01-customer-options-brief.md) | **Start here for segments.** Candidates A–G with facts, unknowns, glossary of Finnish terms and scoring criteria |
| [research/02-initial-deep-dive.md](research/02-initial-deep-dive.md) | Archived public-kitchen pass, plus reusable design ideas: guardrails (draft, deferred), trust protocol, audit trail, demo pattern |
| [research/03-data-profile.md](research/03-data-profile.md) | What the data covers and where it's thin; API behaviour |
| [research/04-segment-research-chain-first.md](research/04-segment-research-chain-first.md) | The chain-first research pass, the order-quantity primer and kitchen-system notes |
| [research/05-spike-orders-under-time-pressure.md](research/05-spike-orders-under-time-pressure.md) | Which customers place large, urgent, one-off orders where speed and accuracy beat price, and which fit the agent best. Source notes in [research/notes/spike-orders/](research/notes/spike-orders/) |
| [research/06-valio-aimo-conversation-2026-11-14.md](research/06-valio-aimo-conversation-2026-11-14.md) | **Notes from talking to Valio Aimo (14 Nov):** target segment, hotel ordering patterns, substitution pitfalls, lead times and cut-offs, agent explanation modes |
| [research/stand-questions.md](research/stand-questions.md) | **Take this to the Valio Aimo stand:** the 15 questions only they can answer, in priority order |
| [research/mentor-questions.md](research/mentor-questions.md) | The single list of 49 mentor questions, with what's already answered |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Every field of the slim dataset, quantity conversion, code glossaries (unverified) |
| `data/products_slim.jsonl` | Main product table: 17,546 rows with hotel use tags, carbon and reliability where available |
| `data/products_core.csv` | Flat subset for grep and spreadsheets |
| `data/ingredients.jsonl` | Ingredient statements (en, fi) |
| `data/categories.csv` | Category codes decoded by example |
| `data/carbon_footprint.csv`, `data/delivery_reliability.csv` | Raw side files from the portal |
| [scripts/aimo_api.py](scripts/aimo_api.py) | API client and CLI (stdlib only) |
| [scripts/build_slim.py](scripts/build_slim.py) | Rebuilds `data/` from the raw files |
| [scripts/fetch_raw.sh](scripts/fetch_raw.sh) | Downloads the raw files into `data/raw/` (git-ignored) and rebuilds `data/` |
| [scripts/profile_products.py](scripts/profile_products.py) | Reproduces the data profile from the raw files |

## Quick start

The slim data is already in `data/`, so most work needs no download.

To find croissants for a hotel breakfast, filter on the tag before calling the API for shortlisted items. Other tags are described in the [data dictionary](docs/data-dictionary.md#hotel-use-tags).

```bash
jq -c 'select((.hotel_tags // []) | index("breakfast:croissants")) | {id,en,fi}' data/products_slim.jsonl
```

```bash
python3 scripts/aimo_api.py ping
python3 scripts/aimo_api.py availability 2026-11-16 460000 460001
python3 scripts/aimo_api.py price 2026-11-16 460000
```

For fields the slim build dropped, fetch the raw 87 MB catalogue and profile it:

```bash
scripts/fetch_raw.sh
python3 scripts/profile_products.py data/raw/product_data.json data/raw/delivery_reliability.csv data/raw/carbon_footprint.csv
```

The API key is read from `.env` (`AIMO_API_KEY`).

## Key data findings

- **Allergen declarations cover 54% of products** (9,424): "contains", "may contain" and, on 5,119 products, "free from". The other **46% have none**, and missing data must never be treated as safe.
- **Only 188 products (1.1%) list substitutes**, so we need our own ranking.
- **Delivery reliability covers 25%** of products; **CO₂ covers 63%** (product-group averages). Missing means unknown, not bad.
- **25 plain lactose-free drinking milks** (35 lactose-free products in category `10400`, all Valio or Arla) fit the brief's example. Filter by the `FREE_FROM_LACTOSE` claim, not by name or `free_from`. No single product with a real stock figure covers 1,000 L for Monday.
- **The API is read-only.** Ordering, approval and audit are ours to build. Shortlist from local data before calling it; rate limits are undisclosed.
- **The mock ignores `customer` and `requestedDate`**, and has two "unknown quantity" sentinels: 999999 (Terminal) and 9,999,999,999 base units (some Stock). Details in [GROUND_TRUTH.md](GROUND_TRUTH.md) section 3.
