from __future__ import annotations

import csv
import json
import os
import random
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from scripts.train.common import IMAGE_EXT, class_name, lab_group_key, list_images, squash

CASSAVA_DEFAULT = {
    "0": "Cassava Bacterial Blight",
    "1": "Cassava Brown Streak Disease",
    "2": "Cassava Green Mottle",
    "3": "Cassava Mosaic Disease",
    "4": "Healthy",
}

SPLITS = ("train", "val", "test_lab")

NOT_CROP_LABEL = "Not a leaf or insect"


@dataclass(frozen=True)
class Item:
    path: Path
    label: str
    split: str | None = None
    group: str | None = None


class DatasetError(RuntimeError):
    pass


def safe_name(label: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", label)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        raise DatasetError(f"class name {label!r} is empty after cleaning")
    return cleaned


def split_folder(name: str) -> tuple[str, str]:
    for sep in ("___", "__", "_"):
        if sep in name:
            head, rest = name.split(sep, 1)
            return head, rest
    return name, ""


def plantvillage_items(root: Path, crop: str | None) -> list[Item]:
    items: list[Item] = []
    folders = sorted(p for p in root.iterdir() if p.is_dir())
    if not folders:
        raise DatasetError(f"no class folders found in {root}")
    for folder in folders:
        head, rest = split_folder(folder.name)
        if crop and squash(head) != squash(crop) and not squash(head).startswith(squash(crop)):
            continue
        if crop:
            label = class_name(folder.name, crop)
        else:
            crop_part = re.sub(r"[_,]+", " ", head).strip()
            disease = class_name(rest, crop_part) if rest else "Unknown"
            label = safe_name(f"{crop_part} {disease}")
        for img in list_images(folder):
            items.append(Item(img, label, None, f"{label}|{lab_group_key(img)}"))
    if not items:
        raise DatasetError(f"no images matched crop={crop!r} under {root}")
    return items


def cassava_items(root: Path) -> list[Item]:
    csv_files = sorted(root.rglob("train.csv"))
    if not csv_files:
        raise DatasetError(f"train.csv not found under {root}")
    csv_path = csv_files[0]
    names = dict(CASSAVA_DEFAULT)
    for map_file in root.rglob("label_num_to_disease_map.json"):
        loaded = json.loads(map_file.read_text(encoding="utf-8"))
        names = {str(k): str(v) for k, v in loaded.items()}
        break
    index = {p.name: p for p in list_images(root)}
    items: list[Item] = []
    missing = 0
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            image = index.get(row["image_id"])
            if image is None:
                missing += 1
                continue
            label = names.get(str(row["label"]).strip())
            if label is None:
                raise DatasetError(f"label {row['label']!r} is not in the label map")
            items.append(Item(image, safe_name(label), None, None))
    if not items:
        raise DatasetError("train.csv matched no images")
    if missing:
        print(f"warning: {missing} images listed in train.csv were not found")
    return items


def read_ip102_classes(root: Path) -> dict[int, str]:
    for candidate in sorted(root.rglob("classes.txt")):
        mapping: dict[int, str] = {}
        for line in candidate.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"^\s*(\d+)[\s:,.]+(.+?)\s*$", line)
            if m:
                mapping[int(m.group(1))] = m.group(2)
        if mapping:
            return mapping
    return {}


def ip102_items(root: Path) -> list[Item]:
    split_files = {"train": "train.txt", "val": "val.txt", "test_lab": "test.txt"}
    found = {s: sorted(root.rglob(f)) for s, f in split_files.items()}
    if not all(found.values()):
        folders = folder_items(root)
        if not folders:
            raise DatasetError(f"no train.txt, val.txt, test.txt or class folders under {root}")
        return folders
    index = {p.name: p for p in list_images(root)}
    rows: list[tuple[str, str, int]] = []
    for split, files in found.items():
        for line in files[0].read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = line.split()
            if len(parts) < 2 or not parts[-1].lstrip("-").isdigit():
                continue
            rows.append((split, " ".join(parts[:-1]), int(parts[-1])))
    if not rows:
        raise DatasetError("the split files contained no usable lines")
    names = read_ip102_classes(root)
    offset = 0
    if names and min(names) == 1 and min(r[2] for r in rows) == 0:
        offset = 1
    ids = sorted({r[2] for r in rows})
    resolved = {i: names.get(i + offset, f"class {i:03d}") for i in ids}
    duplicated = {n for n in resolved.values() if list(resolved.values()).count(n) > 1}
    final = {i: (f"{n} {i:03d}" if n in duplicated else n) for i, n in resolved.items()}
    items: list[Item] = []
    missing = 0
    for split, name, label_id in rows:
        image = index.get(Path(name).name)
        if image is None:
            missing += 1
            continue
        items.append(Item(image, safe_name(final[label_id]), split, None))
    if missing:
        print(f"warning: {missing} images listed in the split files were not found")
    if not items:
        raise DatasetError("no IP102 images were found next to the split files")
    return items


def folder_items(root: Path) -> list[Item]:
    top = sorted(p for p in root.iterdir() if p.is_dir())
    aliases = {"train": "train", "val": "val", "valid": "val", "validation": "val", "test": "test_lab"}
    split_dirs = {aliases[p.name.lower()]: p for p in top if p.name.lower() in aliases}
    items: list[Item] = []
    if "train" in split_dirs:
        for split, directory in split_dirs.items():
            for cls_dir in sorted(p for p in directory.iterdir() if p.is_dir()):
                for img in list_images(cls_dir):
                    items.append(Item(img, safe_name(cls_dir.name), split, None))
        return items
    for cls_dir in top:
        for img in list_images(cls_dir):
            items.append(Item(img, safe_name(cls_dir.name), None, None))
    return items


def load_items(kind: str, root: Path, crop: str | None) -> list[Item]:
    if not root.is_dir():
        raise DatasetError(f"dataset folder not found: {root}")
    if kind == "plantvillage":
        return plantvillage_items(root, crop)
    if kind == "cassava":
        return cassava_items(root)
    if kind == "ip102":
        return ip102_items(root)
    if kind == "folders":
        items = folder_items(root)
        if not items:
            raise DatasetError(f"no class folders with images under {root}")
        return items
    raise DatasetError(f"unknown dataset kind: {kind}")


def relabel(items: list[Item], prefix: str) -> list[Item]:
    return [Item(i.path, safe_name(f"{prefix} {i.label}"), i.split, i.group) for i in items]


def combined_items(roots: dict[str, Path | None]) -> list[Item]:
    items: list[Item] = []
    pv = roots.get("plantvillage")
    cassava = roots.get("cassava")
    ip102 = roots.get("ip102")
    if pv is not None:
        items.extend(load_items("plantvillage", pv, None))
    if cassava is not None:
        for i in load_items("cassava", cassava, None):
            items.append(i if i.label.lower().startswith("cassava") else relabel([i], "Cassava")[0])
    if ip102 is not None:
        items.extend(relabel(load_items("ip102", ip102, None), "Pest"))
    if not items:
        raise DatasetError("give at least one dataset folder")
    return items


def negative_items(root: Path, cap: int | None, seed: int) -> list[Item]:
    if not root.is_dir():
        raise DatasetError(f"negatives folder not found: {root}")
    images = list_images(root)
    if len(images) < 30:
        raise DatasetError(f"the negatives folder needs at least 30 images, found {len(images)}")
    random.Random(seed).shuffle(images)
    picked = images[:cap] if cap else images
    return [Item(path, NOT_CROP_LABEL, None, None) for path in picked]


ROUTER_DOMAINS = {
    "plantvillage": "plantvillage-all",
    "cassava": "cassava",
    "ip102": "ip102",
}


def router_items(roots: dict[str, Path | None], cap: int | None, seed: int) -> list[Item]:
    rng = random.Random(seed)
    items: list[Item] = []
    for kind, domain in ROUTER_DOMAINS.items():
        root = roots.get(kind)
        if root is None:
            continue
        picked = [Item(i.path, domain, i.split, i.group) for i in load_items(kind, root, None)]
        rng.shuffle(picked)
        items.extend(picked[:cap] if cap else picked)
    if len({i.label for i in items}) < 2:
        raise DatasetError("the router needs at least two dataset folders")
    return items


def assign_splits(items: list[Item], val_frac: float, test_frac: float, seed: int) -> list[tuple[Item, str]]:
    rng = random.Random(seed)
    result: list[tuple[Item, str]] = []
    pending: dict[str, list[Item]] = defaultdict(list)
    for item in items:
        if item.split is not None:
            result.append((item, item.split))
        else:
            pending[item.label].append(item)
    for _label, group_items in sorted(pending.items()):
        grouped: dict[str, list[Item]] = defaultdict(list)
        for position, item in enumerate(group_items):
            grouped[item.group if item.group else f"single-{position}"].append(item)
        keys = sorted(grouped)
        rng.shuffle(keys)
        n = len(keys)
        n_test = round(n * test_frac) if n >= 10 else 0
        n_val = max(1, round(n * val_frac)) if n >= 3 else 0
        for i, key in enumerate(keys):
            split = "test_lab" if i < n_test else "val" if i < n_test + n_val else "train"
            result.extend((item, split) for item in grouped[key])
    return result


def place(src: Path, dst: Path, link: bool) -> None:
    if link:
        try:
            os.link(src, dst)
            return
        except OSError:
            pass
    shutil.copy2(src, dst)


def write_layout(assigned: list[tuple[Item, str]], out: Path, link: bool) -> dict[str, object]:
    if out.exists():
        shutil.rmtree(out)
    counts: dict[str, int] = defaultdict(int)
    labels = sorted({item.label for item, _ in assigned})
    for item, split in assigned:
        target = out / split / item.label
        target.mkdir(parents=True, exist_ok=True)
        key = f"{split}/{item.label}"
        suffix = item.path.suffix.lower()
        if suffix not in IMAGE_EXT:
            continue
        place(item.path, target / f"{counts[key]:06d}{suffix}", link)
        counts[key] += 1
    for split in ("train", "val"):
        if not (out / split).is_dir():
            raise DatasetError(
                f"the {split} split is empty; the dataset is too small or its labels are missing"
            )
    (out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    per_split: dict[str, int] = defaultdict(int)
    for key, n in counts.items():
        per_split[key.split("/", 1)[0]] += n
    summary: dict[str, object] = {"classes": labels, "splits": dict(per_split), "counts": dict(counts)}
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def prepare_dataset(
    kind: str,
    root: Path | dict[str, Path | None],
    out: Path,
    crop: str | None,
    val_frac: float,
    test_frac: float,
    seed: int,
    link: bool,
    cap: int | None = None,
    negatives: Path | None = None,
    negative_cap: int | None = 1500,
) -> dict[str, object]:
    if isinstance(root, dict) and kind == "router":
        items = router_items(root, cap, seed)
    elif isinstance(root, dict):
        items = combined_items(root)
    else:
        items = load_items(kind, root, crop)
    if negatives is not None and kind != "router":
        items = items + negative_items(negatives, negative_cap, seed)
    assigned = assign_splits(items, val_frac, test_frac, seed)
    return write_layout(assigned, out, link)
