# Natural-language HTTP campaign

This is a synthetic-only reproducible corpus, HTTP runner and isolated host. It
does not connect WhatsApp Web or contact the live supplier. Independent expected
semantics are authored in `generate.mjs`; the production parser is never used to
create the oracle. Responses are observations, not automatic pass verdicts.

## Fixed development latency benchmark (P1)

`benchmark.mjs` prepares an independent, seeded **development-only** workload and
summarizes evidence produced by the existing host and `run.mjs`. It never opens
the campaign holdout. Run only in your own worktree, port and external directory:

```powershell
node scripts/order-campaign/benchmark.mjs prepare C:/path/P1/fallback-v1
$env:CAMPAIGN_DIR='C:/path/P1/fallback-v1'
$env:CAMPAIGN_PORT='8911'
$env:CAMPAIGN_MODEL='fallback'
$env:CAMPAIGN_PROFILE='1'
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-campaign/host.ts
# A separate terminal, same committed worktree:
node scripts/order-campaign/run.mjs --manifest=C:/path/P1/fallback-v1/workload.jsonl --dir=C:/path/P1/fallback-v1 --port=8911 --phase=p1-baseline --limit=302 --profile
node scripts/order-campaign/benchmark.mjs summarize C:/path/P1/fallback-v1
pnpm.cmd --filter @aimo/api latency:check --out C:/path/P1/latency-scripted.json
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-campaign/benchmark.ts C:/path/P1/fallback-v1/workload.jsonl C:/path/P1/local.json
```

Preparation refuses to overwrite the frozen workload. Seed 20261115 selects
30 lists per band (1–10, 11–29, 30–59, 60–99, 100), with both band endpoints,
then repeats those exact inputs in the same process. Each has web API and
synthetic WhatsApp simulator executions. Two explicit text-limit probes follow.
The runner does not shorten any payload. Metadata includes workload, source,
catalog and fixture hashes. Keep real-model and fake-browser evidence in
different directories. `CAMPAIGN_MODEL=real` uses the existing configuration;
first detect key presence without printing values, then run a bounded manifest.

The generic mix deliberately exposes missing saved supplier fixtures. For a
separate fixture-covered planning baseline, prepare a **new directory** with
`benchmark.mjs prepare C:/path/P1/fixture-sku --fixture-sku`. This preserves the
seed/count mix but uses the known saved salmon SKU 469672 in every line. Its
100-line input is exactly 1998 characters. That workload measures repeated-SKU
planning, not generic catalog search. Never pool these two shapes or relabel a
guarded fixture miss as successful planning. Selecting the simulator basket is
support work, excluded from useful message latency by its actual call ID.

No cold-cache p95 is claimed. The host loads the catalog at startup; only the
first request starts with untouched process caches, and SQLite reset preserves
search/model caches. Pass 2 measures repeat traffic, not guaranteed cache hits.
The local benchmark labels the one catalog-load search separately from 29 new
queries and 30 exact repeats. `latency:check` retains its own scripted-model
label; its small scenario counts do not establish p95s.

Summaries stratify by band, pass, shape, channel and observed outcome. A 4xx
rejection or incomplete line count cannot become a successful parse latency.
Simulator statuses are workflow observations; an auditor must inspect complete
plans and snapshots for semantics. Summaries suppress p95 claims below 30 valid
samples in each resulting stratum, and retain observed quantiles with warnings.

HTTP evidence records headers, first body byte, body completion and completion
after JSON parsing. These routes do not stream useful content: **TTFU is not
separately measurable**, so first byte is never called useful output. Useful
web work sums parse and plan HTTP durations; simulator work is one message HTTP
duration. Execution spans include intervening runner journaling, using the
millisecond wall-clock timestamps. Full case envelopes also include resets,
snapshots and telemetry; setup/discovery and final exports are separate.
Run totals separately record flushed journal/observation serialization + disk
cost. Support HTTP totals and SQL snapshot costs overlap those envelopes.

Opt-in `/campaign/profile` returns payload-free request timing, process CPU/RSS,
and event-loop delay since profiling began; it is absent unless profiling is enabled.
`resJsonSyncMs` measures Express JSON serialization plus synchronous send, not a
pure serialization microbenchmark. Profiles stay in memory until the runner's
final capture. Internal gateway and overlapping parent requests cannot be added
as independent CPU costs. `plan.timings` supplies search/lookup/rank stages when
a plan completes; a failed plan has no invented stage timings. Model telemetry
records actual calls, statuses, elapsed time and usage. No real-model success,
retry count, cache-hit count or semantic accuracy is inferred from a key or
fallback response. Inspect raw evidence; aggregates are not audit verdicts.

## External immutable manifests (campaign v2)

Use the existing host and `run.mjs` directly. `campaign-v2-run.mjs` is a manifest
adapter imported by that runner, not a second runner or a corpus generator.
Do not use `batch.mjs` or `refresh.mjs` for the campaign integration branch:
those legacy helpers track `origin/main` and assume port 8891.

From the isolated, committed task/integration worktree, start a fresh host:

```powershell
$env:CAMPAIGN_DIR='C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/fallback-final'
$env:CAMPAIGN_PORT='8901'
$env:CAMPAIGN_MODEL='fallback'
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-campaign/host.ts
```

The listener binds only `127.0.0.1`. It forces fixture/test mode and the local
gateway URL, disables context.dev, blocks real WhatsApp Web HTTP routes, never
calls bridge restore, and permits no remote fetch except the configured model
when `CAMPAIGN_MODEL=real` is explicitly selected. Supplier fetches always return
503, including fixture misses; redirects cannot escape the guard. Real-model
HTTP bodies and usage are sanitized and recorded rather than mocked. Use a
different artifact directory for fallback, real-model and fake-browser evidence.

Every host gets a new UUID runtime directory, SQLite database and unused auth
directory beneath `generator-runtime/`. `CAMPAIGN_RUNTIME_DIR` can choose an
explicit fresh path. Existing DB files/sidecars and nonempty auth directories
are refused. No saved account/profile is imported. Stop only this host's PID;
restarts intentionally start fresh. Host metadata includes instance ID, SHA,
dirty flag, harness hashes, fixture hash, runtime paths, mode and safe config.
The runner refuses a different SHA, stale runner hash, port or artifact path.

In another terminal, first run the small independent smoke, then a bounded
development sample (the output JSONL path must not already exist):

```powershell
node scripts/order-campaign/test/smoke.mjs C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/smoke-final.jsonl
node scripts/order-campaign/run.mjs --manifest=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/smoke-final.jsonl --dir=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/fallback-final --port=8901 --phase=smoke --limit=12
node scripts/order-campaign/run.mjs --manifest=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/corpus/development.jsonl --dir=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/fallback-final --port=8901 --phase=development-small --limit=2
# Exact replay, with a new run ID and append-only evidence:
node scripts/order-campaign/run.mjs --manifest=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/smoke-final.jsonl --dir=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E1/fallback-final --port=8901 --phase=retry-replay --ids=smoke-gateway-order-retry --limit=1
```

E1 executes only the small smoke/sample; the coordinator owns the full 800+200
execution after integration and independent review. Implementation workers must
not open holdout content. The runner has no built-in holdout path or discovery.

Each JSONL record needs `caseId`, `input`, and independently authored `expected`.
It preserves `channel`, `channels`, `plan`, `sequence`, `itemCount`, `split`,
`primaryCategory`, `scenario` and other metadata. Source bytes are hashed and
never rewritten. Expected objects are deeply frozen before network requests;
a sanitized frozen manifest snapshot and selected executions are saved first.
The original hash is rechecked at completion; a change invalidates the run.
Expected data is never used to construct a request. `--start` and `--limit`
select records before channel expansion; `--ids=a,b` selects exact IDs.
`--channels=main,whatsapp` filters channel executions, while preserving their
original labels and a separate `executionId`. Duplicate IDs and empty selections
fail before requests. One `runner.lock` prevents concurrent resets of one host;
after a forced kill, verify the recorded owner is stopped before removing a
stale lock. Runs are serialized, including real-model 429 backoff.

Channel contracts and deliberate gaps:

| Manifest channel | Execution |
| --- | --- |
| `main`, `api`, `web`, `web-api`, `/api` | Text goes unchanged to `POST /api/messages`; `plan:true` submits the parsed request to `/api/requests` with `reviewing:true`. A missing date uses the documented selected-order fixture date, 2026-11-16. No automatic acceptance. |
| `whatsapp`, `simulator`, `whatsapp-simulator` | Actual local simulator `/api/whatsapp/connect` and `/api/whatsapp/messages`; never the Web transport. Default external-manifest context is one empty selected `Campaign` basket dated 2026-11-16 with the seed wedding removed. Explicit `scenario.drafts/selectActive/person` overrides that context; `seedLines:true` explicitly enables the legacy saved 2 kg salmon fixture. |
| `gateway`, `gateway-v1`, `/gateway/v1` | Explicit structured steps only. The gateway has no natural-language endpoint; text is recorded **unsupported**, with no primary request. |
| Fake-browser/other labels | Recorded **unsupported** here; E2 owns fake-browser execution. |

Natural-language multi-turn sequences on the stateless web API are explicitly
unsupported; they require simulator context or authored structured HTTP steps.
No cross-channel equivalence verdict is inferred. No text or line list is
shortened to fit a route. Actual limits are: web text 1..2000 trimmed characters;
simulator text 1..8000; search result limit 1..50; gateway lookup 1..5000 IDs;
gateway quote 1..1000 lines; server JSON parser 1 MiB. Upstream lookup batches
remain 1000. Oversize web/simulator text and quote/lookup arrays are observed as
safe rejection paths, not successful semantic parses. The 1 MiB behavior is
inspected in source, not exercised by this smoke.

A structured `input` object, or an array of structured `sequence` entries,
uses `path`, optional `method` (`GET`/`POST`), `body`, `saveAs`, `auth`
(`chef`, `approver`, `agent`, `none`) and optional `headers` containing only
`Idempotency-Key`. Only paths within the channel's actual `/api/` or
`/gateway/v1/` contract are allowed; all paths are validated before any step.
Use `{ "$ref": "quote.id" }` to copy a value from an observed response saved
as `quote`; references can also supply `fingerprint` and `approval.id`. This
supports authentic quote/approval/order/retry flows without fabricating IDs,
inferring sales units, or generating requests from the expected oracle.

`raw-observations.jsonl` is flushed append-only **before** each request and
immediately after its complete response/error, including support/reset calls,
exact untruncated bodies and sanitized raw response text. It also contains
frozen case starts, host config, durations, and persisted run initial/final
state. `requests.jsonl` adds one observation per channel attempt, including SQL
snapshots before/after each case with full orders, approvals, quotes, plans,
questions, events and audit rows. Tokens are omitted/redacted. SQL snapshots
avoid state-changing basket GETs. Partial attempts remain in the raw journal
even if later steps or publication fail. Aggregates say `verdict:not_evaluated`.
Per-run summaries include support/execution counts, HTTP status counts, errors,
unsupported executions, supplier/model counters and state snapshots. A guarded
fixture-miss 503 contributes to observed server-error counts; that counter is
not a semantic test verdict. Model-enabled fallbacks remain identifiable from
the actual response and provider telemetry; a configured key is not success.

Checks:

```powershell
node --test scripts/order-campaign/test/*.test.mjs
pnpm.cmd --filter @aimo/api typecheck
pnpm.cmd --filter @aimo/api exec vitest run test/e2e.test.ts test/quote-constraints.test.ts test/whatsapp-orders.test.ts
```

Early E1 evidence lives outside Git under the campaign's `E1/` directory.
The baseline smoke observed fixed-price ordering and one-order idempotency,
spend approval, a non-waivable milk-allergen block, an expired cutoff,
unconfirmed stock refusal, fixture-miss interception and the real-transport
guard. No real-model, fake-browser or full-campaign coverage is claimed here.

## Legacy generated corpus

Run from the repository root on Windows (Node 22.13+, `pnpm.cmd install`):

```powershell
node scripts/order-campaign/generate.mjs C:/path/to/artifacts
$env:CAMPAIGN_DIR='C:/path/to/artifacts'
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-campaign/host.ts
# In another terminal:
node scripts/order-campaign/run.mjs --dir=C:/path/to/artifacts --phase=initial --limit=60
node scripts/order-campaign/batch.mjs --dir=C:/path/to/artifacts --start=60
```

The host defaults to port **8891**, a fresh SQLite database and an unused WhatsApp auth path
under `generator-runtime/<instance-id>/`. The clock is explicitly 14 November 2026 before the
saved fixtures' cutoffs. Do not run against another instance or share its data.
The host overrides the preview gate only on this loopback-only synthetic server.

The global fetch guard returns **503** for any supplier request. Saved-fixture
lookups retain their actual production behavior; a missing fixture can therefore
produce a failed plan rather than a fabricated price/stock result. Every row
labels interception and includes the guard events. No supplier calls escape.

`requests.jsonl` is append-only and flushed per observation. It records exact
input, independent expectations, SHA, channel, mode, HTTP request/response,
planning output (including candidate alternatives, quantities and prices),
conversation sequences, delivery retries and initial/final basket snapshots.
Authentication headers and session creation responses are deliberately omitted.
Support/setup calls are counted separately from natural-language executions.
`generator-status.json` is atomically replaced. Large logs and databases belong
outside Git. Other campaign roles can drain JSONL while the generator works.

By default OpenAI is explicitly disabled to exercise the real fallback path.
Set `$env:CAMPAIGN_MODEL='real'` before starting the host to use its configured
key/model. The harness never supplies model responses. `/campaign/status` reports
whether a key was found, without exposing it. Model telemetry records actual
HTTP outcomes; model-enabled rows that fall back are not model successes. Real
429 responses trigger a ten-second pause. The runner serializes planning and
WhatsApp state, bounding upstream/model concurrency to the production request's
own bounded work.

Use `--model-only --main-only --parse-only --limit=30` for bounded representative parsing
samples; omit `--parse-only` for planning. Use
`--ids=nl-00005,nl-00009` and a new `--phase=final-replay` to replay findings. Main
plans preserve the parsed request; a missing date is supplied by an explicitly
documented selected-order fixture date. WhatsApp scenarios reset only this
database, create Darragh/Pavit/Conference drafts and seed an actual saved 2 kg
salmon line through production HTTP endpoints before each independent case.

Every 100 cases `batch.mjs` fetches `origin`, records its SHA and fix-manifest
sizes, and safely refreshes its **clean committed task branch** if main advanced.
It restarts only the owned host and replays published findings before continuing.
For a standalone refresh, run:

```powershell
node scripts/order-campaign/refresh.mjs refresh --hold
# Separate terminal: replay desired IDs or resume the next batch.
```

Refresh checks ownership before stopping its recorded PID, merges only into this
checkout and restarts only this host with a fresh isolated database. `--hold` keeps the
process alive on Windows tool hosts that clean up detached descendants. Add
`--real` for a real-model restart. `node scripts/order-campaign/refresh.mjs stop`
stops the owned host. This harness never alters primary main or other worktrees.

`summarize.mjs <artifacts-dir>` publishes exact executed counts and pending corpus
IDs without declaring cases passed. Add `--done` only after final latest-main
replay and representative real-model coverage. It counts conversation deliveries
once, separates planning calls/responses, and deduplicates a known transient
Windows status-publication observation by attempt ID. `--cross-channel` replays
selected main seeds in the synthetic chat with an explicitly selected draft.
The nine order-context seeds remove only the default wedding event through
a clearly named fixture-only host endpoint to model zero/one/several baskets.
