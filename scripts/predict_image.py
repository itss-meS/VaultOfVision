from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def predict(model_dir: Path, image: Path, top: int) -> list[tuple[str, float]]:
    import onnxruntime as ort

    model = model_dir / "vision.onnx"
    labels_file = model_dir / "labels.json"
    if not model.is_file() or not labels_file.is_file():
        raise FileNotFoundError(f"need vision.onnx and labels.json in {model_dir}")
    labels: list[str] = json.loads(labels_file.read_text(encoding="utf-8"))
    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    meta = session.get_inputs()[0]
    side = int(meta.shape[2]) if isinstance(meta.shape[2], int) else 224
    pil = Image.open(image).convert("RGB").resize((side, side), Image.BILINEAR)
    arr = np.asarray(pil, dtype=np.float32) / 255.0
    batch = np.transpose(arr, (2, 0, 1))[None, ...]
    scores = np.asarray(session.run(None, {meta.name: batch})[0], dtype=np.float32).reshape(-1)
    if scores.size != len(labels):
        raise RuntimeError(f"model has {scores.size} outputs but labels.json has {len(labels)}")
    if scores.min() < 0.0 or abs(float(scores.sum()) - 1.0) > 1e-2:
        scores = softmax(scores)
    order = np.argsort(scores)[::-1][:top]
    return [(labels[i], float(scores[i])) for i in order]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path)
    parser.add_argument("--models", nargs="+", type=Path, default=[Path("models")])
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()
    if not args.image.is_file():
        sys.exit(f"image not found: {args.image}")
    for model_dir in args.models:
        print(f"\n{model_dir}")
        try:
            for label, score in predict(model_dir, args.image, args.top):
                print(f"  {score * 100:6.2f}%  {label}")
        except (FileNotFoundError, RuntimeError) as exc:
            print(f"  {exc}")


if __name__ == "__main__":
    main()