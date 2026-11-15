# UI and flow review campaign — 15 November 2026

Integration branch: `campaign/ui-flow-20261115-643e`.

The review uses the current Aimo Copilot application and synthetic hotel data. Ten independent user journeys will produce reproducible findings. Twenty implementation assignments will address verified issues in isolated worktrees, each through its own pull request into the integration branch. The combined result will be checked before the integration PR is merged into `main`.

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

Nine of ten persona reviews are complete. Findings above were reproduced in isolated fixture browsers. Reviewer builds and UI suites passed; some broader API checks hit missing supplier fixtures with intentionally blank credentials, which is recorded as a verification limitation rather than a successful run. R01-01 and R03-01 are one shared issue and one implementation assignment. The integration branch includes main through `5dc2d14`; newer finance labels and controls must be retained. Implementation and the final dietary review are pending.
