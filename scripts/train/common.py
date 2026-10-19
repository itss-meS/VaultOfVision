from __future__ import annotations

import re
from pathlib import Path

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}

ALIASES = {
    "spidermitestwospottedspidermite": "Spider Mites",
    "spidermites": "Spider Mites",
    "tomatoyellowleafcurlvirus": "Yellow Leaf Curl Virus",
    "yellowleafcurlvirus": "Yellow Leaf Curl Virus",
    "tomatomosaicvirus": "Mosaic Virus",
    "mosaicvirus": "Mosaic Virus",
    "healthy": "Healthy",
}


def squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def class_name(folder: str, crop: str) -> str:
    raw = folder.split("___", 1)[1] if "___" in folder else folder
    raw = re.sub(rf"^{re.escape(crop)}[_ ]*", "", raw, flags=re.IGNORECASE)
    key = squash(raw)
    if key in ALIASES:
        return ALIASES[key]
    return " ".join(w.capitalize() for w in re.split(r"[_\s]+", raw.strip("_ ")) if w)


def folder_matches_crop(folder: str, crop: str) -> bool:
    head = folder.split("___", 1)[0] if "___" in folder else folder
    return squash(head).startswith(squash(crop))


def list_images(directory: Path) -> list[Path]:
    return sorted(p for p in directory.rglob("*") if p.suffix.lower() in IMAGE_EXT and p.is_file())


def lab_group_key(path: Path) -> str:
    stem = path.stem
    return stem.split("___", 1)[0] if "___" in stem else stem
