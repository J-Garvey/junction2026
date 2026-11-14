# Chunk 11: Fixtures, clock and test cases

| | |
|---|---|
| **Owner** | Ben |
| **Track** | C: gateway, interface, tests |
| **Needs from** | Every chunk. This one proves they work together. |
| **Feeds** | Chunks 01 to 04 are tested against the seed event, so it is needed early. |

The demo script and the pitch are **not part of this PRD** (D30). This chunk covers only what the product needs in order to be built and tested: seed data, a clock that can be moved, and the test cases.

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| SF-01 | P0 | Run all four scenes on one simulated clock so that cut-offs and fixtures always agree |
| SF-02 | P0 | Label every fixture as a fixture so that judges never mistake demo data for real data |

## How: what's already settled

- **Four scenes on one simulated clock**: viability months ahead, order, change at 2–3 weeks, final check before the cut-off. [D4, D8]
- **Three test cases the build must pass** [prd-context]:
  1. The hotel event through all four scenes.
  2. The brief's request for 1,000 L of lactose-free milk by Monday.
  3. A blocked path that no approval can push through.
- **The milk request can't be filled by one product.** The four lactose-free milks with real stock figures total 1,517 L, the largest holds 698 L and is a coffee milk. Twenty others are Terminal, so their stock is unknown. [API, GROUND_TRUTH 4.3]
- **Every fixture is labelled as a fixture** on screen and in the audit. [SF-02]
- **The mock ignores the requested date** and always answers for Monday 16 Nov 2026, with most stock cut-offs at Sunday 15 Nov 17:00. [API]
- **One seeded hotel and a fixed clock** on the devbox. [TechStack]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `CLOCK-NOW` | Deterministic code | Nothing | The current time | The only source of "now" in the codebase. | Q11.3 |
| `CLOCK-SET` | Deterministic code | A time | The clock moved, and an audit entry | Test mode only. | Q11.2, Q11.3 |
| `FIXTURE-LOAD` | Deterministic code | A saved API response | A `LOOKUP` result marked as a fixture | Mark where every value came from. | Q11.4, Q11.5 |
| `SEED-RESET` | Deterministic code | Nothing | A fresh database | Seed the hotel, people, mandate and event, and set the clock to scene 1. | Q11.1, Q11.6 |

## Questions to answer

**Q11.1 What is in the seed event?**
- Recommended: a 500-guest conference dinner with a bar, built from real catalogue products, and containing on purpose:
  - one lactose-free group and one gluten-free group;
  - one line that is amber for unknown stock (a Terminal product);
  - one line that will be short at the final check and has a workable substitute;
  - one bar line, so two outlets appear;
  - one dish that conflicts with a late-added allergy, for the blocked case and the D28 warning.
- Someone has to write these recipes and pick the products before chunks 01 to 04 can be tested.
- **Answer:** **Decided in outline** (Jack, 14 Nov): the seed event is Emma and Lauri's wedding, 180 guests, as set out in the [demo plan](../demo-plan.md), which lists the real products and their stock and prices. The demo plan now also sets the full menu of seven lines, the amount per guest for each, and the order at each stage, all from real catalogue products.

**Q11.2 What dates does the clock use?**
- Recommended, built around what the mock returns:
  - Service: Tue 17 Nov 2026. Delivery: Mon 16 Nov.
  - Scenes 1 and 2: mid-August.
  - Scene 3: Fri 30 Oct.
  - Scene 4: Sat 14 Nov, 17:00, which is 24 hours before the main cut-off.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. Service Tue 17 Nov 2026, delivery Mon 16 Nov. **Changed** (Ben, 14 Nov): service is Wed 18 Nov, so frozen lines, needed two days ahead (Q04.3), still arrive on the mock's Monday. Scenes 1 and 2 mid-August, scene 3 Fri 30 Oct, scene 4 Sat 14 Nov 17:00. At scene 4 the Fri 13 Nov and Terminal cut-offs have passed, so those lines show as blocked: this is the expired cut-off case.

**Q11.3 How is the clock controlled?**
- Recommended: one clock module that every time check reads. A small clock bar with four buttons, one per scene, visible only in test mode. Moving the clock is written to the audit.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. One frozen clock module that every time check reads (no direct system-time reads). A test-mode clock bar with four scene buttons. Every move is written to the audit.

**Q11.4 How is the final-check shortfall produced?**
- Recommended: a saved copy of the real API response for the seed products, with one product's stock lowered below the need. It is stored as a fixture file and marked as a fixture wherever it shows.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. A saved copy of the real API response with one product's stock lowered below the need, stored as a fixture file and labelled as a fixture wherever it shows.

**Q11.5 Which test cases hit the live mock, and which use fixtures?**
- Recommended: the milk request runs against the live mock, to prove the real API works. The event runs on fixtures so it repeats exactly. If the live call fails, the milk request falls back to its own saved fixture and says so.
- **Answer:** **Agreed** (Ben, 14 Nov): the milk request and the blocked path run against the live mock; each falls back to its own saved fixture if the live call fails, and says so on screen. The four-scene event runs on fixtures so it repeats exactly.

**Q11.6 How is the data reset between runs?**
- Recommended: one command that empties the database, re-seeds the hotel, people, mandate and event, and sets the clock to scene 1.
- **Answer:** **Agreed** (Ben, 14 Nov): as recommended. One reset command (CLI, plus a test-mode button) that empties the database, re-seeds the hotel, people, mandate and event, sets the clock to scene 1, and logs the reset as the first entry.

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The mock API is down | Fixtures carry every test case; the screen says fixtures are in use | _open_ |
| Someone types a request that isn't in the seed data | It runs for real against the live mock; an unknown product type asks instead of guessing | _open_ |
| The clock is moved backwards | Allowed in test mode and logged; orders already placed stay placed | _open_ |
| Two runs happen without a reset | The second run's orders are separate; idempotency keys include the run | _open_ |
| A fixture and the live mock disagree | The fixture label stays on screen; nothing is silently mixed in one quote | _open_ |

## Done when

- The three test cases pass from a fresh reset, twice in a row, with the same result.
- Every fixture value on screen carries the fixture label.
- No code reads the system time directly; everything reads the clock module.
