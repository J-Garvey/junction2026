# Chunk 08: Agent Gateway and orders

| | |
|---|---|
| **Owner** | Pavit |
| **Track** | C: gateway, interface, tests |
| **Needs from** | 05 (the mandate), 02 (search fields) |
| **Feeds** | Every chunk that quotes, orders or amends: 04, 06, 07, 09 |

This is the brief's actual deliverable: the interface an outside purchasing agent uses to deal with Valio Aimo.

## What: the stories this chunk delivers

| ID | Tier | Story |
|---|---|---|
| VA-02 | P0 | Answer price and availability with a dated quote so that agents commit to something fixed, not something they re-read |
| VA-03 | P0 | Create orders only from a quote, at its fixed prices, so that prices never drift or get negotiated |
| VA-04 | P0 | Refuse orders that break the hotel's mandate without a matching approval so that I don't have to trust the agent's code |
| VA-05 | P0 | Refuse lines past their cut-off, even when the mock shows Monday, so that no one is promised a delivery I can't make |
| VA-07 | P0 | Publish the gateway as an OpenAPI 3.1 spec with the mock's quirks stated so that any agent can integrate and judges see what we assumed |
| VA-08 | P1 | Recheck price, stock and cut-off at commit so that I never accept an order on stale terms |
| VA-09 | P1 | Allow amendments until each line's cut-off so that changes follow my real rules |
| VA-10 | P1 | Treat the same order sent twice as one order so that a retry never doubles a delivery |
| VA-11 | P1 | Require every call to name the hotel, site and role so that I can check it against the mandate |
| TM-05 | P0 | Send one Valio Aimo order per delivery site and date, with every line tagged by outlet, so that we get one delivery and can still split the costs |

## How: what's already settled

- **One Node service**: Express, Zod validation, SQLite, with the contract published as OpenAPI 3.1 at `/openapi.json`. The app and outside agents use the same gateway. [TechStack, D11]
- **The upstream mock only does lookups.** Quotes, orders, approvals and the audit are ours. [SPEC]
- **A quote is a dated snapshot** of price, availability, cut-off and price validity per line, with an ID. [D11]
- **Orders are created only from a quote, at its fixed prices.** [BRIEF]
- **The gateway enforces the hotel's mandate itself** and refuses an order that breaks it unless it carries an approval bound to that exact quote. [D11]
- **Mandates and approvals follow AP2's mandate shape.** No payments. [D11]
- **Price, stock and cut-off are re-checked at commit**, inside a database transaction, with an idempotency key so a retry returns the same order. [TechStack]
- **Lines past their cut-off are refused**, whatever the mock says. [GROUND_TRUTH 3]
- **One order per delivery site and date**, each line tagged with its outlet. [D27]
- **An outside agent gets its own scoped token.** The server works out hotel, site and role from the credential. [TechStack]

## Functions: the problems to solve

Each function is one problem that can be built and tested alone. "Deterministic code" means the same input always gives the same output, with no model involved.

| Function | Kind | Takes | Returns | It must | Settled by |
|---|---|---|---|---|---|
| `IDENTITY-RESOLVE` | Deterministic code | A session or token | Hotel, site, role and person | Decide on the server. Never trust a value the client sends. | Edge cases |
| `QUOTE-CREATE` | Deterministic code | Lines with quantities, a site, a date | A quote: the `LOOKUP` snapshot per line, an ID, an expiry | Store a snapshot, not a reference. | Q08.3 |
| `QUOTE-RECHECK` | Deterministic code | A quote | Unchanged, or what moved | Compare a fresh `LOOKUP` with the snapshot. | Q08.7 |
| `ORDER-PLACE` | Deterministic code | A quote ID, an idempotency key, an optional approval | An order, or a refusal with a code | One transaction: `QUOTE-RECHECK`, `RULE-EVALUATE`, `MANDATE-CHECK`, the `APPROVAL-BIND` match, then write. | Q08.4, Q08.5 |
| `ORDER-SPLIT` | Deterministic code | Lines with delivery dates and outlets | One order per site and date | Keep the outlet tag on every line. | Q08.10 |
| `ORDER-AMEND` | Deterministic code | An order, the changes | The amended order, or a refusal per line | Refuse lines past their cut-off. Re-run the mandate check. | Edge cases |
| `MANDATE-SIGN` | Deterministic code | A mandate or approval object | The signed object; verifying returns true or false | HMAC with a server key, AP2-style. | Q08.6 |
| `SPEC-PUBLISH` | Deterministic code | The Zod schemas | `/openapi.json` | Generated from the schemas so it can't drift from the code. | Q08.1 |

## Questions to answer

**Q08.1 What are the endpoints?**
- Recommended:
  - `GET /products`: search (chunk 02).
  - `POST /quotes`, `GET /quotes/{id}`.
  - `POST /orders`: from a quote ID, with an `Idempotency-Key` header and an optional approval.
  - `GET /orders/{id}`.
  - `POST /orders/{id}/amendments`.
  - `GET /mandate`, and `PUT /mandate` if setup is ever built.
  - `POST /approvals`.
  - `GET /audit`, filtered by event or order.
- **Answer:** _open_

**Q08.2 Where is the line between Valio Aimo's gateway and the hotel's agent, inside one service?** **Major question: answer first.** Responsibility: Pavit, who builds the core brief functions (`PRODUCT-SEARCH`, `LOOKUP`, quoting and ordering).
- Recommended: two folders in `apps/api` that may not import each other's internals: `gateway/` (Valio Aimo's side) and `agent/` (the hotel's side). The agent reaches the gateway only through the same HTTP routes an outside agent uses. That keeps it honest: our own agent has no back door.
- **Answer:** **Agreed in outline, incomplete** (Jack, team review 14 Nov): our own agent uses the same gateway routes as an outside agent, and we host the gateway ourselves. Still to be written in detail by the owner:
  - where the gateway is hosted and its address;
  - how our agent authenticates compared with an outside agent;
  - whether our agent calls the routes over HTTP or through the same handlers in-process;
  - whether any route exists that only our agent may call, and if so why.

**Q08.3 How long is a quote valid?** The mock can't say anything about a date months away.
- Recommended: until its earliest cut-off, and never more than 24 hours. An order placed months ahead is built from a fresh quote, and the final check re-quotes it.
- **Answer:** _open_

**Q08.4 What states can an order be in?**
- Recommended: draft → awaiting approval → placed → amended (repeatable) → checked → locked once past cut-off. A rejected order ends as rejected. "Unresolved lines" is a flag on the order, not a state.
- **Answer:** _open_

**Q08.5 What does a refusal look like?**
- Recommended: HTTP 409 with a machine-readable code and the reason in words. Codes: `mandate_violation` (with the mandate rule and the approval type needed), `quote_stale` (with what changed and a new quote ID), `cutoff_passed`, `hard_rule` (with rule IDs).
- **Answer:** _open_

**Q08.6 How literally do we follow AP2?** Nobody has read the v0.2 spec in full.
- Recommended: two JSON objects, a standing mandate for the hotel's rules and a per-order mandate for each approval, each signed by the server with an HMAC. The docs say "AP2-style, not conformant". One person spends 20 minutes on the AP2 v0.2 spec before the field names are fixed.
- **Answer:** _open_

**Q08.7 What counts as "changed" at the commit re-check?**
- Recommended: any price difference, stock now below the quantity, a cut-off that has passed, or a delivery date that moved. Any one of them returns `quote_stale`.
- **Answer:** _open_

**Q08.8 Do our simulated orders reduce stock for later quotes?**
- Recommended: no. The mock is read-only, so stock stays whatever it reports. This is stated as an assumption in the OpenAPI description.
- **Answer:** _open_

**Q08.9 Does the gateway call the live mock or saved fixtures?**
- Recommended: an adapter with two modes. Fixtures by default, so test runs repeat exactly, with every fixture response marked as a fixture. Live mode is switched on for the milk request to show the real API working.
- **Answer:** _open_

**Q08.10 What happens to an event whose lines have different delivery dates?**
- Recommended: one order per site and date, linked by the event ID, so the event page shows them together.
- **Answer:** _open_

## Edge cases to rule on

| Case | Proposed rule | Ruling |
|---|---|---|
| The same idempotency key arrives with a different body | Refused with 422; the first order is untouched | _open_ |
| An amendment arrives after a line's cut-off | `cutoff_passed` for that line; other lines can still change | _open_ |
| A product ID doesn't exist | Reported as unknown, which the mock can't tell apart from "not deliverable"; we check the local catalogue first to tell them apart | _open_ |
| More than 1,000 product IDs in one lookup | Split into batches | _open_ |
| The mock times out or returns 403 | The quote fails; nothing is ordered on missing data | _open_ |
| An approval is presented for a different quote | `mandate_violation`; the approval doesn't match | _open_ |
| The token's hotel doesn't match the order's site | Refused | _open_ |

## Done when

- `/openapi.json` describes every endpoint, and lists the mock's quirks as stated assumptions.
- A script acting as an outside agent can search, quote and order using only the published spec.
- An order over the cap is refused with `mandate_violation`, then accepted with a matching approval.
- Sending the same order twice returns one order.
- An order on a line past its cut-off is refused even though the mock shows a delivery date.
