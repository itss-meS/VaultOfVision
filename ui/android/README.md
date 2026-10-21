# Android shell

Capacitor 7 wraps `ui/web/dist`. The generated `android/` project is git-ignored and recreated by the scripts below. The Kotlin plugin `AgriEdgeEngine` lives in `native/agriedge-engine/` (tracked in git) and is copied into the generated project by `scripts/sync-native.mjs`.

## Commands (run from `ui/android`, work on Windows, macOS and Linux)

```
npm ci
npm run test:native
npm run apk:debug
npm run apk:release
npm run prepare:android
```

- `test:native` runs the Kotlin unit tests (`:agriedge-engine:testDebugUnitTest`).
- `apk:debug` builds the web app, syncs Capacitor, hardens the manifest, copies the plugin, models and the development signed assets from `.dev/knowledge`, then runs `assembleDebug`.
- `apk:release` does the same but refuses to build unless the three vision models and the signed banned list and dosage table exist in `models/` and `knowledge/`. It never uses `.dev`.
- `prepare:android` stops before Gradle.

The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

## What `sync-native.mjs` does

1. Copies `native/agriedge-engine/` to `android/agriedge-engine/` and `native/app.gradle` to `android/app/agriedge.gradle`.
2. Adds the Kotlin Gradle plugin to `android/build.gradle`, includes the module in `android/settings.gradle` and applies `agriedge.gradle` from `android/app/build.gradle`.
3. Writes `MainActivity.java` so it registers `AgriEdgeEnginePlugin`.
4. Copies `models/<id>/vision.onnx` and `labels.json` (ids `plantvillage-all`, `cassava`, `ip102`, `router`) and the allow-listed `knowledge/` files into `app/src/main/assets/`.

It is safe to run repeatedly.

## Plugin methods

| Method | Input | Output |
|---|---|---|
| `detect` | `{ imageBase64, model? }` | `{ detection: { class_id, label, confidence, bbox, mask_polygon, model, kind } or null }` |
| `generate` | `{ messages, maxTokens }` | `{ text }` (fails with `not_ready` until ExecuTorch is linked) |
| `cancelGenerate` | none | nothing |
| `speak` | `{ text, lang }` | `{ status: "ok" or "voice_not_installed" }` |
| `readAsset` | `{ name }` | `{ base64 }` or null, allow-listed names only |
| `kvGet`, `kvSet` | `{ key }`, `{ key, value }` | `{ value }` or null, AES-GCM with an Android Keystore key |
| `health` | none | adapters, loaded model, peak RSS, temperature |
| `modelStatus` | `{ verify }` | `{ files: [{ name, present, size, sha256, verified }] }` |
| `downloadModels` | `{ files: [{ name, url, sha256, size }] }` | final status, progress through the `downloadProgress` event |
| `cancelDownload` | none | nothing |

`model` accepts `plantvillage-all` (alias `plantvillage`), `cassava`, `ip102` or `router`. When `model` is omitted the router picks the classifier and the call returns null if the router is below 0.6 confidence.

## Pinned versions

| Item | Version |
|---|---|
| Android Gradle plugin | 8.7.2 (from Capacitor) |
| Gradle | 8.11.1 (from Capacitor) |
| Kotlin Gradle plugin | 2.0.21 |
| ONNX Runtime Android | 1.22.0 |
| ExecuTorch Android | not linked yet, version to come from the owner |
| JUnit | 4.13.2 |

## Permissions and network

Only `INTERNET`, `ACCESS_NETWORK_STATE` and `CAMERA` are declared. `ACCESS_NETWORK_STATE` is needed to check for an unmetered Wi-Fi connection before a model download. Downloads accept only `https` hosts `github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com`; the same list is in `DownloadPolicy.kt` and `network_security_config.xml`, and a unit test keeps them equal.
