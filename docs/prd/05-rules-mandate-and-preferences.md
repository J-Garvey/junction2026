# Chunk 05: Rules, mandate and preferences

| | |
|---|---|
| **Owner** | Darragh |
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
- **Blocked lines have no approve option.** Blocked means: allergen or diet failure, no delivery dates, no price, past cut-off. Unconfirmed stock is not blocked; it is a question the person building the order can continue past. [D31]
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
- **Answer:** **Answered** (Darragh, 14 Nov): agreed as recommended.

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
- **Answer:** **Answered** (Darragh, 14 Nov): agreed as recommended: plain JSON checked in TypeScript; CEL named as the production path.

**Q05.6 Which question types can have a pre-answer?**
- Recommended: partial fill up to x% short; overshoot from rounding; price rise up to x%; unknown stock on products under €y per line; guest-count change up to x%. Never: recipe fit of a substitute, anything allergen or diet related, a past cut-off.
- **Answer:** **Answered** (Darragh, 14 Nov): pre-answers come from **memory of previous orders the hotel has flagged as okay**, not only from settings. By type: **accepting a partial delivery can't be pre-answered**; extra from rounding up can; a price rise up to x% can; unknown stock on cheap lines can. Never: recipe fit, allergens or diets, a past cut-off. (Guest-count changes are covered by the tolerance in Q07.1.)

**Q05.7 Which preferences exist in core, and which level wins when they disagree?**
- Recommended preferences: preferred brands, origin, labels, and one price-versus-reliability setting. Carbon is an add-on. The most specific level wins: request, then event, then outlet, then hotel profile.
- **Answer:** **Answered** (Darragh, 14 Nov): hotels can enter **custom constraints in natural language**. The agent attempts all of them; if they can't all be met, it flags that. While flagging, the person ranks the clashing constraints, and **that ranking is stored in memory as a hierarchy**, created only when constraints clash and are flagged for the first time. The level order (request, event, outlet, hotel) is still used where it applies.

**Q05.8 What happens to placed orders when a profile setting changes?** (PF-04)
- Recommended: orders not yet past their cut-off are re-checked. A re-check never changes a placed order by itself. If the pick would now be different, it raises a question.
- **Answer:** **Answered** (Darragh, 14 Nov): agreed as recommended.

**Q05.9 How do a standing allergy and an event allergy combine?** (PF-05)
- Recommended: the event gets both. Standing constraints can't be removed for one event, only added to.
- **Answer:** **Answered** (Darragh, 14 Nov): agreed as recommended.

**Q05.10 What is the complete list of rules and parameters?** Raised in the team review: the values so far are placeholders, and nobody has one list of everything that can be set.
- This question is for the owner to complete, not just to agree. It needs two lists:
  1. **Every rule**, from Q05.1: ID, trigger, outcome, who is asked.
  2. **Every parameter**: its value, who can change it (the hotel, or fixed in the product), and which function reads it.
- **Parameters, settled by Darragh on 14 Nov.** "Shown in settings" means the hotel sees and changes it; "fixed" means it's a product constant, not shown.

| # | Parameter | Value | Who sets it | Shown in settings? | Read by |
|---|---|---|---|---|---|
| 1 | Spend cap per order | €5,000 | Hotel | Yes | `MANDATE-CHECK` |
| 1a | Is VAT included in the cap? | No (before VAT), by default | Hotel | Yes | `MANDATE-CHECK` |
| 2 | Guest-count change applied without asking | 5% rounded down, **or** a ± guest band by event size: ±2 up to 50 guests, ±5 for 51–200, ±10 above 200 | Hotel; editable by whoever runs the event | Yes | `CHANGE-APPLY` |
| 3 | Price rise accepted without asking | 5% | Hotel | Yes | `QUOTE-RECHECK` |
| 4 | Extra from rounding up to whole packs, accepted without asking | Up to **20% or €30** | Hotel | Yes | `OVERSHOOT-CHECK` |
| 5 | Partial delivery | **Never pre-answered.** Always one question with three options: partial; partial plus a substitute for the difference; or a substitute only. The substitute in "partial plus substitute" can differ from the one in "substitute only", since it only has to cover the difference; "substitute only" must be able to cover the whole quantity by itself | Fixed behaviour | No | `SHORTFALL-RESOLVE`, chunk 06 |
| 6 | Unknown stock accepted without asking, on cheap lines | Lines under €50 each; also learned from orders the hotel flagged as okay | Hotel | Yes | `PREANSWER-MATCH` |
| 7 | ~~"Very large order" threshold~~ | **Removed:** it only existed for Valio Aimo approval of partner sourcing, which D21 dropped | | | |
| 8 | Delivery days | Each weekday is its own toggle square; Monday to Friday on by default, Saturday and Sunday off | Hotel (venue) | Yes | `NEEDED-BY` |
| 8a | Receive on public holidays | A checkbox; off by default, so holidays are blocked | Hotel (venue) | Yes | `NEEDED-BY` |
| 9 | How early goods must arrive | 1 day before the event; 2 days for frozen | Hotel, or per recipe | Yes | `NEEDED-BY` |
| 10 | When a request counts as urgent | Needed within 5 days | Fixed | **No** (removed from settings) | `URGENCY-CHECK` |
| 11 | When the final check runs | **24 hours and 1 hour** before each cut-off | Fixed | No | `FINAL-CHECK` |
| 12 | How long a price quote lasts | Until its earliest cut-off, at most 24 hours | Fixed | No | `QUOTE-CREATE` |
| 13 | Delivery reliability below which ordering asks | 90% | Hotel | Yes | `LINE-VERDICT` |
| 14 | Delivery reliability below which a line shows a warning colour | **The same number as row 13**, tied to it directly | Follows row 13 | No | `LINE-VERDICT`, `RANK` |
| 15 | Decisions API: confidence that counts as a fact | 0.90 or above | Fixed | No | `TYPE-CHECK` and the other Decisions API functions |
| 16 | Decisions API: confidence that counts as a no | 0.10 or below | Fixed | No | Same |
| 17 | Candidates kept by a search | 50, **not yet confirmed**: Darragh asked what it means (see below) | Fixed | No | `PRODUCT-SEARCH` |
| 18 | Options shown to a person | 3, unlabelled; one highlighted only if it's a clear winner | Fixed | No | `RANK`, `SUBSTITUTE-FIND` |
| 19 | Product codes per lookup call | 1,000, the API's own limit | Fixed by Valio Aimo | **No** (removed from settings) | `LOOKUP` |
| 20 | Pack-size mismatch that turns a line amber | The two sources disagree by more than 5% | Fixed | No | `PACK-CONTENT` |
| 21 | Quantity scrutiny | **Low / Medium / High**, default Medium. Drives the quantity anomaly check below | Hotel | Yes | `QUANTITY-SANITY` (chunk 01) |

- **Still to settle on this list:** row 17; whether the memory of "flagged as okay" answers (row 6, Q05.6) can be viewed and cleared by the hotel; whether the stored hierarchy of clashing constraints (Q05.7) can be viewed and edited.
- **Row 17 explained:** a search first collects candidate products from the local catalogue, then checks them against the rules and ranks them, and only the top 3 are shown. Row 17 is how many it collects before that. Higher means fewer good products are missed, but more products to check and more calls to Valio Aimo's API, which has undisclosed rate limits. 50 is a middle value.

#### Quantity anomaly check (row 21): design

Direction from Darragh (14 Nov): this check must be much more than fixed per-guest bounds. It should catch amounts that are far too large or small, typos, and breaks from a product's trend; scrutinise products ordered consistently more than ones that vary; and be reviewed by a more capable AI model. The algorithm below is a **proposal to confirm**. It replaces the two simple checks recommended in Q01.7 (chunk 01, Jack's), which Jack still has to agree.

**Signals, all deterministic and computed for every line:**

1. **Per-guest bounds:** more than 1 kg or 1 L, or less than 1 g or 1 ml, per guest. This is a backstop for a hotel with no history.
2. **Deviation from this hotel's own history** for the same product, or the same recipe line, measured **per guest** so that a bigger event isn't flagged just for being bigger. Use the median and the median absolute deviation (MAD) of past per-guest amounts, so one odd past order doesn't distort it. Score = |amount − median| ÷ MAD, with MAD floored at 5% of the median so a perfectly constant history doesn't divide by zero.
   - This automatically **scrutinises consistent products more**: a small MAD means a small change scores high. **Variable products get more room**: a large MAD means the same change scores low.
3. **Trend:** compare against an exponentially weighted moving average of recent orders, not only the last order, so a steady rise isn't flagged while a sudden jump is.
4. **Typo patterns**, flagged at every scrutiny level whatever the history says:
   - a factor of exactly 10, 100 or 1,000 against the expected amount (within ±3%), for example 1,000 last week and 100 now;
   - a one-digit slip against the previous amount: a digit dropped, added, doubled or two digits swapped (1,250 vs 1,520; 125 vs 1,250);
   - a unit slip: a factor of 1,000 (grams vs kg, ml vs litres), or the pack's case size (units vs cases).

   A change that matches no typo pattern (1,000 to 85) is still flagged by signals 2 and 3 if it's large, but it's treated as a likely real change, not a slip.

**Thresholds by scrutiny level** (score from signal 2, plus a ratio against the median):

| Level | Flags when |
|---|---|
| Low | Score above 4.5 **and** more than 3× or less than ⅓ of the median |
| Medium (default) | Score above 3.5 **or** more than 2× or less than ½ of the median |
| High | Score above 2.5 **or** more than 1.5× or less than ⅔ of the median |

Typo patterns (signal 4) and per-guest bounds (signal 1) flag at every level. A deviation the hotel has flagged as okay before, for the same product and similar size, lowers the severity (Q05.6).

**AI review:**
- A more capable language model reviews every flagged line, and at **High** every quantity change, with the facts: the line, the guest count, the product's history, the trend and which signals fired.
- It returns plausible or suspicious, a one-sentence reason, and, if it looks like a slip, the amount it thinks was meant. Its answer and confidence are logged as a model judgement (SF-05).
- It **never changes a quantity.** A suspicious line becomes one question to the chef: "You ordered 100 kg. The last 6 orders were about 1,000 kg. Did you mean 1,000?", with keep, use the suggestion, or edit.
- **No history** (a new hotel or product): signals 1 and 4 against the recipe-scaled amount, plus the model review.

- **Answer:** **Partly answered** (Darragh, 14 Nov): the parameter list above is settled except row 17 and the two memory questions. The rule list waits on Q05.1.

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The order total equals the spend cap exactly | Passes; the cap is "up to and including" | Agreed (Darragh, 14 Nov): it passes |
| The spend cap is 0 | Every order asks the Approver; this is a valid mandate, not a special mode | Agreed (Darragh, 14 Nov) |
| Is the cap compared with or without VAT? | Without VAT, matching the API's prices | Agreed (Darragh, 14 Nov), without VAT by default; whether VAT is included should be a hotel setting |
| An amendment pushes a placed order over the cap | The amendment needs an approval; the original order stands meanwhile | Agreed (Darragh, 14 Nov) |
| Two preferences conflict (Finnish origin and a brand that isn't Finnish) | A required one beats a preferred one; two required ones that can't both be met ask | Agreed, extended (Darragh, 14 Nov): a required one beats a nice-to-have. If both are nice-to-haves, use the stored hierarchy (Q05.7) if there is one; otherwise flag |
| A pre-answer and a hard rule both apply | The hard rule wins | Agreed (Darragh, 14 Nov): the hard rule wins, and it is flagged if it is a crucial rule |

## Done when

- Every rule in human-approval-rules.md has an ID, an outcome and a test.
- A line with an allergen failure shows its rule ID and offers no approve button anywhere.
- An order €1 over the cap is refused by the gateway, not only by the agent.
- Changing one preference for one event changes that event's picks and nothing else.
