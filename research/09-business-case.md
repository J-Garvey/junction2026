# The business case: why this product matters, for whom, and why hotels

> **What this is:** the case for the product, compiled on 15 Nov 2026 from the research already in this repo, the challenge data, and what the build has shown. It answers five questions: why the product matters, who it matters for, what it means for Valio Aimo, what it means for the client, and why we chose hotels running events.
>
> **What it is not:** new research. Nothing here was looked up fresh on the web. Every claim points to the file it came from, so it can be checked. Where this file and [../GROUND_TRUTH.md](../GROUND_TRUTH.md) disagree, the ground truth wins.
>
> **How claims are marked**
>
> | Tag | Means |
> |---|---|
> | **[INTERVIEW]** | Said by Owen, a hotel chef and kitchen manager, in the team's interview ([08](08-interview-owen-bar-events.md)). One person |
> | **[STAND]** | Said by Valio Aimo staff at Junction on 14 Nov, relayed by the team. Spoken, not documented |
> | **[SRC]** | A public source, cited in the research file named |
> | **[DATA]** | Computed from the challenge's product catalogue |
> | **[API]** | Observed on Valio Aimo's mock API |
> | **[BUILD]** | Shown by our own prototype and its tests |
> | **[BRIEF]** | Stated in the challenge brief |
> | **[INF]** | Our reading of the evidence. Not sourced |
> | **[OPEN]** | Not known. Says who could answer |
>
> **The honest limits, up front.** The team called 30 hotels and spoke with one practitioner: Owen, a chef and kitchen manager, who said the way we describe event ordering is accurate. That is one account. We have not spoken to a hotel finance manager. We have no measured figure for the time or money this saves anyone. Section 10 lists everything we don't know.

## 1. The case on one page

- **The problem.** A hotel orders the food for a large event months ahead, then changes it on one phone call with its Valio Aimo rep about 2–3 weeks out [STAND]. Menus become quantities by hand, from recipes kept in Word and Excel [SRC: research/07]. Valio Aimo's systems see only order lines; the guest count, the menu and the allergies reach it by phone, if at all [SRC][STAND].
- **A hotel chef confirms the sequence.** Owen described it in this order: the guest is consulted, the kitchen settles the menu and the exact ingredients, the finance manager approves, and only then does the order go to the wholesaler. His hotel is contractually tied to one supplier [INTERVIEW].
- **Why it matters now.** Ordering is moving from people clicking through a catalogue to software agents doing it for them. The brief calls how a wholesaler exposes itself to those agents "existential for data ownership, trust, and who owns the customer relationship" [BRIEF]. Other wholesalers and ordering platforms are already shipping AI ordering [SRC: research/05].
- **Who it matters for.** The chef, who carries the risk if food is missing or unsafe. The finance manager, who cannot check every order but cannot let software spend freely. Valio Aimo, which wants agents ordering through an interface it controls.
- **For the hotel:** less manual work turning a menu into an order, fewer chances for an allergen or quantity error, changes handled without a phone call, and a record of who approved what.
- **For Valio Aimo:** agents can order from it safely without it having to trust their code; event context arrives as data, not by phone; and it gets a concrete answer to the brief before a platform defines one for it.
- **Why hotels and events.** Valio Aimo told us hotels come first and that revenue is concentrated in large hotel chains. It also told us event orders are the ones with no template [STAND]. The brief's own example is a hotel chain's agent [BRIEF].
- **What we can't claim.** A time saving in hours, a cost saving in euros, or that hotels would pay. None has been measured.

## 2. The problem

### 2.1 How a hotel gets the food for an event today

From [07-hotel-event-ordering-journey.md](07-hotel-event-ordering-journey.md).

| Stage | When | What happens | What Valio Aimo sees |
|---|---|---|---|
| Event booked | Months ahead | Client and hotel agree terms in writing [SRC] | Nothing |
| Menu becomes an ingredient list | Months ahead | The kitchen multiplies the menu by the expected guests [INF] | Nothing |
| Order placed | Months ahead | Order lines: product, quantity, delivery date [STAND] | Order lines only |
| Client sends final details | 7–21 days before | Final guest count, special diets, menu choices [SRC] | Nothing new |
| Clarification call | About 2–3 weeks before | One call with the rep: guest count, items and quantities, sometimes allergens [STAND] | Event context, by phone, held by the rep |
| Last changes | Up to 3 working days before | Late guest-count or diet changes [SRC] | Unknown [OPEN] |
| Picking and delivery | Before the event | Shortages are found at picking [OPEN: what happens then] | Order lines |

Two facts from this journey carry most of the case:

- **The event's context never reaches Valio Aimo as data.** No order field carries the guest count, the menu or the event type [SRC]. It lives in a chef's files and a rep's memory.
- **The amendment is a phone call.** It mostly changes the guest count and the items and quantities, and sometimes allergen information [STAND].

### What the hotel chef adds

Owen's account fills in the hotel's side of the first three rows above [INTERVIEW]:

1. **The guest is consulted first.** There is a conversation with the guest before the event.
2. **The kitchen settles the menu and the exact ingredients.**
3. **The finance manager approves it.**
4. **Then it goes to the wholesaler.**

He also said the hotel is **contractually obliged to stay with the same supplier**. The order in which he describes it, chef, then finance, then wholesaler, is the order our product follows.

### 2.2 Where it goes wrong

Every ordering problem is an error in one part of the same sum: forecast portions × amount per portion, minus stock on hand, rounded up to pack sizes, sent before the cut-off [research/04].

| Failure point | Evidence |
|---|---|
| **The guest count moves** | Finnish hotels take final numbers about two weeks out and still accept changes up to 3 working days before [SRC: research/07]. In a global event dataset, median no-shows are about 28% for free events and 17% for paid ones [SRC: research/05]. No Nordic figure exists for changes after the final count [OPEN] |
| **The conversion is manual** | Valio Aimo's own customer interviews found recipes scattered across Word and Excel, which is why it built a recipe tool into My Aimo in January 2026 [SRC: research/07]. In the one verified Finnish hotel case, the kitchen manager places the orders [SRC] |
| **Substitutes break recipes** | "Two blue milks may not be interchangeable in recipes"; sugar with additives can break bakery recipes; substitution is "a real operational problem when stock runs out" [STAND: research/06] |
| **Allergens** | The kitchen that serves the food owes diners the allergen information, under EU Regulation 1169/2011 and Finnish decree MMM 834/2014 [SRC: GROUND_TRUTH 6]. A swap made without telling the kitchen makes its allergen sheet wrong [research/04]. In a 2021 UK case a wedding guest had anaphylaxis from a nut-containing canapé and the caterer was fined £16,000 plus costs [SRC: research/05]. No Finnish or Nordic incident data was found |
| **Stock can't be seen** | Only 8,500 of Valio Aimo's 30,000 products sit on the shelf; the rest are order-only [SRC: research/05]. A large quantity of a slow-moving line is the likeliest thing to be short on an event order [INF] |
| **Over- and under-ordering** | About 17% of food in Finnish food services is wasted (Luke, 2019) [SRC: GROUND_TRUTH 6]. Valio's sales terms carry no duty to take goods back [SRC: research/05], so over-ordering is the hotel's loss and under-ordering is a service failure |

### 2.3 What the catalogue itself shows

These come from the challenge's own data and mock API. They are the strongest evidence we have, because they don't depend on anyone's account.

| Finding | Figure | Why it matters |
|---|---|---|
| Products with no allergen declaration | 8,122 of 17,546 (46%) [DATA] | An agent that treats missing data as safe would be wrong on nearly half the catalogue |
| Products that list substitutes | 188 (1.1%) [DATA] | Substitution has to be worked out; it can't be looked up |
| Priced products that can't be delivered | 239 of 1,000 sampled (24%) [API] | A price does not mean a product can be ordered |
| Deliverable products whose stock is unknown | 337 of 761 sampled (44%) [API] | 195 ship from the supplier and 142 return a placeholder. Any honest agent has to say "can't confirm" often |
| Products with a delivery-reliability figure | 4,425 (25%) [DATA] | Reliability can inform a choice on a quarter of products only |
| Lactose-free claims contradicted by the same product's allergen list | 4 products [DATA] | Claims can't be trusted without a cross-check |
| A cake listed as both "free from tree nuts" and "contains almond" | 1 found, in the wedding test [DATA][BUILD] | The contradiction appears in ordinary event planning, not only in edge cases |
| "Salmon" products that are Finnish, deliverable and plain fillet | 3 of 95 [DATA][API] | A name search returns soups, pies, sandwiches and baby food. Finding the right product is real work |

The last row was counted by reading the product names by hand; see [docs/demo-plan.md](../docs/demo-plan.md).

## 3. Who it matters for

### 3.1 The chef

- **What they are responsible for:** enough food, of the right kind, safe for every guest, on time.
- **What it costs them today:** turning a menu and a guest count into order lines by hand, redoing it when the count changes, and carrying the blame if something is missing [INF: docs/hotel-catering-customer-journeys.md, a working hypothesis].
- **Why the product matters to them:** the conversion, the pack arithmetic and the allergen check are done for them, and they are asked only what a person has to answer, such as whether a dish still works with a substitute.
- **Evidence:** Owen, a chef and kitchen manager, raised allergies, quantities and forecasting unprompted as his main concerns when ordering [INTERVIEW]. The audio was poor, and it is one person's account.

### 3.2 The finance manager

- **What they are responsible for:** the event's cost and margin.
- **The tension:** they cannot review every order line, and they cannot let an agent spend without limit.
- **Why the product matters to them:** they set limits once, orders inside them go through, and anything outside comes to them as one question. Every approval is tied to the exact order it covered.
- **Evidence, and a caution:** in Owen's kitchen the finance manager approves every order before it goes to the wholesaler [INTERVIEW]. That is how it works today there. We have not spoken to a finance manager. The team chose to design for approval of exceptions only (decision D16), and a hotel that wants to approve everything can set its limit to zero.

### 3.3 Valio Aimo

Three different people at Valio Aimo have a stake.

| Who | Their stake |
|---|---|
| **The sales rep** | Holds the event's context today and takes the clarification call [STAND] |
| **Commercial and marketplace** | Wants to keep the customer relationship as ordering moves to agents [BRIEF] |
| **IT and data governance** | Has to decide what an outside agent may see and do, without exposing real systems or confidential data [BRIEF] |

### 3.4 The guest

The guest never uses the product and never deals with Valio Aimo [STAND]. They are the person the allergen rules protect. In the demo story this is a six-year-old with a tree-nut allergy and a cake that contains almond.

## 4. Why hotels running events

### 4.1 The evidence for the choice

| Reason | Evidence |
|---|---|
| **Valio Aimo said so** | "Hotels, then restaurants, are the priority target segment." Revenue is concentrated in large hotel chains [STAND: research/06] |
| **Events are the unsolved part** | Daily breakfast orders run on templates and are already automated. Catering events have no templates: "high labour, high complexity". An agent suits catering orders, not routine ones [STAND: research/06] |
| **The hotel is tied to one wholesaler** | Owen's hotel is contractually obliged to stay with the same supplier [INTERVIEW]. So the hotel's agent has one wholesaler to deal with, and what that wholesaler's interface allows is what the hotel gets |
| **The brief's own example** | "A hotel chain's agent sends this request" [BRIEF] |
| **The need is structured** | Menu × guests × diets maps cleanly to quantities, and the exceptions are bounded: pack rounding, stock, diet counts [research/05] |
| **The buyer is a cook, not a buyer** | A Finnish head-chef job advert puts supplier relationships inside the chef's role; the buyer "would rather answer one question than build an order" [SRC, INF: research/05] |
| **A wrong order costs more than any price difference** | Venue contracts push over-ordering onto the client, while shortfalls and allergen errors stay with the venue [SRC: research/05] |
| **There is a season** | December Christmas parties, and Lapland's charter season, where hotel rooms averaged €356 against €168 nationally in December 2025 [SRC: research/05] |

### 4.2 What we considered and turned down

Two research passes disagreed at first; the reasoning for each segment is in [01](01-customer-options-brief.md), [04](04-segment-research-chain-first.md) and [QUESTIONS.md](../QUESTIONS.md).

| Segment | Why it was attractive | Why we didn't choose it |
|---|---|---|
| **Public kitchens** (schools, hospitals) | The largest volume: about 380 million meals a year. Recipes and diets already sit in kitchen systems. Fixed tender prices match the brief [SRC: research/02] | Tenders and regulation make adoption slow, and Valio Aimo can only win these customers through tenders [TEAM]. An allergen error in a demo would be fatal [research/04] |
| **Independent restaurants and cafés** | Probably the largest number of accounts; the owner feels the time cost personally [INF] | Recipes live in the chef's head, so an agent has nothing to compute from. Accounts are small, and 2025 restaurant bankruptcies were at record levels [research/01, 04] |
| **Contract caterers** (Compass, Sodexo, ISS) | Large, concentrated volume. One deal covers many kitchens [SRC: research/01] | Powerful buyers likely to build their own platform, which is the "someone else's platform" risk the brief warns about [INF] |
| **Private care homes** | Many sites, steady demand, high stakes on special diets [SRC: research/01] | How they order is unknown, and some buy in meals instead of cooking [OPEN] |
| **Food industry** | Volume | Supply is negotiated in bulk; little for an agent to do [research/04] |
| **Emergencies and surge feeding** | The clearest case of speed over price: Migri made almost €900m of direct awards on urgency grounds [SRC: research/05] | Episodic. It will not supply a steady stream of orders [research/05] |
| **Transport** (cruise, ferry, airline, rail) | Hard deadlines | They absorb volatility themselves, buy through intermediaries, or run fixed menus [research/05] |

### 4.3 Where our choice is weak

- **Some chains may buy elsewhere.** Sokos Hotels belong to S Group, which owns the wholesaler Meira Nova [SRC: research/01]. No source names any chain's wholesaler, and Scandic has group procurement but names none [OPEN: research/07]. Owen's account makes this sharper: a hotel that is contractually tied to another wholesaler is out of reach until its contract ends [INTERVIEW][INF].
- **We don't know who orders at a chain hotel**, or whether chains buy centrally [OPEN].
- **Our timing evidence conflicts.** One research pass says the urgent order is the correction 1–3 days before service. Valio Aimo's staff describe the main change as a call 2–3 weeks out. Finnish hotels do accept changes up to 3 working days before, but whether those reach Valio Aimo is unknown [research/07].
- **The Finnish hotel market is soft.** Scandic called Finland a "cautious market" [SRC: research/01].
- **We have one hotel voice.** The team called 30 hotels and spoke with one chef and kitchen manager. The rest of the hotel's side comes from public terms, job adverts and Valio Aimo's account. We have not spoken to a hotel finance manager.

## 5. What it means for the client

Each row says what changes, how the product does it, what supports it, and what we can't claim.

| Consequence | How the product does it | Support | What we can't claim |
|---|---|---|---|
| **Less work turning a menu into an order** | Amounts per guest × guests, combined per product, rounded once to whole packs | Recipes are kept in Word and Excel and converted by hand [SRC] | How many hours. No chef has told us how long it takes today |
| **Changes without a phone call** | A new guest count re-runs the order and shows only what changed. Small changes need nobody | The clarification call exists and mostly changes guest count and quantities [STAND] | That hotels would stop calling. The call may carry things we don't model |
| **Fewer allergen mistakes** | Allergens are checked from the data's declarations, never from names. An allergy to tree nuts also catches almond. "Free from" never outweighs "contains" | 46% of products have no declaration; the data contradicts itself in places [DATA] | That it prevents an incident. It checks the data, and the data is supplied by manufacturers |
| **Substitutes the kitchen has agreed to** | Any substitute that is a different product goes to the chef with a side-by-side. A yes is remembered for that recipe | Ingredients are not interchangeable by category [STAND] | That a side-by-side is enough for a chef to judge. No chef has confirmed it |
| **No surprises on stock** | Unconfirmed stock is shown as unconfirmed, and the person building the order decides whether to continue | 44% of deliverable products in our sample had unknown stock [API] | That the real system is as opaque as the mock |
| **Control of spending** | The hotel's limits are enforced by Valio Aimo's gateway, not only by the agent | The brief names spend thresholds as a sign-off trigger [BRIEF] | That spend limits are a real pain. A mentor told us they are not expected to be [research/04] |
| **A record** | One log of every step, the rule behind it, and who approved it | The brief asks for "a usable, human-readable log" for both sides [BRIEF] | Nothing; this is built and tested [BUILD] |
| **Less over-ordering** | Rounding is done once on the total, and overshoot above a limit is flagged | About 17% of food in Finnish food services is wasted [SRC] | Any reduction. Most of that waste is at the serving line, which ordering doesn't touch |

**Costs and risks to the hotel**

- **Their recipes have to be entered.** The agent computes from recipes. A hotel whose recipes live in a chef's head gets little [research/04]. How recipes get into the product was left open (decision D22).
- **Responsibility doesn't move.** The hotel still owes its guests the allergen information [SRC]. If the product is wrong, the hotel carries it.
- **One decision loosens a safety rule.** A chef can continue past a product with no allergen declaration, with the line kept marked (decision D35). It was decided on 15 Nov and is not yet built.
- **Whose side is the agent on?** If the wholesaler supplies the agent, a hotel may ask this [QUESTIONS.md]. The audit, and enforcement the hotel can inspect, are our answer; no hotel has been asked whether it satisfies them.

## 6. What it means for Valio Aimo

### 6.1 What it gains

| Consequence | Why | Support |
|---|---|---|
| **It can let agents order without trusting them** | Its gateway enforces the hotel's limits and the hard rules itself, and refuses an order that breaks them | Built and tested: an order over the limit with no approval is refused, and accepted with one [BUILD] |
| **It defines the interface before someone else does** | The contract is published as OpenAPI 3.1, with signed quotes, orders and approvals anyone can verify | The brief: "before that interface gets defined by someone else's platform" [BRIEF]. Choco, US Foods and Sysco already ship AI ordering [SRC: research/05] |
| **Event context arrives as data** | Guest counts, changes and the reasons for them come with the order | Today that context reaches Valio Aimo only by phone [STAND] |
| **Fewer calls for its reps** | Routine changes are applied without a call | One call per event today [STAND]. We have no figure for how many events or how long a call takes [OPEN] |
| **Shortfalls are handled before picking** | The final check finds a short line before the cut-off and gets the kitchen's choice of substitute | What happens today when a line is short at picking is unknown [OPEN]. Its click-and-collect channel removes out-of-stock lines with no substitute offered [SRC: research/05] |
| **A position on events against Kespro** | Kespro holds an estimated 49.2% of the peer group and markets itself as the event wholesaler, with a 23:00 cut-off in the capital region [SRC: research/05, GROUND_TRUTH 5] | Our reading that this is the dimension to compete on is inference [INF] |
| **Its own data problems become visible** | The agent surfaces missing allergen declarations, contradictions and undeliverable priced products | Section 2.3 [DATA][API] |
| **A path to the standards its customers may require** | Signed mandates in the shape of AP2, and orders exportable as Peppol | The wedding order passes the Peppol ordering checks [BUILD: docs/build.md]. There is no public evidence of Peppol ordering in Finnish food service [SRC] |

**What the supplier contract means for Valio Aimo** [INF]. If hotels are contractually tied to their wholesaler, as Owen says his is [INTERVIEW], this product doesn't win Valio Aimo an order it would otherwise lose inside a contract. Its value to Valio Aimo is in serving contracted customers at lower cost and with fewer errors, and in being the easier wholesaler to work with when a contract comes up for renewal. One hotel's contract is not evidence about all of them.

### 6.2 What it risks

- **Its opacity shows.** An honest agent says "can't confirm stock" on a large share of products. In the wedding, 5 lines end with unconfirmed stock [BUILD]. That is true to the mock; whether it is true of the real system is unknown [OPEN].
- **Price-first ranking doesn't favour its own brand.** The agent now ranks on price, then reliability (decision D34). For lactose-free milk that happens to pick Valio's own product. Nothing guarantees it will elsewhere. Whether Valio Aimo or a customer ever sets Valio's products as the default is a question we have listed for them [OPEN].
- **The rep's role changes.** If routine changes stop going through the rep, the relationship the rep holds changes too. We have not asked Valio Aimo how it sees that [OPEN].
- **Overlap with its own roadmap.** My Aimo already has a recipe tool that scales a recipe and puts the smallest covering pack in the cart [SRC: research/07]. Whether it scales by guest count or combines recipes is not published [OPEN]. It may be closer to this product than we know.
- **Its data becomes a liability surface.** If an agent orders on a wrong allergen declaration, the question of who is responsible gets sharper, not softer [INF].
- **The mock is not the real system.** Everything we built runs against a mock that ignores the customer and the requested date [API]. Integration with its real systems is unpriced [OPEN].

### 6.3 What we can't tell Valio Aimo

How much revenue this protects or adds; how many rep hours it saves; how many of its 20,000 customers run events; what share of its revenue is hotels. It publishes no split by segment [SRC: research/04], and "revenue is concentrated in large hotel chains" is a spoken remark [STAND].

## 7. The market around it

| Fact | Source |
|---|---|
| Valio Aimo: about 20,000 customers, 700 suppliers, 350 staff; delivery from Espoo and Kuopio in about 24 hours on agreed days | GROUND_TRUTH 5 |
| Finnish food-service wholesale fell 0.9% in January to November 2025 | GROUND_TRUTH 5 |
| Kespro: an estimated 49.2% of the food-service wholesale peer group, 2025 | GROUND_TRUTH 5 |
| Valio Aimo's 2025 brand survey: 86% call it trustworthy; NPS 73. Sample size not published | GROUND_TRUTH 5 |
| No Finnish wholesaler publishes an event-order, quote or stock-reservation process | research/05 |
| Choco launched a voice ordering agent with OpenAI in December 2025; US Foods and Sysco run AI ordering tools | research/05 |
| No vendor shows event guests becoming a wholesaler order automatically, with pack sizes, substitutes and delivery slots | research/05 |
| 83% of Finnish chefs surveyed expect finding skilled staff to be a major task (Atria, 2025; 516 respondents, not Valio Aimo's customers) | GROUND_TRUTH 6 |

**Why now** [INF]: a flat market, a competitor with half of it, a labour shortage in kitchens, and ordering platforms moving into the space between the kitchen and the wholesaler. If the agent that orders for a hotel belongs to a platform, the platform decides which wholesaler it asks first.

## 8. What the build shows

This is evidence that the product can be built, not that anyone wants it.

- **It runs end to end.** A wedding for 180 guests goes through booking, a change two weeks out, and a final check before the cut-off, on real catalogue products and prices. All 478 automated tests passed when the suite was last run for the deliverables list, at commit `0d02ad9` [BUILD: docs/demo-deliverables.md].
- **The gateway refuses what it should.** An order over the limit with no approval, a line past its cut-off, and a diet failure are each refused [BUILD].
- **Lookups are fast.** Stock for 1,000 products came back from the mock in 0.8 seconds [API, 14 Nov]. That is the lookup alone, not the whole pipeline.
- **The data fights back.** Building the wedding surfaced the almond contradiction, the potatoes with no allergen declaration, and salmon that has a price and can't be delivered. None was planted.

## 9. Who pays

Undecided [QUESTIONS.md, item 2].

| Option | For | Against |
|---|---|---|
| **Valio Aimo pays** | It gains the interface, lower cost to serve and the relationship. One sale covers thousands of kitchens | A long sales cycle. It might build it itself |
| **Hotels pay** | The payer is the one who saves the time | Many small sales. A buyer's agent naturally wants to compare wholesalers, which the brief rules out |
| **Both** | Valio Aimo licenses it; large customers pay for more | Harder to explain |

No one has been asked [OPEN: mentor question 3].

## 10. What we don't know

| Unknown | Why it matters | Who can answer |
|---|---|---|
| How long event ordering takes a hotel today. The interview didn't establish it | Without it there is no time-saving claim | A hotel chef |
| How many events a hotel orders for, and how often counts change late | Sets the size of the problem | A hotel; Valio Aimo |
| Valio Aimo's revenue and customer split by segment | Tests "hotels first" with numbers | Valio Aimo |
| Which wholesaler the large chains use, and whether they buy centrally | Decides whether the chosen customer is reachable | Valio Aimo |
| What happens when a line is short at picking | Decides what the final check replaces | Valio Aimo |
| Whether changes in the last 3 working days reach Valio Aimo | Decides which moment matters most | Valio Aimo; a hotel |
| Whether My Aimo's recipe tool already scales by guests | Decides how much of this is new | Valio Aimo |
| Whether real stock is as opaque as the mock | Decides how often an agent must say "can't confirm" | Valio Aimo IT |
| Whether a hotel would accept approval of exceptions only. In Owen's kitchen every order is approved [INTERVIEW] | Decides the default the product ships with | A hotel finance manager |
| Whether a side-by-side is enough for a chef to judge a substitute | Decides whether the substitute flow works | A hotel chef |
| Who would pay, and how much | Decides whether this is a business | Valio Aimo; hotels |

## 11. What would change our mind

- **Valio Aimo says events are a small share of hotel orders.** Then the segment is right and the use is wrong.
- **A hotel chef says the conversion takes minutes, not hours.** Then the value is in safety and changes, not in time.
- **The large chains buy from Meira Nova or Kespro under group contracts.** Then the reachable customers are independents and smaller groups, and the case has to be remade for them.
- **My Aimo's recipe tool already does event-level scaling.** Then our part is the gateway and the approvals, not the conversion.
- **Real stock is known for most products.** Then the "can't confirm" questions mostly disappear, and with them a good part of the friction.

## 12. Sources

All in this repo.

| File | What it gave |
|---|---|
| [../challenge/brief.txt](../challenge/brief.txt) | The challenge, the judging weights, the brief's framing |
| [../GROUND_TRUTH.md](../GROUND_TRUTH.md) | Verified facts: the data, the mock API, Valio Aimo, the market |
| [01-customer-options-brief.md](01-customer-options-brief.md) | The candidate segments, with facts and risks for each |
| [02-initial-deep-dive.md](02-initial-deep-dive.md) | Public kitchens, and why they were ruled out |
| [04-segment-research-chain-first.md](04-segment-research-chain-first.md) | The case for chains; how an order is built; the Atria survey |
| [05-spike-orders-under-time-pressure.md](05-spike-orders-under-time-pressure.md) | Events, late changes, competitors, ordering technology |
| [06-valio-aimo-conversation-2026-11-14.md](06-valio-aimo-conversation-2026-11-14.md) | What Valio Aimo told us about segments, events and substitution |
| [07-hotel-event-ordering-journey.md](07-hotel-event-ordering-journey.md) | The journey from booking to delivery, with Finnish hotel deadlines |
| [08-interview-owen-bar-events.md](08-interview-owen-bar-events.md) | The interview with Owen, a hotel chef and kitchen manager, reached after calling 30 hotels |
| [../docs/build.md](../docs/build.md), [../docs/demo-deliverables.md](../docs/demo-deliverables.md), [../docs/demo-plan.md](../docs/demo-plan.md) | What the prototype does, and the wedding's real products |
| [../docs/prd-context.md](../docs/prd-context.md) | The team's decisions, D1 onwards |
