from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from scripts.train.common import list_images


def score(pairs: list[tuple[str, str]]) -> dict[str, object]:
    total = len(pairs)
    correct = sum(1 for truth, pred in pairs if truth == pred)
    per_class: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "ok": 0})
    for truth, pred in pairs:
        per_class[truth]["n"] += 1
        per_class[truth]["ok"] += int(truth == pred)
    return {
        "images": total,
        "top1": round(correct / total, 4) if total else None,
        "per_class": {k: {**v, "recall": round(v["ok"] / v["n"], 4)} for k, v in sorted(per_class.items())},
    }


def confusion(pairs: list[tuple[str, str]]) -> tuple[list[str], list[list[int]]]:
    labels = sorted({t for t, _ in pairs} | {p for _, p in pairs})
    counts = Counter(pairs)
    return labels, [[counts[(t, p)] for p in labels] for t in labels]


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--weights", type=Path, required=True)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--out", type=Path, default=Path("eval"))
    p.add_argument("--device", default="0")
    a = p.parse_args()

    from ultralytics import YOLO

    model = YOLO(str(a.weights))
    names = model.names
    a.out.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {}
    for split in ("test_lab", "test_field"):
        root = a.data / split
        if not root.is_dir():
            report[split] = "no images in this split"
            continue
        pairs: list[tuple[str, str]] = []
        for cls_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            for img in list_images(cls_dir):
                result = model.predict(str(img), device=a.device, verbose=False)[0]
                pairs.append((cls_dir.name, names[int(result.probs.top1)]))
        report[split] = score(pairs)
        labels, matrix = confusion(pairs)
        with open(a.out / f"confusion_{split}.csv", "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["true\\pred", *labels])
            for label, row in zip(labels, matrix, strict=True):
                w.writerow([label, *row])
    (a.out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
