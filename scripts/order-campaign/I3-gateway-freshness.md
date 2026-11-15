# I3 gateway freshness implementation

Campaign `api-quality-20261115-c8a4`; branch
`t3/fix-stale-quote-order-commit`. Independent review and coordinator merge
are required. This worker does not approve or merge its PR.

## A3-F01 and the correction

The independent A3-10 reproductions from PR131, head
`df2ee88e1b1988a53601fe09f3c305c76ce76d41`, were merged as a test dependency.
Before implementation they reproduced both unsafe commits: quoting 1 KG of
469672, then changing only known stock to the stock sentinel or setting
`salesBlock=true`, still produced an order with old known-stock evidence.
Their original expected-failure results are retained externally. A3-10 now
contains ordinary acceptance assertions: refusal and zero persisted orders.

Commit now builds a fresh quote evaluation from one supplier lookup and current
policy. It compares price, tax, units, date, cutoff, validity, stock kind/reason,
aggregate urgent stock and policy decisions. Current hard rules also refuse
commit. A replacement quote uses the same lookup as the refusal. Safe changes
to sufficient known stock remain orderable and the receipt stores current stock.
No supplier prices or stock are cached by this change.

Incomplete delivery terms and missing, nonpositive, nonfinite or unsafe monetary
values block. Invalid supplier dates do not reach date projection. Price start
is evaluated for the requested delivery date, as `/api/price` specifies; it is
valid to order in August at a September price for November delivery. Missing or
malformed validity and already expired prices cannot be approved through.
The existing explicit approval for a valid price ending before a future
delivery remains. Dietary rules, missing delivery dates, sales blocks and
passed cutoffs remain hard rules.

Finance approval checks current facts and expiry. Signatures remain bound to
the exact quote and checkout hash. Amendment approvals also bind to the source
order/version. An amendment quote cannot be used to place an additional order.

Unknown-stock consent survives amendments only for the same active line,
quantity, supplier terms and hotel policy. Changed quantities, outlets or terms
ask again. The app exposes an existing chef question for the new quantities;
finance cannot answer it. Its `stockQuoteId` binds the answer to the reviewed
amendment facts. The app also discards old SKU consent when a new quote's terms
or policy differ and copies fresh stock/delivery facts before asking questions.

Concurrent same-key submissions resolve inside the write transaction to one
order plus a replay, or a body-conflict refusal. Concurrent amendments refuse
the request based on an older order version. Time is checked after supplier I/O.
App routes preserve gateway refusal/unavailability HTTP status instead of
turning those errors into 500. This is a narrow mapping, not an audit of every
app error path.

## Evidence and verification

External root: `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/I3/`.
The existing campaign test harness and host are reused; no new framework or
production injection endpoint was added. The worker uses port 8923, a fresh
SQLite runtime and unused WhatsApp auth path per attempt. Clock:
`2026-11-14T10:00:00Z` unless a case explicitly changes it.

- `observations-initial.md`: early findings and the unsuccessful shell-regex
  attempt (no tests executed).
- `attempt-02-unfixed/`: 15 normal passes plus two explicit expected failures;
  the latter are unsafe reproductions, not safety passes.
- `attempt-03-fixed/`: first 61-test passing campaign execution, including
  converted A3 acceptance checks.
- `fixture-gateway-attempt-05/`: 38 passes and one assertion failure about the
  refusal code for an invalid rolled cutoff; the commit was still refused.
- `fixture-gateway-attempt-06/`: all 39 gateway cases pass.
- `focused-neighbors-vitest.json`, `unmodified-parent-e2e-vitest.json`,
  `fixed-wedding-date-semantics-vitest.json`: unsuccessful intermediate runs
  and the parent comparison. The parent wedding passed; implementation was
  corrected for delivery-date price validity and explicit amendment decisions.
- `event-builder-decision-vitest.json`: all 15 end-to-end cases pass after
  adding the builder's changed-quantity decision to the hotel flow.

Each campaign attempt preserves its exact test snapshot/hash, raw requests and
responses, persisted quotes/approvals/orders, explicit external overlays,
runtime metadata and Vitest JSON. Final checks and the committed head are
reported in the PR and worker handoff. Gateway-only executions are labelled
`fixture-gateway`; channel regressions use a separate artifact directory.

No holdout content, live supplier, real-model or real WhatsApp/browser traffic
was used. Fake-browser channel evidence is a regression check, not evidence of
a real browser session. Upstream inventory is read-only: no reservation or
stock-decrement guarantee is claimed. The primary checkout is untouched.
