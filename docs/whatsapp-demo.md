# WhatsApp Web and offline simulator

## Link regular WhatsApp

Open **Demo settings** and choose **Connect WhatsApp Web**. If you have not selected a demo person yet, use **Link WhatsApp Web**, then choose a person. The same pairing controls are available at `/whatsapp`.

1. On your phone open **WhatsApp → Linked devices → Link a device** and scan the QR shown in the app.
2. Wait for **Connected** and your real group list to load.
3. Choose **Respond only in this group**. No group is enabled automatically on first pairing. Choose the empty option to pause the agent.
4. Send text in that group from your linked phone or another group member, such as an order name, `add 10 kg salmon 469672`, `confirm change`, or `confirm order`. Replies include the exact text to send next. The bridge records its own outbound replies before sending and ignores their echoes to prevent reply loops.

The connection uses [whatsapp-web.js](https://github.com/wwebjs/whatsapp-web.js) to run regular WhatsApp Web in a dedicated local Chrome/Edge browser. It does not use WhatsApp Business or the Cloud API. This is an unofficial browser integration, so WhatsApp changes may require library updates. WhatsApp messages and replies are real; purchasing still uses the synthetic Junction gateway and mock order receipts.

Only new text from the exact selected group ID can reach the interpreter. Other groups, private chats, statuses, old history, attachments and agent-generated replies are ignored without a reply or read receipt. Each sender has separate order selection and pending confirmations. A sender cannot confirm another sender's pending edit. Order selection survives a restart for the same account, controlling person, selected group and sender. Pending changes and order confirmations require a fresh preview after reconnecting. Choosing a different group starts fresh conversation context. Financial approvals remain in the app.

The person who starts pairing controls the connection and supplies the hotel's demo identity for group requests. Other demo people cannot view the QR or reconfigure the connection. After a demo reset, select a person, reconnect and choose the group again. Group changes and disconnect wait until any active order request finishes.

Replies use a short question or result, blank lines, **bold** names and quantities, and _italic_ dates and status notes. Order-selection questions list each candidate once and accept its name; they omit totals, internal IDs and stock metadata. IDs are shown only when names need disambiguation. Add/remove confirmations show the affected items instead of repeating the full basket. The agent keeps its chat action available even when a long basket needs a linked detail view.

App links point to the actual basket, request or approval card. Set `PUBLIC_APP_URL` in the ignored `.env.local` to the web address reachable from the group's phones. It defaults to `https://junction.hewston.ie`. Approval links include the card anchor and open that card after the approver signs into the app. No login tokens or credentials are included in links.

## Server setup

Run the normal long-lived Node API (`pnpm start`). Chrome or Edge is detected automatically on Windows; standard Chrome/Chromium paths are also checked on macOS/Linux. Set `WHATSAPP_CHROME_PATH` in the ignored `.env.local` for another browser executable. Dependency installation intentionally skips Puppeteer's automatic browser download; the browser sandbox stays enabled.

`WHATSAPP_AUTH_DIR` defaults to ignored `apps/api/var/whatsapp-web`. The folder contains the browser's linked-device credentials and cached WhatsApp data. Keep it local, private, persistent and out of Git. Use a separate directory for each running app instance and never share a browser profile between processes. Closing the API preserves the profile; explicit **Disconnect WhatsApp** logs out and closes the dedicated browser. You can also revoke the device on your phone. Pairing QR data is held in memory and is served only to the controlling authenticated person with `Cache-Control: no-store`.

Select **Connect WhatsApp Web** once to enable automatic reconnection. On later API starts, the saved connection resumes as the same controlling person and restores its selected group, without another button press. Existing installations must click **Connect WhatsApp Web** once after this update to enable resume. A valid saved linked-device session normally avoids another QR scan; if WhatsApp revokes or expires it, scan the new QR in Demo settings. Explicit **Disconnect WhatsApp**, cancellation or a demo reset disables automatic reconnection. The API must be running to receive messages; messages sent while it is stopped are ignored as old history.

Both the browser profile (`WHATSAPP_AUTH_DIR`) and SQLite database (`AIMO_DB`, default `apps/api/var/aimo.db`) must survive a restart or deployment. Keep them on persistent local storage and use the same paths when restarting. Do not use `AIMO_DB=:memory:` for a persistent connection. SQLite stores the controlling person's ID, selected group, sender order context and delivery deduplication records. It does not save the person's browser bearer token in the resume record. A fresh private server credential is issued against the current person record on startup, so current hotel scope and role still apply. Removing that person prevents restoration. A demo reset clears connection settings and order context, while the browser profile may remain linked until explicitly disconnected or revoked on the phone.

No real account is paired by tests. Restart tests use a fake browser with the same saved database state. The local smoke test verified that the actual WhatsApp Web browser generated a pairing QR; final phone approval and a live group exchange require the account owner's phone.

Live endpoints under `/api/whatsapp/web` all require a person session:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/status` | Pairing phase, owner-only QR image, account name and group selection |
| POST | `/connect` | Start or resume the dedicated WhatsApp Web browser |
| POST | `/disconnect` | Log out and close the browser |
| POST | `/groups/refresh` | Refresh real groups from the linked account |
| POST | `/group` | Select `{ "groupId": "...@g.us" }`, or null to pause |

There is no HTTP endpoint that injects messages into the real bridge. Sender, group and message IDs come from WhatsApp Web events. Replayed or interrupted message deliveries never repeat an order operation. A failed or uncertain outbound reply is not automatically resent; check the group and order before sending a new request.

## Offline simulator

The original offline chat remains at `/whatsapp/simulator`. It has no access to the live connection or selected real group. Its configuration endpoints and fixed demo groups below apply only to the simulator.

The simulator defaults to **Demo Hotel · Orders**; its other fixed choices are **Conference kitchen** and **Hotel staff**. Its **Demo chat** selector lets you test messages from each group or a direct chat. Change the simulator's allowed group through its test-only `/api/whatsapp/config` endpoint. This setting cannot enable a real group. Ignored simulator messages produce only a local transport notice, with no agent reply or history returned.

Changing the selected group clears every person's previous chat context, history and pending confirmation the next time their session is read. Existing orders remain. Delivery IDs from earlier group selections cannot be replayed in the newly selected group. Finish any messages currently being sent before changing the group. Group selection is a test-mode setting, like the existing demo clock.

Visit `/whatsapp/simulator` after choosing a demo person. Connect the demo chat and send a message. This screen is synthetic and does not contact WhatsApp or connect a phone. The existing preview gate and person session still apply. The display name is cosmetic; the server chooses the person, hotel, outlets and credentials from the existing session.

Both channels were explicitly requested after the earlier product decision to cut WhatsApp. The live transport above uses regular WhatsApp Web linked-device pairing; WhatsApp Business and Meta Cloud API setup are not used.

## Try it

WhatsApp uses the web app's product parser, with order selection and confirmation commands around it. For example, `add 10 slices of cheese to Darragh's Birthday` preserves the quantity as 10 pieces and searches for sliced cheese. Supplier pack conversion is checked separately; a slice count never implies a weight or a number of sales packs. Missing quantities still need clarification.

Use fixture mode and the demo clock before the fixture cutoffs, for example 14 November 2026 at 12:00 Helsinki. Create an empty order basket in the app for 16 November 2026. In chat:

1. Send the basket's name or ID. If several orders fit, select one of the offered choices.
2. Send `add 10 kg salmon 469672` for the known-stock fixture example. The existing request parser and product pipeline produce a proposal. A generic product request also works, but the selected product may have unconfirmed stock.
3. Choose **Confirm change** to stage the reviewed items. This does not submit a supplier order.
4. Send `remove salmon` or `remove 2` to propose removal of an entire line, then reply `confirm removal`. Send `change 2 to 15` to set line 2 to 15 sales units, then `confirm change`. `summary` numbers the lines. Ambiguous matches need clarification.
5. Send `confirm order` to review the complete basket. Choose **Confirm final order** to submit that exact basket through the gateway. A basket inside the hotel mandate produces a mock receipt; one that needs approval produces a card in the existing app's **Waiting** view.

Send `summary` to review the current basket or `cancel` to discard a pending proposal. Existing baskets can be selected by name, ID or an unambiguous delivery date. Missing order references and ambiguous product references produce a question.

Send changes for one basket at a time. Commands for all baskets, replacements, alternatives and conditional changes need clarification; they never apply only part of the instruction. Use `to order <name or ID>` for an explicit target. Product wording such as `from Finland` or `in sauce` cannot silently select a basket with that name. If a message needs clarification, any earlier pending confirmation is cancelled; send the intended request again to review it.

Unknown stock stays visibly unconfirmed. A generic chat confirmation cannot accept the stock risk: make that explicit decision using the existing app flow. Other unresolved chef decisions and dietary, product, price or delivery problems must also be resolved in the app. Previously recorded stock decisions remain subject to gateway checks. Passed cutoffs cannot be approved through.

Chat covers what the order page does:

- `new order Emma's wedding on 17 Nov` creates an empty order and selects it.
- On a placed mock order, `remove 2` and `change 2 to 15` amend it through the gateway's amendment endpoint after a preview and a second reply. Lines past their cut-off, a change that would empty the order, and an increase on unconfirmed stock that the hotel has not accepted before are refused. An increase that needs approval raises an approver card and leaves the order unchanged.
- `add …` on a placed order stages additions. `confirm order` then submits the complete order for finance review, like **Submit order for review**.
- Signed in as an approver, `approve` or `refuse: <note>` answers the open approver card, after `confirm approval` or `confirm refusal`. A finance refusal needs a note.
- `help` lists the commands.

Chef decisions on stock, products and dietary rules stay in the app.

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

Reuse the same message ID and text when retrying a send. A reused ID with different text is rejected. Completed retries return the current session without repeating the operation, so an older preview cannot replace the latest pending confirmation on screen. Sessions and history are isolated by person and stored in the existing SQLite `kv` table; resetting the demo clears them. No phone identity is inferred from message text or the cosmetic display name.

A failed request or uncertain outbound reply cancels pending confirmation. Review the intended change again before confirming it; an older or unseen proposal cannot authorize it.
Messages accept at most 8,000 UTF-16 code units. An oversized text message from an authorized sender in the selected group cancels that sender's pending confirmation in the normal message queue. Web sends a short rejection; the simulator returns HTTP 400. The text is never truncated or interpreted. Retrying the rejected delivery does not cancel a newer proposal. Malformed simulator envelopes (including missing or invalid IDs), unauthorized inputs, direct chats and other groups cannot cancel the selected conversation. The HTTP JSON body limit still applies before message processing.
If the conversation changed after a failed send, retrying that delivery is refused and the simulator loads the latest chat for a fresh review. A failed confirmation cannot be retried against a different proposal.

The coordinator resolves context, calls the existing parser and planner, and sends all final lines in one gateway quote. Duplicate products are aggregated before checking stock and spend, so separate chat messages cannot bypass the per-order cap. Confirmations bind to the basket snapshot. Changes to any staged request or event invalidate pending confirmation or approval; final ordering also rechecks the gateway's current price, delivery and cutoff facts. The existing gateway idempotency key prevents duplicate mock orders.

Shared types live in `packages/contracts/src/whatsapp.ts`. Transport, interpreter, formatter and coordinator live in `apps/api/src/whatsapp/`. Transport uses an injected handler so a future real channel adapter can reuse the coordinator without moving ordering authority into message formatting or interpretation.
