# API quality campaign: stopped-run report

Campaign `api-quality-20261115-c8a4` was stopped at the user's request to finish
and merge the verified work. This is a partial campaign, not a successful
1,000-scenario acceptance or performance claim.

Integration branch: `campaign/api-quality-20261115-c8a4`.
Final PR: https://github.com/J-Garvey/junction2026/pull/135.
Its merge commit identifies the delivered revision.

## Delivered changes

- Oversized authorized WhatsApp messages visibly reject and invalidate only the
  relevant pending confirmation. Replays cannot cancel a newer proposal.
- Order commit and finance approval evaluate fresh supplier facts. Changed stock
  certainty, sales blocks, delivery, prices, cutoffs and policy invalidate stale
  authority. Receipts retain current facts. Amendment consent is bound to the
  reviewed line, quantity, terms, policy and order version.
- Concurrent same-key commits produce one order; concurrent amendments cannot
  overwrite a newer version. App routes preserve supplier error status.
- The existing isolated host and HTTP runner accept frozen external manifests
  and preserve sanitized append-only request/response and persisted-state evidence.
- Independent source and execution auditors, regression tests, corrected corpus
  commitments and an expectation-change ledger support reproducible follow-up.

## Corpus and independent audit

The corrected v3 manifest contains exactly **1,000 distinct IDs**, with **800
development / 200 holdout** scenarios and primary category counts
250 ordinary, 200 long, 150 conversation, 150 boundary, 100 linguistic,
100 resilience and 50 transport. All 200 long requests contain 30–100 items;
160 contain exactly 100. A4 independently reviewed the revised source facts,
state contracts and original-to-v3 ledger. Holdout contents were never executed
or disclosed to implementation and performance workers.

The original freeze remains unchanged. A1 and A2 independently identified 339
corroborated pack-arithmetic errors and incomplete state expectations; A4
verified the correction. Original v2 results cannot establish a valid final
accuracy rate.

| Evidence set | Unique scenarios recorded | Completed channel records | Audit disposition |
| --- | ---: | ---: | --- |
| Original v2 development baseline | 800 | 1,612 including 12 repeated smoke records | 1,292 fail; 160 ambiguous expectation; 160 not executed/unsupported; 0 pass; 0 infrastructure failure |
| Stopped v3 fallback run | 584 | 1,047: web 464, simulator 583 | All 1,047 ineligible as infrastructure/evidence failures; 393 additional development channel targets not executed |
| Stopped v3 model-enabled run | 118 | 236: web 118, simulator 118 | All 236 ineligible as infrastructure/evidence failures; 1,204 additional development channel targets not executed |
| Holdout | 0 of 200 | 0 | Not executed |

These rows are separate revisions/modes and overlap in scenario IDs; do not add
their unique-scenario counts. V2's 1,600 latest channel targets contain 1,440
actual executions and 160 unsupported web conversation operations. Its latest
web dispositions are 640 fail / 160 not executed; simulator dispositions are
640 fail / 160 ambiguous expectation. Those are whole-request completeness
verdicts, not proof of unsafe orders.

V3 is missing recorded setup/fixture hashes and per-turn SQL evidence required
by the independent auditor. Its infrastructure verdicts concern that evidence
gate, rather than asserting every HTTP request failed. Fallback recorded one
additional started attempt without a completed observation; model-enabled
execution recorded one additional started attempt with an unanswered HTTP
request. Both remain in raw logs.

Original v2 raw evidence has 19,709 support and 3,079 execution HTTP exchanges,
1,111 conversation deliveries, 14 retry deliveries and 486 parse-to-plan calls.
V3 fallback has 13,327 support and 2,216 execution exchanges. V3 model-enabled
has 2,846 support exchanges and 473 execution requests / 472 responses.

## Exactly-100-item results

The original development baseline executed 92 such scenarios on each channel;
all failed whole-request completeness. The stopped v3 fallback run recorded 123
on each channel, all ineligible under the evidence gate. No v3 real-model
exactly-100-item result or holdout result was obtained. HTTP limits and safe
rejection were measured; rejection is not full interpretation or fulfillment.

## Model and performance evidence

The stopped v3 real-model host recorded **120 actual provider calls, all HTTP
200**, with 108,747 input and 30,464 output tokens (139,211 total). Completed
scenario observations account for 119 of those calls; the remaining call belongs
to interrupted work. Model-enabled simulator records with no model call are not
claimed as independent model interpretation successes.

P1 also preserved a three-provider-call smoke and separate fixture/fallback,
scripted-model and fixed-workload profiling artifacts. The existing
`latency:check` passed with a scripted 100 ms model delay. No independently
verified before/after optimization, successful 100-item throughput improvement,
cost improvement or final accuracy improvement is claimed. P1's unfinished
benchmark contribution was not merged.

## Verification and remaining work

The independently replayed gateway and confirmation regressions pass, including
the original stale-known-stock to unknown-stock / sales-block reproductions.
I3 reported 188 targeted passes. The coordinator's first full integrated run
passed 559/563 API tests and 58/58 app tests; four failures are pre-existing
offline fixture-dependent chicken-burger, Monster, duck and eggs flows. Their
assertions were not weakened. Full typecheck, build and 51 corpus/harness/audit
tests passed. After incorporating newer main changes, typecheck and build
passed again; the app suite passed 68/68. The combined full suite showed the
same four offline failures and was stopped during wind-down without a final
API total. A separate final safety, end-to-end and plan-integrity replay passed
**96/96 tests** on the combined code. Results are recorded in the linked PR and
external `coordinator/final-combined-*.log` files.

Open findings and coverage gaps:

- **A4-F02 / A3-F02, high:** fallback parsing can detach item-specific dietary
  clauses. Sampled requests failed closed; no committed unsafe order was shown.
  I1 was stopped before a reviewed fix was delivered.
- **A4-F01, high:** setup hashes and per-turn persisted evidence remain required
  before v3 state scoring. E4 was stopped before reviewed closure.
- Full v3 replay, holdout execution, complete failure-injection/transport corpus
  coverage and final cross-channel equivalence are unfinished.
- Four offline fixture-dependent repository tests remain failing.
- No performance optimization workstream was completed and independently verified.

## Worker contributions

At most three workers ran alongside the coordinator. Twelve of the sixteen
requested roles started: nine completed and three were stopped. I2, P2, P3 and
P4 were not started when the user ended the campaign.

| Role | Contribution PR | Disposition |
| --- | --- | --- |
| E1 | https://github.com/J-Garvey/junction2026/pull/123 | Integrated |
| E2 | https://github.com/J-Garvey/junction2026/pull/122 | Integrated |
| E3 | https://github.com/J-Garvey/junction2026/pull/121 | Superseded by corrected v3; not merged |
| E4 | No completed PR | Stopped; work preserved |
| A1 | https://github.com/J-Garvey/junction2026/pull/124 | Integrated |
| A2 | https://github.com/J-Garvey/junction2026/pull/129 | Integrated |
| A3 | https://github.com/J-Garvey/junction2026/pull/131 | Integrated |
| A4 | https://github.com/J-Garvey/junction2026/pull/136 | Integrated |
| I1 | No completed PR | Stopped; work preserved |
| I3 | https://github.com/J-Garvey/junction2026/pull/142 | Integrated after coordinator review and replay |
| I4 | https://github.com/J-Garvey/junction2026/pull/127 | Integrated after independent audit |
| P1 | https://github.com/J-Garvey/junction2026/pull/130 | Unfinished draft; not merged |

## Artifacts and replay

Large synthetic evidence, databases, original/revised manifests, checksums,
rejected attempts, audit verdicts and stop receipts remain outside Git at:

`C:/Users/benfh/junction-trials/api-quality-20261115-c8a4`

Start with `coordinator/stopped-coverage.json`,
`A4/baseline-final-03.summary.json`,
`coordinator/v3-baseline-stopped-audit.summary.json`,
`coordinator/v3-real-baseline-stopped-audit.summary.json`, and the role handoffs.
`coordinator/requested-stop.json` identifies the owned processes stopped.

Use `scripts/order-campaign/README.md` for guarded-host launch and exact-manifest
replay, and `scripts/order-campaign/audit-executions.md` for independent scoring.
Always use a new port/runtime/DB/auth directory and the fixed fixture clock.
Repair A4-F01 before interpreting a future v3 state verdict as an acceptance.
Do not run the hidden holdout until a subsequent final-validation gate.
