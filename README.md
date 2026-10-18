# Talha Studio, 3D virtual clothing store

**Status: starter scaffold. Not yet built or tested** (no network was available to install dependencies when this was generated). Run the workflows and fix any errors first.

## Implemented
Cinematic entrance + ENTER/SKIP, 3D showroom (Three.js) with 4 sections, drag-to-look/walk, on-screen buttons, wall/rack collision, tap garments to open product details, cart with quantities/totals (localStorage), Firestore product loading with demo fallback, PWA manifest + service worker, Firestore rules, web + Android workflows.

## Not implemented yet
Auth, checkout/orders (needs Cloud Function), admin dashboard, Storage uploads, 3D garment models, mini-map, search, order tracking, payment gateways, tests. Garments are placeholder boxes, not real product models.

## Run
`npm install && cp .env.example .env && npm run dev`

## Firebase
Create a project, enable Firestore, add a web app, put values in `.env` (locally) and in GitHub secrets `VITE_FB_API_KEY, VITE_FB_AUTH_DOMAIN, VITE_FB_PROJECT_ID, VITE_FB_STORAGE_BUCKET, VITE_FB_APP_ID`. Deploy `firestore.rules`. Product docs: `name, section(men|women|unstitched|sale), price, salePrice, sizes[], colors[], stock, images[], description, fabric, active`.

## GitHub
Create repo, push this folder to `main`. Settings > Pages > Source: GitHub Actions. Actions tab > "Web (PWA)" deploys the site; "Android APK/AAB" produces `talha-studio-apk` / `-aab` artifacts (debug-signed; release signing needs your own keystore stored as secrets). Actions and Pages are free within GitHub's free-tier limits; Firebase has its own free tier.
