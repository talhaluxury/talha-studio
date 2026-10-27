# Talha Studio

Luxury fashion commerce, built as separate, connected parts that share one backend and one database.

| Part | Folder | What it is |
|---|---|---|
| Customer app | `android/` | Kotlin + Jetpack Compose shopping app for Google Play |
| Admin panel | `admin/` | Responsive installable web app (no build step) for the store owner |
| Admin app | `admin-android/` | The admin panel wrapped as its own Android app (APK) |
| API | `backend/` | Node.js + TypeScript (Fastify) REST API, PostgreSQL, image storage, email, push |
| Docs | `docs/` | Architecture, API contract, setup and release guides |

## Status: all nine phases are implemented
1. Structure, brand, design system, navigation, schema, API contract
2. API, accounts, Google Sign-In, separate admin login, roles
3. Products, categories, inventory, secure image pipeline, admin panel
4. Live catalogue, search/filter/sort, product detail, wishlist, cart with server pricing
5. Sign-in, Cash on Delivery checkout, order history/tracking/returns, admin order management, analytics
6. Order emails with outbox, retry, dedupe, delivery webhook, templates
7. Push notifications (FCM, no Blaze), in-app inbox, preferences, admin campaigns
8. Banners, coupons, delivery settings, policy pages, privacy export, customers, activity log
9. Security review and hardening, real-Postgres and acceptance tests, CI/CD, deployment and release guides

**Important:** the code was written and reviewed in an environment with **no internet and no Android SDK or Postgres**, so the Android apps, `npm install`/tests and the Postgres code had **not been executed** when this was packaged (the admin web panel was exercised in a real browser against a mock API). The first CI run is the real verification: expect to fix a few small compile/test errors, and use `docs/ACCEPTANCE.md` on the deployed system.

## Start here
1. `docs/ARCHITECTURE.md`: how it fits together and the free-tier limits that were checked.
2. `docs/DEPLOYMENT.md`: Neon + Cloudflare R2 + Render + Cloudflare Pages, with every variable.
3. `docs/EMAIL_SETUP.md`, `docs/PUSH_SETUP.md`: Resend and Firebase.
4. `docs/ANDROID_RELEASE.md`, `docs/PLAY_STORE_CHECKLIST.md`: signing, Play Console, data safety.
5. `docs/SECURITY_REVIEW.md`, `docs/ACCEPTANCE.md`: what was reviewed and how to verify the system.
6. `docs/API_CONTRACT.md`: every endpoint.

## Local quick start
```
# API (needs Postgres, e.g. a free Neon database)
cd backend && cp .env.example .env     # fill DATABASE_URL and JWT_ACCESS_SECRET (32+ random chars)
npm install && npm run migrate && npm run seed:admin && npm run seed:demo && npm run dev   # http://localhost:4000/healthz

# Admin panel (static files)
cd admin && python3 -m http.server 8080    # set ADMIN_ORIGIN=http://localhost:8080 on the API

# Customer app: open android/ in Android Studio (JDK 17), run the debug build (talks to http://10.0.2.2:4000/v1/)
```

## Brand
`brand/talha-logo-original.png` is the untouched official logo. Never stretch, crop or recolor it.
Black #080808 · Ivory #FAF8F3 · Gold #B99A62 · Neutral #E9E0D3 · Gray #77736D.

## Repository rules
Never commit keystores, `.env`, `google-services.json`, Firebase service-account JSON or any API key. `scripts/check-secrets.sh` (run in CI) enforces this. Demo products are labelled `(Demo)` with `DEMO-` SKUs: delete them before launch.
