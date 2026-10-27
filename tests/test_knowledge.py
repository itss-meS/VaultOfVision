from __future__ import annotations

import copy
import json
from pathlib import Path

from scripts.validate_knowledge import check_dosage, load_banned, normalize, validate

ROOT = Path(__file__).resolve().parent.parent
KNOWLEDGE = ROOT / "knowledge"


def write_table(path: Path, entries: list[dict]) -> Path:
    path.write_text(json.dumps({"version": 1, "entries": entries}), encoding="utf-8")
    return path


def first_entry() -> dict:
    doc = json.loads((KNOWLEDGE / "dosage_table.json").read_text(encoding="utf-8"))
    return copy.deepcopy(doc["entries"][0])


def test_shipped_knowledge_is_valid() -> None:
    assert validate(KNOWLEDGE) == []


def test_release_requires_a_named_checker() -> None:
    errors = validate(KNOWLEDGE, release=True)
    assert errors
    assert all("checked_by is required" in e for e in errors)


def test_banned_list_covers_the_official_names() -> None:
    banned = load_banned(KNOWLEDGE / "banned_pesticides.json")
    for name in ("Endosulfan", "Dicofol", "Dinocap", "Methomyl", "Triazophos", "Paraquat Dimethyl Sulphate"):
        assert normalize(name) in banned


def test_no_dosage_product_is_banned() -> None:
    banned = load_banned(KNOWLEDGE / "banned_pesticides.json")
    doc = json.loads((KNOWLEDGE / "dosage_table.json").read_text(encoding="utf-8"))
    for entry in doc["entries"]:
        assert not [b for b in banned if b in normalize(entry["product"])]


def test_every_entry_has_a_real_source() -> None:
    doc = json.loads((KNOWLEDGE / "dosage_table.json").read_text(encoding="utf-8"))
    assert doc["entries"]
    for entry in doc["entries"]:
        assert entry["source"]["url"].startswith("https://")
        assert entry["source"]["authority"] in {"ICAR", "SAU", "State Department of Agriculture", "CIBRC"}


def test_entry_without_source_is_rejected(tmp_path: Path) -> None:
    entry = first_entry()
    del entry["source"]
    errors = check_dosage(write_table(tmp_path / "t.json", [entry]), [], False)
    assert any("source missing" in e for e in errors)


def test_entry_with_unlisted_authority_is_rejected(tmp_path: Path) -> None:
    entry = first_entry()
    entry["source"]["authority"] = "A blog"
    errors = check_dosage(write_table(tmp_path / "t.json", [entry]), [], False)
    assert any("authority" in e for e in errors)


def test_banned_product_is_rejected(tmp_path: Path) -> None:
    entry = first_entry()
    entry["product"] = "Endosulfan 35% EC"
    banned = load_banned(KNOWLEDGE / "banned_pesticides.json")
    errors = check_dosage(write_table(tmp_path / "t.json", [entry]), banned, False)
    assert any("banned list" in e for e in errors)


def test_pest_entry_needs_a_pest_name(tmp_path: Path) -> None:
    entry = first_entry()
    entry["kind"] = "pest"
    errors = check_dosage(write_table(tmp_path / "t.json", [entry]), [], False)
    assert errors


def test_bad_dose_is_rejected(tmp_path: Path) -> None:
    entry = first_entry()
    entry["dose_per_ha"] = 0
    errors = check_dosage(write_table(tmp_path / "t.json", [entry]), [], False)
    assert any("dose_per_ha" in e for e in errors)
