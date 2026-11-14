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
| `pnpm test` | 37 tests: rule units, the three PRD test cases end to end and the wedding demo seed, each twice from a fresh reset |
| `pnpm seed [gala\|wedding]` | Fresh database: one hotel, its people, the mandate, the event, clock at scene 1. Without an argument it keeps the last seed (first run: `AIMO_SEED`, default `gala`) |
| `pnpm agent:demo` | An outside agent that uses only `/openapi.json` and its token: search, quote, order, retry, and the refusals |
| `pnpm fixtures:record` | Saves real mock responses for the seed pool to `data/fixtures/aimo/base.json`. Add `-- --add-missing` to record only products not yet saved and merge them in |

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
| `AIMO_SEED` | `gala` | The seed a fresh database starts from: `gala` (PRD test event) or `wedding` (the demo video). The Reset menu in the clock bar switches it |
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

## Seed data (fixture)

Everything below is demo data and is labelled as a fixture on screen. There are two seeds on one engine.

### The gala (PRD test event, default)

- **Hotel Aurora** (fictional), one delivery site, two outlets: Banquet kitchen and Lobby bar.
- **People:** Anna Virtanen (banquet chef), Mikko Laine (bar manager, chef role for the bar), Sara Nieminen and Jonas Berg (approvers for the whole hotel).
- **Mandate:** €5,000 per order before VAT, Monday to Friday deliveries, overshoot asks above both 10% and €25, guest changes within ±5% need no question, price rise tolerance 5%.
- **Event:** Nordic Health Summit gala dinner, Wed 18 Nov 2026, 500 guests: 40 lactose-free, 20 gluten-free, 8 vegan. Salmon soup, bread and butter, cloudberry cream with gingerbread (banquet), coffee service (bar). All products are real catalogue items.

### The wedding (demo seed)

`pnpm seed wedding`, or **Wedding (demo)** in the clock bar's Reset menu. It is the story in [demo-plan.md](demo-plan.md), on the same engine.

- **Demo Hotel** (fictional), site `site-demo-hotel`, outlets Banquet kitchen and Lobby bar. **Aino** (head chef, both outlets) and **Sanna** (finance manager, Approver). Katri is the Valio Aimo viewer (`valio_demo_viewer`); she has no hotel account.
- **Mandate:** €1,950 per order before VAT, guest changes within ±5% need no question, unconfirmed stock always asks, overshoot asks above both 10% and €50 (so the one smallest coffee case doesn't ask).
- **Event:** Emma and Lauri's wedding, 180 guests, no diet groups at booking. Seven lines: salmon 170 g (469672), button potatoes 200 g (460541), Arla lactose-free whipping cream 0.25 L (464727), princess cake one piece (467767), coffee 10 g (460617), Valio Eila 40 L in total (464306), sparkling zero one 12.5 cl glass (477125).
- **Booking (scene 2):** 31 kg, 3, 45, 12, 1, 40 and 5 packs, **€2,003.37**: one card for Sanna, over the cap with four lines of unconfirmed stock. A test checks these figures.
- **Final check (scene 4):** no overlay. The cream's 37 in stock is the mock's real figure.
- **Service date: Wed 18 Nov** (agreed, 14 Nov). On Tuesday the frozen salmon and cake would be needed by Fri 13 (Q04.3), so the mock's Monday delivery would be late (DLV-03).

### Fixtures

- **Fixtures:** `data/fixtures/aimo/base.json` holds real mock responses for 1,096 products, recorded 14 Nov; 572 more (the wedding's cakes, coffee, sparkling and every product named salmon) merged in the same evening. `overlay-final-check.json` lowers one product's stock (464727, 37 → 10) to make the gala's final-check shortfall.

## The three test cases

| Case | What happens | Human decisions |
|---|---|---|
| Milk: "1,000 L of lactose-free milk by Monday" | Inside the lead time, so real stock counts. Real stock covers 435 L (469363: 384, 462775: 51). The other 565 L come from 464306, which has unknown stock. Coffee milks, portion creamers and piimä are left out by type. | 1 (Approver: approve the split and accept the risk) |
| Hotel event, four scenes | 1: 5 green, 5 amber, 1 red (no vegan coffee milk in the category). 2: the red line blocks the order until the bar manager removes it; one Approver card accepts unknown stock on 4 lines; ordered for €1,307.63. 3: 510 guests amends with no question; 600 asks once; a fish allergy for 12 raises the D28 warning on the salmon and the line stays. 4: the final check finds the whipping cream short, the chef gets a side-by-side with Sun 17:00 as the deadline, and the substitute is applied and remembered. At the cut-off the allergy line is flagged to Valio Aimo. | 3, plus 2 confirmations |
| Blocked paths | A Terminal product whose cut-off has passed is refused (`cutoff_passed`), even though the mock shows Monday. A product without the required diet claim can't be approved (`hard_rule`). An order over the cap is refused, then accepted with a bound approval. | none can push them through |

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
| SF-06 ranking | As written, with one clarification: the stock step counts only inside the lead time, because months ahead stock says nothing about the date (D8). |
| Q03.2 Overshoot | Ask only above both 10% and €25. |
| Q04.1 Urgent | 4 days or fewer to the needed-by date. |
| Q04.3 Needed-by | 1 day before service; 2 for frozen (temperature class 7); then back to a delivery day. |
| Q04.6 Accepted risk | Stays with the line and carries over through changes within the guest tolerance (at least one pack). A larger change asks again. |
| Q05.5 Policy language | Plain JSON thresholds checked in TypeScript. CEL is the production path. |
| Q06.3 Grouping | One chef card per question type, one Approver card per quote covering every money and policy item, so the ideal run is one yes. |
| Q08.3 Quote validity | Until the earliest cut-off, at most 24 hours. |
| Q08.6 AP2 | AP2-style, not conformant: a signed standing mandate and a signed per-quote approval. |
| Q08.8 Stock | Simulated orders don't reduce upstream stock. |
| Q09.3 Tamper evidence | Each audit entry stores the hash of the one before it. `chain.ok` is shown on the audit screen. |
| Q11.2 Clock | Scene 1 and 2: 14 Aug 2026. Scene 3: 30 Oct. Scene 4: Sat 14 Nov 17:00, 24 hours before the main cut-off. Delivery Mon 16 Nov, service Wed 18 Nov (moved from Tue 17 so frozen salmon can thaw and still arrive on the mock's Monday). |

## Not built yet

- Capacitor phone builds, Sentry and PostHog (the web app is responsive).
- Mandate and preference setup screens (D18; the mandate is pre-filled).
- Pack mixing across sizes of the same product (Q03.4), CEL, Peppol, MCP and email updates.
- Delivery-date alignment across different available dates (AP-14): the mock always answers Monday, so every line shares one date.
