# Setup (mobile repository)

This repository contains the phone app, the model training pipeline and the documentation. The Raspberry Pi and Python backend track lives in the separate AgriEdge edge repository.

## 1. What you need

| Item | Version | Used for |
|---|---|---|
| Node.js | 22 | Web UI and Android shell |
| Python | 3.11 or newer | Training scripts, signing tools, checks |
| Git | any recent | Source control |
| NVIDIA driver | current | Training only (RTX GPU) |
| Android Studio and JDK 21, or GitHub Actions | current | Building the APK |

## 2. Run the web UI in a browser

The UI runs without a backend only when an engine is available. In a browser there is no on-device engine, so the screens can be inspected but photo analysis needs the phone build.

```
cd ui\web
npm ci
npm run dev
```

Open the address Vite prints. `VITE_ENGINE=native` or `VITE_ENGINE=http` forces the engine choice.

## 3. Quality checks

```
pip install -r requirements-dev.txt
ruff check . && ruff format --check .
pytest
python -m scripts.check_no_comments .
cd ui\web
npm run lint
npm run typecheck
npm test
npm run build
```

No code file may contain a comment or docstring. `check_no_comments` enforces it, and a test runs the same check.

## 4. Development assets

The on-phone engine needs a signed banned list, a signed dosage table and the public key. For development:

```
python -m scripts.make_dev_assets
```

This writes placeholders to `.dev\knowledge`. They are not agronomy data. Real vetted files replace them (`KNOWLEDGE.md`). Sign real files with `python -m scripts.sign keygen --out <dir>` and `python -m scripts.sign sign --key <key> <file>`.

## 5. Train the vision model

See `TRAINING.md`. Result: `models\vision.onnx` and `models\labels.json`.

## 6. Build the APK

See `ANDROID.md`. The TypeScript engine is done; the Kotlin plugin is the remaining native work.

```
cd ui\android
npm ci
npm run prepare:android
npm run apk:debug
```

Or let GitHub Actions build it: the `build-apk` workflow uploads a debug APK as an artifact.

## 7. Git hygiene

`.gitignore` excludes `models\*` (except `.gitkeep`), `*.onnx`, `*.pte`, `*.pt`, keys, `data\`, `runs\`, `.venv`, `.venv-train`, `.dev`, `.idea`, `node_modules`, `dist` and the generated `ui\android\android`. Commit the final vision model deliberately with `git add -f models/<name>/vision.onnx models/<name>/labels.json` (`MODELS.md`). Never commit keys, datasets or the Llama `.pte`.
