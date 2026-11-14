# Segment research: chain first (Darragh's pass)

Nov 14, 2026 · Darragh Evanson

> **Status:** a separate research pass from [01-customer-options-brief.md](01-customer-options-brief.md). It recommends **hotel and restaurant chains first, public kitchens a close second**. 01 has since shortlisted A, B, C and E and ruled public kitchens out. Which view holds is a team decision; see question 1 in [QUESTIONS.md](../QUESTIONS.md).
> Converted from the original text export (`docs/research-export.txt`). The mentor questions moved to [mentor-questions.md](mentor-questions.md). Facts the challenge data has since answered are marked **[now known]**.
>
> **Facts re-checked 14 Nov 2026** against the cited sources, the brief and the API; see [../GROUND_TRUTH.md](../GROUND_TRUTH.md). Corrections are marked **[checked]**. The recommendation and verdicts are untouched.

## What to know

Target multi-site kitchens that already hold recipes as data, with a hotel or restaurant chain as the demo persona.

- **Customers:** Valio Aimo serves HoReCa, food services and food industry, about 20,000 customers in total. No split by segment is published.
- **Customer priorities:** labour shortage, cost pressure, delivery reliability and digital origin data.
- **Second choice:** public-sector kitchens (schools, hospitals). The gap to the chain is narrow.
- **Not independents:** their recipes live in the chef's head, so an agent has nothing to compute from.
- **Centrepiece scenario:** a stock-out substitution that keeps the allergen profile intact.

## Target customer

The deciding factor is whether the kitchen already holds recipes and portion counts as data. Without them an agent can only take dictation.

| Segment | In Aimo's base | Recipe data | Time pressure | Cost of a wrong order | What the agent does | Verdict |
|---|---|---|---|---|---|---|
| Hotel or restaurant chain | Yes | Standardised menus | High (events) | Moderate | Computes need, orders, swaps | **First choice** |
| Public kitchen (school, hospital) | Yes, Valio's legacy side | Fully in a system | Low, until a stock-out | Highest | Allergen-safe swaps, drift alerts | Close second |
| Independent restaurant or café | Yes, Heinon Tukku's legacy side | In the chef's head | Highest | Moderate | Reorders by request; thin value | Last |
| Food industry, bakeries | Yes | Specification-driven | Low | High | Little: supply is negotiated in bulk | Rule out |
| Grocery retail | No | | | | | Rule out |

### Why the chain is first

- It matches the sponsor's own example: a hotel chain's agent ordering 1,000 litres of lactose-free milk by Monday.
- 1,000 litres will likely exceed single-product stock, which forces partial fills, pack-size conversion and substitution ranking.
- Events create short-notice orders, where autonomy is worth most.
- A chain plausibly has the IT to run an external purchasing agent.

### Why public kitchens are close

- They are the larger problem by volume: statutory public catering provides over half of Finland's out-of-home meals (Risku-Norja; **[checked]** based on 2007/08 data).
- Tender contracts fix prices, which fits the brief's "fixed prices rather than a negotiated quote".
- 75% of public-sector kitchens want a digital service showing ingredient origin, which is the brief's "trust protocol" (Atria Kokkibarometri 2025). **[checked]** The survey item is whether restaurants should offer **diners** a digital way to check ingredient origin, not whether kitchens want origin data from suppliers.
- Against: menus are planned weeks ahead, procurement law adds domain load, and an allergen error in the demo would be fatal.

### Corrections made during the research

- The first ranking screened segments by approval hierarchy. That was dropped: the buyer is assumed to have full ordering authority.
- The claim that independents fail on guardrails was wrong. An owner still delegates to an agent, so guardrails apply to every segment.
- Independents still rank last, now because of missing recipe data.

### Differentiation

Most teams will copy the hotel example. Differentiate on guardrail depth, and show a second customer's policy file (e.g. a school kitchen) running on the same engine to prove generality.

## Who Valio Aimo serves

Valio Aimo names three target groups: HoReCa, food services and food industry (Sustainability Review 2025).

| Group | Who | Came from | Main channel |
|---|---|---|---|
| HoReCa | Restaurants, cafés, hotels, catering, from small independents to national chains | Heinon Tukku | Delivery wholesale, cash & carry |
| Food services | Municipal, school and hospital kitchens, staff restaurants | Valio | Delivery wholesale under contract |
| Food industry | Bakeries, food manufacturers | Both | Direct sales |

**[checked]** The Sustainability Review lists the three groups and, separately, three channels. It does not link groups to channels or to their origin, so the "Came from" and "Main channel" columns are inference. "Direct sales" on Valio Aimo's site means ordering straight from the manufacturer.

- Valio's long-standing accounts were professional kitchens such as hospital districts and municipalities. Heinon Tukku's were mainly restaurants and cafés in the Helsinki region (Maito ja me).
- A named chain customer: NoHo Partners, which runs over 250 restaurants and venues (same source, Feb 2022; current status not checked).

### Breakdown

No revenue or customer split by segment is published. The only public figures:

- About 20,000 customers today (challenge brief and Sustainability Review 2025).
- At the 2021 acquisition, Heinon Tukku had 4,200 active delivery customers, about €240 million normal-year turnover (about €170M in 2020) and 11% of Finnish HoReCa trade (Maito ja me, a Valio-authored article; **[checked]** the 11% is dated 11/2021, after the deal).

Inference, not sourced: the gap between 4,200 delivery accounts and 20,000 customers suggests a long tail of small cash & carry buyers, with revenue concentrated in delivery customers, chains and public contracts.

## Priorities across Finnish professional kitchens

From Atria Kokkibarometri 2025 (516 chefs and kitchen leads, 306 private and 202 public; fieldwork Sep–Oct 2025; not Aimo's own customers):

- **Labour:** 83% expect finding skilled staff to be a major task.
- **Cost:** 87% see people visiting restaurants less often; 82% feel customers are choosing cheaper dishes. **[checked]** These describe current trends, not expectations.
- **Less prep work:** 36% plan to order more ready-made ingredients, led by kitchens serving 500+ portions a day. **[checked]** The 36% is of the 241 respondents who rated their staff's skills weak or middling, not of all 516.
- **Origin data:** 59% (75% in public-sector kitchens, 74% in 500+ portion kitchens) think restaurants should in future offer **diners** a digital service to check ingredient origin. **[checked]**

Aimo-specific:

- **Delivery reliability:** customers associated reliability and flexibility with Heinon Tukku (Maito ja me). **[checked]** This is Valio Aimo describing itself in Valio-authored content, not customer evidence.
- **Sustainability:** customers have raised it repeatedly (Sustainability Review 2025).

### Priorities by group (industry reading, not sourced)

| Group | Top priorities |
|---|---|
| Independents | Time, cash flow, next-day reliability, small pack sizes |
| Chains and hotels | Consistency across sites, contract prices, event flexibility |
| Public kitchens | Contract compliance, special diets, cost per meal, origin and nutrition data |
| Industry | Specification, volume, price stability |

## Industry primer: how an order is built

Every real ordering problem is an error in one term of this calculation:

> Order quantity = (forecast portions × recipe quantity per portion) − stock on hand, rounded up to pack sizes and sent before the wholesaler's cut-off.

1. **Forecast.** Portions are guessed. Luke measured about 17% of prepared food in Finnish food services ending up as waste, mostly at the serving line (Luke 2019).
2. **Recipe.** In small kitchens the recipe lives in the chef's head, so there is nothing for an agent to compute from.
3. **Stock.** Few kitchens keep a live count; ordering starts with a walk through the cold room.
4. **Cut-off.** Ordering happens after service, against a deadline. In a 2017 ordering-platform survey, 41% of venues named the cut-off as their top supplier headache (Ordermentum). This is vendor data, not Finnish.
5. **Fill.** The wholesaler runs short and the picker swaps the product without knowing the recipe it goes into.
6. **Allergen duty.** The kitchen that serves the food owes diners the allergen information (Ruokavirasto; legal basis EU Regulation 1169/2011 Art. 44 and Finnish decree MMM 834/2014), so a silent swap makes its allergen sheet wrong. Hospital kitchens worry most that a swap breaks a patient's diet order or introduces an allergen (Healthcare Facilities Today).

## Kitchen production systems

Finnish institutional kitchens already run systems that hold recipes, diets and portion counts.

- Jamix can send digital purchase orders straight to suppliers.
- CGI Aromi covers raw-material ordering through production and is widely used in Finland's largest cities and municipalities.

For those kitchens the "external purchasing agent" plausibly sits on top of Jamix or Aromi. That gives a concrete buyer-side system to name on the production-path criterion.

## Time pressure vs allergen strictness

They are different axes, not rivals.

- **Time pressure** decides whether a human can check the order at all. Where there is no time, autonomy is the product.
- **Allergen strictness** decides how much a wrong order costs. Checking it is a hard filter on product data: easy to compute, and only as good as the data.
- **They collide in substitution.** A stock-out forces a fast swap, and the swap must keep the allergen profile. That is the hard case, and the brief names it.

The 20% "autonomy and controls" criterion applies between any buyer and their agent, whatever the segment.

## What the brief leaves unclear

1. What to build: Aimo's interface, the buyer's agent, or both.
2. Whose approval: a human at the buyer, or at Aimo.
3. "Comparing offers": between what, if prices are fixed and it is only Aimo's assortment.
4. "Fixed prices": list price or customer-specific contract price, and how long a quote holds. **[now known, for the mock]** The price API returns `catalogPrice` (the price paid) and a higher `listPrice` (pre-discount reference), with `validFrom`/`validTo`; the `customer` field has no effect, and `netPriceFound` is true on about 1.6% of products whatever the customer.
5. "Our requirements": where the buyer's preferences live and in what format.
6. Substitution: called optional, yet robustness to exceptions is 15% of the score.
7. "Open standards": which ones the judges have in mind. **[checked]** The brief requires none. It names only x402 and Nevermined ("relevant context but not required") and puts "an MCP-style agentic interface" outside the challenge scope.
8. Confidential data: what an agent must never see.

**[checked]** The brief settles none of these outright; its exact wording on each is in [../GROUND_TRUTH.md](../GROUND_TRUTH.md) section 2.

## What to research for tuning preferences

Seven inputs set the agent's preference and guardrail model.

1. **Hard constraints vs soft preferences.** Lactose-free, allergens and delivery date are hard. Brand, origin, certificates and pack size are soft and weighted.
2. **Spend thresholds.** Typical order value per site and real approval limits by role. *(Mentors have said spend limits are not an expected pain point; keep only if that changes.)*
3. **Substitution policy.** Which swaps can be auto-approved: same category, allergen-preserving, capped price difference. Anything outside goes to a human.
4. **Delivery rules.** Cut-off times and lead times per category. Aimo states delivery in about 24 hours on average (Valio Aimo in English). **[now known, partly]** The availability API returns a per-product `closingTime`. For Monday delivery most Stock products close Sun 17:00, some Stock Fri 13:00, and Terminal products 10–12 Nov. The mock ignores `requestedDate`. Publicly, Valio Aimo delivers on agreed delivery days and publishes no category cut-off times.
5. **Contract assortment.** Whether chains order from a restricted list at contract prices; this defines what the agent can see.
6. **Unit normalisation.** 1,000 litres has to map onto 1 litre cartons or 10 litre bag-in-box, with price compared per litre. See the conversion rule in [../docs/data-dictionary.md](../docs/data-dictionary.md).
7. **Standards.** GS1 identifiers, Peppol ordering, AP2-style mandates and W3C Verifiable Credentials for the trust layer. **[checked]** All exist: GS1 General Specifications Release 26.0; Peppol BIS Ordering **3.3** (Finland's central government uses Peppol Advanced Ordering; no public evidence in foodservice); AP2 v0.2, now with the FIDO Alliance; W3C VC 2.0 a Recommendation since May 2025. None is named in the brief. Statuses and links: [../GROUND_TRUTH.md](../GROUND_TRUTH.md) section 7.

## Data missing and unverified

- **Segment split:** Aimo publishes no revenue or order split by segment.
- **Mock portal:** ~~could not be reached during research~~ **[now known]** The dataset and API spec are in this repo (`data/`, `api/openapi.json`). The catalogue has allergen data (54% of products), pack sizes, and stock via the availability API; per-customer prices are not modelled in the mock.
- **Cut-off times and fill rate:** not public. Cut-off is now visible per product from the API; fill rate is not.
- **Integrations:** whether Aimo already connects to Jamix or Aromi is unknown. **[checked]** Nothing is public: no customer EDI, API or kitchen-system integration is documented.
- **Hotel chains:** how widely they use kitchen production systems is unknown.
- **Ordering time in Finland:** no Finland-specific figures were found; the cut-off survey is Australian vendor data from 2017.
- **Priorities by group:** the per-segment priority table is an industry reading, not sourced.

## Sources

The Aimo review, Maito ja me, Atria and the Aimo expertise page were opened in full; the rest were read from search results. The original export listed source names without links.

- Valio Aimo Sustainability Review 2025
- Maito ja me: Valio Aimo, tukkukaupalla sinun
- Atria Kokkibarometri 2025
- Valio Aimo: applied expertise
- Valio Aimo in English
- Valio to acquire Heinon Tukku
- Risku-Norja: municipal catering in Finland
- Luke: food waste in households and food services (2019)
- Ruokavirasto: mandatory food information guide
- Healthcare Facilities Today: food service supply chain
- Ordermentum retailer survey 2017
- Jamix integrations
- CGI Aromi
