# Open questions for the team

These are decisions with no single right answer. The facts behind them are in the repo, but someone has to make a call. Each one sets out both positions and what would settle it.

For questions to ask the Valio Aimo mentors, see [research/mentor-questions.md](research/mentor-questions.md). For what changed when the two uploads were merged, see [CHANGES.md](CHANGES.md).

When a question is decided, write the decision and the date under it, and update the files it affects.

---

## 1. Which customer do we build for first?

This is the biggest disagreement between the two research passes.

| | Darragh's research ([04](research/04-segment-research-chain-first.md)) | Jack's research ([01](research/01-customer-options-brief.md)) |
|---|---|---|
| Recommendation | **Hotel and restaurant chains first** | No pick yet; **shortlist of four** |
| Public kitchens (schools, hospitals) | Close second | **Ruled out**, described as a team decision: too regulated, slow to adopt |
| Independent restaurants and cafés | **Last**: their recipes live in the chef's head, so an agent has nothing to compute from | **On the shortlist** (A): high time pain for the owner |
| Contract caterers (Compass/Amica, Sodexo, ISS) | Not considered | **On the shortlist** (C) |
| Private care homes (Attendo, Mehiläinen, Esperi) | Not considered | **On the shortlist** (E) |

**Where they agree:** chains are the only segment both rate highly. They're also the brief's own example: "a hotel chain's agent".

**To decide:**
- Is public kitchens being ruled out a real team decision, and does everyone agree with it?
- Do independents belong on the list, given they have no recipe data?
- Are contract caterers and care homes worth keeping?

**What would settle it:** the mentors' answers to Q1 (revenue split by segment) and Q2 (which segment Valio Aimo wants first). Then score the candidates with the six criteria in 01.

**Decision:** _open_

---

## 2. Who pays for the product?

| Option | For | Against |
|---|---|---|
| **The wholesaler pays**; the kitchen owner is the user | Fits the plan to sell to Valio Aimo or a similar wholesaler. The wholesaler gains lower cost to serve, fewer substitution calls and complaints, and keeps the customer relationship before a third-party agent platform takes it. One sale covers thousands of kitchens. | Long enterprise sales cycle. The wholesaler might build it in-house. Customers may wonder whose side a wholesaler-supplied agent is on, which the trust and audit design has to answer. |
| **The kitchens pay** | Direct link between the value (time saved) and the payer. | Many small sales. A buyer-side agent naturally wants to compare wholesalers, which drifts into the marketplace the brief rules out. |
| **Both** | The wholesaler licenses the engine; large customers pay for premium features. | More complex to explain in a pitch. |

**What would settle it:** mentor question Q3 ("Who would pay for this, and how?").

**Decision:** _open_

---

## 3. Do the API key, portal password and data stay in the repo?

**Current state:** `.env` (API key and portal password) and `data/` (about 20 MB of slim product data) are committed. The repo is private. They were uploaded deliberately, so everything the team needs is in one place.

**Fact (checked 14 Nov):** the same API key and portal password are printed in plain text on the public challenge page, https://junction2026.com/challenges/valio-aimo-trusted-trade-agents.md. See [GROUND_TRUTH.md](GROUND_TRUTH.md) section 1.

**The conflict:** Jack's files said never to commit the key or the data. His `.gitignore` lists `.env`, but git keeps tracking a file once it's committed, so that line has no effect while `.env` is in the repo.

| Option | For | Against |
|---|---|---|
| **Keep them committed** (current) | One clone gives the whole team a working setup, with no download step. The key is a hackathon key given to every participant, and the data is synthetic. | Anyone given repo access sees the credentials. If the repo is ever made public, they leak, and the data is marked "Junction 2026 use only". |
| **Remove them** | Safe to share or make public later. Normal practice. | Each teammate has to set up `.env` and run `scripts/fetch_raw.sh` themselves. They also stay in the git history unless the history is rewritten. |

**If removed:** run `git rm --cached .env`, run `git rm -r --cached data` and add `data/` to `.gitignore`, and share the key another way.

**Decision:** _open_
