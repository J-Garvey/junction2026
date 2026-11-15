# E2 WhatsApp baseline: api-quality-20261115-c8a4

Production baseline: `0cb5841c4f9e79212dcefce65a6a95784905f2a6`.
Independent expectations are in [E2-expectations.md](E2-expectations.md), saved
externally before execution; E2-14 was specified before its follow-up execution.
Contribution: one test file and these two notes; no production changes.

## Replay

From the repo root, with locked dependencies installed:

```powershell
$env:E2_ARTIFACT_DIR='C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E2/replay-unique'
$env:E2_PORT='8892' # E2-owned; use 0 for an isolated ephemeral CI port
$env:NODE_NO_WARNINGS='1' # Node 22's SQLite experimental notice only
pnpm.cmd --filter @aimo/api exec vitest run test/campaign-whatsapp-baseline.test.ts --reporter=default --reporter=json --outputFile=C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E2/replay-unique/vitest.json
pnpm.cmd --filter @aimo/api typecheck
```

Use `-t E2-12` or `-t E2-05` for the minimized long-input replays. Each case
resets only the suite's run-specific external SQLite database and uses fixed
business/bridge time `2026-11-14T10:00:00Z`. The auth path is run-specific and
unused. No existing profile is read. With no artifact variable, the suite writes
to a fresh OS temporary directory. Observations append; use a new replay path.

The suite reuses the production `createApp()` factory used by the existing
campaign host, without launching its fixed port 8891 or altering another role's
runtime. It mounts the existing Web control router with an injected fake browser,
as existing bridge tests do. Messages enter via the actual `message_create`
listener, which calls the real coordinator/interpreter/gateway. No injection HTTP
route or alternate runner/corpus is introduced. Outbound echoes are injected
before fake send completion to exercise loop suppression.

## Route map and observed behavior

| Surface | Production path / entry | Observed baseline |
| --- | --- | --- |
| Simulator configuration | `GET/POST /api/whatsapp/config` | Pre-person configuration; writes require test mode. Exact fixture group IDs only. |
| Simulator session | `GET /api/whatsapp/session`, `POST /connect`, `/disconnect` | Person-only; cosmetic names do not grant identity; reconnect clears selection and pending state. |
| Simulator message | `POST /api/whatsapp/messages` | Person-only; exact selected group required; direct/other groups reveal no history. ID/text conflicts return 409. Concurrent retries stage once. Old completed retries return current state. |
| Web control | `GET /api/whatsapp/web/status`, `POST /connect`, `/disconnect`, `/groups/refresh`, `/group` | All five reject missing/agent sessions; all five reject another person after ownership is established. Status/QR are no-store. Active work blocks reconfiguration with 409. |
| Web event | `WhatsAppWebBridge` → browser `message_create` | Exact selected group; filters paused, direct, other group/name, old/non-finite time, status/media, blank and senderless inputs. Own echoes do not loop. Linked-phone input works. |
| Real coordinator | `handleWhatsAppMessage` | Preview stages nothing; another sender cannot confirm it. Current controlling outlet scope is rechecked. Two final confirmations create one mock order. |
| Persistence/failure | SQLite + bridge close/new instance/restore | Selected order and delivery guard survive. Pending previews require fresh review. Old credential can be deleted before restore. A lost receipt leaves exactly one order, never reexecuted or resent on replay/restart. |

Web deduplication is by account/upstream ID: a conflicting second body is silently
ignored, with no second operation/reply/error. Simulator conflicts return 409.
`POST /api/whatsapp/web/messages` returns 404: Web messages cannot be injected by
HTTP. Synthetic configuration cannot authorize a real group.

## Findings for I4 (explicit known failures; no production fixes here)

- **E2-F01, Web long-input cancellation:** `cancel`.padEnd(8001) is silently
  dropped before interpretation, without an error or reply. Earlier pending
  state survives; a subsequent `confirm change` stages that earlier salmon
  proposal. Proposed quality semantics: visible rejection and a fresh review
  before confirmation. `E2-12` deliberately records the current behavior; its
  green result is baseline characterization, not acceptance of that behavior.
- **E2-F02, simulator long-input failure:** the same 8,001-code-unit input gets
  HTTP 400 but leaves the earlier pending proposal unchanged. This differs from
  the documentation's blanket statement that a failed request cancels pending
  confirmation. `E2-05` characterizes it explicitly. Both channels accept 8,000
  code units; simulator IDs accept 128 and reject 129. Limits use JavaScript
  string length, not Unicode grapheme count. Neither finding bypasses a new
  explicit confirmation; F01 can silently lose a cancellation.
- **Offline regression limitation:** the unchanged existing
  `whatsapp-orders.test.ts` case “adds to a placed order, removes a placed line
  and sends the additions to finance review” returns 502 at `add 2 kg butter`
  with supplier credentials disabled. It also fails alone. Do not claim that
  full flow passed offline or infer a production root cause from this alone.
  Follow-up `E2-14` reproduces 502, verifies earlier pending state is cleared,
  rejects conflicting ID/text and confirms no products/orders are staged.

I4 should update these baseline characterizations when behavior is changed.

## Evidence and limits

External root: `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/E2/`.
`attempt-07-final/vitest.json`: **14/14 passed**; API typecheck passed.
`attempt-07-final/observations.jsonl`: **321 rows**, including 125 HTTP results,
44 incoming browser events, 26 Web coordinator inputs/outputs and 26 outbound
attempts, plus all 26 outgoing echoes. Non-finite test timestamps are tagged
explicitly in JSON. Two outbound attempts intentionally fail. `run.json` records source
SHA, test-source digest, isolated runtime and zero external network attempts.
`campaign-whatsapp-baseline.test.ts.snapshot` preserves the executed test source.
`E2-F01-minimized.json` and `E2-F02-minimized.json` retain exact inputs, outputs
and relevant state; full snapshots remain in JSONL.

The earlier broader run (`attempt-05-whatsapp-regression/vitest.json`, before
E2-14) passed **206/207** across eight files; the existing butter case above is
the sole failure. `existing-failure-isolated.json` preserves its independent
reproduction. Attempts 01–03 retain harness failures: unavailable
`describe.sequential`, reuse of sockets to a closed per-case server, then a
wording-specific assertion. Attempt 04 passes all original 13 cases. Early
PowerShell console wrappers reported exit 1 on Node's stderr warning even when
Vitest passed; JSON results are authoritative. The final focused run exits 0.

Fixtures, disabled-model fallback and fake-browser evidence are labelled together
in each row; none is real-model or real-browser evidence. Network guards permit
only this suite's loopback origin; supplier/model/context keys are empty. The
broader existing-suite run also disabled keys and pointed the supplier base at
loopback port 1. No real supplier, WhatsApp, pairing or holdout was used. Tokens,
authorization headers and session-creation responses are absent from transcripts.
Restarts replace the bridge/fake browser against the same SQLite connection;
OS-process restart, Chromium behavior and phone delivery remain unverified.
