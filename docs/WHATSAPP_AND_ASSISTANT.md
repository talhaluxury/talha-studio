# WhatsApp messages and the AI assistant

## 1. WhatsApp (welcome message + order confirmation)
Uses the **WhatsApp Business Cloud API** from Meta. A normal WhatsApp or WhatsApp Business app number cannot send automatic messages.

Setup (once):
1. developers.facebook.com > create an app > add **WhatsApp**. Add and verify a business phone number (it can not be in use on the normal WhatsApp app).
2. Create a **permanent access token** (System User in Business Settings) and copy the **Phone number ID**.
3. In WhatsApp Manager > Message templates, create these two templates (category **Utility**, language English, body text exactly with the placeholders):
   - `welcome_customer`: `Assalam o Alaikum {{1}}! Welcome to {{2}}. Your account is ready. Ask us anything in the app chat, we are happy to help.`
   - `order_confirmation`: `Hi {{1}}, thank you for your order {{2}} at {{3}}. Total: Rs {{4}} (Cash on Delivery). We will deliver to {{5}} and update you when it ships.`
   Wait until Meta marks both **Approved** (usually minutes to a day). If you use another language, set `WHATSAPP_LANG` (e.g. `ur`).
4. On the server set `WHATSAPP_DRIVER=cloud`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (names of the templates can be changed with `WHATSAPP_TPL_WELCOME` / `WHATSAPP_TPL_ORDER`), run `npm run migrate`, redeploy.

Behaviour: the welcome goes to every new **phone-number** account, the confirmation to the phone number typed at checkout. Each message is sent at most once, a number gets at most 5 per hour, and a failure never blocks a sign-up or an order. Admin > **WhatsApp** shows every attempt and the error (expired token, template not approved, ...). Nothing is sent for events that happened before WhatsApp was switched on. Meta charges per conversation (see their price list) and requires that customers agreed to receive WhatsApp messages: the sign-up and checkout screens say so.

## 2. AI assistant
A glowing orb (your logo) floats above the app; customers can drag it anywhere and tap it to ask about products, sizes, delivery and their own orders (English, Urdu, Roman Urdu). It only reads: it can not place or change orders. It sees the published products, the store's delivery/return rules and, for a signed-in customer, that customer's last 3 orders.

Setup: set `ANTHROPIC_API_KEY` (console.anthropic.com) on the server. Optional: `ASSISTANT_MODEL` (default `claude-haiku-5-5`, cheap and fast) and `ASSISTANT_DAILY_LIMIT` (questions per customer or IP per day, default 60: this is your protection against a surprise bill). Without a key the orb is hidden.

## 3. Customer replies and new-product messages (migration 008)
**Customer replies (YES, AI answers, STOP).** Customers can write to the store's WhatsApp number:
- `YES` / `haan` / `ji` / `confirm` confirms their newest **pending** order (status becomes *confirmed*, with the note "Confirmed by the customer on WhatsApp").
- `STOP` stops promotional messages (new products). `START` turns them back on. Order updates are not affected.
- Anything else is answered by the AI assistant (same rules as in the app: it can read, never change orders). Each number gets at most 20 replies per hour.
- Free-text replies only work inside Meta's 24-hour window after the customer's message, which is always the case when answering.

Setup (after the Cloud API works):
1. Meta app > **App settings > Basic**: copy **App secret** to `WHATSAPP_APP_SECRET`.
2. Choose any random text as `WHATSAPP_VERIFY_TOKEN` and set it on the server.
3. Meta app > **WhatsApp > Configuration > Webhook**: Callback URL `https://<your-api>/v1/webhooks/whatsapp`, Verify token = the same text, then subscribe to the **messages** field.
4. Customers are matched to orders by the phone number of their account (the number they signed up with).

**New product message.** Create a third template, category **Marketing**, name `new_arrival` (or set `WHATSAPP_TPL_NEW_ARRIVAL`):
`Hi {{1}}, new at {{4}}: {{2}} for Rs {{3}}. Open the app to see it. Reply STOP to stop these messages.`
Then in the admin web: **WhatsApp** > *Tell customers about a product* > pick a published product > **Send to customers**. Each customer gets a given product once (pressing twice does not double it), at most 500 customers per press, and customers who replied STOP are skipped. Meta charges more for Marketing conversations than for Utility ones, so send only when there is something worth sending.

## 4. Your own number by QR code (WHATSAPP_DRIVER=qr)
No Meta account, no templates, no approval. Set `WHATSAPP_DRIVER=qr` on the server and redeploy. Then open the admin web > **WhatsApp**, scan the QR code with your phone (WhatsApp > Linked devices > Link a device). The session is saved in the database, so a restart does not need a new scan.
- Order confirmation, welcome message, new-product message, YES / STOP / START and AI answers work exactly as in the Cloud API mode (the texts are written in `backend/src/waQr.ts`).
- This is unofficial: send only to customers who signed up or ordered, keep new-product messages rare, and never send the same thing to hundreds of people every day. Broadcasts go out slowly (one every 6 to 14 seconds) on purpose.
- Render free plan: the server sleeps after 15 minutes idle and WhatsApp disconnects while it sleeps. Ping `https://<your-api>/healthz` every 5 minutes with UptimeRobot.
- While the phone is not linked, no message is sent and none is queued.
