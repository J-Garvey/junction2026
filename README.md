# Junction 2026 — Valio Aimo agentic purchasing challenge

How can a food-service wholesaler let autonomous purchasing agents find products, compare offers and place orders with the right approvals, safely and openly? Valio Aimo (Valio's wholesale arm, ~20,000 professional kitchen customers) is mocking its webshop and backend for this challenge.

**Our goal:** save customers time and get orders right, making ordering from the wholesaler nearly invisible in their day while staying reliable.

## Status

- ✅ Research on candidate customer segments
- ✅ Shortlist: **A. Independent restaurants · B. Hotel & restaurant chains · C. Contract caterers · E. Private care homes**
- ⏳ Ask the Valio Aimo mentors the question brief, then score and pick one
- ⬜ Build

## Repo map

| Path | What's there |
|---|---|
| [research/01-customer-options-brief.md](research/01-customer-options-brief.md) | **Start here.** Candidate segments, facts, unknowns, glossary of Finnish terms, scoring criteria and the 33-question brief for the mentors |
| [research/02-initial-deep-dive.md](research/02-initial-deep-dive.md) | Archived first pass (public kitchens, now ruled out) plus reusable design ideas: guardrails model, trust protocol, audit trail, demo pattern |
| [research/03-data-profile.md](research/03-data-profile.md) | What the challenge data covers and where it's thin (allergens, substitutions, reliability, CO₂) |
| [challenge/brief.txt](challenge/brief.txt) | The original challenge brief |
| [challenge/resources.md](challenge/resources.md) | Data download links, API docs, auth, mentors |
| [challenge/product_data_schema.json](challenge/product_data_schema.json) | JSON schema for the product data |
| [scripts/profile_products.py](scripts/profile_products.py) | Reproduces the data profile |

## Quick start

```bash
mkdir data   # git-ignored; download the files listed in challenge/resources.md here
python3 scripts/profile_products.py \
  data/valio_aimo_junction26_product_data.json \
  data/valio_aimo_junction26_delivery_reliability.csv \
  data/valio_aimo_junction26_carbon_footprint.csv
```

The API key goes in `.env` (git-ignored). Never commit it.

## Key data findings

- Allergen statements cover only **41%** of products, and none are marked "free from". Missing data must never be treated as safe.
- Only **1.1%** of products have ready-made substitution rules, so we need our own ranking.
- Delivery reliability covers **25%** of products; CO₂ covers **63%** (product-group averages).
