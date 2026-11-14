# Questions for the Valio Aimo stand

Only questions that **Valio Aimo alone can answer** and whose answer **changes what we build or decide** before the 10:00 Sunday deadline. Everything else is either already answered in [../GROUND_TRUTH.md](../GROUND_TRUTH.md) or only matters later. The full list is [mentor-questions.md](mentor-questions.md).

Ask in this order. Write each answer, who said it and the time under the question, then update the files listed.

---

## A. Ask first: these decide what we build (any Valio Aimo person; commercial mentors best)

**1. Which customers should an agent like this serve first?** Of independent restaurants, hotel and restaurant chains, contract caterers, care-home chains and public kitchens, which would you most want to win or protect, and roughly how does your revenue split across them?
- *Decides:* QUESTIONS.md item 1 (segment). The repo has two research passes that disagree; this is what settles it.
- *Listen for:* a ranking, even without numbers. If they name one, ask its block of questions in mentor-questions.md (Q8–24).
- *Who:* Hanna Forsström, Pirjo Kaartinen.
- **Answer (14 Nov, Valio Aimo, speaker not recorded; [06](06-valio-aimo-conversation-2026-11-14.md)):** hotels first, then restaurants. Revenue is concentrated in large hotel chains. Within hotels, the agent fits **catering and event orders** (weddings, dinners, large functions), not the templated daily breakfast order. No revenue split given.

**2. In production, who would pay for an agent like this: Valio Aimo, as a service to keep customers, or the customers themselves?**
- *Decides:* QUESTIONS.md item 2 (who pays), and how we pitch it.
- *Who:* Hanna Forsström, Pirjo Kaartinen.

**3. For the demo, do you expect us to build the buyer's agent as well as your side of the interface, or is a scripted agent driving our interface enough?**
- *Decides:* how much of the build goes into the agent versus the interface. The brief says the deliverable is "the interface and operating model", but the 30% criterion is an end-to-end agent flow.

**4. When an order needs human sign-off, who signs: someone at the customer, someone at Valio Aimo, or either?**
- *Decides:* who the approval screen and audit trail are for (20% criterion). The brief only says "a human".
- **Partly answered (14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)):** the hotel places the order and its event clients never deal with Valio Aimo, so the buyer-side approver is someone at the hotel. Whether Valio Aimo also signs anything is still open.

**5. What should trigger a sign-off?** The brief gives "spend threshold" as an example, but we've heard spend limits aren't a real pain point. What would actually make a buyer want to approve an order by hand?
- *Decides:* the guardrail model. The repo currently holds both views.

**6. Will the judges score substitution handling?** The brief calls it optional and "not scored as core", but the 15% robustness criterion names substitutions.
- *Decides:* whether the allergen-safe substitution scenario is the centrepiece or a stretch goal.

## B. The mock and the data (IT: Tommi Nurmi-Aro, Ville Takanen, Riku Tapper)

**7. Terminal products have an order cut-off of 10–12 Nov, already past, but still offer Monday delivery. Should an agent treat a passed cut-off as "can't order"?**
- *Decides:* whether our agent refuses or allows these. It affects 20 of the 35 lactose-free milks in the brief's own example.

**8. Some Stock products return 9,999,999,999 base units available (e.g. 833,333,333 cases). Does that mean "unknown", like Terminal's 999999, or genuinely unlimited?**
- *Decides:* whether 10 Valio lactose-free milks can fill the 1,000-litre example. Without them, no single product with a real stock figure can.

**9. The mock returns the same delivery date (Mon 16 Nov) whatever date we request. Is that intended, and should we handle delivery-date logic ourselves?**
- *Decides:* whether "by Monday" and alternative-date handling are real in the demo or simulated by us.

**10. Is `nonAllergen` a declared "free from"? Is it a supplier declaration or tested? Why do most Valio products have no free-from list at all?**
- *Decides:* whether an allergen-safe substitution can rely on free-from data, or must treat a missing entry as unknown and send it to a human.

**11. `allowedLotSize` is 0.01 on 96% of products. Can a buyer really order 0.01 of a case, or should we round to whole sales units?**
- *Decides:* quantity rounding in every order.
- **Partly answered (14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)):** products are sold in batches, and a customer who needs 1.5 units buys 2. So round up to whole sales units. What 0.01 itself means is still unexplained.

**12. In production, how would an agent prove it acts for a specific customer, and what would it then see differently (its own prices, a contract assortment)? How long does a quoted price hold?**
- *Decides:* the identity and trust part of the design, and the "credible path to production" story (15% criterion). The mock ignores the customer, so we can't see this ourselves.

**13. Is data exposure a design constraint for us?** Our notes say it isn't because all data is synthetic, but the brief asks how to work "without exposing … confidential data". What, if anything, should an external agent never see?
- *Decides:* whether we design a permissions layer on what the agent can read. The repo has an unsourced team rule that says it doesn't matter.

## C. How ordering works today (online sales: Minni Ruhtinas)

**14. When an item runs short at picking, who chooses the substitute, and when and how is the customer told?**
- *Decides:* what our substitution flow replaces or improves. The webshop only *suggests* substitutes; what happens after the order is not public.
- **Context, not an answer (14 Nov, [06](06-valio-aimo-conversation-2026-11-14.md)):** substitutions are "a real operational problem" when stock runs out. Ingredients are not interchangeable by category: two "blue milks" can behave differently in a recipe, and sugar with additives can break bakery recipes. Who picks the substitute and how the customer is told is still open.

**15. Do any customers already order system-to-system: EDI, Jamix, CGI Aromi or another kitchen system?**
- *Decides:* the production-path story. Nothing about this is public.

---

## Ask the Junction organisers, not Valio Aimo

- What is the submission format, and which artefacts are required (video, repo link, slides)? The deadline is Sun 15 Nov 10:00; the format is only on the logged-in dashboard.

## Deliberately not on this sheet

- Anything already answered in [../GROUND_TRUTH.md](../GROUND_TRUTH.md): whether the API can order (no), what 999999 means (unknown), allergen and label codes, whether `customer` matters (no), the deadline.
- Segment-specific questions (Q8–24 in mentor-questions.md): ask the block for whichever segment question 1 points to.
- Background that doesn't change the build before Sunday: churn to competitors, bankruptcies, fill rate, order values, unit and temperature code meanings (our inferences are good enough for the demo).
