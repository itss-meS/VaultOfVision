# Training the crop classifier

Framework: PyTorch with Ultralytics YOLO11 classification (`yolo11n-cls`, `yolo11s-cls`, `yolo11m-cls`). Output is ONNX, which the phone app runs with ONNX Runtime. All commands are for Windows PowerShell with an NVIDIA GPU, run from the repository root.

## 1. Driver and CUDA

1. Install the current NVIDIA driver from nvidia.com/drivers.
2. Check `nvidia-smi` shows your GPU. The CUDA Toolkit is not needed; the PyTorch wheel carries its own runtime.

## 2. Separate training environment

Keep this apart from other Python environments.

```powershell
cd D:\redesigned-Edge
py -3.11 -m venv .venv-train
.\.venv-train\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
pip install -r requirements-train.txt
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

It must print `True` and the GPU name. Use the install line that pytorch.org shows for your CUDA version if `cu124` does not match. Optional: `pip install tensorboard` before training for dashboards.

## 3. Files the pipeline uses

All in `scripts\train\` (plus `requirements-train.txt` in the root):

| File | Role |
|---|---|
| `common.py` | Image extensions, class-name cleanup, image listing |
| `datasets.py` | Loaders for PlantVillage, Cassava, IP102 and folder datasets; split logic; writes the training layout |
| `prepare_classification.py` | Standalone preparation entry point |
| `train_classifier.py` | Standalone training entry point |
| `evaluate_classifier.py` | Accuracy and confusion-matrix helpers |
| `export_model.py` | ONNX export helpers and calibration image picking |
| `train_all.py` | The one command that prepares, trains, evaluates and exports |
| `__init__.py` | Makes `scripts.train` importable (empty) |

`scripts\__init__.py` must also exist.

## 4. Datasets

The trainer works with any folder-per-class dataset and has loaders for three common formats. Each dataset can train its own model, or all can train one combined model.

| Dataset | Folder to pass | Layout it expects |
|---|---|---|
| PlantVillage | `--root` or `--pv-root`: the folder that directly holds the class folders | Folders such as `Tomato___Early_blight` (original) or `Tomato_Early_blight` and `Pepper__bell___healthy` (Kaggle variant). Class names are cleaned automatically. |
| Cassava | `--root` or `--cassava-root`: the folder holding `train.csv` | `train_images`, `test_images`, `train.csv`, `label_num_to_disease_map.json` (Kaggle Cassava Leaf Disease layout) |
| IP102 | `--root` or `--ip102-root`: the folder holding `train.txt` | `classification\train\<id>\*.jpg` with `train.txt`, `val.txt`, `test.txt` and `classes.txt` beside them |
| Anything else | `--root` with `--dataset folders` | Class folders, with or without `train`, `val`, `test` inside |

Notes:

- PlantVillage copies differ. The Kaggle copy with 15 classes covers only pepper, potato and tomato. The original `raw\color` copy has 38 classes across 14 crops. Pointing at a pre-split `train` folder works; the script re-splits it itself and ignores the existing `val` and `test`.
- Cassava needs a Kaggle login and acceptance of the competition rules. It has 5 classes of field photos.
- IP102 is a pest dataset (102 classes), not leaf disease, with uneven class sizes.
- Check each licence before commercial use.
- The Cassava and IP102 loaders were tested on stand-in folders built from the real layouts, not on the full downloads. If a loader cannot find files it stops with a message that starts with `dataset problem`.

## 5. Commands

Always put a path with spaces in double quotes.

One dataset at a time, each with its own name:

```powershell
python -m scripts.train.train_all --dataset plantvillage --root "D:\PlantVillageDataset\train_val_test\train" --name plantvillage-all --model yolo11s-cls.pt --epochs 40
python -m scripts.train.train_all --dataset cassava --root "D:\archive\cassava_datasetv2" --name cassava --model yolo11s-cls.pt --epochs 40
python -m scripts.train.train_all --dataset ip102 --root "D:\archive (1)" --name ip102 --model yolo11s-cls.pt --epochs 30
```

Three separate models in one run:

```powershell
python -m scripts.train.train_all --dataset separate --pv-root "D:\PlantVillageDataset\train_val_test\train" --cassava-root "D:\archive\cassava_datasetv2" --ip102-root "D:\archive (1)" --model yolo11s-cls.pt --epochs 40
```

One combined model that knows every class, made active for the app:

```powershell
python -m scripts.train.train_all --dataset combined --pv-root "D:\PlantVillageDataset\train_val_test\train" --cassava-root "D:\archive\cassava_datasetv2" --ip102-root "D:\archive (1)" --name all-crops --model yolo11s-cls.pt --epochs 40 --activate
```

Original PlantVillage download and crop filter:

```powershell
python -m scripts.train.train_all --dataset plantvillage --download --name plantvillage-all --model yolo11s-cls.pt --activate
python -m scripts.train.train_all --dataset plantvillage --root "data\PlantVillage\raw\color" --crop Tomato
```

Options:

| Option | Meaning |
|---|---|
| `--epochs N` | Default 40. Use 3 for a quick check that everything loads. |
| `--batch N` | Default 64. Use 32 if the GPU runs out of memory. |
| `--workers N` | Default 4. Use 0 if data loading hangs on Windows. |
| `--model` | `yolo11n-cls.pt` (smallest), `yolo11s-cls.pt`, `yolo11m-cls.pt`. Weights download automatically on first use. |
| `--imgsz` | Default 224. |
| `--device` | Default `0` (first GPU); `cpu` is slow. |
| `--field-test <folder>` | Folder-per-class real photos used only for testing. |
| `--copy` | Copy images instead of hard-linking them. |
| `--activate` | Copy the result to `models\vision.onnx` and `models\labels.json`. Refused with `separate`. |
| `--name` | Output name; defaults to the dataset name. Re-using a name overwrites that run. |
| `--calibration N` | Calibration images kept for later int8 export (default 200). |

## 6. Outputs

With name `NAME`:

| Path | Content | Push to GitHub |
|---|---|---|
| `data\NAME\` | Prepared train, val and test images, `labels.json`, `summary.json` | No |
| `runs\NAME\classifier\results.csv`, `results.png` | Per-epoch loss and accuracy | Optional |
| `runs\NAME\classifier\confusion_matrix*.png` | Class confusion pictures | Optional |
| `runs\NAME\classifier\weights\best.pt`, `last.pt` | Checkpoints | No, keep a local backup |
| `runs\NAME\eval\report.json` | Final accuracy per split | Optional |
| `runs\NAME\eval\confusion_test_lab.csv` (and `_field`) | Confusion table, easy to open in Excel | Optional |
| `models\NAME\vision.onnx` | Exported model | Only the final one (`MODELS.md`) |
| `models\NAME\labels.json` | Class names, must travel with the model | With the model |
| `models\NAME\calibration\` | 200 images for int8 conversion | No |

Different `--name` values give different model folders; nothing is overwritten. The app loads one model from `models\vision.onnx` and `models\labels.json`, so use `--activate` on the model you want, or copy its two files.

## 7. Watching training

- Console: loss and accuracy per epoch.
- Files: open `results.csv` or `results.png` in the `classifier` folder.
- TensorBoard (install `tensorboard` before training):

```powershell
tensorboard --logdir runs
```

Open http://localhost:6006. Training stops early after 15 epochs with no improvement.

## 8. Reading the results

- PlantVillage is photographed in a lab on plain backgrounds. Expect test accuracy around 95 to 99 percent that does not carry over to field photos.
- IP102 is hard; published accuracies are roughly 60 to 75 percent, and rare classes are weakest.
- Always test on real photos: put 20 to 30 field photos in class-named folders and pass `--field-test`. Compare `test_lab` and `test_field` in `report.json`.
- A model always returns a label, even for things it never saw. The app's low-confidence check helps but is not perfect.
- In a combined model, class names are prefixed (`Pest ...`, `Cassava ...`, crop name for PlantVillage) to avoid collisions.

## 9. Model size

Class count barely changes size. YOLO11n-cls is about 1.5 million parameters, s about 5.5 million, m about 10.4 million. An ONNX file for n is about 6 MB (measured); s is roughly 20 MB (estimate).

## 10. What training does not cover yet

- Severity from lesion masks needs a segmentation dataset and model. The classifier gives a label and confidence only.
- Advice and dosage for non-tomato crops need the multi-crop work listed in `DECISIONS.md` and `ARCHITECTURE.md`, plus knowledge and dosage data for those crops (`KNOWLEDGE.md`).

## Router model (decides leaf, cassava or insect)

Each model only knows its own classes, so it names one of them for any photo. The router is a small model that first decides which model a photo belongs to. Train it after the three separate models, from the same dataset folders:

```
python -m scripts.train.train_all --dataset router --pv-root "D:\PlantVillageDataset\train_val_test\train" --cassava-root "D:\archive\cassava_datasetv2" --ip102-root "D:\archive (1)" --name router --model yolo11n-cls.pt --epochs 20 --per-domain 2000
```

The result is `models\router\`. Its classes are `plantvillage-all`, `cassava` and `ip102`, which match the model folder names, so the app sends the photo to the right model. If the router is unsure (below 60%), the app falls back to asking every model and taking the most confident one.