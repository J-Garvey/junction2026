# Corrected campaign corpus v3 — awaiting independent review

V2 inverted rounded comparison prices to obtain exact pack contents and omitted
complete conversation state. V3 uses corroborated manufacturer contents, marks
disputed conversions unknown, and specifies positive and negative state effects.
It is an A2-authored revision, **not an independently approved oracle**. A4 or the
coordinator must review the source facts, state contracts and frozen artifacts
before scoring future executions. PR121 remains blocked pending adjudication.

No production code or runner behavior changes. Use the existing guarded host and
`run.mjs --manifest=<external development.jsonl>` after coordinator acceptance.
Conversation and transport cases explicitly select the simulator channel; the
web message API does not supply conversation state. Structured gateway requests
remain distinct contracts, not natural-language equivalents.

## Frozen files and confidentiality

Campaign root: `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4`.

- `corpus/`: unchanged original v2, anchored to PR121 commit
  `a9f9f1c87d894a0e9b899d5b284b8c1587b1d2e0`.
- `corpus-v3/`: corrected `development.jsonl` (800), `holdout.jsonl` (200),
  `checksums.json`, `commitments.jsonl`, `revision-ledger.jsonl` and
  `original-hash-ledger.json`. No combined full corpus is published.
- `A2/`: independent source audit, timestamped incremental baseline snapshots,
  baseline audits, report, validation and preserved unsuccessful attempts.
- Git contains generator/oracle/state/audit code, tests, report and content
  commitments only. It contains no scenario text or answer rows from holdout.

The hash-only ledger records before/after input, expectation and complete row
hashes for all 1,000 stable IDs. Original category and split membership do not
change. Freeze refuses an existing target or commitment file. Random choices
are source-supported products, without an exported seed; the frozen output is
the reproducible input. Do not regenerate an existing version.

Implementation and optimization roles must **not** run `freeze`, use `--auditor`,
or open original/v3 holdout, original full files or auditor-only local artifacts.
The default reader opens development and commitments only. External storage and
role discipline are the confidentiality boundary; this is not an OS ACL.

```powershell
# Development-only reader / integrity check; does not open holdout:
node scripts/order-campaign/corpus-v3.mjs validate
# Auditors only: full structural validation of the existing immutable freeze:
node scripts/order-campaign/corpus-v3.mjs validate --auditor
# Independent arithmetic audit plus a point-in-time, append-safe baseline audit:
node scripts/order-campaign/corpus-v3-audit.mjs --auditor --baseline
node --test scripts/order-campaign/corpus-v3.test.mjs scripts/order-campaign/test/adapter.test.mjs scripts/order-campaign/test/runner.test.mjs
```

`freeze --auditor` is an authoring command that already ran successfully; its
default output and public commitment target now exist. It must fail on rerun.

## Source and policy choices needing review

Mass/volume packs require manufacturer content (`synkka`, or manufacturer mass
in `synkka+name`), the API sales-unit hierarchy, and a comparison price within
EUR0.005000001 of the exact per-kg/L calculation. That tolerance corroborates the
manufacturer amount; a monetary ratio never defines an exact amount. Inferred
content, contradictory API comparisons, variable weights and unsupported units
remain unknown. Count conversion uses documented ST pieces and the returned
sales-unit hierarchy. This refines the ratio preference currently stated in
GROUND_TRUTH/data dictionary; the policy refinement requires adjudication.

Missing or invalid delivery dates cannot confirm delivery. A different date
requires acceptance; invalid/past requested dates block. Price validity covers
the current commit instant and the supplier-local calendar delivery date. The
price schema has no delivery hour, so day-level validity is not an hourly
delivery guarantee. Unknown validity, an expired quote or future validity cannot
authorize a fixed-price commitment. Diet/allergen failures and expired cutoffs
cannot be waived. Stock sentinels remain unknown.

V3 has all 200 long requests at 30–100 positions, 160 exact-100 cases, and a late
correction to L004 plus compatible/incompatible repeats in every long case.
The 250 ordinary cases use viable fixture products matched to breakfast,
coffee-service, banquet or room-service tags; 100 use unique full catalog names
without explicit IDs. Fifty cases explicitly permit a catalog-listed ingredient
substitute as the chef in the request. That is an explicit permission set, not
an inference that two ingredients are interchangeable. Other substitutions need
a chef question. Exact product and accepted-set contracts are separate fields.

All 150 conversations and 50 transport cases specify empty seeded drafts,
identity/authority, selection, pending bindings, exact per-turn basket quantities,
prices and terms, final orders/approvals/receipts, and replay effects. Fifteen
viable purchase flows require one order after two order confirmations. A system
that always clarifies fails the positive paths. Dynamic DB IDs are matched by a
bijection to logical scope/line/order identities; quantities and effects are exact.
Some original ambiguous sequences were replaced with supported, explicit
cancel/new-preview steps. Every such input change is hashed in the revision ledger.

This is fixture/policy coverage, not proof of model or channel success. The long
requests still exceed current route limits and should expose completeness
failures. V3 has not been executed against a model or application endpoint by A2.
No real supplier or WhatsApp traffic, external browser profile or campaign app
host was used. Reserved A2 runtime remains unused: port8904, `A2/runtime/aimo.db`,
`A2/runtime/whatsapp-unused`; business clock `2026-11-14T10:00:00Z`.
