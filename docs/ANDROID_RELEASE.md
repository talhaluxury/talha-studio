# Android release guide

Two apps are built from this repo: the **customer app** (`android/`, `com.talhastudio.app`) published on Google Play, and the **admin app** (`admin-android/`, `com.talhastudio.admin`) for the owner (install the APK directly or publish it privately).

## 1. Create the upload key (once, keep it safe)
```
keytool -genkeypair -v -storetype PKCS12 -keystore talha-upload.jks -alias talha -keyalg RSA -keysize 2048 -validity 10000
```
Back up the `.jks` and its passwords in a password manager. **Never commit it** (it is git-ignored and `scripts/check-secrets.sh` fails the build if one is found). Use Play App Signing (Play Console enrolls you by default): Google keeps the real app-signing key, and the key above is only your *upload* key, which Google can reset if you lose it.

## 2. GitHub secrets for signed builds
```
base64 -w0 talha-upload.jks     # paste the output into TS_KEYSTORE_BASE64
```
Add secrets: `TS_KEYSTORE_BASE64`, `TS_KEYSTORE_PASSWORD`, `TS_KEY_ALIAS` (customer app), `TS_ADMIN_KEY_ALIAS` (admin app; use the same alias if you share one key), `TS_KEY_PASSWORD`. Repo variables: `API_BASE_URL` (`https://YOUR-API-HOST/v1/`), `GOOGLE_WEB_CLIENT_ID`, `ADMIN_API_BASE`. For push also add `GOOGLE_SERVICES_JSON_BASE64` (`docs/PUSH_SETUP.md`).

## 3. Build
Run the **Android** workflow (push to `main` or *Run workflow*). Artifacts:
- `talha-studio-debug-apk`: for testing on a phone.
- `talha-studio-release-aab`: the signed **Android App Bundle** to upload to Play (only when the signing secrets exist).
`versionCode` is the workflow run number, so each build is newer than the last; set `-PversionName=1.0.1` for the visible version.
Local build: `cd android && gradle wrapper && ./gradlew bundleRelease -PapiBaseUrl=https://YOUR-API-HOST/v1/ -PversionCode=2` with `keystore.properties` (git-ignored) containing `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

## 4. Google Sign-In fingerprints
In Google Cloud (OAuth consent + credentials) create an **Android** OAuth client for `com.talhastudio.app` with the SHA-1 of: your debug key, your **upload** key (`keytool -list -v -keystore talha-upload.jks`), and the **Play App Signing** key (Play Console > Setup > App signing). Without the Play signing SHA-1, Google Sign-In fails in the store build even though it works in your own build. Also create the **Web** client whose ID is `GOOGLE_WEB_CLIENT_ID`.

## 5. Before the first upload
- Target API: the project targets API 35. Google Play requires new apps and updates to target a recent API level and raises it every year; check *Play Console > Policy > App content* and bump `compileSdk`/`targetSdk` when asked.
- Run the app on at least a small phone, a large phone and a tablet (or emulators): all screens use scrolling layouts; nothing is fixed-size.
- Test with Android 13+ (notification permission prompt) and with Android 8-12.
- Confirm the privacy-policy URL (`/legal/privacy`) and account-deletion URL (`/legal/account-deletion`) load publicly. See `docs/PLAY_STORE_CHECKLIST.md`.
- New personal developer accounts must usually run a **closed test with a minimum number of testers for a set number of days** before production access. This requirement has changed over time; read the current rule in Play Console before planning your launch date.

## 6. Admin app
`admin-android` wraps the admin web panel (see `admin/README.md`). Distribute the signed APK to the owner's phone directly; it is not meant for the public store. The API's `ADMIN_ORIGIN` must include `https://appassets.androidplatform.net`.
