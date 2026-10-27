# Setup steps (Roman Urdu) - secrets yahan kabhi mat likhna

## 1. Database (Neon)
- neon.tech, project `talha-studio`, region Singapore, sirf Postgres on.
- Connect: Connection pooling OFF, poori string copy = DATABASE_URL.

## 2. Photos (Cloudflare R2)
- Naya bucket `talha-media`, Settings: Public Development URL enable (`allow`) = PUBLIC_MEDIA_BASE_URL.
- Naya API token `talha-api`: Object Read & Write, sirf `talha-media`.
- Notes mein: S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.

## 3. Server (Render)
- render.yaml pehle se theek hai (region singapore, EMAIL_DRIVER none).
- Render: New > Blueprint > repo `talha-studio`.
- Bharo: DATABASE_URL, S3_ENDPOINT, S3_BUCKET=talha-media, S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY, PUBLIC_MEDIA_BASE_URL, ADMIN_ORIGIN=https://appassets.androidplatform.net
- Baaqi khali. Deploy. Logs: "migrations up to date". Test: <API_URL>/healthz

## 4. Owner account (Codespaces ya computer se)
cd backend && npm install
DATABASE_URL="<neon string>" ADMIN_BOOTSTRAP_EMAIL=email ADMIN_BOOTSTRAP_PASSWORD='lambi passphrase' JWT_ACCESS_SECRET=<32+ akshar> npm run seed:admin

## 5. App ko server batao (GitHub > Settings > Secrets and variables > Actions > Variables)
- API_BASE_URL = https://<API_URL>/v1/
- ADMIN_API_BASE = https://<API_URL>/v1
- Phir Actions: Android aur Admin Android app dobara Run workflow, naye APK download.

## 6. Test
- Admin app login, category + product (photo ke saath), phir customer app.
