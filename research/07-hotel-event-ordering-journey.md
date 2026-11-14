# How a Finnish hotel gets the food for a large event

> **Research report and journey map, 14 Nov 2026.** Question: how does a large hotel in Finland get the ingredients for a large event (wedding, pikkujoulut, gala or conference dinner), from booking to service, and what does Valio Aimo see along the way? Built from three Sonnet research passes (international banqueting practice, Finnish hotels, the wholesaler side), a review pass that re-checked the load-bearing sources and ruled on ten disputes, and answers from Valio Aimo staff at the stand. Source files are in [notes/hotel-event-journey/](notes/hotel-event-journey/); the visual version is [journey-map.html](notes/hotel-event-journey/journey-map.html).
>
> Evidence tags: **[STAND]** said by Valio Aimo staff at the Junction stand, 14 Nov, relayed by the team and paraphrased (name not recorded); **[SRC]** public document, checked; **[INF]** our reading; **[OPEN]** unknown; **[TEAM]** team decision. Where this file and [../GROUND_TRUTH.md](../GROUND_TRUTH.md) disagree, the ground truth wins.

The event order goes to Valio Aimo **months in advance** and is amended on **one clarification call between the hotel and its Valio Aimo sales rep, about 2–3 weeks before the event** [STAND]. The call mostly changes head count (no-shows are known by then) and items and quantities; sometimes allergen information; occasionally a special-order item [STAND]. The 2–3 week timing matches the Finnish hotels' own deadline for the client's final numbers and diets: 2 weeks at S Group and Rantapuisto, 7–21 days by group size at VALO Hotel & Work [SRC]. No order field carries head count, menu or event type, so **Valio Aimo learns the event context only through the rep, by phone** [SRC][STAND]. Valio Aimo's own customer interviews found hotel and restaurant recipes kept in Word and Excel, which is why it built a recipe-to-cart tool into My Aimo [SRC]. What stays unknown: whether changes in the last 3 working days reach Valio Aimo, and what Valio Aimo does when a line is short at picking.

## The journey

| # | Stage | When | Who acts | What passes | Valio Aimo sees | Weakest evidence |
|---|---|---|---|---|---|---|
| 1 | Event booked | Months ahead | Client, hotel sales | Enquiry → written confirmation with cancellation and billing terms | Nothing | SRC |
| 2 | Menu turned into an ingredient list | Months ahead | Hotel kitchen | Package menu × expected head count → ingredient list | Nothing | INF |
| 3 | Order placed with Valio Aimo | Months ahead | Hotel kitchen; Valio Aimo | Order lines: product, quantity in sales units, delivery date | Order lines only | STAND |
| 4 | Client sends the event specification | 7–21 days before | Client → hotel | Final head count, special diets, menu choices, meal times | Nothing new | SRC |
| 5 | Clarification call | ~2–3 weeks before | Hotel ↔ Valio Aimo rep | Head count, item and quantity changes, sometimes allergens | Event context, by phone, held by the rep | STAND |
| 6 | Last changes | Up to 3 working days before | Client → hotel; maybe Valio Aimo | Late head-count or diet change; possibly an edited order | Unknown | OPEN |
| 7 | Valio Aimo checks and picks | Before delivery | Valio Aimo | Price, availability, closing time; shortages | Order lines | OPEN |
| 8 | Delivery and receiving | Agreed delivery day | Valio Aimo; hotel kitchen | Goods and delivery note | Order lines | SRC |
| 9 | Event and billing | Event day | Hotel; client | Invoice on the confirmed number, or actual if higher | Nothing | SRC |

### 1. Event booked (months ahead)
- Binding once both sides confirm in writing [SRC: VALO Hotel & Work terms 7.2].
- Free cancellation shrinks with group size and time: e.g. Haikko, 150+ person-days, fully free only until 120 days out [SRC: Haikko]. Very large groups are negotiated: over 250 at VALO, over 350 at S Group [SRC].

### 2. Menu turned into an ingredient list (months ahead)
- Valio Aimo's customer interviews found recipes scattered across Word and Excel files [SRC: Valio Aimo, 14 Jan 2026].
- My Aimo's recipe tool ("Minun reseptit", Jan 2026): paste a recipe, change portion size and count, add waste, see margin; contract-priced products are suggested first; "add to cart" puts the smallest sales unit that covers the need in the cart, then the cart can be edited and the delivery date changed [SRC: same article].
- One Finnish hotel resort (Vuokatti Sport) keeps all recipes in JAMIX and its kitchen manager handles purchase orders [SRC: JAMIX case study].
- Who does this conversion at a chain hotel, and in what tool [INF: head chef or kitchen manager][OPEN].

### 3. Order placed with Valio Aimo (months ahead)
- Event orders are normally placed months in advance [STAND].
- Webshop carts can be planned several weeks ahead and edited after confirmation [SRC: delivery-wholesale page]. Research 06 heard the same: event orders placed early can be amended until the cut-off [STAND, research/06].
- No public order field carries head count, menu or event type; no public EDI, API or kitchen-system integration [SRC].
- Whether the months-ahead order is a dated webshop/SAP order or a reservation the rep holds, and how many months [OPEN].

### 4. Client sends the event specification (7–21 days before)
| Hotel | Specification due | Last changes | Billing |
|---|---|---|---|
| S Group hotels | ≥ 2 weeks before arrival (programme, diets, one menu per group) | Reductions on a sliding scale by size | Actual if higher; shortfall against a minimum order |
| VALO Hotel & Work | 7 / 14 / 21 days for 1–15 / 16–50 / 51–200 guests | After the deadline the hotel may re-price, charge room rent or change the room | Over 250 guests negotiated |
| Hotel Rantapuisto | 2 weeks (diets, menu, meal times) | Head count up to 3 working days before | Invoice ≤ 3 days before on the confirmed number, or actual if higher |
| Haikko Manor & Spa | Name list 14 days before | Not stated | ~90% invoiced in advance, 14 days before, over €3,000 |
| Scandic Finland | 2 weeks (search summary only) | Sliding table | Reservation valid for the stated number |

[SRC for all but Scandic, which is a search summary.] The serving operator owes diners the allergen information [SRC: GROUND_TRUTH section 6]. The US and Irish 72-hour guarantee does not describe Finland [SRC: review D1, D9].

### 5. Clarification call (~2–3 weeks before)
- Usually one call, between the hotel and its Valio Aimo rep [STAND].
- Most often: head count (no-shows), items and item counts. Sometimes: allergen information. Occasionally: a special-order item [STAND].
- Special-order items are possibly out of scope [TEAM].
- The call lands just after the hotel's own specification deadline, so it likely passes on the client's changes [INF].
- Who starts the call, and who at the hotel takes it [OPEN].

### 6. Last changes (up to 3 working days before)
- Rantapuisto accepts head-count changes up to 3 working days before; after its deadline VALO may re-price or refuse [SRC].
- A Finnish hotel head-chef ad (Glo Hotel Art) says event changes happen at the last minute [SRC].
- Valio Aimo orders can be edited until picking starts; each product has its own closing time [SRC: GROUND_TRUTH section 5]. Lead times run next day to about 4 days [STAND, research/06].
- Whether these late changes reach Valio Aimo, and how [OPEN].

### 7. Valio Aimo checks and picks
- The webshop suggests substitutes at order time and the customer chooses [SRC: GROUND_TRUTH section 5].
- Kespro's warehouse phones ahead about missing items and the customer chooses the substitute [SRC: Kespro], for comparison.
- What Valio Aimo does when a line runs short at picking [OPEN: stand question 14].

### 8. Delivery and receiving
- Delivery within about 24 hours on agreed delivery days [SRC]. The kitchen checks goods on receipt [INF].

### 9. Event and billing
- Billing is the confirmed number, or actual if higher; S Group charges a shortfall against a minimum order [SRC].

## Team decisions

- **The brief's 1,000 L of lactose-free milk is an illustrative number** [TEAM]. At 0.1–0.25 L of milk per guest (vendor breakfast guide), a 1,000-guest event needs roughly 100–250 L, so 1,000 L is not one event's volume [SRC + INF]. The demo can still use it as the brief's example (see [../AGENTS.md](../AGENTS.md)); this map follows the event journey.
- **Special-order items are possibly out of scope** [TEAM].

## How this fits with the other hotel documents

Nothing in those files was changed; differences are noted here for the team.

- **[06 Valio Aimo conversation](06-valio-aimo-conversation-2026-11-14.md):** consistent. 06 says event orders placed weeks ahead are amended before the cut-off; this adds that the order goes in months ahead, that the amendment is one call with the rep 2–3 weeks out, and what changes on it.
- **[05 spike orders](05-spike-orders-under-time-pressure.md) and [ICP.md](../ICP.md): a tension to discuss.** Both frame the urgent order as the correction when final numbers and diets arrive 1–3 days before service. The stand describes the main amendment as happening on a call 2–3 weeks out. Finnish hotels do accept changes up to 3 working days before, but whether those reach Valio Aimo is [OPEN]. This is evidence for the team to weigh, not a decision.
- **[Customer journeys by role](../docs/hotel-catering-customer-journeys.md) (hypothesis):** confirmed: the BEO-like specification feeds the kitchen; Minun Aimo recipe scaling and recipe-to-cart exist. Added here: the timeline, the rep call, and that Valio Aimo sees only order lines. Not found in Finnish sources: a separate purchasing-manager role in hotels (the one verified case has the kitchen manager ordering), and whether chains buy centrally. 05 calls Sokos and Radisson Blu "likely tied to Meira Nova"; the review found no source naming any chain's wholesaler, and Scandic has group procurement but names none [OPEN].

## Still open

| Question | Who can answer |
|---|---|
| Who starts the clarification call, and who at the hotel takes it? | Valio Aimo |
| Is the months-ahead order a dated webshop/SAP order or a rep-held reservation? How many months? | Valio Aimo |
| Was the stand describing hotels specifically, or event and catering customers in general? | Valio Aimo |
| Do changes in the last 3 working days reach Valio Aimo, and how? | Valio Aimo, hotel |
| What happens when a line is short at picking? (stand question 14) | Valio Aimo |
| Can My Aimo's recipe tool scale by guest count and combine several recipes in one cart? | Pirjo Kaartinen |
| Who turns the menu into quantities at a chain hotel, and in what tool? | Hotel chef |
| Do chains buy centrally, and from which wholesaler? | Valio Aimo |
| Do Finnish kitchens prepare a buffer above the confirmed count? | Hotel chef |

## Sources

- VALO Hotel & Work, general terms 2025: https://valo.fi/userassets/uploads/2025/10/VALO_Yleiset-toimitusehdot-2025-2.pdf
- S Group hotels, event reservation terms: https://www.sokoshotels.fi/en/terms-of-reservation/events
- Hotel Rantapuisto, group and meeting terms: https://www.rantapuisto.fi/kokous/ryhma-ja-kokousvarausten-ehdot/
- Haikko, group delivery terms: https://www.haikko.fi/fi/ehdot-ja-saannot/toimitusehdot-ryhmille
- Scandic Finland, meeting terms (search summary only): https://www.scandichotels.com/en/conferences-meetings/meeting-menus-finland/terms-and-conditions
- Valio Aimo, "Reseptisi ja katelaskenta Minun Aimossa", 14 Jan 2026: https://www.valioaimo.fi/artikkelit/pinnalla-nyt/reseptisi-ja-katelaskenta-minun-aimossa/
- JAMIX case study, Vuokatti Sport: https://www.jamix.com/?p=15228
- Valio Aimo, delivery wholesale: https://www.valioaimo.fi/en/become-a-customer/delivery-wholesale.md
- Valio Aimo, innovative tools: https://www.valioaimo.fi/en/company/why-choose-valio-aimo-as-a-partner/innovative-tools-for-everyday-work/
- Glo Hotel Art, head chef job ad: https://jobs.strawberryhotels.com/jobs/205680-glo-hotel-art-keittiomestari-1125h3vk
- Kespro, restaurant wholesale: https://www.kespro.com/en/services/restaurant-wholesale
- Breakfast portion guide (milk per guest): https://kitchennmbrs.app/en/knowledge-base/breakfast-brunch-calculation/how-do-i-calculate-the-portion-per-person-for-a-breakfast-buffet
- Scandic, sustainable procurement policy, Apr 2024: https://www.scandichotelsgroup.com/files/Reports/Policies/Scandic-sustainable-procurement-april-2024.pdf

## Files behind this report

| File | What it is |
|---|---|
| [A-banqueting-ops.md](notes/hotel-event-journey/A-banqueting-ops.md) | International banqueting practice (US, UK, IE, AU sources) |
| [B-finland.md](notes/hotel-event-journey/B-finland.md) | Finnish hotel terms, job ads, kitchen software |
| [C-wholesaler.md](notes/hotel-event-journey/C-wholesaler.md) | Wholesaler side: Valio Aimo, Kespro, international distributors |
| [D-review.md](notes/hotel-event-journey/D-review.md) | Review: settled facts, ten disputes with rulings, corrections to A–C. **Read its corrections before citing A–C.** |
| [E-resolutions.md](notes/hotel-event-journey/E-resolutions.md) | Stand answers and team decisions that resolved D1–D3 |
| [journey-map.html](notes/hotel-event-journey/journey-map.html) | The visual journey map |
