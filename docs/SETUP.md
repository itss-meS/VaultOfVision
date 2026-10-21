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

## 2. Run the app in a browser (development)

The development server runs the real advice engine in the browser. Photo analysis uses your trained vision model through ONNX Runtime Web. There is no language model in the browser, so advice is the safe built-in template for the detected label. This is for testing the vision model and the screens. The language model runs only in the Android build.

```
python -m scripts.make_dev_assets
cd ui\web
npm ci
npm run dev
```

Open the address Vite prints, for example `http://localhost:5173/`.

- Every folder inside `models` that has `vision.onnx` and `labels.json` is loaded, and the most confident prediction wins, so leaves, cassava and insects are recognised without choosing. To test one model only, add `?model=ip102` to the address.
- The top five predictions for each photo are printed in the browser console (F12).
- Create an account on first launch with a name, a 10-digit mobile number and a password of at least 6 characters, then log in with the mobile number and password. There is no authenticator code.
- Accounts and scan history are stored in a SQLite database at `.dev\data\agriedge.sqlite`. Delete that file to start fresh. On the phone the same schema lives in the app's own SQLite store.
- Passwords are stored as PBKDF2 hashes with a per-user salt. Five wrong attempts lock the account for 30 seconds.
- `VITE_ENGINE=native` forces the phone engine.

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
