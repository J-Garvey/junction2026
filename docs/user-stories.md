# User stories

> **What this is:** the story backlog the PRD agent builds from, grouped by avatar and sorted by importance. Each story is one sentence, **"X so that Y"**: what the avatar does or gets, and why it matters to them. Every story names what it rests on: a team decision (**D1** to **D14**, in [prd-context.md](prd-context.md)), the brief, the data or a research file.
>
> It replaces [hotel-catering-user-stories.md](hotel-catering-user-stories.md) (US01 to US12) as the PRD's input. That file is kept as history. Since then (14 Nov): the multi-channel demo (SMS, phone, email) is **cut**; the supermarket top-up is a **non-core add-on**; the Purchasing Manager is **kept for now as an optional role** (prd-context D1, D2, revised).

## How to read it

**Avatars**

| Avatar | Who | Role in one line |
|---|---|---|
| **Chef** (CH) | Banquet or executive chef, or a bar manager | Says what the event needs; answers recipe questions; never commits money |
| **Approver** (AP) | F&B Director or finance manager: in charge of finances | Sets the hotel's rules once; signs off only what breaks them |
| **Valio Aimo** (VA) | The wholesaler, through the Agent Gateway API, plus its rep | Answers lookups and quotes, takes orders, enforces the hotel's mandate, keeps the audit log |
| **Purchasing Manager** (optional) | A separate buyer, where the hotel has one | Decides what is bought and how much, with maximum authority for now (D20). No stories yet |

The hotel acts as one entity: the product doesn't verify individual people or permissions (D17). The core is how the hotel can trust the agent to spend (D15), and most food orders are approved automatically (D16).

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
| CH-05 | Chef | P0 | See unknown stock labelled as unknown so that I never plan on food that may not exist | S1, S4, M |
| CH-06 | Chef | P0 | Judge a substitute side by side with one yes/no question so that I can decide fast whether my dish still works | S4 |
| CH-07 | Chef | P0 | Update guest and diet counts and see only what changed so that I don't redo the whole order | S3 |
| CH-08 | Chef | P0 | See the cut-off as the deadline on any final-check question so that I know how long I have to answer | S4 |
| CH-09 | Chef | P0 | Ask for a one-off in plain words so that I don't have to fill in a form | M |
| CH-10 | Chef | P1 | See why each line isn't green, with the rule behind it, so that I can fix the menu or accept the risk | S1 |
| CH-11 | Chef | P1 | Have a substitute I approved remembered for that recipe so that I'm never asked the same thing twice | S4 |
| CH-12 | Chef | P1 | Get one order line per product, with each dish's share visible, so that the order is clean but still traceable to my menu | S1, S2 |
| CH-13 | Chef | P1 | Have every line re-checked when a new allergy arrives so that nothing unsafe stays in the order | S3 |
| CH-14 | Chef | P1 | Get a one-line "covered" when the final check passes so that I know the event is safe without opening anything | S4 |
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
| AP-11 | Approver | P1 | Set soft defaults in advance so that I decide once instead of every time | S3, S4 |
| AP-12 | Approver | P1 | See how many human decisions each event took so that I can see the time saved and tune our rules | all |
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
| SF-01 | Shared | P0 | Run all four scenes on one simulated clock so that cut-offs and fixtures always agree | all |
| SF-02 | Shared | P0 | Label every fixture as a fixture so that judges never mistake demo data for real data | all |
| SF-03 | Shared | P0 | Write each hard rule as code with a stable ID so that every decision can cite the rule behind it | all |
| SF-04 | Shared | P1 | Evaluate hotel policy as data so that each hotel's rules change without code | all |
| SF-05 | Shared | P1 | Log every model judgement with its confidence so that guesses are never disguised as rules | S1, M |

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
*S1, S2 · research/06, GROUND_TRUTH 4.4*
- Uses the availability API's `salesUnit`, not the catalogue's.
- Litres or kg per pack come from `catalogPrice / comparisonPrice` when the API gives it; otherwise from the formula, and the line goes amber.
- Rounds up to whole units (1.5 needed means 2) and shows the overshoot.

**CH-05** See unknown stock labelled as unknown so that I never plan on food that may not exist.
*S1, S4, M · GROUND_TRUTH 3*
- 999999 on Terminal products and 9,999,999,999 base units (scaled) on Stock products both display as "unknown".
- At the final check, unknown stock cannot pass as covered; it becomes a block-and-ask.

**CH-06** Judge a substitute side by side with one yes/no question so that I can decide fast whether my dish still works.
*S4 · D6*
- Shows: ingredient statement, fat, protein and sugar per 100 g, claims, allergens, pack size, price per kg or L, delivery reliability.
- The question names the dish: "Will [dish] still work with this?"
- Only the chef gets this question. Any ingredient that is a different product always asks; only the same product in a different pack with identical spec does not. [approval rules]

**CH-07** Update guest and diet counts and see only what changed so that I don't redo the whole order.
*S3 · D4*
- The diff shows each line going up, down, added, dropped, or needing a substitute.
- Unchanged lines are not re-asked.
- Changes inside the mandate's tolerance go through; others become questions (AP-08).

**CH-08** See the cut-off as the deadline on any final-check question so that I know how long I have to answer.
*S4 · D8, D9*
- A shortfall leads to a substitute from Valio Aimo's range, ranked good-better-best (CH-06).
- If I don't answer by the cut-off, nothing changes: the line stays as last approved and is flagged (AP-10).

**CH-09** Ask for a one-off in plain words so that I don't have to fill in a form.
*M · D10*
- Example: "1,000 litres of lactose-free milk by Monday".
- A language model turns the text into structured lines (need, quantity and unit, date, constraints) and shows them back.
- An ambiguous request ("milk" with no type) is always a question. [approval rules]
- From there the request runs the same deterministic pipeline as a structured list.

### P1

**CH-10** See why each line isn't green, with the rule behind it, so that I can fix the menu or accept the risk.
*S1 · D12*
- Each reason cites a rule ID and the data fact, e.g. "ALG-01: contains milk (ML); the lactose-free group must avoid it".
- The explanation text is written by the language model from facts the rules produced; it adds no new facts.

**CH-11** Have a substitute I approved remembered for that recipe so that I'm never asked the same thing twice.
*S4 · D6*
- Scoped to the recipe and product pair, not to every dish.
- The audit shows "auto-approved: remembered chef approval of [date]".

**CH-12** Get one order line per product, with each dish's share visible, so that the order is clean but still traceable to my menu.
*S1, S2 · old US03*
- Combine only when product, requirements and delivery date match.

**CH-13** Have every line re-checked when a new allergy arrives so that nothing unsafe stays in the order.
*S3 · D4, approval rules*
- A line that now fails is blocked with its reason; no approval can push it through.

**CH-14** Get a one-line "covered" when the final check passes so that I know the event is safe without opening anything.
*S4 · D8*

### Add-on

| ID | Story | Basis |
|---|---|---|
| CH-A1 | Use a preset recipe library with compatibility tags so that I don't re-enter recipes for every event | D5; depends on whether My Aimo keeps customer recipes |
| CH-A2 | Give dish names only and let the agent draft recipes, marked "agent-drafted" until I confirm, so that I can check viability before writing recipes out | D5 |
| CH-A3 | Get compatibility tags suggested ahead of time so that fewer substitutes need my answer | D6 |
| CH-A4 | Subtract stock the hotel already has so that we don't buy what's already in the store room | old US02; chef interview Q12 |
| CH-A5 | Set a buffer above the confirmed count, per dish, so that late extra guests don't run us short | research/07 open; chef interview Q11 |
| CH-A7 | Get a reminder, then have my named backup (e.g. sous chef) asked, so that a question never dies because I'm busy | D9 |
| CH-A8 | Fill a small gap from an external partner shop (supermarket, Valio Aimo partner or local store, e.g. small alcohol purchases), clearly labelled as externally sourced, so that a short line is still covered | D21: non-core; no per-line Valio Aimo approval; same hotel rules |

### Parked

| ID | Story | Why parked |
|---|---|---|
| CH-P1 | Handle a client's change in the last 1–3 days before the event so that very late changes are covered | Low confidence it reaches Valio Aimo [OPEN]; same mechanism as S3 (D4) |
| CH-P2 | Send requests and get updates by email, SMS or phone | Cut on 14 Nov: not enough value for the effort and the approval risk; the product aims for one decision per event, made in the app |

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
*S1–S4 · approval rules*
- Blocked: allergen or diet failure, unknown stock as confirmed, no delivery dates, price `error: true`, past cut-off.
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

**AP-11** Set soft defaults in advance so that I decide once instead of every time.
*S3, S4 · D9*
- Examples: accept a partial fill, round up within tolerance.
- Never covers hard rules.

**AP-12** See how many human decisions each event took so that I can see the time saved and tune our rules.
*all · D14*
- Each decision shows the rule that caused it.

### Add-on

| ID | Story | Basis |
|---|---|---|
| AP-A1 | Choose a detailed or a "just handle it" explanation mode so that the agent explains as much as I want | research/06 |
| AP-A2 | Set up our hotel in the app ourselves (sites, roles, per-order spend cap, approved products, tolerances) so that we can start without Valio Aimo onboarding us | D18, D19 |
| AP-A3 | See which lines are externally sourced, and from where, on my order so that I know what isn't coming from Valio Aimo | D21 |
| AP-A4 | Review an event's purchasing cost and issues afterwards so that the next event is cheaper and smoother | old US12 |
| AP-A5 | Name a backup for each role so that questions still get answered when someone is away | D9 |

### Parked

| ID | Story | Why parked |
|---|---|---|
| AP-P1 | Pick which wholesaler gets the order so that we get the best offer | Valio Aimo only; a buyer agent comparing wholesalers is the marketplace the brief rules out (D2) |

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
- Identifies the hotel only: the hotel acts as one entity, and individual people aren't verified (D17).

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

## Shared foundations

Not tied to one avatar, but every scene depends on them.

**SF-01** Run all four scenes on one simulated clock so that cut-offs and fixtures always agree.
*P0 · D8*

**SF-02** Label every fixture as a fixture so that judges never mistake demo data for real data.
*P0 · AGENTS.md*
- Covers the event (500 guests with diet counts), the hotel's mandate and the stock used for the final check, in the UI and the audit.

**SF-03** Write each hard rule as code with a stable ID so that every decision can cite the rule behind it.
*P0 · D12*
- About 30 rules from [human-approval-rules.md](human-approval-rules.md), each with an outcome (order, ask, block), a message template and a test.

**SF-04** Evaluate hotel policy as data so that each hotel's rules change without code.
*P1 · D12*
- CEL if wired within the hour, plain JSON otherwise.

**SF-05** Log every model judgement with its confidence so that guesses are never disguised as rules.
*P1 · D12*
- Each Decisions API answer used in a decision is logged with its question, probability and threshold, separately from rule IDs.
