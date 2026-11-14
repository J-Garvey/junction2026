# Aimo Copilot: the build

This is the working prototype of the PRD in [docs/prd/](prd/README.md). It covers the core stories: lookup, a fixed-price order, the hotel's mandate and approvals, and the audit trail. The hotel event runs through all four scenes on one simulated clock.

## Run it

You need Node 22.13 or later and pnpm.

```sh
pnpm install
pnpm --filter @aimo/app build      # the web app, served by the API
pnpm start                         # http://127.0.0.1:8787
```

For development, `pnpm dev` runs the API with `tsx watch` and the Vite app on port 5173.

| Command | What it does |
|---|---|
| `pnpm test` | 31 tests: rule units, the three PRD test cases end to end (the wedding twice from a fresh reset), and signature checks |
| `pnpm seed` | Fresh database: one hotel, four people, the mandate, the event, clock at scene 1 |
| `pnpm agent:demo` | An outside agent that uses only `/openapi.json` and its token: search, quote, order, retry, and the refusals |
| `pnpm fixtures:record` | Saves real mock responses for the seed pool to `data/fixtures/aimo/base.json`. `-- --add-missing` records only products not yet saved and merges them in |

### Settings

The server reads the environment, then the untracked `.env.local`, then the tracked `.env`. Keep new keys in `.env.local` (owner-only). The same secrets are in the GitHub repository's Actions secrets (`AIMO_API_KEY`, `AIMO_PORTAL_PASSWORD`, `OPENAI_API_KEY`, `CONTEXT_DEV_API_KEY`, `PREVIEW_PASSWORD`), with `OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` as Actions variables.

| Variable | Default | Meaning |
|---|---|---|
| `AIMO_API_KEY` | from `.env` | Key for the Junction mock |
| `OPENAI_API_KEY` | unset | OpenAI key. Without it the built-in parser and the hand-checked list are used, and the app says so |
| `OPENAI_MODEL` | `gpt-6-astra` | The only model provider is OpenAI |
| `OPENAI_REASONING_EFFORT` | `low` | |
| `AIMO_MODE` | `live` | `live` or `fixture`; the scene buttons switch it |
| `PORT` | `8787` | |
| `AIMO_DB` | `apps/api/var/aimo.db` | SQLite file; `:memory:` for tests |
| `CONTEXT_DEV_API_KEY` | unset | Supplier brand profiles from context.dev at `GET /gateway/v1/products/{id}/brand`. External web data: cached, labelled, never used by a rule |
| `PREVIEW_PASSWORD` | unset | Turns on the preview gate: browsers sign in at `/login`, scripts send `X-Preview-Password`. `/healthz` stays open |

## How it fits together

```text
apps/api/src
  gateway/     Valio Aimo's side: quotes, approvals, orders, amendments, OpenAPI
  agent/       The hotel's side: parse, match, rank, round, questions, events
  rules/       Rule catalogue with stable IDs, and the pure checks both sides run
  aimo/        Adapter for the mock: batching, sentinels, live and fixture modes
  app/         The app's API (/api), "viewing as" sessions, the scene clock
apps/app       React and Vite screens
packages/contracts   Zod schemas: the gateway contract and /openapi.json come from them
```

- **The hotel agent has no back door (Q08.2).** It calls the gateway over HTTP at `/gateway/v1` with its own agent token, like any outside agent. Both run in one Node service on the devbox.
- **Approvals need a person.** `POST /approvals` accepts only an Approver's session token. An agent token gets 403. Each approval is signed (HMAC) and bound to the quote's fingerprint: site, lines, quantities, prices, total and delivery dates.
- **The gateway enforces the mandate and the hard rules itself.** It refuses an order with `mandate_violation`, `hard_rule`, `cutoff_passed` or `quote_stale`. It rechecks price, stock and cut-off at commit. The same `Idempotency-Key` returns the same order.
- **One audit log, hash-chained.** Valio Aimo's view (`viewer=valio`, or the `valio_demo_viewer` token) shows only entries tagged `shared`, without dish, guest or preference details.
- **OpenAI sits only at the edges.** It parses free text into the request object and answers bounded yes/no questions such as "is this plain drinking milk?". It never decides a hard rule. A probability of 0.90 or more counts as a fact, 0.10 or less rejects, and anything between asks a person. Answers are stored and reused. Verified data wins: the hand-checked classification of the 35 lactose-free milks (research/03) overrides the model.

## Open standards

| Standard | Where |
|---|---|
| OpenAPI 3.1 | `/openapi.json`, generated from the Zod schemas that validate requests |
| JWS (RFC 7515), ES256 (RFC 7518), JWT claims (RFC 7519) | Every quote, order, approval and the standing mandate carries a compact JWS, typed `aimo-quote+jwt`, `aimo-order+jwt`, `aimo-approval+jwt`, `aimo-mandate+jwt` (RFC 8725 §3.11) |
| JWKS (RFC 7517), key thumbprint (RFC 7638) | `/.well-known/jwks.json`. Public: any agent verifies without a shared secret. Checked with the `jose` library and with plain `node:crypto` in `pnpm agent:demo` |
| API catalog (RFC 9727) | `/.well-known/api-catalog` links the spec, docs, status and keys |
| AP2 v0.2 (Agent Payments Protocol), aligned, not certified | Quote `jws` = merchant-signed `checkout_jwt`; `checkoutHash` = `checkout_hash`; approval = closed Checkout Mandate (`vct: mandate.checkout.1`); order `jws` = Checkout Receipt (`status`, `reference`, `order_id`). No Payment Mandates: B2B is invoiced on account. Our standing mandate (cap, sites, tolerances) and approval `grants` are extensions; AP2 has no fields for them. Deviation: AP2 has the user sign the closed mandate on a trusted surface; here the gateway signs it as the record of the approver's authenticated decision (production path: the approver's own passkey) |
| Peppol BIS Ordering 3 (UBL 2.1 Order, T01) | `GET /gateway/v1/orders/{id}/peppol`. The wedding order passes the OASIS UBL 2.1 schema and all 54 OpenPEPPOL T01 schematron rules that fire (example: `docs/examples/wedding-order.peppol.xml`). Units map to UN/ECE Rec 20/21 (`EA`, `KGM`, `LTR`, `XCS`, …); outlets go in `AccountingCost` for the cost split. Party IDs (OVT, EAS 0216) are demo values |
| GS1 allergen codes | Allergies name families: tree nuts (AN) also catch almond (SA) and the other nuts; gluten (AW) catches wheat, rye and the rest. "Free from" never outweighs "contains" |

Not claimed: A2A (no A2A endpoint behind an Agent Card), UCP or ACP checkout, MCP (out of scope in the brief).

## Seed data (fixture): the wedding

The seed is [docs/demo-plan.md](demo-plan.md): Emma and Lauri's wedding at Demo Hotel, 180 guests, Tue 17 Nov 2026. Aino (head chef), Sanna (finance manager, €1,950 budget), Katri (Valio Aimo, the read-only audit view). Mikko and Jonas are extra people so routing and first-answer-wins can be shown. Seven real menu lines; frozen lines thaw overnight (a recipe override of Q04.3's two-day default). Fixtures in `data/fixtures/aimo/base.json` are real mock responses for 1,581 products; the final-check shortfall uses the real stock (37 L of cream).

What a full run gives (`pnpm test`, and by hand on the preview):

| Beat | Result |
|---|---|
| Booking | Quantities 31 kg, 3, 45, 12, 1, 40, 5; €2,003.37, as in the plan. Aino gets one question for 4 lines with stock not confirmed (D31) and continues; Sanna gets one card, €53.37 over budget |
| Two weeks out | 194 guests and Onni's tree-nut allergy in one step. The allergy is checked first and the change waits: the princess cake contains almond. Aino replaces it for everyone; Sanna approves the whole change on one card |
| Before the cut-off | 188 guests: applied with no question (inside 5%). Final check: cream 37 in stock for 47 ordered. Aino keeps the 37 and adds 10 L of Valio cream. Result: "Ready · 5 stock not confirmed" |
| Safety drill | Demo-only button: an outside agent orders over budget with no approval; the gateway refuses with `mandate_violation` |

Where the build differs from the demo plan, by rule:

- **The potatoes also stop on Onni's allergy.** Product 460541 has no allergen declaration, and the approval rules say a missing declaration is never safe for an allergy. Aino gives Onni another side. The team can pick a potato product with a declaration, or decide fresh single-ingredient produce is exempt.
- **The replacement cake is the agent's top pick, not fixed to 473522.** The card offers the best two that declare themselves free from tree nuts and are cakes (today: Fazer gluten-free caramel cake first). So totals after the change differ from the plan by a few euros.
- **The coffee case overshoots** (4.4 kg for 1.8 kg, over 10% and €25), so Sanna's first card also names it.

## The milk request (PRD test case 2)

D32 picks Valio Eila (464306): best on reliability (1.0) and price (€1.01/L). Its stock is not confirmed, so the chef is asked to continue (D31), with the confirmed-stock split as the alternative: 435 of 1,000 L from 469363 and 462775, which then goes to the Approver as a partial fill.

## Answers the build had to choose

The PRD left these open. Each choice follows the chunk's recommended answer unless noted. The team can still change them; each is a setting or a small, local code change.

| Question | What the build does |
|---|---|
| Q01.2 Request fields | As recommended. Events carry dishes, ingredients with amount per portion, and disjoint diet groups. An ingredient can name a recipe-approved product per diet group (`variants`). |
| Q01.5 Ambiguity | Known broad words ("cream", "bread", "cheese", "fish") always ask. Other words go to the model; unreachable means ask. |
| Q01.6 Parser failure | Falls back to a built-in parser for the same grammar and tells the user to check the chips. |
| Q02.1 Shortlist | A recipe-approved product is used when it passes every hard rule. Otherwise the line searches its category plus claims, capped at 50. |
| Q02.3 Diet table | Claim first. Without the claim, a diet passes "by declaration" (DIET-05) only when the product has allergen data and none of the relevant codes (lactose: AM, ML; gluten: AW, UW, GB, NR, GO, GS, GK). Vegan needs the claim. |
| Q02.4 Reliability | Three bands as recommended. |
| SF-06 ranking (D32) | Recipe-approved product, delivery reliability band, price per kg or L, then confirmed stock as the last tie-break, then product ID. |
| Q03.2 Overshoot | Ask only above both 10% and €25. |
| Q04.1 Urgent | 4 days or fewer to the needed-by date. |
| Q04.3 Needed-by | 1 day before service; 2 for frozen (temperature class 7); then back to a delivery day. |
| Q04.6 Unconfirmed stock (D31) | The person building the order decides once per product; the choice stays with the product through later changes. The gateway refuses an order with unconfirmed stock unless the order names those products (`continueWithUnconfirmedStock`) and who chose. |
| Q05.5 Policy language | Plain JSON thresholds checked in TypeScript. CEL is the production path. |
| Q06.3 Grouping | One chef card per question type, one Approver card per quote covering every money and policy item, so the ideal run is one yes. |
| Q08.3 Quote validity | Until the earliest cut-off, at most 24 hours. |
| Q08.6 AP2 | AP2-style, not conformant: a signed standing mandate and a signed per-quote approval. |
| Q08.8 Stock | Simulated orders don't reduce upstream stock. |
| Q09.3 Tamper evidence | Each audit entry stores the hash of the one before it. `chain.ok` is shown on the audit screen. |
| Q11.2 Clock | Scene 1 and 2: 14 Aug 2026. Scene 3: Fri 30 Oct. Scene 4: Sat 14 Nov 17:00, 24 hours before the main cut-off. Delivery Mon 16 Nov, service Tue 17 Nov. |
| Spend cap on amendments | An approval covers the order up to its total. An amendment needs a new one only when it raises the total above both the cap and the approved total. |

## Not built yet

- Capacitor phone builds, Sentry and PostHog (the web app is responsive).
- Mandate and preference setup screens (D18; the mandate is pre-filled).
- Pack mixing across sizes of the same product (Q03.4), CEL, Peppol, MCP and email updates.
- Delivery-date alignment across different available dates (AP-14): the mock always answers Monday, so every line shares one date.
