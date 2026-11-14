# Chunk 10: Interface

| | |
|---|---|
| **Owner** | _unassigned_ |
| **Track** | C: gateway, interface, tests |
| **Needs from** | 06 (question cards), 07 (the diff and the summary), 09 (source popovers) |
| **Feeds** | 11 (the test cases run on these screens) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| UI-01 | P0 | Open the app on the decisions waiting for me and my events, with the chat box pinned on top, so that I start from what needs me, not from a blank chat |
| UI-06 | P0 | See one set of status labels on every screen so that I read state at a glance |
| UI-07 | P0 | Open one page per event with its menu, order, open questions and timeline so that the chef and the approver look at the same thing |
| UI-08 | P0 | See what the agent didn't do as prominently as what it did so that gaps are never hidden |
| UI-09 | P1 | See the same order as a dish view or a money view so that each role sees their part first |
| UI-10 | P1 | See what's still editable and until when so that I know what I can change |
| UI-12 | P1 | Answer a question from my phone in under 10 seconds so that the kitchen doesn't stop |
| UI-13 | P1 | Use the app on my phone so that I can send requests, check orders, and answer questions away from my desk |

Related interface stories live with the behaviour they show: request chips in chunk 01 (UI-04), the question list and card in chunk 06 (UI-02, UI-03), the "covered" summary in chunk 07 (UI-11), and source popovers in chunk 09 (UI-05).

## How: what's already settled

- **Home is the decisions list, not a chat.** It opens on the questions waiting for this person, then their events. The chat box is pinned on top. [D26]
- **Type to ask, tap to decide.** [D26]
- **Compact by default, detail on tap.** [D26]
- **One set of status labels on every screen**, always with words, never colour alone. [UI-06]
- **Gaps sit above what's fine.** Blocked, unresolved and at-risk lines come first, and a summary never says "covered" while a line is at risk. [UI-08]
- **An unresolved allergy conflict shows a warning on every screen** until someone resolves it. [D28, chunk 07 Q07.10]
- **One page per event** with its menu, order, open questions and a timeline of the four scenes. [UI-07]
- **One React and Vite app**, responsive, packaged for phones with Capacitor. [TechStack]
- **Nine mockup screens exist** in [designs/mockups](../../designs/mockups). Screen 01 (chat-first home) changes under D26.

## Functions: the problems to solve

This chunk has no functions of its own. Its screens call the functions in the other chunks, and each screen shows what one of them returned.

## Questions to answer

**Q10.1 Which screens are in core?**
- Recommended, with the mockup each one starts from:

| Screen | Starts from mockup |
|---|---|
| Home: waiting questions, events, chat box | 01 (reworked) and 03 |
| Request: chips, candidates, basket | 02 |
| Event page: timeline, order, questions | 06 |
| Question card | 04 |
| Order and receipt | 05 |
| Audit | 07 |
| Rules: mandate and preferences, read-only | 08 |

- Mockup 09 (agents) is not in core.
- **Answer:** _open_

**Q10.2 What are the exact status labels?**
- Recommended, each with fixed wording and colour:

| Label | Means |
|---|---|
| Covered | Passes every check |
| Check | Amber: a caveat, with its reason |
| Not available | Red: nothing passes |
| Unknown stock, with a warning mark | Valio Aimo can't confirm stock. Always shown as a warning, never as a plain label (D23) |
| Covered at risk, with a warning mark | Unknown stock, risk accepted. The warning stays |
| Waiting for [role] | An open question |
| Blocked | A hard rule; no approve option |
| Unresolved | Unanswered at the cut-off |
| Allergy warning | A line conflicts with a stated allergy and is still in the order (D28) |
| Fixture | Seed or test data |

- "Externally sourced" is added only if that add-on is built.
- **Answer:** _open_

**Q10.3 What does one line of the compact order show?**
- Recommended: status label, product name, quantity and unit, and in a change view the old and new quantity. Price, outlet and cut-off appear on tap or in the money view.
- **Answer:** _open_

**Q10.4 What do the dish view and the money view each show first?** (UI-09)
- Recommended: the chef opens on the dish view (lines grouped by dish and diet group, own outlet first). The Approver opens on the money view (lines by cost, with total, VAT and distance from the spend cap). One toggle switches.
- **Answer:** _open_

**Q10.5 Is the phone build in core, or is a responsive web page enough?** UI-13 is P1.
- Recommended: responsive web is the bar. The Capacitor build happens only after the three core flows pass on the web, and starts with one iOS smoke test as TechStack.md says.
- **Answer:** _open_

**Q10.6 What can be typed into the chat box?**
- Recommended: two things in core. A new request, and a change to an existing event ("510 guests now"), which asks which event if more than one is open. Anything else gets "I can take a new request or a change to an event". Questions about past orders are an add-on.
- **Answer:** _open_

**Q10.7 How are cut-offs shown?** (UI-10)
- Recommended: lines are grouped by cut-off, each group with a countdown, as in the mockups' cut-off board. Past the cut-off, the group shows a lock.
- **Answer:** _open_

**Q10.8 What language is the interface in?**
- Recommended: English, with the English product name where the data has one and the Finnish name otherwise.
- **Answer:** _open_

**Q10.9 How do people learn something needs them?**
- Recommended: in the app only, through the home list and a count badge. Email is an add-on; SMS, calls and WhatsApp are cut.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| Nothing is waiting | Home says so in one line: "Nothing needs you. 3 events covered." | _open_ |
| The gateway can't be reached | "Can't check prices right now. Nothing has been ordered." No stale data shown as current | _open_ |
| An order has 60 or more lines on a phone | Lines that are fine collapse into "54 lines covered"; the rest stay open | _open_ |
| A very long product name | Truncated to one line, full name on tap | _open_ |
| An event has lines from two outlets | Own outlet first, the other outlet collapsed beneath | _open_ |
| A question was answered by a colleague while the card was open | The card updates to "Answered by [person]" with no buttons | _open_ |

## Done when

- Opening the app as the Approver shows waiting questions before anything else.
- The same status label looks and reads the same on home, the event page and the order.
- An event with one at-risk line never shows plain "Covered".
- The question card can be answered on a phone-width screen with one tap.
