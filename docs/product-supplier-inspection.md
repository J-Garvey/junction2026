# Product supplier inspection

Open the hotel app's account menu, choose **Products**, search by name or Aimo ID, and follow a product's supplier-terms link. Existing item details also link to this view. It is independent of request planning and creates no plan, quote, basket, question, approval or order.

For a repeatable example, select fixture mode in Demo settings, then open `/products/461955?date=2026-11-16`. The committed `data/fixtures/aimo/base.json` contains salmon 461955 at **€28.84 ex VAT**, a comparison price of €28.84/KG, and an empty supplier schedule list. The view shows **Not available**, **No supplier delivery dates returned**, and **DLV-01**. The supplier sales unit was not returned; the comparison unit is displayed separately. The wedding recipe remains pinned to 469672 and automatic selection is unchanged.

The screen labels saved fixture or live Junction mock evidence, recording time, fallback use, delivery site and the clock used for evaluation. The original supplier dates, cutoffs, sales units, stock and sales blocks are displayed without projecting them forward. A projected demo cutoff cannot reopen an expired original schedule. Delivery eligibility is separate from price validity and never confirms a requested quantity or delivery hour.

Empty schedules (DLV-01), sales blocks (DLV-02), passed cutoffs (CUT-01), late dates and zero stock have distinct outcomes. Unknown stock with an original date and open cutoff stays **Stock not confirmed** (STK-01), never **Not available**. Original evidence missing from an older snapshot is **Delivery eligibility unknown**. No rule question or approval is created by inspection.

The read-only app endpoints require a person session and the existing hotel's account scope:

- `GET /api/products?q=461955`: local catalogue matches and the account's permitted delivery sites. An exact Aimo ID bypasses text matching; ordinary names use the existing catalogue search.
- `GET /api/products/461955/supplier?siteId=site-aurora&requestedDate=2026-11-16`: current lookup, full catalogue details, source/fallback, original schedules and derived delivery reasons. Requires a permitted site and valid calendar date. The response uses the shared `ProductInspection` contract and sends `Cache-Control: no-store`.

The supplier endpoint uses the normal lookup adapter, including fixture/live fallback and both stock sentinel normalisations. Invalid sites and out-of-account people are refused before supplier access. Product inspection is account-wide; it does not borrow an outlet's basket permissions. External agents retain their existing documented `/gateway/v1/products` and `/gateway/v1/lookup` interface.

Verification: `pnpm --filter @aimo/api exec vitest run test/product-inspection.test.ts` and `pnpm --filter @aimo/app exec vitest run test/product-inspection.test.tsx test/product-details.test.tsx test/shell-navigation.test.tsx` cover saved evidence, unchanged buying state, permissions, cutoff boundaries/projections, sales blocks, unknown stock, older snapshots, failed reads and keyboard navigation.
