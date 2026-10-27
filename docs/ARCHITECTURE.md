# Talha Studio — Architecture

```
Android app (Kotlin/Compose) ─┐
                              ├─ HTTPS ─▶ API (Node.js + TypeScript, Fastify) ─▶ PostgreSQL
Admin web (TypeScript, PWA) ──┘                    │                │
                                                   ├─▶ Object storage (S3-compatible) — product images
                                                   ├─▶ Email provider (HTTPS API or SMTP) — outbox worker
                                                   └─▶ Firebase Cloud Messaging (HTTP v1) — push
GitHub Actions: test, build debug APK, signed AAB/APK when secrets exist, deploy API.
```
The customer app and the admin panel are separate projects with separate entry points. Admin routes (`/v1/admin/*`) require a staff/admin/owner role verified **server-side** on every request.

## Chosen free-tier stack (limits checked Oct 2026 — re-verify before launch, providers change them)

| Need | Choice | Real limits / caveats |
|---|---|---|
| API runtime | Render free web service (or any Node host) | Sleeps after 15 min idle; ~1 min cold start; 750 free instance-hours/month shared; ephemeral filesystem; can restart anytime. |
| Always-on alternative | Oracle Cloud Always Free VM (self-managed) | No sleep, but availability varies by region and you maintain the server. |
| Database | **Neon** Postgres free | 0.5 GB per project, ~100 CU-hours/month, scales to zero (small wake delay). |
| **Do not use** | Render's free Postgres | **Expires 30 days after creation** and is deleted after a 14-day grace. Unsuitable for production orders. |
| Images | Cloudflare R2 (S3 API) | 10 GB, 1M writes + 10M reads/month, no egress fee. Reports indicate enabling it requires a payment method on file; you are only charged above the free quota. Fallback: Backblaze B2, or MinIO on your own VM. Provider is swappable via `STORAGE_DRIVER`. |
| Email | Resend (HTTPS API) | Reported 3,000 emails/month free; needs a verified sending domain. Fallback: any SMTP (e.g. Brevo). |
| Push | Firebase Cloud Messaging | Free; **no Blaze needed** because the API calls FCM HTTP v1 directly with a service account stored as a host secret (no Cloud Functions). |
| CI/CD | GitHub Actions | Public repos: free. Private repos: limited monthly minutes. |

### Consequences of a sleeping free API (designed for, not hidden)
- First request after idle takes ~1 min: the app uses 30 s timeouts + retry with a friendly "waking up the store" state. A free uptime pinger (e.g. cron-job.org hitting `/healthz` every 10 min) reduces sleeps but consumes the 750 h budget.
- Orders are saved **before** any email is attempted. Emails go through the `email_logs` outbox; a worker retries with backoff, and also runs on every API wake-up. Order creation uses an `Idempotency-Key`, so retries never duplicate orders.
- Nothing depends on the admin's browser being open.

## Security model
Argon2id passwords, short-lived JWT access tokens + rotating refresh tokens (hashed in DB), Google ID-token verification server-side, role checks per route, rate limiting on auth/checkout, Zod validation, parameterised SQL, prices/totals/stock always computed on the server, secrets only in env/host secret store.

## Phase map
All nine phases are implemented; see the README for the status and verification notes.
