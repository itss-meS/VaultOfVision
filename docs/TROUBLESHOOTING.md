# Troubleshooting

## Web UI

| Symptom | Cause and fix |
|---|---|
| Vite error: `Unable to resolve @import "@fontsource/inter/400.css"` | Dependencies out of date. In `ui\web` run `npm install` (or `npm install @fontsource/inter@^5 @fontsource/jetbrains-mono@^5`). |
| Login says invalid credentials on the phone | The first profile id and PIN entered on a fresh install become the account; after that the same PIN is needed. 5 wrong attempts lock logins for 30 seconds. To start over, clear the app data. |
| "Cannot reach device engine" in a browser | A browser has no on-device engine and tries the edge backend. Test on the phone build, or run the edge backend from the separate repository. |
| UI looks wrong in a theme | Choose Light, Dark or System in the header; the choice is stored on the device. |

## Training

| Symptom | Cause and fix |
|---|---|
| `CUDA is not available to PyTorch` | You installed the CPU build. Reinstall with `--index-url https://download.pytorch.org/whl/cu124` and re-check `torch.cuda.is_available()`. |
| `ModuleNotFoundError: scripts.train` | Create empty `scripts\__init__.py` and `scripts\train\__init__.py`, and run from the repository root. |
| `unrecognized arguments: --pv-root` | Old `train_all.py`. Replace with the current file. |
| `dataset problem: ...` | The path does not point at the level the loader expects; see the layout table in `TRAINING.md`. For Cassava the folder must contain `train.csv`; for IP102 the folder with `train.txt`; for PlantVillage the folder that directly holds the class folders. |
| Messy class names such as `Tomato Early blight Tomato Early Blight` | Old `datasets.py`; replace with the current file. |
| Out of GPU memory | `--batch 32` (or 16). |
| Hangs while loading data on Windows | `--workers 0`. |
| Ran out of disk | `data\` and `runs\` are large; delete prepared sets you no longer need, or use hard links (the default) rather than `--copy`. |
| TensorBoard shows nothing | Install `tensorboard` before the run starts and point `--logdir` at `runs`. |

## Git

| Symptom | Cause and fix |
|---|---|
| `models\...\vision.onnx` will not add | Ignored by `.gitignore`. Use `git add -f` for the two files you want. |
| Push rejected for file size | A file over 100 MB (usually the `.pte`). Remove it from the commit and upload it to a Release. |
| Hygiene test fails | A code file contains a comment or docstring. Run `python -m scripts.check_no_comments .` to find it. |

## Android

| Symptom | Cause and fix |
|---|---|
| APK installs but cannot analyse photos | The Kotlin plugin is not written yet (`ANDROID.md`). |
| Engine says advice assets missing or untrusted | The signed banned list, dosage table or public key is absent or does not verify inside the app assets. |

## Chat on the phone

The chat error now shows the reason from the phone. Read the code after "Details".

| Detail starts with | Meaning | Fix |
|---|---|---|
| `llm_missing` | The `.pte` or `tokenizer.model` is not inside the APK or the phone's models folder | Check the `models-v1` release names (`llama32_1b_int4.pte`, `tokenizer.model`), read the "ls -lhR models" step of the build log, or copy both files to `Android/data/<app id>/files/models/` |
| `llm_load_failed` | ExecuTorch 1.0.0 in the app could not open the `.pte` | Export the `.pte` with the same ExecuTorch version (`pip show executorch` in Colab must say 1.0.x), or change the version in `ui/android/scripts/install-plugin.mjs` to match |
| `llm_failed: UnsatisfiedLinkError` | The native library is missing for this phone (for example an emulator) | Use a 64-bit ARM phone |
| `llm_failed: OutOfMemoryError` | Not enough RAM | Close other apps; try a phone with 6 GB or more |
| `llm_failed: generate returned code` | The runtime started but could not produce text | Send the full detail; the prompt format flag `EXPLICIT_BOS` may need flipping |

For more detail connect the phone with USB debugging and run `adb logcat -s AgriEdge`.
