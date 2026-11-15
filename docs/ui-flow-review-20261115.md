# UI and flow review campaign — 15 November 2026

Integration branch: `campaign/ui-flow-20261115-643e`.

Ten independent reviews of Aimo Copilot used synthetic hotel data and produced twenty-one distinct findings. Twenty implementation assignments addressed them in isolated worktrees, each through its own pull request into the integration branch. The combined changes are delivered through [PR #148](https://github.com/J-Garvey/junction2026/pull/148).

## Review journeys

| Review | User perspective | Primary journey |
| --- | --- | --- |
| R01 | Banquet head chef | Create an order, add products, review quantities and dates |
| R02 | Purchasing manager | Search products, compare alternatives, stage an order |
| R03 | Finance manager | Review, approve, refuse, and resubmit an order |
| R04 | F&B director | Switch roles, understand authority, inspect and edit policy |
| R05 | Bar manager | Navigate and order within the correct outlet |
| R06 | Event coordinator | Plan menus, guest counts, and event changes |
| R07 | Dietary safety lead | Inspect allergens, dietary requirements, and stock concerns |
| R08 | Supplier/audit reviewer | Read receipts, order history, and shared audit records |
| R09 | Keyboard and screen-reader user | Navigate controls, dialogs, validation, and focus |
| R10 | First-time mobile user | Discover the workflow and recover from errors on a small screen |

## Evidence and completion rules

- Record the route, selected persona, exact actions, expected and actual outcomes, severity, and relevant source locations for each finding.
- Use isolated local fixture databases and ports; do not reset a teammate's server or send real supplier orders or messages.
- Preserve the distinction between unknown stock, missing allergen declarations, hard dietary failures, and approval authority.
- Fix verified defects; do not manufacture work to satisfy an agent count or add out-of-scope channels.
- Each implementation PR must describe its reproduction and validation, target this integration branch, and be conflict-free with required checks/reviews satisfied before merging.
- Integration verification covers a normal order, approval and refusal, a blocked path, keyboard navigation, and mobile layout, with tests and type checking appropriate to the changes.

## Results

| Finding | Severity | Reproduction and impact | Assignment |
| --- | --- | --- | --- |
| R04-01 | P2 | As Jonas on Rules, edit the spend cap or blocked products, open Switch user, then Cancel. The unsaved policy draft silently disappears. | F01: preserve the draft when canceling the picker |
| R04-02 | P2 | Change reliability from 80 to 85 and add blocked product 469363, select Changed, then save. Saved non-default parameters disappear and the filter incorrectly says no rules changed. | F02: compare effective parameter values against defaults |
| R02-01 | P2 | Select milk 464401 as a replacement, then change demand from 10 L to 20 L. The selected product silently reverts to 464306. | F03: retain valid buyer choices across quantity edits |
| R02-02 | P2 | Enter 2 KI for a request of 30 pcs of 468445. After checking, no control can correct the sales quantity to 1 KI. | F04: keep checked sales quantities editable |
| R08-01 | P1 | Approve an order as Sanna, then read the shared audit as the synthetic supplier viewer. Actor fields and summaries disclose personal staff identities. | F05: project permitted supplier audit fields |
| R08-02 | P2 | Open Receipts for a committed order with the fixture server unavailable. The read error falsely says nothing has been ordered. | F06: report network uncertainty accurately |
| R08-03 | P2 | Filter the audit by order ID or quote ID after approval. Related placement, quote, and approval records cannot be followed through stored references. | F07: expose and search permitted record references |
| R09-01 | P1 | Open item review and Shift+Tab from its first control. Focus escapes to the background; Escape loses the initiating control. | F08: contain modal focus and restore it on dismissal |
| R09-02 | P2 | Open the profile or order menu, use arrow keys, then Escape from an item. Menus lack their advertised keyboard behavior and lose focus. | F09: implement menu keyboard navigation and focus return |
| R01-01 / R03-01 | P1 | Finance returns an uncommitted basket asking for a reduced quantity. The builder can neither edit nor remove its staged items. | F10: scoped correction and removal with fresh review |
| R01-02 | P2 | Change a parsed request from milk to salmon and L to kg. Hidden milk identity/category fields remain and matching fails. | F11: normalize product-chip identity edits |
| R03-02 | P2 | Let a review expire while the order remains open. The panel announces expiry but the stale review keeps resubmission disabled. | F12: reconcile expiry without navigating away |
| R05-01 | P1 | As Mikko, accept a banquet proposal created by Aino. A bar-only user can place the out-of-scope request. | F13: enforce outlet scope at acceptance |
| R05-02 | P2 | Inspect homepage menus. Waiting, Requests, and Events exist but have no discoverable main navigation. | F14: restore access to the existing core lists |
| R05-03 | P2 | Direct-load a client route from a production build in a `.t3` worktree. The absolute-path fallback rejects the dot-directory and returns 500. | F15: serve the SPA fallback relative to its static root |
| R06-01 | P1 | Edit one event's menu, switch to another event with the same version, then save. The previous menu is saved into the second event. | F16: bind menu drafts and async results to event identity |
| R06-02 | P1 | Assign every guest to dietary groups. Fixed-total ingredients remain in the editor but disappear from scaling and generated orders. | F17: preserve event totals with dietary constraints |
| R10-01 | P1 | Inspect a staged item at 320 px and 375 px. Its product name collapses to zero width; price can overflow. | F18: readable mobile staged rows |
| R10-02 | P2 | Open the menu editor on an empty order at 320 px. Removal controls extend beyond the card and cause horizontal overflow. | F19: contain and reflow menu controls |
| R07-01 | P1 | Request product 462678 for a tree-nut allergy. Its explicit UNDECLARED AN declaration is absent from the ordering checks, so it stages without review. | F20: enforce the signed-off UNDECLARED allergen rule |
| R07-02 | P2 | Continue with unknown milk stock, then stage the item. The staged row drops the stock-risk marker even though stock remains unknown. | F10: retain the disclosure alongside staged status |

All ten persona reviews and twenty implementation assignments are complete. Findings above were reproduced in isolated fixture browsers. R01-01 and R03-01 are one shared issue and one implementation assignment. F10 also owns the adjacent staged-stock disclosure fix. The twenty assignments cover twenty-one distinct findings. Every implementation PR has merged into the integration branch; the relevant combined checks below pass.

The allergen fix follows signed-off Q02.3: a requested allergen explicitly listed as UNDECLARED fails the hotel rule. An absent declaration follows the separate D35 feature from main's PR #188: only the chef can continue, and the concern remains visible. Both behaviours are retained.

## Implementation pull requests

| Assignment | Findings | Pull requests | Result |
| --- | --- | --- | --- |
| F01 | R04-01 | [#152](https://github.com/J-Garvey/junction2026/pull/152) | Merged into integration |
| F02 | R04-02 | [#150](https://github.com/J-Garvey/junction2026/pull/150) | Merged into integration |
| F03 | R02-01 | [#151](https://github.com/J-Garvey/junction2026/pull/151) | Merged into integration |
| F04 | R02-02 | [#154](https://github.com/J-Garvey/junction2026/pull/154) | Merged into integration |
| F05 | R08-01 | [#153](https://github.com/J-Garvey/junction2026/pull/153) | Merged into integration |
| F06 | R08-02 | [#155](https://github.com/J-Garvey/junction2026/pull/155) | Merged into integration |
| F07 | R08-03 | [#156](https://github.com/J-Garvey/junction2026/pull/156) | Merged into integration |
| F08 | R09-01 | [#158](https://github.com/J-Garvey/junction2026/pull/158), [#177](https://github.com/J-Garvey/junction2026/pull/177) | Merged into integration |
| F09 | R09-02 | [#160](https://github.com/J-Garvey/junction2026/pull/160) | Merged into integration |
| F10 | R01-01/R03-01/R07-02 | [#176](https://github.com/J-Garvey/junction2026/pull/176) | Merged into integration |
| F11 | R01-02 | [#162](https://github.com/J-Garvey/junction2026/pull/162) | Merged into integration |
| F12 | R03-02 | [#171](https://github.com/J-Garvey/junction2026/pull/171) | Merged into integration |
| F13 | R05-01 | [#165](https://github.com/J-Garvey/junction2026/pull/165) | Merged into integration |
| F14 | R05-02 | [#157](https://github.com/J-Garvey/junction2026/pull/157) | Merged into integration |
| F15 | R05-03 | [#159](https://github.com/J-Garvey/junction2026/pull/159) | Merged into integration |
| F16 | R06-01 | [#175](https://github.com/J-Garvey/junction2026/pull/175) | Merged into integration |
| F17 | R06-02 | [#163](https://github.com/J-Garvey/junction2026/pull/163) | Merged into integration |
| F18 | R10-01 | [#178](https://github.com/J-Garvey/junction2026/pull/178) | Merged into integration |
| F19 | R10-02 | [#164](https://github.com/J-Garvey/junction2026/pull/164) | Merged into integration |
| F20 | R07-01 | [#166](https://github.com/J-Garvey/junction2026/pull/166) | Merged into integration |

## Integration decisions and verification

- The removed top tab bar stays removed. Products, Waiting, Requests, and Events remain reachable through the keyboard-accessible account menu. Product inspection, saved calculation explanations, processing-time evidence, and both demo seed profiles remain available.
- Current-main carbon information is retained inside the responsive staged product identity area, alongside the stock disclosure and edit/remove actions. Standing category-origin requirements and the locked allergen rule both remain enforced. Shared audit keeps stable origin rule IDs without exposing hotel identities.
- Enforcing UNDECLARED allergens replaces the wedding's original toast (477125) with confirmed-stock 477090. The scenario therefore finishes with four uncertain-stock lines. E2E checks assert that replacement explicitly; a separate case verifies fresh chef consent when the original unconfirmed toast actually increases from five to six sales units. The newer D35 integration additionally retains the missing-declaration concern and requires fresh chef consent when dietary scope changes.
- The first broad API run on `d24d59f` passed 672 of 688 checks. Fourteen failures came from another synthetic harness occupying fixed port 8892; two were the wedding expectations above. Subsequent broad verification uses `E2_PORT=0`, the actual bound address, one worker, and blank external credentials. This first result is retained as diagnostic evidence.
- The full app suite passed all 251 tests in 25 files; the 64 affected UI tests passed again after the basket-response and delivery changes. Main was subsequently reconciled through `cd88de7`, preserving D35, explicit replacement approval, and its targeted-validation guidance. Final relevant checks are recorded below.
- Private headless Chrome checks passed for refusal → correction from 10 kg to 5 kg → fresh item approval → resubmission → one finance-approved mock order. The UNDECLARED tree-nut case disabled approval and staging. Real keyboard checks confirmed menu Home/End/Escape, modal containment, and focus restoration after the asynchronous review opened.
- At 320 px and 375 px, chef and finance staged rows have no document overflow, visible product names and prices, and persistent stock-uncertainty labels. Menu removal controls also remain inside the viewport. Rules retain an unsaved spend-cap edit when user switching is canceled, and saved non-default reliability values remain in Changed after reload.
- The final finance row also fits both widths with temporary 12 px badges, including the latest-main "Ready to order" wording. This check changes only browser styling, without duplicating the independent typography work.
- Latest-main staging responses now carry a refreshed basket. Processing-time measurement updates the saved plan after that basket is assembled; correction tokens therefore exclude processing-time metadata while retaining all order state, scope, site, date and event-version guards. A regression uses the staging response's token directly for correction, without first refreshing it through a GET.
- Preview snapshots failed twice with a 15-second automation timeout; the combined browser checks therefore used isolated headless Chrome. All browser activity used a private fixture database on port 8951, and its owned browser/server were closed afterward. Native screen-reader speech was not tested.

## Final checks

- Relevant API coverage: 198 cases in 14 suites. The first batch passed 194; two loopback `ECONNRESET` failures passed in a serial rerun. Two test setups were updated for main's saved-event reload and renewed D35 consent. The three other affected suites passed 57 tests, and the final E2E suite passed all 16. No production dietary or authorization assertion was relaxed.
- Latest UI integration: 66 tests in five affected suites passed. Earlier full app coverage passed 251 tests in 25 files, followed by 64 affected tests after the immediate-basket response changes.
- Workspace typecheck and production build passed after the D35 reconciliation; API typecheck passed again after the final test-fixture updates. The build retains Vite's existing warning about a JavaScript chunk exceeding 500 kB.
- Main's subsequent piece-cost ranking PR #199 (`7a19555`) is also integrated. Its pricing display retains the campaign's outlet restriction. All 81 relevant API tests in five suites and 39 UI tests in two suites passed afterward, including E2E, manual pack quantities, retained buyer choices and fixed menu totals. Workspace typecheck and the Vite production build passed again.
- Main's purchasing-trust PR #195 (`08e6428`) is retained too. Ownership is checked before audit filters; shared records keep role-only actors and allowlisted details, with hotel IDs and without event/person references. Production persona switching remains disabled, while demo cancellation preserves drafts. All 101 relevant security/integration API tests passed. The 43 affected UI cases passed across the batch and an eight-case session rerun; expectations now use main's "Demo persona" label and explicit demo test mode. Workspace typecheck passed after reconciliation.
- API runs used fixture mode, an in-memory database, blank supplier/model/context credentials, ephemeral ports (`E2_PORT=0`), one thread worker, and 30-second test / 60-second hook limits. UI checks used one fork worker.
- Evidence and diagnostic logs are retained outside the task worktrees at `C:/Users/benfh/junction-review-results/ui-flow-campaign-643e`. The final API checks are targeted integration coverage; a full final API run was superseded by the latest-main reconciliations. The separately owned gstack continuation will verify the final combined site and its own security, fixture, typography and recovery follow-ups after this campaign lands.
