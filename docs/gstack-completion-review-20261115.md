# Gstack completion review - 15 November 2026

This completes the follow-up on branch improve/gstack-complete-review-20261115, PR200. It incorporates PR148 at 45ab9d2 and main through 587b543, including upload guidance, unified suggested-product rows, indexed database reads, the darker upload link and highlighted stock warnings. Indexed event queries retain all outlet/privacy checks. The independent baseline captured 158 states at d53447e; the independent security audit used Claude Opus 5.5. All runtime changes and orders used synthetic Junction data.

## Result

- A quote and its bound approval can create one order. The transaction rejects a new key after consumption with 409 quote_consumed; exact retries return the existing order, including competing submissions.
- Server-resolved identities enforce outlet scope on quotes, approvals, orders, amendments, plans and event changes. Refreshed basket responses recheck scope after awaited reads. Attached events must belong to the hotel; restricted event snapshots, linked plans and draft questions are omitted from HTTP projections while stored workflows and own-outlet contributions remain intact.
- Financial approval/refusal in the existing WhatsApp Web group transport stays in the app. Old pending confirmations cannot transfer the linked approver's authority. This maintains existing code and does not expand the cut channel scope.
- Main195's signed chef consent, ignored caller-supplied names, supplier trade allowlists, hotel ownership and production persona guard are preserved. Malformed cookies and unequal UTF-8 password lengths receive authentication refusals.
- Successful same-route parsing opens editable chips. Unrelated refreshes preserve edits. Bootstrap failures offer reload; failed decision reads offer retry and do not claim an all-clear; pending request/event lists announce loading.
- The shared loader keeps successful mutation results when an older background read finishes later. A controlled regression first reproduced the lost staged row, then passed with the fix; the real browser replay also retains the row and success message.
- Live reflows on phones, contains table scrolling, supports keyboard signed-record dialogs and token scrolling, restores focus, respects reduced motion and reports connection state. Fonts are bundled locally. Receipt naming, atomic money amounts, visible audit labeling, contrast and 12px stock/fixture badges are verified.
- Basket and item tests have explicit supplier fixtures; unprovided alternatives are unavailable. No live credential or invented production stock is required.

The intentionally removed top tabs, original supplier schedule/cutoff evidence, D31 stock continuation, D35 retained concerns, locked ALG04, carbon/money evidence, piece ranking and seed presets remain.

## Final verification

| Check | Result |
| --- | --- |
| Complete API suite after main208, one thread worker, fixture mode, empty external keys, random ports | 924/924 passed |
| Complete frontend suite, one worker, after main206/207 | 292/292 passed, 31 files |
| Affected request/allergen UI after main210 stock highlighting | 48 passed; fresh production build passed |
| Workspace typecheck and production build | passed; existing Vite bundle-size advisory |
| Recovery, request parsing, labels and 320px receipt browser replay | 11 states passed |
| Final staged finance/stock/allergy/menu layouts at 320/375/768 | 12 checks passed |
| Live at 320/375/768/1440, keyboard and reduced motion | passed |
| Held old response delivered after successful staging | passed in component and browser |
| Automated WCAG sample, 18 page/state/role cases at two widths | no rule violations or page overflow |
| Independent source recheck of quote/consent/projections and privacy fix follow-up | no new unresolved findings within reviewed scope |

These batches overlap; their counts are not added. The API suite was repeated after main208's indexed reads. The frontend suite includes the shared loader fix and main206/207. The later main209 darker link and main210 stock-warning affordance have focused request/allergen tests, a fresh build and final browser replays. Broader UI testing is not repeated for each subsequent cosmetic change.

Main a808b5c independently reproduces the chicken test's missing supplier fixture (56 of 57 checks passed across the three compared files). The first combined API run passed 908/915; five stale attribution assertions, the stricter private-read expectation and legacy-proposal setup were reconciled before the 919/919 rerun. The first UI run exposed old Live startup mocks; the second exposed the real stale-read race. Both are retained as superseded evidence, with causal checkpoints and fresh complete runs.

Replay with AIMO_TEST_MODE=1, AIMO_MODE=fixture, AIMO_DB=:memory:, empty AIMO_API_KEY/OPENAI_API_KEY/CONTEXT_DEV_API_KEY/PREVIEW_PASSWORD, PORT=0 and E2_PORT=0:

    pnpm.cmd --filter @aimo/api exec vitest run --pool=threads --maxWorkers=1 --testTimeout=30000 --hookTimeout=60000
    pnpm.cmd --filter @aimo/app exec vitest run --maxWorkers=1
    pnpm.cmd typecheck
    pnpm.cmd build

## Evidence and limits

Durable artifacts: C:/Users/benfh/junction-review-results/gstack-complete-20261115. Guarded final reports: api-main-intersection/REPORT.md, app-main-intersection/REPORT.md, ui-stock-intersection/REPORT.md and workspace-db-intersection/REPORT.md, with immutable receipts and hashes. The earlier functional-combined, app-final and workspace-final reports retain the causal checkpoints, the 919-case API pass before main208, and passes before main206/207. The final browser replay also checks the new item-review rows at 320px with no automated WCAG violation. The visual-baseline folder contains the 158-capture matrix and screenshot index. The final design report is under state/projects/J-Garvey-junction2026/designs/design-audit-complete-20261115.

The same two-file source scan changes 4 to 3; the retained state-border cues are intentional and no rules were ignored. Final affected-page Design A is provisional (baseline B, AI Slop A in both), because navigation and sampled coverage changed; no whole-site numerical improvement claim is made.

Two bounded live-model adversarial parser probes retained the almond restriction and created no orders or approvals. Baseline scripted/live-model latency measurements are diagnostic, not production benchmarks. The hosted preview observation predates main195; deployment configuration was not changed or certified. Local production persona refusal is covered by tests.

The tracked legacy .env remains a separate team decision; no key values were copied into reports. Native screen-reader speech, real-device/browser combinations, real WhatsApp pairing, exhaustive prompt injection and external supplier ordering were not exercised. All screenshots and supplier responses used isolated synthetic fixtures.
