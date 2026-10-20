from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path

from scripts.train.common import list_images
from scripts.train.datasets import DatasetError, prepare_dataset, safe_name
from scripts.train.evaluate_classifier import confusion, score
from scripts.train.export_model import pick_calibration

PLANTVILLAGE_URL = "https://github.com/spMohanty/PlantVillage-Dataset"


def check_gpu(device: str) -> None:
    import torch

    if device == "cpu":
        print("training on CPU, this will be slow")
        return
    if not torch.cuda.is_available():
        sys.exit(
            "CUDA is not available to PyTorch.\n"
            "Install the CUDA build:  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124\n"
            'Then check:  python -c "import torch; print(torch.cuda.is_available())"'
        )
    props = torch.cuda.get_device_properties(0)
    print(
        f"GPU: {props.name}, {props.total_memory / 1024**3:.1f} GB, torch {torch.__version__}, cuda {torch.version.cuda}"
    )


def download_plantvillage(target: Path) -> Path:
    color = target / "raw" / "color"
    if color.is_dir():
        print(f"PlantVillage already present at {color}")
        return color
    if shutil.which("git") is None:
        sys.exit("git is not installed. Install Git for Windows, or download the dataset zip manually.")
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", "--depth", "1", PLANTVILLAGE_URL, str(target)], check=True)
    return color


def train(
    data: Path, model_name: str, epochs: int, imgsz: int, batch: int, device: str, workers: int, runs: Path
) -> Path:
    from ultralytics import YOLO

    model = YOLO(model_name)
    model.train(
        data=str(data),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        device=device,
        workers=workers,
        project=str(runs.resolve()),
        name="classifier",
        patience=15,
        seed=42,
        deterministic=True,
        exist_ok=True,
        amp=device != "cpu",
    )
    best = Path(model.trainer.best)
    if not best.is_file():
        sys.exit(f"training finished but {best} was not found")
    return best


def evaluate(weights: Path, data: Path, out: Path, device: str) -> dict[str, object]:
    from ultralytics import YOLO

    model = YOLO(str(weights))
    names = model.names
    out.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {}
    for split in ("test_lab", "test_field"):
        root = data / split
        if not root.is_dir():
            report[split] = "no images in this split"
            continue
        truths: list[str] = []
        paths: list[str] = []
        for cls_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            for img in list_images(cls_dir):
                truths.append(cls_dir.name)
                paths.append(str(img))
        pairs: list[tuple[str, str]] = []
        for start in range(0, len(paths), 64):
            chunk = paths[start : start + 64]
            for truth, result in zip(
                truths[start : start + 64], model.predict(chunk, device=device, verbose=False), strict=True
            ):
                pairs.append((truth, names[int(result.probs.top1)]))
        report[split] = score(pairs)
        labels, matrix = confusion(pairs)
        with open(out / f"confusion_{split}.csv", "w", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            writer.writerow(["true\\pred", *labels])
            for label, row in zip(labels, matrix, strict=True):
                writer.writerow([label, *row])
    (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def export(weights: Path, data: Path, out: Path, imgsz: int, calibration: int) -> Path:
    from ultralytics import YOLO

    out.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(weights))
    onnx_path = Path(model.export(format="onnx", imgsz=imgsz, simplify=True))
    target = out / "vision.onnx"
    shutil.copy2(onnx_path, target)
    labels = [model.names[i] for i in sorted(model.names)]
    (out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    pick_calibration(data / "train", out / "calibration", calibration, 42)
    return target


def add_field_test(source: Path, data: Path) -> int:
    count = 0
    for cls_dir in sorted(p for p in source.iterdir() if p.is_dir()):
        target = data / "test_field" / safe_name(cls_dir.name)
        for img in list_images(cls_dir):
            target.mkdir(parents=True, exist_ok=True)
            shutil.copy2(img, target / f"{count:06d}{img.suffix.lower()}")
            count += 1
    return count


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--dataset",
        required=True,
        choices=["plantvillage", "cassava", "ip102", "folders", "combined", "separate", "router"],
    )
    p.add_argument("--root", type=Path, help="folder that holds the downloaded dataset")
    p.add_argument(
        "--download", action="store_true", help="plantvillage only: git clone into data/PlantVillage"
    )
    p.add_argument(
        "--crop", help="plantvillage only: train one crop, for example Tomato; leave out for all crops"
    )
    p.add_argument(
        "--field-test", type=Path, help="optional folder-per-class field photos used only for testing"
    )
    p.add_argument("--pv-root", type=Path, help="PlantVillage color folder, for combined or separate")
    p.add_argument("--cassava-root", type=Path, help="Cassava folder, for combined or separate")
    p.add_argument("--ip102-root", type=Path, help="IP102 folder, for combined or separate")
    p.add_argument("--per-domain", type=int, default=2000, help="images per dataset for the router")
    p.add_argument("--name", help="name for the outputs, default is the dataset name")
    p.add_argument("--work", type=Path, default=Path("data"))
    p.add_argument("--model", default="yolo11n-cls.pt")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--imgsz", type=int, default=224)
    p.add_argument("--batch", type=int, default=64)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--device", default="0")
    p.add_argument("--calibration", type=int, default=200)
    p.add_argument("--copy", action="store_true", help="copy images instead of hard-linking them")
    p.add_argument(
        "--activate", action="store_true", help="also copy the result to models/vision.onnx for the backend"
    )
    a = p.parse_args()

    check_gpu(a.device)
    if a.dataset == "separate":
        jobs = [
            ("plantvillage", a.pv_root, "plantvillage-all"),
            ("cassava", a.cassava_root, "cassava"),
            ("ip102", a.ip102_root, "ip102"),
        ]
        jobs = [(d, r, n) for d, r, n in jobs if r is not None]
        if not jobs:
            sys.exit("separate needs at least one of --pv-root, --cassava-root, --ip102-root")
        if a.activate:
            sys.exit(
                "--activate is not allowed with separate; copy the model you want to models/vision.onnx yourself"
            )
        done: list[Path] = []
        for dataset, root, name in jobs:
            print(f"\n=== training {name} ===")
            done.append(run_one(a, dataset, root, name, None))
        print("\nall models ready:")
        for path in done:
            print(f"  {path}")
        return

    root = a.root
    if a.download:
        if a.dataset != "plantvillage":
            sys.exit("--download only works for plantvillage")
        root = download_plantvillage(a.work / "PlantVillage")
    combined: dict[str, Path | None] = {
        "plantvillage": a.pv_root,
        "cassava": a.cassava_root,
        "ip102": a.ip102_root,
    }
    if a.dataset in ("combined", "router"):
        if not any(combined.values()):
            sys.exit(f"{a.dataset} needs at least one of --pv-root, --cassava-root, --ip102-root")
        source: Path | dict[str, Path | None] = combined
    elif root is None:
        sys.exit("give --root <dataset folder>")
    else:
        source = root

    name = safe_name(a.name or (f"{a.dataset}-{a.crop}" if a.crop else a.dataset)).lower().replace(" ", "-")
    run_one(a, a.dataset, source, name, a.crop)


def run_one(
    a: argparse.Namespace,
    dataset: str,
    source: Path | dict[str, Path | None],
    name: str,
    crop: str | None,
) -> Path:
    prepared = a.work / name
    try:
        summary = prepare_dataset(
            dataset, source, prepared, crop, 0.1, 0.1, 42, not a.copy, getattr(a, "per_domain", None)
        )
        if a.field_test:
            print(f"field test images added: {add_field_test(a.field_test, prepared)}")
    except DatasetError as exc:
        sys.exit(f"dataset problem: {exc}")
    classes = summary["classes"]
    print(f"classes: {len(classes) if isinstance(classes, list) else classes}")
    print(f"images per split: {summary['splits']}")

    runs = Path("runs") / name
    best = train(prepared, a.model, a.epochs, a.imgsz, a.batch, a.device, a.workers, runs)
    report = evaluate(best, prepared, runs / "eval", a.device)
    print(json.dumps({k: (v["top1"] if isinstance(v, dict) else v) for k, v in report.items()}, indent=2))
    out = Path("models") / name
    onnx = export(best, prepared, out, a.imgsz, a.calibration)
    print(f"model ready: {onnx}")
    if a.activate:
        shutil.copy2(onnx, Path("models") / "vision.onnx")
        shutil.copy2(out / "labels.json", Path("models") / "labels.json")
        print("copied to models/vision.onnx and models/labels.json")
    return onnx


if __name__ == "__main__":
    main()