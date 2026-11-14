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
| `lot` | num | `allowedLotSize`: the order quantity step in sales units ("order quantity must be a multiple of it", per the schema). 0.01 on 96.2% of products; whether a 0.01 step is real is unconfirmed (Q43). The API does not use it. |
| `temp` | int? | Temperature class code 1–9 (Valio Aimo ERP field, undocumented). Missing on 61 products. |
| `temp_label` | str? | `warm` / `cool` / `freeze`, from the packaging label group. 118 products carry two temperature labels in the raw data; slim keeps the last one. |
| `origin` | str? | Country of origin, ISO alpha-2 lowercase. |
| `vat` | str? | Raw values: MEDIUM 11 719, STANDARD 2 593, `MEDIUM MEDIUM` 159, LOW 1, NOT_APPLICABLE 1, other 5; missing on 3 068. Rates are not in the product file. Price API `tax.taxRate` is the source of truth (13.5, 25.5 and 10.0 seen). |
| `var_weight` | bool? | Present and true if sold by variable weight. |
| `gtin` | str? | GTIN of the sales unit. |
| `contains` | [str] | Allergen codes declared CONTAINS. |
| `may_contain` | [str] | Allergen codes declared MAY_CONTAIN. |
| `allergen_undeclared` | [str]? | Allergen codes with GS1 level UNDECLARED: "not intentionally included in the product and assessed not to require a cross-contact declaration" (GS1 T4079). Weaker than FREE_FROM; **not** "unknown". 303 values on 33 products. |
| `free_from` | [str] | Allergen codes from the raw `nonAllergen` classification group. Every raw value carries `unit: "FREE_FROM"` (68 597 values on 5 119 products); GS1 defines FREE_FROM as "the product is free from the indicated substance". Not documented: why the group is separate, and whether "free from" is tested or declared (Q31). **Lists are supplier-driven**: Valio has one on 8 of 788 products, Arla on 159 of 208, so a missing entry says nothing. |
| `has_allergen_data` | bool | true if any CONTAINS, MAY_CONTAIN or FREE_FROM entry (UNDECLARED-only products count as false). false = no declaration, NOT allergen-free. |
| `claims` | [str] | Nutritional / diet claims, e.g. `FREE_FROM_LACTOSE`, `VEGAN`. |
| `labels` | [str] | Certificates and origin marks, e.g. `EU_ORGANIC_FARMING`. |
| `nutr100` | obj? | Per 100 g or 100 ml: `kj`, `kcal`, `fat`, `sat`, `carb`, `sugar`, `fibre`, `prot`, `salt`, `lactose`. |
| `net_kg`, `net_l` | num? | Net content of ONE BASE UNIT. (Fixed 14 Nov: names like "12x500ml" used to store the whole case here.) |
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
Assumption: the net content belongs to one base unit. Checked against the price API on 14 Nov 2026 (`catalogPrice.value / comparisonPrice.value` gives litres or kg per sales unit directly):
- All 35 lactose-free milks in `10400` match within 0.33%, except 472492 (piimä 5 kg), which has weight only.
- Names with an "N x size" multiplier (`net_src = name`): the old build multiplied N into the per-unit content, so the formula counted the case twice (Vitamin Well "12x500ml" came out as 72 l per case; the API says 6 l). `build_slim.py` now applies N only when no case-level pack unit holds N base units. Of 924 such products where the API decides, 909 now match (215 did before); 15 are still wrong, mostly nested names like "8x8x45g" or "2x2x1kg"; 43 match neither reading.
- **Prefer the API's figure when it exists** (164 of 999 priced products have no comparison price), and use the API's `salesUnit`, which differs from slim `su` on about 1% of products.

Coverage: `net_kg` 12 804 products, `net_l` 3 555, neither 2 452.

## Measured facts
- Allergen declaration (`has_allergen_data`) present on 9 424 products (53.7%): 7 193 with CONTAINS / MAY_CONTAIN entries, plus 2 231 with FREE_FROM entries only. FREE_FROM appears on 5 119 products in total. 8 122 products (46.3%) have none. (The raw `allergen` group has entries on 7 205 products; the extra 12 have only UNDECLARED entries.)
- Contradictions to guard against: 2 products list the same code as contained and free-from (468044 AM; 469429 AM, AN). 4 products claim `FREE_FROM_LACTOSE` but list ML as CONTAINS (465346, 465554, 465920, 470988). 9 claim it but report lactose above 0.1 g/100 g.
- `FREE_FROM_LACTOSE` claim: 4 178 products. `LOW_LACTOSE`: 321. Use the claim, not a name match.
- Category `10400` holds the milks: 91 products, 35 with `FREE_FROM_LACTOSE`, all Valio (24) or Arla (11). Of the 35: 25 plain drinking milk, 4 piimä, 3 coffee milk, 2 flavoured coffee-milk drinks, 1 portion creamer. No plain lactose-free drinking milk exists outside `10400`.
- Reliability: 4 425 products; mean 0.972; 564 below 0.95, 291 below 0.9, 150 below 0.8, 12 at 0.0, 2 490 at 1.0.
- Both carbon and reliability present: 3 123 products.

## Temperature class decode (UNDOCUMENTED; derived by cross-tabulating `temp` with `temp_label`)
The schema says "Code meanings are not part of this data set". GS1 uses text codes, not 1–9, so this is a Valio Aimo ERP field. Readings below are inferences.
| `temp` | Products | Label seen | Reading |
|---|---|---|---|
| 8 | 10 053 | warm (9 938) | Ambient |
| 7 | 3 152 | freeze (3 147) | Frozen |
| 1, 2, 3, 4 | 240 / 324 / 1 673 / 1 803 | cool | Chilled. By dominant category: 1 fresh fish, 2 prepared veg and fish, 3 meat, 4 dairy. Temperatures unknown |
| 5 | 221 | mostly none | Unknown; mostly fresh produce |
| 6, 9 | 10 / 9 | none | Unknown; 6 is tropical produce (bananas, citrus), 9 is mixed |
| (none) | 61 | none | Mostly non-food (ink, markers, glasses) |

## Claim vocabulary (`claims`), documented
Each value is a GS1 claim type plus a claim element joined into one string, e.g. `FREE_FROM` + `LACTOSE` (GS1 Sweden T4358 and T4359; seven also appear verbatim in the GS1 Web Vocabulary). VEGAN and VEGETARIAN are GS1 diet types.
FREE_FROM_LACTOSE, LOW_LACTOSE, FREE_FROM_GLUTEN, FREE_FROM_WHEAT, FREE_FROM_EGGS, FREE_FROM_SOY, VEGAN, VEGETARIAN, FREE_FROM_PRESERVATIVES, FREE_FROM_COLOURING_AGENTS, FREE_FROM_ADDITIVES, FREE_FROM_SWEETENERS, FREE_FROM_ARTIFICIAL_SWEETENERS, NO_ADDED_SUGARS, HIGH_FIBRE, HIGH_PROTEIN, LOW_SODIUM_SALT, FREE_FROM_SODIUM_SALT, FREE_FROM_FAT, LOW_FAT, FREE_FROM_GMO.

## Label vocabulary (`labels`), documented
All 16 are in the GS1 GDSN list T3777 (packaging marked label accreditation). Issuers: Blue Swan = Finfood (Hyvää Suomesta); Flag with key = Suomalaisen Työn Liitto (Avainlippu); Heart Symbol = Finnish Heart Association (Sydänmerkki); Official eco label sun = Finnish official organic mark; Puhtaasti kotimainen = Finnish vegetables, berries and flowers. The `warmTemperature` / `coolTemperature` / `freezeTemperature` values in the same raw group are not GS1 codes.
GOODS_FROM_FINLAND_BLUE_SWAN, MADE_IN_FINLAND_FLAG_WITH_KEY, FINNISH_HEART_SYMBOL, PUHTAASTI_KOTIMAINEN, EU_ORGANIC_FARMING, KRAV_MARK, SOIL_ASSOCIATION_ORGANIC_SYMBOL, OFFICIAL_ECO_LABEL_SUN, SVANEN, EU_ECO_LABEL, RAINFOREST_ALLIANCE, UTZ_CERTIFIED, FAIR_TRADE_MARK, MARINE_STEWARDSHIP_COUNCIL_LABEL, AQUACULTURE_STEWARDSHIP_COUNCIL, DOLPHIN_SAFE.

## Allergen codes (GS1 AllergenTypeCode), documented
All 45 codes in the data are on the GS1 AllergenTypeCode list (https://gs1.org/voc/AllergenTypeCode-AM and siblings; cross-checked against GS1 Sweden T4078, https://gs1.se/en/guides/documentation/code-lists/t4078-allergen-type-code/).

EU 14 and cereals: AM milk · AE eggs · AF fish · AC crustaceans · UM molluscs · AP peanuts · AN tree nuts · AY soybeans · AS sesame · BC celery · BM mustard · NL lupin · AU sulphur dioxide and sulphites · AW cereals containing gluten · UW wheat · GB barley · GO oats · NR rye · GS spelt · GK kamut (Khorasan wheat) · ML lactose.
Individual nuts: SA almond · SC cashew · SH hazelnut · SM macadamia · SP pecan · SR brazil nut · ST pistachio · SW walnut · PN pine nuts.
Other: UN shellfish · SO coconut · PO pork · BF beef · CM chicken · ABD tuna · ADQ pollock · NP pod fruits (legumes) · NC cocoa · NE peas · NK coriander · NM corn (maize) · NW carrot · BP linalool (a fragrance allergen; appears only on non-food items).
**X99** = "does not contain declaration obligatory allergens": an absence code, never an allergen. It sits in `contains` on 121 products and in `free_from` on 74; 7 of those 74 also list real allergens (supplier data errors).

## Unit codes: only ST is documented
These are Valio Aimo ERP codes, not GS1 or UN/ECE Rec 20 codes. **Documented:** ST = piece (schema; SAP *Stück*). **Inferred from the data** (evidence in brackets):
KI case of N consumer units (its size equals the N in 1 985 of 2 067 names starting "N x") · PAL pallet (largest level, median 288 base units) · KRS pallet layer (always between KI and PAL; Finnish *kerros*) · PAK pack · BAG bag · KG kilogram (mostly variable-weight items) · BOT bottle (but an upper pack level on 10 products) · PRK tub/jar (*purkki*) · RAS box/punnet (*rasia*) · CS case · SK sack (*säkki*) · KRT carton · KAN canister · KLE tray or shrink pack of drinks (sits on BOT; e.g. 24 × 0.5 l) · DOL dolly (quarter pallet of drinks/dairy) · MDO half dolly (one product) · KOR crate of 20 milk cartons (*kori*) · DSP display · NIP bundle (*nippu*) · PNT bunch (*puntti*) · DZ dozen.
**ZML** is a dairy-only custom unit with inconsistent values: never use it in quantity maths. Official meanings: Q45.
