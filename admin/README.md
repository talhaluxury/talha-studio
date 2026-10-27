# Talha Studio Admin (web)

Dependency-free static web app (ES modules, no build step) — an installable PWA. Separate from the customer app; talks only to the API.

1. Edit `js/config.js` → `API_BASE` (your HTTPS API URL, ending in `/v1`).
2. Deploy the `admin/` folder to any static host (Cloudflare Pages, GitHub Pages, Netlify). `_headers` sets a strict CSP (Cloudflare Pages/Netlify); tighten `connect-src` to your API origin.
3. Set the API's `ADMIN_ORIGIN` to the admin site URL (CORS).
4. Sign in with the owner created by `npm run seed:admin`. Staff accounts are view-only on the catalogue; admin/owner can edit.

Local: `cd admin && python3 -m http.server 8080` (API on :4000, `ADMIN_ORIGIN=http://localhost:8080`).
Sessions use `sessionStorage` with a 60-minute token (no refresh): closing the tab signs you out.

## Android admin app (APK)
`admin-android/` wraps this same folder in a locked-down WebView (no screenshots, no external navigation). GitHub Actions workflow **Admin Android app** builds it:
1. Repo Settings > Secrets and variables > Actions > **Variables**: add `ADMIN_API_BASE` = `https://your-api-host/v1`.
2. Push to `main` (or run the workflow manually) and download `talha-admin-debug-apk` from the run's Artifacts.
3. On the API set `ADMIN_ORIGIN` to include `https://appassets.androidplatform.net` (comma-separated).
For a signed release APK add secrets `TS_KEYSTORE_BASE64`, `TS_KEYSTORE_PASSWORD`, `TS_ADMIN_KEY_ALIAS`, `TS_KEY_PASSWORD`.
