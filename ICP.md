# Ideal customer profile

> **Team decision, 14 Nov 2026.** This is the specific customer we target. We still build everything the challenge requires for any buyer: structured product, price and availability lookup; inquiry to order at fixed prices; and permission and human-approval rules (see [challenge/brief.txt](challenge/brief.txt)). The ICP decides the demo case, the product's depth and the pitch, not the scope of the base interface.
>
> Evidence behind it: Valio Aimo said hotels come first and the agent fits catering and event orders ([research/06](research/06-valio-aimo-conversation-2026-11-14.md)). The spike-order research found the urgent order is the correction when the final guest count and diet list arrive 1–3 days before service ([research/05](research/05-spike-orders-under-time-pressure.md)).

## 1. Ideal customer profile

- **Target:** large hotels, conference hotels and event venues handling high-volume catering (100–1,000+ guests per event).
- **Best-fit customer:** a hotel running multiple events simultaneously, with complex food purchasing, dietary requirements, changing guest numbers and tight delivery schedules.
- **Core problem:** coordinating food requirements, purchasing and delivery for large events is complex, manual and vulnerable to costly mistakes.

## 2. Who we're selling to

| Role | Responsibility | What they care about |
|---|---|---|
| Banquet Chef / Executive Chef | Plans menus and ingredient quantities | Enough food, quality, dietary safety, smooth execution |
| Purchasing Manager | Actually places supplier orders | Accuracy, availability, reliable deliveries, costs |
| F&B Director | Oversees financial and operational performance | Profitability, efficiency, waste reduction |

- **Primary users:** Banquet Chef and Purchasing Manager.
- **Economic buyer:** F&B Director or hotel operations leadership.

## 3. How they think

- **Banquet Chef:** "I have 500 people arriving tomorrow. I need the right ingredients, enough portions and no surprises."
- **Purchasing Manager:** "Give me accurate quantities, approved products and reliable delivery so I don't have to fix orders at the last minute."
- **F&B Director:** "How can we run more events efficiently, reduce waste and protect our margins?"

These are illustrative mindsets, not direct customer interview quotes.

## 4. Biggest pain points

- **Last-minute changes:** guest numbers and dietary requirements change after food has been ordered.
- **Delivery uncertainty:** missing or late ingredients can disrupt an entire event.
- **Manual ordering:** converting menus and guest counts into correct supplier quantities takes time.
- **Dietary complexity:** vegan, gluten-free, lactose-free and allergy requirements must be coordinated safely.
- **Food waste and cost:** over-ordering wastes money; under-ordering risks service failure.
- **Fragmented workflows:** event managers, chefs and purchasing teams work across different systems.

## 5. How hotel catering purchasing works

1. **Event Manager:** confirms guest count, menu and schedule.
2. **Banquet / Executive Chef:** plans recipes, quantities and dietary meals.
3. **Purchasing Manager:** places supplier orders and coordinates delivery.
4. **Supplier → hotel kitchen:** ingredients are delivered, prepared and served.

The step-by-step journey for each role, with the hand-off risks and questions to ask hotel staff, is in [docs/hotel-catering-customer-journeys.md](docs/hotel-catering-customer-journeys.md).

## 6. Our product opportunity

**AI Banquet Procurement Copilot** turns event needs into food orders using Valio Aimo product data.

Core capabilities:

- Automatically calculate ingredients and bulk pack quantities from guest counts.
- Flag unreliable or unknown product delivery performance.
- Identify dietary-compatible products and alternatives for verification.
- Recalculate orders when guest numbers change.
- Estimate ingredient-related carbon emissions and potential over-ordering.
Non-core, built only after the core works:

- **External sourcing (e.g. supermarket dropshipping).** Use an external source to fill small parts of a large Valio Aimo order, such as missing items or quantities below a wholesale pack, shipped straight to the venue. Show the source, items, cost including delivery, and expected arrival. Apply the hotel's product and approval rules to each part of the order.

Cut (14 Nov): voice calls, SMS and WhatsApp. They don't add enough value for the effort and the extra approval risk. Email updates stay a non-core add-on.

The Valio Aimo mock API covers its own product, price, and availability lookups. Simulated offers can cover external sourcing in Junction.

## 7. Positioning and value proposition

- **For chefs:** "Know your event is covered before kitchen preparation begins."
- **For purchasing managers:** "Turn event requirements into accurate, supplier-ready orders without manual calculations."
- **For F&B directors:** "Reduce operational risk, wasted food and purchasing effort while protecting event profitability."

## Bottom line

Build chef-first, purchasing-compatible. The Banquet Chef experiences the operational pain, the Purchasing Manager executes the order, and the F&B Director has a reason to fund the solution.

## Data limits to keep in mind

From [GROUND_TRUTH.md](GROUND_TRUTH.md) and the [data dictionary](docs/data-dictionary.md):

- **Delivery performance:** reliability is known for only about 25% of products. Missing means unknown, not unreliable.
- **Carbon:** figures are product-group averages covering about 63% of products. They're estimates, not per-product measurements.
- **Allergens:** 46% of products have no allergen declaration. Treat those as unknown, never as safe.
- **Stock:** the mock returns "unknown" quantities for Terminal products and some Stock products.
