# User stories

> **What this is:** the story backlog the PRD agent builds from, grouped by avatar and sorted by importance. Each story is one sentence, **"X so that Y"**: what the avatar does or gets, and why it matters to them. Every story names what it rests on: a team decision (**D1** to **D31**, in [prd-context.md](prd-context.md)), the brief, the data or a research file.
>
> It replaces [hotel-catering-user-stories.md](hotel-catering-user-stories.md) (US01 to US12) as the PRD's input. That file is kept as history. Since then (14 Nov): voice calls, SMS and WhatsApp are **cut** (email updates stay an add-on, CH-A6); the supermarket top-up is a **non-core add-on** (CH-A12); the Purchasing Manager is **kept for now as an optional role** (prd-context D1, D2, D15–D22).

## How to read it

**Avatars**

| Avatar | Who | Role in one line |
|---|---|---|
| **Chef** (CH) | Banquet or executive chef, or a bar manager | Says what the event needs; answers recipe questions; never commits money |
| **Approver** (AP) | F&B Director or finance manager: in charge of finances | Sets the hotel's rules once; signs off only what breaks them |
| **Valio Aimo** (VA) | The wholesaler, through the Agent Gateway API, plus its rep | Answers lookups and quotes, takes orders, enforces the hotel's mandate, keeps the audit log |
| **Purchasing Manager** (optional) | A separate buyer, where the hotel has one | Decides what is bought and how much, with maximum authority for now (D20). No stories yet |

A hotel can have several people per role and linked outlets such as a bar and a restaurant (D27, which overrides D17). There is no permissions system, but the product records who did what. The core is how the hotel can trust the agent to spend (D15), and most food orders are approved automatically (D16).

Preference stories (**PF**) belong to the Chef, the Approver or both, as marked.

**Importance**

| Tier | Means |
|---|---|
| **P0** | Core. The demo breaks without it. Build first. |
| **P1** | Core. Must exist, but a thin version is fine for Junction. |
| **Add-on** | Built only once all core stories pass (D3). |
| **Parked** | Out, with the reason, so nobody rebuilds it by accident. |

**Scenes** (D4, D8): **S1** viability, months ahead · **S2** order or approval, months ahead · **S3** guest-count and diet change, ~2–3 weeks out · **S4** automatic final check before the cut-off · **M** the brief's 1,000 L milk request.

## Index

| ID | Avatar | Tier | Story | Scene |
|---|---|---|---|---|
| CH-01 | Chef | P0 | Enter the event as a structured list so that the agent understands exactly what I want | S1 |
| CH-02 | Chef | P0 | See every line as green, amber or red months ahead so that I know whether I can realistically make the menu from Valio Aimo goods | S1 |
| CH-03 | Chef | P0 | Get the right product type, not a lookalike from the same category, so that I don't have to correct the basket | S1, M |
| CH-04 | Chef | P0 | Get my per-portion amounts as whole packs so that the order is something Valio Aimo can actually pick | S1, S2 |
| CH-05 | Chef | P0 | Be asked whether to continue when a product's stock can't be confirmed so that I keep the option without ever mistaking it for confirmed stock | S1, S4, M |
| CH-06 | Chef | P0 | Judge a substitute side by side with one yes/no question so that I can decide fast whether my dish still works | S4 |
| CH-07 | Chef | P0 | Update guest and diet counts and see the full order with every change colour-coded so that I check the changes in context without redoing the order | S3 |
| CH-08 | Chef | P0 | See the cut-off as the deadline on any final-check question so that I know how long I have to answer | S4 |
| CH-09 | Chef | P0 | Ask for a single item in plain words, outside any event menu, so that a quick need doesn't mean filling in a form | M |
| CH-10 | Chef | P1 | See why each line isn't green, with the rule behind it, so that I can fix the menu or accept the risk | S1 |
| CH-11 | Chef | P1 | Have a substitute I approved remembered for that recipe, and be told each time it's used, so that I'm never asked twice but never surprised | S4 |
| CH-12 | Chef | P1 | Get one order line per product, with each dish's share visible, so that the order is clean but still traceable to my menu | S1, S2 |
| CH-13 | Chef | P1 | Have every line re-checked when a new allergy arrives so that nothing unsafe stays in the order | S3 |
| CH-14 | Chef | P1 | Get a one-line "covered" when the final check passes so that I know the event is safe without opening anything | S4 |
| CH-15 | Chef | P1 | See certificates and labels on each pick, and require one when I need it, so that sourcing promises like "MSC fish" are kept | S1 |
| CH-16 | Chef | P1 | Set an origin requirement such as "Finnish fish only" so that the organiser's sourcing rules are kept | S1, S3 |
| CH-17 | Chef | P1 | Have delivery planned for when prep starts, including thawing, not just for the service date, so that frozen and long-prep items arrive in time | S1, S4 |
| CH-18 | Chef | P1 | Have quantities sanity-checked against the guest count so that a unit slip like litres for decilitres is caught before it's ordered | S1, S3, M |
| AP-01 | Approver | P0 | Have orders inside our rules placed without me so that I only spend time on exceptions | S2 |
| AP-02 | Approver | P0 | Get one question naming the exact rule that tripped so that I can answer in seconds | S2, S3, M |
| AP-03 | Approver | P0 | Approve a fill split across several products so that the order still goes in when no single product covers it | M, S4 |
| AP-04 | Approver | P0 | See no approve option on blocked lines so that I can't accidentally waive a diet rule or confirm unknown stock | S1–S4 |
| AP-05 | Approver | P0 | Read a log of everything the agent did and why so that I can trust it and show my director | all |
| AP-06 | Approver | P0 | Hold our rules as one mandate so that the agent and Valio Aimo enforce the same thing | all |
| AP-07 | Approver | P1 | Have my approval tied to the exact quote so that it can't be reused for a different order | S2 |
| AP-08 | Approver | P1 | Have small changes at the 2–3-week point applied without me so that the clarification call disappears for normal changes | S3 |
| AP-09 | Approver | P1 | Get money questions only after the chef says yes so that I never approve something the chef would reject | S4 |
| AP-10 | Approver | P1 | Have unanswered lines flagged to me and our Valio Aimo rep at the cut-off so that both sides know before picking | S4 |
| AP-11 | Approver | P1 | Pre-answer the questions I'd always answer the same way (e.g. "accept a partial fill up to 10% short") so that I decide once instead of every time | S3, S4 |
| AP-12 | Approver | P1 | See how many human decisions each event took so that I can see the time saved and tune our rules | all |
| AP-14 | Approver | P1 | Be asked when lines can't all arrive on one agreed delivery day so that I choose between a split delivery and a different product | S2, S4 |
| VA-01 | Valio Aimo | P0 | Let agents search my catalogue by text, category, claim and allergen so that they find products without scraping the webshop | S1, M |
| VA-02 | Valio Aimo | P0 | Answer price and availability with a dated quote so that agents commit to something fixed, not something they re-read | S1, S2, S4 |
| VA-03 | Valio Aimo | P0 | Create orders only from a quote, at its fixed prices, so that prices never drift or get negotiated | S2 |
| VA-04 | Valio Aimo | P0 | Refuse orders that break the hotel's mandate without a matching approval so that I don't have to trust the agent's code | S2 |
| VA-05 | Valio Aimo | P0 | Refuse lines past their cut-off, even when the mock shows Monday, so that no one is promised a delivery I can't make | S2, S4 |
| VA-06 | Valio Aimo | P0 | Keep one audit log both sides read so that a disputed order is settled from one record | all |
| VA-07 | Valio Aimo | P0 | Publish the gateway as an OpenAPI 3.1 spec with the mock's quirks stated so that any agent can integrate and judges see what we assumed | all |
| VA-08 | Valio Aimo | P1 | Recheck price, stock and cut-off at commit so that I never accept an order on stale terms | S2 |
| VA-09 | Valio Aimo | P1 | Allow amendments until each line's cut-off so that changes follow my real rules | S3, S4 |
| VA-10 | Valio Aimo | P1 | Treat the same order sent twice as one order so that a retry never doubles a delivery | S2 |
| VA-11 | Valio Aimo | P1 | Require every call to name the hotel, site and role so that I can check it against the mandate | all |
| VA-12 | Valio Aimo | P1 | Send unresolved-at-cut-off flags to the rep so that they can call the hotel before picking | S4 |
| VA-13 | Valio Aimo | P1 | Shortlist locally and batch lookups so that agents don't hammer my rate limits | all |
| PF-01 | Chef | P0 | Get asked for any constraint I haven't given (allergies, diets, gluten-free or not, delivery date and time) so that the order fits the event without me remembering every field | S1, M |
| PF-02 | Chef, Approver | P1 | Set standing preferences once in the hotel profile so that every order follows them without asking | all |
| PF-03 | Chef, Approver | P1 | Override any profile setting for one event or one request so that an unusual event doesn't mean changing the profile | S1, S3, M |
| PF-04 | Chef, Approver | P1 | Change a profile setting for all products from the main settings so that one change applies everywhere | all |
| PF-05 | Chef | P1 | Give allergies and diets per event by default, with standing ones allowed, so that one event's guests never constrain another's | S1, S3 |
| PF-06 | Chef, Approver | P1 | See which preferences shaped each pick and where they came from so that I can tell why a product was chosen | S1, S2 |
| SF-01 | Shared | P0 | Run all four scenes on one simulated clock so that cut-offs and fixtures always agree | all |
| SF-02 | Shared | P0 | Label every fixture as a fixture so that judges never mistake demo data for real data | all |
| SF-03 | Shared | P0 | Write each hard rule as code with a stable ID so that every decision can cite the rule behind it | all |
| SF-06 | Shared | P0 | Rank candidates good-better-best in one fixed order so that the same request always gives the same pick and the pick can be explained | S1, S4, M |
| SF-07 | Shared | P0 | Use real stock straight away when the delivery date is inside the lead time so that urgent requests are checked against what can actually ship | S1, M |
| SF-04 | Shared | P1 | Evaluate hotel policy as data so that each hotel's rules change without code | all |
| SF-05 | Shared | P1 | Log every model judgement with its confidence so that guesses are never disguised as rules | S1, M |
| UI-01 | Chef, Approver | P0 | Open the app on the decisions waiting for me and my events, with the chat box pinned on top, so that I start from what needs me, not from a blank chat | all |
| UI-02 | Chef, Approver | P0 | See each waiting question with its deadline, soonest first, so that I never hunt for what needs me | S2–S4 |
| UI-03 | Chef, Approver | P0 | Answer every question on one card with two or three buttons so that I never have to type to decide | S2–S4, M |
| UI-04 | Chef | P0 | Correct what the agent understood by tapping editable chips so that a misread is fixed before anything is quoted | S1, M |
| UI-05 | Chef, Approver | P0 | Tap any number or verdict to see its source so that I can check it without leaving the screen | all |
| UI-06 | Chef, Approver | P0 | See one set of status labels on every screen so that I read state at a glance | all |
| UI-07 | Chef, Approver | P0 | Open one page per event with its menu, order, open questions and timeline so that the chef and the approver look at the same thing | S1–S4 |
| UI-08 | Chef, Approver | P0 | See what the agent didn't do as prominently as what it did so that gaps are never hidden | all |
| UI-09 | Chef, Approver | P1 | See the same order as a dish view or a money view so that each role sees their part first | S1–S3 |
| UI-10 | Chef, Approver | P1 | See what's still editable and until when so that I know what I can change | S2–S4 |
| UI-11 | Chef, Approver | P1 | Get one "all covered" summary instead of a notification per line so that an alert always means action | S4 |
| UI-12 | Chef | P1 | Answer a question from my phone in under 10 seconds so that the kitchen doesn't stop | S3, S4 |
| UI-13 | Chef, Approver | P1 | Use the app on my phone so that I can send requests, check orders, and answer questions away from my desk | all |
| TM-01 | Chef, Approver | P0 | Belong to a hotel with linked outlets, each with its own members and preferences, so that the bar and the restaurant each run their part while the hotel stays one customer | all |
| TM-02 | Chef, Approver | P0 | Share my role with colleagues, any one of whom can answer, so that a question never waits on one person | S2–S4 |
| TM-03 | Chef, Approver | P0 | See a question close for everyone once someone answers, with who and when, so that nobody answers twice or contradicts a colleague | S2–S4 |
| TM-04 | Chef | P0 | Plan one event with another outlet, with each line owned by an outlet, so that the bar manager and the restaurant manager coordinate on one page | S1–S4 |
| TM-05 | Approver | P0 | Send one Valio Aimo order per delivery site and date, with every line tagged by outlet, so that we get one delivery and can still split the costs | S2 |
| TM-06 | Shared | P0 | Switch who I'm viewing as in the demo so that multi-person flows can be shown without building logins | all |
| TM-07 | Chef, Approver | P1 | See that a colleague just changed a line I'm editing, and confirm again, so that nobody's change is silently overwritten | S1, S3 |

Add-ons and parked stories are listed at the end of each avatar's section.

---

## Chef

### P0

**CH-01** Enter the event as a structured list so that the agent understands exactly what I want.
*S1 · D5*
- The list holds dishes, per-portion ingredients, guest count, diet counts and service date.
- Each ingredient line keeps its dish and its diet group (e.g. "lactose-free, 40 guests").
- Diet counts that don't fit inside the guest total are refused with a question; the agent never guesses which guest a gap belongs to. [approval rules]
- A missing guest count, date or quantity leaves that part open and asks for it.

**CH-02** See every line as green, amber or red months ahead so that I know whether I can realistically make the menu from Valio Aimo goods.
*S1 · D7*
- **Green:** in the catalogue, deliverable (non-empty `scheduleLines`), passes the event's diet and allergen rules by claim, priced, pack size verified against the price API.
- **Amber:** delivery reliability unknown or below 0.95, pack size guessed from the name, or only a substitute matches.
- **Red:** nothing passes the diet rules, or nothing is deliverable.
- Stock is never part of the verdict here. It is shown as information, labelled "today's stock, not a promise for your date".

**CH-03** Get the right product type, not a lookalike from the same category, so that I don't have to correct the basket.
*S1, M · D12*
- Diet requirements are matched on claims such as `FREE_FROM_LACTOSE`, never on the product name. [GROUND_TRUTH 4.3]
- Where claims can't tell types apart (category 10400 mixes plain milk, coffee milk and piimä), the agent asks the Decisions API a yes/no question per candidate ("Is this plain drinking milk?").
- Below the confidence threshold, the line becomes a question to the chef, not a pick.

**CH-04** Get my per-portion amounts as whole packs so that the order is something Valio Aimo can actually pick.
*S1, S2 · research/06, GROUND_TRUTH 4.4, D25*
- Uses the availability API's `salesUnit`, not the catalogue's.
- Litres or kg per pack come from `catalogPrice / comparisonPrice` when the API gives it; otherwise from the formula, and the line goes amber.
- **Rounding policy (D25):**
  1. Combine the same product across dishes first (CH-12), then round the total once. Never round per dish.
  2. Round up to whole sales units by default (1.5 needed means 2). Never round down automatically.
  3. If the same product comes in several pack sizes with identical spec, pick the mix with the least overshoot (23 L needed: 2 × 10 L + 3 × 1 L, not 3 × 10 L). No human needed.
  4. Overshoot within the hotel's tolerance (a pre-answer, AP-11, e.g. 10% or a euro amount) goes through. Above it, one question to the Approver: accept the overshoot, round down and accept the shortfall, or switch pack size.
  5. Round down only by a person's choice, per order or as a pre-answer for named low-risk categories.
  6. Any buffer (CH-A5) is added before rounding.
- Shows the overshoot on every rounded line.

**CH-05** Be asked whether to continue when a product's stock can't be confirmed so that I keep the option without ever mistaking it for confirmed stock.
*S1, S4, M · GROUND_TRUTH 3 · D31*
- 999999 on Terminal products and 9,999,999,999 base units (scaled) on Stock products both mean the stock can't be confirmed.
- These products are still suggested, but ranked below any product with a real stock figure that passes the same rules.
- When one is picked, the person building the order is asked a question, not shown a warning: "Valio Aimo can't confirm stock for [product]. Continue with it?" They can continue or pick another. The Approver is not asked.
- The line is labelled "stock not confirmed" everywhere and is never shown as confirmed, including after the final check.
- A pre-answer (AP-11) can skip the question, for example on cheap lines.
- This matters for the milk case: 20 of the lactose-free milks are Terminal. [API, GROUND_TRUTH 4.3]

**CH-06** Judge a substitute side by side with one yes/no question so that I can decide fast whether my dish still works.
*S4 · D6*
- Shows: ingredient statement, fat, protein and sugar per 100 g, claims, allergens, pack size, price per kg or L, delivery reliability.
- The question names the dish: "Will [dish] still work with this?"
- Only the chef gets this question. Any ingredient that is a different product always asks; only the same product in a different pack with identical spec does not. [approval rules]

**CH-07** Update guest and diet counts and see the full order with every change colour-coded so that I check the changes in context without redoing the order.
*S3 · D4*
- Shows a compact version of the whole order: every line as item, quantity and unit, nothing else by default.
- Changed lines are colour-coded: added, removed, quantity up, quantity down, needs a substitute. Unchanged lines stay plain.
- Each changed line shows old and new quantity; details open on demand.
- Unchanged lines are not re-asked.
- Changes inside the mandate's tolerance go through; others become questions (AP-08).

**CH-08** See the cut-off as the deadline on any final-check question so that I know how long I have to answer.
*S4 · D8, D9*
- A shortfall leads to a substitute from Valio Aimo's range, ranked good-better-best (CH-06).
- If I don't answer by the cut-off, nothing changes: the line stays as last approved and is flagged (AP-10).

**CH-09** Ask for a single item in plain words, outside any event menu, so that a quick need doesn't mean filling in a form.
*M · D10*
- Example: "1,000 litres of lactose-free milk by Monday" (the brief's own request). It has no dishes, recipes or guest count, unlike an event (CH-01).
- A language model turns the text into structured lines (need, quantity and unit, date, constraints) and shows them back.
- An ambiguous request ("milk" with no type) is always a question. [approval rules]
- From there the request runs the same deterministic pipeline as a structured list.

### P1

**CH-10** See why each line isn't green, with the rule behind it, so that I can fix the menu or accept the risk.
*S1 · D12*
- Each reason cites a rule ID and the data fact, e.g. "ALG-01: contains milk (ML); the lactose-free group must avoid it".
- The explanation text is written by the language model from facts the rules produced; it adds no new facts.

**CH-11** Have a substitute I approved remembered for that recipe, and be told each time it's used, so that I'm never asked twice but never surprised.
*S4 · D6*
- Scoped to the recipe and product pair, not to every dish.
- Each time it's applied I get a short message, no action needed: "[Original] replaced with [substitute] in [dish], as per your approval of [date]."
- The audit shows "auto-approved: remembered chef approval of [date]".

**CH-12** Get one order line per product, with each dish's share visible, so that the order is clean but still traceable to my menu.
*S1, S2 · old US03*
- Combine only when product, requirements and delivery date match.

**CH-13** Have every line re-checked when a new allergy arrives so that nothing unsafe stays in the order.
*S3 · D4, approval rules*
- A line that now fails is blocked with its reason; no approval can push it through.
- If the line is already ordered and nobody resolves the conflict by the cut-off, the order goes ahead with a big warning shown everywhere (D28). The agent never removes the line by itself.

**CH-14** Get a one-line "covered" when the final check passes so that I know the event is safe without opening anything.
*S4 · D8*

**CH-15** See certificates and labels on each pick, and require one when I need it, so that sourcing promises like "MSC fish" are kept.
*S1 · BRIEF optional, data-dictionary labels*
- Shows the product's labels (16 GS1 label codes in the data, e.g. `MARINE_STEWARDSHIP_COUNCIL_LABEL`, `EU_ORGANIC_FARMING`, `MADE_IN_FINLAND_FLAG_WITH_KEY`).
- A required label for an event is a hard rule for that event; a preferred label only changes ranking (PF-02).
- A missing label means "not labelled", not "fails": the product just doesn't meet a label requirement.

**CH-16** Set an origin requirement such as "Finnish fish only" so that the organiser's sourcing rules are kept.
*S1, S3 · BRIEF trust protocol, approval rules*
- Matches on the data's `origin` field (country, ISO alpha-2), never on the name.
- A product with no origin recorded cannot pass an origin requirement; it can be asked about, not assumed.
- An event-level origin rule is a hard rule for that event (approval rules: an organiser's rule is always enforced).

**CH-17** Have delivery planned for when prep starts, including thawing, not just for the service date, so that frozen and long-prep items arrive in time.
*S1, S4 · approval rules*
- Each line has a needed-by date: service date minus prep time, plus thawing for frozen products (temperature class 7 is frozen). [GROUND_TRUTH 4.5]
- A delivery date after the needed-by date is a question, not an order.
- Prep and thaw times come from the recipe or a profile default.

**CH-18** Have quantities sanity-checked against the guest count so that a unit slip like litres for decilitres is caught before it's ordered.
*S1, S3, M · approval rules*
- A quantity per guest far outside the norm for that item, or one that looks like a unit mix-up (litres vs decilitres, packs vs cases), becomes a question naming the suspected slip.
- The check never silently corrects a quantity.

### Add-on

| ID | Story | Basis |
|---|---|---|
| CH-A1 | Use a preset recipe library with compatibility tags so that I don't re-enter recipes for every event | D5; depends on whether My Aimo keeps customer recipes |
| CH-A2 | Give dish names only and let the agent draft recipes, marked "agent-drafted" until I confirm, so that I can check viability before writing recipes out | D5 |
| CH-A3 | Get compatibility tags suggested ahead of time so that fewer substitutes need my answer | D6 |
| CH-A4 | Subtract stock the hotel already has so that we don't buy what's already in the store room | old US02; chef interview Q12 |
| CH-A5 | Set a buffer above the confirmed count, per dish, so that late extra guests don't run us short | research/07 open; chef interview Q11 |
| CH-A6 | Send requests and get updates by email so that I can use the agent mid-service | ICP.md |
| CH-A7 | Get a reminder, then have my named backup (e.g. sous chef) asked, so that a question never dies because I'm busy | D9 |
| CH-A12 | Get a small shortfall delivered to the venue by a partner shop so that a missing item does not hold up the event | D2, D3, D21, D23, old US08 |
| CH-A13 | Start from a standard forecast for typical event sizes, then adjust, so that a bar manager without recipes can still order fast | research/08 (Owen) |
| CH-A14 | Check what arrived against the order before prep so that a short delivery is caught while there's time to react | old US11 |

**CH-A12** Get a small shortfall delivered to the venue by a partner shop so that a missing item does not hold up the event.
*S2, S4, M · [Supplier scope](prd-context.md#supplier-scope), [product scope](../ICP.md#6-our-product-opportunity)*
- For a small gap in confirmed Valio Aimo supply or a quantity below a wholesale pack, show a dropshipping offer from a supermarket, Valio Aimo partner, or other partner shop. Aimo stock marked unknown follows AP-13.
- Show the offer beside the Aimo lines. Label it as externally sourced and show the shop, product, pack count, total including delivery, and expected arrival at the venue. Keep the source visible to the approver and Valio Aimo on the order (AP-A3, VA-A1).
- Apply the same diet, allergen, timing, and spend checks as for any other line. The hotel handles any exception through its usual approval flow. Valio Aimo does not approve external lines.
- Link the top-up to the event with its own supplier reference and delivery status. If the shop cannot confirm the offer, show the quantity still needed. Use labelled simulated offers and orders for Junction.

### Parked

| ID | Story | Why parked |
|---|---|---|
| CH-P1 | Handle a client's change in the last 1–3 days before the event so that very late changes are covered | Low confidence it reaches Valio Aimo [OPEN]; same mechanism as S3 (D4) |
| CH-P2 | Use the agent by voice call, SMS or WhatsApp: call in or text a change, get a shortfall call, answer a swap in WhatsApp (former CH-A8 to CH-A11, added 14 Nov) | Cut on 14 Nov: not enough value for the effort and the approval risk; the product aims for one decision per event, made in the app. Full text in git history (commit 1b64da9) |

---

## Approver

### P0

**AP-01** Have orders inside our rules placed without me so that I only spend time on exceptions.
*S2 · D1*
- I get a receipt: items, quantities, total ex VAT and VAT, delivery date, the rules checked.
- A hotel that wants to approve everything sets its spend cap to zero; that is a normal mandate, not a special mode. [research/08]

**AP-02** Get one question naming the exact rule that tripped so that I can answer in seconds.
*S2, S3, M · D1, D14*
- One question per decision, not one per line.
- The question shows the basket, total and delivery terms, cites the rule ID(s) and states the fact behind each.
- Answers: approve or reject.

**AP-03** Approve a fill split across several products so that the order still goes in when no single product covers it.
*M, S4 · D10, GROUND_TRUTH 4.3*
- For the milk case: the products with real stock figures, their litres and total, and the rest named "unknown stock".

**AP-04** See no approve option on blocked lines so that I can't accidentally waive a diet rule or confirm unknown stock.
*S1–S4 · approval rules · D31*
- Blocked: allergen or diet failure, no delivery dates, price `error: true`, past cut-off.
- Unconfirmed stock is **not** blocked: it is a question to the person building the order (CH-05), and it is never shown as confirmed.
- Each blocked line says what would unblock it (a different product or a different request).

**AP-05** Read a log of everything the agent did and why so that I can trust it and show my director.
*all · BRIEF, D12*
- Each entry: time, actor (agent or a named human, acting for which hotel), action, rule IDs fired, model judgements with confidence, before and after.
- Filter by event.

**AP-06** Hold our rules as one mandate so that the agent and Valio Aimo enforce the same thing.
*all · D11*
- The mandate holds sites, roles, spend cap, approved products, tolerances, the "very large order" threshold and soft defaults.
- For Junction the mandate may be a read-only fixture; editing it is the PRD's call.
- The mandate is registered with the gateway (VA-04), not only kept by the agent.

### P1

**AP-07** Have my approval tied to the exact quote so that it can't be reused for a different order.
*S2 · D11, AGENTS.md*
- Bound to items, quantities, total and delivery terms.
- If anything changes at commit, the approval is void and I'm asked again with the diff.

**AP-08** Have small changes at the 2–3-week point applied without me so that the clarification call disappears for normal changes.
*S3 · D4*
- Outside tolerance: one question showing the diff.

**AP-09** Get money questions only after the chef says yes so that I never approve something the chef would reject.
*S4 · D6*
- Applies when a substitute is both a recipe change and a money or policy issue (price jump, off our list).

**AP-10** Have unanswered lines flagged to me and our Valio Aimo rep at the cut-off so that both sides know before picking.
*S4 · D9*
- The order stays as last approved.

**AP-11** Pre-answer the questions I'd always answer the same way (e.g. "accept a partial fill up to 10% short") so that I decide once instead of every time.
*S3, S4 · D9*
- A pre-answer is a standing reply to a type of question that would otherwise come to me: "accept a partial fill up to 10% short", "round up if the overshoot is under 10%", "a price rise under 5% on an approved product is fine".
- When one applies, the agent acts and the audit says which pre-answer it used. If no pre-answer covers it, I'm asked as normal.
- Pre-answers live in the hotel profile (PF-02) and can be overridden for one event (PF-03).
- They never cover hard rules: no pre-answer can waive an allergen or diet rule.

**AP-12** See how many human decisions each event took so that I can see the time saved and tune our rules.
*all · D14*
- Each decision shows the rule that caused it.

**AP-14** Be asked when lines can't all arrive on one agreed delivery day so that I choose between a split delivery and a different product.
*S2, S4 · approval rules, GROUND_TRUTH 5*
- Triggers: lines with different available dates, a date that isn't one of the hotel's agreed delivery days, or a public holiday adding a day.
- The API returns one delivery line per product and can't express a split delivery, so the agent never assumes one.

### Add-on

| ID | Story | Basis |
|---|---|---|
| AP-A1 | Choose a detailed or a "just handle it" explanation mode so that the agent explains as much as I want | research/06 |
| AP-A2 | Set up our hotel in the app ourselves (sites, roles, per-order spend cap, approved products, tolerances) so that we can start without Valio Aimo onboarding us | D18, D19 |
| AP-A3 | See which lines are externally sourced, and from where, on my order so that I know what isn't coming from Valio Aimo | D21 |
| AP-A4 | Review an event's purchasing cost and issues afterwards so that the next event is cheaper and smoother | old US12 |
| AP-A5 | Name a backup for each role so that questions still get answered when someone is away | D9 |
| AP-A8 | See an event's likely over-ordering (rounding overshoot and leftovers) so that we waste less food and money next time | ICP.md "potential over-ordering" |

### Parked

| ID | Story | Why parked |
|---|---|---|
| AP-P2 | Review phone decisions, or approve a quote from an SMS or WhatsApp link (former AP-A6, AP-A7, added 14 Nov) | Cut on 14 Nov with the other channels; see CH-P2. Full text in git history (commit 1b64da9) |
| AP-P1 | Pick which wholesaler gets the order so that we get the best offer | Valio Aimo only; a buyer agent comparing wholesalers is the marketplace the brief rules out (D2) |
| AP-13 | Accept or refuse the risk of ordering a product with unknown stock so that we can still order it, knowingly | Withdrawn 14 Nov (D31): the stock question now goes to the person building the order, see CH-05 |
| AP-P3 | Get warned when a recurring weekly order drifts (portions creeping up, cost rising) so that it isn't renewed blindly | A brief scenario, but recurring orders like breakfast are already templated and outside our event segment (research/06) |

---

## Valio Aimo (Agent Gateway API)

### P0

**VA-01** Let agents search my catalogue by text, category, claim and allergen so that they find products without scraping the webshop.
*S1, M · BRIEF core 1*
- Returns structured product data, with GS1 codes exactly as in the data.
- No allergen declaration means "unknown", never "free from". [GROUND_TRUTH 4.2]

**VA-02** Answer price and availability with a dated quote so that agents commit to something fixed, not something they re-read.
*S1, S2, S4 · BRIEF core 1–2, D11*
- Per line: `catalogPrice` per sales unit ex VAT, VAT rate, `validTo`, available quantity or "unknown", available date, `closingTime`, logistic model.
- Empty `scheduleLines` is "not deliverable"; price `error: true` is "no price".
- The quote has an ID and expires at its earliest cut-off.

**VA-03** Create orders only from a quote, at its fixed prices, so that prices never drift or get negotiated.
*S2 · BRIEF core 2*

**VA-04** Refuse orders that break the hotel's mandate without a matching approval so that I don't have to trust the agent's code.
*S2 · D11*
- The approval must be bound to that exact quote.
- Mandates and approvals follow AP2's mandate shape; no payments.
- The refusal says which mandate rule failed.

**VA-05** Refuse lines past their cut-off, even when the mock shows Monday, so that no one is promised a delivery I can't make.
*S2, S4 · GROUND_TRUTH 3*

**VA-06** Keep one audit log both sides read so that a disputed order is settled from one record.
*all · BRIEF*

**VA-07** Publish the gateway as an OpenAPI 3.1 spec with the mock's quirks stated so that any agent can integrate and judges see what we assumed.
*all · BRIEF openness, D11*

### P1

**VA-08** Recheck price, stock and cut-off at commit so that I never accept an order on stale terms.
*S2 · AGENTS.md*
- If anything moved, the order is refused with the diff.

**VA-09** Allow amendments until each line's cut-off so that changes follow my real rules.
*S3, S4 · research/06, D4*
- After the cut-off, amendments are refused.

**VA-10** Treat the same order sent twice as one order so that a retry never doubles a delivery.
*S2 · approval rules*
- Every order carries an idempotency key.

**VA-11** Require every call to name the hotel, site and role so that I can check it against the mandate.
*all · D11, GROUND_TRUTH 7*
- A header for Junction; OAuth 2.0 Token Exchange (`act` claim) named as the production path.
- Names the hotel, the outlet and the person acting (D27). Verifying the person with real logins is an add-on (TM-A1).

**VA-12** Send unresolved-at-cut-off flags to the rep so that they can call the hotel before picking.
*S4 · D9*
- For Junction, an audit entry tagged "to Valio Aimo" is enough; a rep screen is an add-on.

**VA-13** Shortlist locally and batch lookups so that agents don't hammer my rate limits.
*all · SPEC*
- At most 1,000 IDs per call.

### Add-on

| ID | Story | Basis |
|---|---|---|
| VA-A1 | See externally sourced lines on a hotel's order, labelled with their source, so that I know what my catalogue didn't cover | D21: no per-line approval by Valio Aimo |
| VA-A2 | Give reps a screen for flags and sourcing requests so that nothing waits unseen in a log | D9 |
| VA-A3 | Show a carbon range per line (product-group averages, labelled as such) so that hotels can weigh sustainability, not only price | BRIEF optional |
| VA-A4 | Suggest seasonal or new products to the buyer's agent so that I can sell, not only answer | BRIEF scenario |
| VA-A5 | Export orders as Peppol BIS Ordering 3.3 so that hotels' existing systems can read them | D11 |
| VA-A6 | Sign product claims as verifiable credentials so that agents can trust claims without a manual check | D11 |

### Parked

| ID | Story | Why parked |
|---|---|---|
| VA-P1 | Offer an MCP interface to the gateway so that MCP-native agents can connect | The brief calls MCP-style interfaces out of scope |
| VA-P2 | Take payments through the agent so that ordering and paying happen in one step | B2B is invoiced on account; not in the brief (D11) |

---

## Preferences and constraints

Three layers, kept apart so nobody confuses them:

| Layer | Example | Who sets it | Enforced by | Can a human override it? |
|---|---|---|---|---|
| **Hard rules** | Allergens, stated diets, past cut-off | Nobody: built in (SF-03) | The agent and the gateway | No |
| **Mandate** | Spend cap, approved products, delivery sites | Approver (AP-06) | The gateway (VA-04) | Only by an approval bound to the quote |
| **Preferences** | Carbon, brand, origin, price vs reliability, pre-answers (AP-11) | Chef or Approver | The hotel agent, when ranking and deciding when to ask | Yes, per event or per request |

A constraint stated for an event, such as "lactose-free for 40 guests", becomes a hard rule for that event. A preference only changes ranking or whether the agent asks.

### P0

**PF-01** Get asked for any constraint I haven't given (allergies, diets, gluten-free or not, delivery date and time) so that the order fits the event without me remembering every field.
*S1, M · approval rules, D14*
- Every request is checked against a list of required constraints before anything is quoted: delivery date, delivery site, guest count (for events), and allergies and diets.
- Missing allergy or diet information is asked for; the agent never assumes "none".
- All missing constraints come back as one grouped question, not one at a time.
- A delivery time of day can be recorded, but the API gives a date only, so a time is flagged "not guaranteed by Valio Aimo". [AGENTS.md]

### P1

**PF-02** Set standing preferences once in the hotel profile so that every order follows them without asking.
*all · Jack 14 Nov*
- Examples: carbon (once carbon data is in, VA-A3), preferred brands, origin such as "Finnish fish only", how to weigh price against delivery reliability, and pre-answers (AP-11).
- Profile preferences are the hotel agent's; they are separate from the mandate the gateway enforces.
- For Junction the profile can be pre-filled; the settings screens are non-core (D18).

**PF-03** Override any profile setting for one event or one request so that an unusual event doesn't mean changing the profile.
*S1, S3, M · Jack 14 Nov*
- Every profile setting can be overridden for one event or one request.
- The override is shown on that event and in the audit, and lapses when the event ends.

**PF-04** Change a profile setting for all products from the main settings so that one change applies everywhere.
*all · Jack 14 Nov*
- A change applies to future quotes and to orders not yet past their cut-off, and the affected orders are re-checked.

**PF-05** Give allergies and diets per event by default, with standing ones allowed, so that one event's guests never constrain another's.
*S1, S3 · Jack 14 Nov*
- Allergies and diets are event-level by default.
- A hotel can also set a standing one (e.g. "no peanuts on site"), which then applies to every event.

**PF-06** See which preferences shaped each pick and where they came from so that I can tell why a product was chosen.
*S1, S2 · D12*
- Each pick lists the preferences applied and whether each came from the profile or from this event.

### Add-on

| ID | Story | Basis |
|---|---|---|
| PF-A1 | Rank products by carbon footprint as a profile preference so that lower-carbon options come first when everything else is equal | Jack 14 Nov; needs VA-A3 (carbon data is product-group averages covering 63% of products) |

## Interface

How people use the app (D26). The rule underneath every story: **type to ask, tap to decide.** Free text is an input; every decision is a fixed card with buttons, so it is precise and auditable. The default view is compact; detail is one tap away, never in the way.

### P0

**UI-01** Open the app on the decisions waiting for me and my events, with the chat box pinned on top, so that I start from what needs me, not from a blank chat.
*all · D26, D14*
- Home shows, in order: questions waiting for me (UI-02), then my events with their status (UI-07).
- The chat box is pinned at the top of home for new requests (CH-09) and is reachable from every screen.
- With nothing waiting, home says so in one line ("Nothing needs you. 3 events covered.").
- Replaces the chat-first home in [designs/mockups](../designs/mockups) (screen 01).

**UI-02** See each waiting question with its deadline, soonest first, so that I never hunt for what needs me.
*S2–S4 · D9, D14*
- Each item shows the event, a one-line question, and its deadline (the cut-off, D9).
- Only questions routed to my role and my outlets appear (D6, D27): recipe questions to that outlet's chef, money and policy to the approver.
- A question someone else already answered disappears from my list and shows in the event as "Answered by [person], [time]" (TM-03).

**UI-03** Answer every question on one card with two or three buttons so that I never have to type to decide.
*S2–S4, M · D9, D14*
- The card holds everything needed to answer: the fact, the rule that raised it, the options and their cost or effect, and the deadline.
- Buttons are the answers (e.g. "Approve partial fill", "Use substitute", "Keep as is"). No free-text approvals.
- Every answer is written to the audit with the exact card the person saw.

**UI-04** Correct what the agent understood by tapping editable chips so that a misread is fixed before anything is quoted.
*S1, M · D10*
- The parsed request is shown as chips: quantity and unit, product need, date, each constraint.
- Tapping a chip edits it in place; a chip the agent wasn't sure of is marked (UI-05).

**UI-05** Tap any number or verdict to see its source so that I can check it without leaving the screen.
*all · D12*
- Shows the rule ID, the data field and value behind it, or the model judgement with its confidence.
- Opens in place (a popover or drawer), not a new page.

**UI-06** See one set of status labels on every screen so that I read state at a glance.
*all · D7, D21, D31*
- Labels: green, amber, red (D7); stock not confirmed (D31); externally sourced (D21); awaiting answer; blocked.
- Same colour and wording everywhere; never colour alone (each has a text label).

**UI-07** Open one page per event with its menu, order, open questions and timeline so that the chef and the approver look at the same thing.
*S1–S4 · D4, D8*
- The timeline shows the four scenes (viability, order, change, final check) and where the event is now.
- The order view is the compact colour-coded list from CH-07.

**UI-08** See what the agent didn't do as prominently as what it did so that gaps are never hidden.
*all · D14*
- Blocked, unresolved and at-risk lines sit at the top of the event page and the order, above lines that are fine.
- A summary never says "covered" alone while any line's stock is unconfirmed; it says how many lines are unconfirmed.

### P1

**UI-09** See the same order as a dish view or a money view so that each role sees their part first.
*S1–S3 · D6*
- Dish view (chef default): lines grouped by dish and diet group. Money view (approver default): lines by cost, with total, VAT and the mandate's limits.
- Both are the same order; switching views changes nothing.

**UI-10** See what's still editable and until when so that I know what I can change.
*S2–S4 · research/06*
- Each line shows its cut-off as a countdown, as in the mockups' cut-off board; past cut-off lines show as locked.

**UI-11** Get one "all covered" summary instead of a notification per line so that an alert always means action.
*S4 · D8*
- Notifications are sent only for questions. Lines that pass arrive as one summary per event.

**UI-12** Answer a question from my phone in under 10 seconds so that the kitchen doesn't stop.
*S3, S4 · [INF: not yet checked with a chef]*
- Question cards (UI-03) work on a phone screen with one thumb.

**UI-13** Use the app on my phone so that I can send requests, check orders, and answer questions away from my desk.
*all · [TechStack.md](../TechStack.md)*
- On a phone in portrait mode, the chef can send or edit a request and check the order status. The approver can open a quote, see its total and cut-off, and submit a decision.
- Text, fields, and buttons stay readable and usable without horizontal scrolling or zoom. The on-screen keyboard leaves the current field and its submit action reachable.
- Verify the same flow in mobile Safari on iOS, Chrome on Android, and the Capacitor build on both platforms. When a colleague answers on either device, the question closes on both, and each shows who answered and when (TM-03).

---

## Teams and outlets

A hotel has linked **outlets** (bar, restaurant, banquet kitchen), each with its own people, and several people can share a role (D27). This overrides D17's "hotel acts as one entity": there is still no permissions system, but the product knows who did what.

### P0

**TM-01** Belong to a hotel with linked outlets, each with its own members and preferences, so that the bar and the restaurant each run their part while the hotel stays one customer.
*all · D27, GROUND_TRUTH 5*
- The hotel is one Valio Aimo customer with one mandate (AP-06). Outlets sit inside it.
- Each person has a role (Chef or Approver) and one or more outlets; an Approver can cover the whole hotel.
- Preferences (PF-02) can be set per outlet, e.g. the bar's brands and the restaurant's origin rules.
- Mirrors Valio Aimo's linked accounts for multi-site users.

**TM-02** Share my role with colleagues, any one of whom can answer, so that a question never waits on one person.
*S2–S4 · D27*
- A question goes to everyone with that role in that outlet (two chefs, two financial controllers).
- Any one of them can answer; it doesn't need all of them.

**TM-03** See a question close for everyone once someone answers, with who and when, so that nobody answers twice or contradicts a colleague.
*S2–S4 · D27, D9*
- The first answer wins and the card closes for all; others see "Answered by [person], [time]".
- The audit records the person, not just the role (AP-05).

**TM-04** Plan one event with another outlet, with each line owned by an outlet, so that the bar manager and the restaurant manager coordinate on one page.
*S1–S4 · D27, D6*
- Each line is tagged with its outlet; recipe questions go to that outlet's chef (a wine swap to the bar manager, never the restaurant chef).
- Everyone on the event sees all of it, with their own outlet's lines first (UI-07).

**TM-05** Send one Valio Aimo order per delivery site and date, with every line tagged by outlet, so that we get one delivery and can still split the costs.
*S2 · D27*
- Lines from several outlets for the same site and date go out as one order.
- The outlet tag stays on each line in the order, the receipt and the audit.

**TM-06** Switch who I'm viewing as in the demo so that multi-person flows can be shown without building logins.
*all · D27*
- A visible "viewing as [person, role, outlet]" switcher; every action is attributed to the person selected.
- Labelled as a demo stand-in for real logins (TM-A1).

### P1

**TM-07** See that a colleague just changed a line I'm editing, and confirm again, so that nobody's change is silently overwritten.
*S1, S3 · D27*
- The second editor sees "Changed by [person] just now" with the new value, and confirms or redoes their change.

### Add-on

| ID | Story | Basis |
|---|---|---|
| TM-A1 | Sign in with my own login and invite colleagues so that each person has secure access of their own | D27 |
| TM-A2 | Give each outlet its own spend cap so that the bar's budget is separate from the restaurant's | D27, D19 |
| TM-A3 | Require two approvers above a set amount so that large orders need both financial controllers to sign | D27 |
| TM-A4 | Split an event's cost by outlet afterwards so that each outlet sees what it spent | D27 |

---

## Shared foundations

Core rules shared by every scene, followed by add-ons for the teams that run the app.

**SF-01** Run all four scenes on one simulated clock so that cut-offs and fixtures always agree.
*P0 · D8*

**SF-02** Label every fixture as a fixture so that judges never mistake demo data for real data.
*P0 · AGENTS.md*
- Covers the event (500 guests with diet counts), the hotel's mandate and the stock used for the final check, in the UI and the audit.

**SF-03** Write each hard rule as code with a stable ID so that every decision can cite the rule behind it.
*P0 · D12*
- About 30 rules from [human-approval-rules.md](human-approval-rules.md), each with an outcome (order, ask, block), a message template and a test.

**SF-06** Rank candidates good-better-best in one fixed order so that the same request always gives the same pick and the pick can be explained.
*P0 · BRIEF response logic*
- Only candidates that pass every hard rule are ranked. Then, in order:
  1. real stock figure over unknown stock (D31);
  2. recipe-approved or brand-matching over not;
  3. higher delivery reliability (unknown sorts below known-good, above known-poor);
  4. lower total price per kg or L after pack rounding (D25);
  5. labels, origin and carbon, as the hotel's preferences weigh them (PF-02).
- Ties keep a stable order (product ID), so the same input always gives the same result.
- The audit shows which step decided the pick.

**SF-07** Use real stock straight away when the delivery date is inside the lead time so that urgent requests are checked against what can actually ship.
*P0 · BRIEF "last-minute event", research/06*
- If the needed date is within the lead time (next day to ~4 days, or the product's own cut-off), the request skips the stock-blind viability step and is checked like a final check (S4) at once.
- This is what the milk case ("by Monday") needs: its answer depends on real stock today.

**SF-04** Evaluate hotel policy as data so that each hotel's rules change without code.
*P1 · D12*
- CEL if wired within the hour, plain JSON otherwise.

**SF-05** Log every model judgement with its confidence so that guesses are never disguised as rules.
*P1 · D12*
- Each Decisions API answer used in a decision is logged with its question, probability and threshold, separately from rule IDs.

### Add-on

These stories support the shared web, mobile, and gateway stack. [TechStack.md](../TechStack.md)

| ID | Story | Basis |
|---|---|---|
| SF-A1 | See where requests stall and how long approvals take so that I can make the order flow easier to use | PostHog, D14 |
| SF-A2 | Turn on an optional feature for one hotel at a time so that I can test it before a wider rollout | PostHog, D3 |
| SF-A3 | See errors from the web app, mobile app, and gateway so that I can fix failures that stop requests or approvals | Sentry |

**SF-A1** See where requests stall and how long approvals take so that I can make the order flow easier to use.
*Product team · [PostHog](../TechStack.md#posthog)*
- Track request submissions, quotes, approval requests and answers, and orders in PostHog. A retry counts once for each saved approval or order outcome. Keep request text, order contents, and guest details out of analytics.
- Use flag variants to test changes such as approval card wording. Use masked replay only for approved test sessions.

**SF-A2** Turn on an optional feature for one hotel at a time so that I can test it before a wider rollout.
*Product team · [PostHog](../TechStack.md#posthog)*
- PostHog flags can turn an optional feature on or off for a hotel. The gateway checks the flag for API actions. If the flag is unavailable, the feature stays off. Hotel policy and approval rules apply in every case.

**SF-A3** See errors from the web app, mobile app, and gateway so that I can fix failures that stop requests or approvals.
*Support team · [TechStack.md](../TechStack.md#devbox-and-release-flow)*
- Sentry shows which app or service failed, the environment, and the release. A test error from each surface includes a readable stack trace. Reports omit credentials, request bodies, and guest data.
