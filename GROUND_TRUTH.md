# Ground truth

Facts that have one categorically correct answer, checked on 14 Nov 2026 against the data, the mock API, the challenge brief and public sources. Build on these. Where another file disagrees, this file wins until someone re-checks it.

**Out of scope on purpose:** anything that needs the team's judgement — which segment to serve, who pays, whether credentials stay in the repo, guardrail thresholds and product direction. Those stay open in [QUESTIONS.md](QUESTIONS.md). This file only supplies facts those decisions can use.

**How each fact is marked**

| Tag | Means |
|---|---|
| **[DATA]** | Computed from the raw catalogue (`data/raw/product_data.json`, fetched 14 Nov) or `data/products_slim.jsonl`. Reproducible with the scripts in `scripts/`. |
| **[API]** | Observed on the mock API, 14 Nov 2026, about 13:18 Helsinki time. Raw responses were kept outside the repo. |
| **[SPEC]** | Stated in `api/openapi.json` or `challenge/product_data_schema.json`. |
| **[BRIEF]** | Stated in `challenge/brief.txt` (quoted). |
| **[SRC]** | Stated by a public source; the link is given. |
| **[INF]** | Inferred from evidence that is given. Not documented anywhere. |
| **[OPEN]** | Not determinable from anything available. Says who could answer. |

Corrections to earlier files are listed in section 9 and in [CHANGES.md](CHANGES.md) section 5.

---

## 1. Event and deliverable

- **Final submission deadline: Sun 15 Nov 2026, 10:00.** Review and the top-5 pitches start 14:00; the event ends 17:00. [SRC: https://junction2026.com/about.md]
- Teams are 1–4 people; each partner picks its own winners; the top 5 projects pitch to a grand jury. [SRC: junction2026.com/about.md, junction2026.com/llms.txt]
- No public page gives the submission format, required artefacts or IP terms. [OPEN: the Junction dashboard's "Project Submission" page, which needs a login]
- **Judging weights** [BRIEF], verbatim criteria:

| Weight | Criterion (brief wording) |
|---|---|
| 30% | Working end-to-end demo: "full request → lookup → order/approval flow in the mocked environment, **not just isolated pieces**" |
| 20% | Solving the problem and user need: "how precisely the agent matches what the buyer actually asked for, with the least manual correction needed" |
| 20% | Autonomy and controls: "what the agent can decide alone, what needs human sign-off, and how decisions are logged and auditable" |
| 15% | Robustness: "partial availability, substitutions and delivery constraints beyond the happy path" |
| 15% | Openness: "open, documented standards rather than a proprietary format, clear visibility of assumptions, **well-justified technical choices**, and a credible view of next development steps" |

- **The API key and portal password are printed in plain text on the public challenge page**, https://junction2026.com/challenges/valio-aimo-trusted-trade-agents.md. Both `.env` values match it. [SRC] (A fact for QUESTIONS.md item 3; the decision stays the team's.)

## 2. What the brief does and does not settle

The brief answers none of the eight "unclear" items in [04](research/04-segment-research-chain-first.md) outright. What it does say:

| Item | What the brief says [BRIEF] |
|---|---|
| What to build | The deliverable is "the interface and operating model that would let an external purchasing agent interact with Valio Aimo's systems", "not … a whole marketplace". The judging assumes an agent runs end to end ("the agent places the order within its authority or sends it to a human for approval"). It never says whether the team must build the buyer's agent. |
| Whose approval | Only "a human". Not settled. |
| "Comparing offers" | Dimensions named: price and availability (example); delivery reliability and the certificates and sustainability labels shown in the webshop (optional); "good-better-best" substitution ranking "within Valio Aimo's own assortment". "Offer" is never defined. |
| "Fixed prices" | "based on fixed prices rather than a negotiated quote". Nothing on list vs contract price or price validity. |
| "Our requirements" | Not settled. Related: "substitutions outside stated preferences". |
| Substitution | Both. Listed as optional ("this isn't scored as core") **and** named inside the 15% robustness criterion. The brief does not reconcile them. |
| Open standards | **No standard is required.** The only ones named are x402 and Nevermined, "relevant context but not required". "An MCP-style agentic interface" is called **outside the challenge scope**. GS1, Peppol, AP2 and W3C VC do not appear in the brief. |
| Confidential data | Categories only: "without exposing real systems, confidential data or the marketplace roadmap". All provided data is synthetic. |

Also from the brief:
- The brief names **spend threshold** as an example sign-off trigger ("which decisions require human sign-off (spend threshold, substitutions outside stated preferences)"). CLAUDE.md records a mentor remark that spend limits are not an expected pain point; that remark has no name or date attached. Both are true statements; reconciling them is a team call.
- Valio's figures in the brief: €2.4B / 60 export markets in one block, €2.3B / 50 in another. **€2.3B is 2024 (€2,278.5M) and €2.4B is 2025 (€2,422.7M).** valio.com says "roughly 60" export countries. [SRC: https://www.valio.com/news/valios-business-grew-steadily-in-2025-in-a-challenging-operating-environment/]

**Unsourced lines in CLAUDE.md "Team rules":** "Public/private data exposure is not a design constraint" and "SI units" are not in the brief, and no source is recorded. The first sits against the brief's headline ("without exposing … confidential data"). They may be mentor remarks or team conventions; they are flagged, not removed.

## 3. The mock API

Base `https://junction26.valioaimo.fi`, header `X-API-Key`. The live `/openapi.json` and `/docs` sit behind an event-password page; use `api/openapi.json` (OpenAPI 3.1.0). [API]

### Endpoints and limits
- Exactly six paths: `GET /api/ping`, `POST /api/availability`, `POST /api/price`, and three `GET …/download`. **No order, reservation, approval or cart endpoint.** [SPEC]
- 1–1000 product codes per POST. 1,001 → 422 `too_long`; `[]` → 422 `too_short`; a malformed date → 422. [API]
- "Undisclosed rate limits are in place"; solutions should not repeatedly fetch prices and availability for **all** products. [SPEC] 1,000-id batches returned 200 with no 429 over about 20 calls. [API]
- The server returns 403 to Python's default User-Agent. [API]

### Inputs the mock ignores
- **`customer` has no effect.** "customer number does not affect response so you can pass in whatever" [SPEC]; 0 differences across three customer values on 1,000 products [API]. Price echoes it back as `customerId`.
- **`requestedDate` has no effect.** A past date, today, a Saturday, a Sunday and a date two months out all return identical schedules, cut-offs and prices. Every available line says `availableDate 2026-11-16` (the next Monday). [API] This contradicts the spec's "earliest date when amount is available".

### Availability
| Field | Fact |
|---|---|
| `logisticModel` | Exactly `"Stock"` or `"Terminal"`. **Absent** (not null) when `scheduleLines` is empty. [API] Terminal = "delivered from supplier's warehouses and we don't know the actual available quantities". [SPEC] |
| Terminal quantity | Always `999999`, meaning **unknown**, not "always fillable". [SPEC][API: 195 of 195] |
| Stock quantity | Real for most. But **142 of 566 Stock products return a second sentinel**: 9,999,999,999 base units divided by the sales-unit size (e.g. `9999999999` ST, `833333333` KI). Treat as unknown. [API] |
| Real Stock amounts | 0 to 68,293 sales units, median 53. Amount 0 comes with **no** `availableDate`. [API] |
| Empty `scheduleLines` | **239 of 1,000 real catalogue products** return `{"productId", "salesBlock": false, "scheduleLines": []}`, the same shape as an unknown id; 238 of them still have a price. Empty means "not deliverable", not "unknown id". [API] |
| `salesBlock` | Never true in 1,000 products. [API] |
| `closingTime` | Order cut-off for `availableDate`. [SPEC] Seen: Sun 15 Nov 17:00 (520 Stock), Fri 13 Nov 13:00 (46 Stock), 10–12 Nov (all 195 Terminal). Cut-offs **already past** at `timeNow` (Sat 14 Nov) still show Monday delivery. The mock does not resolve this. [API] |
| `salesUnit` | **Differs from the catalogue's `su` on 11 of 761 products** (e.g. 468246: KI in the API, BAG in the catalogue). Use the API's value. [API] |
| Timestamps | ISO 8601 with offset and no colon (`2026-11-14T12:21:23+0200`); `availableDate` is a plain date. [API] |

### Price
| Field | Fact |
|---|---|
| `catalogPrice.value` | The price per sales unit, ex VAT. **This is what the customer pays.** [SPEC][API] |
| `listPrice` | "Price before the customer-specific price or discount" [SPEC]. Higher than `catalogPrice` on 997 of 999 products (median ×1.22, up to ×1.96). [API] |
| `netPriceFound` | "True when a customer-specific net price was found" [SPEC]. **True on 16 of 1,000**, identical for every customer value. [API] |
| `comparisonPrice` / `comparisonUnit` | Per KG or L only [SPEC]. **Missing on 164 of 999 priced products.** [API] |
| `tax.taxRate` | 13.5 (853), 25.5 (144), 10.0 (2). [API] |
| Validity | `validFrom` / `validTo`; `9999-12-31` = open-ended. [API] |
| Unknown or failed product | HTTP 200 with `error: true` and no price fields. [API] |
| `quantity` | Always 1.0. [SPEC] |

## 4. The product data

All figures [DATA] unless marked. The committed `data/` files are a rebuild of the raw catalogue fetched 14 Nov (byte-identical to the previous build except the net-content fix in 4.4).

### 4.1 Size and coverage
| Item | Value |
|---|---|
| Products / vendors / category codes | 17,546 / 648 / 349 (category names are not in the data) |
| Nutrition | 12,251 raw (`nutritionalContent` non-empty); 12,244 in slim (macros only; 7 products have only vitamins, minerals or sodium) |
| Ingredients | 14,050 |
| Listed substitutes | 188 (1.1%); 189 if you count 471661, whose only substitute is itself |
| Delivery reliability | 4,425 (25.2%); mean 0.972; <0.95: 564; <0.9: 291; <0.8: 150; =0.0: 12; =1.0: 2,490. Missing = unknown. |
| Carbon (`AVG kg CO2-eq/kg`) | 11,033 (62.9%). Described by the challenge as a product-group average [SRC: challenge resources]; all 35 lactose-free milks share exactly 1.1. |
| Both reliability and carbon | 3,123 |
| `allowedLotSize` 0.01 | 16,872 (96.2%). The schema defines it as the order quantity step in sales units ("order quantity must be a multiple of it") [SPEC]. Whether 0.01 of a case is really orderable: [OPEN: IT mentors, Q43]. The API does not use the field. |
| Temperature code | 1–9 plus **61 products with none**. 118 products carry two temperature labels; slim keeps one. |
| VAT codes (`vat`) | MEDIUM 11,719; none 3,068; STANDARD 2,593; "MEDIUM MEDIUM" 159; LOW 1; NOT_APPLICABLE 1; other 5. Rates are not in the product file; use the price API's `tax.taxRate`. |

### 4.2 Allergens
Two definitions exist; state which one you use.

| Count | Definition |
|---|---|
| **9,424 (53.7%)** | Any CONTAINS, MAY_CONTAIN or FREE_FROM entry. = slim `has_allergen_data`. = **7,193** with CONTAINS/MAY_CONTAIN + **2,231** with FREE_FROM only. |
| 7,205 (41.1%) | Any entry in the raw `allergen` group, including 12 products whose only entries are UNDECLARED. |
| **8,122 (46.3%)** | No declaration under the first definition (8,110 if UNDECLARED-only products count as declared). |
| Entries | CONTAINS 15,610 · MAY_CONTAIN 9,956 · UNDECLARED 303 (on 33 products) · FREE_FROM 68,597 (on 5,119 products) |

- **FREE_FROM is explicit in the data.** Every one of the 68,597 values in the raw `nonAllergen` group carries `"unit": "FREE_FROM"`, and each has only `id` and `unit`. [DATA] GS1 defines FREE_FROM as "the product is free from the indicated substance". [SRC: https://gs1.org/voc/LevelOfContainmentCode-FREE_FROM] What is **not** documented: why Synkka puts these in a separate `nonAllergen` group, and whether "free from" means tested or declared. [OPEN: IT mentors, Q31]
- The data agrees with that reading: only 2 products have the same code in CONTAINS/MAY_CONTAIN and in FREE_FROM (468044 AM; 469429 AM and AN); none of 2,959 VEGAN products contains milk or egg. [DATA]
- **FREE_FROM lists are supplier-driven and often missing.** Valio has a FREE_FROM list on 8 of its 788 products; Arla on 159 of 208. Only 1,933 of 4,178 FREE_FROM_LACTOSE products have any FREE_FROM entry. **A missing FREE_FROM entry says nothing.** [DATA]
- **UNDECLARED is a real GS1 value**, not "unknown": "not intentionally included in the product and assessed not to require a cross-contact declaration". It is weaker than FREE_FROM. [SRC: GS1 Sweden T4079, https://gs1.se/en/guides/documentation/code-lists/t4079-level-of-containment-code/]
- **X99** = "does not contain declaration obligatory allergens", an absence code. In the data it sits in CONTAINS on 121 products and in FREE_FROM on 74; 7 of the 74 also list real allergens. Never treat X99 as an allergen. [SRC: GS1 AllergenTypeCode][DATA]
- Data conflicts to guard against: 4 products claim FREE_FROM_LACTOSE but list lactose (ML) as CONTAINS (465346, 465554, 465920, 470988); 9 claim FREE_FROM_LACTOSE but report lactose above 0.1 g/100 g. [DATA]
- The schema's description of the allergen `unit` ("CONTAINS or FREE_FROM") does not match the data, which uses CONTAINS, MAY_CONTAIN and UNDECLARED in `allergen` and FREE_FROM in `nonAllergen`. [SPEC vs DATA]

### 4.3 Lactose-free milk (the brief's example)
- **Filter by the `FREE_FROM_LACTOSE` claim in category 10400**: 35 products, **all Valio (24) or Arla (11)**. [DATA] There is no plain lactose-free drinking milk outside 10400. [DATA]
- **Of the 35, 25 are plain drinking milk.** The rest: 4 piimä (sour milk), 3 unflavoured coffee milks, 2 flavoured coffee-milk drinks (Latte original, vanilla), 1 portion-creamer case (Arla Annosmaito 100×2 cl). The full classified list is in [research/03](research/03-data-profile.md).
- Category 10400 has 91 products in total, including regular milks, 4 LOW_LACTOSE (not lactose-free) and one soy yogurt. [DATA]
- A Finnish-name search for "laktoositon" + "maito" finds 68, of which 31 are in 10400. The other 37: 12 coffee-milk drinks, 9 quark, 6 milk powders, 3 cocoa drinks, 3 milk chocolates, 2 condensed milks, 1 pudding, 1 cooking blend. [DATA]
- **1,000 L by Monday, as the mock answers it** [API]: no lactose-free milk with a real stock figure can supply 1,000 L alone. The largest is 463380 (Arla Café milk, a coffee milk) with 698 L; 463203 and 469363 have 384 L each; 462775 has 51 L. Those four total 1,517 L. Ten Valio milks return the Stock sentinel and twenty are Terminal (999999, cut-off already past), so neither group gives a real quantity. 464440 is not deliverable.

### 4.4 Quantity conversion
```
litres per sales unit = net_l  × su_in_bu
kg per sales unit     = net_kg × su_in_bu
```
- **This holds for the data as rebuilt on 14 Nov.** The old build had a bug: for names like "12x500ml" it stored the whole case (6 l) as the content of one bottle, so the formula counted the case twice (72 l). The fix applies the "N x" only when no case-level pack unit holds N base units. [DATA]
- Checked against the price API (`catalogPrice / comparisonPrice`, within 5%) on every product whose name has an "N x" multiplier: **before the fix 215 of 924 decidable products matched; after it, 909.** 15 remain wrong (nested multipliers such as "8x8x45g", or the API's own comparison price showing the same double count) and 43 match neither reading. 787 products changed; none of the 35 lactose-free milks did. [API][DATA]
- All 35 lactose-free milks match the API within 0.33% except 472492 (piimä 5 kg), which has weight only. [API]
- **Rule for code:** prefer the API's `catalogPrice / comparisonPrice` for litres or kg per sales unit when it exists; fall back to the formula. Use the API's `salesUnit`.

### 4.5 What the codes mean
Full tables with counts and sources are in [docs/data-dictionary.md](docs/data-dictionary.md).

| Code list | Status |
|---|---|
| Allergen codes (all 45 in the data) | **Documented**: GS1 AllergenTypeCode. Resolves the old "unknown" ones: UN shellfish, SO coconut, PN pine nuts, PO pork, BF beef. Adds CM chicken, BP linalool (a fragrance allergen, on non-food items), ABD tuna, NP pod fruits/legumes, ADQ pollock. [SRC: https://gs1.org/voc/AllergenTypeCode-AM and siblings; GS1 Sweden T4078] |
| Claims (21) | **Documented** as a GS1 claim type plus element joined into one string (FREE_FROM + LACTOSE). VEGAN and VEGETARIAN are GS1 diet types. [SRC: GS1 Sweden T4358/T4359; gs1.org/voc] |
| Labels (16) | **Documented**: GDSN T3777, with issuers. `warmTemperature` / `coolTemperature` / `freezeTemperature` are not GS1 codes. [SRC] |
| Nutrient ids | **Documented** (GDSN T4073); `build_slim.py` maps them correctly. [SRC] |
| Unit codes | **Only ST (piece) is documented** [SPEC]. KI = the "N x" outer case is inferred from 1,985 of 2,067 "N x …" names; PAL pallet and KRS pallet layer from the hierarchy; the rest are inferences of varying strength. ZML is a dairy-only custom unit with inconsistent values: never use it in quantity maths. [INF] |
| Temperature classes 1–9 | **Undocumented.** A Valio Aimo ERP field ("Code meanings are not part of this data set" [SPEC]). 7 is frozen and 8 ambient by their labels; 1–4 are chilled. [INF][OPEN: IT mentors, Q45] |
| Category codes | Undocumented; `data/categories.csv` decodes them by example only. [OPEN: Q45] |

## 5. Valio Aimo

| Fact | Value | Source |
|---|---|---|
| Customers / products / suppliers / staff | 20,000 / 20,000 / 700 / 350 | [SRC: Sustainability Review 2025, p.4] |
| Product count elsewhere | "more than 20,000" and "around 25,000" on Valio Aimo's own pages; the brief says 25,000 "product names". The unit is never defined. | [SRC: valioaimo.fi/en/company/why-choose-valio-aimo-as-a-partner/, valioaimo.fi/en/toimitustukku-en] |
| Target groups | horeca, food services, food industry | [SRC: SR25] |
| Customer types on the website | restaurants, hotels, cafés, catering services, large kitchens, service stations, kiosks | [SRC: valioaimo.fi/en/become-a-customer/delivery-wholesale.md] |
| Sales channels | Delivery wholesale; cash & carry (**2 stores**: Sörnäinen, Helsinki and Koivuhaka, Vantaa; Click & Collect at Sörnäinen); **direct sales = ordering straight from the manufacturer** | [SRC: valioaimo.fi/en/become-a-customer.md, valioaimo.fi/valio-aimo-in-english.md] |
| Delivery warehouses | Espoo and Kuopio | [SRC: Maito ja me, Feb 2022] |
| Delivery | "an average of 24 hours", on agreed delivery days | [SRC: valioaimo.fi/valio-aimo-in-english.md] |
| History | Heinon Tukku purchase announced 27 Apr 2021; approved by the competition authority 30 Jun 2021; Valio Aimo brand launched 19 Jan 2022 | [SRC: Valio release; kkv.fi; valioaimo.fi/en/company/] |
| Heinon Tukku at purchase | 4,200 active delivery customers; ~€240M normal-year turnover (~€170M in 2020); 11% of Finnish HoReCa trade, dated 11/2021 | [SRC: Maito ja me (Valio-authored); Valio release 27 Apr 2021] |
| Valio revenue | 2024 €2,278.5M; 2025 €2,422.7M | [SRC: valio.com] |
| Minun Aimo carbon footprint | Launched end of May 2025, mostly at product-group level | [SRC: SR25] |
| Brand survey (autumn 2025) | 86% trustworthy, 84% fair partner, 85% highly professional, NPS 73; sample size not published | [SRC: valioaimo.fi/en/company/why-choose-valio-aimo-as-a-partner/] |
| VALO Tilauspalvelu | Since 2014; order from suppliers (Atria, Froneri, HKFoods, Saarioinen, Snellman Pro, Valio) as their contract customer or without a contract | [SRC: valioaimo.fi/en/become-a-customer/valo-tilauspalvelu-en.md] |
| Competition | Kespro **49.2% (estimate) of the Finnish Grocery Trade Association's foodservice wholesale peer group**, 2025, not of the whole market. Peer group: Kespro, Meira Nova, Suomen Palvelutukkurit, Valio Aimo, Metro-tukku. | [SRC: kesko.fi grocery-trade strategy] |
| Market size | ~€4B, from a **Kesko** investor blog (15 Nov 2021), no method given | [SRC] |
| Market trend | Foodservice wholesale Nov 2025: €198.1M, −5.5% year on year; **Jan–Nov 2025 −0.9%**; Nov 2025 had one fewer delivery day | [SRC: pty.fi] |

### How customers order today (public facts only)
- **Webshop:** yes, works on mobile; file import, order templates (incl. centralized ones a main user controls), standard recurring orders, favourites, linked accounts for multi-site users. [SRC: toimitustukku.valioaimo.fi/en/faq]
- **Phone and email** via the Sales Service. [SRC]
- **No public mobile app, EDI or customer API** is documented. [SRC: absence] Integration with Jamix or Aromi is not documented either. [OPEN: IT mentors, Q32]
- **Cut-offs:** each product shows its own closing time; deliveries come on agreed delivery days; confirmed orders can be edited until picking starts; recurring orders need 7 days to change; a public holiday adds a day. No category or route cut-off times are published. [SRC: FAQ][OPEN: Q37]
- **Substitution:** the webshop suggests substitutes, and the customer decides. What happens at picking and how the customer is told is not published. [SRC: FAQ][OPEN: Q28, Q39]
- **Customer-specific prices exist** in production ("net-priced products and discount levels by product group" in My Aimo; contract pricing at cash & carry). Whether chains or public kitchens are limited to a contract assortment is not published. [SRC: valioaimo.fi/en/become-a-customer/my-aimo.md][OPEN: Q7, Q35]

## 6. Market facts used in the segment research

Corrected or confirmed facts only. They don't change any segment ranking; that remains a team decision.

| Fact | Correct statement | Source |
|---|---|---|
| Atria Kokkibarometri 2025 | 516 chefs/kitchen leads (306 private, 202 public); fieldwork Sep–Oct 2025, published 5 Mar 2026 | [SRC: atriaammattilaiset.fi Kokkibarometri 2025 PDF] |
| Labour | 83% say finding skilled staff will take a lot of work | same |
| Cost | 87% **see** people visiting restaurants less often; 82% **feel** customers choose cheaper dishes (current trends, not expectations) | same |
| Ready-made ingredients | 36% **of the 241 who rated staff skills weak or middling** will order more ready-made ingredients, led by 500+ portion kitchens | same |
| Origin data | 59% (75% public sector, 74% 500+ portion kitchens) think restaurants should offer **diners** a digital way to check ingredient origin | same |
| Wellbeing counties | 21 counties since 1 Jan 2023, **plus the City of Helsinki** (runs its own health and social care) and Åland | [SRC: stat.fi] |
| Public kitchens | ~380M meals and ~€350M/year (MTK); ~383M meals and ~€600M (ministry deck at Hansel) | [SRC] |
| Public contracts | Prices "typically revised once a year". Multi-year framework terms are not in the cited source. | [SRC: valtioneuvosto.fi] |
| Helsinki "Puolet parempaa" | Council vote 25 Feb 2026, 57–23, to halve meat and dairy purchases by 2030 | [SRC] |
| Palvelukeskus Helsinki | ~500 sites across all its services (food, cleaning, transport…); ~70% of the city's food services | [SRC] |
| Turku | 23 production, 68 service, 33 distribution kitchens: daycare, school and education kitchens only | [SRC] |
| Special diets in schools | "Up to a fifth" is **unverified**: the cited PDF is unreadable, and municipal figures range from ~4–6% (Espoo) to ~25% (Vantaa, incl. ethical and religious diets) | [OPEN] |
| Compass Group Finland | €277.9M revenue, 2,525 staff, FY to 30 Sep 2025; bought Fazer Food Services (~1,000 restaurants, half in Finland) in **2019**; Heart Symbol goal (up to 50% of new recipes) 13 Oct 2025 | [SRC] |
| Attendo | ~430 homes is a **2023** figure (link now 404); the undernourishment story is Yle **2019** about a **2016** inspection | [SRC] |
| Scandic | 60% plant-based food goal for 2025; Scandic called Finland a "cautious market" (the "weak spot" wording is CoStar's) | [SRC] |
| Allergen duty | The serving operator must give allergen information for non-prepacked food: EU Regulation 1169/2011 Art. 44 and Finnish decree MMM 834/2014 | [SRC] |
| Food waste | ~17% of food in Finnish food services wasted, serving waste largest (Luke 2019) | [SRC] |
| Risku-Norja | "Over half of out-of-home meals are public catering" rests on 2007/08 data | [SRC] |
| Kitchen systems | Jamix: "Integrated with your suppliers for electronic orders"; CGI Aromi integrates with Synkka; "widely used in the largest cities" is CGI's own claim | [SRC] |

## 7. Open standards (status, Nov 2026)

None is required by the brief (section 2). Listed for the openness criterion; choosing among them is a team decision.

| Standard | Status | Source |
|---|---|---|
| GS1 General Specifications (GTIN, GLN) | Release 26.0, Jan 2026 | https://ref.gs1.org/standards/genspecs |
| GS1 Web Vocabulary | 1.18.0, 1 Jun 2026 | https://ref.gs1.org/voc/ |
| GS1 Digital Link URI Syntax | 1.6.0, Mar 2025; conformant with ISO/IEC 18975:2024 | https://ref.gs1.org/standards/digital-link/uri-syntax/archive |
| Peppol BIS Ordering | **3.3** (not 3.0) | https://docs.peppol.eu/poacc/upgrade-3/profiles/28-ordering/ |
| Peppol in Finland | Central government uses Peppol **Advanced** Ordering since 1 Apr 2024; a retail ordering guide (with SOK and Kesko) since Nov 2024. No public evidence of Peppol ordering in Finnish foodservice. | https://www.valtiokonttori.fi/en/maaraykset-ja-ohjeet/peppol-ordering-implementation-guide-for-finnish-retail-sector/ |
| AP2 (Agent Payments Protocol) | v0.2; contributed to the FIDO Alliance Apr 2026; mandates now Checkout and Payment | https://ap2-protocol.org/ |
| W3C Verifiable Credentials 2.0 | W3C Recommendation, 15 May 2025 | https://www.w3.org/TR/vc-data-model-2.0/ |
| MCP | Spec revision 2026-07-28, under the Linux Foundation's Agentic AI Foundation. **The brief puts an MCP-style interface out of scope.** | https://modelcontextprotocol.io/specification/latest |
| A2A | v1.0.0 | https://a2a-protocol.org/latest/specification/ |
| OAuth 2.0 Token Exchange | RFC 8693; its `act` claim records delegation | https://www.rfc-editor.org/rfc/rfc8693 |
| OpenAPI | The repo spec is 3.1.0; the latest release is 3.2.1 (Sep 2026) | https://spec.openapis.org/oas/latest.html |
| x402, Nevermined | Named by the brief as "not required"; not checked | — |

## 8. Questions this answers, and what is still open

**Answered here (no need to ask):** Q30 for the mock (one schedule line; `availableDate` never moves), Q44 (999999 = unknown), the Terminal string, whether `customer` and `requestedDate` matter, whether the mock can order (no), the submission deadline, and the meaning of every allergen, claim, label and nutrient code.

**Partly answered:** Q7/Q35 (customer prices exist; assortment rules unknown), Q25 (which channels exist; their shares unknown), Q28/Q39 (webshop behaviour only), Q31 (FREE_FROM explicit; meaning of the separate group unknown), Q36 (dimensions named in the brief), Q37 (how cut-offs work; times unknown), Q40 (categories only), Q43 (step size defined; 0.01 unexplained), Q45 (allergens yes; units, temperature, categories no).

**Only Valio Aimo can answer** (factual, not opinion): segment split and priorities (Q1–2, Q4–6), segment-specific practice (Q8–24), channel shares and pain points (Q25–27), fill rate (Q38), production prices and price validity (Q29), what must stay hidden and how an agent proves who it acts for (Q40–42), whether 0.01 lots are real (Q43), unit, temperature and category codes (Q45), and Jamix/Aromi/EDI integrations (Q32). See [research/mentor-questions.md](research/mentor-questions.md).

**Team decisions, deliberately untouched:** see [QUESTIONS.md](QUESTIONS.md).

## 9. Corrections made to earlier files

| Was | Now | Where |
|---|---|---|
| 7,205 + 2,231 = 9,424 | 7,193 + 2,231 = 9,424 (7,205 includes 12 UNDECLARED-only) | CHANGES, data dictionary, 03 |
| "free from" is an interpretation of the field name | Every value carries `unit: FREE_FROM`; only the meaning of the separate group is open | data dictionary, 03, Q31 |
| 35 "drinking milks", "mostly Valio and Arla" | 35 lactose-free products in 10400, 25 of them plain milk, all Valio or Arla | README, CLAUDE, 01, 03 |
| Name matches are "cocoa, quark, milk powder" | Largest group is coffee-milk drinks (12) | 01, 03, CHANGES |
| `net_l × su_in_bu` holds | Held only for the milks; failed on ~700 "NxSIZE" products. Fixed in `build_slim.py` and `data/` | data dictionary, CLAUDE, `scripts/build_slim.py`, `data/` |
| Only Stock has real quantities | Stock also has a 9,999,999,999-base-unit sentinel | CLAUDE, 03 |
| `availableDate` may differ from the requested date | In the mock it never moves; `requestedDate` is ignored | CLAUDE, 03, 04 |
| Empty `scheduleLines` = unknown product | Also 24% of real products | CLAUDE |
| `netPriceFound` false on every call | True on 16 of 1,000 | CLAUDE, 01, 03, 04, Q29 |
| Allergen, claim and label glossaries "unverified" | Documented (GS1); units and temperature still inferred | data dictionary |
| Direct sales = "a salesperson for bigger accounts" | Ordering straight from the manufacturer | 01 |
| Atria 87/82%, "a third", 59/75% | Wording and base corrected (section 6) | 04 |
| 21 wellbeing counties run health care | Plus Helsinki and Åland | 01, 02 |
| Peppol "Ordering 3.0" | BIS Ordering 3.3 | 04 |
| Scripts crash on Windows | `build_slim.py` and `profile_products.py` read and write UTF-8 explicitly | scripts |
