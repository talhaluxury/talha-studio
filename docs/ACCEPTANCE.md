# Acceptance tests (brief section 17)

Automated scenarios drive the real HTTP API end to end (`backend/tests/acceptance.test.ts`, in-memory stores). Items that need real infrastructure are verified by hand after deployment, using the steps below. Mark them off yourself.

| # | Scenario | Automated check | Manual check on the deployed system |
|---|---|---|---|
| 1 | Admin signs in securely | Wrong password refused; correct login gives an admin-audience token; customer cannot use the admin door; account lockout (`hardening.test.ts`) | Sign in at the admin site; confirm a customer account is refused there |
| 2 | Admin creates a product and uploads images | Category + product + two image uploads (decoded, resized, stored), then publish | Upload a real JPG/PNG from a phone; see it in Products; try a PDF renamed `.jpg` (must be rejected) |
| 3 | Product appears in the customer app | Appears in `/home` collections and `/products` with image URLs | Pull to refresh / reopen the app; it shows on Home |
| 4 | Customer searches and opens it | `/products?q=lawn&inStock=true`, then `/products/:id` | Search and open it in the app |
| 5 | Customer adds to cart | `/cart/quote` returns server-computed totals | Add to cart; confirm price (sale price) and delivery fee match the admin settings |
| 6 | Checkout with Cash on Delivery | `POST /orders` with an idempotency key | Place the order in the app |
| 7 | Backend validates and saves the order | Client-claimed total ignored; stock reduced; order number issued | Confirmation screen shows an order number; Orders list shows it |
| 8 | Order appears in the admin dashboard | Listed under pending; dashboard counts/sales updated | Open admin Orders and Dashboard |
| 9 | Customer confirmation email **when the provider accepts it** | Provider receives the email; log state is *accepted*, never claimed as delivered | Email log shows *Accepted*, then *Delivered* when the Resend webhook is set; check the inbox and spam |
| 10 | Owner new-order email **when the provider accepts it** | Provider receives the owner email with contact, items, address, payment, admin link | Check the owner inbox |
| 11 | Admin changes order status | pending > confirmed > processing > shipped (tracking link) > delivered | Change status in the admin panel |
| 12 | Customer sees the updated status | `/me/orders/:id` shows status, history, tracking link; COD becomes *paid* on delivery | Open the order in the app |
| 13 | Customer receives the configured notification | Push, inbox entry and status email produced | Phone shows the notification; tapping opens the order |
| 14 | Invalid or unauthorised requests are rejected | Other customers get 404; customer token on admin routes 401; missing/invalid fields 400 | Optional: try the same with a second test account |
| 15 | Offline and failed email handled without losing the order | Provider outage: order saved, email *failed* with reason, admin Retry succeeds; duplicate checkout replays create one order | Airplane-mode the phone mid-checkout, reconnect, tap Place Order again: one order only. Break `RESEND_API_KEY`, order, fix, Retry |
| 16 | GitHub Actions builds the configured Android artifact | (CI itself) | Run the **Android** workflow; download `talha-studio-debug-apk` (and the release AAB when signing secrets exist); install and open it |
| 17 | Deployed backend works independently of the admin browser | After the order, emails and push were produced with no admin request in flight | Close the admin site, place an order: emails/push still arrive; wake a sleeping host with the cron ping and see queued emails flush |

## Running the suites
```
cd backend && npm install && npm test          # unit + acceptance (+ Postgres integration if DATABASE_URL_TEST is set)
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=ci postgres:16
DATABASE_URL_TEST=postgres://postgres:ci@localhost:5432/postgres npm test     # include the real-SQL tests
cd android && gradle wrapper && ./gradlew testDebugUnitTest assembleDebug     # needs Android SDK 35
bash scripts/check-secrets.sh
```
