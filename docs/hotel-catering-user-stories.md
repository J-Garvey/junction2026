# Hotel catering user stories

> **Superseded by [user-stories.md](user-stories.md).** Kept as history. Since 14 Nov: SMS, phone and email (US09, US10 and demo step 2) are **cut**; the supermarket top-up (US08) is a **non-core add-on**.

The working scenario is a 500-guest conference with coffee service, lunch, and a gala dinner. The event manager owns the event brief, the banquet chef owns food requirements, the purchasing manager owns the order, and the food and beverage (F&B) director owns major cost or service decisions. The customer journey is a working hypothesis. The stories describe proposed product behavior.

The first demo can follow one event from brief to order, then handle a late change that needs a small supermarket top-up and a chef's decision. The product scope covers email, SMS, and phone. For Junction, use the Aimo catalog and mock lookups. Use simulated hotel records, order writes, supermarket offers, and communications. [Product scope](../ICP.md#6-our-product-opportunity) · [Mock API behavior](../GROUND_TRUTH.md#3-the-mock-api)

## Event brief and food requirements

### US01 Capture the event brief

As an event manager, I want to share the banquet event order (BEO) so the chef and buyer work from the same brief.

- The event record shows the venue, guest count, service times, menus, and dietary requests. The chef and buyer can see the current version and the source of each change.
- If a required detail is missing or unclear, the agent asks for it and leaves that part of the brief open.

### US02 Scale the menu and use stock on hand

As a banquet chef, I want to turn confirmed menus and guest counts into a list of what to buy so I can check that each service has enough food.

- Scale the chef's recipes by service and show ingredient quantities, units, and any chef-set buffer. Keep each special meal linked to its own menu and count.
- Subtract stock the hotel has confirmed is usable and free for this event. Show required, on-hand, and to-buy quantities. If recipe yield, portion size, or usable stock is missing, show the gap for the chef to resolve.

### US03 Share one list with purchasing

As a banquet chef, I want purchasing to see the exact ingredients and product requirements I approved so the buyer can make the right order.

- Each requested line shows the ingredient or product, quantity, unit, date needed, and any named item or dietary rule. The buyer can trace it to the event and its menu.
- Where multiple services need the same item, combine quantities only when product requirements and delivery needs match. Keep the original amounts visible by service.

## Catalog and ordering

### US04 Compare products and packs

As a purchasing manager, I want to match each request to supplier products and pack sizes so I can compare what I would buy, pay, and receive.

- Shortlist Aimo products by category, hotel tag, and documented requirements. Show the SKU, pack size, number of packs, and any extra quantity from rounding. A case of 36 croissants requires six cases to cover 200 pieces.
- For shortlisted Aimo items, show the fixed price per sales unit, the total for the proposed packs, reported stock, and the delivery date. Mark uncertain pack sizes and unknown stock. For a preparation deadline that needs a time of day, show whether the supplier provided a delivery time. [Data dictionary](data-dictionary.md) · [Mock API behavior](../GROUND_TRUTH.md#3-the-mock-api)

### US05 Check diets and approve a change

As a banquet chef, I want to see why a replacement was chosen and whether it suits the dish so I can make a safe decision before the buyer orders.

- Show the requested and proposed items with the relevant claims, allergens, pack sizes, price, and delivery. A missing or conflicting declaration for an allergen the meal must avoid blocks that product. A lactose-free label still allows the product to contain milk.
- Send recipe substitutions to the chef, purchasing exceptions to the purchasing manager, and cost or service exceptions to the F&B director when hotel policy calls for it. Ask one clear question. Record the approver and the exact terms they accepted. Send changed terms back through the rules. [Approval rules](human-approval-rules.md)

### US06 Recalculate a late change

As a purchasing manager, I want to see what a change in guest count, menu, or diet list does to the order so I can buy the extra items without buying the rest again.

- Compare the latest brief with the current order. Show changed requirements, quantities already ordered, and what is still needed. Run product and delivery checks on the revised basket.
- If the order window for an affected item has closed, show that status and any new offer the buyer can use. Leave the placed order as recorded until a supplier confirms the change.

### US07 Place one order within hotel policy

As a purchasing manager, I want the agent to place a checked basket within its authority so I can see what the hotel has committed to buy.

- Before placing the order, check the exact products, pack counts, price, stock, delivery terms, site, and any required approval. Route cases that need a decision or cannot go through to the right status.
- A placed order has an order reference and a record of its checks and approvals. A retry of the same submission returns the same order reference. For Junction, the prototype supplies the order write and receipt. [Approval rules](human-approval-rules.md) · [Mock API behavior](../GROUND_TRUTH.md#3-the-mock-api)

## Supermarket top-ups and communications

### US08 Fill a small gap through a supermarket

As a purchasing manager, I want an external supermarket to deliver a few missing items to the venue so a small shortfall does not hold up the whole event.

- If a line is short or needs less than a wholesale pack, show a supermarket offer for the remaining quantity. Show the exact product and pack count, price including delivery, expected arrival, and what Valio Aimo is already supplying.
- Apply the same product and approval checks to the top-up. Link the supermarket order to the event and show a separate supplier reference and delivery status. If either supplier fails to confirm, show which items the event still needs. [Product scope](../ICP.md#6-our-product-opportunity)

### US09 Take requests by email, SMS, or phone

As an event manager, I want to send a late change through the channel I already use so it reaches the right event and the right people.

- Accept email, SMS, and calls. Show the source and the details the agent captured, including the event, count, units, and timing where stated. For calls, read back key values when they are unclear.
- Ask for clarification if the event or change is unclear. Check who made the request and what they can change before applying it. If the same change arrives twice, keep one revision. [Product scope](../ICP.md#6-our-product-opportunity)

### US10 Get answers and updates on the same order

As a purchasing manager, I want the agent to ask for missing details or approval and send updates by email, SMS, or phone so I can resolve issues without losing the order history.

- Each question names the event, the change, and the decision needed. Responses tie back to the same order and version across channels. Apply the answer after checking the person's role and which terms they accepted.
- Send updates for placed orders, changes, and delivery issues through the chosen channel. Show what is confirmed and what still needs action. [Product scope](../ICP.md#6-our-product-opportunity)

## Receiving and event review

### US11 Check what arrived before prep

As a banquet chef, I want to see what arrived and what is still missing so I can plan prep and special meals.

- Record goods received against each supplier order. Show open quantities, damaged or wrong items, and any replacement that still needs a check. Keep the product details attached to the affected line.
- The chef and buyer see the same readiness status by service. An expected delivery stays pending until receiving confirms it.

### US12 Review event costs and issues

As an F&B director, I want to see what changed the event's food cost and which issues need my help so I can act before service and review results after it.

- Show the planned cost, order totals by supplier, delivery fees, and the cost of changes. Show which open decisions affect the event's budget or service.
- After the event, show actual cost and waste when the hotel records them. Tie variances to order changes or delivery issues where the record shows a cause.

## Suggested Junction demo

1. Load the brief for the 500-guest conference. For coffee service, assume one croissant each and no stock on hand. Use a simulated offer with enough stock to place the base order for 14 cases of Aimo SKU `460768`. At 36 per case, that covers 504 pieces. [Catalog data](../data/products_slim.jsonl)
2. Simulate an SMS that raises coffee service to 510 guests and confirms the extra guests have the same pastry requirements. Keep the 504 pieces in the base order and show the six-piece gap. Keep the separate dietary counts for the other meals.
3. Show a simulated supermarket offer for six suitable pastries delivered to the venue. Include the price with delivery and the expected arrival. If these pastries change the agreed item, ask the chef to approve that exact offer.
4. Apply the chef's answer to the event record, recheck the offer, and place the simulated supermarket order. Show the buyer the Aimo order and the top-up together. Send an update through the selected channel.

Use US01, US02, and US04–US10 for the demo path. US03, US11, and US12 give the team follow-on stories for handoffs, receiving, and review. One simulated channel can carry the demo. The other two share the same acceptance criteria.
