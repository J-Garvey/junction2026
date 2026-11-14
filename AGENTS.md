# Junction 2026 · Valio Aimo

## Git workflow for people and coding agents

Keep `C:\Users\benfh\junction` as a clean, local mirror of GitHub's `main` branch. Do not develop, commit or switch feature branches in that checkout.

- Create a separate Git worktree and branch from the latest `origin/main` for every task. Use a sibling path such as `C:\Users\benfh\junction-worktrees\<task>`.
- Give each person, agent and concurrent task its own worktree and branch. Never let two active sessions share a worktree or branch.
- Before creating a worktree, run `git fetch origin` and base it on `origin/main`. Do not pull, rebase, switch branches or remove a worktree that another session may be using.
- Make all changes on the task branch. Push the branch and open a GitHub pull request targeting `main`; never push commits directly to `main`. **Merge when ready by default**: once required checks pass, required reviews are satisfied and the branch is conflict-free, merge the pull request without waiting for a separate instruction. If any of those conditions are not met, leave the pull request open and report the blocker instead of forcing the merge.
- Before merging, bring the branch up to date with `origin/main` when needed and run the checks appropriate to the change.
- After a pull request merges, fast-forward the clean primary checkout with `git pull --ff-only`. Remove only the completed task's worktree and local branch, then run `git fetch --prune`.
- If the primary checkout has tracked modifications, stop and identify their owner instead of overwriting or stashing them. Treat untracked directories and other worktrees as potentially active work until verified otherwise.
- When running multiple app instances, use distinct ports and, where applicable, separate databases or temporary data directories. Keep credentials out of Git; configure each worktree safely through its own ignored environment file or an external shared secret source.
- Finish agent work by reporting the branch, pull-request URL, checks performed and whether local `main` matches `origin/main`.

## Start here

- [README.md](README.md) gives the repo map and quick start. The repo currently has research, data and Python tools. Check the current tree before choosing a stack or naming app commands.
- [challenge/brief.txt](challenge/brief.txt) defines the deliverable and judging. [GROUND_TRUTH.md](GROUND_TRUTH.md) is the reference for verified data and mock API behavior.
- [ICP.md](ICP.md) is the decided target customer: large hotels, conference hotels and event venues with high-volume catering, and the chef, purchasing and F&B roles we build for. Still build the challenge's general lookup, ordering and approval features for any buyer.
- [Sponsor conversation notes](research/06-valio-aimo-conversation-2026-11-14.md) explain the case for hotel catering and event orders. Treat them as first-hand notes. Keep unresolved choices in [QUESTIONS.md](QUESTIONS.md) open until the team decides.

## Build for the hotel buyer

Use a hotel kitchen dealing with a late change to a conference or banquet as the first demo case. The external agent acts for the hotel. The challenge calls for structured catalog, price and availability lookup, an order at the returned fixed price, and rules for when a human must approve. Keep orders, approvals and receipts in the prototype. Use a documented interface that another agent can call.

Build the core first. **External sourcing** (for example a supermarket filling a small gap in a large Valio Aimo order) is a **non-core add-on**: build it only after the core works, with simulated offers and the same hotel rules and approvals. **Voice calls, SMS and WhatsApp are cut**: don't build them. Email updates stay a non-core add-on. See the [product scope](ICP.md#6-our-product-opportunity) and [docs/prd-context.md](docs/prd-context.md).

The brief's example asks for 1,000 L of lactose-free milk by Monday. Show a clear outcome: an order placed within the buyer's authority, a basket awaiting approval, or a short explanation of what cannot be filled. Treat the demo's spend cap, approved products, delivery site and approval roles as explicit fixture policy. A manager can approve a change the hotel permits. Approval cannot confirm unknown stock or waive a dietary rule.

## Use the data already here

- Start with [`data/products_slim.jsonl`](data/products_slim.jsonl). It has 17,546 product records with reliability and carbon data joined by SKU. Filter `hotel_tags` by `breakfast`, `banquet`, `room_service`, or a specific tag such as `banquet:buffet_equipment`. These tags infer likely uses from category codes and product names. Use [`data/products_core.csv`](data/products_core.csv) for quick scans, [`data/categories.csv`](data/categories.csv) for category examples, and [`data/ingredients.jsonl`](data/ingredients.jsonl) for ingredient statements.
- Read the [data dictionary](docs/data-dictionary.md) before using claims, allergens, pack sizes or unit conversions. Lookup requests use the Aimo product ID. For the milk example, filter category `10400` and claim `FREE_FROM_LACTOSE`, then check the product type and the buyer's allowed list. The category also contains coffee and cultured drinks. A lactose-free claim does not remove the milk allergen. Missing declarations mean unknown.
- Order whole sales units for the hotel demo. Use the availability API's sales unit and verify litres per order pack. The catalog's unit can differ from the API unit and some pack sizes were inferred from names.
- Use the [raw file schema](challenge/product_data_schema.json) if the slim data lacks a field. [`scripts/fetch_raw.sh`](scripts/fetch_raw.sh) uses local `.env` to download the source files to `data/raw/` and rebuilds the committed extracts. Run it when you need a rebuild. See [challenge resources](challenge/resources.md) for the event portal.

## Call the Junction mock API

Use [`api/openapi.json`](api/openapi.json) for the schema and [`scripts/aimo_api.py`](scripts/aimo_api.py) for calls. The base URL is `https://junction26.valioaimo.fi`. The client sends `X-API-Key` from `AIMO_API_KEY` in the environment or local `.env`, with a user agent accepted by the portal. Keep credential values out of code, fixtures, logs and docs.

```sh
python3 scripts/aimo_api.py ping
python3 scripts/aimo_api.py price 2026-11-16 464306 463038 469363
python3 scripts/aimo_api.py availability 2026-11-16 464306 463038 469363
```

- Shortlist in the local catalog first. Each lookup accepts 1 to 1,000 product IDs. Rate limits are undisclosed. Query only what the request needs.
- Compare the fixed sell price in `catalogPrice.value` per sales unit before VAT. `listPrice` is a reference price. Check the price error flag and validity. Compare total cost after whole-pack rounding.
- For each line, check `salesBlock`, the returned date, `closingTime`, and quantity in the API's sales unit. A Monday date can come with a cutoff that has already passed. Empty `scheduleLines` means unavailable, even for a known SKU with a price. The API supplies a date and order cutoff. A specific delivery hour needs separate evidence.
- Treat `Terminal` quantity `999999` as unknown. Some `Stock` lines use the placeholder `9999999999` base units, scaled to the sales unit. SKUs `464306` and `464201` returned that placeholder. No single plain lactose-free milk in the repo's sample had a verified quantity of 1,000 L. For a repeatable successful demo, use a clearly labeled stock fixture or a smaller request with verified quantities.
- The sandbox ignores buyer and requested date when choosing results. Enforce account, site and approval scope in the prototype. The upstream mock has lookup and download endpoints. It has no cart, reservation, order or approval endpoint.

## Decide when to stop for a human

[docs/human-approval-rules.md](docs/human-approval-rules.md) lists the edge cases that end in an order, a question for the hotel, or a block. Allergen and diet failures, missing delivery dates and passed cut-offs are never approved through. Unknown stock is never shown as confirmed. The person building the order is asked whether to continue with it, and can (decision D31 in [docs/prd-context.md](docs/prd-context.md)).

## Verify the demo

Show a normal order, a basket that waits for approval, and a blocked path. Bind approval to the site, items, quantities, total and delivery terms. Recheck those terms at commit. Retry the same submission to verify it returns one mock order. Cover an expired cutoff and unknown stock. Label saved or modified responses as fixtures and keep the mock clock consistent with their cutoffs. Keep the demo and API calls within the synthetic Junction environment.
