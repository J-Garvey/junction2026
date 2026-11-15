# When the agent must stop for a human

The agent ends every request in one of three ways (see [AGENTS.md](../AGENTS.md)):

1. **Order.** Every line passes every rule below, within the hotel's policy.
2. **Ask.** The basket waits for one clear question to a person at the hotel. A manager can approve anything the hotel's policy lets them approve.
3. **Block.** The agent explains what can't be filled and why. **Approval cannot confirm unknown stock or waive a dietary rule**, so these cases need a different request or a different product, not a yes.

How often the agent asks is tuned per customer. The rules marked **Always** apply to every customer, whatever their risk profile.

This list keeps only rules backed by the challenge data, the mock API, [GROUND_TRUTH.md](../GROUND_TRUTH.md), or what Valio Aimo told us ([research/06](../research/06-valio-aimo-conversation-2026-11-14.md)). Thresholds such as "how big a headcount change" are hotel policy settings, not facts. This is a working draft for the guardrails design.

## Allergens and diets: Block, always

- **Always:** a product or substitute that adds an allergen the event must avoid.
- **Ask, and keep it marked (changed 15 Nov, D35 in [prd-context.md](prd-context.md); implemented in [the D35 flow](missing-allergen-data.md)):** a product with **no allergen declaration** on a line for a guest with an allergy or medical diet. A missing declaration means unknown, never safe (46% of products have none), so the agent never treats it as safe. The chef is asked and can continue, and the line stays labelled "allergen data not confirmed".
- **Always:** a "contains" or "may contain" entry for an allergen a guest must avoid. **UNDECLARED** is also not a "free from" guarantee: in GS1 it means "not intentionally included and assessed not to need a cross-contact warning", which is weaker than FREE_FROM. Treat it as not confirmed safe.
- **Always:** a product that lacks a required diet claim, such as `FREE_FROM_LACTOSE`, `FREE_FROM_GLUTEN` or `VEGAN`. Check the claim, never the product name. A lactose-free claim does not remove the milk allergen.
- **Always:** diet counts that don't add up to the guest total, or a diet with no product that passes. The agent can't guess which guest the gap belongs to.
- **Always:** an order that breaks a rule the hotel or event organiser has set, such as "no red meat" or "Finnish fish only".

## The product must work in the recipe: Ask

Valio Aimo said ingredients aren't interchangeable just because they're in the same category: two "blue milks" can behave differently in a recipe, and sugar with additives can break bakery recipes ([research/06](../research/06-valio-aimo-conversation-2026-11-14.md)).

- **Always:** any substitute for an **ingredient** (as opposed to a ready-made product such as a can of Coke) that is a different product from the one requested.
- A substitute of a different brand where the request or menu names the brand.
- A pack size that rests only on a size **guessed from the product name** and can't be cross-checked with the price API (catalogue price ÷ comparison price gives the litres or kg per sales unit).

## Quantity

- **Block:** a product with **no delivery dates**. Empty `scheduleLines` means not deliverable, even if the product has a price.
- **Ask (continue or pick another), never confirm:** stock reported as **unknown**: 999999 on Terminal products, and 9,999,999,999 base units on some Stock products. The agent must not present these as available. It may suggest them, and they don't rank lower for it (D32). They are labelled "stock not confirmed". The person building the order is asked whether to continue with one, and can; continuing leaves the stock unknown, not confirmed. (Changed twice on 14 Nov: from a block to an Approver's risk acceptance, D23, and then to this, D31 in [prd-context.md](prd-context.md).)
- **Ask:** **partial availability**: a line can only be part-filled, or all suitable products together don't cover the need.
- **Ask:** rounding up to whole sales units (which Valio Aimo confirmed customers do) that overshoots the need by more than the hotel's set tolerance.
- **Ask:** a quantity that looks implausible for the guest count, or a likely unit mix-up (litres vs decilitres, packs vs cases).
- **Ask:** a headcount change between the base order and the correction that is bigger than the hotel's set tolerance.
- **Block as a duplicate:** the same submission sent twice. It must produce one order, not two.

## Timing

- **Always (Block or Ask):** the product's **order cut-off** (`closingTime`) has already passed. The mock can still show a Monday delivery date for these, so the agent must check the cut-off itself.
- **Ask:** the offered delivery date differs from the date the hotel needs.
- **Ask:** delivery would arrive after preparation has to start, including thawing time for frozen products.
- **Ask:** the lines need different delivery dates. The API returns one delivery line per product and can't express a split delivery.
- **Ask:** delivery is needed on a day that isn't one of the hotel's agreed delivery days, or a public holiday adds a day ([GROUND_TRUTH.md](../GROUND_TRUTH.md) section 5).
- **Ask:** a change to an order after its cut-off. Orders can be amended until the cut-off; after that the agent can't promise the change.

## Price and terms

Prices are fixed (`catalogPrice.value`, per sales unit, before VAT), so these are about the terms changing, not about negotiation.

- **Block:** a price lookup that returns `error: true`. The agent can't commit to an order without a price.
- **Ask:** the price or terms changed between the quote and the commit. Recheck site, items, quantities, total and delivery terms at commit.
- **Ask:** a price that expires (`validTo`) before the delivery date.
- **Ask:** a substitute that costs much more than the original. Cost is secondary for this customer, but a large jump should still be visible.
- **Ask:** a product outside the hotel's approved product list.
- **Ask:** a total above the hotel's configured approval limit, if it has set one. The brief names a spend threshold as an example; Valio Aimo suggested it isn't the main pain point, so it's optional per customer.

## The request itself: Ask

- **Always:** an ambiguous request, such as "milk" with no type, or a missing guest count or delivery date.
- **Always:** an unknown product code. The API returns no price and no delivery dates for it, which looks the same as an undeliverable product.
- Preferences that can't all be met together, for example origin and certification.
- A request from someone outside the hotel's approval roles, or for a delivery site not on the hotel's list.

## What normally needs no human

- A different pack size of the **same product**, with identical allergens, claims and spec.
- Rounding up to whole sales units within the hotel's tolerance.
- Choosing between products that all pass every rule above, using the hotel's stated preference order.
- A headcount change within the hotel's tolerance, where every line has verified stock and its cut-off hasn't passed.

## The pattern

**Hard rules** (allergens, diets, organiser and hotel rules, cut-offs, deliverability, whether an ingredient works in the recipe) either pass automatically or stop the order. **Soft rules** (brand, origin, price, pack format, tolerances) are where each hotel's risk profile decides how often the agent asks.
