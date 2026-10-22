# Android shell

Capacitor 7 wraps `ui/web/dist`. The generated `android/` project is git-ignored and recreated by `npm run prepare:android`, which builds the web app, adds and syncs the Android platform and runs `scripts/harden-manifest.mjs` (no backup, no cleartext traffic, camera permission, R8 for release builds).

Build locally:

```
npm ci
npm run prepare:android
npm run apk:debug
```

The TypeScript engine that runs advice on the phone is done (`ui/web/src/engine/core/`). The native plugin `AgriEdgeEngine` (vision with ONNX Runtime, Llama with ExecuTorch, speech with Android TextToSpeech) is `native/AgriEdgeEnginePlugin.java`; `scripts/install-plugin.mjs` installs it into the generated Android project and bundles the vision models and knowledge files. It has not been built on a device yet.

Models: the vision models come from `models\` in the repo at build time. Push the Llama files to the phone with adb (see `docs/ANDROID.md`, section 4).

Full plan, ports, model delivery and limits: `docs/ANDROID.md`.
