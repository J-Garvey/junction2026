# Chunk 01: Request intake and constraints

| | |
|---|---|
| **Owner** | Jack |
| **Second check** | Pavit answers Q01.6 (which model parses, and what happens when it fails) |
| **Track** | A: request to basket |
| **Needs from** | Nothing. This chunk starts the pipeline. |
| **Feeds** | 02 (matching), 03 (quantities), 04 (timing) |

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| CH-01 | P0 | Enter the event as a structured list so that the agent understands exactly what I want |
| CH-09 | P0 | Ask for a single item in plain words, outside any event menu, so that a quick need doesn't mean filling in a form |
| CH-18 | P1 | Have quantities sanity-checked against the guest count so that a unit slip like litres for decilitres is caught before it's ordered |
| PF-01 | P0 | Get asked for any constraint I haven't given (allergies, diets, gluten-free or not, delivery date and time) so that the order fits the event without me remembering every field |
| UI-04 | P0 | Correct what the agent understood by tapping editable chips so that a misread is fixed before anything is quoted |

## How: what's already settled

- **Two ways in, one object out.** A structured event (CH-01) and a free-text request (CH-09) both become the same `Request` object, defined once as a Zod schema in `packages/contracts`. [D5, D10, TechStack]
- **The language model only parses.** It turns free text into structured lines on the server. It never picks a product or a quantity. [D10]
- **The parse is shown back as editable chips** before anything is quoted. [UI-04]
- **Missing constraints are asked for as one grouped question**, and the agent never assumes "no allergies". [D24]
- **An ambiguous request always asks.** [approval rules]
- **Quantities are sanity-checked and never silently corrected.** [CH-18]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `REQUEST-PARSE` | Language model | Free text | A draft `Request`, or an error | Fill in only what the text says. Never invent a quantity, date or product. The output must validate against the schema. | Q01.2, Q01.6 |
| `REQUEST-VALIDATE` | Deterministic code | A draft `Request` | A valid `Request`, or a list of problems | Check the schema, that diet counts fit inside the guest total, and that dates are in the future. | Q01.2, Q01.4 |
| `AMBIGUITY-CHECK` | Decisions API, yes/no | One request line | Clear, or ambiguous with the reason | Ask whether the line names one specific type of product. A missing quantity, unit or date is caught by code, not by the model. | Q01.5 |
| `CONSTRAINT-CHECK` | Deterministic code | A valid `Request` | The missing constraints as one grouped question, or none | Compare against the required list. Never fill a gap with a default. | Q01.3 |
| `QUANTITY-SANITY` | Deterministic code | Line quantities, guest count | Pass, or a question naming the suspected slip | Apply the per-guest bounds and the 10/100/1,000 check. Never correct a value. | Q01.7 |
| `MESSAGE-ROUTE` | Decisions API, choice | Text typed into the chat box | New request, change to an event, or neither | Pick one of the three routes. Below the threshold, ask the person which they meant. | Q10.6 |

**Decisions API calls in this chunk.** The question wording is a recommendation for the owner to settle.

| Function | Question type | Question asked | If unsure or unreachable |
|---|---|---|---|
| `AMBIGUITY-CHECK` | yes/no | "Does this request name one specific type of product, so that nothing needs clarifying?" | Ask the chef to choose |
| `MESSAGE-ROUTE` | choice of 3 | "Is this message a new request, a change to an existing event, or neither?" | Ask the person which they meant |

## Questions to answer

**Q01.1 How does an event get into the app for Junction?** This is open in D22.
- Recommended: a simple table editor (dish, ingredient, amount per portion, unit, diet group), pre-filled from the seed event. Guest count and diet counts are editable. No file upload or paste-import in core.
- **Answer:** _open_

**Q01.2 What fields does the `Request` object have?**
- Recommended:
  - `event`: id, name, site, service date, guest count, diet groups (each a list of constraints plus a count).
  - `dishes`: name, outlet, which diet groups it serves, ingredient lines.
  - Ingredient line: what's needed (text), optional product ID or brand, amount per portion, unit, extra constraints.
  - A single-item request (CH-09) is one line with a total quantity and a date, and no dishes.
- **Answer:** _open_

**Q01.3 Which constraints must be known before the agent quotes?**
- Recommended: delivery date, delivery site, quantity and unit on every line. For events also the guest count and an explicit answer on allergies and diets, where "none" has to be stated, not assumed. Delivery time of day is optional and always flagged "not guaranteed".
- **Answer:** _open_

**Q01.4 Can one guest be in two diet groups, such as vegan and gluten-free?**
- Recommended: a diet group is a set of guests with a *list* of constraints ("vegan + gluten-free, 5 guests"). Groups don't overlap. Counts must add up to no more than the guest total; the rest are "no restrictions".
- **Answer:** _open_

**Q01.5 What exactly makes a free-text request "ambiguous"?**
- Recommended: any of these asks instead of guessing:
  - a product word that covers several types in the catalogue ("milk", "cream");
  - a missing quantity or unit;
  - a date that is missing, in the past, or today.
  - A relative date ("Monday") is resolved to the next one and shown back in the chips, not asked about.
- **Answer:** _open_

**Q01.6 Which model does the parsing, and what happens when it fails?**
- Recommended: whichever provider key is already on the devbox, called with a JSON schema so the output is the `Request` object or an error. If the call fails or the output doesn't validate, the app says so and offers the table editor. Nothing is quoted from a failed parse.
- **Answer:** _open_

**Q01.7 What does the quantity sanity check compare against?** There is no table of normal amounts per guest.
- Recommended: two checks only, both ending in a question that names the suspected slip.
  - A single ingredient above 1 kg or 1 L per guest, or below 1 g or 1 ml per guest.
  - A line total that is 10, 100 or 1,000 times what amount-per-portion × guests gives.
- **Input from Darragh (14 Nov):** a fuller design is proposed in [chunk 05, Q05.10, "Quantity anomaly check"](05-rules-mandate-and-preferences.md): per-guest history, trend and typo patterns, Low / Medium / High scrutiny, and review by a more capable AI model. For this chunk's owner to accept or adjust.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| Free text names two items ("milk and cream by Monday") | Parse into two lines; each line gets its own chips | _open_ |
| The request is written in Finnish | Accept it; chips are shown in English with the original text kept | _open_ |
| Diet counts add up to more than the guest total | Refuse to quote; one question showing the two numbers | _open_ |
| Guest count is 0 or missing | Ask; never default | _open_ |
| A chip is edited after a quote exists | The quote is void; a new quote is made from the edited request | _open_ |
| The needed date is inside the lead time | Flag the request as urgent and hand to chunk 04's rule | _open_ |

## Done when

- The seed event and the brief's milk sentence both produce a valid `Request` object.
- Removing the guest count, or typing "milk by Monday", produces a question and no quote.
- Typing 10 L per guest produces a sanity question that names the suspected unit slip.
