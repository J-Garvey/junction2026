# Chunk 05: Rules, mandate and preferences

| | |
|---|---|
| **Owner** | _unassigned_ |
| **Track** | B: trust core |
| **Needs from** | Nothing. Other chunks call these rules. |
| **Feeds** | Every chunk. 06 turns rule outcomes into questions; 08 enforces the mandate. |

D15 names this the core of the product: how a hotel can trust an agent to spend money.

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| SF-03 | P0 | Write each hard rule as code with a stable ID so that every decision can cite the rule behind it |
| SF-04 | P1 | Evaluate hotel policy as data so that each hotel's rules change without code |
| AP-04 | P0 | See no approve option on blocked lines so that I can't accidentally waive a diet rule or confirm unknown stock |
| AP-06 | P0 | Hold our rules as one mandate so that the agent and Valio Aimo enforce the same thing |
| AP-11 | P1 | Pre-answer the questions I'd always answer the same way (e.g. "accept a partial fill up to 10% short") so that I decide once instead of every time |
| PF-02 | P1 | Set standing preferences once in the hotel profile so that every order follows them without asking |
| PF-03 | P1 | Override any profile setting for one event or one request so that an unusual event doesn't mean changing the profile |
| PF-04 | P1 | Change a profile setting for all products from the main settings so that one change applies everywhere |
| PF-05 | P1 | Give allergies and diets per event by default, with standing ones allowed, so that one event's guests never constrain another's |

## How: what's already settled

- **Three layers, kept apart** [D24]:

| Layer | Example | Set by | Enforced by | Can a human override it? |
|---|---|---|---|---|
| Hard rules | Allergens, stated diets, past cut-off | Built in | Agent and gateway | No |
| Mandate | Spend cap, approved products, sites | Approver | Gateway | Only with an approval bound to the quote |
| Preferences | Brand, origin, price vs reliability, pre-answers | Chef or Approver | Hotel agent | Yes, per event or request |

- **Hard rules are code with stable IDs.** About 30 are already written in [human-approval-rules.md](../human-approval-rules.md). Each has an outcome (order, ask, block), a message template and a test. [D12]
- **Blocked lines have no approve option.** Blocked means: allergen or diet failure, no delivery dates, no price, past cut-off. Unknown stock is not blocked; it is a risk the Approver can accept. [D23]
- **The mandate is one object**, registered with the gateway, which refuses orders that break it. [D11]
- **Spend caps are per order.** [D19]
- **For Junction the mandate and profile are pre-filled.** Setup screens are non-core. [D18]
- **Pre-answers** are standing replies to questions the Approver would always answer the same way. They never cover hard rules. [D9, AP-11]
- **Every profile setting can be overridden for one event or request**, and changed for everything from the main settings. Allergies and diets are per event by default. [D24]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `RULE-EVALUATE` | Deterministic code | A line or an order, with its facts | Every rule that fired: ID, outcome, the fact it tested | Run every hard rule. Each rule is a pure function with its own test. | Q05.1 |
| `OUTCOME-RESOLVE` | Deterministic code | The fired rules | One outcome per line and one per order | Block beats ask-the-chef, which beats ask-the-approver, which beats order. Keep every fired rule. | Q05.2, Q05.3 |
| `MANDATE-CHECK` | Deterministic code | An order draft, the mandate | Pass, or the mandate rule broken and the approval needed | The same code runs in the agent, to predict, and in the gateway, to enforce. | Q05.4, Q05.5 |
| `PREANSWER-MATCH` | Deterministic code | A question's type and facts, the pre-answers | The pre-answer that applies, or none | Never match a hard-rule question. | Q05.6 |
| `PREFERENCE-RESOLVE` | Deterministic code | Request, event, outlet and hotel settings | The effective preferences, each with where it came from | The most specific level wins. Standing allergies are added, never removed. | Q05.7, Q05.9 |
| `SETTING-RECHECK` | Deterministic code | A changed setting | Open orders whose pick would now differ | Never change a placed order. Raise a question. | Q05.8 |

## Questions to answer

**Q05.1 What is the rule ID scheme, and who turns the written rules into the catalogue?**
- Recommended: prefixes by area: `ALG` allergens, `DIET`, `STK` stock, `DLV` delivery, `CUT` cut-off, `QTY`, `PRC` price, `SUB` substitutes, `REQ` request, `MAN` mandate. This chunk's owner converts human-approval-rules.md into one table: ID, trigger, outcome, who is asked, message template.
- **Answer:** _open_

**Q05.2 When several rules fire on one line, which outcome wins?**
- Recommended: block beats ask-the-chef, which beats ask-the-approver, which beats order. All fired rules are still shown and logged, not only the winner.
- **Answer:** _open_

**Q05.3 Can an order go in while one of its lines is blocked?**
- Recommended: no. A blocked line has to be changed or removed by the chef first. The other lines wait. This keeps "what was ordered" identical to "what the event needs".
- **Answer:** **Agreed** (Jack, team review 14 Nov): no. The chef fixes or removes the line first.

**Q05.4 What fields does the mandate have, and what are the seed values?**
- Recommended fields, with seed values to be confirmed:
  - delivery sites and outlets;
  - people, with role and outlets (chunk 06);
  - spend cap per order, ex VAT: €5,000;
  - product scope: any Valio Aimo product that passes the rules, with an optional block list;
  - agreed delivery days (chunk 04);
  - tolerances: guest-count change ±5%, price rise 5%, overshoot 10% and €25;
  - the "very large order" threshold;
  - pre-answers.
- **Answer:** **Fields agreed in outline** (Jack, team review 14 Nov). The values are placeholders. The complete list of rules and parameters is Q05.10.

**Q05.5 Is hotel policy evaluated with CEL or plain JSON thresholds?**
- Recommended: plain JSON thresholds, checked in TypeScript, for Junction. CEL is named in the docs as the production path. I haven't verified a CEL library for Node, so treat CEL tonight as a risk, not a plan.
- **Answer:** _open_

**Q05.6 Which question types can have a pre-answer?**
- Recommended: partial fill up to x% short; overshoot from rounding; price rise up to x%; unknown stock on products under €y per line; guest-count change up to x%. Never: recipe fit of a substitute, anything allergen or diet related, a past cut-off.
- **Answer:** _open_

**Q05.7 Which preferences exist in core, and which level wins when they disagree?**
- Recommended preferences: preferred brands, origin, labels, and one price-versus-reliability setting. Carbon is an add-on. The most specific level wins: request, then event, then outlet, then hotel profile.
- **Answer:** _open_

**Q05.8 What happens to placed orders when a profile setting changes?** (PF-04)
- Recommended: orders not yet past their cut-off are re-checked. A re-check never changes a placed order by itself. If the pick would now be different, it raises a question.
- **Answer:** _open_

**Q05.9 How do a standing allergy and an event allergy combine?** (PF-05)
- Recommended: the event gets both. Standing constraints can't be removed for one event, only added to.
- **Answer:** _open_

**Q05.10 What is the complete list of rules and parameters?** Raised in the team review: the values so far are placeholders, and nobody has one list of everything that can be set.
- This question is for the owner to complete, not just to agree. It needs two lists:
  1. **Every rule**, from Q05.1: ID, trigger, outcome, who is asked.
  2. **Every parameter**: its value, who can change it (the hotel, or fixed in the product), and which function reads it.
- Starting list of parameters, gathered from the recommendations in all eleven chunks. None of these values is agreed unless marked:

| Parameter | Proposed value | Who sets it | Read by | From |
|---|---|---|---|---|
| Spend cap per order, before VAT | €5,000 | Hotel | `MANDATE-CHECK` | Q05.4 |
| Guest-count change that needs no question | ±5% | Hotel | `CHANGE-APPLY` | Q07.1 |
| Price rise that needs no question | 5% | Hotel | `QUOTE-RECHECK` | Q05.4 |
| Rounding overshoot that needs no question | Up to 10% or up to €25 | Hotel | `OVERSHOOT-CHECK` | Q03.2 |
| Partial fill accepted without asking | Not set | Hotel | `PREANSWER-MATCH` | Q05.6 |
| Unknown stock accepted without asking | Not set | Hotel | `PREANSWER-MATCH` | Q05.6 |
| "Very large order" threshold | Not set | Hotel | Add-on only | D2 |
| Agreed delivery days | Monday to Friday | Hotel | `NEEDED-BY` | Q04.4 |
| Days before service that goods must arrive | 1 day; 2 days for frozen | Hotel or recipe | `NEEDED-BY` | Q04.3 |
| Decisions API: confidence that counts as a fact | 0.90 or above | Fixed | `TYPE-CHECK` and the other Decisions API functions | Q02.2, agreed |
| Decisions API: confidence that rejects | 0.10 or below | Fixed | Same | Q02.2, agreed |
| Delivery reliability below which a line is amber | 0.95 | Fixed | `LINE-VERDICT` | D7 |
| Delivery reliability below which ordering asks | 0.80 | Fixed | `LINE-VERDICT` | Q04.5 |
| Days to needed-by that make a request urgent | 4 or fewer | Fixed | `URGENCY-CHECK` | Q04.1 |
| How long before a cut-off the final check runs | 24 hours | Fixed | `FINAL-CHECK` | Q07.2 |
| How long a quote is valid | Until its earliest cut-off, at most 24 hours | Fixed | `QUOTE-CREATE` | Q08.3 |
| Candidates kept by a search | 50 | Fixed | `PRODUCT-SEARCH` | Q02.1 |
| Candidates shown to a person | 3 | Fixed | `RANK`, `SUBSTITUTE-FIND` | Q02.6, Q07.3 |
| Product IDs per lookup call | 1,000 (the API's limit) | Fixed by Valio Aimo | `LOOKUP` | SPEC |
| Pack-content disagreement that turns a line amber | More than 5% | Fixed | `PACK-CONTENT` | Chunk 03 |
| Per-guest amount that triggers a sanity question | Above 1 kg or 1 L; below 1 g or 1 ml | Fixed | `QUANTITY-SANITY` | Q01.7 |

- To settle for each row: is the value right, and should the hotel be able to change it?
- To add: any parameter this list has missed. If a function uses a number that isn't in this table, the table is incomplete.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The order total equals the spend cap exactly | Passes; the cap is "up to and including" | _open_ |
| The spend cap is 0 | Every order asks the Approver; this is a valid mandate, not a special mode | _open_ |
| Is the cap compared with or without VAT? | Without VAT, matching the API's prices | _open_ |
| An amendment pushes a placed order over the cap | The amendment needs an approval; the original order stands meanwhile | _open_ |
| Two preferences conflict (Finnish origin and a brand that isn't Finnish) | A required one beats a preferred one; two required ones that can't both be met ask | _open_ |
| A pre-answer and a hard rule both apply | The hard rule wins | _open_ |

## Done when

- Every rule in human-approval-rules.md has an ID, an outcome and a test.
- A line with an allergen failure shows its rule ID and offers no approve button anywhere.
- An order €1 over the cap is refused by the gateway, not only by the agent.
- Changing one preference for one event changes that event's picks and nothing else.
