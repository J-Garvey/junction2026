# Independent order-campaign audit

The Python oracle does not import application parsing, matching, quantity or rule
code. It compares actual output with separately authored `expected.lines` (or
`auditExpected.lines`) and checks catalog/fixture facts independently. It scans
all primary and secondary candidates, downstream `related[].response` objects
and supplied snapshots. It never treats HTTP 200 as proof of correctness.

Run from the repository root:

```powershell
python scripts/order_campaign_audit.py C:/path/to/campaign
python -m unittest discover -s scripts/tests -p test_order_campaign_audit.py -v
pnpm.cmd --filter @aimo/api exec tsx src/scripts/order-audit-probe.ts C:/path/to/campaign/audit-probes.jsonl
```

The probe runs its own ephemeral local server with in-memory SQLite and the model
disabled. It neither connects WhatsApp nor calls an external supplier. Missing
fixtures can prevent planning; those errors are preserved, and no plan is
certified from that evidence. Session credentials are used in memory and omitted
from the evidence. The hand-authored probe cases include local/global dietary
scope on 60-item lists, explicit SKUs, repeated products and numeric edge cases.

The auditor reads complete lines from `requests.jsonl` and `audit-probes.jsonl`
by default. Use repeated `--input` arguments to choose other evidence files.
Append-only `audit.jsonl` records include verdict, exact checks, limitations,
evidence line, code SHA, review method, and a hash of the oracle source. Re-running
is incremental; changing the oracle creates new verdict revisions. The latest
revision by evidence path, line and method supersedes earlier revisions. Manual
semantic reviews are separate from automatic rule reviews. `audit-status.json`
is replaced atomically. Findings are confirmed separately in `findings.jsonl`;
an automatic failure is a review flag, not by itself a confirmed defect.

A pass certifies only the enumerated checks. Parse-only evidence cannot certify
planning or checkout. Intercepted fixture gaps, missing snapshots and unsupported
evidence shapes remain explicit limitations or inconclusive/unreviewed results.
Identity checks cover a small independent vocabulary and selected known hazards;
nuanced recipe suitability still needs human review. Catalog origin, claims and
allergen declarations remain authoritative: missing evidence is never verified.
