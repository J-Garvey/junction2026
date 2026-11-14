# Hotel catering: current customer journeys

Who does what, what they think, where Valio Aimo fits, and where the opportunities are.

## How to read this document

**Scenario:** a Finnish conference hotel is preparing a 500-person corporate event with coffee service, lunch and a gala dinner. Guest counts and dietary requests may change.

This is a **working hypothesis** of how hotel teams operate, not a verified interview study.

- **Current** describes a typical workflow.
- **Aimo** describes possible touchpoints with Valio Aimo services, not confirmed usage by a specific hotel.
- **Opportunity** describes a potential new feature.

Related: the target customer and product scope are in [ICP.md](../ICP.md); when the agent must stop for a human is in [human-approval-rules.md](human-approval-rules.md); what Valio Aimo told us about hotel ordering is in [research/06](../research/06-valio-aimo-conversation-2026-11-14.md). Pavit's draft user stories (pull request #10) use the same 500-guest scenario.

## The three people at a glance

| Role | What they do |
|---|---|
| **Banquet Chef** | Decides what food is needed and makes sure the kitchen can serve it. |
| **Purchasing Manager** | Converts requirements into supplier orders, follows delivery and handles exceptions. |
| **F&B Director** | Oversees event profitability, service quality and operational performance. |

## 1. Banquet Chef / Executive Chef

**Main goal:** feed every guest correctly, safely and on time. **Biggest worry:** missing ingredients or late changes disrupt service.

| Step | Does | Thinks | Current tools / Aimo | Opportunity |
|---|---|---|---|---|
| 1. Gets the event brief | Reads the banquet event order (BEO): date, guest count, menu, timing, dietary needs. | "Do I have all the details? Will the numbers change?" | Typically BEO, email and event meetings; Valio Aimo usually not central. | Turn the event brief into a clear food-requirements checklist. |
| 2. Plans the menu | Chooses dishes that fit the event, budget, staff and kitchen capacity. | "Can we make hundreds of portions to the right standard?" | Recipes and menu files; may use Minun Aimo recipe functions. | Check menu practicality and flag challenging ingredients. |
| 3. Calculates what to cook | Estimates portions, ingredients and safety buffers; considers existing stock. | "How much do we actually need?" | Recipes, spreadsheets, stock records; Minun Aimo can support recipe scaling and recipe-to-cart. | Connect guest count and service periods to total ingredient quantities. |
| 4. Sends requirements to purchasing | Submits ingredient lists, or orders directly if responsible. | "Has the buyer understood the quantities and specifications?" | Requisitions, email, ERP; possible Aimo ordering if the chef orders directly. | Keep the chef and purchaser on one shared event order. |
| 5. Prepares for the event | Checks deliveries, creates prep schedules and arranges special meals. | "Is everything here, including dietary alternatives?" | Kitchen sheets, receiving team, supplier and product information. | Show shortages, replacements and unresolved dietary checks. |
| 6. Serves and reviews | Manages service, then reviews leftover food and issues. | "What went wrong and what should we change?" | Kitchen team, waste notes and debriefs; little direct Aimo use during service. | Record actual usage and improve the next event. |

**Key pain point:** the chef hands requirements to another person but still carries responsibility if food is missing.

## 2. Purchasing Manager / F&B Buyer

**Main goal:** order the correct products, pack sizes and quantities so they arrive before preparation starts. **Biggest worry:** late requests, incorrect orders and unavailable products.

| Step | Does | Thinks | Current tools / Aimo | Opportunity |
|---|---|---|---|---|
| 1. Receives kitchen requests | Collects requirements across several events and departments. | "Is this the final complete list?" | Requisitions, emails and procurement tools; usually before Aimo ordering. | Combine requests by event without duplicating items. |
| 2. Checks what is already available | Checks stock and incoming goods before buying more. | "What is already in storage or allocated to another event?" | Hotel inventory or storeroom system; no verified Aimo stock integration. | Subtract usable stock from event requirements. |
| 3. Finds the right supplier products | Matches ingredients to product codes, package units, approved suppliers and prices. | "Which exact SKU and how many cases?" | Valio Aimo catalogue or webshop, internal purchasing rules. | Translate recipe quantities into orderable product units. |
| 4. Checks dates and places the order | Reviews delivery timing, order details and price; submits the order. | "Will everything arrive before cooking starts?" | Valio Aimo webshop or VALO ordering channel where used; ordering history and templates can help. | Precheck the basket against the event plan and mark critical items. |
| 5. Handles changes | Responds to bigger guest counts, unavailable goods, substitutions or missed cut-offs. | "Which orders need changing, and who must approve alternatives?" | Supplier portal, phone, email, chef approvals; edit options vary by ordering channel. | Show the exact change to purchase quantities and approval needs. |
| 6. Receives and reconciles | Checks delivery against orders and resolves shortages, wrong quantities or invoices. | "Did we get everything we paid for?" | Receiving documents, inventory and finance systems; supplier communication. | Flag event-level short deliveries and keep the chef informed. |
| 7. Reviews purchasing | Looks at spend, recurring issues and supplier performance. | "Where did we waste time or money?" | Reports; Minun Aimo provides purchasing and carbon reporting. | Compare procurement performance by event. |

**Key pain point:** one small change to guest numbers can require many separate order corrections and conversations.

## 3. F&B Director

**Main goal:** deliver profitable events without compromising service. **Biggest worry:** cost overruns, reputational damage and preventable operational failures.

| Step | Does | Thinks | Current tools / Aimo | Opportunity |
|---|---|---|---|---|
| 1. Reviews the event business case | Looks at expected revenue, menu scope, staffing and capacity. | "Can we deliver this profitably?" | Sales forecast, finance and event systems; Aimo not usually central. | Estimate food requirements and purchasing exposure early. |
| 2. Approves budgets and plan | Sets or reviews food-cost goals and delegates kitchen decisions. | "Does the menu fit our targets?" | Costing sheets, budget meetings; Minun Aimo margin tools may help. | Show event-level expected food cost and risks. |
| 3. Checks readiness | Asks the chef and buyer about important unresolved issues. | "Is there anything I need to escalate?" | Team updates, management meetings and messages. | One concise exception report instead of every line item. |
| 4. Handles major problems | Approves costly substitutions or changes affecting the customer promise. | "Which option protects the guest experience and margin?" | Chef and buyer discussions, supplier calls, financial judgement. | Show the service, cost and dietary implications of each option. |
| 5. Reviews the outcome | Checks feedback, actual spending, waste and service issues. | "Did we meet the expected margin and quality?" | Finance/POS and management reports; Aimo purchasing and carbon reporting can contribute. | Connect purchases, waste and results to the specific event. |
| 6. Improves the next events | Changes procedures, budgets and supplier arrangements. | "What should we standardise?" | Management reviews and historical event reports. | Compare similar events over time. |

**Key pain point:** the director sees costs and outcomes, but not always which event-specific purchasing decisions caused them.

## 4. Where the three journeys connect

| Hand-off | What passes | Risk |
|---|---|---|
| Event Manager → Chef | BEO, guest count and dietary requirements | Late or incomplete details |
| Chef → Purchasing | Recipes and ingredient quantities | Wrong units, forgotten items or unclear changes |
| Purchasing → Valio Aimo | Supplier SKUs and submitted orders | Wrong pack, item or timing |
| Delivery / receiving → Chef | Goods arrive and are allocated for production | Short delivery or unapproved replacement |
| Chef + Purchasing → F&B Director | Service and cost outcomes | Fragmented reporting |

## 5. What Valio Aimo already does vs. what to test

**Existing described capabilities:** food-service product discovery and ordering; customer pricing; VALO ordering history, templates and calendar; Minun Aimo recipe management and scaling, recipe-to-cart, margin calculations, purchasing reports and carbon reporting. Availability depends on the service and the account.

**Potential gap to validate:** an **event-level** workflow connecting BEO → recipe and ingredient demand → supplier orders → changes → delivery readiness → event outcome. Do not assume Valio Aimo lacks this capability without checking actual customer usage.

## 6. Questions to ask real hotel staff

**Chef:** "Show me how the last BEO became a food quantity list. What changed at the last minute?"

**Buyer:** "Show me the exact steps from a chef request to the submitted Valio Aimo order. What do you do outside Aimo?"

**Director:** "Show me how you calculate whether a large event made its target margin. Where do supplier costs and waste show up?"

**For anyone who orders:**

- "Do you want to keep control of the exact supplies ordered, or would you rather say 'order 10 pasta meals' and have us find the recipe and supplies required?"
- "Which supplies or orders change late most often?"
- "Walk me through the last large catering order you made in Valio Aimo, from event brief to submitted order."
- "What part of that process takes the most time, and which parts are already automated?"
- "When the guest count changes, what exactly do you have to redo?"
- "How do you calculate quantities, choose pack sizes and handle excess ingredients?"
