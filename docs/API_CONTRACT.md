# API Contract v1  (base: `https://<host>/v1`, JSON, UTF-8)

Money: integer PKR. Times: ISO-8601 UTC. IDs: UUID. Auth: `Authorization: Bearer <accessToken>`.
Errors: `{ "error": { "code": "VALIDATION_FAILED", "message": "...", "fields": {"email":"invalid"} } }`
Pagination: `?page=1&limit=20` → `{ "items": [...], "page": 1, "limit": 20, "total": 134 }`

## Shared types
```
Product { id, sku, slug, name, description, category:{id,slug,name}, price, salePrice|null, fabric|null,
          images:[{id,url,thumbUrl}], variants:[{id,size|null,color|null,stock}], inStock:boolean, isFeatured }
Banner { id, title, subtitle, ctaLabel, ctaLink, imageUrl }
Order { id, orderNumber, status, paymentMethod:"cod", paymentStatus, subtotal, discount, shipping, total,
        couponCode|null, customer:{name,email,phone}, address:{line1,line2,city,province,postalCode},
        items:[{productId,variantId,name,size,color,unitPrice,qty}], history:[{status,note,at}], trackingUrl|null, createdAt }
```

## Public / customer
| Method & path | Purpose |
|---|---|
| GET `/healthz` | liveness |
| POST `/auth/register` `{fullName,email,password,phone?}` → `{user,accessToken,refreshToken}` |
| POST `/auth/login` `{email,password}` → same |
| POST `/auth/google` `{idToken}` → same (token verified server-side) |
| POST `/auth/refresh` `{refreshToken}` → new pair (rotation) · POST `/auth/logout` |
| DELETE `/me` | delete account (anonymise; orders retained for records) |
| GET/PATCH `/me` · GET/POST/PATCH/DELETE `/me/addresses` |
| GET `/home` (Phase 8 adds `announcement` and live `banners:[{id,title,subtitle,ctaLabel,ctaLink,imageUrl}]`) → `{banners:[], categories, collections:[{slug,title,products}]}` — collections (new-arrivals, featured, sale) are generated from live catalog data; admin-managed banners come in a later phase |
| GET `/categories` · GET `/products?category&q&sort=new\|price_asc\|price_desc&minPrice&maxPrice&size&color&inStock&onSale&featured&ids=<uuid,uuid,..≤50>&page&limit≤50` |
| GET `/products/:id` → Product + `related:[Product]` |
| GET/PUT/DELETE `/me/wishlist/:productId` |
| POST `/cart/quote` `{items:[{variantId,qty}]}` → `{items:[{variantId,productId,name,size,color,unitPrice,qty,imageUrl}], issues:[{variantId,code:UNAVAILABLE\|OUT_OF_STOCK\|INSUFFICIENT_STOCK,message,available?}], subtotal, discount, shipping, total}`. Prices come from the DB only; items with issues are excluded from totals. Shipping = `SHIPPING_FLAT_PKR`, free at/above `FREE_SHIPPING_OVER_PKR` (0 = off). Coupons arrive with the coupon phase. |
| POST `/orders` (**required header** `Idempotency-Key`: 8–64 chars `[A-Za-z0-9_-]`) `{items:[{variantId,qty}], customer:{name,email,phone}, address:{line1,line2?,city,province?,postalCode?}, notes?, paymentMethod:"cod"}` → `201 Order` (first time) or `200 Order` (same key replayed). Prices, shipping and stock are recomputed **inside the DB transaction** with row locks; client-sent prices are ignored. `409 CART_ISSUES` with `error.details.issues[]` when items changed/sold out; `ORDER_TOO_LARGE` above `MAX_COD_ORDER_PKR`. |
| GET `/me/orders?page&limit` (summaries) · GET `/me/orders/:id` · POST `/me/orders/:id/cancel` (only pending/confirmed; restores stock) · POST `/me/orders/:id/return` `{reason}` (delivered, within `RETURN_WINDOW_DAYS`) — all scoped to the signed-in customer (others get 404) |
| POST `/me/devices` `{fcmToken, platform:"android"}` (upsert; reassigns the token if another account used the phone; max 5 devices/user) · POST `/me/devices/unregister` `{fcmToken}` (POST so the token never appears in URLs) |
| GET `/me/notification-preferences` · PATCH or POST `/me/notification-preferences` `{orderUpdates?, promotions?}` (POST because Android's HttpURLConnection cannot PATCH) · GET `/me/notifications?page&limit` → `{items:[{id,title,body,deepLink,kind:order\|promo,read,createdAt}],total,unread}` · GET `/me/notifications/unread-count` · POST `/me/notifications/:id/read` · POST `/me/notifications/read-all` |
| GET `/store-info` → contact, policies, estimated delivery (only if configured) |

## Admin (`/admin/*`, role ≥ staff; owner-only items marked ★)
`POST /admin/auth/login` (separate login, rate-limited) · `GET /admin/analytics?from&to`
Catalog (Phase 3, **admin/owner write, staff read-only**): `GET /admin/stats` · `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id` · `GET/POST /admin/products`, `GET/PUT/DELETE /admin/products/:id` (PUT replaces the full product incl. variants) · `PATCH /admin/products/:id/publish {isPublished}` (needs ≥1 image and ≥1 variant) · `POST /admin/products/:id/images` (multipart field `file`, JPG/PNG/WebP ≤ 8 MB, ≤ 10 per product; stored as WebP + thumbnail) · `PATCH /admin/products/:id/images/order {imageIds}` · `DELETE /admin/products/:id/images/:imageId`
Later phases: `/admin/banners`, `/admin/collections`, `/admin/coupons`
Orders (Phase 5; **staff+** read/update, export & customers = admin/owner): `GET /admin/orders?status&q&from&to&page&limit` · `GET /admin/orders/:id` (adds `allowedNext`) · `PATCH /admin/orders/:id/status {status,note?,trackingUrl?(https)}` (validated transitions; cancel restores stock; delivered marks COD paid; fires order events for email/push) · `GET /admin/orders/export.csv?status&q&from&to` (formula-injection safe, logged) · `GET /admin/customers?q` · `GET /admin/analytics?days=7|30|90` → `{sales,orders,pending,customers,series[],byStatus,recent[]}`
`GET/PUT /admin/settings` ★ owner only → `{settings:{ownerEmail,store:{name,supportEmail,supportPhone,address},estimatedDelivery,templates:{order_confirmation,owner_new_order,status_update:{subject,intro,footer}}}, email:{provider,configured,from,deliveryTracking,queued,failed}}` · `POST /admin/email/test` ★ · `GET /admin/email-logs?status=queued|sent|failed&page&limit` (admin/owner; `delivery` = `queued|accepted_by_provider|delivered|bounced|complained|failed`) · `POST /admin/email-logs/:id/retry` (failed only) · `POST /internal/email/run` (header `x-cron-secret`, 404 unless `CRON_SECRET` set) · `POST /webhooks/resend` (Svix-signed; 404 unless `RESEND_WEBHOOK_SECRET` set)
`GET /admin/campaigns` → `{items,total,audience:{users,devices},pushConfigured}` · `POST /admin/campaigns {title≤65, body≤240, deepLink?}` (admin/owner, `202 {id,recipients,devices,pushConfigured}`; deepLink must be `talhastudio://product/<uuid>` or `talhastudio://order/<uuid>`; duplicate within 60 s → 409) · `GET /admin/activity-logs` ★ · `GET/POST/PATCH /admin/users` ★ (roles)

## Order status transitions
pending → confirmed → processing → shipped → delivered; cancel allowed before shipped; delivered → refund_requested → refunded.

## Deep links
`talhastudio://order/<orderId>` · `talhastudio://product/<productId>` · `talhastudio://chat` (store replied) · `talhastudio://brand/<slug>` · `talhastudio://seller` (seller account update / new order for a seller)


## Phase 8 additions
**Public:** `GET /store-info` → `{name,supportEmail,supportPhone,address,estimatedDelivery,shipping:{flat,freeOver},returnWindowDays,pages:[{slug,title}]}` · `GET /pages/:slug` (privacy|terms|returns|shipping|refund|about) → `{slug,title,body,contact[]}` · `GET /legal/:slug` (non-versioned HTML page, use `/legal/privacy` as the Google Play privacy-policy URL).
**Customer:** `GET /me/export` (JSON download of profile, addresses, notification prefs and orders; no password hashes or tokens) · `POST /orders` and `POST /cart/quote` accept `couponCode`; quote returns `discount`, `couponCode` and an issue `{variantId:"coupon", code:"COUPON_INVALID", message}` when a code cannot be used (checkout is then refused with 409 CART_ISSUES).
**Pricing rule:** `total = subtotal - discount + shipping`; free delivery is judged on `subtotal - discount`; a cancelled order returns its coupon use.
**Admin (admin/owner):** `GET/POST /admin/coupons`, `PUT/DELETE /admin/coupons/:id` (code 3-20 of A-Z 0-9 _ -, `percent` 1-100 or `fixed`, `minSubtotal`, `maxUses`, `startsAt`/`endsAt`) · `GET/POST /admin/banners`, `PUT/DELETE /admin/banners/:id`, `POST/DELETE /admin/banners/:id/image` (multipart `file`; `ctaLink` must be `talhastudio://product/<uuid>`).
**Owner only:** `GET/PUT /admin/store-settings` `{shipping:{flat,freeOver}, announcement:{text,active}, pages:{privacy,terms,returns,shipping,refund,about}}` · `GET /admin/activity-logs?action=<prefix>&page&limit`. `GET /admin/analytics` now includes `topProducts:[{name,qty,revenue}]`.

## Phase 9: welcome screens, chat, status
**Public:** `GET /onboarding` → `{slides:[{id,title,body,imageUrl}]}` (active only, ordered; `title` may contain `\n`).
**Auth:** `POST /auth/phone/register {fullName, phone, password(>=6)}` (201, same token body as `/auth/register`; 409 if the number exists) · `POST /auth/phone/login {phone, password}`. Numbers are normalised (0300…, +92300…, 300… are the same). The number is **not SMS-verified**; the account email is a generated `p<digits>@phone.talha.invalid`.
**Customer (signed in):** `GET /me/chat?after=<seq>&limit` → `{items:[{seq,id,sender:"customer"|"store",body,imageUrl,createdAt,read}]}` (oldest first; no `after` = latest) · `POST /me/chat {body≤2000}` · `POST /me/chat/image` (multipart `file`) · `POST /me/chat/read` · `GET /me/chat/unread` · `GET /me/status` → `{items:[{id,imageUrl,caption,createdAt,expiresAt}]}` · `POST /me/status/:id/view`. Deleting the account deletes the chat and its pictures.
**Staff (any role):** `GET /admin/chat?page&limit` → `{items:[{customerId,name,phone,unread,last}],unreadTotal}` · `GET /admin/chat/:customerId?after` · `POST /admin/chat/:customerId {body}` (sends a phone push, best effort) · `POST /admin/chat/:customerId/image` · `POST /admin/chat/:customerId/read`.
**Admin/owner:** `GET/POST /admin/onboarding`, `PUT/DELETE /admin/onboarding/:id`, `POST/DELETE /admin/onboarding/:id/image` · `GET /admin/status` (adds `views`) · `POST /admin/status` (multipart: optional text field `caption` BEFORE `file`; expires after 24 h) · `DELETE /admin/status/:id`.

## Phase 10: WhatsApp and assistant
`GET /assistant/enabled` → `{enabled}` · `POST /assistant {messages:[{role:"user"|"assistant",content≤1000}]≤12}` (optional bearer; signed-in customers also get their last 3 orders in the context) → `{reply, actions:[{type:"product"|"cart"|"orders"|"chat", id?, label}]}`; 429 `ASSISTANT_LIMIT`, 503 `ASSISTANT_OFF`, 502 `ASSISTANT_FAILED`.
`GET /admin/whatsapp` (admin/owner) → `{configured, provider, items:[{id,kind,to,status:sending|sent|failed|skipped,error,createdAt}]}`. WhatsApp itself is sent by the server on phone sign-up and on order creation; see docs/WHATSAPP_AND_ASSISTANT.md.

## Phase 11: sellers and brands (marketplace)
Migration `018_brands.sql`. A seller is a normal customer account plus one `brands` row. Account status: `pending | active | rejected | suspended`. Page status: `draft | submitted | approved | rejected`. Product state (per brand product): `draft | pending | approved | rejected | archived`.
**Public:** `GET /brands` → `{items:[{id,slug,name,tagline,logoUrl,coverUrl}]}` (only active brands with an approved page) · `GET /brands/:slug` → `{brand:{...card,instagram,website,productCount}, sections:[{id,type:banner|video|text|products|gallery|features|spacer,...resolved content (hidden sections omitted; media as URLs)}], products[]}` (404 unless active and live) · `GET /seller/portal` → `{url|null}`. `GET /products/:id` adds `brand: {id,slug,name,logoUrl} | null`.
**Seller (customer token):** `GET /seller/me` → `{brand|null, user}` · `POST /seller/apply` `{name,contactPhone,city,businessNote}` · `POST /seller/reapply` (after rejection) · `PUT /seller/brand` (replaces the draft: name, tagline, instagram, website, sections[≤20] of banner{slides[1-6]{imageKey,title,subtitle,buttonLabel,productId}} | video{videoKey,title,caption,autoplay} | text{heading,body,align} | products{title,layout grid|carousel|big,productIds} | gallery{imageKeys[1-8]} | features{items[1-6]} | spacer{size}; each with optional id and hidden; media keys must come from the media endpoint) · `POST /seller/brand/media?type=image|video` (multipart `file`) → `{key,url}`; seller/admin content returns media as `{key,url}` · `POST|DELETE /seller/brand/logo|cover` (multipart `file`) · `POST /seller/brand/submit` · `GET /seller/categories` · `GET|POST /seller/products`, `GET|PUT|DELETE /seller/products/:id`, product image upload/delete/reorder · `GET /seller/orders?status=&page=`, `GET /seller/orders/:id` (only the seller's own lines; no customer email).
**Admin:** `GET /admin/brands?status=&pageStatus=&q=`, `GET /admin/brands/:id` (draft and live) for staff; admin/owner: `POST /admin/brands/:id/approve|reject|suspend|unsuspend`, `POST .../page/approve|page/reject`, `POST .../products/:productId/reject` (reject/suspend/page-reject need `{note}` 3-300 chars). `GET /admin/orders` adds `brands:[{id,name}]` per order; order detail items carry `brand`.
**Rules:** products a seller creates are unpublished; approving the page publishes the pending products that have a photo and a size/colour. Suspending hides all approved products; unsuspending restores them. Sellers are notified (inbox + push, deep link `talhastudio://seller`) of approvals, rejections and new orders; admins get a push (`admin://brands`) for applications and submitted pages.

**Notification pictures (migration 019):** `POST /admin/campaigns/image` (multipart `file`) → `{url}`. `POST /admin/campaigns` accepts `imageUrl` (must be one of this store's own media URLs, e.g. a product photo, banner or the uploaded picture). Campaign list items and customer `GET /me/notifications` items carry `imageUrl|null`. FCM push uses `notification.image` plus `data.imageUrl`; the app shows a big-picture notification and a picture in the inbox.

**Wallet (migration 020):** `GET /offers` (public) → `{signupBonus, referralBonus}` (0 = off). `POST /auth/google` accepts `referralCode`; a brand-new Google account gets the welcome bonus, and with a valid code both sides get the referral amount (each credit is given once). `GET /me/wallet` → `{balance, referralCode, referralBonus, friends, earnedFromReferrals, items[{id,amount,kind,note,createdAt}]}`. `POST /orders` takes the wallet balance off the goods automatically (never delivery); the order carries `walletUsed` and `total` is already net. Cancelling or refunding returns the wallet money once. Admin: `GET/PUT /admin/wallet-offers` `{signupBonus:{active,amount}, referral:{active,amount}}` (admin/owner).

## Reviews, stock alerts, tracking, customers (migration 021)
- `GET /products/:id/reviews` (public; sign-in adds `mine` and `canReview`) -> `{avg, count, items[{id,rating,body,author,createdAt}], mine, canReview}`. `POST /products/:id/reviews` `{rating 1-5, body}` needs sign-in and a **delivered** order containing the product (403 `NOT_BUYER` otherwise); one review per customer and product, posting again changes it.
- `GET|PUT|DELETE /me/stock-alerts/:productId`: "tell me when it is back". A timer (every 2 minutes) sends one inbox entry + push per waiting customer when the product has stock again.
- Admin: `GET /admin/reviews`, `PATCH /admin/reviews/:id {hidden}`, `DELETE /admin/reviews/:id`.
- Orders now carry `courier` and `trackingNo` (customer + admin). Admin: `PATCH /admin/orders/:id/tracking {courier, trackingNo}`.
- Admin customers list adds `isActive`, `walletBalance`, `lastOrderAt`; `PATCH /admin/customers/:id/active {active}` blocks / unblocks (a blocked customer can not sign in and existing sessions stop working).
- App only: cart reminder (local alarm, 24 h after the cart was last changed) and the English / Urdu switch (Profile > Language).
