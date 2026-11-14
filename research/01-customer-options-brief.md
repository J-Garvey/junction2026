# Valio Aimo Junction 2026 — Customer options brief

Nov 14, 2026

> The live, editable version of this brief is a Claude Doc. This file is a snapshot.

## What this doc is for

This doc helps us **decide which customer to build for. It does not make the decision.** It lists the candidate customer types, what we actually know about each, what we don't know, and the questions to put to the Valio Aimo team so we can make the call together.

**The question we're answering:** *Which customer would benefit most from ordering that is fast, accurate and almost invisible, and why should Valio Aimo care about serving them first?*

To keep the comparison fair, every candidate is described with the same headings:

- **Who they are**
- **How they order today**
- **Time pain**: how much effort ordering costs them
- **Accuracy stakes**: what goes wrong when an order is wrong
- **What "invisible ordering" would look like**: the experience we'd build
- **Why Valio Aimo might care**: facts about value and strategy
- **Risks / reasons against**
- **Unknowns and questions for Valio Aimo**

## Glossary: Finnish terms and names in plain English

| Term | What it means |
| --- | --- |
| **Valio Aimo** | The wholesale arm of Valio, Finland's big farmer-owned dairy company. It sells food and supplies to professional kitchens. It was formed in 2021–22 when Valio bought the wholesaler Heinon Tukku ("Heino's Wholesale"). |
| **Hanna Forsström, Pirjo Kaartinen** | **People, not terms.** They're the Valio Aimo mentors at Junction for *Marketplace / Commercial*. They're the ones to ask about customers, sales and strategy. |
| **Minni Ruhtinas** | Valio Aimo mentor for *Online Sales* (the webshop). Ask her how customers actually order today. |
| **Tommi Nurmi-Aro, Ville Takanen, Riku Tapper** | Valio Aimo mentors for *IT, integrations and data governance*. Ask them about the API, product data and what can be trusted. |
| **HoReCa / horeca** | Industry shorthand for **Ho**tels, **Re**staurants, **Ca**fés. |
| **Ruokapalvelut** | "Food services": organisations whose job is feeding people in institutions, such as schools, daycare, hospitals, care homes and staff canteens. |
| **Toimitustukku / Pikatukku / Suoramyynti** | Valio Aimo's three sales channels. *Delivery wholesale* means they deliver to you. *Cash & carry* means you go to the warehouse store. *Direct sales* is handled by a salesperson for bigger accounts. |
| **Minun Aimo** | "My Aimo", Valio Aimo's self-service customer portal (invoices, purchase reports, carbon data). |
| **VALO Tilauspalvelu** | "VALO ordering service", a Valio Aimo service that lets kitchens order directly from major suppliers. |
| **Kespro** | The market-leading foodservice wholesaler, owned by Kesko (the K-Group retail chain). Valio Aimo's biggest competitor. |
| **Meira Nova** | Another foodservice wholesaler, owned by SOK, i.e. S Group (the other big retail co-op, which also owns Sokos Hotels). |
| **Metro-tukku** | Metro wholesale, a foodservice wholesaler owned by the Wihuri group. |
| **Hyvinvointialue** | "Wellbeing services county". Since 2023, 21 regional authorities run health and social care in Finland, so hospitals and many elderly-care kitchens sit under them. Many are under heavy pressure to cut deficits. |
| **Synkka** | GS1 Finland's product data service, where manufacturers publish product info (ingredients, allergens, nutrition). Our product file comes from it. |
| **Sydänmerkki** | The "Heart Symbol", a Finnish label for healthier choices. Public and workplace kitchens use it. |
| **Aromi, Jamix** | Kitchen management software used by many Finnish professional kitchens for recipes, menus and purchase orders. |
| **Erityisruokavalio** | "Special diet", e.g. allergy, coeliac or lactose-free. In schools and daycare these are often backed by a doctor's certificate. |

## What we know about Valio Aimo itself

- About **20,000 customers, 20,000 products, 700 suppliers and 350 staff**. Its stated target groups are **horeca, food services and the food industry**. (Valio Aimo sustainability review 2025)
- Customer types named on its website: **restaurants, hotels, cafés, catering services, large kitchens, service stations and kiosks**.
- It's a **challenger**: Kesko says Kespro held about **49%** of the foodservice wholesale peer group in 2025. Competitors listed are Meira Nova, Metro, Valio Aimo and others.
- The whole foodservice wholesale market was estimated at about **€4B** (Kespro, 2021).
- The market is soft. In Nov 2025 foodservice wholesale sales were down **5.5%** year on year (Finnish Grocery Trade Association).
- Valio Aimo already shows customers the **carbon footprint of their purchases** in Minun Aimo (since May 2025). It plans reports on domestic origin, organic and Heart Symbol shares.
- **We do NOT know** how its revenue splits across customer types. That is the single most important fact to get from the Valio Aimo team.

## What the challenge data can and can't support (applies to every candidate)

From our own pass over the product files (17,546 products, 648 vendors, 349 category codes). Details in [03-data-profile.md](03-data-profile.md).

- **Allergen info exists for only 41% of products.** It's recorded only as "contains" or "may contain", never "free from". So a missing allergen doesn't mean safe. This matters more for some candidates than others.
- **Ready-made substitution rules exist for only 189 products (1.1%).** Any "suggest a replacement" feature means building our own matching logic.
- **Delivery reliability scores exist for ~25% of products.** 564 score below 0.95 and 150 below 0.8.
- **Carbon estimates exist for ~63% of products**, but as averages for product groups, not exact per-product figures.
- **Labels are well filled**: about 3,800 products carry Finnish-origin markings, 826 the Heart Symbol and 456 EU organic.
- **The brief's own example works**: there are ~68 lactose-free milk-type products (Valio and Arla).
- We couldn't read the API documentation from our research environment (the site blocks automated access). We still need to check whether prices differ per customer or contract.

## The candidates

**Shortlist: A, B, C and E.** Ruled out by the team:

- **D. Public institutional kitchens**: too much government regulation and too slow to adopt. (Background research is kept in [02-initial-deep-dive.md](02-initial-deep-dive.md).)
- **F. Food industry** and **G. Service stations and kiosks**: low stakes and unlikely to pay.

### A. Independent restaurants and cafés

- **Who they are:** Single-site, owner-run restaurants, lunch places and cafés. Probably the largest number of Valio Aimo's 20,000 accounts (unconfirmed).
- **How they order today:** Likely the chef or owner orders through the webshop or by phone, often late at night after service. (Assumption: ask.)
- **Time pain:** High per person. The person ordering is also cooking and running the business. The order itself is small but repeated several times a week.
- **Accuracy stakes:** Medium. A wrong or missing item means a menu change or a run to the cash & carry. Allergens matter for guests, but responsibility sits with the restaurant.
- **What invisible ordering looks like:** The agent knows the menu and typical weekly usage. It proposes the next order, which the chef approves with one tap, and it suggests swaps when something is out of stock.
- **Why Valio Aimo might care:** Many accounts, and probably better margins per unit than big contract customers (unconfirmed). Loyalty is winnable through convenience. A strong 2025 brand survey suggests customers already trust Valio Aimo (86% called it trustworthy).
- **Risks / reasons against:** The sector is in distress, with 2025 restaurant bankruptcies at record levels. Each account is small. There's little need for approvals or audit trails, so the "guardrails" part of the brief is thin. These customers are unlikely to have their own purchasing agent.
- **Questions for Valio Aimo:** What share of revenue and of accounts? How often and how do they order? What's the most common complaint? Are prices individual or list-based?

### B. Hotel and restaurant chains (multi-site HoReCa)

- **Who they are:** Hotel chains (Scandic, Sokos Hotels, Lapland Hotels, Kamp, Strawberry) and restaurant chains with central purchasing. **This is the brief's own example** ("a hotel chain's agent").
- **How they order today:** Likely a mix: central contracts and price lists, with each hotel kitchen placing its own orders. (Assumption: ask.)
- **Time pain:** Medium to high. Breakfast is steady, but events and banquets cause sudden spikes (the brief's "last-minute event" scenario).
- **Accuracy stakes:** Medium. Running out at breakfast or an event damages the guest experience. Allergen safety matters for guests.
- **What invisible ordering looks like:** Breakfast is automatically replenished from occupancy forecasts. Events trigger a recipe-based order. Each hotel has a spending limit, and head office sees everything.
- **Why Valio Aimo might care:** Clear multi-site volume. Central purchasing makes a chain a natural early adopter of a buyer-side agent. Sustainability matters to the big chains: Scandic lists increasing plant-based food as a 2025 goal.
- **Risks / reasons against:** Some chains may be tied to a rival wholesaler. Sokos Hotels belong to S Group, which also owns the wholesaler Meira Nova. The Finnish hotel market is soft: Scandic called Finland a weak spot in its 2025 results.
- **Questions for Valio Aimo:** Which hotel and restaurant chains are customers today, and how big are they? Do chains negotiate central prices? Who places the orders at each site? How are event orders handled now?

### C. Contract caterers (private food-service companies)

- **Who they are:** Companies that run staff canteens, school and hospital kitchens and similar sites on behalf of employers and public bodies. Examples: Compass Group (Amica), Sodexo, ISS. Compass Group Finland had revenue of about **€278M and 2,525 staff** (fiscal 2025). Compass bought Fazer Food Services, about 1,000 restaurants, half of them in Finland.
- **How they order today:** Probably central purchasing with their own systems and approved product lists. Hundreds of site kitchens order within those lists. (Assumption: ask.)
- **Time pain:** High in total across many sites. Lower for central buyers, who have systems already.
- **Accuracy stakes:** Medium to high. They often serve schools and care homes, so special diets apply. They also face contract penalties from their own clients.
- **What invisible ordering looks like:** The caterer's own system or agent orders from Valio Aimo automatically, within the caterer's approved list and budgets per site.
- **Why Valio Aimo might care:** Large, concentrated volumes. One deal covers many kitchens. Healthy-menu goals create data needs: Compass Group Finland aims for up to 50% of new recipes to meet Heart Symbol criteria.
- **Risks / reasons against:** These are powerful buyers with strong negotiating leverage. They're likely to want to build their **own** platform, which is exactly the "someone else's platform" risk the brief warns about. They may also split business across several wholesalers.
- **Questions for Valio Aimo:** Are any of the big caterers major customers? Do they order via EDI (direct system-to-system ordering)? Would they let an outside agent order for them?

### E. Private care homes (elderly care chains)

- **Who they are:** Private chains running care homes, mostly on contract to wellbeing counties: Attendo (about **430 care and service homes** in Finland), Mehiläinen and Esperi Care.
- **How they order today:** Unknown. Possibly each home orders for itself, possibly through central contracts. (Ask.)
- **Time pain:** High. Ordering is often done by care staff, not trained kitchen buyers, in a sector short of staff.
- **Accuracy stakes:** High. Residents need special and texture-modified diets, and nutrition failures have drawn regulator attention (Yle reported undernourished residents at an Attendo home).
- **What invisible ordering looks like:** Like public kitchens, but without public tender rules. Central rules come from head office, and each home's order is automatic with diet checks built in.
- **Why Valio Aimo might care:** Many sites with steady, all-year demand (care homes serve every meal every day). As private companies they can decide faster than public bodies.
- **Risks / reasons against:** The chains are under price pressure from wellbeing counties and have renegotiated contracts. The sector faces reputational scrutiny. Some homes may get meals from caterers instead of cooking themselves.
- **Questions for Valio Aimo:** Are care-home chains customers today? Do homes cook on site or buy in meals? Who places orders?

## Side-by-side: first-pass evidence (to be scored by the team)

The ratings below summarise the facts above. **"?" means we need Valio Aimo's input.** They are not a verdict. We should agree weights for each column together, then score.

| Candidate | Time saved per customer | Accuracy stakes | Can ordering become near-invisible? | Value to Valio Aimo | Fit to brief's core (lookup, fixed-price order, approvals) | Can we demo it convincingly in a day? |
| --- | --- | --- | --- | --- | --- | --- |
| A. Independent restaurants | High per person, small orders | Medium | Yes, with chef approval | ? (many accounts, revenue share unknown) | Weak on approvals | Yes |
| B. Hotel & restaurant chains | Medium–high, spiky | Medium | Yes | ? (depends on which chains are customers) | Good; it's the brief's example | Yes |
| C. Contract caterers | High across many sites | Medium–high | Partly; they may want their own system | ? (likely large if they're customers) | Good | Medium |
| E. Private care homes | High | High | Yes | ? | Strong | Yes |

### Suggested scoring criteria (agree weights before scoring)

1. **Customer pain**: how much time and stress ordering costs them today.
2. **Accuracy stakes**: how bad a wrong order is (money, safety, reputation).
3. **Value to Valio Aimo**: revenue share, growth, margin, stickiness, strategic threat or opportunity.
4. **Readiness**: do they have systems or people who'd actually use an agent?
5. **Fit to the brief and judges**: does it show off lookup, fixed-price ordering, approvals and audit trail?
6. **Buildable in our time**: does the challenge data support it?

## Questions for the Valio Aimo team (grouped by mentor)

We're choosing between **A. Independent restaurants**, **B. Hotel & restaurant chains**, **C. Contract caterers** and **E. Private care homes**. Each question below includes a short *why we ask*, so whoever is talking to the mentor knows what to listen for.

### 1. The decider: ask this first

Ask **Hanna Forsström or Pirjo Kaartinen** (commercial mentors):

1. **Roughly what share of Valio Aimo's revenue, and of its margin, comes from A, B, C and E?** A ranking is fine if exact numbers are confidential. *Why we ask:* this is the biggest unknown in our comparison. A segment that's large but low-margin, or small but growing fast, changes the answer.
2. **Which of these four would you most want to win or protect over the next 2–3 years, and why?** *Why we ask:* the judges are Valio Aimo, so their own priority carries real weight.
3. **Who would pay for this, and how?** Would Valio Aimo fund it as a service to keep customers, or would customers pay (subscription, per order)? Which of the four would actually pay? *Why we ask:* we dropped F and G partly for unwillingness to pay, so we should test the same thing on the shortlist.

### 2. Strategy and competition (commercial mentors)

4. Which of the four segments are you **losing to competitors** (Kespro, Meira Nova, Metro), and why do they leave?
5. Has any customer in these groups already **asked for automated or AI ordering**, or connected their own system?
6. Which group places the **most orders per euro of revenue**, i.e. is the most expensive to serve today?
7. Are prices for these customers **list prices or individually negotiated contracts**?

### 3. Candidate-specific questions

**A. Independent restaurants**

8. Who orders, when, and how often? (We assume the chef or owner, late at night, several times a week.)
9. What's their most common complaint: missing items, wrong substitutes, delivery times, prices?
10. How many order the same thing every week (standing or repeat orders)?
11. How many independent restaurant customers have you lost in the recent bankruptcy wave? Is this segment shrinking?

**B. Hotel & restaurant chains**

12. Which hotel and restaurant chains are customers today, and roughly how big are they?
13. Do chains negotiate centrally while each hotel or restaurant orders separately?
14. How are **event and banquet orders** handled today, and how often are they last-minute?
15. Are some chains tied to a competitor? (Sokos Hotels belong to S Group, which also owns the wholesaler Meira Nova.)
16. Do chains ask for sustainability or carbon reporting on their purchases?

**C. Contract caterers (Compass/Amica, Sodexo, ISS and others)**

17. Are any of the big caterers significant customers, or mainly other wholesalers' customers?
18. Do they order via **EDI** (direct system-to-system ordering) from their own purchasing systems?
19. Would they let an **outside agent** order on their behalf, or would they insist on building their own?
20. Do they split their spend across several wholesalers? If so, what decides who gets which share?

**E. Private care homes (Attendo, Mehiläinen, Esperi and others)**

21. Are care-home chains customers? Do the homes **cook on site** or buy in ready meals?
22. Who places the orders: kitchen staff or care staff?
23. How do they handle residents' **special and texture-modified diets** when ordering?
24. Is the decision made centrally (head office) or home by home?

### 4. How customers order today: ask Minni Ruhtinas (online sales / webshop)

25. For A, B, C and E: what share orders through the **webshop, mobile, phone, EDI or a salesperson**?
26. Which group makes the **most corrections, complaints or returns**?
27. What takes customers the longest in the webshop today? Searching, comparing, checking availability, or approvals?
28. What happens today when an item is out of stock: who picks the substitute, and how often do customers reject it?

### 5. Data and trust: ask Tommi Nurmi-Aro, Ville Takanen or Riku Tapper (IT and data)

29. Are prices in the mock API the same for everyone, or **contract-specific per customer**?
30. How does the availability API show **partial quantities** and alternative delivery dates?
31. How reliable and up to date is **allergen** data? What does the `nonAllergen` field contain?
32. Which customers already connect **system-to-system** (EDI, or kitchen software like Aromi or Jamix)?
33. What would you need to see before trusting an outside agent to place orders **without a human**?

### 6. What the answers will tell us

- If one segment clearly leads on **revenue or margin (Q1)** and on **Valio Aimo's priority (Q2)**, that's a strong pointer.
- If a segment mostly orders via **EDI** or wants its **own platform (Q18–19)**, an agent built by us adds less, and the "someone else's platform" risk rises.
- If the most **corrections and complaints (Q26)** come from one segment, that's where accuracy saves the most.
- If a segment won't pay **or** Valio Aimo won't fund serving it **(Q3)**, drop it.
- Then fill the "?" cells in the side-by-side table, agree weights and score.

## How we'll make the call

1. Ask the questions above (Commercial first: the revenue split changes everything).
2. Fill in the "?" cells in the side-by-side table.
3. Agree weights for the six criteria as a team.
4. Score each candidate, pick one, and note which candidate is the runner-up "second demo".

## Sources

- [Valio Aimo sustainability review 2025](https://cdn-wp.valio.fi/valio-wp-network/sites/2/2025/06/Valio-Aimo-Vastuullisuuskatsaus-2025.pdf)
- [Valio Aimo: delivery wholesale customer types](https://www.valioaimo.fi/en/become-a-customer/delivery-wholesale.md)
- [Valio Aimo: brand study figures](https://www.valioaimo.fi/en/company/why-choose-valio-aimo-as-a-partner/)
- [Kesko strategy: Kespro market share and competitors](https://www.kesko.fi/en/investor/strategy/division-strategies/grocery-trade-strategy/)
- [Kesko IR blog: foodservice wholesale market ~€4B](https://kesko.fi/en/media/blogs/investor-blogs-and-podcasts/2021/IR_blog_Kespro)
- [Verkkouutiset: foodservice wholesale sales Nov](https://www.verkkouutiset.fi/a/paivittaistavaroiden-vahittaismyynti-kasvoi-marraskuussa-rahtusen/)
- [Kaleva: record restaurant bankruptcies 2025](https://www.kaleva.fi/ravintola-alan-konkurssiaalto-nakyy-myos-oulussa-i/13581090)
- [Scandic Finland presentation](https://eu-assets.contentstack.com/v3/assets/bltfd73aa2de3a5c4e3/blt0278eaa0c061f3d1/69b7acb4fdb66575761a1bd7/Scandic_Finland_presentation.pdf) · [CoStar: Scandic 2025, Finland weak spot](https://www.costar.com/article/584590146/scandic-posts-full-year-2025-improvements-but-finland-remains-a-weak-spot)
- [Kiilto: Meira Nova is a subsidiary of SOK](https://kiilto.com/newsroom/collaborating-for-cleanliness-and-hygiene)
- [Vainu: Compass Group Finland financials](https://search.vainu.com/company/154250/) · [MTV: Compass buys Fazer Food Services](https://www.mtvuutiset.fi/artikkeli/fazer-myy-ruokapalvelunsa-kauppaan-kuuluu-7000-tyontekijaa-ja-tuhat-ravintolaa/7445518) · [Compass Heart Symbol goal](https://www.sttinfo.fi/tiedote/71519733/compass-group-tuo-sydanmerkin-ravintoloihinsa)
- [CGI Aromi](https://www.cgi.com/fi/tuoteratkaisut/aromi) · [Jamix](https://www.jamix.com/restaurant-inventory-management-system/)
- [Attendo: ~430 homes in Finland](https://www.attendo.fi:443/globalassets/documents/ovs/attendo-omavalvontaohjelma_20230421.pdf) · [Yle: care chains renegotiating prices](https://yle.fi/a/74-20062267) · [Yle via Verkkouutiset: Attendo nutrition issues](https://www.verkkouutiset.fi/a/yle-attendollakin-ongelmia-aliravittuja-vanhuksia-lainvastaisia-laakkeita/)
- [Special diets among schoolchildren](https://core.ac.uk/download/146449026.pdf)
- [Yle: public-sector cuts](https://yle.fi/a/74-20209291)
