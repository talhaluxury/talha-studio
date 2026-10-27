# Security review (Phase 9)

Scope: backend API, admin web panel, both Android apps, CI/CD. Method: code review of every route and store against the OWASP API Security Top 10, plus targeted tests. Findings below were fixed in this phase unless listed under *Accepted / residual risks*.

## What was verified (and is covered by tests)
| Area | Result |
|---|---|
| Authentication | Argon2id passwords; 15-min access tokens + rotating refresh tokens stored hashed; reuse of a rotated token revokes all sessions; login timing equalised for unknown emails; Google ID tokens verified server-side. Admin sign-in is a separate endpoint with a separate token audience; customer tokens never work on admin routes and vice versa. |
| Authorisation | Every privileged route checks role server-side on each request and re-reads the account, so deactivation takes effect at once. Staff are read-mostly; catalogue/prices/coupons need admin; settings, team and activity log need owner. Customer data (orders, addresses, notifications, export) is always filtered by the signed-in user's id (other ids return 404). |
| Money and stock | Prices, discounts, delivery and totals are recomputed on the server inside the order transaction; client values are ignored. Variant rows are locked (`FOR UPDATE`) so the last item cannot be sold twice; coupons are locked so single-use codes cannot be used twice. Idempotency keys prevent duplicate orders on retries. |
| Input handling | Every body/query is validated with Zod; SQL is parameterised (only validated integers are interpolated for LIMIT/OFFSET); uploads are decoded (not trusted by name/type), size- and pixel-limited, stripped of metadata, re-encoded; no HTML is built from user text on the admin site (text nodes only) and emails/policy pages escape everything; CSV export neutralises spreadsheet formulas. |
| Secrets | Only in server env vars/host secrets; config errors name variables, never values; logs redact `Authorization`; `scripts/check-secrets.sh` blocks committed keys, keystores, `.env`, `google-services.json` and service-account files (CI). |
| Transport | HTTPS enforced by the host; production config refuses non-https origins/media URLs; Android release forbids cleartext (debug-only exception); strict CSP on the admin site; Helmet headers on the API. |
| Webhooks and cron | Resend webhooks accepted only with a valid, recent Svix signature (constant-time compare); the cron endpoint needs `CRON_SECRET` and is disabled when unset. |
| Android | Backups off; release builds minified; tokens kept in app-private storage; deep links are validated against a strict pattern before navigation; admin app blocks screenshots, file access and navigation off its own origin. |

## Findings fixed in this phase
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium | Password guessing across many IPs against one account was limited only per IP. | Per-account lockout (8 customer / 5 admin failures per 15 min), even the right password is refused while locked. |
| 2 | Medium | A mis-set production environment (local disk storage, http origins, wildcard CORS, placeholder JWT secret) would start silently. | The API now refuses to boot in production with those settings and prints which variable is wrong. |
| 3 | Medium | A customer could place unlimited open COD orders (stock-hoarding / fraud). | Cap on simultaneous open orders per customer (`MAX_OPEN_ORDERS_PER_USER`), idempotent replays still work. |
| 4 | Medium | Checkout accepts any email address, so the store could be used to spam a third party with confirmations. | Per-recipient cap (5 per hour); extra emails are recorded as skipped. Rate limits on `/orders` already apply. |
| 5 | Low | `trustProxy: true` trusted any `X-Forwarded-For`, letting a client spoof its IP for rate limits when reachable directly. | `TRUST_PROXY_HOPS` (default 1) trusts only the expected number of proxies. |
| 6 | Low | Authenticated JSON could be cached by shared proxies/browsers. | `Cache-Control: no-store` on `/v1/me`, `/admin`, `/auth`, `/orders`, `/cart`. |
| 7 | Low | Giving a new product a variant SKU that already belongs to another product was silently ignored. | Now a clear "SKU already in use" conflict. |
| 8 | Low | Several SQL parameters lacked explicit types (would fail on real Postgres). | Explicit casts added; real-Postgres integration tests added for CI. |
| 9 | Low | Unused `ACCESS_NETWORK_STATE` permission. | Removed (least privilege). |

## Accepted / residual risks (know these)
- **Email addresses are not verified.** Anyone can register with someone else's address. Mitigated by caps above; add email verification if abuse appears.
- **No second factor for admin accounts.** Use a long unique passphrase; rotate if a device is lost. The admin token is short-lived (60 min) and kept in `sessionStorage`.
- **Login lockouts are held in memory.** Correct for one API instance (free tier). If you run several instances, move the counters to the database.
- **Android stores tokens in private SharedPreferences, not the hardware Keystore.** Acceptable on non-rooted devices; use encrypted storage if your threat model needs it.
- **Free hosts sleep and have quotas** (see `docs/DEPLOYMENT.md`). That is an availability, not a confidentiality, risk.
- **COD fraud** (fake orders, refusals at the door) is a business risk the software can only limit, not remove.
- **Dependencies:** CI runs `npm audit` weekly and Dependabot opens upgrade PRs, but this environment had no network, so **no dependency audit was run during development**: the first CI run is your first audit.
- **Not penetration-tested.** This was a code review with tests, not an external pentest. Consider one before significant volume.
- **What could not be executed here:** the Android apps and the Postgres-specific code were not built/run in this environment. The CI workflows run them (including the real-database suite); treat the first green CI run as the verification step.

## Operating guidance
- Rotate `JWT_ACCESS_SECRET` (signs everyone out), API keys, and the Firebase service account if any may have leaked; remove the bootstrap admin password from the host after `seed:admin`.
- Review the **Activity log** (owner) after any staff change; deactivate leavers at once.
- Keep policy pages truthful: if you add analytics, ads or new processors, update the Privacy Policy and Play Data safety form.
