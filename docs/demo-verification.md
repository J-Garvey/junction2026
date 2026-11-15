# Wedding demo verification

Reference: [demo-plan.md](demo-plan.md), updated on main in pull request #205. Verification uses saved Junction supplier fixtures, a fresh in-memory hotel database, and the scene clock. The wedding regression runs twice from reset.

## Verified outcomes

| Beat | Expected result |
|---|---|
| Booking, 180 guests | Seven lines; €2,003.37 ex VAT. Aino reviews four unknown-stock lines before Sanna gets one card for budget and coffee-case rounding. |
| First clarification, 194 guests and Onni | Cake and undeclared-allergen toast block until replaced. Potatoes ask for an explicit missing-data decision. Changed stock is reviewed before the one finance card. Elonen cake is first, 5 cases at €310.60. |
| First clarification committed | €1,965.17 ex VAT when taking the first offered toast replacement, Ebony Vale red wine. The finance decision is signed against the reviewed amendment and retained on the order. |
| Second clarification, 188 guests | €1,920.59 ex VAT. Aino renews the changed product concerns; Sanna gets no additional approval card. |
| Final check | Cream is 37 of 47, with 10 L to fill. Choosing Valio 464194 keeps the original 37 L and adds 10 L at €39.10. The substitute retains the original lactose-free and tree-nut requirements. |
| Final event and order | Both cream lines appear; the displayed lines add up to €1,885.99 ex VAT. Result: `Ready · 4 stock not confirmed · 1 allergen data not confirmed`. |
| Closing record | Live receipt omits removed cake and toast lines. ES256 signature verifies and references the latest amendment quote. Peppol XML contains the final cake and both creams. |
| Safety | Unapproved over-budget order refused; expired cutoff and diet failure blocked; idempotent submission produces one order; finance cannot answer chef concerns; supplier audit excludes guest/allergy details. |

These assertions live in `apps/api/test/e2e.test.ts`. The live-console component regression checks per-call milliseconds and opening the signed receipt. Existing tests cover request chips, selection funnel, rules, fixture labels and role switching.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm --filter @aimo/api exec vitest run --maxWorkers=1
pnpm --filter @aimo/app exec vitest run --maxWorkers=1
pnpm start:demo
```

On Windows PowerShell with scripts disabled, use `pnpm.cmd`. One test worker limits contention with other active worktrees.

Use **Reset demo** for the wedding-only seed, then open **Events → Emma and Lauri's wedding**. The event scene buttons select the matching fixture clock. Complete Aino's product questions before switching to Sanna. Switch back for the next change. Open `/live` using the same hotel session for the refusal and signed-record takes; its **Reset** button would clear the wedding.

The configured live model was also exercised on the exact plain-words milk line: `Add 40 litres of lactose-free milk for the coffee service`. It returned 40 L and `FREE_FROM_LACTOSE` through the model parser. The automated suites separately exercise the no-key parser and hand-checked milk classification. Built wedding and live-console routes were served successfully from the production bundle.

## Recording choice still open

The first toast replacement remains a non-alcoholic **red wine**, as the plan already cautions. Use a suitable sparkling alternative if offered, or cut the toast replacement from the video. The totals above apply to the tested red-wine choice. Unknown stock and missing allergen data remain concerns after chef continuation.

The amendment endpoint's `quoteOnly` response now includes `stockReviewRequired`: the product IDs requiring fresh builder consent. It leaves the order untouched and lets the hotel finish product review before asking finance. The endpoint remains documented in `/openapi.json`.
