from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--model", default="yolo11n-cls.pt")
    p.add_argument("--epochs", type=int, default=50)
    p.add_argument("--imgsz", type=int, default=224)
    p.add_argument("--batch", type=int, default=-1)
    p.add_argument("--device", default="0")
    p.add_argument("--project", type=Path, default=Path("runs"))
    p.add_argument("--name", default="classifier")
    a = p.parse_args()

    from ultralytics import YOLO

    model = YOLO(a.model)
    model.train(
        data=str(a.data),
        epochs=a.epochs,
        imgsz=a.imgsz,
        batch=a.batch,
        device=a.device,
        project=str(a.project),
        name=a.name,
        workers=4,
        patience=15,
        seed=42,
        deterministic=True,
        exist_ok=True,
    )
    print(f"best weights: {a.project / a.name / 'weights' / 'best.pt'}")


if __name__ == "__main__":
    main()
