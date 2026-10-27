# Order emails: setup guide (Phase 6)

## How it works
1. A customer places an order. The order is saved first (database transaction).
2. Two rows are added to the `email_logs` outbox: a confirmation for the customer and a new-order alert for the owner. Each has a unique `dedupe_key` (e.g. `order_confirmation:<orderId>`), so the same email can never be queued twice.
3. A worker sends due rows through the provider. It runs right after an order, every 30 seconds, when the server boots, and when your free pinger calls `POST /v1/internal/email/run`.
4. If sending fails, the order is untouched. Temporary errors retry after 1 min, 5 min, 15 min, 1 h, 6 h (6 tries total). Permanent errors (bad address, unverified domain) fail at once and appear in **Email & settings > Email log** with a **Retry** button.
5. The Resend `Idempotency-Key` header equals the dedupe key, so even a crash between "provider accepted" and "we saved that" cannot cause a duplicate.
6. "Sent" in our log means **the provider accepted the email**. Only the provider webhook can confirm **Delivered / Bounced / Marked as spam**; the admin shows exactly that wording.

While `EMAIL_DRIVER=none`, nothing is sent and nothing is lost; emails wait in the queue and go out once you configure a provider.

## Option A: Resend (recommended)
Free plan facts (checked Oct 2026, verify before launch): 3,000 emails/month, **100/day** (UTC day), 1 verified domain, webhooks included, no card to start. **A verified domain is required** to send to your customers.
Rough capacity: each order sends about 2 emails at placement plus 1 to 2 later (shipped/delivered), so the free tier covers roughly 25-30 orders a day. If you pass 100/day, extra emails get a 429 and are retried automatically later (the quota resets at UTC midnight), or upgrade to a paid plan.

1. Create a Resend account, add your domain, and add the DNS records they show (SPF, DKIM). Wait until it says Verified (usually minutes, up to 72 h).
2. Create an API key (sending access).
3. On the API host set: `EMAIL_DRIVER=resend`, `RESEND_API_KEY=...`, `EMAIL_FROM="Talha Studio <orders@yourdomain.com>"` (an address on the verified domain).
4. Webhook (for delivery confirmation): in Resend > Webhooks add `https://YOUR-API-HOST/v1/webhooks/resend` with events `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`. Copy the signing secret (`whsec_...`) to `RESEND_WEBHOOK_SECRET`.
5. Optional: `ADMIN_PUBLIC_URL` (adds "Open order in admin" to the owner email), `PUBLIC_LOGO_URL` (https logo for the email header).
6. Open the admin panel > **Email & settings**: enter the **owner email**, support details and optional estimated delivery, press **Save**, then **Send test email**.

## Option B: any SMTP server
`EMAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587 STARTTLS or 465 TLS), `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. SMTP gives no delivery webhook and no provider-side idempotency, so a crash at the wrong instant could rarely cause one duplicate. Prefer Resend.

## Keeping a sleeping free host responsive
Free hosts sleep when idle, so queued retries pause. Set `CRON_SECRET` to a long random string, then create a free job (e.g. cron-job.org) every 10 minutes: `POST https://YOUR-API-HOST/v1/internal/email/run` with header `x-cron-secret: <secret>`. It wakes the host and flushes the queue. Without it, the queue is flushed whenever the host next wakes up.

## Security notes
- Provider keys and webhook secrets live only in server environment variables; the admin shows only whether email is configured, never the keys.
- Customer text in emails is HTML-escaped; subjects cannot contain line breaks (no header injection).
- Webhooks are accepted only with a valid, recent signature.
- Only the owner can read or change settings; admins and owners can view logs and retry; staff cannot.
