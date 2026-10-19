from __future__ import annotations

import argparse
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from scripts.train.common import class_name, folder_matches_crop, lab_group_key, list_images


def split_groups(keys: list[str], val_frac: float, test_frac: float, rng: random.Random) -> dict[str, str]:
    ordered = sorted(set(keys))
    rng.shuffle(ordered)
    n = len(ordered)
    n_test = max(1, round(n * test_frac)) if n >= 3 else 0
    n_val = max(1, round(n * val_frac)) if n >= 3 else 0
    out: dict[str, str] = {}
    for i, key in enumerate(ordered):
        if i < n_test:
            out[key] = "test_lab"
        elif i < n_test + n_val:
            out[key] = "val"
        else:
            out[key] = "train"
    return out


def copy_files(items: list[tuple[Path, str, str]], dest: Path) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for src, split, cls in items:
        target = dest / split / cls
        target.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target / f"{counts[f'{split}/{cls}']:06d}{src.suffix.lower()}")
        counts[f"{split}/{cls}"] += 1
    return dict(counts)


def prepare(
    lab_root: Path,
    field_root: Path | None,
    out: Path,
    crop: str,
    val_frac: float,
    test_frac: float,
    field_test_frac: float,
    seed: int,
) -> dict[str, object]:
    rng = random.Random(seed)
    items: list[tuple[Path, str, str]] = []
    classes: set[str] = set()

    per_class: dict[str, list[Path]] = defaultdict(list)
    for folder in sorted(p for p in lab_root.iterdir() if p.is_dir()):
        if not folder_matches_crop(folder.name, crop):
            continue
        cls = class_name(folder.name, crop)
        classes.add(cls)
        per_class[cls].extend(list_images(folder))
    for cls, files in per_class.items():
        assignment = split_groups([lab_group_key(f) for f in files], val_frac, test_frac, rng)
        items.extend((f, assignment[lab_group_key(f)], cls) for f in files)

    field_farms: dict[str, list[tuple[Path, str]]] = defaultdict(list)
    if field_root is not None:
        for farm in sorted(p for p in field_root.iterdir() if p.is_dir()):
            for cls_dir in sorted(p for p in farm.iterdir() if p.is_dir()):
                cls = class_name(cls_dir.name, crop)
                classes.add(cls)
                field_farms[farm.name].extend((f, cls) for f in list_images(cls_dir))
    farm_split = split_groups(list(field_farms), 0.0, field_test_frac, rng) if field_farms else {}
    for farm_name, farm_files in field_farms.items():
        split = "test_field" if farm_split[farm_name] == "test_lab" else "train"
        items.extend((path, split, label) for path, label in farm_files)

    if out.exists():
        shutil.rmtree(out)
    counts = copy_files(items, out)
    labels = sorted(classes)
    (out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    summary = {"classes": labels, "counts": counts, "total": len(items)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--lab", type=Path, required=True)
    p.add_argument("--field", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--crop", default="Tomato")
    p.add_argument("--val-frac", type=float, default=0.15)
    p.add_argument("--test-frac", type=float, default=0.15)
    p.add_argument("--field-test-frac", type=float, default=0.6)
    p.add_argument("--seed", type=int, default=42)
    a = p.parse_args()
    summary = prepare(a.lab, a.field, a.out, a.crop, a.val_frac, a.test_frac, a.field_test_frac, a.seed)
    print(f"classes: {summary['classes']}")
    print(f"images copied: {summary['total']}")
    print(f"summary written to {a.out / 'summary.json'}")


if __name__ == "__main__":
    main()
