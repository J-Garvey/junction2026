# API quality corpus v2 contract

Campaign: `api-quality-20261115-c8a4`. Author: E3. Clock: `2026-11-14T10:00:00Z`.

`buildCampaignCorpus({ includeHoldout = false, corpusDir })` loads and verifies the
frozen external corpus. It returns 800 development scenarios by default; explicit
holdout access returns all 1,000. No parser, model, supplier or browser is called.
The default directory is
`C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/corpus`.

Each JSONL row has the existing runner fields `caseId`, `input`, `expected`,
`channel` (`main` or `whatsapp`), `plan` (boolean), and optional `sequence` (ordered
message strings). Additional fields are `scenarioId` (same as caseId),
`primaryCategory`, `itemCount` (individually specified requested positions),
`split` (`development` or `holdout`), `channels` (equivalence targets), and
`evidence` (independent source references and oracle method).

`expected.lines` contains `lineId`, explicit `productId`, catalog `product`,
`amount`, `unit`, `claims`, `avoidAllergens`, optional `origin`, and optional
`neighbor` constraints. `expected` additionally describes delivery terms, safe
outcomes, unsupported requirements, corrections, duplicate handling, transport
invariants and conversation state where relevant. These are authored intent and
policy expectations, never observations or parser output. A safe clarification
does not count as successful interpretation of all requested lines.

`channels` declares equivalent intent to replay on both HTTP surfaces. The
existing `channel` is the primary execution surface. Cross-channel replays retain
the scenario ID and add an execution ID; they do not create more scenarios. A
WhatsApp `scenario` uses only isolated synthetic drafts and the existing host.
Sequence scenarios carry separate `expected.turns` intent and state invariants;
they are one scenario regardless of delivery count.

| Category | Total | Development | Holdout |
|---|---:|---:|---:|
| ordinary | 250 | 200 | 50 |
| long | 200 | 160 | 40 |
| conversation | 150 | 120 | 30 |
| boundary | 150 | 120 | 30 |
| linguistic | 100 | 80 | 20 |
| resilience | 100 | 80 | 20 |
| transport | 50 | 40 | 10 |

At least 100 long scenarios have exactly 100 separately numbered positions with
explicit catalog IDs and local constraints linked to their neighbors. Corpus
uniqueness checks ignore wording, line IDs, ordering, quantities and channel:
distinct product/constraint/state semantics are required.

Freeze writes `full.jsonl`, `development.jsonl`, `holdout.jsonl`, a development-only
runner `corpus.jsonl`, `commitments.jsonl` and `checksums.json` outside Git. Writes
are exclusive and an existing freeze is never replaced. Only compact commitments
(IDs, categories, item counts, split, content and semantic hashes) enter Git.
Keep holdout texts, expectations, and responses inaccessible to implementation
and optimization agents. Those agents must use development access only.

E3 runtime allocation: port 8894, `e3/runtime/aimo.db`,
`e3/runtime/whatsapp-unused`. Corpus authoring requires no host and opens no port.
Use existing `scripts/order-campaign/run.mjs` and the existing campaign host for
execution; this module does not add another HTTP framework or transport.

## Authoring and verification

```powershell
# One-time authoring; refuses occupied destinations and never replaces a freeze.
node scripts/order-campaign/corpus-v2.mjs freeze C:/path/outside/git/corpus
# Existing campaign: verifies all files it reads against commitments/checksums.
node scripts/order-campaign/corpus-v2.mjs validate
node scripts/order-campaign/corpus-v2.mjs development
# Unit tests require only the compact committed manifest, never external holdout.
node --test scripts/order-campaign/corpus-v2.test.mjs
```

The published freeze has 1,000 distinct semantic hashes and **120** exact-100
requests. It references 1,668 catalog IDs plus the deliberately unknown product
ID used in boundary cases. `distinctCatalogIds` in the validation summary counts
all explicit IDs, including that deliberately unknown ID. There are 100
structured and 100 prose long requests. OS randomness selects products and the
stratified split; no seed or individual holdout selections are committed.

The oracle reads the slim catalog, saved `base.json`, documented policy, and
seeded hotel mandate; it never imports production parser/planner code. Each line
carries catalog/diet/origin blockers, fixture stock/cutoff facts, and whole-pack
price arithmetic where the saved comparison price verifies conversion. Repeated
IDs carry a shared-stock guard. Milk and lactose are distinct, unknown/sentinel
stock is never confirmed, and no mass/volume density is invented. Source file
hashes live in external `checksums.json`. The committed hashes anchor the reader
against a rewritten external manifest. Hashes detect mutation; they are not an
access-control boundary against a process with filesystem access.

## Execution limits and scoring

This PR authors and validates inputs and expectations only. It provides no
parser, model, end-to-end, live WhatsApp or browser success evidence. No host,
supplier, model, database, WhatsApp session or browser was started by E3.

The existing runner reads the development-only `corpus.jsonl`. Give each running
role its own artifact directory and use its assigned host port/database/auth
path. The coordinator's runner/host changes own execution configuration. Do not
point an implementation agent at `full.jsonl` or `holdout.jsonl`.

`channels` means equivalent buyer intent and hard constraints across channel
adapters. Main and WhatsApp response envelopes and conversation setup differ.
The current runner's `--cross-channel` mode can replay main seeds through the
synthetic chat. Stateful conversation expectations require the runner to inspect
all turns and basket snapshots, and a matching main basket flow for stateful
equivalence. A list of channel names alone is not evidence of equivalence.

Unsupported units, fat specifications, certificates, lot IDs, delivery hours and
batch-level sustainability evidence must produce a safe question or explanation
when unverified. Some long inputs intentionally exceed supported parser limits;
an explicit rejection is safe but fails completeness. Partial fulfillment must
retain visibility of every unmet position. A successful HTTP response or a safe
clarification does not prove correct interpretation or a completed purchase.

The per-line oracle is an input/planning reference, not a replacement for final
gateway commit checks. Global budget, correction/state and unsupported-criterion
expectations live on `expected`; evaluate those alongside each line. When an
input is invalid, the scenario's safe-outcome expectation takes precedence over
any hypothetical arithmetic on its numeric token. Missing or unverified pack
evidence remains unknown. This corpus grants no production authorization.

Keep fixture/fallback, real-model, and fake-browser execution evidence in separate
role-owned files. A model attempt that falls back is fallback evidence. Preserve
unsuccessful attempts and report exact coverage rather than inferring passes.
