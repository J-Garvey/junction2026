# Junction 2026 — Valio Aimo agentic purchasing challenge

How can a food-service wholesaler let autonomous purchasing agents find products, compare offers and place orders with the right approvals, safely and openly? Valio Aimo (Valio's wholesale arm, ~20,000 professional kitchen customers) is mocking its webshop and backend for this challenge. Full text: [challenge/brief.txt](challenge/brief.txt).

**Our goal:** save customers time and get orders right, making ordering from the wholesaler nearly invisible in their day while staying reliable. The agent's output is either a **buy order** or **one clear question** for the owner, with just enough context to answer it fast. How often it asks is tuned to each customer's risk profile and situation. We're building it to be sellable to Valio Aimo or a similar wholesaler after Junction, not only as a demo.

## Status

- ✅ Challenge material, data and mock API in the repo; API calls verified
- ✅ Two research passes on customer segments (see "Open decisions": they disagree)
- ⏳ Ask the mentors ([research/mentor-questions.md](research/mentor-questions.md)), then pick a segment
- ⬜ Guardrails design (deliberately later)
- ⬜ Build

## Open decisions (team)

These have no single right answer. Both positions are in the repo.

1. **Which customer segment first.** [04](research/04-segment-research-chain-first.md) recommends **hotel and restaurant chains**, with public kitchens a close second and independents last. [01](research/01-customer-options-brief.md) keeps a **shortlist of independents, chains, contract caterers and private care homes**, and says the team ruled public kitchens out. Chains are the only segment both rank highly.
2. **Who pays:** the wholesaler (the kitchen owner is the user) or the kitchens themselves. Mentor question Q3.
3. **Whether credentials and data stay committed.** `.env` (API key, portal password) and `data/` are in the repo, which is private. `.gitignore` lists `.env`, but git keeps tracking a file once committed, so that line has no effect until `.env` is removed with `git rm --cached .env`.

## Repo map

| Path | What's there |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Compact context for AI coding agents: goal, judging, API behaviour, design constraints |
| [challenge/brief.txt](challenge/brief.txt) | The full challenge text, including judging criteria (credentials removed; see `.env`) |
| [challenge/resources.md](challenge/resources.md) | Data downloads, API docs and auth, mentors |
| [challenge/product_data_schema.json](challenge/product_data_schema.json) | JSON Schema of the raw 87 MB product catalogue |
| [api/openapi.json](api/openapi.json) | OpenAPI 3.1 spec of the mock API |
| [research/01-customer-options-brief.md](research/01-customer-options-brief.md) | **Start here for segments.** Candidates A–G with facts, unknowns, glossary of Finnish terms and scoring criteria |
| [research/02-initial-deep-dive.md](research/02-initial-deep-dive.md) | Archived public-kitchen pass, plus reusable design ideas: guardrails (draft, deferred), trust protocol, audit trail, demo pattern |
| [research/03-data-profile.md](research/03-data-profile.md) | What the data covers and where it's thin; API behaviour |
| [research/04-segment-research-chain-first.md](research/04-segment-research-chain-first.md) | The chain-first research pass, the order-quantity primer and kitchen-system notes |
| [research/mentor-questions.md](research/mentor-questions.md) | The single list of 45 mentor questions, with what's already answered |
| [docs/data-dictionary.md](docs/data-dictionary.md) | Every field of the slim dataset, quantity conversion, code glossaries (unverified) |
| `data/products_slim.jsonl` | Main product table: 17,546 rows, carbon and reliability joined in |
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
- **35 lactose-free drinking milks** fit the brief's example. Filter by the `FREE_FROM_LACTOSE` claim, not by name.
- **The API is read-only.** Ordering, approval and audit are ours to build. Shortlist from local data before calling it; rate limits are undisclosed.
