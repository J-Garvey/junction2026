# Gstack completion review — 15 November 2026

This follow-up closes the verified gaps left after the initial UI review. The independent visual baseline contains 158 captures at `d53447e`; the independent security review used Claude Opus 5.5 and an isolated fixture probe. All runtime work uses synthetic Junction data. The primary checkout is a clean main mirror; implementation is isolated on `improve/gstack-complete-review-20261115`.

## Changes

- Each checkout quote can create one order. The consumption check runs inside the existing order transaction, including competing submissions with different keys. An exact retry still retrieves the original order; a new key receives `409 quote_consumed`.
- Server-resolved person identity controls quote, approval, order, amendment, plan and event outlet scope. Optional refreshed basket views on mutation responses obey the same read scope as the basket page without removing authority to contribute one's own items.
- Financial approvals from the real WhatsApp Web group transport stay in the app, including persisted pre-fix confirmations. The authenticated synthetic simulator retains its fixture flow. This is security maintenance of the existing channel, not an expansion of product scope.
- Stock continuation uses main's server-issued chef consent bound to exact terms; caller-supplied names are ignored. A verified chef acknowledgement for missing allergen data remains a separate, signed record.
- Supplier viewer tokens receive main's allowlisted trade projections, with hotel policy, dietary context, names and full signatures withheld. Malformed cookies and unequal UTF-8 password lengths receive ordinary authentication refusals instead of server errors.
- Successful same-route request parsing opens fresh editable chips. Workspace refreshes retain edits. Bootstrap failures offer reload, failed decision reads offer retry and never claim an all-clear, and pending request/event lists announce loading.
- The Live console reflows on phones, confines its activity table's horizontal scroll, exposes order records to keyboard users, contains dialog focus and restores it on close. Reduced motion is respected and the connection indicator reflects the stream's actual state.
- Intended Plex and Source Code Pro fonts are bundled locally with their licenses. Stock/fixture badges are at least 12px. Receipt amounts stay on one line, receipt headings are distinct, the audit filter retains a visible label, and links/status controls meet the sampled contrast checks.
- Basket and item-review API tests use explicit synthetic supplier fixtures. Catalogue alternatives outside those fixtures are unavailable. No live supplier credential or invented production stock is needed to exercise the tests.

The deliberately removed top tabs, original supplier delivery/cutoff evidence, D31 stock continuation, D35 chef continuation with retained concerns, and locked ALG-04 exclusions are preserved.

## Verification status

Final combined validation is pending the independent PR148 campaign's timing-token fix and merge. Passing intermediate results are evidence for their named revisions, not a claim that the whole final integration has passed.

- Main `d53447e`: 583 API tests passed with empty supplier/model keys and one worker.
- Main `379e1a8`: four supplier-fixture failures reproduced in the basket/item suites. After the fixture repair, all 36 assertions in those suites passed without external credentials. No product or dietary expectation was weakened.
- The integrated authorization and D35 suites pass 48 cases, including private mutation-response projections, stock attribution and signed chef acknowledgements.
- Eleven real Chromium recovery/receipt checks pass, including same-route parsing, actual bootstrap reload, keyboard retry after a failed read, loading states, a persistent audit label and 320px receipts. Deliberate browser transport faults are labelled in the evidence.
- The automated WCAG sample covers 18 page/state/role cases at 375px and 1440px with no remaining rule violations. A pre-campaign staged finance row still requires the campaign's mobile layout; its owner separately verified that layout with temporary 12px badges at 320/375px.
- Live console checks passed at 320/375/768/1440px, including reduced motion and keyboard dialog operation. The later focusable signed-token region has a passing component regression and remains part of the final browser replay.
- Production app build and API typecheck pass. Final workspace checks and the combined full suites remain to be recorded below.

Repository-native replay commands:

```text
pnpm.cmd --filter @aimo/api exec vitest run --pool=threads --maxWorkers=1 --testTimeout=30000 --hookTimeout=60000
pnpm.cmd --filter @aimo/app exec vitest run --maxWorkers=1
pnpm.cmd typecheck
pnpm.cmd --filter @aimo/app build
```

Use `AIMO_MODE=fixture`, empty `AIMO_API_KEY`, `OPENAI_API_KEY`, `CONTEXT_DEV_API_KEY` and `PREVIEW_PASSWORD`, plus `PORT=0` and `E2_PORT=0` for test processes. Persistent browser fixtures use a separate SQLite file and port 8820. Do not reuse another session's server or database.

## Evidence and limits

Durable evidence is under `C:/Users/benfh/junction-review-results/gstack-complete-20261115/`: the independent reports, visual matrix and screenshots, gstack detector JSON, guarded command receipts, current-main failure reproduction, local browser results, scripted/live-model latency reports and two bounded adversarial parser probes. The live parser probes preserved an explicit almond restriction and created no orders or approvals. They are not exhaustive prompt-injection coverage.

The hosted preview was checked read-only. A fresh browser without credentials received the demo person picker and successful reads of `/api/status` and `/api/live/state`; no effective preview password wall was observed. Deployment settings were not changed. The legacy tracked `.env` remains a separate team decision; no credential values were copied into this review. Real-device assistive technology, real WhatsApp pairing and external supplier ordering were not exercised. No production readiness certification is claimed.

The gstack source detector's remaining one-sided status-border hits are retained as functional state cues and reported rather than silently suppressed. Browser screenshots used an isolated Chromium fallback after two host snapshot timeouts. Failed driver attempts and deliberate fault injections are separated from product findings.
