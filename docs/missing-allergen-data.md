# Missing allergen declarations (D35 / B23)

ALG-03 asks the chef whether to continue with **allergen data not confirmed**. The question names the product, relevant allergens and affected guest count when the hotel supplies one. An ad hoc request without a guest count says that the count was not supplied. The chef can continue or choose another product. Finance cannot answer this question.

The wedding retains potato **460541**. Late allergy conflicts are resolved first. Missing declarations then receive their own chef question before the changed order goes to finance. A combined order serving unrestricted and allergic guests retains each group's own rule evidence.

Continuing preserves the concern on the event's product line, order and receipt, result summary, and hotel audit. It never sets a safety-confirmed value or makes unknown stock known. Stock acceptance remains the separate D31 decision. A basket with a missing-data concern cannot show confirmed fulfillment.

CONTAINS (ALG-01), MAY_CONTAIN (ALG-02), explicit UNDECLARED (ALG-04 / PR #166), contradictions and unmet diet requirements remain blocks. Missing data cannot weaken any of them.

## Agent interface

1. Quote the intended products and dietary constraints with `POST /gateway/v1/quotes`. Supply an opaque `allergenScope` digest that includes the affected guests/count, dishes and requirements; never send guest names or counts to the gateway.
2. Show the returned ALG-03 concern to the chef. With the chef's own session credential, call `POST /gateway/v1/allergen-acknowledgements`:

   ```json
   { "quoteId": "q_...", "fingerprint": "...", "productIds": ["460541"] }
   ```

3. Attach the returned signed `token` in `allergenAcknowledgements` to `POST /gateway/v1/orders` or the order's `/amendments` endpoint. Finance approval and `continueWithUnconfirmedStock` are independent inputs.

For an amendment, `quoteOnly: true` returns current amendment terms without changing the order. The chef reviews those terms before acknowledging them. The token is signed as `aimo-allergen-ack+jwt`, bound to the hotel, event and quote fingerprint, and expires with the reviewed quote. The fingerprint covers the site, lines, outlets, quantities, prices, total, delivery terms, dietary constraints, opaque guest scope and catalogue-declaration digest. Commit rechecks supplier terms, current catalogue conflicts, signature, expiry and the chef's current role/outlet scope. Changed terms require a new chef decision.

Final basket consolidation can change these terms. If it invalidates an earlier acknowledgement, submission asks the chef again; after answering, submit the basket for finance review again. Older snapshots without the new fields must be rechecked and cannot infer consent from generic item approval, stock acceptance or manager approval.

Dietary details, questions, acknowledgements and concern audit entries are hotel-only. Shared sale/amendment audit entries omit dietary rules and constraints. The gateway contract is generated from the same schemas at `/openapi.json`.

Regression coverage: `apps/api/test/missing-allergen-data.test.ts`, `apps/api/test/allergen-safety.test.ts`, the repeatable wedding in `apps/api/test/e2e.test.ts`, and keyboard interactions in `apps/app/test/allergen-data.test.tsx`. Tests use saved Junction supplier evidence; temporary in-memory catalogue changes are labelled fixtures. No seed product is swapped.
