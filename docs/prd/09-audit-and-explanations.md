# Chunk 09: Audit and explanations

| | |
|---|---|
| **Owner** | Ben |
| **Second check** | Jack answers Q09.5 (what counts as one human decision). Pavit answers Q09.2, a major question |
| **Track** | C: gateway, interface, tests |
| **Needs from** | 05 (rule IDs and message templates), 06 (questions and answers), 08 (orders) |
| **Feeds** | 10 (the audit screen and the "tap to see the source" popover) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| AP-05 | P0 | Read a log of everything the agent did and why so that I can trust it and show my director |
| VA-06 | P0 | Keep one audit log both sides read so that a disputed order is settled from one record |
| AP-12 | P1 | See how many human decisions each event took so that I can see the time saved and tune our rules |
| CH-10 | P1 | See why each line isn't green, with the rule behind it, so that I can fix the menu or accept the risk |
| UI-05 | P0 | Tap any number or verdict to see its source so that I can check it without leaving the screen |
| PF-06 | P1 | See which preferences shaped each pick and where they came from so that I can tell why a product was chosen |
| SF-05 | P1 | Log every model judgement with its confidence so that guesses are never disguised as rules |

## How: what's already settled

- **One audit log that both the hotel and Valio Aimo read.** [BRIEF, D11]
- **Every decision cites the rule IDs that fired.** A model judgement is logged separately, with its question, probability and threshold, so a guess never looks like a rule. [D12]
- **The audit names the person**, not only the role. [D27]
- **Explanations add no facts.** Whatever words are shown come from facts the rules produced. [D10]
- **Each pick shows which preferences shaped it** and where each came from. [PF-06]
- **Each event shows how many human decisions it took.** This is the product's second goal, after being correct. [D14]
- **Any number or verdict opens its source in place.** [UI-05]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `AUDIT-APPEND` | Deterministic code | An entry | The stored entry, with the hash of the one before it | Append only. | Q09.1, Q09.3, Q09.7 |
| `AUDIT-VIEW` | Deterministic code | The viewer (a hotel person or Valio Aimo), filters | The entries that viewer may read | Apply the visibility tag. | Q09.2 |
| `EXPLAIN` | Deterministic code | The fired rules and their facts | Text built from the rules' templates | Always available. | Q09.4 |
| `EXPLAIN-REPHRASE` | Language model | The template text and the facts | A shorter one-line summary | May only rephrase. | Q09.4 |
| `EXPLAIN-GUARD` | Deterministic code | The rephrased text, the facts | Accept, or fall back to the template | Reject any number or product that isn't in the facts. | Q09.4 |
| `SOURCE-TRACE` | Deterministic code | A value shown on screen | Its source | Read from stored facts. Never recompute. | Q09.6 |
| `DECISION-COUNT` | Deterministic code | An event's audit entries | Confirmations and decisions, with the rule behind each | A pre-answer counts as zero. | Q09.5 |

## Questions to answer

**Q09.1 What fields does an audit entry have?**
- Recommended: ID; time on the simulated clock and real time; actor (agent, a named person with role and outlet, or the gateway); action, from a closed list; what it was about (event, order, quote, line); rule IDs; model judgements; before and after values; whether fixture data was involved; who can see it.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. ID; time on the simulated clock and real time; actor (agent, a named person with role and outlet, or the gateway); action, from the closed list (Q09.7); subject (event, order, quote, line); rule IDs; model judgements; before and after values; fixture flag; visibility tag. Plus the previous entry's hash (Q09.3).

**Q09.2 What does Valio Aimo see, and what stays with the hotel?** The brief's headline is "without exposing confidential data". **Major question: answer first.** Responsibility: Pavit, who builds the core brief functions (`PRODUCT-SEARCH`, `LOOKUP`, quoting and ordering).
- Recommended: Valio Aimo sees quotes, orders, amendments, approvals (that one exists and which mandate rule it answered), refusals and cut-off flags. It does not see recipes, dishes, guest and diet details, the hotel's preferences, or the wording of chef questions. Each entry is tagged with who can read it.
- **Answer:** **Agreed in outline, incomplete** (Jack, team review 14 Nov): largely as recommended. Still to be written in detail by the owner:
  - the exact fields of each entry type that Valio Aimo can read;
  - whether Valio Aimo sees the hotel's mandate values, or only that a rule was met;
  - what an outside agent acting for the hotel can read;
  - how the visibility tag is set and tested.

**Q09.3 How do we show the log hasn't been edited?**
- Recommended: the table is append-only, and each entry stores a hash of the entry before it. It's cheap, and it gives a concrete answer to "why should either side trust this record?"
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. The table is append-only and each entry stores a hash of the entry before it. A "verify log" check on the audit screen shows a tick, or the first entry where the chain breaks.

**Q09.4 Are explanations written by templates or by the language model?** D10 gives the model this job, but a model can introduce a number that isn't in the facts.
- Recommended: every rule's message template is the floor and is always available. The model may rewrite a card's one-line summary from those facts. If its text contains a number or product that isn't in the facts, the template is shown instead.
- **Answer:** **Agreed** (Jack, 14 Nov): templates are the floor; the model may only rephrase, and the guard falls back to the template.

**Q09.5 What counts as one "human decision"?**
- Recommended: each answered question card counts as one, however many lines it covers. Confirming the parsed request is counted separately as a confirmation. The event shows both: "1 confirmation, 2 decisions", with the rule behind each decision.
- **Answer:** _open_

**Q09.6 What does the source popover show for each kind of value?**
- Recommended:
  - A price: the API field, the value, and when it was fetched.
  - A quantity: the sum behind it (amount per portion × guests, the pack size, the rounding).
  - A verdict or status: the rule IDs and the data fact each one tested.
  - A pick: the ranking step that decided it and the preferences applied.
  - A model judgement: the question asked, the probability and the threshold.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended, all five kinds, each read from stored facts and never recomputed.

**Q09.7 What is the closed list of audit actions?**
- Recommended starting list: request received, request parsed, constraint asked, quote created, line verdict set, question asked, question answered, question expired, order placed, order refused, order amended, substitute applied, final check run, flag sent to Valio Aimo, mandate changed, preference changed, clock moved.
- **Answer:** **Agreed** (Ben, 14 Nov): the recommended 17, plus four: **gateway call failed**, **auto-approved** (a remembered approval or pre-answer answered a question; counts as zero decisions), **request confirmed** (counted as a confirmation, Q09.5) and **data reset** (chunk 11). Model judgements are a field on other entries, not an action of their own.

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| An action is taken through the "viewing as" switcher | Logged against the seeded person, and marked as a test session | _open_ |
| The simulated clock is moved | Logged as its own entry, so the timeline still makes sense | _open_ |
| A gateway call fails | Logged with the error; a failed call never looks like "nothing happened" | _open_ |
| A remembered approval is applied | Logged as auto-approved, with a link to the original answer | _open_ |
| A pre-answer answers a question | Logged with which pre-answer, and counted as zero human decisions | _open_ |
| Fixture data fed a decision | The entry is marked as using a fixture | _open_ |

## Done when

- Every order in the test cases can be traced from the audit alone: who asked, what was quoted, which rules fired, who approved.
- An amber line's reason shows a rule ID and the data fact behind it.
- Tapping a price, a quantity and a status each opens the right source.
- Signed in as Valio Aimo, the audit shows the order and approval but no recipe or guest details.
- The event page shows its count of human decisions.
