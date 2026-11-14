# Challenge data profile

Generated with `scripts/profile_products.py` against the Junction 2026 challenge files (14 Nov 2026), and cross-checked against `data/products_slim.jsonl`. Field-level detail is in [../docs/data-dictionary.md](../docs/data-dictionary.md).

> **Reconciled 14 Nov 2026.** The first version of this profile read only the `allergen` classification group and matched lactose-free milk by product name. It missed the `nonAllergen` group, which holds the "free from" declarations, and it counted cocoa drinks, quark and milk powder as milk. The numbers below are corrected; the old figures are noted where they changed.

## Headline numbers

| Item | Value |
|---|---|
| Products | 17,546 |
| Vendors (suppliers) | 648 |
| Category codes | 349 (names not included in the data; `data/categories.csv` decodes them by example) |
| Products with **any** allergen declaration | **9,424 (53.7%)** |
| … with CONTAINS / MAY_CONTAIN / UNDECLARED entries | 7,205 (41.1%) *(the old profile reported only this)* |
| … with FREE_FROM entries only | 2,231 |
| Products with **no** allergen declaration | 8,122 (46.3%) |
| Allergen entries | CONTAINS 15,610 · MAY_CONTAIN 9,956 · UNDECLARED 303 · **FREE_FROM 68,597 on 5,119 products** *(old profile: FREE_FROM 0)* |
| Products with nutrition data | 12,251 (69.8%) |
| Products with ingredients | 14,050 (80.1%) |
| Products with listed substitutes | **188 (1.1%)**, excluding one product whose only listed substitute is itself (189 including it) |
| Delivery reliability coverage | 4,425 products (25.2%); 564 below 0.95; 291 below 0.9; 150 below 0.8; 12 at 0.0; 2,490 at 1.0 |
| Carbon footprint coverage | 11,033 products (62.9%); **product-group averages**, not per product |
| `FREE_FROM_LACTOSE` claim | 4,178 products; `LOW_LACTOSE` 321 |
| **Lactose-free drinking milks** (category `10400` + `FREE_FROM_LACTOSE` claim) | **35** |
| Name contains "laktoositon" and "maito" | 68, but only 31 are drinking milks; the rest are cocoa drinks, quark, milk powder and cooking-cream blends, and one lacks the lactose-free claim *(old profile reported 68 as "milk-type")* |

"Free from" comes from the `nonAllergen` classification group. Reading it as "declared free from" is our interpretation of the field name and values; confirm it with the IT mentors (see [mentor-questions.md](mentor-questions.md)).

## Labels (packagingMarkedLabel)

| Label | Products |
|---|---|
| Hyvää Suomesta / Goods from Finland (blue swan) | 2,057 |
| Made in Finland (flag with key) | 1,772 |
| Sydänmerkki / Heart Symbol | 826 |
| EU organic | 456 |
| Nordic Swan (Svanen) | 362 |
| Rainforest Alliance | 234 |
| EU Ecolabel | 195 |
| MSC | 104 |
| Fairtrade | 92 |
| ASC | 51 |

## Most common allergen codes (GS1)

AM (milk), AW (cereals containing gluten), UW (wheat), AE (egg) and AN (tree nuts) are the most frequent. Codes come from GS1. The dataset doesn't translate them; the glossary in the data dictionary is unverified.

## What this means for design

1. **Silence is not safety, but silence is 46%, not 59%.** 8,122 products have no allergen declaration of any kind. Any diet-critical decision on those must go to a human. The other 9,424 can be checked automatically, including 5,119 with explicit "free from" entries.
2. **We need our own substitution logic.** Only 188 products list substitutes. Ranking must combine category, an allergen superset check, nutrition, labels, delivery reliability and CO₂.
3. **Use reliability for proactive warnings.** Flag low-reliability items before ordering and propose a backup. Missing reliability means unknown, not bad.
4. **CO₂ is good for basket-level reporting** and swap suggestions. Don't use it for precise per-product claims.
5. **The brief's hotel example works**, with 35 lactose-free drinking milks to choose from. Filter by the `FREE_FROM_LACTOSE` claim, never by name.

## API behaviour (checked 14 Nov 2026)

The OpenAPI spec is in [../api/openapi.json](../api/openapi.json); first live calls are recorded in [../CLAUDE.md](../CLAUDE.md).

- **Prices:** the mock ignores the `customer` field, and `netPriceFound` has been false on every call so far, so prices behave as list prices. Whether production prices are contract-specific is still a mentor question.
- **Partial quantities:** availability returns one schedule line per product with `availableAmount` (in sales units) and `availableDate`, which can differ from the requested date. A split delivery can't be expressed. "Terminal" products always report 999999, meaning unknown.
- **Unknown product codes** return HTTP 200 with empty `scheduleLines` (availability) or `error: true` (price).
- **The API is read-only.** There is no order, reservation or approval endpoint.

## Still to check

- Confirm with the IT mentors that `nonAllergen` means "declared free from".
- The exact `logisticModel` string for Terminal products and its response shape.
- Whether `allowedLotSize` 0.01 (on 96% of products) is real.
