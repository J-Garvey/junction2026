# PRD, in chunks

> **What this is:** the product requirements for the Junction build, split into 11 chunks and 65 named functions. The [user stories](../user-stories.md) say **what** we deliver. Each chunk says **how** we deliver a group of those stories: the functions to build, and the questions and edge cases still to be ruled on.
>
> **Status, 14 Nov 2026:** draft. No chunk or function has an owner. **Who takes what is a team decision** between Jack, Darragh, Pavit and Ben, and nothing here assigns anyone. When the chunks are answered, they are folded into one final PRD and the build agents start from that.
>
> **Not in this PRD:** the demo script and the pitch (D30). This covers only building the product.

## How to use it

1. **The team decides who takes which chunk**, or which functions inside a chunk, and writes the names in the Owner rows.
2. **Answer each question.** Every question has a recommended answer. Replace `_open_` with "Agreed", or with your own answer and one line of why.
3. **Rule on each edge case** the same way, in the Ruling column.
4. **Add what's missing.** If you find a question or edge case that isn't listed, add it with your answer.
5. **Open a pull request** with only your chunk's file in it. One file per chunk keeps merges clean.

Three rules while answering:

- **The "How: what's already settled" section is not up for debate inside a chunk.** It restates team decisions (D1 to D30 in [prd-context.md](../prd-context.md)). To change one, raise it with the team and update prd-context.md first.
- **Recommended answers are proposals, not decisions.** They were drafted from the stories and the data so that nobody starts from a blank page. Nothing in a "Recommended" line has been agreed by the team.
- **Core only.** Add-on and parked stories are not designed here.

## The chunks

| # | Chunk | Track | Stories (P0) | Functions | Questions (open or incomplete) | Edge cases | Owner |
|---|---|---|---|---|---|---|---|
| 01 | [Request intake and constraints](01-intake-and-constraints.md) | A | 5 (4) | 6 | 7 (7) | 6 | _unassigned_ |
| 02 | [Product matching and ranking](02-matching-and-ranking.md) | A | 6 (3) | 6 | 9 (7) | 7 | _unassigned_ |
| 03 | [Quantities, packs and rounding](03-quantities-and-rounding.md) | A | 2 (1) | 5 | 6 (6) | 6 | _unassigned_ |
| 04 | [Viability, stock and timing](04-viability-stock-and-timing.md) | A | 5 (3) | 6 | 7 (7) | 6 | _unassigned_ |
| 05 | [Rules, mandate and preferences](05-rules-mandate-and-preferences.md) | B | 9 (3) | 6 | 10 (8) | 6 | _unassigned_ |
| 06 | [Questions, approvals and teams](06-questions-approvals-and-teams.md) | B | 14 (11) | 6 | 9 (8) | 6 | _unassigned_ |
| 07 | [Changes, substitutes and the final check](07-changes-substitutes-and-final-check.md) | B | 10 (3) | 11 | 10 (8) | 8 | _unassigned_ |
| 08 | [Agent Gateway and orders](08-gateway-and-orders.md) | C | 10 (6) | 8 | 10 (10) | 7 | _unassigned_ |
| 09 | [Audit and explanations](09-audit-and-explanations.md) | C | 7 (3) | 7 | 7 (6) | 6 | _unassigned_ |
| 10 | [Interface](10-interface.md) | C | 8 (4) | 0 | 9 (9) | 6 | _unassigned_ |
| 11 | [Fixtures, clock and test cases](11-fixtures-clock-and-tests.md) | C | 2 (2) | 4 | 6 (6) | 5 | _unassigned_ |
| | **Total** | | **78 (43)** | **65** | **90 (82)** | **69** | |

The tracks group chunks by topic. They are not assignments.

- **Track A, request to basket (01 to 04):** turning what the chef asks for into the right products and quantities.
- **Track B, trust core (05 to 07):** the rules, the approvals and what happens when things change. D15 calls this the core of the product.
- **Track C, gateway, interface, tests (08 to 11):** the API an outside agent uses, the record of what happened, the screens, and the seed data and test cases.

## Every function

Each chunk breaks down into named functions, and each function is one problem that can be built and tested alone. Of the 65, 58 are deterministic code, 5 use the Gemini Decisions API and 2 use a language model. The full description of each (what it takes, what it returns, what it must do) is in its chunk.

| Function | Chunk | Kind | Owner |
|---|---|---|---|
| `REQUEST-PARSE` | [01](01-intake-and-constraints.md) | Language model | _unassigned_ |
| `REQUEST-VALIDATE` | [01](01-intake-and-constraints.md) | Deterministic code | _unassigned_ |
| `AMBIGUITY-CHECK` | [01](01-intake-and-constraints.md) | Decisions API, yes/no | _unassigned_ |
| `CONSTRAINT-CHECK` | [01](01-intake-and-constraints.md) | Deterministic code | _unassigned_ |
| `QUANTITY-SANITY` | [01](01-intake-and-constraints.md) | Deterministic code | _unassigned_ |
| `MESSAGE-ROUTE` | [01](01-intake-and-constraints.md) | Decisions API, choice | _unassigned_ |
| `PRODUCT-SEARCH` | [02](02-matching-and-ranking.md) | Deterministic code | _unassigned_ |
| `CATEGORY-HINT` | [02](02-matching-and-ranking.md) | Decisions API, choice | _unassigned_ |
| `DIET-FILTER` | [02](02-matching-and-ranking.md) | Deterministic code | _unassigned_ |
| `LOOKUP` | [02](02-matching-and-ranking.md) | Deterministic code | _unassigned_ |
| `TYPE-CHECK` | [02](02-matching-and-ranking.md) | Decisions API, yes/no | _unassigned_ |
| `RANK` | [02](02-matching-and-ranking.md) | Deterministic code | _unassigned_ |
| `UNIT-CONVERT` | [03](03-quantities-and-rounding.md) | Deterministic code | _unassigned_ |
| `PACK-CONTENT` | [03](03-quantities-and-rounding.md) | Deterministic code | _unassigned_ |
| `NEED-TOTAL` | [03](03-quantities-and-rounding.md) | Deterministic code | _unassigned_ |
| `PACK-ROUND` | [03](03-quantities-and-rounding.md) | Deterministic code | _unassigned_ |
| `OVERSHOOT-CHECK` | [03](03-quantities-and-rounding.md) | Deterministic code | _unassigned_ |
| `NEEDED-BY` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `URGENCY-CHECK` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `STOCK-CHECK` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `CUTOFF-CHECK` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `LINE-VERDICT` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `DELIVERY-ALIGN` | [04](04-viability-stock-and-timing.md) | Deterministic code | _unassigned_ |
| `RULE-EVALUATE` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `OUTCOME-RESOLVE` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `MANDATE-CHECK` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `PREANSWER-MATCH` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `PREFERENCE-RESOLVE` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `SETTING-RECHECK` | [05](05-rules-mandate-and-preferences.md) | Deterministic code | _unassigned_ |
| `QUESTION-BUILD` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `QUESTION-ROUTE` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `ANSWER-RECORD` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `APPROVAL-BIND` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `SESSION-SWITCH` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `EDIT-GUARD` | [06](06-questions-approvals-and-teams.md) | Deterministic code | _unassigned_ |
| `ORDER-DIFF` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `CHANGE-APPLY` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `ALLERGY-RECHECK` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `FINAL-CHECK` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `SHORTFALL-RESOLVE` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `SUBSTITUTE-FIND` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `SUBSTITUTE-CLOSENESS` | [07](07-changes-substitutes-and-final-check.md) | Decisions API, score (optional) | _unassigned_ |
| `SPEC-COMPARE` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `APPROVAL-RECALL` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `SILENCE-RESOLVE` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `COVERAGE-SUMMARY` | [07](07-changes-substitutes-and-final-check.md) | Deterministic code | _unassigned_ |
| `IDENTITY-RESOLVE` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `QUOTE-CREATE` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `QUOTE-RECHECK` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `ORDER-PLACE` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `ORDER-SPLIT` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `ORDER-AMEND` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `MANDATE-SIGN` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `SPEC-PUBLISH` | [08](08-gateway-and-orders.md) | Deterministic code | _unassigned_ |
| `AUDIT-APPEND` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `AUDIT-VIEW` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `EXPLAIN` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `EXPLAIN-REPHRASE` | [09](09-audit-and-explanations.md) | Language model | _unassigned_ |
| `EXPLAIN-GUARD` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `SOURCE-TRACE` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `DECISION-COUNT` | [09](09-audit-and-explanations.md) | Deterministic code | _unassigned_ |
| `CLOCK-NOW` | [11](11-fixtures-clock-and-tests.md) | Deterministic code | _unassigned_ |
| `CLOCK-SET` | [11](11-fixtures-clock-and-tests.md) | Deterministic code | _unassigned_ |
| `FIXTURE-LOAD` | [11](11-fixtures-clock-and-tests.md) | Deterministic code | _unassigned_ |
| `SEED-RESET` | [11](11-fixtures-clock-and-tests.md) | Deterministic code | _unassigned_ |

## Rules for every Decisions API function

The Gemini Decisions API is in the build (D29). It returns a probability, not a guarantee, so the same rules apply wherever it's used:

- **It never decides a hard rule.** Allergens, diets, stock and cut-offs are always deterministic code.
- **A threshold turns its answer into a fact or a question.** High confidence feeds the rules as a fact. Anything in between asks a person. The numbers are set in [chunk 02, Q02.2](02-matching-and-ranking.md).
- **Unsure or unreachable means ask, never guess.** Each function names what it falls back to.
- **Every answer is logged as a model judgement** with the question asked, the probability and the threshold, separately from rule IDs (SF-05).
- **Recommended, not yet agreed: answers are stored and reused**, so the same request gives the same result twice ([Q02.9](02-matching-and-ranking.md)). Google doesn't state whether the API is deterministic.

## Major questions: answer first

Two questions were agreed only in outline at the team review and are marked incomplete. They come first, and they belong to **whoever builds the core functions the brief requires** (`PRODUCT-SEARCH`, `LOOKUP`, quoting and ordering), whichever chunks that person also owns. No person is named here; that is a team decision.

| Question | Agreed so far | Still to write |
|---|---|---|
| [Q08.2](08-gateway-and-orders.md): the line between Valio Aimo's gateway and the hotel's agent | Our own agent uses the same routes as an outside agent, and we host the gateway ourselves | Hosting, authentication, how the call is made, and whether any route is ours alone |
| [Q09.2](09-audit-and-explanations.md): what Valio Aimo sees in the audit | Orders, approvals and flags, but not recipes, guests or preferences | The exact fields, what it sees of the mandate, and what an outside agent can read |

## Team rulings so far

All from Jack, 14 Nov. The rest of the team hasn't confirmed them yet.

| Question | Ruling |
|---|---|
| D23: unknown stock | **Louder.** Still suggested and labelled, and now always shown with a warning, not as a plain label. |
| D26 to D30 | **Confirmed** as written in [prd-context.md](../prd-context.md). |
| [Q07.9](07-changes-substitutes-and-final-check.md): a late allergy makes an ordered line unsafe and nobody resolves it | **The order goes ahead, with a big warning that is impossible to miss** (D28). The agent never removes the line by itself. |
| [Q07.10](07-changes-substitutes-and-final-check.md): where the allergy warning shows | **Everywhere, in the same words**, until resolved. Wording still to finalise. |
| [Q02.2](02-matching-and-ranking.md): Decisions API | **In** (D29). **Thresholds agreed:** 0.90 and 0.10. |
| [Q02.9](02-matching-and-ranking.md): are Decisions API answers stored and reused | **Yes.** |
| [Q05.3](05-rules-mandate-and-preferences.md): can an order go in while a line is blocked | **No.** The chef fixes or removes the line first. |
| [Q05.4](05-rules-mandate-and-preferences.md): the hotel's rule values | **Placeholders for now.** A complete list of rules and parameters is a new open question, [Q05.10](05-rules-mandate-and-preferences.md). |
| [Q06.5](06-questions-approvals-and-teams.md): seeded accounts or a "viewing as" switcher | **Both.** The switcher swaps between seeded people. |
| [Q09.4](09-audit-and-explanations.md): templates or the language model for explanations | **Templates are the floor.** The model may only rephrase. |
| [Q11.1](11-fixtures-clock-and-tests.md): the seed event | **Deferred**, to be decided with the demo. |
| Demo script, pitch and submission | **Out of this PRD** (D30). |

Not yet answered by anyone: the proposed list of five Decisions API uses, and the two things proposed as not built for Junction (the Purchasing Manager role in Q06.8, and CEL in Q05.5).

## Order of work

Chunks depend on each other, so some answers are needed before others:

1. **First:** the two major questions above, then 05 (rule IDs, the mandate, and the list of rules and parameters in Q05.10), 01 (the request object) and 08 (endpoints and the quote).
2. **Next:** 02, 03, 04 and 06, which build on them.
3. **Then:** 07 and 09.
4. **Last:** 10 and 11. The seed event (Q11.1) is deferred until the demo is planned.

## Every core story has a chunk

| Chunk | Stories |
|---|---|
| 01 Request intake and constraints | CH-01, CH-09, CH-18, PF-01, UI-04 |
| 02 Product matching and ranking | CH-03, CH-15, CH-16, SF-06, VA-01, VA-13 |
| 03 Quantities, packs and rounding | CH-04, CH-12 |
| 04 Viability, stock and timing | CH-02, CH-05, CH-17, SF-07, AP-14 |
| 05 Rules, mandate and preferences | SF-03, SF-04, AP-04, AP-06, AP-11, PF-02, PF-03, PF-04, PF-05 |
| 06 Questions, approvals and teams | AP-01, AP-02, AP-03, AP-07, AP-09, AP-13, TM-01, TM-02, TM-03, TM-04, TM-06, TM-07, UI-02, UI-03 |
| 07 Changes, substitutes and the final check | CH-06, CH-07, CH-08, CH-11, CH-13, CH-14, AP-08, AP-10, VA-12, UI-11 |
| 08 Agent Gateway and orders | VA-02, VA-03, VA-04, VA-05, VA-07, VA-08, VA-09, VA-10, VA-11, TM-05 |
| 09 Audit and explanations | AP-05, VA-06, AP-12, CH-10, UI-05, PF-06, SF-05 |
| 10 Interface | UI-01, UI-06, UI-07, UI-08, UI-09, UI-10, UI-12, UI-13 |
| 11 Fixtures, clock and test cases | SF-01, SF-02 |

Add-on and parked stories are listed in [user-stories.md](../user-stories.md) and are not assigned to a chunk.

## What happens when the chunks are answered

1. Each owner's pull request is merged.
2. The answers are folded into one final PRD: the settled sections, the function descriptions, and every answer and ruling, with the questions removed.
3. Any answer that changes a team decision is written back into [prd-context.md](../prd-context.md).
4. The functions and stories are split into build tasks from the final PRD.
