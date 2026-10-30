from __future__ import annotations

import re
from dataclasses import dataclass

CROPS = (
    "Apple",
    "Banana",
    "Basil",
    "Bean",
    "Bell Pepper",
    "Blueberry",
    "Broccoli",
    "Cabbage",
    "Carrot",
    "Cassava",
    "Cauliflower",
    "Celery",
    "Cherry",
    "Citrus",
    "Coffee",
    "Corn",
    "Cucumber",
    "Eggplant",
    "Garlic",
    "Ginger",
    "Grape",
    "Lettuce",
    "Maple",
    "Orange",
    "Peach",
    "Plum",
    "Potato",
    "Raspberry",
    "Rice",
    "Soybean",
    "Squash",
    "Strawberry",
    "Tobacco",
    "Tomato",
    "Wheat",
    "Zucchini",
)

CROP_ALIASES = {
    "pepper bell": "Bell Pepper",
    "bell pepper": "Bell Pepper",
    "corn (maize)": "Corn",
    "maize": "Corn",
    "grapevine": "Grape",
}

NAME_ALIASES = {
    ("Tomato", "bacterial leaf spot"): "Bacterial Spot",
    ("Tomato", "two spotted spider mite"): "Spider Mites",
    ("Corn", "common rust"): "Rust",
    ("Corn", "cercospora leaf spot gray leaf spot"): "Gray Leaf Spot",
    ("Apple", "cedar apple rust"): "Rust",
    ("Grape", "leaf blight isariopsis leaf spot"): "Leaf Spot",
}

JUNK_CLASSES = frozenset(
    {
        "images",
        "image",
        "img",
        "imgs",
        "train",
        "test",
        "val",
        "valid",
        "validation",
        "unknown",
        "others",
        "other",
        "misc",
        "dataset",
    }
)

HEALTHY_WORDS = frozenset({"", "leaf", "leaves", "healthy", "healthy leaf", "normal"})

ACRONYM_PARENS = re.compile(r"\s*\([A-Z]{2,6}\)")
WORD = re.compile(r"[A-Za-z][A-Za-z']*")


@dataclass(frozen=True)
class Canonical:
    kind: str
    crop: str | None
    name: str
    label: str
    key: str


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def title_case(text: str) -> str:
    return WORD.sub(lambda m: m.group().capitalize(), text)


def is_junk(raw: str) -> bool:
    return re.sub(r"[^a-z]+", "", raw.lower()) in JUNK_CLASSES


def _crop_table() -> list[tuple[str, str]]:
    table = {c.lower(): c for c in CROPS}
    table.update(CROP_ALIASES)
    return sorted(table.items(), key=lambda kv: len(kv[0]), reverse=True)


_TABLE = _crop_table()


def normalize_label(raw: str) -> Canonical:
    stripped = re.sub(r"\s+", " ", raw).strip()
    if re.match(r"^pest\s+\S", stripped, re.IGNORECASE):
        name = stripped[4:].strip()
        return Canonical("pest", None, name, f"Pest {name}", f"pest-{slug(name)}")
    text = re.sub(r"\s+", " ", stripped.replace("_", " ").replace("-", " ")).strip()
    low = text.lower()
    crop: str | None = None
    rest = text
    for alias, canon in _TABLE:
        if low == alias or low.startswith(alias + " "):
            crop = canon
            rest = text[len(alias) :].strip()
            break
    cleaned = ACRONYM_PARENS.sub("", rest).strip()
    if crop is not None and cleaned.lower() in HEALTHY_WORDS:
        name = "Healthy"
    else:
        name = title_case(cleaned)
    if crop is not None:
        name = NAME_ALIASES.get((crop, name.lower()), name)
    label = f"{crop} {name}" if crop else name
    kind = "healthy" if name == "Healthy" else "disease"
    return Canonical(kind, crop, name, label, slug(label))
