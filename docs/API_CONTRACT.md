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
`talhastudio://order/<orderId>` · `talhastudio://product/<productId>`


## Phase 8 additions
**Public:** `GET /store-info` → `{name,supportEmail,supportPhone,address,estimatedDelivery,shipping:{flat,freeOver},returnWindowDays,pages:[{slug,title}]}` · `GET /pages/:slug` (privacy|terms|returns|shipping|refund|about) → `{slug,title,body,contact[]}` · `GET /legal/:slug` (non-versioned HTML page, use `/legal/privacy` as the Google Play privacy-policy URL).
**Customer:** `GET /me/export` (JSON download of profile, addresses, notification prefs and orders; no password hashes or tokens) · `POST /orders` and `POST /cart/quote` accept `couponCode`; quote returns `discount`, `couponCode` and an issue `{variantId:"coupon", code:"COUPON_INVALID", message}` when a code cannot be used (checkout is then refused with 409 CART_ISSUES).
**Pricing rule:** `total = subtotal - discount + shipping`; free delivery is judged on `subtotal - discount`; a cancelled order returns its coupon use.
**Admin (admin/owner):** `GET/POST /admin/coupons`, `PUT/DELETE /admin/coupons/:id` (code 3-20 of A-Z 0-9 _ -, `percent` 1-100 or `fixed`, `minSubtotal`, `maxUses`, `startsAt`/`endsAt`) · `GET/POST /admin/banners`, `PUT/DELETE /admin/banners/:id`, `POST/DELETE /admin/banners/:id/image` (multipart `file`; `ctaLink` must be `talhastudio://product/<uuid>`).
**Owner only:** `GET/PUT /admin/store-settings` `{shipping:{flat,freeOver}, announcement:{text,active}, pages:{privacy,terms,returns,shipping,refund,about}}` · `GET /admin/activity-logs?action=<prefix>&page&limit`. `GET /admin/analytics` now includes `topProducts:[{name,qty,revenue}]`.
