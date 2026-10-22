from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from PIL import Image

from scripts.train.datasets import DatasetError, prepare_dataset, safe_name


def img(path: Path, color: int = 100) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (32, 32), (color, 120, 40)).save(path)


def read_summary(out: Path) -> dict:
    return json.loads((out / "summary.json").read_text())


def test_plantvillage_single_crop_and_leaf_groups(tmp_path: Path) -> None:
    root = tmp_path / "color"
    for cls in ("Tomato___Early_blight", "Tomato___healthy", "Potato___healthy"):
        for i in range(20):
            leaf = uuid.uuid4()
            img(root / cls / f"{leaf}___a{i}.JPG")
            img(root / cls / f"{leaf}___b{i}.JPG")
    out = tmp_path / "out"
    summary = prepare_dataset("plantvillage", root, out, "Tomato", 0.15, 0.15, 1, False)
    assert summary["classes"] == ["Early Blight", "Healthy"]
    seen: dict[str, set[str]] = {}
    for split_dir in out.iterdir():
        if split_dir.is_dir():
            for f in split_dir.rglob("*.jpg"):
                seen.setdefault(f.parent.parent.name, set()).add(f.name)
    assert set(seen) >= {"train", "val", "test_lab"}


def test_plantvillage_all_crops_keeps_crop_in_label(tmp_path: Path) -> None:
    root = tmp_path / "color"
    for cls in ("Tomato___healthy", "Potato___healthy"):
        for i in range(12):
            img(root / cls / f"{uuid.uuid4()}___x{i}.JPG")
    summary = prepare_dataset("plantvillage", root, tmp_path / "out", None, 0.15, 0.15, 1, False)
    assert summary["classes"] == ["Potato Healthy", "Tomato Healthy"]


def test_cassava_csv_layout(tmp_path: Path) -> None:
    root = tmp_path / "cassava"
    rows = ["image_id,label"]
    for i in range(50):
        name = f"{i}.jpg"
        img(root / "train_images" / name)
        rows.append(f"{name},{i % 5}")
    (root / "train.csv").write_text("\n".join(rows))
    summary = prepare_dataset("cassava", root, tmp_path / "out", None, 0.1, 0.1, 1, False)
    assert "Cassava Mosaic Disease" in summary["classes"]
    assert len(summary["classes"]) == 5


def test_ip102_official_split_files(tmp_path: Path) -> None:
    root = tmp_path / "ip102"
    lines = {"train": [], "val": [], "test": []}
    for i in range(30):
        split = "train" if i < 18 else "val" if i < 24 else "test"
        name = f"{i:05d}.jpg"
        img(root / "images" / name)
        lines[split].append(f"{name} {i % 3}")
    for split, content in lines.items():
        (root / f"{split}.txt").write_text("\n".join(content))
    (root / "classes.txt").write_text("1 rice leaf roller\n2 rice leaf caterpillar\n3 paddy stem maggot\n")
    out = tmp_path / "out"
    summary = prepare_dataset("ip102", root, out, None, 0.1, 0.1, 1, False)
    assert summary["splits"] == {"train": 18, "val": 6, "test_lab": 6}
    assert "rice leaf roller" in summary["classes"]


def test_folder_dataset_with_and_without_split_dirs(tmp_path: Path) -> None:
    flat = tmp_path / "flat"
    for cls in ("a", "b"):
        for i in range(12):
            img(flat / cls / f"{i}.png")
    summary = prepare_dataset("folders", flat, tmp_path / "o1", None, 0.15, 0.1, 1, False)
    assert summary["classes"] == ["a", "b"]
    split = tmp_path / "split"
    for s in ("train", "valid", "test"):
        for cls in ("a", "b"):
            for i in range(3):
                img(split / s / cls / f"{i}.png")
    summary2 = prepare_dataset("folders", split, tmp_path / "o2", None, 0.15, 0.1, 1, False)
    assert summary2["splits"] == {"train": 6, "val": 6, "test_lab": 6}


def test_clear_errors(tmp_path: Path) -> None:
    with pytest.raises(DatasetError):
        prepare_dataset("cassava", tmp_path, tmp_path / "o", None, 0.1, 0.1, 1, False)
    with pytest.raises(DatasetError):
        prepare_dataset("folders", tmp_path / "missing", tmp_path / "o", None, 0.1, 0.1, 1, False)


def test_safe_name_removes_windows_forbidden_characters() -> None:
    assert safe_name('Leaf: "spot"/blight. ') == "Leaf spot blight"


def test_combined_dataset_prefixes_labels(tmp_path: Path) -> None:
    pv = tmp_path / "pv"
    for i in range(12):
        img(pv / "Tomato___healthy" / f"{uuid.uuid4()}___x{i}.JPG")
    cas = tmp_path / "cas"
    rows = ["image_id,label"]
    for i in range(30):
        img(cas / "train_images" / f"{i}.jpg")
        rows.append(f"{i}.jpg,{4 if i % 2 else 3}")
    (cas / "train.csv").write_text("\n".join(rows))
    summary = prepare_dataset(
        "combined",
        {"plantvillage": pv, "cassava": cas, "ip102": None},
        tmp_path / "out",
        None,
        0.1,
        0.1,
        1,
        False,
    )
    assert summary["classes"] == ["Cassava Healthy", "Cassava Mosaic Disease", "Tomato Healthy"]


def test_router_labels_are_domains_and_capped(tmp_path: Path) -> None:
    pv = tmp_path / "pv"
    for _ in range(30):
        img(pv / "Tomato___Healthy" / f"{uuid.uuid4()}.jpg")
    cas = tmp_path / "cas"
    rows = ["image_id,label"]
    for i in range(30):
        img(cas / "train_images" / f"{i}.jpg")
        rows.append(f"{i}.jpg,3")
    (cas / "train.csv").write_text("\n".join(rows))
    summary = prepare_dataset(
        "router",
        {"plantvillage": pv, "cassava": cas, "ip102": None},
        tmp_path / "out",
        None,
        0.1,
        0.1,
        1,
        False,
        12,
    )
    assert summary["classes"] == ["cassava", "plantvillage-all"]
    counts = summary["counts"]
    assert isinstance(counts, dict)
    totals = {"cassava": 0, "plantvillage-all": 0}
    for key, n in counts.items():
        totals[key.split("/", 1)[1]] += n
    assert totals == {"cassava": 12, "plantvillage-all": 12}


def test_router_needs_two_domains(tmp_path: Path) -> None:
    pv = tmp_path / "pv"
    img(pv / "Tomato___Healthy" / f"{uuid.uuid4()}.jpg")
    with pytest.raises(DatasetError):
        prepare_dataset(
            "router",
            {"plantvillage": pv, "cassava": None, "ip102": None},
            tmp_path / "o",
            None,
            0.1,
            0.1,
            1,
            False,
        )
