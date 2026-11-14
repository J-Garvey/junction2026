# Challenge data profile

Generated with `scripts/profile_products.py` against the Junction 2026 challenge files (14 Nov 2026).

## Headline numbers

| Item | Value |
|---|---|
| Products | 17,546 |
| Vendors (suppliers) | 648 |
| Category codes | 349 (names not included in the data) |
| Products with any allergen statement | 7,205 (41.1%) |
| Allergen statement types | CONTAINS: 15,610 · MAY_CONTAIN: 9,956 · UNDECLARED: 303 · **FREE_FROM: 0** |
| Products with nutrition data | 12,251 (69.8%) |
| Products with ingredients | 14,050 (80.1%) |
| Products with explicit substitution rules | **189 (1.1%)** |
| Delivery reliability coverage | 4,425 products (25.2%); 564 below 0.95; 150 below 0.8; 2,490 at 1.0 |
| Carbon footprint coverage | 11,033 products (62.9%); **product-group averages**, not per product |
| Lactose-free milk-type products | ~68 (Valio and Arla) |

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

AM (milk), AW (cereals containing gluten), UW (wheat), AE (egg) and AN (tree nuts) are the most frequent. Codes come from GS1. The dataset doesn't translate them.

## What this means for design

1. **Silence is not safety.** No product is marked "free from" anything, and 59% have no allergen statement at all. Any diet-critical decision with missing allergen data must go to a human.
2. **We need our own substitution logic.** Only 1.1% of products come with substitution rules. Ranking must combine category, allergen superset check, nutrition, labels, delivery reliability and CO₂.
3. **Use reliability for proactive warnings.** Flag low-reliability items before ordering and propose a backup.
4. **CO₂ is good for basket-level reporting** and swap suggestions. Don't use it for precise per-product claims.
5. **The brief's hotel example works** with the ~68 lactose-free milk products.

## Not yet checked

- The OpenAPI spec (https://junction26.valioaimo.fi/openapi.json) couldn't be fetched from our research environment. Still to check: whether prices are customer- or contract-specific, and how availability returns partial quantities.
- What the `nonAllergen` classification group contains (could be the "free from" information).
