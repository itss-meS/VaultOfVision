# Models and files

## 1. Model files

| File | Purpose | Size | Source |
|---|---|---|---|
| `vision.onnx` | Image classifier | about 6 MB (n-cls, measured), about 20 MB (s-cls, estimate) | Your training run |
| `labels.json` | Class names in model order; must match the `.onnx` | few KB | Written by training |
| `llama32_1b_int4.pte` | Llama 3.2 1B Instruct, 8da4w, ExecuTorch | about 1.0 to 1.2 GB (estimate) | Colab export |
| `tokenizer.model` | Llama 3.2 tokenizer | about 2 MB | Meta or Hugging Face, `original\tokenizer.model` |

The `.pte` alone cannot run; ExecuTorch needs the matching tokenizer.

## 2. Parameters

| Model | Parameters |
|---|---|
| YOLO11n-cls | about 1.5 million |
| YOLO11s-cls | about 5.5 million |
| YOLO11m-cls | about 10.4 million |
| Llama 3.2 1B Instruct | about 1.24 billion |

Class count changes the classifier size only slightly (about 1,280 parameters per extra class). On the phone, over 99 percent of the parameters are Llama.

## 3. Getting the tokenizer

If the Colab session that exported the `.pte` is still open:

```
!find / -name "tokenizer.model" 2>/dev/null
from google.colab import files
files.download("PATH_PRINTED_BY_FIND")
```

Usual locations: `/root/.llama/checkpoints/Llama3.2-1B-Instruct/tokenizer.model`, or a path ending `original/tokenizer.model` when downloaded from Hugging Face.

Otherwise: sign in at huggingface.co, accept the licence on `meta-llama/Llama-3.2-1B-Instruct`, open Files and versions, then `original`, and download `tokenizer.model` (not `tokenizer.json`). Use the one from the same model version as the `.pte`.

## 4. Where files go

On your PC: `D:\redesigned-Edge\models\`

```
models\
  vision.onnx
  labels.json
  llama32_1b_int4.pte
  tokenizer.model
```

On GitHub:

| File | Where |
|---|---|
| Final `vision.onnx` and `labels.json` | Commit with `git add -f models/<name>/vision.onnx models/<name>/labels.json` (the ignore rules exclude them by default), or attach to a Release |
| `llama32_1b_int4.pte`, `tokenizer.model` | GitHub Release only |
| `data\`, `runs\`, `.venv-train\`, `.dev\`, `calibration\` | Never |

GitHub blocks files over 100 MB in normal git; Git LFS free quotas are too small for the `.pte`. Release assets avoid both limits.

## 5. Licences

Llama 3.2 is under Meta's community licence. Keep the "Built with Llama" notice, follow the acceptable-use terms and check redistribution rules before making a Release public. Training datasets have their own licences (PlantVillage, Cassava, IP102); check them before commercial use. YOLO11 from Ultralytics is under AGPL-3.0 unless a commercial licence is bought, which matters if the app is distributed.

## 6. Which vision model to ship

The app loads one vision model. Options: a combined model (one file, knows everything, weaker per class), or one model per dataset with switching (needs extra app work). The recommendation is the combined model, judged on real field photos rather than lab accuracy (`TRAINING.md`).
