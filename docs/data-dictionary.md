# Data dictionary — slim dataset

Built by `scripts/build_slim.py` from the three raw challenge files. 17 546 products. Join key: `id` (string).
All data is synthetic and for Junction 2026 only.

## Files in `data/`
| File | Size | Use |
|---|---|---|
| `products_slim.jsonl` | ~11 MB | Main table. One JSON object per line. Load this. |
| `products_core.csv` | ~3.7 MB | Flat subset of the same rows (lists space-separated). For grep / spreadsheets. |
| `ingredients.jsonl` | ~5.6 MB | `id`, ingredient statement `en` / `fi`. Free text; allergens are in CAPITALS in the source. |
| `categories.csv` | 55 kB | Category code → product count, dominant temperature label, top vendor, 3 example names. Category names are not in the dataset; this is the only decode. |
| `carbon_footprint.csv` | raw | `productId, AVG kg CO2-eq/kg`. Already joined into slim as `co2_kg_per_kg`. |
| `delivery_reliability.csv` | raw | `productId, deliveryReliability`. Already joined into slim as `reliability`. |

The JSON Schema of the full 87 MB catalogue is in `challenge/product_data_schema.json`.

The full catalogue (87 MB) is not in the pack. Fetch it with `scripts/fetch_raw.sh` if a dropped field is needed.
Dropped fields: marketing texts, media ids, storage / usage / preparation / disposal texts, producers, structured ingredient origins, fishing reports, safety data, pack dimensions and gross weights, per-unit GTINs, Swedish names, minerals and vitamins.

## `products_slim.jsonl` fields
| Field | Type | Meaning |
|---|---|---|
| `id` | str | Product code. Use in API calls. |
| `en`, `fi` | str | Product name. |
| `brand` | str? | Brand. |
| `vendor` | str | Supplier name (648 distinct). |
| `cat` | str | Category code (349 distinct). See `categories.csv`. |
| `su` | str | Sales unit code. Prices and `availableAmount` from the API are per sales unit. |
| `bu` | str | Base unit code. |
| `units` | obj | Pack hierarchy: unit code → size in base units. |
| `su_in_bu` | num | Base units per sales unit (= `units[su]`). |
| `lot` | num | `allowedLotSize` in sales units. 0.01 on 96% of products (meaning unconfirmed). |
| `temp` | int? | Temperature class code 1–9. |
| `temp_label` | str? | `warm` / `cool` / `freeze`, from the packaging label group. |
| `origin` | str? | Country of origin, ISO alpha-2 lowercase. |
| `vat` | str? | `STANDARD` 25.5%, `MEDIUM` 13.5%, `LOW` 10%. Price API `tax.taxRate` is the source of truth. |
| `var_weight` | bool? | Present and true if sold by variable weight. |
| `gtin` | str? | GTIN of the sales unit. |
| `contains` | [str] | Allergen codes declared CONTAINS. |
| `may_contain` | [str] | Allergen codes declared MAY_CONTAIN. |
| `allergen_undeclared` | [str]? | Allergen codes with status UNDECLARED (303 values in total). |
| `free_from` | [str] | Allergen codes from the raw `nonAllergen` classification group, read as "declared free from" (our interpretation; confirm with mentors, Q31). |
| `has_allergen_data` | bool | false = no allergen declaration at all. NOT the same as allergen-free. |
| `claims` | [str] | Nutritional / diet claims, e.g. `FREE_FROM_LACTOSE`, `VEGAN`. |
| `labels` | [str] | Certificates and origin marks, e.g. `EU_ORGANIC_FARMING`. |
| `nutr100` | obj? | Per 100 g or 100 ml: `kj`, `kcal`, `fat`, `sat`, `carb`, `sugar`, `fibre`, `prot`, `salt`, `lactose`. |
| `net_kg`, `net_l` | num? | Net content of ONE BASE UNIT. |
| `net_src` | str? | `synkka` = manufacturer data; `name` = parsed from product name; `synkka+name` = weight from data, litres from name. |
| `subs` | [str]? | Listed substitute product codes, self-references removed (188 products only). |
| `deposits` | [obj]? | Returnable-packaging deposits charged with the product. |
| `co2_kg_per_kg` | num? | Product-GROUP average kg CO2-eq per kg, not a per-product measurement. 63% coverage. |
| `reliability` | num? | Historical delivered / ordered quantity, 0–1. 25% coverage. Missing = unknown, not bad. |

## Quantity conversion
```
litres per sales unit = net_l  × su_in_bu
kg per sales unit     = net_kg × su_in_bu
sales units needed    = ceil(required_litres / litres_per_sales_unit)
```
Assumption: the net content belongs to one base unit. This holds on the lactose-free milk rows checked by hand, but `net_src = name` values are regex guesses. Cross-check against the price API: `catalogPrice.value / comparisonPrice.value` gives litres (or kg) per sales unit directly.

Coverage: `net_kg` 12 804 products, `net_l` 3 555, neither 2 452.

## Measured facts
- Allergen declaration present on 9 424 products (54%): 7 205 with CONTAINS / MAY_CONTAIN / UNDECLARED entries, plus 2 231 with FREE_FROM entries only. FREE_FROM appears on 5 119 products in total. 8 122 products (46%) have no declaration.
- `FREE_FROM_LACTOSE` claim: 4 178 products. `LOW_LACTOSE`: 321. Use the claim, not a name match.
- Category `10400` holds the lactose-free milk drinks (35 products with the claim).
- Reliability: mean 0.972; 291 products below 0.9; some at 0.0.
- Both carbon and reliability present: 3 123 products.

## Temperature class decode (derived by cross-tabulating `temp` with `temp_label`)
| `temp` | Products | Label seen | Reading |
|---|---|---|---|
| 8 | 10 053 | warm (9 938) | Ambient |
| 7 | 3 152 | freeze (3 147) | Frozen |
| 1, 2, 3, 4 | 240 / 324 / 1 673 / 1 803 | cool | Chilled; why four classes is unknown |
| 5 | 221 | mostly none | Unknown |
| 6, 9 | 10 / 9 | none | Unknown |

## Claim vocabulary (`claims`)
FREE_FROM_LACTOSE, LOW_LACTOSE, FREE_FROM_GLUTEN, FREE_FROM_WHEAT, FREE_FROM_EGGS, FREE_FROM_SOY, VEGAN, VEGETARIAN, FREE_FROM_PRESERVATIVES, FREE_FROM_COLOURING_AGENTS, FREE_FROM_ADDITIVES, FREE_FROM_SWEETENERS, FREE_FROM_ARTIFICIAL_SWEETENERS, NO_ADDED_SUGARS, HIGH_FIBRE, HIGH_PROTEIN, LOW_SODIUM_SALT, FREE_FROM_SODIUM_SALT, FREE_FROM_FAT, LOW_FAT, FREE_FROM_GMO.

## Label vocabulary (`labels`)
GOODS_FROM_FINLAND_BLUE_SWAN, MADE_IN_FINLAND_FLAG_WITH_KEY, FINNISH_HEART_SYMBOL, PUHTAASTI_KOTIMAINEN, EU_ORGANIC_FARMING, KRAV_MARK, SOIL_ASSOCIATION_ORGANIC_SYMBOL, OFFICIAL_ECO_LABEL_SUN, SVANEN, EU_ECO_LABEL, RAINFOREST_ALLIANCE, UTZ_CERTIFIED, FAIR_TRADE_MARK, MARINE_STEWARDSHIP_COUNCIL_LABEL, AQUACULTURE_STEWARDSHIP_COUNCIL, DOLPHIN_SAFE.

## Allergen codes — UNVERIFIED glossary
The dataset does not translate these. They match the GS1 AllergenTypeCode list; the meanings below are from general knowledge. Confirm with the mentors before relying on them in the demo.

EU 14 and cereals: AM milk · AE eggs · AF fish · AC crustaceans · UM molluscs · AP peanuts · AN tree nuts · AY soybeans · AS sesame · BC celery · BM mustard · NL lupin · AU sulphites · AW cereals containing gluten · UW wheat · GB barley · GO oats · NR rye · GS spelt · GK kamut · ML lactose.
Individual nuts: SA almond · SC cashew · SH hazelnut · SM macadamia · SP pecan · SR brazil nut · ST pistachio · SW walnut.
Low confidence: X99 "no declarable allergens" · NC cocoa · NE peas · NK coriander · NM maize · NW carrot · UN, SO, PN, PO, BF unknown.

## Unit codes — UNVERIFIED glossary
Inferred from Finnish abbreviations; not in the dataset. KI case · ST piece · PAL pallet · KRS pallet layer · PAK pack · BAG bag · KG kilogram · BOT bottle · PRK tub/jar · RAS box · CS case · SK sack · KRT carton · KAN canister · DZ dozen. Unknown: KLE, ZML, DOL, DSP, KOR, NIP, PNT, MDO.
