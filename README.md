# Redesigned Edge AI

Offline crop-advisory app for farmers. Photograph a leaf and the phone identifies the disease or pest, finds vetted agronomy text and writes a structured advisory, all on the device with no internet. Languages: English, Hindi and Marathi today; Telugu is planned.

Hackathon scope: the Android app. The Raspberry Pi and Python backend track is kept in the separate AgriEdge edge repository.

## What it does

1. A small vision model classifies the leaf photo (disease, pest or healthy) and reports confidence.
2. Local search finds matching agronomy text from the knowledge pack.
3. Llama 3.2 1B writes the advisory as strict JSON in the farmer's language.
4. Code, not the model, decides quantities: dosage comes from a signed, expert-vetted table.
5. Every question and answer is checked against a signed banned-pesticide list; unsafe or invalid output is replaced by a safe fallback that refers the farmer to an extension officer.
6. Nothing leaves the phone. Photos are not stored.

## Status

| Area | State |
|---|---|
| On-phone engine in TypeScript (rules, dosage, validators, orchestrator, retrieval, signing, PIN login) | Done, tested |
| React UI (login, capture, result, advice, device, light and dark, en/hi/mr) | Done, tested |
| Vision training pipeline (PlantVillage, Cassava, IP102, combined) | Written, run it on a GPU |
| Llama 3.2 1B `.pte` | Exported in Colab |
| Kotlin plugin (vision, Llama, speech, storage on Android) | Not written yet |
| APK build | Workflow exists, never run |
| Telugu | Not added yet |
| Multi-crop advice | Done for potato, tomato, rice, grape and five pests; more crops are listed in `docs/KNOWLEDGE.md`. Data needs agronomist sign-off and release signing |
| Knowledge base, vetted banned list and dosage table | Empty or placeholders |
| Severity from lesion area | Needs a segmentation model |

Nothing has run on a real phone yet.

## Repository layout

```
.github/workflows/   ci.yml, build-apk.yml
colab/               Colab notebooks (Llama export)
docs/                SETUP, TRAINING, ANDROID, MODELS, KNOWLEDGE, TROUBLESHOOTING,
                     ARCHITECTURE, DECISIONS, BENCHMARKS, spec/, security/
knowledge/           chunks.jsonl and the signed-pack format
models/              trained models (git-ignored)
schemas/             advisory_v3 and vision_result JSON schemas
scripts/             sign, make_dev_assets, check_no_comments
  train/             dataset loaders, trainer, evaluation, ONNX export
tests/               training and hygiene tests
ui/
  web/               React app and the on-phone engine (src/engine/core)
  android/           Capacitor shell and manifest hardening
```

## Tech stack

React 18, TypeScript, Vite, Tailwind, i18next, Capacitor 7 (Android), YOLO11 classifier (PyTorch, ONNX Runtime), Llama 3.2 1B (ExecuTorch), BM25 retrieval, Ed25519 signed assets, PBKDF2 PIN login, GitHub Actions.

## Start here

- `docs/SETUP.md` setup and checks
- `docs/TRAINING.md` train the vision model
- `docs/ANDROID.md` the phone app, the Kotlin plugin plan, model delivery
- `docs/MODELS.md` model files, sizes, GitHub strategy, licences
- `docs/KNOWLEDGE.md` knowledge pack and vetted data
- `docs/TROUBLESHOOTING.md` common errors

## Conventions

No comments or docstrings in code, no emojis in the UI, real photographs only, short one-line commit messages, no secrets or model weights in git.
