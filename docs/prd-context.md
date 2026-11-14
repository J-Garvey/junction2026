# PRD context: decisions the PRD builds on

> **What this is:** the agreed context base for the agent that writes the PRD. It records the decisions made in a grilling session with Jack on 14 Nov 2026 (D1 to D14), Darragh's follow-up decisions (D15 to D22) and Jack's review of the stories (D23 to D26), what each rests on, and what is still open. The user stories built on it are in [user-stories.md](user-stories.md).
>
> **How to read the tags:** **[TEAM Dn]** a decision from this session; **[BRIEF]**, **[API]**, **[SPEC]**, **[DATA]**, **[SRC]**, **[STAND]**, **[INF]**, **[OPEN]** mean what they mean in [GROUND_TRUTH.md](../GROUND_TRUTH.md) and [research/07](../research/07-hotel-event-ordering-journey.md). Where this file and GROUND_TRUTH.md disagree on a fact, GROUND_TRUTH.md wins.
>
> **What the PRD decides, not this file:** screens, layouts, endpoint names and fixture details. This file fixes goals, roles, scope tiers and the rules of the operating model.

## Hard constraints

- **Final submission: Sun 15 Nov 2026, 10:00.** [SRC, GROUND_TRUTH 1]
- **Judging:** 30% end-to-end demo (request → lookup → order/approval, "not just isolated pieces"); 20% precision ("least manual correction"); 20% autonomy and controls; 15% robustness to exceptions; 15% openness. [BRIEF]
- **The brief's three core requirements:** product, price and availability lookup; inquiry to order at fixed prices; permission and human-approval management. [BRIEF]
- **The mock API only looks things up.** No order, cart, approval or audit endpoint: we build all of those. It ignores `customer` and `requestedDate`, and reports unknown stock with sentinels (999999 on Terminal; 9,999,999,999 base units on some Stock). [SPEC][API]
- **Two tiers of scope.** **Core** must be built. Everything else is an **add-on**, built only if core is done. A third list, **parked**, is out and says why. [TEAM D3]
- **Cut, 14 Nov: voice calls, SMS and WhatsApp.** They don't add enough value: the product aims for about one human decision per event, made in the app. Email updates stay a non-core add-on (CH-A6). [TEAM, Darragh]

## Goal

| Order | Goal | Measure |
|---|---|---|
| 1 | **Correct** | Zero hard-rule violations reach an order (allergen, diet, unknown stock shown as available, past cut-off). Zero changes nobody approved. Every decision traces to a rule ID or a model judgement with its confidence. Never traded for anything below. |
| 2 | Least customer time | Human decisions per event order. Ideal run: one, the Approver's yes. Every extra question must cite a rule ID. |
| 3 | Least Valio Aimo rep time | Clarification calls (the ~2–3-week call) no longer needed. |

When goals conflict: correct beats trustworthy beats fast. A fast wrong order costs the customer more time than a slower right one. [TEAM D14]

## Who uses it

| Avatar | Who in real life | Does | Can't |
|---|---|---|---|
| **Chef** | Banquet or executive chef; also a bar manager or anyone who specifies what an event needs | States needs; checks viability; answers recipe questions (will the dish still work with this substitute?) | Commit money |
| **Approver** | F&B Director, finance manager, or whoever signs orders off | Sets the hotel's rules once (the mandate); signs off only what breaks them; answers money and policy questions | Answer recipe questions; waive a diet rule; turn unknown stock into confirmed stock (they can only accept the risk, D23) |
| **Valio Aimo** | The wholesaler, reached through the Agent Gateway API; its sales rep receives flags | Serves lookups, quotes and orders; enforces the hotel's mandate itself; keeps the shared audit log | |

- **Purchasing Manager: kept for now as an optional role (revised 14 Nov, Darragh).** Whether a hotel has a separate purchaser depends on the hotel: research/07 found none in Finnish hotels, where the kitchen manager orders, but other hotels may. The hotel's own role setup decides who places orders and who approves. The approval rules stay as above: one Approver signs off what breaks the mandate. [TEAM D1, revised][SRC research/07]
- **Questions are routed by type, not by person.** Recipe fit goes to the Chef. Money and policy go to the Approver. If both, Chef first; the Approver sees it only after a Chef yes. [TEAM D6]
- **Tension to keep visible:** in the one practitioner interview, the manager reviews and approves **every** order before it is submitted ([research/08](../research/08-interview-owen-bar-events.md), drinks not hotel food, poor audio). We designed for exceptions-only approval (D1). A hotel that wants to approve everything sets its spend cap to zero; the PRD should make that a valid mandate, not a special mode. [INF]

## When the agent acts

All four moments run the same pipeline; the demo shows them as four scenes on one simulated clock. [TEAM D4, D8]

| Scene | When | Trigger | Outcome |
|---|---|---|---|
| 1. Viability | Months ahead | Chef states the menu, guest count, diet counts | Each line **green / amber / red** (below). No stock used. |
| 2. Order | Months ahead | Chef confirms | Order placed within the mandate, or one question to the Approver |
| 3. Change | ~2–3 weeks out | New guest count or diet counts | A **diff** against the placed order; changes within tolerance applied, the rest one question |
| 4. Final check | A set time (e.g. 24 h) before each line's cut-off | Automatic | Stock, delivery date, price validity and cut-off rechecked. All pass: one-line "covered". Any fail: substitute or partial-fill question with the cut-off as deadline |

- Months ahead, stock says nothing about the event date: lead times are next day to ~4 days [STAND] and the mock always answers for next Monday [API]. **Stock counts only at the final check.** Before that it is shown as information, labelled "today's stock, not a promise for your date". [TEAM D7, D8]
- **Exception: a date inside the lead time.** A request needed within the lead time (the brief's "booking for tomorrow", the milk case's "by Monday") skips the stock-blind step and is checked like a final check at once, on real stock. [BRIEF][TEAM, story SF-07]
- **Viability states:** green = in the catalogue, deliverable, passes the event's diet and allergen rules by claim, priced, pack size verified against the price API. Amber = reliability unknown or below 0.95, pack size guessed from the name, or only a substitute matches. Red = nothing passes the diet rules or nothing is deliverable. [TEAM D7]
- **Parked:** a client's change in the last 1–3 days. Low confidence it reaches Valio Aimo at all [OPEN, research/07]; it is the same mechanism under tighter deadlines. [TEAM D4]

## What the Chef gives the agent

- **Core: a structured list.** Dishes, per-portion ingredients, guest count, diet counts, service date. [TEAM D5]
- **Core: free text** for single requests such as the brief's "1,000 L of lactose-free milk by Monday". A language model turns it into the same structured lines and echoes them back. [TEAM D10]
- **Add-on: a preset recipe library** with items tagged for compatibility. Depends on a Valio Aimo answer (below). [TEAM D5]
- **Add-on: dish names only**, with the agent drafting recipes, shown as "agent-drafted" until the Chef confirms. [TEAM D5]
- The Chef is **checking whether the menu can be made from Valio Aimo goods**, not inventing it. [TEAM D5]

## Substitutes

- Valio Aimo: ingredients are not interchangeable by category; two "blue milks" can behave differently in a recipe and sugar with additives breaks bakery recipes. [STAND, research/06]
- **Any substitute ingredient that is a different product asks the Chef, always.** Only the same product in a different pack, with identical spec, needs nobody. [approval rules]
- **The Chef sees a side-by-side** of original and substitute (ingredient statement, macros per 100 g, claims, allergens, pack, price per kg or L, delivery reliability) and answers one yes/no: "Will [dish] still work with this?" [TEAM D6]
- **A yes is remembered** for that recipe and product pair, so the same swap never asks twice. This is how compatibility tags fill in. [TEAM D6]
- Ranking is good-better-best **within Valio Aimo's own assortment**, as the brief names it. [BRIEF][TEAM D2]
- **The ranking order is fixed** (story SF-06): only candidates passing every hard rule; then real stock over unknown; recipe-approved or brand match; delivery reliability; price per kg or L after rounding; then labels, origin and carbon as preferences weigh them. Ties break on product ID so the same input always gives the same pick.

## Supplier scope

- **Valio Aimo only.** Nobody picks a wholesaler. [TEAM D2]
- **Add-on: partner sourcing.** A line Valio Aimo cannot fill can go to a partner shop. **Revised by D21:** any partnered shop, no per-line Valio Aimo approval, clearly labelled as externally sourced. [TEAM D2, D3, D21]
- A **Terminal line with unknown stock is not "unfillable"**: it stays a normal question to the hotel (accept the unknown-stock risk, D23). [TEAM D2]
- **Add-on (non-core): external sourcing, such as supermarket dropshipping** (revised from parked, 14 Nov, Darragh). Fills a small gap in a large order, or a quantity below a wholesale pack, from an external source shipped to the venue. Built only after the core; offers are simulated in Junction, since no supermarket data exists. Same mandate and approval rules as any line. Risk to state: it sends spend away from Valio Aimo, the company we want to sell to. [TEAM D2, revised]

## When nobody answers

- **Silence never changes the order.** At the cut-off an unanswered line stays as last approved and is flagged "unresolved at cut-off" to **both** the Approver and the Valio Aimo rep. [TEAM D9]
- **Soft decisions can have defaults set in advance** in the mandate (accept a partial fill, round up within tolerance). That is a prior decision, not silence. [TEAM D9]
- Who can answer never widens: the Approver cannot answer a recipe question, no approval waives a diet rule, and no approval turns unknown stock into confirmed stock. [TEAM D9][approval rules]

## Unknown stock (D23, changed 14 Nov)

- **Products with unknown stock are suggested, not blocked.** They rank below any product with a real stock figure that passes the same rules, are always labelled "unknown stock", and need the **Approver to accept the risk** before they are ordered. [TEAM D23]
- Accepting the risk is not confirming the stock. The label stays everywhere; at the final check the line reads "covered at risk", never "covered". A pre-answer (AP-11) can accept it in advance. Under D16 most orders go through without a human, so a hotel that wants unknown-stock lines to go through automatically sets that pre-answer.
- **This changes an earlier rule.** [human-approval-rules.md](human-approval-rules.md) and [AGENTS.md](../AGENTS.md) treated unknown stock as a block. Both are updated to match. It matters for the milk case: 20 of the 35 lactose-free products are Terminal, so they always report unknown stock. [API, GROUND_TRUTH 4.3]

## Preferences (D24)

Three layers, kept apart [TEAM D24]:

| Layer | Example | Set by | Enforced by | Overridable? |
|---|---|---|---|---|
| Hard rules | Allergens, stated diets, past cut-off | Built in | Agent and gateway | No |
| Mandate | Spend cap, approved products, sites | Approver | Gateway | Only by an approval bound to the quote |
| Preferences | Carbon, brand, origin, price vs reliability, pre-answers | Chef or Approver | Hotel agent (ranking, when to ask) | Yes, per event or request |

- **The agent asks for missing constraints** (allergies, diets, gluten-free or not, delivery date and time) before it quotes, as one grouped question, and never assumes "none".
- **For Junction the profile can be pre-filled** (D18: setup screens are non-core).
- **Two scopes:** some preferences are naturally **profile settings** (carbon), others **per event** (allergies). **Every profile setting can also be set for one event or request, and every setting can be changed for all products from the main settings.**
- A constraint stated for an event (e.g. "lactose-free for 40") becomes a hard rule for that event; a preference only changes ranking or whether the agent asks.
- Carbon as a preference needs carbon data in the quote, which is still an add-on (product-group averages, 63% coverage). [GROUND_TRUTH 4.1]

## Rounding (D25)

Customers buy whole sales units: 1.5 needed means 2 [STAND, research/06]. The data's `allowedLotSize` 0.01 is unexplained [OPEN, mentor Q43], so it is ignored. [TEAM D25]

1. **Round the total, not each dish.** Combine the same product across dishes, then round once; per-dish rounding compounds.
2. **Round up by default; never round down automatically.** Under-ordering is a service failure, and correct comes first (D14). "Round up over 0.5" is rejected: 2.3 cases would become 2, about 13% short.
3. **Best-fitting pack first.** Among pack sizes of the same product with identical spec, pick the mix with the least overshoot. No human needed (approval rules).
4. **Overshoot tolerance is a pre-answer** (e.g. 10% or a euro amount). Within it, go ahead; above it, one Approver question: accept the overshoot, round down and accept the shortfall, or switch pack size.
5. **Round down only by a person's choice**, per order or as a pre-answer for named low-risk categories.
6. **Buffer before rounding.**
- **Add-on:** the reminder ladder (reminder halfway to cut-off, then the role's named backup). [TEAM D9]

## Interface (D26)

- **Home is the decisions list, not a chat.** It opens on the questions waiting for this person, then their events. The chat box is pinned on top for new requests. [TEAM D26]
- Why: the secondary goal is fewer human decisions (D14), so the app opens on the few that are waiting. Open-ended chat is the least precise and least auditable way to use the product. The existing mockups have a chat-first home (designs/mockups screen 01); that screen changes.
- **Type to ask, tap to decide.** Free text is an input only; every decision is a card with two or three buttons and everything needed to answer it. No free-text approvals.
- **Compact by default, checkable on tap.** Any number or verdict opens its source: rule ID, data field, or model judgement with confidence.
- **One set of status labels everywhere**, and gaps (blocked, unresolved, at risk) always shown above what's fine.
- See the [interface stories](user-stories.md#interface).

## Architecture decisions

- **Two parts with a clear boundary.** [TEAM D11]
  - **Aimo Agent Gateway** (Valio Aimo's side, the brief's actual deliverable): a REST service documented in **OpenAPI 3.1**, in front of the mock. Search; quotes (a dated snapshot of price, availability, cut-off and price validity, with an ID, expiring at the earliest cut-off); orders created from a quote with an idempotency key; amendments; approvals; one audit log both sides read.
  - **Hotel agent:** the client. Holds the soft preferences (brand, tolerances, remembered recipe approvals) and calls the gateway like any other agent would.
- **The hotel's hard limits are enforced by the gateway, not the agent.** The hotel registers a **mandate** (sites, roles, spend cap, approved products, tolerances, "very large order" threshold, soft defaults). The gateway refuses an order that breaks it unless it carries an approval bound to that exact quote (items, quantities, total, delivery terms). This is the trust protocol: Valio Aimo does not have to trust the agent's code. [TEAM D11]
- **Mandates and approvals follow AP2's mandate shape** ("AP2-style"). No payments: B2B foodservice is invoiced on account and payment is not in the brief. UCP's B2B features were not mature enough to adopt (secondary source). [TEAM D11][SRC GROUND_TRUTH 7]
- **Language model only at the edges.** In: free text to structured lines. Out: the explanation and the one question, written from facts the rules produced. It never makes a decision. [TEAM D10]
- **Everything in the middle is deterministic.** Hard rules (about 30, in [human-approval-rules.md](human-approval-rules.md)) are code with **stable rule IDs**; every decision in the audit cites the IDs that fired. Hotel policy is data, evaluated with **CEL** if wired within the hour, plain JSON otherwise; CEL is named as the production path either way. [TEAM D12]
- **Gemini Decisions API** (`gemini-decision-1`, launched 11 Nov 2026) classifies what claims can't: product type (plain drinking milk vs coffee milk in category 10400), whether a request is ambiguous, and which flow an incoming message belongs to. It returns a calibrated 0–1 confidence, not a guarantee: above a threshold it feeds the rules as a fact, below it the outcome is Ask. Logged as a model judgement with its probability, separate from rule IDs. Never used for hard rules. Core if wired within the hour, otherwise the language-model parser covers it. It is three days old and v1beta per secondary sources: name that risk. [TEAM D12][SRC [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/)]
- **Not core:** an MCP interface (the brief calls it out of scope), Peppol BIS Ordering 3.3 mapping, verifiable credentials. Each gets a path-to-production line. [BRIEF][TEAM D11]

## Test cases the PRD must cover

1. **The hotel event:** a 500-guest conference with diet counts, through all four scenes. [TEAM D4, D8]
2. **The brief's milk request:** "1,000 litres of lactose-free milk by Monday". No single lactose-free milk with a real stock figure covers it [API, GROUND_TRUTH 4.3], so the honest outcome is a partial fill across several products for the Approver to approve, plus unknown-stock products offered for the Approver to accept the risk on, labelled as unknown. [TEAM D10, D23]
3. **A blocked path:** an allergen or diet failure, or a past cut-off, that no approval can push through. [AGENTS.md]

## Decisions, 14 Nov evening (Darragh)

These answer the follow-up questions and take precedence over anything above that they contradict.

- **D15. The core is the trust algorithm.** The core feature is how a hotel can trust an AI agent to spend money: the mandate, the hard rules, auto-approval within limits, and the audit trail. Everything else is non-core unless it is needed to show that.
- **D16. The app approves most food orders by itself.** The target is a highly agentic workflow: orders inside the hotel's mandate go through without a human. Approval of every order (research/08) describes how hotels work today, not the default we design for. A hotel can still set its spend cap to zero.
- **D17. The hotel acts as one entity.** We were told to assume the hotel makes decisions as one body, so the product doesn't verify individual identities or permissions. The split of work is already agreed: the **Chef** is in charge of food, the **manager (Approver)** of finances. A detailed permission model is non-core.
- **D18. Hotels set themselves up, self-serve.** Each hotel enters its own sites, roles, spend caps, approved products and tolerances in the app; Valio Aimo doesn't onboard them. The setup screens are **non-core**; the core can run on one pre-filled hotel.
- **D19. Spend caps are per order**, for now.
- **D20. The Purchasing Manager has maximum authority** over what is bought and how much, for now. What the role may do in different situations is left open and may become a non-core refinement.
- **D21. External sourcing: any partner shop, clearly labelled.** Sources can be a supermarket, a Valio Aimo partner, or another partnered shop, including small local stores (for example small purchases of alcohol). Valio Aimo does **not** approve each externally sourced line; the line must be clearly marked as externally sourced, with its source. Still non-core (see Supplier scope). This replaces the "only with Valio Aimo's approval" condition on partner sourcing.
- **D22. Not decided yet:** how recipes are uploaded, the tech stack, and the demo. The Decisions API may still be useful for some decisions; it stays optional.

## Still open

| Item | Status | Who answers |
|---|---|---|
| **How each hotel sets itself up** | **Decided (D18, D19):** self-serve, non-core; spend caps per order | |
| Who pays: Valio Aimo, the hotel, or both | Open, **does not block the build**. The secondary goal (rep time saved) serves either answer | Team; mentor Q3 |
| Team members, skills and stack | Not decided (D22). The Decisions API stays optional. Suggested: Python/FastAPI gateway (generates OpenAPI 3.1, reuses `scripts/aimo_api.py`), SQLite, React from `designs/mockups/src` | Jack |
| Does My Aimo keep customer recipes an agent could read, with past accepted substitutes? | Decides whether the recipe library add-on is cheap | Valio Aimo stand |
| ~~Does a hotel want exceptions-only approval, or approval of every order?~~ | **Decided (D16):** the app auto-approves most food orders within the mandate | |
| How recipes get into the app (typed, uploaded, imported) | Open (D22) | Team |
| Buffer above the confirmed count; rounding vs on-hand stock; tolerance before re-ordering | Sets mandate defaults | Chef interview |
| Is a side-by-side enough for a chef to judge a substitute? | Validates D6 | Chef interview |
| What happens at Valio Aimo picking when a line is short | Decides what scene 4 replaces | Valio Aimo, stand question 14 |

## Sources outside the repo

- Google, "Gemini Decisions API: fast, calibrated multimodal decisions", 11 Nov 2026: https://blog.google/innovation-and-ai/technology/developers-tools/gemini-decisions-api/
- ai-tldr, release note (v1beta status, secondary): https://ai-tldr.dev/releases/google-gemini-decisions-api/
