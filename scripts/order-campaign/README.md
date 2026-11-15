# Natural-language HTTP campaign

This is a synthetic-only reproducible corpus, HTTP runner and isolated host. It
does not connect WhatsApp Web or contact the live supplier. Independent expected
semantics are authored in `generate.mjs`; the production parser is never used to
create the oracle. Responses are observations, not automatic pass verdicts.

Run from the repository root on Windows (Node 22.13+, `pnpm.cmd install`):

```powershell
node scripts/order-campaign/generate.mjs C:/path/to/artifacts
$env:CAMPAIGN_DIR='C:/path/to/artifacts'
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-campaign/host.ts
# In another terminal:
node scripts/order-campaign/run.mjs --dir=C:/path/to/artifacts --phase=initial --limit=60
node scripts/order-campaign/batch.mjs --dir=C:/path/to/artifacts --start=60 --end=3748
```

The host owns port **8891**, a SQLite database and an unused WhatsApp auth path
under `generator-runtime/`. The clock is explicitly 14 November 2026 before the
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

Use `--model-only --limit=30` for representative samples. Use
`--ids=nl-00005,nl-00009` and a new `--phase=final-replay` to replay findings. Main
plans preserve the parsed request; a missing date is supplied by an explicitly
documented selected-order fixture date. WhatsApp scenarios reset only this
database, create Darragh/Pavit/Conference drafts and seed an actual saved 2 kg
salmon line through production HTTP endpoints before each independent case.

Every 100 cases `batch.mjs` fetches `origin`, records its SHA and fix-manifest
sizes, and stops if main advanced. With a **clean committed task branch**, run:

```powershell
node scripts/order-campaign/refresh.mjs refresh --hold
# Separate terminal: replay known finding IDs, then resume from reported start.
```

Refresh checks ownership before stopping its recorded PID, merges only into this
checkout, restarts only this host and preserves the database. `--hold` keeps the
process alive on Windows tool hosts that clean up detached descendants. Add
`--real` for a real-model restart. `node scripts/order-campaign/refresh.mjs stop`
stops the owned host. This harness never alters primary main or other worktrees.
