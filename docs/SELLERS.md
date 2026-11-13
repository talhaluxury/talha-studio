# Sellers and brands (marketplace)

Authentic brands can sell inside the app, like a marketplace.

**Flow**
1. In the app: **Profile → Seller account**. Everything happens inside the app; no separate website is needed.
2. The seller signs in to the app with **Google** (the normal app login) and sends an application (brand name, phone, city, what they sell).
3. Admin app/site → **Brands** → opens the application → **Approve** (or reject with a reason).
4. Approved seller opens the same screen, which now has **Page / Products / Orders** tabs, and builds a website-like page: logo, cover, about text, highlights, colour style (noir / ivory / gold), collections, and adds products (photos, sizes/colours, prices, stock). **Preview my page** shows exactly how customers will see it (3D).
5. Seller presses **Send for review**. Admin sees the draft next to the live version and chooses **Approve & publish** or **Send back** with a note. Products can also be rejected one by one.
6. After approval the brand shows in the app under **Brands** (logo + name). Tapping it opens the brand page (3D tilt cards, parallax cover) where customers buy as usual.
7. Orders: the admin order list and order detail show a **brand badge** on every item. The seller sees their own orders (only their items, no customer email) in the Orders tab and gets a notification for each new order.

Edits after approval are safe: the seller edits a draft; customers keep seeing the approved version until the admin approves the new one. Suspending a brand hides it and all its products immediately.

## Setup (one time)

**Minimum (everything in the app):** run the migration (step 1) and redeploy the API, redeploy the admin site, rebuild the Android app. Steps 2 to 4 below are only for the optional seller *website*.


1. **Database:** run migration `backend/db/migrations/018_brands.sql` (`npm run migrate`).
2. **Google sign-in for the website:** in Google Cloud Console → Credentials → the *Web application* client that the API already uses as `GOOGLE_WEB_CLIENT_ID` → **Authorised JavaScript origins** → add the seller site address (e.g. `https://sellers.yourdomain.com`).
3. **Seller site:** edit `seller/js/config.js`: set `API_BASE` (your API, ending `/v1`) and `GOOGLE_CLIENT_ID` (the same web client ID). Deploy the `seller/` folder as a static site (Cloudflare Pages, same as `admin/`; no build step).
4. **API environment (Render):** `SELLER_ORIGIN=https://sellers.yourdomain.com` (exact origin, used for CORS) and `SELLER_PORTAL_URL=https://sellers.yourdomain.com` (the app opens this from Profile).
5. **Admin site:** redeploy `admin/` (a new **Brands** menu entry; service worker cache is `ts-admin-v22`). Rebuild the admin APK if you ship the bundled one.
6. **Android app:** rebuild. New screens: Brands row on Home, All brands, Brand page, Seller account, "Sold by" on product detail. Deep links: `talhastudio://brand/<slug>`, `talhastudio://seller`.

## Optional: seller website
The `seller/` website does the same job in a browser (and has a live 3D phone preview while editing). It is optional; the app does not need it. Skip steps 2 to 4 if you do not deploy it.

## Keep in sync
`seller/js/preview.js` + `seller/css/brandpreview.css` render the brand page preview. The admin site uses identical copies (`admin/js/brandPreview.js`, `admin/css/brandpreview.css`). If you change one, copy it to the other.

## Limits and notes
- One brand per seller account. A seller can only touch their own products and orders (checked on the server).
- Seller products are tied to the existing catalogue categories (the seller picks from the store's categories).
- Order status is still managed by the store admin; sellers see status but do not change it in this version.
- Money: sellers see their line totals only. Payouts/commission are not part of this version.
