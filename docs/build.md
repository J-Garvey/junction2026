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
| `pnpm test` | 59 tests: the live console with a scripted model, rule units, the three PRD test cases end to end (the wedding twice from a fresh reset), and signature checks |
| `pnpm seed` | Fresh database: one hotel, four people, the mandate, the event, clock at scene 1 |
| `pnpm seed:demo` | Populated hotel workspace: seven bookings, a signed order, pending finance/stock decisions, a returned review, an allergen block and draft menus. See [demo seed data](demo-seed-data.md) |
| `pnpm agent:demo` | An outside agent that uses only `/openapi.json` and its token: search, quote, order, retry, and the refusals |
| `pnpm fixtures:record` | Saves real mock responses for the seed pool to `data/fixtures/aimo/base.json`. `-- --add-missing` records only products not yet saved and merges them in |

### Settings

For a populated walkthrough, use **Demo settings → Load hotel workspace**. It replaces the demo database with fictional hotel activity at 11 Nov, 10:00 Helsinki, while keeping the wedding ready to start. **Reset demo** retains the original scene-1 wedding-only reset. See [the preset contents and recording instructions](demo-seed-data.md).

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

## The live console (the demo screen)

`/live` opens one split screen. The design is in [designs/aimo-agent-gateway-rebuild.md](designs/aimo-agent-gateway-rebuild.md).

- **Left: the hotel agent.** A real `gpt-6-astra` agent with tool calling. Its only tools are the gateway's operations (`GET /products`, `POST /lookup`, `GET /mandate`, `POST /quotes`, `POST /orders`), called over HTTP with the hotel's agent token. Two more tools stop the run and show a one-tap card: the chef decides on stock Valio Aimo can't confirm (D31), and Sanna approves anything outside the hotel's rules with her own session token.
- **Right: Valio Aimo's gateway.** Every call to `/gateway/v1` appears as a row with the gateway's own verdict: ALLOWED (signed), NEEDS APPROVAL, ASKS CHEF, APPROVED or REFUSED with the rule. Tap an order to see the signed record, check its ES256 signature and open the Peppol XML.
- **Send unvetted agent** runs a script that holds the hotel's token and orders €2,387 of salmon with no approval. The gateway refuses it (`mandate_violation`).
- **Reset** reseeds the database, sets the clock to Sat 14 Nov 12:00 Helsinki (before Sunday's cut-off) and uses the saved fixtures, so runs repeat.

Code: `apps/api/src/live/` (agent loop, gateway feed, `/api/live` routes with one server-sent event stream) and `apps/app/src/live/`. `test/live.test.ts` runs the whole flow with a scripted model. The hotel app stays at `/`.

On an order page, **Submit order for review** sends the current basket to the finance approval queue (`POST /api/baskets/{id}/submit-review`). Repeated submissions return the same pending review. Finance can approve or return it to the order builder; approval signs the combined quote and places staged items through the gateway, which rechecks the terms at commit. Items already ordered are shown for context and are never placed again. Adding items replaces the pending review, so the updated order must be submitted again. Empty orders and unresolved product or delivery issues cannot be submitted. An approval inside the mandate carries an empty list of policy exceptions.

Event, request, staged basket and saved receipt lines show an informational **product-group average** carbon estimate or **No carbon estimate**. Estimates use the actual whole sales quantity, including rounding, multiplied by checked kilograms per sales unit and the catalogue's kg CO₂e/kg factor. Mass must come from a KG sales unit or a KG price comparison checked by the existing pack conversion; litres, piece counts and unverified catalogue conversions do not establish mass. A piece-based request can still have a checked kilogram sales pack. The optional `carbonBasis` is saved on candidates, plan lines, quotes and orders; older snapshots without it show no estimate, since their cached `co2Kg` may have treated litres as kilograms. Shared dish rows label the whole shared line, and removed rows show no active estimate. Carbon does not affect ranking, policy, approval binding or order totals.

The order input adds verified **exact matches** directly, without opening item review. Exact matches require the requested amount in verified whole packs, enough known stock, a valid price, delivery in time, an open cutoff and no rules requiring a decision. If any item needs attention, the review dialog opens: matching rows stay compact and only exceptions require approval. Supporting facts and alternatives are available through **View details**; dietary facts load only when the details are visible and the request has dietary requirements. Exceptions expand for review, including the builder's choice to continue with visibly unconfirmed stock. A missing pack conversion asks for explicit whole sales units and shows their checked price before approval. Adding rechecks supplier terms and opens review if they changed. Diet failures, unavailable delivery and expired cutoffs stay blocked. Final finance approval still applies to the complete order.

The manager's final order card shows **Waiting for approval**, **Order**, and **Refuse order**. Refusal confirms a required note (1–2,000 trimmed characters) through the existing question-answer endpoint: `POST /api/questions/{id}/answer` with `{ "optionId": "reject", "note": "What needs changing" }`. It returns the basket for editing and resubmission; it does not cancel supplier orders. The note is saved as `question.answerNote`, shown to the builder on the order page and in **Order review history**, and included in the hotel's audit decision. Cancellation sends nothing; the first accepted answer wins. The panel's **Review expires in** countdown is the saved review deadline, constrained by quote validity and cutoffs. It is separate from the supplier **Order by** summary, which may be later, partial or unknown. Expired reviews require a fresh submission.

Opening a pending request on an order uses that same review dialog. Saved proposals start with **Review items** (`POST /api/plans/{id}/review-items`), which rechecks their terms without placing an order or hiding the request. **Suggest replacements** shows matching alternatives; selecting one rechecks the plan and clears approvals when terms change. Expanded details include pack evidence, stock, delivery, cutoff and relevant catalogue dietary declarations. A piece count in the name of a product sold by kilogram is not a pieces-per-kilogram conversion: the builder specifies the sales quantity. Item review, replacement and staging enforce outlet scope; final finance decisions keep their existing role checks.

Order cards and order details show **Order by** from the original supplier schedules saved with their items. Each product needs enough confirmed stock in its sales unit by the intended delivery date, including repeated quantities across requests. The latest feasible full-quantity schedule is used for each item; the earliest of those cutoffs constrains the basket. Alternative schedule amounts are never added together. Earlier supplier availability keeps its original cutoff: the demo adapter's projected dates do not establish a later ordering deadline. Missing evidence or unknown stock shows **Unknown**; blocked schedules, insufficient quantity or incompatible dates show **Unavailable**; a passed proven cutoff shows **Expired**. Older saved snapshots without the original evidence remain unknown until the items are checked again through the existing workflow. Card reads make no supplier lookup calls, and fixture evidence is labelled.

Cards show chef and manager approval rows only for pending decisions, and omit the waiting footer when none remain. **Confirmed** and a green border require actual committed orders covering every active request, confirmed stock and delivery evidence, no pending decisions, and no outstanding warnings or final-check issues. Continuing with unconfirmed stock records an order but does not confirm fulfillment. A previously confirmed order stays confirmed after its ordering cutoff passes.

Managers and finance approvers land on **Approvals & spend**, with their own unexpired decisions first, submitted final-order totals, placed supplier spend, and links to receipts, rules and the audit log. Submitted totals can include already placed items and are labelled accordingly; they are not added to placed spend. Order details put the financial summary and submitted exceptions ahead of the approval controls and item list. Building orders remains in the chef's view. Chef and bar users keep **Submit order for review** to send the basket to finance. Only the finance approval action is labelled **Order**; it uses the existing approval and supplier checks.

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
- **Demo Hotel's Finnish-origin fish rule is signed account policy.** The mandate's optional `categoryOriginRequirements` lists exact catalogue codes; search, ranking, quotes, commit and amendments enforce it alongside request constraints. Unknown origin fails `ORG-01`. The Rules page shows the scope; [category-origin-policy.md](category-origin-policy.md) documents the saved evidence, mixed category contents and compatibility with older mandates.
- **Proposals use the current automatic shortlist; staged baskets validate their selected products directly.** Submitting and approving a basket preserve an accepted matching SKU even when a name such as "monster" now requires clarification for automatic picking, or the SKU falls outside the search result limit. Missing products, broken request links, conflicting product identities and dietary failures still block submission. Supplier terms are quoted again and rechecked at order commit.
- **One audit log, hash-chained.** Valio Aimo's view (`viewer=valio`, or the `valio_demo_viewer` token) shows only entries tagged `shared`, without dish, guest or preference details.
- **OpenAI sits only at the edges.** Literal product lists such as `40 l lactose-free milk`, `10 kg chicken burger` and `milk` are routed and parsed locally. The local path accepts only understood product/form vocabulary, quantities, supported diet claims and an optional date suffix; allergy instructions, unfamiliar wording and other language go through the model. It also answers bounded yes/no questions such as "is this plain drinking milk?". It never decides a hard rule. A probability of 0.90 or more counts as a fact, 0.10 or less rejects, and anything between asks a person. Answers are stored and reused. Verified data wins: the hand-checked classification of the 35 lactose-free milks (research/03) overrides the model.
- **Search latency:** a bounded cache reuses local catalogue matches with the same text and filters across page sizes (up to 50), including the match recheck when staging a proposal. Validated model interpretations and message routes are cached in memory for five minutes, with at most 128 responses of 100 KB each; identical in-flight model calls share one network request. Keys include the exact input, prompt, schema, model, effort and credential configuration. Each caller gets its own copy; relative date words are resolved anew and request line IDs stay unique. Failed model calls and invalid interpretations are not retained. Independent item ranking runs with at most four active needs per plan. These caches hold no price, stock, cut-off, confirmation or approval facts. Supplier lookup and quote creation still fetch their own terms, and order commit still rechecks them. Plan timings separate `searchMs`, `lookupMs`, `rankMs` (including product-type classification) and `quoteMs`; `totalMs` includes quote creation. Message parsing happens in the preceding `/api/messages` call and is outside those plan timings. Model calls have a 20-second default timeout; supplier calls have an 8-second default timeout. Fixture mode may still call the supplier for products absent from the saved fixture.

The home request input and add-to-order input prepare searches after a 600 ms typing pause. `POST /api/messages/prepare` requires the same person session as submission and accepts `{ text }` (1–2,000 characters). It warms the existing interpretation and local shortlist caches and returns `{ ok: true }`. The browser keeps at most one preparation request active, coalesces queued drafts to the latest text, skips drafts shorter than three characters, and cancels pending preparation when submitting or clearing. Preparation failures stay silent; Search uses the normal submission path immediately. Exact-input model calls already in progress are shared. Submission resolves relative dates again, creates fresh line IDs, applies the current person's site/outlet scope and records the audit entry. Preparation never creates plans, questions, quotes, approvals or orders, and makes no supplier calls. All price, stock and cutoff checks still run on submission and commit.

Run `pnpm --filter @aimo/api latency:check` for an isolated HTTP and catalogue benchmark with a scripted model and no supplier calls. Add `--live-model` to measure the configured OpenAI model, `--search-only` for catalogue work alone, or `--out <path>` to save measurements and result hashes. The report distinguishes the first request from repeated requests and records model call counts, code revision and whether tracked files were modified. These small local samples are diagnostic, not a production latency guarantee.

### Stage processing totals

Request results, item review and event results show one saved `processing` total with the milestone actually reached: chef input, a blocked result, review, approval, an applied change or a completed check. The server measures each submitted call with `performance.now()`, from authenticated dispatch until the computed result has been saved, before response serialization. A request includes the preceding submitted message's parsing time when its `parseAuditId` resolves to that person's saved audit evidence; direct requests and older snapshots omit missing parsing measurements. Quote creation is included. A resumed decision adds only its processing call, excluding time spent reviewing chips or waiting for chef/finance decisions. An explicit request edit or event-stage action starts its own total. Reading a saved result or moving the fixture clock cannot restart it. Browser transport/rendering and speculative preparation are outside this server-processing measurement. Existing `Plan.timings` and gateway-call measurements keep their separate scopes.

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
| Booking | Quantities 31 kg, 3, 45, 12, 1, 40, 5; €2,003.37. Aino gets one question for 4 lines with stock not confirmed (D31) and continues; Sanna gets one card, €53.37 over budget |
| Two weeks out | 194 guests and Onni's tree-nut allergy in one step. The allergy is checked first and the change waits: the princess cake contains almond. Aino replaces it for everyone; Sanna approves the whole change on one card |
| Before the cut-off | 188 guests: applied with no question (inside 5%). Final check: cream 37 in stock for 47 ordered. Aino keeps the 37 and adds 10 L of Valio cream. Result: "Ready · 5 stock not confirmed" |
| Safety drill | Demo-only button: an outside agent orders over budget with no approval; the gateway refuses with `mandate_violation` |

Where the build differs from the demo plan, by rule:

- **The potatoes keep a missing-data concern (D35).** Product 460541 stays in the wedding seed. Aino is asked explicitly about tree nuts and the affected guest and can continue or pick another product. Continuing keeps **allergen data not confirmed** on the event, order, result summary and hotel audit. A change to the relevant guest scope, quantity or quote terms requires another chef decision. Contains, may-contain, explicit UNDECLARED and diet failures stay blocked. See [the D35 interface and checks](missing-allergen-data.md).
- **The replacement cake is the agent's top pick, not fixed to 473522.** The card offers the best two that declare themselves free from tree nuts and are cakes (today: Fazer gluten-free caramel cake first). So totals after the change differ from the plan by a few euros.
- **The coffee case overshoots** (4.4 kg for 1.8 kg, over 10% and €25), so Sanna's first card also names it.

## The milk request (PRD test case 2)

The automatic pick prioritises price: 1,000 L of Valio Eila (464306), with unconfirmed stock visibly disclosed. The chef decides whether to continue (D31); keeping only the confirmed 435 L from 469363 and 462775 remains an alternative and requires partial-fill approval.

**Selection funnel** opens under each searched need in the event's dish view, under the request's candidate table, and through **View details** in item review. For the 40 L lactose-free milk line, each stage uses the saved bounded shortlist and actual ranking exclusions; opening it lists product IDs, names, rule IDs and reasons. A product removed at both cutoff and type checks counts once, with both saved reasons visible. Product-type evidence preserves uncertain verdicts, probabilities, thresholds and recorded sources. The final ranking lists every retained candidate and marks products selected in the plan separately from alternatives. Ranking does not confirm stock or approval. Recipe-pinned lines such as the seeded salmon do not claim a search funnel. Older snapshots without a trace show only saved evidence and explain that the original shortlist cannot be reconstructed.

## Answers the build had to choose

The PRD left these open. Each choice follows the chunk's recommended answer unless noted. The team can still change them; each is a setting or a small, local code change.

| Question | What the build does |
|---|---|
| Q01.1 Event intake | A table editor on the order page ("From a menu"): dishes, ingredient, amount per guest or in total, unit, diet groups and which dishes they eat, head count, and an explicit "allergies and diets are complete". Saved with EDIT-GUARD. "Generate order" scales each ingredient by the guests who eat that dish, combines identical needs across dishes (each dish's share kept), and sends the result through the same review, basket and finance approval as a typed product request. No file upload or paste import. All dishes are ordered under the chef's outlet. |
| Q01.2 Request fields | As recommended. Events carry dishes, ingredients with amount per portion, and disjoint diet groups. An ingredient can name a recipe-approved product per diet group (`variants`). |
| Q01.5 Ambiguity | Known broad words ("cream", "bread", "cheese", "fish") always ask. Other words go to the model; unreachable means ask. |
| Q01.6 Parser failure | Falls back to a built-in parser for the same grammar and tells the user to check the chips. |
| Q02.1 Shortlist | A recipe-approved product is used when it passes every hard rule. Otherwise the line searches its text, category and claims, capped at 50. Unmatched qualifiers remain unmatched; there is no category-only fallback. Mention-only results cannot be automatic picks. Meat and dairy requests exclude plant analogues unless explicitly requested by text or claim. These identity exclusions never establish dietary or allergen safety. |
| Q02.3 Diet table | Claim first. Without the claim, a diet passes "by declaration" (DIET-05) only when the product has allergen data and none of the relevant codes (lactose: AM, ML; gluten: AW, UW, GB, NR, GO, GS, GK). Vegan needs the claim. |
| Q02.4 Reliability | Three bands as recommended. |
| SF-06 ranking (D34, supersedes D33) | Preserve priced explicit buyer/recipe choices. Automatic picks: price per kg or L, reliability, then product ID. Stock does not affect rank; unknown stock stays visible and requires the builder's decision before ordering. Missing prices always last and blocked from ordering. |
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
