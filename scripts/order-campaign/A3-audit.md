# A3 independent authorization and confirmation audit

Campaign `api-quality-20261115-c8a4`. PR127 reviewed at
`316369667aec8454bcece15927b4b8e165cd6cd4`.

**PR127: APPROVE its scoped oversized-input fix. Campaign core safety:
CHANGES REQUIRED for A3-F01, with coordinator/A4 second audit required.**
This is a COMMENT review because reviewer and author use the same GitHub identity.
No merge or watch is performed by A3. This contribution contains audit tests,
a read-only saved-evidence inspection tool and this report; no production fix.

## Reproduction and independent verification

Before merging PR127 locally, production `apps/api/src/whatsapp/` had no diff
from `0cb5841c4f9e79212dcefce65a6a95784905f2a6`. The pre-fix E2 suite ran
unchanged on owned port **8913**: **14/14 characterization tests passed**.
E2-12 reproduced silently dropped `cancel`.padEnd(8001), surviving pending
state and subsequent staging of the old proposal. E2-05 reproduced HTTP 400
with unchanged simulator pending state. A passing characterization is not
acceptance of that baseline behavior.

After merging PR127, A3 added 17 independent executions to E2's existing
production-router/createApp/fake-browser harness, rather than a new host or
injection API. Final result: **31 normal passes, 2 explicit expected failures**
across 33 executions. The 16 pre-existing fixed E2 executions passed. The
two `.fails` cases are A3-F01 reproductions, **not safety passes**.

The additional checks cover:

- 8,000/8,001 UTF-16 units, non-ASCII whitespace and supplementary Unicode;
  oversized content is not retained in WhatsApp storage.
- Same rejected-ID replay after a new proposal, conflicting text on that ID,
  and actual staging of only the newly reviewed 12 kg proposal.
- Malformed types, missing/invalid identity, unknown groups, other people and
  other Web senders. Another sender's rejection cannot clear sender A's pending
  proposal or confirm it.
- Deterministic held coordinator requests, queued duplicate rejections and a
  following confirmation. Simulator arrivals are observed before releasing the
  held request; no timing sleep supplies the ordering oracle.
- Explicit disconnect/reconnect, retained delivery deduplication, demo reset,
  revoked sessions, and fake-browser uncertainty while sending a rejection.
- Actual persisted plan/basket staging, approvals and orders; role/fingerprint
  approval refusals, changed quantity/total, expired quote, fixed-price retry,
  and idempotency conflict.
- Supplier price, known-stock shortfall, delivery-date and passed-cutoff changes
  at commit, using labelled overlays written only under the owned runtime.

Sources of expected semantics are the pre-authored E2 expectations, E1 smoke
definitions, `docs/human-approval-rules.md`, `GROUND_TRUTH.md`, the relevant
claims/allergens/pack sections of `docs/data-dictionary.md`, and the documented
channel contract. Replies alone never establish
success. Each case records raw messages plus actual SQLite plans, events,
questions, quotes, approvals, orders and WhatsApp state.

## Stable findings

### A3-F01 — HIGH — fresh supplier safety changes are ignored at commit

- **Owner/channel:** gateway implementation owner / coordinator; gateway HTTP.
- **Disposition:** campaign changes required; independent coordinator/A4
  confirmation required before closure. Outside PR127; gateway source has no
  diff from baseline `0cb5841`.
- **Expected:** fresh unknown stock cannot retain a known-stock confirmation;
  fresh sales blocks cannot be ordered. Recheck current supplier safety facts
  before an order, and require a fresh explicit stock decision when applicable.
- **Actual:** both transitions return **201** for the old quote and persist an
  order with `stock={kind:"known",amount:311}`, `riskAccepted=null`. A fresh quote
  reports `unconfirmedStock=["469672"]` for the stock-sentinel transition, or
  `outcome="block"` for `salesBlock=true`.
- **Minimal reproduction:** fixture clock `2026-11-14T10:00:00Z`; quote 1 KG of
  `469672` for `site-aurora`, banquet, delivery `2026-11-16`. After quote, apply
  an external test overlay that changes only (a) `availableAmount` to
  `9999999999`, or (b) top-level `salesBlock` to `true`. Keep price, delivery date
  and cutoff unchanged. Query a fresh lookup/quote to prove the new facts, then
  submit the **original** quote with a new idempotency key and no stock decision.
- **References:** `apps/api/src/gateway/service.ts:264` recheck compares price,
  date, known stock shortage and passed cutoff, omitting the two transitions;
  `:328` uses the original quote's unconfirmed-stock list. Tests `A3-10` in
  `apps/api/test/campaign-whatsapp-baseline.test.ts`.
- **Acceptance:** both old-quote commits refuse with no persisted order; a new
  stock-unknown quote needs explicit continuation and remains unconfirmed;
  sales-blocked stock cannot be approved through. Preserve passing price,
  shortfall, delivery, cutoff and idempotency cases.
- **Exact evidence:** external `A3/A3-F01-minimized.json` and both final
  `A3-F01-reproduction` records, including fresh lookup, original and fresh
  quote, commit response and persisted order rows. Explicit overlay JSON files
  are retained under each run's `explicit-fixture-overlays/` directory.

### A3-F02 — MEDIUM — fallback dietary clauses detach from product lines

- **Owner/channel:** I3 parser owner; A2 should reassess against repaired oracle;
  main web API, disabled-model fallback.
- **Disposition:** existing baseline quality defect; no unsafe purchase observed
  in this representative sample. Does not block the scoped PR127 fix.
- **Expected:** literal product-associated dietary requirements stay attached to
  those products, or the request asks a clear question without fabricating lines.
- **Actual:** baseline `aq2-ordinary-0002` has two explicit product IDs with
  dietary clauses, but parses 11 lines. Both identified product lines have empty
  claims/allergen constraints; clauses become separate lines. Its persisted plan
  is blocked, with zero quotes, approvals or orders. `aq2-ordinary-0010` similarly
  has 15 parsed lines for five intended products and ends `needs_input`.
- **Minimal reproduction/reference:** exact original input, parsed request,
  pre-authored semantics and persisted plan are preserved in
  `A3/saved-evidence-attempt-01/representative-baseline.json`. The original
  `baseline/requests.jsonl` is the execution source. No shortened input was
  represented as independently executed.
- **Acceptance:** replay these literals with independently repaired per-product
  expectations; preserve all allergy/claim associations, line identities and
  quantities, or explicitly clarify; never purchase from the text alone.

### A3-F03 — LOW — blanket failed-request documentation exceeds envelope behavior

- **Owner/channel:** channel documentation owner; simulator HTTP.
- **Disposition:** documented scope limitation, no PR127 blocker.
- **Expected:** the documentation accurately distinguishes an authorized,
  well-formed oversized rejection from an invalid envelope/identity.
- **Actual/minimal reproduction:** preview an addition, then submit a body with
  oversized text plus an invalid 129-unit ID or unknown extra property. HTTP 400
  leaves the existing pending proposal intact. Unknown identities/groups cannot
  clear it either. A3-02 proves this against persisted state. The blanket sentence
  in `docs/whatsapp-demo.md` that a failed request cancels pending confirmation
  therefore remains broader than actual validation behavior.
- **Acceptance:** narrow that sentence to the implemented authorized-message
  failure paths, or separately specify/test broader behavior without enabling
  unauthorized cross-person/group cancellation.

## Saved E1 and representative baseline audit

`A3-inspect-evidence.mjs` reads only the explicitly named baseline log and E1
final-smoke log. It does not open any corpus or holdout path. Five independent
checks against E1's pre-authored smoke semantics passed: milk allergy versus
lactose, unknown stock, expired cutoff, approval/fingerprint/order binding, and
fixed-price same-key retry. It checks persisted rows, not the saved verdict label.

The inspected baseline snapshot contained **1,130 rows** and yielded **11**
representative ordinary, long and conversation observations. Saved source byte
counts and SHA-256 hashes identify the exact read snapshot; the producer was
still appending. The ordinary web plans were blocked/needs-input; sampled long
web requests returned 422 with no plan/order; sampled simulator requests created
no plans/orders. This is **not** a broad semantic-quality pass or an oracle score.
The two dietary-association examples above were cross-checked against literal
inputs, not accepted solely because the corpus expected them.

## Evidence, commands and limits

External root: `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/A3/`.

- `attempt-02-unfixed/`: unmodified pre-fix test snapshot, raw observations,
  runtime metadata and Vitest JSON (14 characterization passes).
- `attempt-03-independent/`: first 11 new A3 executions plus fixed E2 (27 passes).
- `attempt-04-commit-freshness/`: 15 normal passes and 2 expected failures;
  E2 skipped. `attempt-05-final/`: 31 normal passes and 2 expected failures.
- Each run saves its exact test-source snapshot/digest, source SHA, fresh SQLite,
  unused auth path and observations. Attempt 01's Windows shell regex quoting
  failure is retained in `observations-initial.md`; it started no tests.
- `saved-evidence-attempt-01/`: source hashes, five E1 checks and 11 exact samples.

Replay from repo root:

```powershell
$env:E2_ARTIFACT_DIR='C:/path/to/new-A3-run'
$env:E2_PORT='8913'
$env:NODE_NO_WARNINGS='1'
pnpm.cmd --filter @aimo/api exec vitest run test/campaign-whatsapp-baseline.test.ts --reporter=default --reporter=json --outputFile=C:/path/to/new-A3-run/vitest.json
node scripts/order-campaign/A3-inspect-evidence.mjs C:/path/to/campaign C:/path/to/new-saved-audit
pnpm.cmd --filter @aimo/api typecheck
node --test scripts/order-campaign/test/adapter.test.mjs scripts/order-campaign/test/runner.test.mjs
git diff --check
```

API typecheck, five harness adapter/runner checks and diff whitespace checks pass.
Supplier/model credentials are disabled; the loopback fetch guard recorded zero
external attempts. All runs use saved fixtures and fallback parsing; Web transport
is an injected fake browser. No real-model, actual-browser, supplier or WhatsApp
claim is made. No live browser, production injection endpoint or holdout was used.
The previously reported offline butter lookup still returns 502 in E2-14 and is
checked to clear stale pending state; a successful butter workflow is not claimed.
The primary checkout was never operated in or changed by A3.
