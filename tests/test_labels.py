import json
from pathlib import Path

import pytest

from scripts.train.datasets import Item, canonicalise
from scripts.train.labels import is_junk, normalize_label, slug

DATA = json.loads((Path(__file__).parent / "label_cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", DATA["cases"], ids=lambda c: c["raw"])
def test_normalize_matches_fixture(case):
    got = normalize_label(case["raw"])
    assert got.kind == case["kind"]
    assert got.crop == case["crop"]
    assert got.name == case["name"]
    assert got.label == case["label"]
    assert got.key == case["key"]


def test_junk_names_are_detected():
    assert all(is_junk(n) for n in DATA["junk"])
    assert not any(is_junk(n) for n in DATA["notjunk"])


def test_duplicate_spellings_merge_to_one_key():
    keys = {normalize_label(r).key for r in ("Pepper bell Bacterial Spot", "bell pepper bacterial spot")}
    assert keys == {"bell-pepper-bacterial-spot"}
    keys = {normalize_label(r).key for r in ("Tomato Bacterial Spot", "tomato bacterial leaf spot")}
    assert keys == {"tomato-bacterial-spot"}


def test_leaf_folder_becomes_healthy():
    assert normalize_label("rice leaf").label == "Rice Healthy"
    assert normalize_label("rice leaf").kind == "healthy"


def test_pest_names_are_kept_as_given():
    got = normalize_label("Pest bird cherry-oataphid")
    assert got.label == "Pest bird cherry-oataphid"
    assert got.kind == "pest"


def test_slug_is_stable():
    assert slug("Wheat Bacterial Leaf Streak (Black Chaff)") == "wheat-bacterial-leaf-streak-black-chaff"


def test_canonicalise_drops_junk_and_renames(tmp_path):
    items = [
        Item(tmp_path / "a.jpg", "images", "train", None),
        Item(tmp_path / "b.jpg", "apple leaf", "train", None),
        Item(tmp_path / "c.jpg", "tomato early blight", "val", None),
    ]
    out = canonicalise(items)
    assert [i.label for i in out] == ["Apple Healthy", "Tomato Early Blight"]
    assert [i.split for i in out] == ["train", "val"]
