# Android shell

Capacitor 7 wraps `ui/web/dist`. The generated `android/` project is git-ignored and recreated by `npm run prepare:android`, which builds the web app, adds and syncs the Android platform and runs `scripts/harden-manifest.mjs` (no backup, no cleartext traffic, camera permission, R8 for release builds).

Build locally:

```
npm ci
npm run prepare:android
npm run apk:debug
```

The TypeScript engine that runs advice on the phone is done (`ui/web/src/engine/core/`). The Kotlin plugin `AgriEdgeEngine` that provides vision, Llama, speech and storage is not written yet, so the APK cannot analyse photos until it exists. The plugin interface is defined in `ui/web/src/engine/native.ts`.

Full plan, ports, model delivery and limits: `docs/ANDROID.md`.
