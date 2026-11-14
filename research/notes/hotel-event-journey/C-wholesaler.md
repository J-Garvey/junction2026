# Research C: the wholesaler side of large hotel event orders

Date of research: 14 Nov 2026. Method: about 20 web searches and fetches (WebSearch and WebFetch only). Public pages almost never cover event handling, pre-order rules, substitution mechanics or shortage allocation. Most of the answers below are therefore [INFERRED] or [ASSERTED], and are labelled that way. Where a claim is [SOURCED], the quote is short and Finnish text is translated.

Tags: [SOURCED: url: paraphrase], [INFERRED: basis], [ASSERTED: general knowledge, not verified]. Confidence H/M/L. Scope in brackets.

Contradictions with GROUND_TRUTH: none found. Additions to it are flagged "NEW".

---

## 1. Claims by question

### Q1. When does the wholesaler first learn of a large event? Lead times?

- C1. The public Valio Aimo webshop can plan several carts for several delivery dates, "weeks ahead", and confirmed orders can be modified. So an order can reach Valio Aimo long before delivery, as order lines with a future delivery date. [SOURCED: https://www.valioaimo.fi/en/become-a-customer/delivery-wholesale.md: carts for several delivery dates, planned weeks ahead, orders modifiable after confirmation] H, Valio Aimo.
- C2. Neither Valio Aimo nor Kespro publishes any pre-order, special-order (erikoistilaus), seasonal or Christmas pre-order process, or any quantity threshold that triggers contact with a sales rep. Searches in Finnish and English returned nothing on these. [SOURCED by absence: searches of valioaimo.fi and kespro.com, 14 Nov 2026] M, absence of evidence only. Public pages are not a full picture. The Valio Aimo FAQ (toimitustukku.valioaimo.fi/en/faq) is client-rendered and returned only the word "Aimo" to the fetcher, so I relied on GROUND_TRUTH section 5 for its content.
- C3. In practice a wholesaler will often know about a big event earlier than the order lines only if the hotel's purchaser tells the rep, or if the order is placed early. Nothing public says the hotel must do so. [INFERRED: C1 plus absence in C2; typical practice] L.
- C4. Valio Aimo's headline delivery promise is "an average of 24 hours" on agreed delivery days. Most products have a 24-hour window. [SOURCED: https://www.valioaimo.fi/en/become-a-customer/delivery-wholesale.md: most products have a 24-hour delivery window] H, Valio Aimo. This is the normal lead time for a normal-size order. No public lead time exists for unusual quantities.
- C5. Valio Aimo's recurring (standing) orders need 7 days to change, and a public holiday adds a day. [SOURCED: GROUND_TRUTH section 5, citing the Valio Aimo FAQ] H, Valio Aimo. I could not re-fetch the FAQ to re-verify.
- C6. Kespro Restaurant Wholesale (a fast channel for small restaurants) takes orders on Sundays and public holidays for next-working-day delivery. In Greater Helsinki, an order placed before 23:00 gets next-day delivery. Elsewhere, cut-off is 15:00 or 16:00 the day before. [SOURCED: https://www.kespro.com/en/services/restaurant-wholesale: orders placed Sundays and holidays for next working day; before 11 pm in Greater Helsinki; 3 or 4 pm elsewhere] H, Kespro. It targets restaurants, not banquets.
- C7. Terminal-model products are "delivered from supplier's warehouses" (the mock's description) and have earlier cut-offs than Stock products. In the mock, cut-offs for Terminal items were 10-12 Nov while Stock items closed on 13 and 15 Nov. [SOURCED: GROUND_TRUTH section 3, API]. So the data model already tells an agent that dairy or other items from a manufacturer need earlier ordering, and it implies a longer effective lead time per product. H, mock only.
- C8. US: Sysco special orders and non-stock items are handled through the account rep or customer care. Sysco's own supplier-compliance page defines its service level as fulfilling a purchase order "without substitutions". [SOURCED: https://www.spscommerce.com/community/articles/sysco-shipping-compliance: service level = PO filled without substitutions; supplier-side rule, not a customer policy] M, Sysco. Special-order pickup is described in a school catalogue as phoned in by the order deadline, no lead time in days. [SOURCED: https://issuu.com/syscokc/docs/school_resource_guide: special request by order deadline] L, 2024-25 school programme only.
- C9. A UK concessionaires resource says members should consult their Sysco contact to arrange delivery for an upcoming event, and that Sysco often consolidates deliveries by location, not in order of order receipt. [SOURCED: https://nica.source1purchasing.com/concessionaire-best-practices/: consult Sysco contact before event; consolidation by location] L-M, event venues, US. A second-hand source.
- C10. Standard industry practice for banquet volumes is to give the account rep notice (typically days to weeks) so that stock can be bought in or allocated. [ASSERTED: general foodservice distribution knowledge] L.

### Q2. Does head count, menu or event context reach the wholesaler?

- C11. In the standard Valio Aimo webshop flow the wholesaler receives lines (product, quantity, delivery date). No public page describes any field for head count, event type, menu or dietary requirements on an order. [SOURCED by absence; basis: toimitustukku page descriptions, delivery-wholesale.md, innovative-tools page] M.
- C12. The only public pathway by which menu-like context reaches Valio Aimo is My Recipes: the hotel's recipe, with ingredient quantities, is built in the portal and ingredient lines can be added directly to the cart. That passes recipe ingredients, not head counts, to the cart. Whether Valio Aimo retains the recipe or the number of portions behind a cart is not stated. [SOURCED: https://www.valioaimo.fi/en/company/why-choose-valio-aimo-as-a-partner/innovative-tools-for-everyday-work/: My Recipes shares recipes, calculates margins, adds recipe ingredients to the cart] M-H that the function exists; L on what is retained. NEW: GROUND_TRUTH does not mention My Recipes.
- C13. My Aimo says it shows "net prices and discount levels by product group", gives purchase reports with carbon footprint, and routes messages to the "Aimo expert best suited". [SOURCED: https://www.valioaimo.fi/en/become-a-customer/my-aimo.md] H. The page names no dedicated sales rep feature, only "Aimo experts" by message. Access is limited to webshop users.
- C14. Kespro, per GROUND_TRUTH, is described as having sales contacts. Its public pages link "special orders", "events and catering" and "integrations" topics in the "See also" list but the fetcher could not follow them. [SOURCED: https://www.kespro.com/en/services/restaurant-wholesale: see-also list names sales reps, special orders, events and catering, integrations; contents not retrieved] M that the pages exist; nothing on content.
- C15. Event context reaches the wholesaler by voice or email through the rep or customer service, not in a structured field. [INFERRED: absence of any structured event field in public descriptions] L-M.

### Q3. Recipe and menu tools that convert menus into orders

- C16. Valio Aimo My Recipes (see C12) is the one Finnish example found: recipe in, ingredient lines to cart, margin calculated. [SOURCED: innovative-tools page] M-H.
- C17. Brakes (a Sysco company, UK) navigation lists a "Party calculator", "Recipes" and "My Orders" on its hotel meetings, events and banqueting page. The page text does not say what the calculator does. [SOURCED: https://www.brake.co.uk/why-brakes/hotels/meetings-events-banqueting: nav lists Party calculator; function not described] L-M. A "party calculator" presumably scales quantities per head, but that is [INFERRED: name only].
- C18. Kespro: no recipe-to-cart tool found in this research. A Kespro product-development kitchen (Foodster) exists, but is inspiration, not ordering. [SOURCED: https://www.kespro.com/sv/ideer-och-inspiration/artiklar/kespro-foodsteri-antaa-lisamaustetta-ravintolan-toimintaan: title only] L.
- C19. Kitchen systems: Jamix is described by its company profile as covering "professional kitchen orders and inventory management". [SOURCED: https://www.asiakastieto.fi/yritykset/fi/jamix-oy/08341993/yleiskuva] M. GROUND_TRUTH already records Jamix's claim of integration with suppliers for electronic orders. I could not find which wholesalers it integrates with, or whether Valio Aimo is among them. The search I ran for Aromi found that Aromi is also a trade magazine (published by Avec Media), so "Aromi" can be ambiguous. Keep CGI Aromi from GROUND_TRUTH, but any claim about Aromi-wholesaler links is unverified. L.
- C20. In large hotels the menu-to-quantity step typically happens in the hotel's own kitchen or F&B system (recipe costing, production sheets) and only the resulting purchase quantities leave the hotel. [ASSERTED: industry practice; agents A and B cover this] L.

### Q4. How order lines arrive, formats, units, what the wholesaler checks

- C21. Valio Aimo channels: webshop (mobile-capable), file import, order templates (including centrally managed ones), standard recurring orders, favourites, phone and email to Sales Service. [SOURCED: GROUND_TRUTH section 5, citing the Valio Aimo FAQ] H. Not re-verified directly this session.
- C22. VALO Tilauspalvelu is a separate ordering service for orders from Atria, Froneri, HKFoods, Saarioinen, Snellman Pro and Valio. Contract customers can pay by invoice or card, non-contract customers by card. Orders can be edited until the sales deadline. Order history, templates and a calendar exist. Lead times and minimums are not published. [SOURCED: https://www.valioaimo.fi/en/become-a-customer/valo-tilauspalvelu-en/: delivered directly from top suppliers; edits until sales deadline; lead time and minimum not stated] H. Relevant to Q9.
- C23. Valio Aimo's webshop was rebuilt with SAP ERP integration (Vincit case study). So orders land in SAP behind the webshop. [SOURCED: https://vincit.com/our-work/valio-aimo: integrations and SAP ERP integration] M-H, an agency's description of a project.
- C24. No public EDI, API or Peppol ordering channel exists for Valio Aimo customers. [SOURCED by absence; consistent with GROUND_TRUTH section 5] M. For Kespro, no public EDI or API either; its digital services list is Kespronet, a "Deliveries" (Toimitukset) service, a reports service and user-rights maintenance. [SOURCED: https://kespro.com/en/services/digital-services] M-H.
- C25. Kespro's Deliveries service collects a site's orders and order confirmations regardless of ordering channel. [SOURCED: https://www.kespro.com/sv/ideer-och-inspiration/artiklar/kespron-uusi-toimitukset-palvelu-sujuvoittaa-arkea: tilaukset tab shows all orders and confirmations whatever the channel (via search summary)] M. So Kespro has more than one channel behind a single order-status view. It implies some machine ordering exists, but that is [INFERRED].
- C26. Sales unit versus base unit: per GROUND_TRUTH the product data has sales unit, base unit, pack hierarchy and `allowedLotSize`, and the API's `salesUnit` is authoritative. I found no wholesaler page that explains how a hotel's "litres" are turned into sales units. In normal practice the hotel's purchaser does the conversion and orders in cases. [INFERRED: absence plus GROUND_TRUTH 4.4] M.
- C27. Wholesaler checks, as far as public evidence shows: product is in assortment and not sales-blocked, price (customer-specific if any), stock or terminal availability on a delivery date, per-product closing time, customer account validity. Credit-limit checks are not documented anywhere I found. [SOURCED for availability, closing time, salesBlock, price: GROUND_TRUTH section 3; INFERRED for credit and assortment checks] M for the first set, L for the second.
- C28. US/hotel e-procurement: BirchStreet integrates with Sysco through a punchout profile (the hotel enters the Sysco login and account number, and picks the operating company). Orders are routed for approval inside BirchStreet. BirchStreet's interfaces are cXML-based, per one integrator. A US Foods EDI interface covers a quotation feed, order transmission with confirmation, and invoices. [SOURCED: https://www07.birchstreetsystems.com/v7_documents/Punchout_Tutorial_-_Sysco_Market.pdf and https://www07.birchstreetsystems.com/phase2/Level I Training Guide - FINAL-Revision 3.pdf (2003-era guide, steps may be dated); https://help.hotschedules.com/hc/en-us/articles/360042722891 returned 403 and was only seen in search summary] M for the punchout concept, L for current details. The EDI 850/855/856 claim in the task prompt is not confirmed for BirchStreet in my sources. [ASSERTED: 850 = PO, 855 = PO acknowledgement, 856 = ship notice, EDIFACT ORDERS/ORDRSP/DESADV equivalents; general knowledge] H as a definition, unverified for any named distributor here.

### Q5. What the hotel hands over vs what the wholesaler infers

- C29. Hotel hands over: customer identity, ship-to site, product lines with quantity in sales units, delivery date. Wholesaler infers (or reads from master data): price (contract or list), whether the line is deliverable, which warehouse or terminal route, temperature class, cut-off. [INFERRED: C11, C21, C27, GROUND_TRUTH section 3] M.
- C30. The wholesaler does not see the hotel's guest count, menu, dietary mix, or whether a quantity is a one-off peak, unless told by a person. It also cannot tell whether a hotel wants a substitute if the item is short unless a preference is stored on the account or order. [INFERRED: C11, C15; substitution preference storage is not documented] L-M.
- C31. Customer-specific prices exist in production (My Aimo net prices; GROUND_TRUTH 5). The mock returns `netPriceFound` true on 16 of 1,000 products only. So the "contract price vs list price" distinction is part of the real model and appears in the mock in a thin form. [SOURCED: GROUND_TRUTH] H.

### Q6. Interpretation and fulfilment

- C32. Availability check: Stock items have real quantities; Terminal items return "unknown" (999999) because stock is at suppliers. [SOURCED: GROUND_TRUTH section 3] H, mock. This implies a real wholesaler promises Terminal items on supplier confirmation, not on its own stock. [INFERRED] L-M.
- C33. Substitution, Valio Aimo: webshop suggests substitutes and the customer decides; what happens at picking is unpublished. [SOURCED: GROUND_TRUTH section 5] M-H.
- C34. Substitution, Kespro: "If items are missing, the warehouse calls ahead so you can choose substitutes." A dedicated hotline exists for Restaurant Wholesale. [SOURCED: https://www.kespro.com/en/services/restaurant-wholesale: warehouse calls ahead on missing items; customer chooses] H, Kespro Restaurant Wholesale only (small-order channel, not necessarily banquet orders). NEW: shows a human-in-the-loop substitution call pre-delivery is a real market practice in Finland.
- C35. Bidfood UK public-sector contract text: if a product is unavailable at ordering, telesales states expected availability and offers an alternative. [SOURCED: https://wuth.nhs.uk/media/13386/mtd-implementation-pack-final-051119.pdf: telesales gives availability date and offers alternative; NHS contract context, via search summary] L-M, one contract.
- C36. Sysco, US: customer care handles adding substitutes and availability questions; Sysco's service-level metric counts substituted lines as failures. [SOURCED: https://una.com/wp-content/uploads/2024/06/Sysco-Contact-Information.pdf: customer care covers substitutes and availability (via search summary); plus C8] L-M.
- C37. Allocation of scarce stock between customers, partial and split deliveries, backorder policy, order confirmation format, delivery note content, returns and credit handling: not found in any public source for Valio Aimo or Kespro. [SOURCED by absence] The Valio Aimo recall page (valioaimo.fi/tietopankki/communications-regarding-recalls) exists but I did not fetch it. Everything beyond this point on those topics is [ASSERTED]: wholesalers typically confirm orders electronically with changed lines marked, ship partials with a short-supply notice, issue credit notes for shorts and damaged goods against a claim made within a short window, and allocate scarce lines to contracted or earlier customers. Confidence L, general industry practice.
- C38. Kespro offers paid delivery variants: pre-sorted trolleys per internal customer, a tailored delivery time window, and unloading and shelving by the driver. [SOURCED: https://www.kespro.com/ideat-ja-inspiraatiot/artikkelit/toimituspalvelut-kespro-logistiikkapalvelu] M-H, Kespro. NEW: delivery constraints beyond date (time window, route, unloading) exist as service options and are relevant to the "delivery constraints" criterion.
- C39. Valio Aimo ships from Espoo and Kuopio with its own and partner vehicles at the correct temperature, nationwide, on agreed days. [SOURCED: delivery-wholesale.md and GROUND_TRUTH 5] H.

### Q7. Commercial relationship

- C40. Valio Aimo requires a customership; it is free; consumers cannot obtain one. Customers can choose delivery wholesale, cash and carry, or both. Contract customers get access to the nationwide logistics network. [SOURCED: https://www.valioaimo.fi/en/become-a-customer/ via search summary and GROUND_TRUTH 5] M-H.
- C41. Net-priced products and discount levels by product group are visible in My Aimo. [SOURCED: my-aimo.md] H. So pricing is contract-based per customer at product-group level, rather than negotiated per order. Chain-level framework agreements, who signs them, and whether satellite sites inherit them are not public. The FAQ mentions linked accounts for multi-site users and a main user who controls central templates (GROUND_TRUTH 5), which is the technical footprint of a chain or multi-site structure. [INFERRED] M.
- C42. Who at the hotel is the counterparty (purchaser, head chef, F&B manager, group procurement) and credit-limit practice on the wholesaler side: not public. [OPEN] In US hotel groups the group procurement system (BirchStreet, Fourth, etc.) holds approval rules and the distributor sees only the approved PO. [ASSERTED: industry practice, consistent with C28] L.

### Q8. Hotel buyer worries as seen by the wholesaler

- C43. The wholesaler-side evidence found is limited to what the wholesalers themselves advertise: Kespro's "100% solution reliability" and pre-delivery substitution call, Valio Aimo's delivery reliability testimonial from a Lapland customer, and brand-survey scores (GROUND_TRUTH 5). They suggest the buyer pains are missing items and delivery reliability. [SOURCED: Kespro restaurant wholesale page; GROUND_TRUTH 5; Valio Aimo site via search summary] M for the pain being delivery reliability, L for anything more specific.
- C44. The specific pains named in the brief (late orders, holiday shortages, wrong pack size) are not documented in any public wholesaler material I found. [OPEN] They are plausible and consistent with C5 (holiday adds a day), C26 (unit conversion done by the buyer) and the mock's pack-size sentinels. [INFERRED] L.
- C45. Atria Kokkibarometri data in GROUND_TRUTH (labour shortage, cost pressure) concern chefs, not hotel banquet buyers, so they do not answer this question directly.

### Q9. Anything that contradicts the brief's framing

- C46. 1,000 L of lactose-free milk: by the public descriptions it is most plausibly a webshop order with a future delivery date, subject to stock. Nothing in public material says it would be treated differently by size. But in the mock no single product can cover 1,000 L from real stock (GROUND_TRUTH 4.3), which fits a real situation where a volume like this needs the rep to arrange extra supply or split across products. [INFERRED: C1, C2, GROUND_TRUTH 4.3] L-M.
- C47. Valio Aimo's direct-from-manufacturer sales ("direct sales", and VALO Tilauspalvelu) are a separate sales channel in which products ship directly from suppliers, including from Valio itself. So a large dairy volume could legitimately be routed through VALO / direct sales instead of delivery wholesale. [SOURCED: https://www.valioaimo.fi/en/become-a-customer/valo-tilauspalvelu-en/: delivered directly from Finland's top suppliers; no minimums stated] M. The mock exposes Terminal logistics for such products. The brief's single "interface" therefore hides a channel choice that the wholesaler makes behind the scenes (Stock vs Terminal vs direct).
- C48. The brief frames the buyer's agent as asking for "1,000 litres by Monday". Wholesalers sell in sales units (cases of, say, 12x1 L or 6x1 L), so a request in litres must be converted and rounded up to whole units, which may overshoot (e.g. 1,008 L). [INFERRED: GROUND_TRUTH 4.4 plus C26] M. The brief's "good-better-best substitution within Valio Aimo's assortment" matches Kespro's practice of offering a replacement but note the choice belongs to the customer (C33, C34).
- C49. The brief treats event orders as a request-response purchase. Public evidence suggests event orders are often built early, adjusted by the buyer and rep several times, and bound to a delivery date, i.e. a longer-lived object than one call (C1, C5). [INFERRED] L-M.
- C50. Valio's separate dairy-ingredients online trading platform (launched 2019 via the Nui marketplace) targets industrial buyers, not hotels, and is not the route for hotel orders. [SOURCED: https://www.dairyreporter.com/Article/2019/10/10/Valio-launches-online-trading-platform/ via search summary; https://valio.com/articles/valio-e-commerce-platform-tool-for-successful-buying-path-of-dairy-ingredients] M, and may be retired. Relevant only to rule out "direct from Valio" as a hotel channel other than VALO.

---

## 2. Draft journey stages, wholesaler side

Each stage is marked [INFERRED] unless it cites a claim above. Timing is typical and unverified unless cited.

| # | Stage | Actor | Artefact in | Decision | Artefact out | Tools | Timing |
|---|---|---|---|---|---|---|---|
| 1 | Event first signalled (optional) | Hotel purchaser to rep or customer service | Phone/email: "event on date X, about N guests, products Y" | Rep decides whether to pre-check supply and book extra stock | Informal heads-up, no system record | Phone, email, Ask Aimo message (C13) | Days to weeks before; no published rule (C2) |
| 2 | Menu to quantities | Hotel kitchen / purchaser | Menu, head count, recipes | Convert menu to product quantities and pack units | Shopping list, optionally in My Recipes cart (C12) | Kitchen system, My Recipes, spreadsheet | Hotel side; before order |
| 3 | Order lines placed | Hotel purchaser or system | Lines: product, quantity in sales units, delivery date | Which channel (webshop, import, template, VALO, phone) | Cart or order in wholesaler ERP | Webshop, file import, templates (C21), SAP behind (C23) | Any time up to closing time per product (C27) |
| 4 | Validation | Wholesaler system | Order lines | Product in assortment, not blocked, price (contract/list), availability for date, closing time not passed, account OK | Accepted lines with price and availability, or rejected lines | Availability, price services (GROUND_TRUTH 3) | Seconds |
| 5 | Confirmation and edit window | Wholesaler to hotel | Confirmed order | Hotel may edit until picking starts or the sales deadline (C1, C22) | Order confirmation | Webshop, email, Kespro Deliveries equivalent (C25) | Until cut-off |
| 6 | Shortage handling | Wholesaler (warehouse or rep) with hotel | Shortfall found on a line | Offer a substitute and the customer chooses (Valio Aimo webshop, Kespro call-ahead: C33, C34); or partial delivery or backorder [ASSERTED] | Changed order or short notice | Phone, webshop | Between cut-off and picking |
| 7 | Picking and delivery | Warehouse, driver | Picking list, route | Delivery slot, temperature routing, optional unloading or sorted trolleys (C38) | Delivery note, goods at kitchen door | Own and partner vehicles (C39) | 24 h typical on agreed day (C4) |
| 8 | Goods receipt | Hotel receiving staff | Delivery note, goods | Accept, reject, record shortage | Receiving record; claim | Hotel's own process | At delivery |
| 9 | Credit and invoice | Wholesaler | Claim, delivery data | Credit short or damaged lines [ASSERTED] | Credit note, invoice | ERP; invoice channel not documented | After delivery |

---

## 3. What a wholesaler-side agent interface needs from a hotel's agent

All of this is [INFERRED] from the claims above, not from any Valio Aimo requirement.

1. Identity and authority: which customer account and ship-to site, and on whose behalf the agent acts (C29, C42).
2. Delivery target: date, and ideally a latest acceptable date, an acceptable time window, and unloading needs (C38).
3. Quantities in sales units, with the buyer's original intent kept alongside (for example "1,000 L" as stated, 84 cases of 12 L as ordered), so that rounding can be explained and checked (C26, C48).
4. Substitution preference per line or per order: none, same-brand pack-size change only, any equivalent in the assortment, or ask first. Public wholesalers today let the customer decide manually, so a machine-readable preference is the missing field (C33, C34, C36).
5. Hard constraints versus preferences: allergens, lactose-free, certificates, origin, temperature class (data in GROUND_TRUTH 4).
6. Event context, optional: event date, head count, event type, so that the wholesaler or rep can pre-allocate stock for peaks (C11, C15). No public equivalent exists, so any such field is a proposal.
7. Partial acceptance rules: accept partial delivery, accept split across dates or warehouses, or all-or-nothing.
8. Authority limit and approval state: whether the order is within the agent's mandate or awaiting human sign-off, with an approver reference for the audit trail (brief criterion: autonomy and controls).
9. Idempotency and change handling: order reference so that edits before cut-off update rather than duplicate (C1, C22).
10. On the wholesaler's return: per-line availability with a "known / unknown quantity" flag (999999 and the 9,999,999,999 sentinel are unknown), per-line closing time, price with contract-price flag, substitution candidates ranked, delivery date, reason codes for any change.

---

## 4. Questions only Valio Aimo could answer

1. Is there a size or product-type threshold at which an order is expected to go through a sales rep or pre-order rather than the webshop? What lead time do they ask for around December and other peak seasons?
2. Do they hold stock reservations, forecasts or "event notes" against a customer, and does the webshop have any field for event, head count or purpose?
3. What happens at picking when a line is short: does the warehouse call, does the system auto-substitute, is there a stored substitution preference per customer?
4. How is scarce stock allocated between customers (contract, date of order, size)? Is a large order partially filled or held in full?
5. How do Terminal (supplier-delivered) items get confirmed, and when does their closing time apply versus Stock? Which items go through VALO / direct sales and what are their lead times and minimums?
6. Is there any EDI, Peppol, Jamix or Aromi order integration in production? Which hotel chains use it?
7. Chain framework agreements: who signs, are sites bound to a contract assortment, and how are credit limits and approvals handled per site?
8. Order confirmation, delivery note, credit note and return formats and time windows for claims.
9. What does My Recipes retain about portions and head counts, and is it used by hotels?
10. What are the top reasons for hotel customer-service contacts around events and holidays (the brief's late orders, shortages, wrong pack size)?

---

## 5. Where the evidence is thin

- The most important wholesaler-side facts (Q1 special-order and event rules, Q6 allocation, partial delivery and credit handling, Q7 chain agreements, Q8 buyer worries) have no public source. They are [INFERRED] or [ASSERTED] and should not be presented as fact in the pitch.
- The Valio Aimo FAQ (toimitustukku.valioaimo.fi) and the Valio Aimo terms of delivery could not be read directly: the FAQ is client-rendered and returned a single word, and the general-terms page I fetched covers only the information websites, not sales terms. GROUND_TRUTH section 5's summary of the FAQ was used as given. No "toimitusehdot" for the webshop were found.
- Kespro's special-orders, events and catering, sales-rep and integration pages were not reachable by the fetcher; only the "See also" titles were visible.
- Meira Nova, Metro-tukku, Heinon Tukku history, Bidfood Finland and Chefs' Warehouse were not researched in depth, so the Finnish competitor comparison rests on Kespro alone. Sysco, US Foods, Bidfood UK and Brakes content comes from search summaries and one or two documents each, some dated (the BirchStreet-Sysco guide appears to be from about 2003).
- US Foods EDI (HotSchedules page) and the Sysco contact sheet and shipping-compliance page were seen only through search-result summaries; the HotSchedules page returned 403 on fetch.
- No hotel-specific Finnish wholesaler case (for example a Scandic or Original Sokos Hotels banquet order through Valio Aimo or Kespro) was found.
- Everything labelled [ASSERTED] is general industry knowledge and was not verified in this research.
