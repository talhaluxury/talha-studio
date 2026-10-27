# Google Play checklist

This is a preparation list. **Nothing here means the app is approved**; Google reviews every release. Tick each item yourself in Play Console.

## A. Technical
- [ ] Signed **AAB** built by the Android workflow (`docs/ANDROID_RELEASE.md`), `versionCode` higher than any previous upload.
- [ ] Application ID `com.talhastudio.app` (permanent once published).
- [ ] Target API meets Play's current requirement (project targets 35; verify in Play Console).
- [ ] Release build tested on a real phone against the **production** API (not the example URL): sign-up, Google Sign-In, browse, order, push.
- [ ] Release SHA-1 and Play App Signing SHA-1 added to the Google OAuth Android client.
- [ ] Adaptive launcher icon present (done); 512x512 icon: `docs/play/app-icon-512.png`; feature graphic 1024x500: `docs/play/feature-graphic-1024x500.png`.
- [ ] Phone screenshots (at least 2, up to 8) taken from the **real release app with real products**. These cannot be generated for you; capture Home, a product, Cart, Checkout, Order tracking. Tablet screenshots are optional but improve reach.

## B. Policy URLs (host them on your API; edit the text first in admin > Store settings)
- [ ] Privacy policy: `https://YOUR-API-HOST/legal/privacy`: review it against what you actually do.
- [ ] Account deletion page (required for apps with accounts): `https://YOUR-API-HOST/legal/account-deletion`.
- [ ] In-app deletion path exists: Profile > Settings > Delete my account (implemented).
- [ ] Contact email and phone set in admin > Email & settings (the policy and support screens show them).

## C. Permissions (declared in the manifest)
| Permission | Why |
|---|---|
| `INTERNET` | Load products and place orders. |
| `POST_NOTIFICATIONS` | Order updates and offers (Android 13+ asks the user; the app works without it). |
No location, contacts, camera, microphone, storage or phone-number permissions. (The *admin* app uses the system file picker, which needs no permission.)

## D. Data safety form (answers that match this app; re-verify if you add SDKs)
**Data collected**
| Category > type | Collected | Required? | Purpose | Notes |
|---|---|---|---|---|
| Personal info > Name | Yes | Required | App functionality, Account management | Account and delivery name |
| Personal info > Email address | Yes | Required | App functionality, Account management, Communications | Order emails; Google sign-in also provides it |
| Personal info > Phone number | Yes | Optional at sign-up, required to order | App functionality | Courier contact |
| Personal info > Address | Yes | Required to order | App functionality | Delivery address |
| Personal info > User IDs | Yes | Required | Account management | Account ID |
| Financial info > Purchase history | Yes | Required to order | App functionality | Past orders. **Payment card/bank details are NOT collected** (Cash on Delivery) |
| Device or other IDs | Yes | Optional | App functionality (notifications) | Firebase Cloud Messaging token / installation ID |
**Not collected:** location, contacts, photos/videos, audio, files, health, messages, web browsing, app interactions/analytics, crash logs (no analytics or crash SDK is included).
**Data sharing:** order and delivery details go to couriers and to service providers that process data on your behalf (hosting, email, push). Google's form generally does not count transfers to service providers acting on your behalf as "sharing"; confirm against the current Play definition and list couriers if your reading differs. Nothing is sold; no advertising.
**Security practices:** data encrypted in transit (HTTPS): **Yes**. Users can request data deletion: **Yes** (in-app and web page above). Follows Families policy: not applicable (the app is not for children).

## E. App content
- [ ] Target audience: **18 and over** / general audience, not designed for children.
- [ ] Ads: **No ads**.
- [ ] Content rating questionnaire (IARC): no violence, sexual content, gambling, user-generated content or location sharing; it is an online shop. Expect a low rating.
- [ ] App category: **Shopping**. Tags as you like.
- [ ] Government/financial/health declarations: none apply (no payments processed in-app; COD).
- [ ] News/COVID/other declarations: not applicable.
- [ ] If you later add online card payments: use a compliant gateway with server-side verification; physical goods are exempt from Play Billing, digital goods are not.

## F. Store listing draft (edit freely)
**App name (max 30):** Talha Studio
**Short description (max 80):** Pakistani fashion for ladies and gents. Shop, track orders, pay on delivery.
**Full description:**
Talha Studio brings timeless Pakistani fashion to your phone. Browse ladies and gents wear, unstitched fabrics, suits and accessories, see real sizes and stock, and order in a few taps.
• Discover new arrivals, featured collections and seasonal offers
• Search and filter by category, price and availability
• Save favourites to your wishlist
• Pay on delivery: no card details needed
• Track every order from confirmed to delivered, with notifications
• Use discount codes at checkout
• Manage your addresses, notifications and account in the app
Questions? Contact us from Help & Support inside the app.

## G. Before and after launch
- [ ] Closed-testing requirement for new personal accounts understood and scheduled (rule changes over time; read Play Console).
- [ ] Production API smoke test passed (`docs/DEPLOYMENT.md` section 9).
- [ ] Demo data removed (`DEMO-` SKUs), policy pages reviewed, owner email set, email provider verified.
- [ ] After launch: watch Play Console *Android vitals* and reviews; keep dependency updates flowing (Dependabot is configured).
