# User stories

> **What this is:** the story backlog the PRD agent builds from, grouped by avatar and sorted by importance. Every story names what it rests on: a team decision (**D1** to **D14**, in [prd-context.md](prd-context.md)), the brief, the data or a research file.
>
> It replaces [hotel-catering-user-stories.md](hotel-catering-user-stories.md) (US01 to US12) as the PRD's input. That file is kept as history: its Purchasing Manager role, supermarket top-up and multi-channel demo were dropped or parked on 14 Nov (D1, D2).

## How to read it

**Avatars**

| Avatar | Who | Role in one line |
|---|---|---|
| **Chef** (CH) | Banquet or executive chef, or a bar manager | Says what the event needs; answers recipe questions; never commits money |
| **Approver** (AP) | F&B Director or finance manager | Sets the hotel's rules once; signs off only what breaks them |
| **Valio Aimo** (VA) | The wholesaler, through the Agent Gateway API, plus its rep | Answers lookups and quotes, takes orders, enforces the hotel's mandate, keeps the audit log |

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
| CH-01 | Chef | P0 | Enter the event as a structured list | S1 |
| CH-02 | Chef | P0 | See every line as green, amber or red | S1 |
| CH-03 | Chef | P0 | Get the right product type, not a lookalike | S1, M |
| CH-04 | Chef | P0 | Quantities in whole packs I can order | S1, S2 |
| CH-05 | Chef | P0 | Never see unknown stock called available | S1, S4, M |
| CH-06 | Chef | P0 | Judge a substitute side by side | S4 |
| CH-07 | Chef | P0 | Update guest and diet counts and see the diff | S3 |
| CH-08 | Chef | P0 | Answer a final-check shortfall before the cut-off | S4 |
| CH-09 | Chef | P0 | Ask in plain words | M |
| CH-10 | Chef | P1 | Know why a line isn't green | S1 |
| CH-11 | Chef | P1 | A swap I approved never asks again | S4 |
| CH-12 | Chef | P1 | One line per product, with each dish's share visible | S1, S2 |
| CH-13 | Chef | P1 | A new allergy re-checks every line | S3 |
| CH-14 | Chef | P1 | Hear "covered" when the final check passes | S4 |
| AP-01 | Approver | P0 | Orders inside my rules go through without me | S2 |
| AP-02 | Approver | P0 | One question, with the exact rule that tripped | S2, S3, M |
| AP-03 | Approver | P0 | Approve a partial fill | M, S4 |
| AP-04 | Approver | P0 | No approve button on blocked lines | S1–S4 |
| AP-05 | Approver | P0 | Read the audit log | all |
| AP-06 | Approver | P0 | The hotel's rules exist as a mandate | all |
| AP-07 | Approver | P1 | My approval dies if the quote changes | S2 |
| AP-08 | Approver | P1 | Small changes at the 2–3-week point don't reach me | S3 |
| AP-09 | Approver | P1 | Money questions reach me only after the chef says yes | S4 |
| AP-10 | Approver | P1 | Unanswered lines are flagged to me and to Valio Aimo | S4 |
| AP-11 | Approver | P1 | Defaults I set in advance answer for me | S3, S4 |
| AP-12 | Approver | P1 | See how many human decisions an event took | all |
| VA-01 | Valio Aimo | P0 | Search the catalogue by claim and allergen | S1, M |
| VA-02 | Valio Aimo | P0 | Quote: a dated snapshot of price, stock and cut-off | S1, S2, S4 |
| VA-03 | Valio Aimo | P0 | Order from a quote at its fixed price | S2 |
| VA-04 | Valio Aimo | P0 | Refuse orders that break the hotel's mandate | S2 |
| VA-05 | Valio Aimo | P0 | Refuse lines past their cut-off | S2, S4 |
| VA-06 | Valio Aimo | P0 | One audit log both sides read | all |
| VA-07 | Valio Aimo | P0 | A published OpenAPI 3.1 spec | all |
| VA-08 | Valio Aimo | P1 | Recheck the quote at commit | S2 |
| VA-09 | Valio Aimo | P1 | Amend an order until its cut-off | S3, S4 |
| VA-10 | Valio Aimo | P1 | The same order sent twice is one order | S2 |
| VA-11 | Valio Aimo | P1 | Every call says whom the agent acts for | all |
| VA-12 | Valio Aimo | P1 | The rep sees unresolved-at-cut-off flags | S4 |
| VA-13 | Valio Aimo | P1 | Ask the mock only what a request needs | all |
| SF-01 | Shared | P0 | One simulated clock for all four scenes | all |
| SF-02 | Shared | P0 | Labelled fixtures | all |
| SF-03 | Shared | P0 | Hard rules as code with stable IDs | all |
| SF-04 | Shared | P1 | Hotel policy evaluated as data | all |
| SF-05 | Shared | P1 | Model judgements logged with their confidence | S1, M |

Add-ons and parked stories are listed at the end of each avatar's section.

---

## Chef

### P0

**CH-01 Enter the event as a structured list** · S1 · D5
As a chef, I want to enter the dishes, per-portion ingredients, guest count, diet counts and service date for an event, so the agent works from exactly what I planned.
- Each ingredient line keeps its dish and its diet group (e.g. "lactose-free, 40 guests").
- Diet counts that don't fit inside the guest total are refused with a question; the agent never guesses which guest a gap belongs to. [approval rules]
- A missing guest count, date or quantity leaves that part open and asks for it.

**CH-02 See every line as green, amber or red** · S1 · D7
As a chef, months before the event, I want each line marked green, amber or red, so I know whether I can realistically make the menu from Valio Aimo goods.
- **Green:** in the catalogue, deliverable (non-empty `scheduleLines`), passes the event's diet and allergen rules by claim, priced, pack size verified against the price API.
- **Amber:** delivery reliability unknown or below 0.95, pack size guessed from the name, or only a substitute matches.
- **Red:** nothing passes the diet rules, or nothing is deliverable.
- Stock is never part of the verdict here. It is shown as information, labelled "today's stock, not a promise for your date".

**CH-03 Get the right product type, not a lookalike** · S1, M · D12
As a chef, when I ask for plain milk, I want plain drinking milk, not a coffee milk or piimä from the same category, so I don't have to correct the basket.
- Diet requirements are matched on claims such as `FREE_FROM_LACTOSE`, never on the product name. [GROUND_TRUTH 4.3]
- Where claims can't tell types apart (category 10400 mixes plain milk, coffee milk and piimä), the agent asks the Decisions API a yes/no question per candidate ("Is this plain drinking milk?").
- Below the confidence threshold, the line becomes a question to the chef, not a pick.

**CH-04 Quantities in whole packs I can order** · S1, S2 · research/06, GROUND_TRUTH 4.4
As a chef, I want my per-portion amounts turned into whole sales units, so the order is something Valio Aimo can actually pick.
- Uses the availability API's `salesUnit`, not the catalogue's.
- Litres or kg per pack come from `catalogPrice / comparisonPrice` when the API gives it; otherwise from the formula, and the line goes amber.
- Rounds up to whole units (1.5 needed means 2) and shows the overshoot.

**CH-05 Never see unknown stock called available** · S1, S4, M · GROUND_TRUTH 3
As a chef, I want unknown stock shown as unknown, so I never plan on food that may not exist.
- 999999 on Terminal products and 9,999,999,999 base units (scaled) on Stock products both display as "unknown".
- At the final check, unknown stock cannot pass as covered; it becomes a block-and-ask.

**CH-06 Judge a substitute side by side** · S4 · D6
As a chef, I want to see the original and the substitute side by side and answer one yes/no question, so I can decide fast whether my dish still works.
- Shows: ingredient statement, fat, protein and sugar per 100 g, claims, allergens, pack size, price per kg or L, delivery reliability.
- The question names the dish: "Will [dish] still work with this?"
- Only the chef gets this question. Any ingredient that is a different product always asks; only the same product in a different pack with identical spec does not. [approval rules]

**CH-07 Update guest and diet counts and see the diff** · S3 · D4
As a chef, about 2–3 weeks out, I want to enter the new guest count and diet counts and see exactly what changes in the order, so I don't redo the whole thing.
- The diff shows each line going up, down, added, dropped, or needing a substitute.
- Unchanged lines are not re-asked.
- Changes inside the mandate's tolerance go through; others become questions (AP-08).

**CH-08 Answer a final-check shortfall before the cut-off** · S4 · D8, D9
As a chef, when the final check finds a line short, I want the question to show the cut-off as its deadline, so I know how long I have.
- Shortfall leads to a substitute from Valio Aimo's range, ranked good-better-best (CH-06).
- If I don't answer by the cut-off, nothing changes: the line stays as last approved and is flagged (AP-10).

**CH-09 Ask in plain words** · M · D10
As a chef, I want to type a request like "1,000 litres of lactose-free milk by Monday", so I can ask for a one-off without filling in a form.
- A language model turns the text into structured lines (need, quantity and unit, date, constraints) and shows them back.
- An ambiguous request ("milk" with no type) is always a question. [approval rules]
- From there the request runs the same deterministic pipeline as a structured list.

### P1

**CH-10 Know why a line isn't green** · S1 · D12
As a chef, I want each amber or red line to say why in one sentence, with the rule behind it, so I can fix the menu or accept the risk.
- Each reason cites a rule ID and the data fact, e.g. "ALG-01: contains milk (ML); the lactose-free group must avoid it".
- The explanation text is written by the language model from facts the rules produced; it adds no new facts.

**CH-11 A swap I approved never asks again** · S4 · D6
As a chef, I want my yes to a substitute remembered for that recipe and product pair, so I'm never asked the same thing twice.
- Scoped to the recipe, not to every dish.
- The audit shows "auto-approved: remembered chef approval of [date]".

**CH-12 One line per product, with each dish's share visible** · S1, S2 · old US03
As a chef, I want the same product used across dishes combined into one order line, so the order is clean, while still seeing how much each dish needs.
- Combine only when product, requirements and delivery date match.

**CH-13 A new allergy re-checks every line** · S3 · D4, approval rules
As a chef, when a new allergy or diet arrives at the 2–3-week point, I want every affected line re-checked, so nothing unsafe stays in the order.
- A line that now fails is blocked with its reason; no approval can push it through.

**CH-14 Hear "covered" when the final check passes** · S4 · D8
As a chef, I want a one-line confirmation when the final check passes, so I know the event is covered without opening anything.

### Add-on

| ID | Story | Basis |
|---|---|---|
| CH-A1 | Use a preset recipe library with items tagged for compatibility | D5; depends on whether My Aimo keeps customer recipes |
| CH-A2 | Give dish names only; the agent drafts recipes, marked "agent-drafted" until I confirm | D5 |
| CH-A3 | Get compatibility tags suggested ahead of time, not only learned from approvals | D6 |
| CH-A4 | Subtract stock the hotel already has from what to buy | old US02; chef interview Q12 |
| CH-A5 | Set a buffer above the confirmed count, per dish | research/07 open; chef interview Q11 |
| CH-A6 | Send requests and get updates by email, SMS or phone | ICP.md |
| CH-A7 | If I don't answer, get a reminder, then my named backup (e.g. sous chef) gets the question | D9 |

### Parked

| ID | Story | Why parked |
|---|---|---|
| CH-P1 | Handle a client's change in the last 1–3 days before the event | Low confidence it reaches Valio Aimo [OPEN]; same mechanism as S3 (D4) |
| CH-P2 | Fill a small gap from a supermarket that ships to the venue | No supermarket data; spend leaves Valio Aimo (D2) |

---

## Approver

### P0

**AP-01 Orders inside my rules go through without me** · S2 · D1
As an approver, I want orders that pass every rule in our mandate placed without asking me, so I only spend time on exceptions.
- I get a receipt: items, quantities, total ex VAT and VAT, delivery date, the rules checked.
- A hotel that wants to approve everything sets its spend cap to zero; that is a normal mandate, not a special mode. [research/08]

**AP-02 One question, with the exact rule that tripped** · S2, S3, M · D1, D14
As an approver, when something breaks our rules, I want one question showing which rule, the basket, the total and the delivery terms, so I can answer in seconds.
- One question per decision, not one per line.
- The question cites the rule ID(s) and states the fact behind each.
- Answers: approve or reject.

**AP-03 Approve a partial fill** · M, S4 · D10, GROUND_TRUTH 4.3
As an approver, when no single product covers the need, I want to approve a fill split across several products and see what remains unknown, so the order still goes in.
- For the milk case: the products with real stock figures, their litres and total, and the rest named "unknown stock".

**AP-04 No approve button on blocked lines** · S1–S4 · approval rules
As an approver, I want blocked lines to offer no approve option, with what would unblock them, so I can't accidentally waive a diet rule or confirm unknown stock.
- Blocked: allergen or diet failure, unknown stock as confirmed, no delivery dates, price `error: true`, past cut-off.

**AP-05 Read the audit log** · all · BRIEF, D12
As an approver, I want a readable log of everything the agent did and why, so I can trust it and show my director.
- Each entry: time, actor (agent or a named human, acting for which hotel), action, rule IDs fired, model judgements with confidence, before and after.
- Filter by event.

**AP-06 The hotel's rules exist as a mandate** · all · D11
As an approver, I want our rules held as one mandate (sites, roles, spend cap, approved products, tolerances, "very large order" threshold, soft defaults), so the agent and Valio Aimo enforce the same thing.
- For Junction the mandate may be a read-only fixture; editing it is the PRD's call.
- The mandate is registered with the gateway (VA-04), not only kept by the agent.

### P1

**AP-07 My approval dies if the quote changes** · S2 · D11, AGENTS.md
As an approver, I want my approval tied to the exact items, quantities, total and delivery terms, so it can't be reused for a different order.
- If anything changes at commit, the approval is void and I'm asked again with the diff.

**AP-08 Small changes at the 2–3-week point don't reach me** · S3 · D4
As an approver, I want guest-count changes within our tolerance applied without me, so the clarification call disappears for normal changes.
- Outside tolerance: one question showing the diff.

**AP-09 Money questions reach me only after the chef says yes** · S4 · D6
As an approver, I want a substitute that is both a recipe change and a money or policy issue (price jump, off our list) to come to me only after the chef has said yes, so I never approve something the chef would reject.

**AP-10 Unanswered lines are flagged to me and to Valio Aimo** · S4 · D9
As an approver, I want lines still unanswered at the cut-off flagged to me and to our Valio Aimo rep, with the order left as last approved, so both sides know before picking.

**AP-11 Defaults I set in advance answer for me** · S3, S4 · D9
As an approver, I want soft defaults in the mandate (accept a partial fill, round up within tolerance) to answer instead of asking, so I decide once.
- Never covers hard rules.

**AP-12 See how many human decisions an event took** · all · D14
As an approver, I want each event to show how many human decisions it took and which rule caused each, so I can see the time saved and tune our rules.

### Add-on

| ID | Story | Basis |
|---|---|---|
| AP-A1 | Choose a detailed, transparent mode or a "just handle it" mode for explanations | research/06 |
| AP-A2 | Edit the mandate in the product rather than as a fixture | D11 |
| AP-A3 | See a partner-sourcing request's status ("awaiting Valio Aimo") on my order | D2, D3 |
| AP-A4 | Review an event's purchasing cost and issues after it ran | old US12 |
| AP-A5 | Name backups for each role for the reminder ladder | D9 |

### Parked

| ID | Story | Why parked |
|---|---|---|
| AP-P1 | Pick which wholesaler gets the order | Valio Aimo only; a buyer agent comparing wholesalers is the marketplace the brief rules out (D2) |

---

## Valio Aimo (Agent Gateway API)

### P0

**VA-01 Search the catalogue by claim and allergen** · S1, M · BRIEF core 1
As Valio Aimo, I want external agents to search my catalogue by text, category, GS1 claim and GS1 allergen code and get structured product data back, so they find products without scraping my webshop.
- Codes are returned exactly as in the data (GS1); no allergen declaration means "unknown", never "free from". [GROUND_TRUTH 4.2]

**VA-02 Quote: a dated snapshot of price, stock and cut-off** · S1, S2, S4 · BRIEF core 1–2, D11
As Valio Aimo, I want to answer a price-and-availability request with a quote, so the agent commits to something fixed rather than something it re-reads.
- Per line: `catalogPrice` per sales unit ex VAT, VAT rate, `validTo`, available quantity or "unknown", available date, `closingTime`, logistic model.
- Empty `scheduleLines` is "not deliverable"; price `error: true` is "no price".
- The quote has an ID and expires at its earliest cut-off.

**VA-03 Order from a quote at its fixed price** · S2 · BRIEF core 2
As Valio Aimo, I want orders created only from a quote, at the quote's fixed prices, so there is never a negotiated or drifting price.

**VA-04 Refuse orders that break the hotel's mandate** · S2 · D11
As Valio Aimo, I want to refuse an order that breaks the hotel's registered mandate unless it carries an approval bound to that exact quote, so I don't have to trust the agent's code.
- Mandates and approvals follow AP2's mandate shape; no payments.
- The refusal says which mandate rule failed.

**VA-05 Refuse lines past their cut-off** · S2, S4 · GROUND_TRUTH 3
As Valio Aimo, I want to refuse any line whose `closingTime` has passed, even when the mock still shows a Monday delivery, so no one is promised a delivery I can't make.

**VA-06 One audit log both sides read** · all · BRIEF
As Valio Aimo, I want one audit log that both the hotel and I can read, so a disputed order is settled from one record.

**VA-07 A published OpenAPI 3.1 spec** · all · BRIEF openness, D11
As Valio Aimo, I want the gateway documented in OpenAPI 3.1, with the mock's quirks stated as assumptions, so any agent can integrate and judges can see what we assumed.

### P1

**VA-08 Recheck the quote at commit** · S2 · AGENTS.md
As Valio Aimo, I want price, availability and cut-off rechecked when an order is committed, and the order refused with the diff if anything moved, so I never accept an order on stale terms.

**VA-09 Amend an order until its cut-off** · S3, S4 · research/06, D4
As Valio Aimo, I want agents to amend a placed order before each line's cut-off, and to be refused after it, so changes follow my real rules.

**VA-10 The same order sent twice is one order** · S2 · approval rules
As Valio Aimo, I want an idempotency key on every order so a retry creates one order, not two.

**VA-11 Every call says whom the agent acts for** · all · D11, GROUND_TRUTH 7
As Valio Aimo, I want every call to name the hotel, site and role it acts for, so I can check it against the mandate.
- A header for Junction; OAuth 2.0 Token Exchange (`act` claim) named as the production path.

**VA-12 The rep sees unresolved-at-cut-off flags** · S4 · D9
As a Valio Aimo rep, I want lines left unresolved at the cut-off to reach me, so I can call the hotel before picking.
- For Junction, an audit entry tagged "to Valio Aimo" is enough; a rep screen is an add-on.

**VA-13 Ask the mock only what a request needs** · all · SPEC
As Valio Aimo, I want the gateway to shortlist from local data and call my lookup API in batches of at most 1,000 IDs, so agents don't hammer my rate limits.

### Add-on

| ID | Story | Basis |
|---|---|---|
| VA-A1 | Receive and approve or decline a partner-sourcing request for a very large order | D2, D3 |
| VA-A2 | A rep screen for flags and sourcing requests | D9 |
| VA-A3 | Carbon footprint range per line in the quote (product-group averages, labelled as such) | BRIEF optional |
| VA-A4 | Suggest a seasonal or new product to the buyer's agent | BRIEF scenario |
| VA-A5 | Export orders as Peppol BIS Ordering 3.3 | D11 |
| VA-A6 | Sign product claims as verifiable credentials | D11 |

### Parked

| ID | Story | Why parked |
|---|---|---|
| VA-P1 | An MCP interface to the gateway | The brief calls MCP-style interfaces out of scope |
| VA-P2 | Payments through the agent | B2B is invoiced on account; not in the brief (D11) |

---

## Shared foundations

Not tied to one avatar, but every scene depends on them.

**SF-01 One simulated clock for all four scenes** · P0 · D8
All four scenes run on one clock the demo can move, and every fixture's cut-offs agree with it.

**SF-02 Labelled fixtures** · P0 · AGENTS.md
The event (500 guests with diet counts), the hotel's mandate and the stock used for the final check are fixtures, labelled as fixtures in the UI and the audit.

**SF-03 Hard rules as code with stable IDs** · P0 · D12
About 30 rules from [human-approval-rules.md](human-approval-rules.md), each a function with an ID, an outcome (order, ask, block) and a message template, each with a test.

**SF-04 Hotel policy evaluated as data** · P1 · D12
Mandate rules evaluated with CEL if wired within the hour, plain JSON otherwise.

**SF-05 Model judgements logged with their confidence** · P1 · D12
Every Decisions API answer used in a decision is logged with its question, probability and threshold, separately from rule IDs.
