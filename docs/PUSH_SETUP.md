# Push notifications: setup guide (Phase 7)

Push uses **Firebase Cloud Messaging (FCM)**, which is free. The API calls FCM's HTTP v1 endpoint directly with a service account, so there are **no Cloud Functions and no Blaze plan** (the Firebase project stays on the free Spark plan).

## What is sent
- **Automatic order pushes**: order confirmed (placed), shipped, delivered, cancelled, refunded. Each one is also saved in the customer's in-app inbox.
- **Admin campaigns** (admin panel > Notifications): announcements to every customer who allows "Offers and news". Tapping can open the app home or a published product.
- Customers control both kinds in the app (Notifications > preferences) and via Android's system settings (two channels: *Order updates*, *Offers and news*).
- **Without Firebase configured everything still works** except phone alerts: the in-app notification inbox and the admin campaign flow keep functioning, and the admin panel says push is off.

## One-time setup
1. Go to the Firebase console, create a project (free Spark plan).
2. **Add an Android app** with package `com.talhastudio.app`; add a second Android app `com.talhastudio.app.debug` for debug builds. Download `google-services.json` (it may contain both). Note: Android also needs your SHA-1 only for Google Sign-In, not for push.
3. **Android build:** base64 the file (`base64 -w0 google-services.json`) and save it as the GitHub secret `GOOGLE_SERVICES_JSON_BASE64`. The Android workflow writes it to `android/app/google-services.json` at build time. For local builds, drop the file in `android/app/` (it is git-ignored). Builds without it still compile and run, with push off.
4. **Server:** Firebase console > Project settings > Service accounts > *Generate new private key*. Paste the entire JSON into the host secret `FCM_SERVICE_ACCOUNT_JSON` (one secret, never in git or the app). Restart the API; the log should no longer warn that push is off.
5. Install the app, sign in, allow notifications (Android 13+ asks at order confirmation or in Notifications), then place a test order or send a campaign.

## How reliability is handled
- Dead tokens (app uninstalled, token expired) are detected from FCM's `UNREGISTERED` answer and deleted automatically; tokens unseen for 90 days are pruned; a user keeps at most 5 devices.
- A phone that switches accounts is reassigned to the new account, and sign-out unregisters the phone.
- Push errors never affect orders: they are logged and the order flow continues.
- Campaigns: the same title+message cannot be sent twice within a minute; sending is limited to 5 per minute; the history shows customers reached and push failures.

## Limits and honesty
- FCM does not report whether a notification was *seen*. "Push failures" counts only requests FCM rejected.
- Delivery on some phones (aggressive battery savers) can be delayed by the manufacturer; nothing in the app can override that.
- Android 13+ users who decline the permission get only the in-app inbox.
