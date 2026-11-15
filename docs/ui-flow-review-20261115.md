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

R04 reproduced both issues in the browser against isolated fixtures. Its build passed, and 12 existing rule-policy tests passed. Implementation and remaining reviews are pending.
