# Simulated WhatsApp ordering

From **Demo settings**, select **Open WhatsApp demo**, choose a demo person if prompted, then select **Connect demo chat**.

In Demo settings, **Respond only in this group** selects the single group the agent listens to. The default is **Demo Hotel · Orders**; the fixed demo choices also include **Conference kitchen** and **Hotel staff**. All other groups and direct messages are ignored on the server, before interpretation, cached replies or order changes. The chat's **Demo chat** selector lets you send test messages from each group or a direct chat. An ignored message produces only a local transport notice, with no agent reply or history returned.

Changing the selected group clears every person's previous chat context, history and pending confirmation the next time their session is read. Existing orders remain. Delivery IDs from earlier group selections cannot be replayed in the newly selected group. Finish any messages currently being sent before changing the group. Group selection is a test-mode setting, like the existing demo clock.

Open **WhatsApp** in the hotel app, or visit `/whatsapp`, after choosing a demo person. Connect the demo account and send a message. This is a synthetic web chat: it does not contact WhatsApp, connect a phone, collect Meta credentials, or send messages to anyone. The existing preview gate and person session still apply. The display name is cosmetic; the server chooses the person, hotel, outlets and credentials from the existing session.

This addition was explicitly requested after the earlier product decision to cut WhatsApp. Real WhatsApp transport, phone verification and Meta account setup remain outside this prototype.

## Try it

Use fixture mode and the demo clock before the fixture cutoffs, for example 14 November 2026 at 12:00 Helsinki. Create an empty order basket in the app for 16 November 2026. In chat:

1. Send the basket's name or ID. If several orders fit, select one of the offered choices.
2. Send `add 10 kg salmon 469672` for the known-stock fixture example. The existing request parser and product pipeline produce a proposal. A generic product request also works, but the selected product may have unconfirmed stock.
3. Choose **Confirm change** to stage the reviewed items. This does not submit a supplier order.
4. Send `remove salmon` to propose removal of an entire matching line, then confirm the change. Ambiguous matches need clarification. To reduce a quantity, remove the line and add the desired quantity.
5. Send `confirm order` to review the complete basket. Choose **Confirm final order** to submit that exact basket through the gateway. A basket inside the hotel mandate produces a mock receipt; one that needs approval produces a card in the existing app's **Waiting** view.

Send `summary` to review the current basket or `cancel` to discard a pending proposal. Existing baskets can be selected by name, ID or an unambiguous delivery date. Missing order references and ambiguous product references produce a question.

Unknown stock stays visibly unconfirmed. A generic chat confirmation cannot accept the stock risk: make that explicit decision using the existing app flow. Other unresolved chef decisions and dietary, product, price or delivery problems must also be resolved in the app. Previously recorded stock decisions remain subject to gateway checks. Passed cutoffs cannot be approved through.

Draft basket additions and whole-line removals are supported. Once a basket contains a placed mock order, chat shows its receipt and directs amendments to the app. Financial approval also stays in the app under the approver's own session.

## Interfaces

The authenticated synthetic transport is mounted at `/api/whatsapp`:

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | `/session` | — | Person's connection, conversation and history |
| POST | `/connect` | `{ "displayName": "Demo kitchen" }` (optional name) | Connected demo session |
| POST | `/disconnect` | `{}` | Disconnected session |
| POST | `/messages` | `{ "id": "client-generated-unique-id", "text": "summary", "groupId": "demo-hotel-orders" }` | Updated session, or `{ "ignored": "other_group" }` / `{ "ignored": "direct_message" }` |
| GET | `/config` | — | Fixed groups and `selectedGroupId`; available on the person picker |
| POST | `/config` | `{ "groupId": "demo-conference-kitchen" }` | Updated group selection; test mode only |

Include the source group's ID on every synthetic incoming message. A missing or null group ID is a direct message and is ignored. The selected ID must exactly match; a matching display name does not authorize a message. Chat endpoints require a person session; the demo configuration endpoints use the existing preview gate and can be opened before selecting a person. These IDs and the source-chat selector are fixtures for the synthetic transport, not a live WhatsApp connection.

Reuse the same message ID and text when retrying a send. A reused ID with different text is rejected. Sessions and history are isolated by person and stored in the existing SQLite `kv` table; resetting the demo clears them. No phone identity is inferred from message text or the cosmetic display name.

The coordinator resolves context, calls the existing parser and planner, and sends all final lines in one gateway quote. Duplicate products are aggregated before checking stock and spend, so separate chat messages cannot bypass the per-order cap. Confirmations bind to the basket snapshot. Changes to any staged request or event invalidate pending confirmation or approval; final ordering also rechecks the gateway's current price, delivery and cutoff facts. The existing gateway idempotency key prevents duplicate mock orders.

Shared types live in `packages/contracts/src/whatsapp.ts`. Transport, interpreter, formatter and coordinator live in `apps/api/src/whatsapp/`. Transport uses an injected handler so a future real channel adapter can reuse the coordinator without moving ordering authority into message formatting or interpretation.
