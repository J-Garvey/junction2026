# Questions for the Valio Aimo mentors

**At the stand, use [stand-questions.md](stand-questions.md)**: the 15 that matter before the deadline, in order. This file is the full list.

The single list of questions for the mentors. **Before asking, check [../GROUND_TRUTH.md](../GROUND_TRUTH.md)**: questions marked **[answered]** or **[partly public]** below were settled or narrowed on 14 Nov from the data, the API, the brief or Valio Aimo's own website. Q1–33 come from [01-customer-options-brief.md](01-customer-options-brief.md) and keep their numbers, because 01 refers to them. Q34–45 were added from [04-segment-research-chain-first.md](04-segment-research-chain-first.md) and the data review. Tick answers off here and record them in the relevant research file.

## Q1–33: customer-segment questions (from 01)

We're choosing between **A. Independent restaurants**, **B. Hotel & restaurant chains**, **C. Contract caterers** and **E. Private care homes**. Each question below includes a short *why we ask*, so whoever is talking to the mentor knows what to listen for.

### 1. The decider: ask this first

Ask **Hanna Forsström or Pirjo Kaartinen** (commercial mentors):

1. **Roughly what share of Valio Aimo's revenue, and of its margin, comes from A, B, C and E?** A ranking is fine if exact numbers are confidential. *Why we ask:* this is the biggest unknown in our comparison. A segment that's large but low-margin, or small but growing fast, changes the answer. **[partly answered, 14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)]** Revenue is concentrated in large hotel chains; no split given.
2. **Which of these four would you most want to win or protect over the next 2–3 years, and why?** *Why we ask:* the judges are Valio Aimo, so their own priority carries real weight. **[answered, 14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)]** Hotels first, then restaurants; the agent fits hotel catering and event orders.
3. **Who would pay for this, and how?** Would Valio Aimo fund it as a service to keep customers, or would customers pay (subscription, per order)? Which of the four would actually pay? *Why we ask:* we dropped F and G partly for unwillingness to pay, so we should test the same thing on the shortlist.

### 2. Strategy and competition (commercial mentors)

4. Which of the four segments are you **losing to competitors** (Kespro, Meira Nova, Metro), and why do they leave?
5. Has any customer in these groups already **asked for automated or AI ordering**, or connected their own system?
6. Which group places the **most orders per euro of revenue**, i.e. is the most expensive to serve today?
7. Are prices for these customers **list prices or individually negotiated contracts**? **[partly public]** Customer-specific net prices exist (My Aimo shows "net-priced products and discount levels by product group"). Ask how widespread they are by segment.

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

25. For A, B, C and E: what share orders through the **webshop, mobile, phone, EDI or a salesperson**? **[partly public]** Public channels: webshop (works on mobile; file import, templates, recurring orders), phone and email, Click & Collect, VALO. No public app, EDI or customer API. Shares are still unknown.
26. Which group makes the **most corrections, complaints or returns**?
27. What takes customers the longest in the webshop today? Searching, comparing, checking availability, or approvals?
28. What happens today when an item is out of stock: who picks the substitute, and how often do customers reject it? **[partly public]** In the webshop, substitutes are only suggested and the customer decides. What happens at picking is not public.

### 5. Data and trust: ask Tommi Nurmi-Aro, Ville Takanen or Riku Tapper (IT and data)

29. Are prices in the mock API the same for everyone, or **contract-specific per customer**? **[Partly answered: the mock ignores `customer`; `netPriceFound` is true on about 1.6% of products whatever the customer; `catalogPrice` is below `listPrice` on almost all. Customer-specific prices exist in production (public site). Ask instead: how long does a price hold, and how should an agent get a customer's own prices?]**
30. How does the availability API show **partial quantities** and alternative delivery dates? **[Answered for the mock: one schedule line per product. The mock ignores `requestedDate`: `availableDate` is always 2026-11-16. Two sentinels mean "unknown": 999999 (Terminal) and 9,999,999,999 base units (some Stock). Still ask: will production return several lines, i.e. split deliveries, and real dates?]**
31. How reliable and up to date is **allergen** data? What does the `nonAllergen` field contain? **[Every `nonAllergen` value carries `unit: FREE_FROM` (5,119 products). Still ask: why is it a separate group, is "free from" tested or declared, and why do most Valio products have no free-from list?]**
32. Which customers already connect **system-to-system** (EDI, or kitchen software like Aromi or Jamix)? *(Nothing is public about this.)*
33. What would you need to see before trusting an outside agent to place orders **without a human**?

### 6. What the answers to Q1–33 will tell us

- If one segment clearly leads on **revenue or margin (Q1)** and on **Valio Aimo's priority (Q2)**, that's a strong pointer.
- If a segment mostly orders via **EDI** or wants its **own platform (Q18–19)**, an agent built by us adds less, and the "someone else's platform" risk rises.
- If the most **corrections and complaints (Q26)** come from one segment, that's where accuracy saves the most.
- If a segment won't pay **or** Valio Aimo won't fund serving it **(Q3)**, drop it.
- Then fill the "?" cells in the side-by-side table, agree weights and score.

## Q34–45: added from Darragh's research and the data review

### 7. Commercial: Hanna Forsström, Pirjo Kaartinen

34. What is a **typical order value** per site? *Why we ask:* sizes the business case. (Spend-limit sign-off came up, but mentors said it is not an expected pain point, so don't build around it unless this changes.)
35. Do chains and public kitchens order from a **restricted contract assortment**? *Why we ask:* it defines what the agent may see and pick. Related: Q7, Q13.
36. What does **"comparing offers"** mean inside a single wholesaler: across products, pack sizes or delivery dates? *Why we ask:* prices are fixed and the assortment is Aimo's own. **[partly answered by the brief]** It names price, availability, delivery reliability, certificates and labels, and "good-better-best" substitution ranking within Aimo's assortment.

### 8. Online sales: Minni Ruhtinas

37. What are the **order cut-off times and lead times** by product category or route? *Partly known:* the API returns a per-product `closingTime` (Monday delivery: most Stock Sun 17:00, some Stock Fri 13:00, Terminal 10–12 Nov, already past yet still offered). Publicly: delivery on agreed delivery days, orders editable until picking starts, recurring orders take 7 days to change. Also ask: what should an agent do when the cut-off has passed? **[partly answered, 14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)]** Lead times are product-line specific, next day to about 4 days, with the cut-off shown per product in the webshop (e.g. 17:00 today for tomorrow). Orders placed early for an event can be amended until the cut-off.
38. What is your **fill rate**? Complements Q28.
39. How does the customer **learn about a substitution**, and when?

### 9. IT and data: Tommi Nurmi-Aro, Ville Takanen, Riku Tapper

40. What data must **stay hidden** from external agents? *(The brief names only categories: "real systems, confidential data or the marketplace roadmap".)*
41. How should an agent **prove it acts for a specific customer**?
42. How are **stock, price and origin data verified** today? Complements Q31.
43. What does **`allowedLotSize` 0.01** mean (it's on 96% of products)? Can a buyer really order 0.01 of a case? *(The schema defines it as the order step in sales units; the API does not use it.)* **[partly answered, 14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)]** Customers buy whole units: 1.5 needed means buying 2.
44. ~~A **Terminal** product always reports `availableAmount` 999999. Does that mean "always fillable" or "unknown"?~~ **[answered]** Unknown: the API spec says "actual value is not known". New question instead: some Stock products return 9,999,999,999 base units; does that also mean unknown?
45. What do the **unit codes** (KI, ST, PAK, KRS, …), **temperature classes 1–9** and **category codes** officially mean? *(Allergen, claim, label and nutrient codes are now verified against GS1. Units are inferred from the data, except ST; temperature and category codes are undocumented.)* **[partly answered, 14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)]** The 5-digit category codes are SAP-defined; their names are still not in the data.

### 10. From the spike-order research ([05](05-spike-orders-under-time-pressure.md))

46. Is there a process for **large or event orders** (a quote, stock reservation, or a sales contact) that isn't published? *Why we ask:* no Finnish wholesaler publishes one, and an event's base order may exceed shelf stock (8,500 of ~30,000 SKUs are on the shelf in Espoo).
47. Can a customer get a **delivery outside its agreed delivery days**, or a same-day delivery, and at what fee? *Why we ask:* the headcount correction lands 1–3 days before an event; today the only same-day route is Tilaa & Nouda pickup in Helsinki.
48. Is the **~99% delivery reliability** measured per delivery or per order line? *Why we ask:* per delivery, a 100-line event order could still miss several lines.
49. When a Tilaa & Nouda line is out of stock it's removed without a substitute. Would Valio Aimo **want an agent to offer a checked substitute** (same allergens and spec) instead? *Why we ask:* that is the agent's main "one clear question" moment.

### Junction organisers (not Valio Aimo)

- What are the submission rules and format? **[deadline answered]** Final submissions Sun 15 Nov 10:00 (junction2026.com/about.md). Format and required artefacts are not public.

## Already answered by the data (no need to ask)

- *Can the mock API place and reserve orders?* No. It is read-only: lookup only, no order, reservation or approval endpoint.
- *Does the catalogue carry allergens, stock, pack sizes and per-customer prices?* Allergens on 54% of products; stock via the availability API (real quantities only for "Stock" products); pack sizes yes (`units`); per-customer prices not modelled in the mock.

Questions from Darragh's list that duplicated 01 were merged into Q1 (segment split), Q2 (priority segment), Q25 (ordering channels), Q28 (who picks the substitute) and Q32 (Jamix, Aromi, EDI).
