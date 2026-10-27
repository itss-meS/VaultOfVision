from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DOSE_AUTHORITIES = {"ICAR", "SAU", "State Department of Agriculture", "CIBRC"}
CHUNK_AUTHORITIES = DOSE_AUTHORITIES | {"DPPQS", "Peer-reviewed journal"}
URL = re.compile(r"^https://\S+$")
ENTRY_KEYS = {
    "kind",
    "crop",
    "disease",
    "pest",
    "severity_min",
    "severity_max",
    "product",
    "dose_per_ha",
    "unit",
    "notes",
    "source",
    "checked_by",
}
CHUNK_KEYS = {"id", "crop", "disease", "stage", "lang", "region", "text", "source"}
MIN_BANNED_ALIAS_LENGTH = 5


def normalize(text: str) -> str:
    return re.sub(r"[^\w]+", "", text.lower())


def check_source(source: Any, allowed: set[str], where: str) -> list[str]:
    if not isinstance(source, dict):
        return [f"{where}: source missing"]
    errors = []
    if set(source) != {"authority", "document", "url"}:
        errors.append(f"{where}: source must have authority, document and url only")
    if source.get("authority") not in allowed:
        errors.append(f"{where}: source authority must be one of {sorted(allowed)}")
    document = source.get("document")
    if not isinstance(document, str) or len(document.strip()) < 10:
        errors.append(f"{where}: source document missing")
    url = source.get("url")
    if not isinstance(url, str) or not URL.match(url):
        errors.append(f"{where}: source url must be https")
    return errors


def load_banned(path: Path) -> list[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    names = [*doc.get("items", []), *doc.get("aliases", [])]
    return [normalize(n) for n in names if isinstance(n, str) and n.strip()]


def check_banned(path: Path) -> list[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    if not isinstance(doc.get("version"), int):
        errors.append("banned list: version must be an integer")
    for key in ("items", "aliases"):
        values = doc.get(key)
        if not isinstance(values, list) or not all(isinstance(v, str) and v.strip() for v in values):
            errors.append(f"banned list: {key} must be a list of non-empty strings")
            continue
        for value in values:
            if len(normalize(value)) < MIN_BANNED_ALIAS_LENGTH:
                errors.append(f"banned list: '{value}' is too short for substring matching")
    if not doc.get("items"):
        errors.append("banned list: items is empty")
    for i, source in enumerate(doc.get("sources", [])):
        if not isinstance(source, dict) or not URL.match(str(source.get("url", ""))):
            errors.append(f"banned list: sources[{i}] needs an https url")
    if not doc.get("sources"):
        errors.append("banned list: sources is empty")
    return errors


def check_dosage(path: Path, banned: list[str], release: bool) -> list[str]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    errors = []
    if set(doc) != {"version", "entries"} or not isinstance(doc.get("version"), int):
        errors.append("dosage table: top level must have an integer version and entries")
    seen = set()
    for i, entry in enumerate(doc.get("entries", [])):
        where = f"entries[{i}]"
        if not isinstance(entry, dict):
            errors.append(f"{where}: not an object")
            continue
        extra = set(entry) - ENTRY_KEYS
        if extra:
            errors.append(f"{where}: unknown keys {sorted(extra)}")
        kind = entry.get("kind")
        if kind not in ("disease", "pest"):
            errors.append(f"{where}: kind must be disease or pest")
            continue
        name = entry.get("disease" if kind == "disease" else "pest")
        other = entry.get("pest" if kind == "disease" else "disease")
        if not isinstance(name, str) or not name.strip() or other is not None:
            errors.append(f"{where}: a {kind} entry needs only the {kind} name")
            continue
        crop = entry.get("crop")
        if not isinstance(crop, str) or not crop.strip():
            errors.append(f"{where}: crop missing")
            continue
        lo, hi = entry.get("severity_min"), entry.get("severity_max")
        if not (isinstance(lo, int) and isinstance(hi, int) and 1 <= lo <= hi <= 5):
            errors.append(f"{where}: severity range must satisfy 1 <= min <= max <= 5")
        dose = entry.get("dose_per_ha")
        if isinstance(dose, bool) or not isinstance(dose, (int, float)) or dose <= 0:
            errors.append(f"{where}: dose_per_ha must be a positive number")
        if entry.get("unit") not in ("kg", "l"):
            errors.append(f"{where}: unit must be kg or l")
        product = entry.get("product")
        if not isinstance(product, str) or not product.strip():
            errors.append(f"{where}: product missing")
        else:
            norm = normalize(product)
            hit = [b for b in banned if b in norm]
            if hit:
                errors.append(f"{where}: product '{product}' matches the banned list")
        errors.extend(check_source(entry.get("source"), DOSE_AUTHORITIES, where))
        checked = entry.get("checked_by")
        if checked is not None and (not isinstance(checked, str) or len(checked.strip()) < 2):
            errors.append(f"{where}: checked_by must be a name or null")
        if release and not checked:
            errors.append(f"{where}: checked_by is required for a release")
        key = (kind, crop.lower(), name.lower(), lo, hi)
        if key in seen:
            errors.append(f"{where}: duplicate entry")
        seen.add(key)
    return errors


def check_chunks(path: Path, banned: list[str]) -> list[str]:
    errors = []
    ids = set()
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            errors.append(f"chunks line {n}: blank line")
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            errors.append(f"chunks line {n}: not valid JSON")
            continue
        if not isinstance(rec, dict) or set(rec) != CHUNK_KEYS:
            errors.append(f"chunks line {n}: keys must be {sorted(CHUNK_KEYS)}")
            continue
        if rec["id"] in ids:
            errors.append(f"chunks line {n}: duplicate id")
        ids.add(rec["id"])
        for key in ("id", "crop", "disease", "stage", "lang", "region", "text"):
            if not isinstance(rec[key], str) or not rec[key].strip():
                errors.append(f"chunks line {n}: {key} must be a non-empty string")
        text = rec["text"] if isinstance(rec["text"], str) else ""
        if len(text) > 700:
            errors.append(f"chunks line {n}: text is longer than 700 characters")
        norm = normalize(text)
        if any(b in norm for b in banned):
            errors.append(f"chunks line {n}: text names a banned pesticide")
        errors.extend(check_source(rec["source"], CHUNK_AUTHORITIES, f"chunks line {n}"))
    return errors


def validate(directory: Path, release: bool = False) -> list[str]:
    banned_path = directory / "banned_pesticides.json"
    errors = check_banned(banned_path)
    banned = load_banned(banned_path)
    errors.extend(check_dosage(directory / "dosage_table.json", banned, release))
    errors.extend(check_chunks(directory / "chunks.jsonl", banned))
    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, default=ROOT / "knowledge")
    parser.add_argument("--release", action="store_true")
    args = parser.parse_args()
    errors = validate(args.dir, args.release)
    for error in errors:
        print(error)
    if errors:
        sys.exit(1)
    print("knowledge files are valid")


if __name__ == "__main__":
    main()
