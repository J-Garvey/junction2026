# Challenge data profile

Generated with `scripts/profile_products.py` against the Junction 2026 challenge files (14 Nov 2026), and cross-checked against `data/products_slim.jsonl`. Field-level detail is in [../docs/data-dictionary.md](../docs/data-dictionary.md).

> **Reconciled 14 Nov 2026.** The first version of this profile read only the `allergen` classification group and matched lactose-free milk by product name. It missed the `nonAllergen` group, which holds the "free from" declarations, and it counted cocoa drinks, quark and milk powder as milk. The numbers below are corrected; the old figures are noted where they changed.
>
> **Re-checked 14 Nov 2026 against the raw catalogue and the API** (see [../GROUND_TRUTH.md](../GROUND_TRUTH.md)). Fixed: the 7,205 + 2,231 breakdown, the "35 drinking milks" wording, the name-match description, and the API section, several points of which were wrong.

## Headline numbers

| Item | Value |
|---|---|
| Products | 17,546 |
| Vendors (suppliers) | 648 |
| Category codes | 349 (names not included in the data; `data/categories.csv` decodes them by example) |
| Products with **any** allergen declaration | **9,424 (53.7%)** |
| … with CONTAINS / MAY_CONTAIN entries | 7,193 |
| … with FREE_FROM entries only | 2,231 |
| Products with any entry in the raw `allergen` group (CONTAINS / MAY_CONTAIN / UNDECLARED) | 7,205 (41.1%): the 7,193 plus 12 with only UNDECLARED entries *(the old profile reported only this)* |
| Products with **no** allergen declaration | 8,122 (46.3%) |
| Allergen entries | CONTAINS 15,610 · MAY_CONTAIN 9,956 · UNDECLARED 303 · **FREE_FROM 68,597 on 5,119 products** *(old profile: FREE_FROM 0)* |
| Products with nutrition data | 12,251 (69.8%) in the raw file; 12,244 in slim, which keeps macros only (7 products have only vitamins, minerals or sodium) |
| Products with ingredients | 14,050 (80.1%) |
| Products with listed substitutes | **188 (1.1%)**, excluding one product whose only listed substitute is itself (189 including it) |
| Delivery reliability coverage | 4,425 products (25.2%); 564 below 0.95; 291 below 0.9; 150 below 0.8; 12 at 0.0; 2,490 at 1.0 |
| Carbon footprint coverage | 11,033 products (62.9%); **product-group averages**, not per product |
| `FREE_FROM_LACTOSE` claim | 4,178 products; `LOW_LACTOSE` 321 |
| **Lactose-free products in category `10400`** (`FREE_FROM_LACTOSE` claim) | **35**, all Valio (24) or Arla (11): **25 plain drinking milks**, 4 piimä, 3 coffee milks, 2 flavoured coffee-milk drinks, 1 portion creamer (list below) |
| Name contains "laktoositon" and "maito" | 68, of which 31 are in `10400` (the 35 above minus the 4 piimä). The other 37: 12 coffee-milk drinks, 9 quark, 6 milk powders, 3 cocoa drinks, 3 milk chocolates, 2 condensed milks, 1 pudding, 1 cooking blend. One (474390, condensed milk) lacks the claim *(old profile reported 68 as "milk-type")* |

"Free from" comes from the `nonAllergen` classification group. **Every one of its 68,597 values carries `"unit": "FREE_FROM"`**, so the data states it explicitly; GS1 defines FREE_FROM as "the product is free from the indicated substance". Still undocumented: why the group is separate, and whether "free from" means tested or declared (Q31 in [mentor-questions.md](mentor-questions.md)).

**Free-from lists depend on the supplier.** Valio has one on 8 of its 788 products; Arla on 159 of 208. Only 1,933 of the 4,178 `FREE_FROM_LACTOSE` products have any free-from entry, and only 11 of the 35 lactose-free milks (all Arla) list lactose as free-from. A missing entry says nothing.

### The 35 lactose-free products in `10400`

Litres per sales unit = `net_l × su_in_bu`; all match the price API within 0.33% except 472492 (weight only).

| Group | Products (id, litres per sales unit) |
|---|---|
| Plain drinking milk (25) | Arla: 462775 (1), 464179 (10), 464399 (2.8), 464768 (12), 465149 (3), 469330 (5), 469363 (1), 469386 (5). Valio: 462921 (5), 463038 (20), 463335 (1), 463779 (3.75), 464073 (1), 464119 (10), 464198 (2.5), 464201 (1), 464306 (1), 464398 (1), 464401 (1), 464440 (0.5), 465039 (5), 466288 (3.75), 469119 (1.75), 469287 (21), 476240 (5) |
| Coffee milk (3) | 462626 Valio 5 dl (5), 463380 Arla Café 1 L (1), 464237 Valio 1 l (1) |
| Flavoured coffee-milk drink (2) | 469266 Valio Latte original (5), 473142 Valio vanilla (10) |
| Portion creamer (1) | 463203 Arla Annosmaito 100×2 cl (2) |
| Piimä / sour milk (4) | 469331 Arla (5), 472492 Valio 5 kg (weight only), 476957 Valio Gefilus (1), 477050 Valio Eila (1) |

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

AM (milk), AW (cereals containing gluten), UW (wheat), AE (egg) and AN (tree nuts) are the most frequent. Codes come from GS1. The dataset doesn't translate them; the data dictionary now has the verified GS1 meanings of all 45 codes in the data.

## What this means for design

1. **Silence is not safety, but silence is 46%, not 59%.** 8,122 products have no allergen declaration of any kind. Any diet-critical decision on those must go to a human. The other 9,424 can be checked automatically, including 5,119 with explicit "free from" entries.
2. **We need our own substitution logic.** Only 188 products list substitutes. Ranking must combine category, an allergen superset check, nutrition, labels, delivery reliability and CO₂.
3. **Use reliability for proactive warnings.** Flag low-reliability items before ordering and propose a backup. Missing reliability means unknown, not bad.
4. **CO₂ is good for basket-level reporting** and swap suggestions. Don't use it for precise per-product claims.
5. **The brief's hotel example works**, with 25 plain lactose-free drinking milks (35 lactose-free products in the category). Filter by the `FREE_FROM_LACTOSE` claim, never by name and never by `free_from`.
6. **Never treat X99 as an allergen.** It is GS1's "does not contain declaration obligatory allergens" code, yet it sits in `contains` on 121 products.

## API behaviour (checked 14 Nov 2026)

The OpenAPI spec is in [../api/openapi.json](../api/openapi.json); first live calls are recorded in [../CLAUDE.md](../CLAUDE.md).

- **Prices:** the mock ignores the `customer` field. `catalogPrice` is what the customer pays; `listPrice` is the pre-discount reference and is higher on 997 of 999 products. `netPriceFound` is true on 16 of 1,000, the same for every customer. Whether production prices are contract-specific is still a mentor question.
- **Dates:** the mock ignores `requestedDate`. Every available line says `availableDate` 2026-11-16, whatever date is asked for.
- **Quantities:** one schedule line per product, so a split delivery can't be expressed. "Terminal" products always report 999999 (unknown). 142 of 566 sampled "Stock" products report a second sentinel, 9,999,999,999 base units divided by the sales-unit size; treat it as unknown too.
- **Empty `scheduleLines`** (HTTP 200) comes back for unknown codes **and for 24% of real products**, which are then not deliverable. Unknown codes return `error: true` from price.
- **1,000 L of lactose-free milk on Monday:** no product with a real stock figure can supply it alone. The largest is 463380 (a coffee milk) with 698 L; the four with real figures total 1,517 L. The rest return a sentinel or are Terminal with a cut-off that has already passed.
- **The API is read-only.** There is no order, reservation or approval endpoint.

## Still to check

- Confirm with the IT mentors what the separate `nonAllergen` group means, and whether "free from" is tested or declared.
- Whether `allowedLotSize` 0.01 (on 96% of products) is real. The schema calls it the order step in sales units.
- The official meaning of the unit, temperature and category codes.
