# I4: oversized WhatsApp input (E2-F01 / E2-F02)

Baseline dependency: PR122, `ddd5f526ba1675e83ee0188f56f760a053914993`.
I4 independently reviewed all three contributed files and reproduced 14/14
baseline characterizations, including both unsafe paths. A comment review on
PR122 records a passing verdict as baseline evidence, not acceptance of the
known failures. Coordinator merges PR122 before this fix; its tests/docs are an
ancestor of this branch.

## Behavior

The 8,000 UTF-16-code-unit limit is unchanged. An authorized oversized message
enters the existing transport queue, passes current credential/group/session
checks and delivery deduplication, and clears only its sender's pending state.
Web returns a fixed short reply through the existing outbound failure/echo
guards. The simulator returns 400, retains the selected order/history, and
records a rejected delivery using a content hash instead of oversized text.
Neither path calls the interpreter, planner or model for rejected text.

Duplicate rejection IDs cannot clear a later preview. Conflicting IDs fail
closed (simulator 409; Web's existing upstream-ID deduplication). Invalid
envelopes, direct/other groups and expired identities cannot cancel authorized
context. Simulator IDs still require 1–128 code units; malformed IDs and extra
fields fail schema validation without session mutation. HTTP JSON size and model
limits are unchanged. No message injection endpoint was added.

## Reproduce

Use a fresh owned artifact directory for every attempt:

```powershell
$env:E2_ARTIFACT_DIR='C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/I4/replay-unique'
$env:E2_PORT='0'
$env:NODE_NO_WARNINGS='1'
$env:AIMO_API_KEY=''; $env:OPENAI_API_KEY=''; $env:CONTEXT_DEV_API_KEY=''
$env:AIMO_BASE_URL='http://127.0.0.1:1'
pnpm.cmd --filter @aimo/api exec vitest run test/campaign-whatsapp-baseline.test.ts test/whatsapp.test.ts test/whatsapp-web.test.ts
pnpm.cmd --filter @aimo/api typecheck
```

The existing campaign suite reuses `createApp()` and actual `message_create`
listeners with an injected fake browser. It owns an ephemeral loopback port, a
run-specific SQLite file and an unused auth directory. Business/browser time is
`2026-11-14T10:00:00Z`. No alternative host, corpus or transport framework is
introduced. E2-05/E2-12 verify reject → confirm change stages nothing. E2-15
verifies reject → confirm order produces a fresh final review without ordering
or changing the basket. Transport regressions cover ASCII/astral Unicode
8,000/8,001 boundaries, active work, retries/conflicting IDs, separate senders,
malformed inputs, replaced simulator connections and uncertain outbound sends.

## Evidence and limits

Evidence root: `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/I4/`.
`observations.md` indexes attempts; each campaign attempt retains its JSON
report, append-only observations, executed campaign-test snapshot and runtime
metadata. Original minimized evidence stays in `E2/E2-F01-minimized.json` and
`E2/E2-F02-minimized.json`. All evidence is fixture/fallback/fake-browser;
there is no real-model, real-browser, supplier or WhatsApp evidence, holdout
access, or performance claim. Bridge restoration is not an OS-process restart.

The existing offline `add 2 kg butter` finance-review case still returns 502.
`butter-fixture-diagnosis.json` and its local diagnostic script show that the
real interpreter produces a butter request and its production shortlist has
23 candidates. SKU `461407` is absent from both price and availability in the
base fixture. `lookup()` requests every shortlisted SKU, then rethrows the
missing-credentials error because a missing SKU cannot fall back to a fixture.
The diagnostic made zero external network attempts. E2-14 retains the failure
and verifies it clears pending and stages nothing. No supplier fallback,
catalogue ranking, fixture stock or failed test was changed to hide it.
