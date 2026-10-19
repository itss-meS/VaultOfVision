from __future__ import annotations

import argparse
import json
import random
import shutil
from pathlib import Path

from scripts.train.common import list_images


def pick_calibration(train_dir: Path, out: Path, count: int, seed: int) -> int:
    images = list_images(train_dir)
    random.Random(seed).shuffle(images)
    out.mkdir(parents=True, exist_ok=True)
    for i, img in enumerate(images[:count]):
        shutil.copy2(img, out / f"{i:05d}{img.suffix.lower()}")
    return min(count, len(images))


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--weights", type=Path, required=True)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("export"))
    p.add_argument("--imgsz", type=int, default=224)
    p.add_argument("--calibration", type=int, default=200)
    a = p.parse_args()

    from ultralytics import YOLO

    a.out.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(a.weights))
    onnx_path = Path(model.export(format="onnx", imgsz=a.imgsz, simplify=True))
    target = a.out / "model.onnx"
    shutil.copy2(onnx_path, target)
    labels = [model.names[i] for i in sorted(model.names)]
    (a.out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    n = pick_calibration(a.data / "train", a.out / "calibration", a.calibration, 42)
    print(f"wrote {target}, labels.json and {n} calibration images")


if __name__ == "__main__":
    main()
