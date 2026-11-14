# Notes from conversations with Valio Aimo, 14 Nov 2026

> **Source:** Darragh's notes from talking with Valio Aimo people at Junction, 14 Nov 2026. Names of who said what were not recorded. This is first-hand input from the challenge sponsor, but it is spoken, not documented: where it conflicts with [../GROUND_TRUTH.md](../GROUND_TRUTH.md), note the conflict rather than overwrite either.
> The notes are kept as written; only the headings and formatting are tidied. "What this changes" at the end is the team's reading, not Valio Aimo's words.

## Customer profile and market focus

- 20,000 customers in total: big hotel chains, restaurants, cafeterias, schools.
- Revenue is concentrated in large hotel chains.
- Hotels, then restaurants, are the priority target segment.

## Hotel ordering patterns

- Daily breakfast orders are handled via templates: low labour, already automated.
- Catering events (weddings, dinners, large functions) have no templates: high labour, high complexity.
- An agentic system is better suited to catering orders, not routine daily orders.
- Hotels place the orders; their clients don't interact with the vendor directly.

## Product and substitution complexity

- Pre-made goods (e.g. cans of Coke) are straightforward and quantity-based.
- Ingredients are complex: brand and variant matter.
- Milk products are especially sensitive: two "blue milks" may not be interchangeable in recipes.
- Sugar can have additives that break bakery recipes.
- Substitutions are a real operational problem when stock runs out.
- Products are sold in batches: if 1.5 units are needed, the customer buys 2.

## Lead times and order commitment

- Lead times are product-line specific and visible in the webshop.
- The range is next day to about 4 days.
- Orders must be committed before a cut-off time shown per product. Example: commit by 17:00 today for delivery tomorrow.
- For events planned weeks ahead, the order still needs to be placed, and can be amended before the cut-off.

## Category data and agent design

- The 5-digit category codes in the data are SAP category codes: the structure is SAP-defined, not custom.
- Agent prompt design: there is no single right answer on how specific recommendations should be.
- Cost-conscious small venues may want full transparency (why this product, why this price). Others prefer a "just handle it" approach.
- Suggested framing: position the detailed recommendation mode as the solution for cost-conscious small operators.

## Next steps (from the conversation)

- Review the vendor webshop: explore product listings, batch sizes, lead times and cut-off times to inform agent design for hotel catering orders.

---

## What this changes (team reading)

| Topic | Before | After this conversation | Where it's tracked |
|---|---|---|---|
| Segment | Two research passes disagreed ([QUESTIONS.md](../QUESTIONS.md) item 1) | Valio Aimo names **hotels first, then restaurants**, with revenue concentrated in large hotel chains | QUESTIONS.md item 1; stand question 1; mentor Q1–2 |
| What to automate | Open | **Hotel catering and event orders**, not the templated daily breakfast order | Matches [05](05-spike-orders-under-time-pressure.md): the urgent order is the event correction |
| Who the agent works for | Open (stand question 4 asks who signs off) | The hotel places the order; its event clients never deal with Valio Aimo. So the approver is someone at the hotel | Stand question 4 (partly) |
| Substitutions | Treated as allergen checks | Also **recipe function**: same-looking products (two "blue milks", sugar with additives) may not be interchangeable. A substitute must match spec, not just category and allergens | Stand question 14 (who picks is still open); mentor Q28 |
| Quantities | `allowedLotSize` 0.01 unexplained | Customers buy **whole sales units** (1.5 needed → buy 2). Treat the order step as 1 sales unit unless told otherwise | Stand question 11; mentor Q43 (partly) |
| Lead times and cut-offs | Per-product `closingTime` in the API; no published times | Product-line specific, **next day to ~4 days**, cut-off shown per product in the webshop (e.g. 17:00 for next day). Event orders placed early can be amended until the cut-off | Mentor Q37 (partly) |
| Category codes | Undocumented | **SAP-defined** 5-digit category codes; names still not in the data | Mentor Q45 (partly) |
| How much the agent explains | Open | Make it a per-customer setting: a **detailed, transparent mode** for cost-conscious small operators, and a **"just handle it" mode** for others. This is the "tune how often it asks" idea from the product direction | Product direction in [../CLAUDE.md](../CLAUDE.md) |

Still not answered by this conversation: who pays (QUESTIONS.md item 2), who picks the substitute at picking and how the customer is told, the meaning of the stock sentinels and past cut-offs in the mock, and whether delivery outside agreed days is possible.
