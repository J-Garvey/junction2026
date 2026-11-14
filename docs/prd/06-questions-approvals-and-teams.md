# Chunk 06: Questions, approvals and teams

| | |
|---|---|
| **Owner** | Jack |
| **Track** | B: trust core |
| **Needs from** | 05 (rule outcomes and the mandate), 08 (quotes to bind approvals to) |
| **Feeds** | 07 (change and final-check questions), 09 (audit), 10 (the question card and home list) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| AP-01 | P0 | Have orders inside our rules placed without me so that I only spend time on exceptions |
| AP-02 | P0 | Get one question naming the exact rule that tripped so that I can answer in seconds |
| AP-03 | P0 | Approve a fill split across several products so that the order still goes in when no single product covers it |
| AP-07 | P1 | Have my approval tied to the exact quote so that it can't be reused for a different order |
| AP-09 | P1 | Get money questions only after the chef says yes so that I never approve something the chef would reject |
| TM-01 | P0 | Belong to a hotel with linked outlets, each with its own members and preferences, so that the bar and the restaurant each run their part while the hotel stays one customer |
| TM-02 | P0 | Share my role with colleagues, any one of whom can answer, so that a question never waits on one person |
| TM-03 | P0 | See a question close for everyone once someone answers, with who and when, so that nobody answers twice or contradicts a colleague |
| TM-04 | P0 | Plan one event with another outlet, with each line owned by an outlet, so that the bar manager and the restaurant manager coordinate on one page |
| TM-06 | P0 | Switch who I'm viewing as in the demo so that multi-person flows can be shown without building logins |
| TM-07 | P1 | See that a colleague just changed a line I'm editing, and confirm again, so that nobody's change is silently overwritten |
| UI-02 | P0 | See each waiting question with its deadline, soonest first, so that I never hunt for what needs me |
| UI-03 | P0 | Answer every question on one card with two or three buttons so that I never have to type to decide |

## How: what's already settled

- **Most orders go through with no human.** Anything inside the mandate is placed automatically. [D16]
- **Questions are routed by type, not by person.** Recipe fit goes to the Chef; money and policy go to the Approver. If both apply, the Chef answers first and the Approver is asked only after a yes. [D6]
- **One question per decision, not per line**, naming the exact rule that raised it. [AP-02]
- **Answers are buttons, never free text.** [D26]
- **An approval is tied to the exact quote**: items, quantities, total and delivery terms. If anything changes, the approval is void. [D11]
- **One hotel, linked outlets, several people per role.** A question goes to everyone with that role in that outlet. The first answer closes it for all, and the audit names the person. [D27]
- **Each line belongs to an outlet**, and recipe questions go to that outlet's chef. [D27]
- **Testing uses a "viewing as" switcher**; real logins are an add-on. [D27]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `QUESTION-BUILD` | Deterministic code | The resolved outcomes for a quote | Question cards | One card per question type per quote. Apply `PREANSWER-MATCH` first, so a pre-answered question is never created. | Q06.1, Q06.2, Q06.3 |
| `QUESTION-ROUTE` | Deterministic code | A card, the outlets of its lines, the people | Who can answer it | Route by role and outlet. The chef comes before the approver when both apply. | Q06.6 |
| `ANSWER-RECORD` | Deterministic code | A card, a person, the button pressed | Accepted, or "already answered by [person]" | One database transaction. The first answer wins. | Q06.4, Q06.9 |
| `APPROVAL-BIND` | Deterministic code | A quote | A fingerprint of site, lines, quantities, prices, total and delivery dates | Any change gives a different fingerprint, which voids the approval. | Edge cases |
| `SESSION-SWITCH` | Deterministic code | A seeded person | A server session for that person | This is the "viewing as" switcher. Every action is attributed by the server. | Q06.5 |
| `EDIT-GUARD` | Deterministic code | An edit, with the version it was based on | Saved, or refused with what changed | Refuse an edit made against an old version. | Q06.7 |

## Questions to answer

**Q06.1 What fields does a question have?**
- Recommended: ID, event, type, who it's for (role and outlet), the quote version it's bound to, the facts shown, the rule IDs, the answer options, the deadline, a state (open, answered, expired, replaced), and who answered and when.
- **Answer:** _open_

**Q06.2 What is the closed list of question types, and the buttons for each?**
- Recommended starting list:

| Type | For | Buttons |
|---|---|---|
| Missing or ambiguous request details | Chef | Chips to fill in |
| Substitute: will the dish still work? | Chef | Use this one / Use another / None of these |
| Stock can't be confirmed: continue? | The person building the order, normally the Chef (D31) | Continue / Pick another |
| Partial fill | Approver | Approve the split / Keep short / Reject |
| Rounding overshoot above tolerance | Approver | Accept / Round down / Switch pack |
| Over the spend cap | Approver | Approve / Reject |
| Price changed since the quote | Approver | Accept new price / Reject |
| Delivery dates don't line up | Approver | Options from chunk 04 |
| Change outside tolerance | Approver | Approve the change / Keep the order as is |

- **Answer:** _open_

**Q06.3 How are several affected lines grouped into one question?**
- Recommended: one card per question type per quote, listing every affected line. The answer applies to all of them. A "decide line by line" link opens them one at a time for the rare case where the answers differ.
- **Answer:** _open_

**Q06.4 What happens when the Approver rejects?**
- Recommended: the order stays unplaced. The chef sees the rejection with one of three reasons the Approver tapped: too expensive, wrong product, or not needed. No typed reason is required.
- **Answer:** _open_

**Q06.5 How do we reconcile the tech stack's seeded accounts with the "viewing as" switcher?** TechStack.md says seeded chef and approver accounts with server sessions; TM-06 says a switcher.
- Recommended: both. Seed four people (a restaurant chef, a bar manager and two financial controllers). The switcher swaps which seeded person's session the browser holds, so every action is still attributed by the server.
- **Answer:** **Agreed** (Jack, 14 Nov): both. Seeded people, and a switcher that swaps between them.

**Q06.6 Who gets an order-level money question when the order spans outlets?**
- Recommended: Approvers whose scope is the whole hotel. In the seed data both financial controllers have hotel scope.
- **Answer:** _open_

**Q06.7 How are simultaneous edits caught?** (TM-07)
- Recommended: each event carries a version number. A save made against an old version is refused, and the person sees what changed and confirms or redoes their edit.
- **Answer:** _open_

**Q06.8 Is the optional Purchasing Manager role built?** D20 keeps it "for now" with maximum authority and no stories.
- Recommended: not for Junction. A hotel that has a purchaser gives that person the Approver role.
- **Answer:** _open_

**Q06.9 Can an answer be undone?**
- Recommended: not directly. Before the order is placed, editing the request makes a new quote and re-asks. After it's placed, a change goes through the amendment flow in chunk 07. Every answer stays in the audit either way.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| Two people tap an answer at the same moment | The database accepts the first; the second sees "Answered by [person], [time]" | _open_ |
| The quote behind an open question expires | The question is replaced by a new one on the new quote, showing what changed | _open_ |
| The deadline passes while the card is open on someone's screen | The buttons disable and the card says the cut-off has passed (chunk 07 handles the outcome) | _open_ |
| One person holds both roles | They see both kinds of question; the chef-first order still applies | _open_ |
| A recipe question's outlet has no chef assigned | The question goes to all chefs in the hotel and is flagged as unowned | _open_ |
| The chef says no to every substitute offered | The line is unresolved and shown at the top of the event (chunk 07) | _open_ |

## Done when

- An order inside the mandate is placed with no question raised.
- An order over the cap produces exactly one Approver card naming the mandate rule.
- With two controllers seeded, one answers and the card closes for the other, showing who answered.
- A wine substitute goes to the bar manager and never to the restaurant chef.
- Changing a quantity after approval voids the approval.
