# A. Hotel banqueting operations, international practice

Research agent A, 14 Nov 2026. Sources are overwhelmingly US/UK/Irish/Australian. No Nordic or Finnish hotel source was used except Jamix (Finnish vendor). Evidence quality is mixed: hotel T&C pages and vendor docs are primary; the rest is job ads, SOP template sites, course notes and vendor blogs. "(snippet)" = I saw only the search-result summary, not the full page. "(fetched)" = I opened the page.

Tags: [SOURCED] / [INFERRED] / [ASSERTED]. Confidence H/M/L. Scope in brackets.

## 1. Claims by question

### Q1 Trigger and timeline
- A1. An event enters through the hotel's sales/catering office. Lead goes in the sales & catering system as inquiry, then tentative (held), then definite once deposit and/or signed contract arrives. [SOURCED: https://clubessential.atlassian.net/wiki/x/DIDjm (snippet) — inquiry/tentative/definite statuses; Remington "life of a contract" sheets at portal.remingtonhotels.com/resourcefiles/salesbonusplans/ show tentative held until signed contract then countersigned and turned definite (snippet)] H on the status ladder, M on it being universal. [US, chain-managed]
- A2. The catering/sales manager drafts the BEO with the client, finalises it "a few days before the event", sends it to the client for approval, then distributes it to departments (kitchen, banquet service, front desk, security). [SOURCED: https://hoteltechreport.com/news/banquet-event-order-beo (fetched)] M (vendor blog). [US/global]
- A3. Hotel guidance puts menu selection roughly 2-3 months out and finalisation 2-4 weeks out, depending on hotel policy. [SOURCED: easyweddings.com.au and similar planner pages (snippet)] L-M; consumer-advice pages, not hotel SOPs. [AU/US]
- A4. An Irish hotel wedding guide: menu choices confirmed two weeks before; table plan with dietary notes one week before; guaranteed numbers 72 h before. [SOURCED: https://www.ambersprings.ie/your-final-details-guide.html (fetched) — "confirmed two weeks before the wedding"; "no later than 72 hours before the wedding"] H for that hotel, M as a pattern. [Ireland, independent hotel]
- A5. Ingredients are therefore ordered only after the menu is fixed and mostly after numbers are near-final: the effective ordering window for a big event is the last 1-2 weeks, with perishables ordered inside the last few days. [INFERRED: from A2, A4, A9, A11; no source states "ingredients are ordered N days before"] M-L.
- A6. Hotels sell tastings before contract for weddings; I found no primary source stating tasting timing. [ASSERTED] L.

### Q2 Head counts
- A7. The BEO carries the "expected number of guests" in its top section; kitchen treats the BEO as "source of truth". [SOURCED: hoteltechreport BEO (fetched)] M-H. [US]
- A8. Standard guarantee deadline is 72 hours or 3 business days. Rosen Centre (Orlando): 11:00 am 72 h prior, and if none is given the BEO number becomes the guarantee. Fairmont: noon, 3 working days prior, "may not be reduced". [SOURCED: rosencentre.com 2025-2026 Banquet Menus PDF; issuu.com/fairmontpalliser/docs/catering_menu_2023 (both snippet via search)] H. [US/Canada hotels]. A 3-7 day range and 1-2 weeks for wedding caterers also appears. [SOURCED: search summaries over several hotel/caterer pages (snippet)] M.
- A9. Billing is the greater of guarantee or number served; reductions after the deadline are still charged. [SOURCED: Fairmont (snippet); Amber Springs (fetched): reductions "still charged at the confirmed number"] H. [US/CA/IE]
- A10. Overset: hotels prepare/set above the guarantee. Salamander Hotels: 5% of F&B guarantee; PB Convention Center: 5% up to 30 meals; another guide says 3-5%. [SOURCED: issuu.com/salamanderhotels/docs/holidaycateringmenu2021; pbconventioncenter.com PDFs (snippets)] M-H for 5%; 3% was NOT found in a primary source. [US]
- A11. Attendance/RSVP data comes from the client (wedding couple, planner, corporate organiser), not from the hotel. Hotel takes whatever the client gives; for weddings the table plan carries names and dietary notes (Amber Springs uses a portal, "Moposa"). [SOURCED: Amber Springs (fetched)] M. [IE]
- A12. Dietary/allergy needs arrive from the client alongside the guest list, typically 1-2 weeks before; some venues refuse changes inside 7 days (one university catering office; not a hotel). Advice to re-confirm at least one week out. [SOURCED: Amber Springs (fetched); IU Catering guidelines (snippet)] M for the pattern, L for 7 days as a hotel norm. Real late changes happen; hotel "will do everything reasonably possible". [SOURCED: Amber Springs]
- A13. Guest-count variability is called the biggest financial risk in banquet management by one vendor blog; planners and hotel staff inflate expected counts out of fear of running short. [SOURCED: mydigimenu.com hotel-banquet post; staradvertiser.com on IDEO study (snippets)] L-M (vendor/news). [US/global]

### Q3 Recipes
- A14. Hotel kitchens run recipe/menu/inventory in dedicated systems (Apicbase, Jamix, Galley, Adaco, Fourth etc.) or in spreadsheets/binders; the sources I found are vendor material and do not give adoption rates. [SOURCED: Jamix describes building recipes from purchase products, menus from recipes, auto-calculating ingredient needs from portions; allergen tracking — jamix.com/?p=22634 and search summary (snippet)] M for capability, no evidence for prevalence. [Jamix: Finland/Nordics]
- A15. Apicbase listings: recipe management plus banquet management modules, suggested orders from stock and forecast, PO sync with suppliers/ERP. Explicit per-banquet-event ingredient forecasting was NOT confirmed in any source. [SOURCED: getapp.com, sourceforge.net listings (snippet)] M-L.
- A16. Oracle OPERA Sales & Catering: events, menus and inventory items attach to events and drive the BEO; docs show F&B menu items print in the BEO food/beverage section. No evidence found of a link from OPERA menus to recipes or Materials Control purchasing in the docs I saw. [SOURCED: docs.oracle.com/cd/E98457_01/opera_5_6_core_help/about_events.htm and OPERA Cloud controls docs (snippet)] M. [global PMS]
- A17. Recipe scaling to covers is standard practice; yield-aware ordering (150 g cooked needs ~214 g as purchased at 70% yield) and a buffer are known pitfalls. [SOURCED: ckitchen.com, menusano.com blogs, Oracle JDE recipe-scaling doc (snippets)] M-L (blogs). Maintained by executive/banquet chef and sous chefs. [INFERRED: job ads A27]
- A18. Contract caterers (Sodexo, Compass) matter to a hotel only where F&B is outsourced under a management/lease agreement (operator paid base + incentive fee). F&B is 20-40% of hotel revenue per one law-firm note. [SOURCED: twobirds.com HMA Bites 2023 (snippet)] M. I found NO reliable share of hotels with outsourced F&B. [ASSERTED that it is a minority in Western full-service hotels; no number] L.

### Q4 Turning the event into an order
- A19. Banquet chef role includes "ordering and procurement of all banquet food product" and communicating kitchen needs to purchasing and storeroom; sous chef assists executive chef and purchasing manager with banquet menu planning and food purchasing. [SOURCED: hotel job ads: careerarc.com Shore Lodge banquet CDC; mediabistro Crescent Hotels banquet sous chef (snippets)] M. [US]
- A20. Textbook method for perishables: daily "market list" prepared by the chef after a quick stock take; purchasing officer asks approved suppliers for price then orders. Urgent kitchen orders after office hours are logged retrospectively. [SOURCED: hospitality.institute/bha503 and setupmyhotel.com SOPs (snippets)] L-M (course notes, probably India/UK-influenced). 
- A21. Par logic: "quantity needed is par minus quantity on hand". [SOURCED: Toast/webstaurant-type prep-sheet pages (snippet)] M for the formula; these are restaurant sources. 
- A22. The pipeline "scale recipes -> subtract stock -> round to pack sizes -> order lines" is how the brief implies it works; sources support scaling, par, yield, but none documents hotel banquet rounding to pack sizes explicitly. [INFERRED: A17, A21] M-L.
- A23. Event orders merge with the daily order: banquet product ordered by chef/purchasing alongside outlet needs, with multiple cost centres sharing one receiving dock so receipts carry a cost-centre code; premium proteins for banquets are quoted per event rather than standing contract. [SOURCED: supy.io hotel F&B blog (snippet, vendor)] L-M.

### Q5 What the hotel hands the wholesaler
- A24. For US broadline distributors, electronic channels are punch-out from e-procurement (BirchStreet/Sysco Market, Hyatt punch-out guidelines) and EDI (Sysco/US Foods via Adaco: quotation feed, order transmission, acknowledgement, invoice). Vendors say a supplier on punch-out typically will not also run EDI ordering. [SOURCED: birchstreetsystems.com Sysco punch-out tutorial PDF; help.hotschedules.com Adaco US Foods EDI (snippets); help.craftable.com vendor integrations (snippet)] M-H. [US]
- A25. Under Sysco EDI, items Sysco does not supply are flagged so the buyer can contact the operating company for a substitute. [SOURCED: HotSchedules Adaco Sysco EDI page (search snippet; the page itself returned 403 to me)] M-L.
- A26. Jamix can export a PO as file/email attachment for suppliers without electronic ordering; direct integrations are claimed but no wholesaler named. [SOURCED: jamix.com/?p=20091 (snippet)] M-L. Ground truth section 6 already notes Jamix "integrated with your suppliers". [Finland-relevant]
- A27. Nothing I found says hotels pass event context (event name, date, headcount) to a broadline distributor; order payload in EDI/punch-out is PO lines. [INFERRED: from A24 schema descriptions; absence of evidence] M-L.
- A28. Lead times for unusual items/special orders and per-wholesaler cut-offs: NOT found in any source. [thin]

### Q6 Wholesaler interpretation (light)
- A29. Substitution under US EDI is flagged and handled by contact with the supplier (A25). Contract prices exist via negotiated catalogs in punch-out (PairSoft piece on supplier-maintained catalogs with negotiated pricing). [SOURCED: pairsoft.com/eprocurement-for-the-hospitality-industry (snippet)] M-L. Nothing found on split deliveries.

### Q7 Roles and approvals
- A30. Roles seen in job ads/SOPs: executive chef (food cost goals, par levels, review of ordering practice), banquet chef/sous chef (orders banquet product), purchasing manager (suppliers, POs), storeroom/receiving (issues against signed requisitions), catering manager (BEO). [SOURCED: oysterlink, career.com, hhmhotels, setupmyhotel.com postings and SOPs (snippets)] M. [US/generic SOPs]
- A31. Requisitions need a signature from outlet manager/chef/catering manager; storeroom checks authorisation before issuing. [SOURCED: setupmyhotel.com store requisition SOPs (snippet)] L-M (template SOPs).
- A32. Chain vs property: group purchasing and chain catalogs give negotiated pricing; I found no source on how brands split central contracts vs property ordering for food. [SOURCED: omniapartners.com GPO blog (snippet)] for GPOs; split itself [thin].
- A33. Job ads state cost goals but give no spend-approval thresholds or food-cost % targets. [SOURCED: search of executive chef job ads (snippets)] H that thresholds are absent in public ads. No benchmark for banquet food cost % found; (common industry figure ~30% is [ASSERTED] and not verified).

### Q8 Inside the manager's head
- A34. Worries evidenced: headcount fluctuation, inflated counts causing over-production, buffets wasting more than plated, waste cited at 5-15% of food purchased by a vendor and 8% of food cost by an opinion piece. [SOURCED: foodsight / hospitalitynet "Buffet Paradox" / lodgingmagazine (snippets)] L (vendor-driven numbers).
- A35. Allergen risk: I found no hard data; a news story of a vegetarian served chicken at a wedding shows hand-off failures. [SOURCED: search summary (snippet)] L. Within the EU the serving operator owes allergen information (ground truth section 6). 
- A36. Shortage of a key item days before, storage limits, delivery slot limits: no source found; these are plausible failure modes. [INFERRED: from receiving-dock-shared-by-cost-centres A23 and ordering window A5] L.

### Q9 Contradictions with the brief
- A37. "1,000 litres of lactose-free milk for one event" is implausible as a single-event, single-item need. Working arithmetic (mine, not sourced): a seated 1,000-guest event with coffee at 2 x 6 oz cups per guest is ~2,000 cups (~360 L of liquid for coffee, of which milk is a fraction); sources give no milk-per-cup figure. Lactose-free milk would be a small subset of any dairy need. [INFERRED: coffee per-guest guideline from flashquotes.com coffee calculator (snippet) + my arithmetic] M that 1,000 L lactose-free is far above one event; L on the exact figure. The brief's number reads as a stress-test example, or a multi-site/multi-day aggregate (chain-level), or a typo-scale.
- A38. Realistic large-event order shape: many different lines (proteins, veg, dairy, bakery, beverages), small quantities each, plus a few special/unusual items; dietary variants (lactose-free, gluten-free, vegan) as small counts. [INFERRED: from BEO structure A2, A12, A15] M-L.
- A39. Hotels often buy from several suppliers (broadliner, dairy, meat, produce specialists), so a wholesaler sees only part of the event. [INFERRED: A20 "two or more approved suppliers", A23] M-L.
- A40. The brief's framing that an AI agent at a hotel chain asks a wholesaler in natural language assumes a buyer with authority; in practice orders flow from chef -> purchasing; an agent would sit at the chef/purchasing step, and likely at property level for perishables. [INFERRED: A19-A21, A30] M.

## 2. Draft journey stages (international, banqueting lens)

| # | Stage | Actor | Artefact in | Decision | Artefact out | Tools | Timing |
|---|---|---|---|---|---|---|---|
| 1 | Inquiry and hold | Sales/catering manager | Client request (date, size, budget) | Room/date availability, rough price | Tentative booking, proposal | Sales & catering system (OPERA S&C, Delphi, Tripleseat), email | Months out (A1) |
| 2 | Contract and deposit | Sales manager + client | Proposal | Package, menu, guarantee terms | Signed contract, definite status | S&C system | Months to weeks (A1, A3) |
| 3 | Menu design / tasting | Catering mgr + exec/banquet chef + client | Menu options, dietary info | Final dishes, price per head | Draft BEO | Recipe system, spreadsheets | ~2-3 months to 2 weeks (A3, A4) |
| 4 | Details and rough numbers | Client -> catering mgr | Guest list, table plan, dietary notes | Expected count, dietary split | Updated BEO | Portal/email | ~2 weeks to 1 week (A4) |
| 5 | Final guarantee | Client -> catering mgr | Final number | Guarantee fixed, overset % applied | Final BEO (guarantee + overset) | Email, BEO | 72 h / 3 working days (A8-A10) |
| 6 | Kitchen requirements | Banquet/exec chef | BEO packet | Scale recipes, check stock, what to buy | Requirements list / market list | Recipe system or spreadsheet | After menu lock, mostly last days (A5, A17-A22) |
| 7 | Purchasing | Purchasing mgr or chef | Requirements, par levels | Which supplier, which pack, urgent vs standard | PO lines / punch-out cart / phone order | Punch-out, EDI, webshop, phone (A24-A26) | Days before; perishables nearest the event |
| 8 | Delivery and receiving | Storeroom/receiving | PO, delivery note | Accept/reject, substitution acceptance | Goods receipt, stock update | Receiving, inventory system | Day(s) before |
| 9 | Late changes | Client, chef | Number/allergy change | Absorb from overset, rush order, substitute | Revised BEO, urgent order | Phone/email | Up to event day (A12, A20) |
| 10 | Service and reconciliation | Banquet team | BEO | Actual covers billed | Final account, waste, COGS | POS, inventory | Event + month end |

## 3. Decision-maker's mental checklist
1. Is the date/room confirmed and is the BEO final, or still moving?
2. Expected vs guaranteed count: what is the overset, and how much would a late rise cost me?
3. Dietary and allergy split: confirmed by name, or just a rough number? Who verified allergens on each product?
4. Do I have the recipes scaled and yield-adjusted for this count?
5. What is already in stock or on par, and what must I buy new?
6. Which items are special/unusual and need a longer lead time or per-event quote?
7. Which supplier carries each line, what is the cut-off, and what delivery slot can my dock take?
8. Is the price within the event's food-cost budget?
9. If a key item is short, what is my approved substitute, and who tells the client?
10. Do I need sign-off (purchasing manager, F&B director) before ordering?
11. Waste: am I padding because I fear shortage?
(Items 1-5, 8, 11 are supported by sources above; 6, 7, 9, 10 are [INFERRED].)

## 4. Questions only a hotel or Valio Aimo could answer
- Hotel: Who exactly clicks "order" for an event, the chef, purchasing, or the storeroom? Is there a separate event purchase order or are event lines merged with the daily order?
- Hotel: How many days before an event are perishables ordered, and which items are pre-ordered earlier?
- Hotel: Does the order to the wholesaler carry any event context? Would you want it to?
- Hotel: Typical guarantee deadline and overset in Finnish hotels (is 72 h the norm or shorter)?
- Hotel: Which items arrive as special orders and what lead time do you accept?
- Hotel: Approval thresholds in EUR for a chef vs purchasing vs F&B director?
- Hotel: Do you use Jamix/Aromi or similar, and does it order directly from Valio Aimo?
- Hotel: What realistic single-event volume of dairy and lactose-free product do you buy?
- Valio Aimo: What share of hotel events arrive as special/pre-orders vs normal webshop orders? Are there event-specific quantity or lead-time rules? How are substitutions on event orders communicated?
- Valio Aimo: Is a 1,000 L order of one lactose-free line seen in practice (chain, multi-site, festival)?

## 5. Where my evidence is thin
- No Finnish or Nordic hotel source at all; everything is US/UK/IE/AU. Finland is agent B's job.
- No primary source on how ingredients are ordered relative to the event date, on cut-offs, pre-order lead times, split deliveries or substitution handling by hotels.
- No data on outsourced F&B prevalence.
- Software documentation (OPERA, Apicbase) shows capabilities, not usage; the OPERA-to-recipe-to-purchasing link is unverified.
- Practitioner voice (r/chefit, r/KitchenConfidential) was not reachable through search; nothing from it is claimed.
- Most search results reached me as summaries; the pages I actually opened were Amber Springs and the hoteltechreport BEO article. The Sysco EDI page returned 403 and the Bird & Bird page returned 402.
- Waste and cost numbers come from vendors with an interest in selling forecasting tools.
- The 3% overset figure and the 30% banquet food cost figure were not found in any source.
