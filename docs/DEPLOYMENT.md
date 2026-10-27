# Deployment guide (free-tier friendly)

Everything below can run on free tiers. Free tiers have real limits and can change: the numbers here were checked in Oct 2026, so re-check them before launch.

| Piece | Service | Free-tier facts that matter |
|---|---|---|
| API (Node) | **Render** web service (Docker) | Sleeps after ~15 min idle (first request then takes ~1 min); 750 instance-hours/month; ephemeral disk; no shell. |
| Database | **Neon** Postgres | ~0.5 GB, scales to zero (small wake delay). *Do not use Render's free Postgres: it expires after 30 days.* |
| Images | **Cloudflare R2** (or Backblaze B2) | R2: 10 GB, generous free request quota, no egress fees; may need a payment method on file even for free use. |
| Email | **Resend** | 3,000/month and 100/day; a verified domain is required. See `docs/EMAIL_SETUP.md`. |
| Push | **Firebase Cloud Messaging** | Free; no Blaze plan. See `docs/PUSH_SETUP.md`. |
| Admin site | **Cloudflare Pages** (or GitHub Pages / Netlify) | Static files only. |
| CI/CD | **GitHub Actions** | Public repos free; private repos have a monthly minutes allowance. |

A sleeping API is acceptable because orders are saved before anything else happens, the app waits up to 60 s and retries safely (idempotency keys), and queued emails are flushed when the host wakes. To keep it awake use a free pinger (section 7).

## 1. Database (Neon)
1. Create a project and copy the connection string (it contains `sslmode=require`). This is `DATABASE_URL`.
2. Migrations run automatically every time the API starts (`node dist/migrate.js`, once per file, each in a transaction).

## 2. Image storage (Cloudflare R2)
1. Create a bucket (e.g. `talha-media`). Create an **R2 API token** with *Object Read & Write* on that bucket. Note the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
2. Make the bucket readable by the public: attach a **custom domain** (e.g. `media.yourdomain.com`), which is the recommended way. (The `r2.dev` address is for testing only and is rate-limited.)
3. Settings: `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `PUBLIC_MEDIA_BASE_URL=https://media.yourdomain.com` (no trailing slash).
4. Backblaze B2 or MinIO work the same way (any S3-compatible service). The API refuses to start in production with `STORAGE_DRIVER=local`, because a free host's disk is wiped on every deploy.

## 3. API (Render)
1. New > **Blueprint**, choose this repo (`render.yaml`), or create a Docker web service with root `backend/`.
2. Fill the environment variables (table below). Health check path: `/healthz`.
3. First boot logs `migrations up to date`, then the server starts. If a required variable is wrong the API **refuses to start** and prints which variable is invalid (never its value).
4. Create the first owner from your own computer (Render's free plan has no shell):
   ```
   cd backend && npm install
   DATABASE_URL="<neon url>" ADMIN_BOOTSTRAP_EMAIL=you@yourstore.com ADMIN_BOOTSTRAP_PASSWORD='a long passphrase' JWT_ACCESS_SECRET=x...x(32+) npm run seed:admin
   ```
5. Optional demo products for a test environment only: `npm run seed:demo` (refuses to run when `NODE_ENV=production`).

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `JWT_ACCESS_SECRET` | 32+ random characters (Render can generate it) |
| `ADMIN_ORIGIN` | exact https origins, comma-separated: `https://admin.yourdomain.com,https://appassets.androidplatform.net` (the second is the Android admin app) |
| `TRUST_PROXY_HOPS` | `1` on Render (`2` if Cloudflare proxies in front of it) |
| `STORAGE_DRIVER` + `S3_*` + `PUBLIC_MEDIA_BASE_URL` | section 2 |
| `EMAIL_DRIVER`, `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ADMIN_PUBLIC_URL`, `CRON_SECRET` | `docs/EMAIL_SETUP.md` |
| `FCM_SERVICE_ACCOUNT_JSON` | `docs/PUSH_SETUP.md` |
| `GOOGLE_WEB_CLIENT_ID` | Google Cloud OAuth *Web* client ID (Google Sign-In) |
| `MAX_COD_ORDER_PKR`, `RETURN_WINDOW_DAYS`, `STORE_TIMEZONE`, `MAX_OPEN_ORDERS_PER_USER` | optional tuning (defaults in `.env.example`) |

Secrets live only in Render's environment (never in git, the app, or the admin site).

## 4. Admin site
1. In GitHub: **Settings > Secrets and variables > Actions > Variables**: `ADMIN_API_BASE` = `https://YOUR-API-HOST/v1`, `CF_PAGES_PROJECT` = your Pages project name. **Secrets**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
2. Push to `main` (or run **Deploy admin site**). The workflow stamps the API address into `admin/js/config.js` and deploys `admin/` to Cloudflare Pages. Without Cloudflare secrets it still uploads the site as an artifact.
3. Put the resulting URL in `ADMIN_ORIGIN` on the API.

## 5. GitHub variables and secrets (summary)
| Name | Kind | Used by |
|---|---|---|
| `API_BASE_URL` | variable | Android build (customer app) |
| `GOOGLE_WEB_CLIENT_ID` | variable | Android build |
| `ADMIN_API_BASE` | variable | admin site + Android admin app |
| `CF_PAGES_PROJECT` | variable | admin deploy |
| `GOOGLE_SERVICES_JSON_BASE64` | secret | Android build (enables push) |
| `TS_KEYSTORE_BASE64`, `TS_KEYSTORE_PASSWORD`, `TS_KEY_ALIAS`, `TS_ADMIN_KEY_ALIAS`, `TS_KEY_PASSWORD` | secrets | signed release builds (`docs/ANDROID_RELEASE.md`) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets | admin deploy |
| `RENDER_DEPLOY_HOOK_URL` | secret | optional explicit API deploy |

## 6. Third-party callbacks
- Resend webhook: `https://YOUR-API-HOST/v1/webhooks/resend`.
- Google OAuth: Android client for `com.talhastudio.app` with your **release** and **Play App Signing** SHA-1 fingerprints (`docs/ANDROID_RELEASE.md`).

## 7. Keep-alive and queue flush (optional, free)
Create a job at cron-job.org every 10 minutes: `POST https://YOUR-API-HOST/v1/internal/email/run` with header `x-cron-secret: <CRON_SECRET>`. It wakes the host and sends any queued emails. It uses instance-hours: pinging every 10 minutes all day keeps the service awake roughly 720 hours a month, inside the 750-hour allowance for one service.

## 8. Backups and restore
Neon keeps point-in-time history on its free plan for a limited window; export your own copy regularly: `pg_dump "$DATABASE_URL" -Fc -f talha-$(date +%F).dump`. Restore with `pg_restore --clean --no-owner -d "$DATABASE_URL" talha-YYYY-MM-DD.dump`. Product images are in R2 (enable R2 bucket lifecycle/versioning if you want protection from accidental deletes). Order orphan cleanup: `npm run cleanup:orphans` (dry run; add `--apply`).

## 9. Go-live smoke test (10 minutes)
1. `GET https://YOUR-API-HOST/healthz` returns `{"ok":true}`.
2. Sign in to the admin site; create a category and product with a photo; publish.
3. Install the app build pointing at this API; the product shows on Home.
4. Place a COD order as a test customer. Check: order appears in Orders; the owner and customer received email (Email log shows *Accepted*, later *Delivered* if the webhook is on); the phone got a push.
5. Mark the order Shipped then Delivered; confirm the app updates.
6. Delete the test data. Confirm `GET /legal/privacy` shows your reviewed policy.
