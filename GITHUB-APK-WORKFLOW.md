# GitHub Actions APK workflow notes

The `.github/workflows/build-android-apk.yml` workflow builds a **debug APK** only after a native Android project exists in `android/`. The current starter is a browser-based Three.js web app, so the workflow deliberately fails with a clear explanation until it is wrapped as an Android app.

## Wrap the web app with Capacitor (one-time setup)

Use Node.js 20+ and npm in the project folder:

```bash
npm init -y
npm install @capacitor/core @capacitor/android
npm install --save-dev @capacitor/cli
npx cap init "Talha Studio" "com.talhastudio.app" --web-dir .
npx cap add android
```

In `package.json`, ensure there is a `build` or no-build static setup appropriate to your chosen project. This starter uses `index.html` at the project root; Capacitor's `webDir` should point at a directory containing the app's web assets. A simple reliable layout is to create a `www/` directory and copy `index.html`, `style.css`, `app.js`, and `public/` into it, then set `"webDir": "www"` in `capacitor.config.json`. Run:

```bash
npx cap sync android
```

Commit the generated `android/` folder, Gradle wrapper, config, package files and web assets to GitHub. Then use GitHub → Actions → **Build Talha Studio Android APK** → **Run workflow**. When the run finishes, open the run and download the `talha-studio-debug-apk` artifact.

## Important
- This workflow produces an installable **debug APK**, not a Play Store signed release APK or AAB.
- Never commit signing passwords, keystores, Firebase service-account credentials, or private API keys.
- A web project ZIP is not an APK by itself. The Android wrapper must be generated and committed first.
