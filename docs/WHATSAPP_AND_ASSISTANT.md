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
