# Independent execution audit

The auditor reads existing campaign evidence. It starts no host, browser, model,
supplier connection or WhatsApp session and imports no production interpreter or
corpus-author oracle. It never updates observations or frozen inputs. Run from
the repository root; use a new output prefix for every audit:

```powershell
node scripts/order-campaign/audit-executions.mjs `
  --observations=C:/path/baseline/requests.jsonl `
  --corpus=C:/path/corpus `
  --commitments=C:/path/published-commitments.jsonl `
  --output=C:/path/A4/audit-unique `
  --raw=C:/path/baseline/raw-observations.jsonl
node --test scripts/order-campaign/audit-executions.test.mjs
```

Use the commitments extracted from the reviewed Git commit, rather than trusting
an unanchored external checksum manifest. The loader checks the external manifest,
published commitments and each row's content hash. It opens development only by
default. `--auditor` explicitly includes holdout; implementation roles must not
use that option. Audit aggregate source checks may read holdout, but never execute
it or publish its contents. Execution verdict files for a holdout run belong only
in the restricted final-validation artifact directory.

The scanner fixes the input byte boundary at invocation and consumes complete
newline-terminated records, retaining malformed-line failures and excluding a
partial trailing row. It hashes the complete byte prefix. Live appends are left
for the next invocation. Raw-journal and observation boundaries are recorded
separately; reconcile their run IDs if the generator was still running.

Outputs use exclusive creation, so an earlier audit cannot be overwritten:

- `.verdicts.jsonl`: every completed observation, source line, exact input/wire
  hashes, attempt identity, disposition, field differences and SQL effect counts.
- `.scenarios.jsonl`: latest completed disposition for every scenario/channel,
  including missing and unsupported executions. Earlier attempts remain above.
- `.summary.json`: attempt and scenario denominators, channel/mode groups,
  exact-100 request results, line metrics, factual-claim checks, HTTP/delivery/
  planning/model counters, separate raw support counts and qualified timings.

Dispositions are `pass`, `fail`, `ambiguous_expectation`,
`infrastructure_failure`, and `not_executed`. `pass` currently means a complete
independently matched **parse-only** contract. Planned v2 rows cannot pass from
disputed pack arithmetic; v2 conversations cannot pass without exact state
expectations. A rejection or safe clarification does not establish successful
full interpretation. HTTP rejections fail completeness; `safeRejection` separately
requires no observed business-table mutation and no retained simulator pending
authority. Invalid-input safety still needs scenario-specific adjudication.

Line checks preserve product choice, accepted alternatives, dimensions, final
requested amounts, claims, allergens and origins. Compatible repeats can merge;
incompatible requirements require distinct positions. Quantity-incomparable
expectations remain ambiguous. Counts of missing positions and constraints are
separate: a missing product is not also counted as every possible diet failure.
Extra parsed positions are visible. No ingredient density is invented.

Factual checks inspect actual plan candidates against the frozen catalogue and
supplier fixture, checking explicit known-stock and verified-pack claims and
candidate diet requirements. Unsupported pack verification is a separate
adjudication queue; it is not automatically a proven false claim or unsafe order.
SQL snapshots establish actual persistent effects; response prose cannot do so.
Verdicts refer back to source lines containing full original snapshots.

## V3 runner evidence contract

The corrected v3 corpus can score only exact matching observations. In addition
to the frozen input and sequence, the wire payloads must match. Record the
execution manifest's byte hash, fixture hash and `setupHash` before execution.
`setupHash` is `hash(setupFor(observation))` using the exported canonical
projection, with the observation's `snapshots.persistedBefore` captured **after**
support selection. It includes actor, authority, delivery dates, actual selected
scope/pending state from SQL, initial baskets/counts, clock and fixture hash.
The auditor compares those fields with the frozen v3 state contract, rather
than trusting a declared selected scope or response-derived setup.

Use exactly the scenario's drafts, `noSeedEvent`, `seedLines`, person and clock.
Keep fixture content and mandate terms consistent with the freeze. Capture SQL
after each scenario delivery, retry and disconnect/reconnect; record action and
delivery IDs. These are required to adjudicate each before/after state, positive
basket changes, exact pending bindings, approvals, unique orders and receipts.
The current auditor deliberately leaves complete state-contract passes to that
independent adjudication. Missing hashes or mismatched setup fail the execution
gate as infrastructure failures, not application semantic passes.

Main has no natural-language conversation state contract. Gateway requires real
structured HTTP steps; it has no equivalent natural-language endpoint. Fake
browser, simulator, fixture/fallback and real-model evidence stay separate.
Model-enabled fallback is not model success. Mixed case elapsed time includes
setup/planning and is not live model latency or comparable successful throughput.

## Independent source review

`audit-executions-sources.mjs` recomputes conversion facts, coverage and the
original-to-revision ledger without importing author code. Example:

```powershell
node scripts/order-campaign/audit-executions-sources.mjs `
  --original=C:/path/corpus --original-commitments=C:/path/v2-anchor.jsonl `
  --revised=C:/path/corpus-v3 `
  --revised-commitments=scripts/order-campaign/corpus-v3.commitments.jsonl `
  --repo=. --source-ref=45a5f1d3e5f1838b742a36fda4665ed415f2dfdd `
  --output=C:/path/A4/source-review-unique.json --auditor
```

Manufacturer content is per base unit. Multiply by the API sales-unit hierarchy;
use the rounded comparison-price interval only as corroboration. Unsupported or
conflicting content remains unknown. Invalid requested amounts can have known
pack content but cannot create zero/negative pack orders. LF/CRLF and reviewed
Git-blob hashes are reported explicitly; current policy drift is not silently
substituted into frozen expectations. Source review emits aggregate holdout
counts only. Signature collision checks are a challenge to cosmetic uniqueness,
not proof of realistic language diversity or channel equivalence.
