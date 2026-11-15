# E2: channel baseline oracle (authored before execution)

Campaign `api-quality-20261115-c8a4`; baseline `0cb5841`; fixed business and
bridge clock `2026-11-14T10:00:00Z`. Synthetic HTTP and injected fake-browser
events only. No holdout, model, phone pairing or supplier traffic.

| Case | Independent expected semantics |
| --- | --- |
| E2-01 | Simulator chat requires a person; configuration is preview-gated/test-mode. Direct and wrong-group messages expose no conversation and mutate nothing. |
| E2-02 | Two people have separate selection and confirmation state. A bar-only person cannot see or mutate a banquet order. Cosmetic names grant no authority. |
| E2-03 | Add preview does not stage; confirmation stages once. Final preview does not purchase; second confirmation purchases once. Concurrent/replayed IDs cannot duplicate effects. Conflicting simulator ID/text returns 409. Old completed retries return current context. |
| E2-04 | Simulator group changes and reconnect clear context; earlier delivery IDs cannot execute in a new context. |
| E2-05 | Simulator accepts 8,000 UTF-16 code units and rejects 8,001 with 400; 128-character IDs accepted, 129 rejected. Record state after rejection rather than infer it. |
| E2-06 | All five Web controls require a person and become owner-only after connect; QR/status are no-store. No HTTP message injection route exists. |
| E2-07 | Only fresh text events from the exact selected group reach the real coordinator. Paused, other-group, private, history, status, media, blank and missing-sender events do not reply or mutate. Own reply echoes do not loop. |
| E2-08 | Two Web senders have separate pending state. Sender B cannot confirm sender A's preview. The controlling person's current outlet scope limits both senders. |
| E2-09 | Repeated/concurrent Web deliveries run once, including conflicting contents on the same upstream ID. A conflict must not execute the second command. Record whether it is surfaced. |
| E2-10 | Restart retains selection and delivery deduplication, clears pending confirmations and refreshes the controlling credential. Group changes start fresh sender context. |
| E2-11 | A failed outbound preview clears pending state and is never automatically resent/reexecuted. Fresh input must preview again. A successful mutation with failed outbound receipt remains single, including after restart. |
| E2-12 | Web accepts 8,000 UTF-16 code units; larger input does not execute. Record reply/error visibility and earlier pending state. No assertion assumes silent rejection is user-friendly. |
| E2-13 | Web group/disconnect/refresh controls refuse while a real coordinator request is active; after it completes controls work. |
| E2-14 (follow-up) | After the offline regression exposed a failing `add 2 kg butter`, verify before executing this new case: a failed addition must not stage products or leave an earlier preview confirmable. ID/text conflicts still fail closed. This is a safety oracle, not a claim that fixture-only butter planning works. |

Evidence records exact sanitized HTTP inputs/outputs, fake-browser inputs/outbound
attempts, persisted WhatsApp state and order state. Credentials, authorization
headers and session-creation responses are omitted. Tests use production routers,
interpreter, coordinator and gateway. Browser/network transport is explicitly
fake; supplier facts are the repository's labelled fixtures; parser is fallback.

Owned tests: `apps/api/test/campaign-whatsapp*.test.ts`. Reuse the existing
`createApp()` host and the browser interface already used by `whatsapp-web` tests;
do not fork `run.mjs`, campaign host or corpus. Role runtime lives under external
`E2/`, uses port 8892 by default, a run-specific SQLite file and an unused auth
directory. `E2_PORT=0` is available for isolated CI ephemeral ports.
