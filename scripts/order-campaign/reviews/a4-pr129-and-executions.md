# A4 independent corpus and execution review

Campaign `api-quality-20261115-c8a4`. Reviewed PR129 head
`45a5f1d3e5f1838b742a36fda4665ed415f2dfdd`, PR124 head
`47939d051c7886d8eebaf117e30dde08ccccc68e`, PR121 head
`a9f9f1c87d894a0e9b899d5b284b8c1587b1d2e0`.

**Approve PR129 as the corrected immutable corpus/oracle contribution. Approve
PR124 as independent audit evidence. PR121 remains blocked for authoritative
semantic scoring.** COMMENT reviews with those explicit verdicts were posted on
all three PRs. Coordinator owns merges; A4 merged or watched none.

V2 tooling can be integrated for archival reproduction after adding a prominent
**SUPERSEDED / NOT AN AUTHORITATIVE ORACLE** label pointing to v3 and the findings.
Preserve the original frozen bytes. Green author tests cannot restore an invalid
oracle, and old responses cannot score revised inputs or setup as v3 successes.

## Independent facts and frozen revision

Read root AGENTS.md, relevant repository/data/approval/PRD docs, source catalogue,
API schema and saved fixture, A1 report, A2 handoff, all changed PR129 files and
runner/host/evidence code. No applicable nested AGENTS.md was found. The independent
review imports no production parser/planner or author oracle. Holdout was read
only for this aggregate audit, never executed or disclosed to implementations.

Manufacturer `net_kg`/`net_l` describe one base unit. The returned API sales unit
determines its multiplier. Rounded comparison prices corroborate within half a
cent; their quotient cannot define an exact physical pack. For example SKU 464856
has 1.6 kg per ST at EUR 25.15: 40 kg requires 25 units / EUR 628.75, not 26 /
EUR 653.90. SKU 463203 has 2 L per sales unit: 40 L requires 20 units. This is a
source-based correction to the older docs' price-ratio preference.

The independent source audit reproduces **339** corroborated original v2 pack
errors, **262 development**, and independently confirms A1-001 HIGH. All 150
conversation and 50 transport v2 rows lack complete exact state contracts,
confirming A1-002 HIGH. This is A4's independent second audit of those findings.
A1-003/004/005 remain supported coverage/guard findings.

| V3 requirement | Independent result |
| --- | --- |
| Stable IDs and split | 1,000, unchanged identity/category/split; 800 development / 200 holdout |
| Categories | ordinary 250, long 200, conversation 150, boundary 150, linguistic 100, resilience 100, transport 50; 20% holdout in each |
| Long count and size | all 200 contain 30Ã¢â‚¬â€œ100 positions; 160 exactly100 |
| Correction and repeats | all 200 have late correction to early L004, compatible/incompatible repeats and circular neighbor independence |
| Ordinary viability |250 primary fixture plans pass independently checked source/diet/date/price/stock facts and spend cap; no observed success rate claimed |
| Product matching |100 name-only requests use unique catalogue names; 50 accepted equivalent sets are catalogue-linked and expressly permitted by the chef |
| Cosmetic uniqueness challenge |1,000 distinct signatures after removing brand, numbers, quantities and IDs; not proof of prose diversity |
| State contracts |200 chained initial/turn/final contracts, including cancellation/scope invalidation, exact pending lines and 15 positive purchase states |
| Revised line conversions |20,214 lines; 7,783 source-verifiable conversions; 12,431 left unknown; 0 independent conversion/state/ledger failures |
| Revision ledger |1,000 original/revised content, input and expectation hashes recompute |
| Original preservation |all original file hashes and original manifest match; preserved original hash ledger matches |
| Revised integrity |all revised file hashes match; all 18 source hashes map to reviewed blobs with their recorded LF/CRLF representation |

The current task checkout includes newer D34 ranking policy; its PRD bytes differ
from the frozen D33 source. Reviewed-head CRLF bytes reproduce the recorded hash.
Five new v3 source files were frozen as LF and checked out as CRLF here. These
representations are explicit in the evidence; no frozen fact was silently updated.
No cheapest-choice, recipe-equivalence or delivery-hour fact was inferred.

## Completed baseline audit

Audited **every1,612 completed observation** in root `baseline/requests.jsonl`:
105,451,913 bytes, SHA256
`a89ba89b27b333da3ad9ff67c628e018c57f63dc8503c479dd35fa53f98ee688`, no malformed
or partial rows. Host SHA `7fe99993cd4dedd31f735d2d119e7a2f9bea96f4`; all
observations are `model-disabled`. Twelve smoke observations repeat cases in a
different run. They are retained as attempts, not counted as new scenario coverage.

| Channel | Attempts | Fail completeness/fields | Ambiguous expectation | Not executed | Pass |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main HTTP |806 |646 |0 |160 unsupported stateful NL flows |0 |
| Simulator |806 |646 |160 incomplete v2 state contracts |0 |0 |

Latest per-scenario results cover800 main +800 simulator executions: 640 failures
per channel; main160 unsupported; simulator160 ambiguous. No application
infrastructure failures were observed in this completed baseline. Gateway has no
natural-language equivalent; explicit structured gateway and injected browser
tests are separate evidence, not extra NL campaign successes.

The development baseline includes92 original exact-100 requests per channel;
all 92 fail completeness on each channel. Rejections remain distinct from complete
interpretation; a safe clarification does not prove all requested positions were
understood. This is v2 coverage, not the revised v3 exact-100 denominator.

Across returned main parses the audit checks 1,220 requested positions against
3,947 parsed positions: 1,212 matched, 8 missing, 217 quantity differences, 424
missing/invalid quantities, 711 lost claims, 828 lost allergen constraints, 99 lost
origins, 16 quantity-incomparable positions and 2,735 unaccounted parsed positions.
Counts include repeated smoke attempts. Missing products are counted separately
from missing per-product constraints; merged compatible repeats are allowed.

**A4-F02 HIGH, baseline dietary constraint loss; second auditor required before
closing an implementation fix.** Development `aq2-ordinary-0002`, observation 1
and its later replay, requires AN/AP avoidance and per-line lactose/gluten
claims. The returned product-bound lines omit those rules while detached
`requirements` fragments carry separate rules/default quantities. This directly
contradicts the supplied text independently of disputed pack arithmetic. Actual
SQL shows no new order or approval. It establishes interpretation loss, not an
observed unsafe purchase or authorization bypass. Owner: parser/interpretation
workers; coordinator assigns independent final reproduction against the fix.

Candidate fact checks inspect86 actual plan candidates. There are0 observed
known-stock assertions contradicting the saved stock fixture, 0 corroborated
manufacturer-pack contradictions, and 0 diet mismatches against the constraints
actually bound to those candidates. The missing constraints above remain
failures. **29 `verified` pack claims lack this auditor's corroborated manufacturer
evidence** and remain an adjudication queue, not 29 proven false claims or passes.
Examples include development `aq2-ordinary-0048` / SKU 474066. No candidate review
can substitute for checking all lines and persisted commit state.

Raw journal coverage: 48,815 complete rows / 200,454,054 bytes, SHA256
`90191950186150913fd69ea61e048074ed7d52b2462e83cd462e1682625d0935`.
Both sides reconcile: 19,709 support HTTP requests/responses and 3,079 execution
HTTP requests/responses; 1,612 case-start/complete pairs across 3 runs.
Execution accounting: 1,111 scenario conversation deliveries, 806 support selection
deliveries, 14 transport retries/replays, 486 parse-to-plan calls, 0 model HTTP calls.
Selection deliveries are identified separately although their raw HTTP role is
execution. Count a primary response once when it is also present in `related`.

## A4-F01: v3 execution evidence gate

**HIGH for state/benchmark validity; runner-owned.** At reviewed runner code,
`snapshots.persistedBefore` precedes the support scope-selection message. Actual
SQL in the completed baseline has `activeOrderId:null` at that point, despite the
declared `scenario.selectActive`. V3 expects the scope already selected. The
runner also records no pre-execution setup hash and no SQL state after each turn.
Initial/final snapshots plus response histories cannot prove every pending
binding, authorized transition or moment of mutation. This is not a source-oracle
defect in PR129. Coordinator should independently confirm the gate before closure.

Actionable runner contract:

1. Apply `scenario.noSeedEvent=true`, `seedLines=false`, actor, mandate, exact
   drafts and delivery date from `scenario`/`stateContract.setup`. Never reuse the
   legacy 2 kg salmon seed for these state contracts.
2. Send support scope selection; capture SQL **after** selection and **before**
   scenario turn0. Verify actual selected scope, empty baskets, zero orders/
   approvals and fixed clock. Bind dynamic IDs to unique scope names.
3. Record frozen input/sequence, manifest hash, fixture hash and canonical
   pre-execution `setupHash`. The exported `setupFor` uses actual SQL selection,
   not declared scenario metadata. Exact matching input and setup are required.
4. Persist SQL after every scenario and replay delivery and reconnect action.
   Include delivery/action IDs, pending scope/site/items/quantity/total/date terms,
   staged plan changes, actual orders/approvals and unique mock receipts.
5. Recheck terms at mutations; compare positive expected effects as well as
   safety invariants. Different input/setup is ineligible or infrastructure
   failure; it cannot be a semantic pass against v3.

The auditor implements the initial eligibility gate and deliberately withholds
full state-contract passes pending per-turn evidence and independent adjudication.
It never edits frozen rows or copies observed responses into expectations.

## Performance and evidence limits

A4 independently reran the existing E2 campaign suite on port 8914, with a fresh
SQLite file and unused auth directory under `A4/e2-independent/`, fixed clock,
fixture/fallback mode and injected fake browser. **16/16 tests pass** at source
SHA `adc91406290660da64154b507ae3135253088e58`; test-source SHA256
`4f5e78d9ac89e0930844c6df73d4cfe5aaa5cfd9cdc18ff1df4677dd853b407e`.
The suite uses the real application factory/coordinator and checks staged/order
state, sender/role isolation, replay and cancellation; external network attempts
are zero. This independently supports these representative synthetic safety and
positive-state passes, including integration's newer cancellation tests. It is
separate from the older 1,612 corpus observations, and proves no real transport,
holdout, v3 corpus or live-model success. `vitest.json`, `run.json`, exact test
snapshot and append-only observations are preserved in that directory.

Read coordinator `latency-baseline.json` and its `latency-check.ts` source.
`modelMode:scripted-model`, 100 ms synthetic delay, 4 scripted model calls and
8 concurrent requests coalesced into 1 call measure cache/coalescing and local
HTTP overhead. They cannot establish live-model latency, supplier performance,
100-item interpretation success or a cross-channel success rate. The artifact
already discloses those limits. A4 case timings are also qualified by mode,
channel, disposition and setup/planning overhead; no speedup claim is made.

External evidence is under
`C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/A4/`:
`early-gate.md`, `source-review-03.json`, `baseline-final-03.*`, posted review
bodies and test logs. Earlier incremental audits and source-review-01/-02 remain.
Source-review-01 over-reported invalid boundary amounts because the first audit
helper conflated known pack content with a valid requested amount; that helper
was corrected, regression-tested and rerun. No frozen corpus was changed.

The tooling is read-only and streamable, preserves append-only observations,
emits verdicts separately and refuses to overwrite audit artifacts. Production
code is unchanged by this contribution. No v3 request or holdout was executed.
