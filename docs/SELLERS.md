# Sellers and brands (marketplace)

Authentic brands can sell inside the app, like a marketplace.

**Flow**
1. In the app: **Profile → Seller account**. Everything happens inside the app; no separate website is needed.
2. The seller signs in to the app with **Google** (the normal app login) and sends an application (brand name, phone, city, what they sell).
3. Admin app/site → **Brands** → opens the application → **Approve** (or reject with a reason).
4. Approved seller opens the same screen, which now has **Page / Products / Orders** tabs. The Page tab is a full website builder made of ordered **sections**: **Banner** slider (1-6 slides, each with image, title, subtitle, button linking to a product), **Video** (MP4 up to 25 MB), **Text**, **Products** (grid / carousel / big), **Gallery**, **Highlights** and **Space**. Each section can be moved up/down, hidden or deleted. There are **no colour options**: the page always follows the app's light/dark theme. The seller also adds products (photos, sizes/colours, prices, stock). **Preview** shows how customers will see it.
5. Seller presses **Send for review**. Admin sees the draft next to the live version and chooses **Approve & publish** or **Send back** with a note. Products can also be rejected one by one.
6. After approval the brand shows in the app under **Brands** (logo + name). Tapping it opens the brand page (3D tilt cards, parallax cover) where customers buy as usual.
7. Orders: the admin order list and order detail show a **brand badge** on every item. The seller sees their own orders (only their items, no customer email) in the Orders tab and gets a notification for each new order.

Edits after approval are safe: the seller edits a draft; customers keep seeing the approved version until the admin approves the new one. Suspending a brand hides it and all its products immediately.

## Setup (one time)
1. **Database:** run migration `backend/db/migrations/018_brands.sql` (`npm run migrate`).
2. Redeploy the API (Render), redeploy `admin/` (new **Brands** menu entry; service worker cache `ts-admin-v25`; the review preview has a light/dark toggle), and rebuild the Android app (and the admin APK if you ship the bundled one).
3. Deep links: `talhastudio://brand/<slug>`, `talhastudio://seller`.

Sellers sign in inside the app with the normal app login, so no extra Google client ID or seller website is needed.

## Limits and notes
- Page media: up to 20 sections, banners up to 6 slides, galleries up to 8 images, videos MP4 up to 25 MB, at most 80 media files per brand. Files removed from a page are deleted automatically.
- One brand per seller account. A seller can only touch their own products and orders (checked on the server).
- Seller products are tied to the existing catalogue categories (the seller picks from the store's categories).
- Order status is still managed by the store admin; sellers see status but do not change it in this version.
- Money: sellers see their line totals only. Payouts/commission are not part of this version.
