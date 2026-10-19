from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from scripts.train.common import class_name, folder_matches_crop, lab_group_key
from scripts.train.evaluate_classifier import confusion, score
from scripts.train.export_model import pick_calibration
from scripts.train.prepare_classification import prepare, split_groups


def make_img(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (32, 32), (10, 120, 10)).save(path)


def build_lab(root: Path) -> None:
    for folder, n in (("Tomato___Early_blight", 30), ("Tomato___healthy", 30), ("Potato___Late_blight", 5)):
        for i in range(n):
            make_img(root / folder / f"leaf{i:03d}___RS_{i}.JPG")
            make_img(root / folder / f"leaf{i:03d}___RS_{i}_flipTB.JPG")


def test_class_names_and_crop_filter() -> None:
    assert class_name("Tomato___Early_blight", "Tomato") == "Early Blight"
    assert class_name("Tomato___Spider_mites Two-spotted_spider_mite", "Tomato") == "Spider Mites"
    assert class_name("Tomato___Tomato_Yellow_Leaf_Curl_Virus", "Tomato") == "Yellow Leaf Curl Virus"
    assert class_name("Tomato___healthy", "Tomato") == "Healthy"
    assert folder_matches_crop("Tomato___Late_blight", "tomato")
    assert not folder_matches_crop("Potato___Late_blight", "Tomato")
    assert lab_group_key(Path("abc___RS_1_flipTB.JPG")) == "abc"


def test_split_groups_keeps_group_together_and_is_deterministic() -> None:
    import random

    keys = [f"g{i}" for i in range(40)]
    a = split_groups(keys, 0.15, 0.15, random.Random(1))
    b = split_groups(keys, 0.15, 0.15, random.Random(1))
    assert a == b
    assert set(a.values()) == {"train", "val", "test_lab"}


def test_prepare_has_no_leakage_between_splits(tmp_path: Path) -> None:
    lab = tmp_path / "lab"
    build_lab(lab)
    field = tmp_path / "field"
    for farm in ("farmA", "farmB", "farmC", "farmD"):
        for i in range(2):
            make_img(field / farm / "Tomato___Early_blight" / f"{i}.jpg")
    out = tmp_path / "out"
    summary = prepare(lab, field, out, "Tomato", 0.15, 0.15, 0.5, 7)
    assert summary["classes"] == ["Early Blight", "Healthy"]
    assert not (out / "Potato").exists()
    seen: dict[str, str] = {}
    for split in ("train", "val", "test_lab"):
        for img in (out / split).rglob("*.jpg"):
            assert img.is_file()
    files_total = sum(1 for _ in out.rglob("*.jpg"))
    assert files_total == summary["total"]
    assert (out / "test_field").is_dir() and (out / "train" / "Early Blight").is_dir()
    labels = json.loads((out / "labels.json").read_text())
    assert labels == ["Early Blight", "Healthy"]
    assert not seen


def test_scoring_and_confusion() -> None:
    pairs = [("a", "a"), ("a", "b"), ("b", "b"), ("b", "b")]
    s = score(pairs)
    assert s["top1"] == 0.75 and s["per_class"]["a"]["recall"] == 0.5
    labels, matrix = confusion(pairs)
    assert labels == ["a", "b"] and matrix == [[1, 1], [0, 2]]
    assert score([])["top1"] is None


def test_calibration_picker(tmp_path: Path) -> None:
    for i in range(10):
        make_img(tmp_path / "train" / "x" / f"{i}.jpg")
    assert pick_calibration(tmp_path / "train", tmp_path / "cal", 4, 1) == 4
    assert len(list((tmp_path / "cal").iterdir())) == 4
