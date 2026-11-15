# Hotel demo seed data

Load a populated hotel before a walkthrough with **Demo settings → Load hotel workspace**, or stop the local server and run:

```sh
pnpm seed:demo
pnpm start
```

Both replace the selected database. The command uses `AIMO_DB` (the normal app database by default) and a temporary loopback port to run the existing app and gateway. Use a different `AIMO_DB` for another worktree. Loading the preset needs no supplier or model credentials and sends no messages. Existing databases are never replaced automatically at startup.

The hotel, bookings, people, recipes, dietary counts and their actions are fictional fixtures. Products are real catalogue SKUs; prices, availability and original cutoffs replay `data/fixtures/aimo/base.json`. No stock amount, price, mandate limit or dietary declaration is invented to force a successful outcome. The preset deliberately leaves unknown stock unknown. Its orders are local mock orders, with genuine gateway signatures and an intact audit chain.

## Ready at the start

The clock opens at **Wednesday 11 November 2026, 10:00 Helsinki**, before Thursday's cake and sparkling cutoffs. The hotel uses its existing four people, two outlets, delivery site and signed €1,950 mandate. Prices below are before VAT.

| Booking | Prepared state | First useful action |
|---|---|---|
| Emma and Lauri's wedding, 180 guests, 17 Nov | The seven-line menu from the demo plan, with no order placed | Open the menu as Aino and begin the wedding walkthrough |
| Monday breakfast, 144 residents, 16 Nov | Sanna approved a **€213.28** mock order: 4 cases of croissants (144 pieces), 2 cases of flatbread (144 pieces), 1 case of coffee (4.4 kg). Stock is known | Open the confirmed order and its signed receipt |
| Nordic Leadership Forum, 320 delegates, 16 Nov | **€2,016.02** staged for Sanna's finance review, **€66.02** over the mandate. 58 kg salmon, 5 cases of potatoes, 2 cases of coffee, 80 L milk. Aino has explicitly continued with the unconfirmed potatoes and milk | Switch to Sanna; inspect the amount and exceptions, then approve or return it |
| Partner reception, 96 guests, 16 Nov | Mikko staged 3 cases of alcohol-free sparkling (**€110.28**). Sanna returned it with a note asking for the final head count. Stock remains unconfirmed | Switch to Mikko; open the order review history and resubmit after editing |
| Breakfast coffee service, milk top-up, 16 Nov | 40 L lactose-free Eila milk (**€40.40**). Aino's stock question is unanswered; nothing ordered | Continue with unconfirmed stock or choose another product |
| Board dinner, 24 guests, 16 Nov | Princess cake requested for a table including one guest with a tree-nut allergy. The almond declaration blocks the request | Inspect the reason and choose another dessert; finance cannot approve it through |
| December planning lunch, 60 guests, 3 Dec | Provisional salmon-and-potato menu; dietary counts are explicitly unconfirmed | Complete the booking before generating its order |

Only the listed procurement components are seeded; these are not complete breakfast or conference menus. The bakery quantities use whole cases. The salmon uses the mock's whole-kilogram sales unit, as the wedding does. No delivery hour is promised.

Seeded activity runs forward on the same mock clock: breakfast approval on 9 Nov, reception return on 10 Nov, then the pending forum, milk and allergy work on 11 Nov. Pending quotes are issued on the morning of 11 Nov so their 24-hour validity has not expired on opening. The saved supplier terms remain labelled as fixtures, including when replayed at an earlier simulated date.

## Recording the scripted wedding

**Reset demo** (or `pnpm seed`) still loads only the original wedding at scene 1, 14 August. Use that reset for the chronological four-scene video in [demo-plan.md](demo-plan.md). The `/live` console retains its own existing reset and clock. Loading the hotel workspace is for a populated product walkthrough; it does not pre-answer the wedding's stock or finance questions.

The API equivalents are `POST /api/reset` with `{ "profile": "hotel" }` for the populated workspace and `{ "profile": "story" }` for the wedding. An empty body retains the original story reset. These routes remain available only in demo/test mode. Reloading creates fresh IDs and signatures; business quantities, totals and starting states repeat. The normal app and gateway recheck terms when an approval or order is submitted.

The preset definitions are in `apps/api/src/demo/hotel-data.ts`; `seed-workspace.ts` stages requests, submits reviews and records decisions through the same HTTP operations the app uses. `seed-workspace.test.ts` loads it twice with external network calls rejected, checks the visible states and receipts, and exercises an approval after loading. It also verifies that an unknown profile or missing fixture cannot clear an existing workspace.
