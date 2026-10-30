from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from scripts.train.labels import normalize_label

KINDS = ("disease", "pest")
LANGS = ("en", "hi", "mr", "te")
PRIORITIES = ("critical", "high", "normal")
SECTIONS = ("summary", "symptoms", "causes", "actions", "prevention", "help")

DOSE = re.compile(
    r"\b\d+(?:[.,]\d+)?\s*(?:ml|mL|l|L|g|gm|kg|mg|oz|lb|gal|ppm|litre|litres|liter|liters|gram|grams|"
    r"tsp|tbsp|cc)\b"
)
EMOJI = re.compile("[\U0001f300-\U0001faff☀-➿]")
MARKUP = re.compile(r"<[^>]+>|https?://|www\.", re.IGNORECASE)

PRODUCTS = (
    "mancozeb",
    "chlorothalonil",
    "copper",
    "bordeaux",
    "carbendazim",
    "thiophanate",
    "benomyl",
    "azoxystrobin",
    "trifloxystrobin",
    "pyraclostrobin",
    "metalaxyl",
    "mefenoxam",
    "propiconazole",
    "tebuconazole",
    "hexaconazole",
    "difenoconazole",
    "myclobutanil",
    "captan",
    "folpet",
    "ziram",
    "zineb",
    "maneb",
    "sulphur",
    "sulfur",
    "streptomycin",
    "kasugamycin",
    "validamycin",
    "tricyclazole",
    "isoprothiolane",
    "fosetyl",
    "cymoxanil",
    "dimethomorph",
    "imidacloprid",
    "thiamethoxam",
    "acetamiprid",
    "clothianidin",
    "cypermethrin",
    "deltamethrin",
    "permethrin",
    "lambda cyhalothrin",
    "chlorpyrifos",
    "malathion",
    "dimethoate",
    "monocrotophos",
    "endosulfan",
    "profenofos",
    "quinalphos",
    "acephate",
    "fipronil",
    "spinosad",
    "emamectin",
    "abamectin",
    "chlorantraniliprole",
    "flubendiamide",
    "carbofuran",
    "phorate",
    "neem oil",
    "azadirachtin",
    "pyrethrin",
    "trichoderma",
    "beauveria",
    "metarhizium",
    "glyphosate",
    "paraquat",
    "2,4-d",
    "kerosene",
)

LIMITS = {
    "summary": (30, 420),
    "symptom": (8, 200),
    "cause": (8, 220),
    "action": (10, 260),
    "prevention": (8, 220),
    "help": (10, 220),
    "title": (3, 140),
}

REQUIRED = (
    "id",
    "crop",
    "name",
    "kind",
    "lang",
    "summary",
    "symptoms",
    "causes",
    "actions",
    "prevention",
    "sources",
)
OPTIONAL = ("help", "label")


class CardError(ValueError):
    pass


def _text(value: object, where: str, lo: int, hi: int) -> str:
    if not isinstance(value, str):
        raise CardError(f"{where}: expected text")
    cleaned = value.strip()
    if not lo <= len(cleaned) <= hi:
        raise CardError(f"{where}: length {len(cleaned)} is outside {lo}-{hi}")
    if MARKUP.search(cleaned):
        raise CardError(f"{where}: markup or links are not allowed")
    if EMOJI.search(cleaned):
        raise CardError(f"{where}: emoji are not allowed")
    if DOSE.search(cleaned):
        raise CardError(f"{where}: quantities are not allowed, doses come from the signed table")
    low = cleaned.lower()
    for product in PRODUCTS:
        if re.search(rf"(?<![a-z]){re.escape(product)}(?![a-z])", low):
            raise CardError(f"{where}: product or chemical name {product!r} is not allowed")
    return cleaned


def _list(value: object, where: str, lo: int, hi: int, limits: tuple[int, int]) -> list[str]:
    if not isinstance(value, list) or not lo <= len(value) <= hi:
        raise CardError(f"{where}: expected {lo}-{hi} items")
    return [_text(v, f"{where}[{i}]", *limits) for i, v in enumerate(value)]


def expected_id(crop: str, name: str, kind: str) -> str:
    if kind == "pest":
        return normalize_label(f"Pest {name}").key
    return normalize_label(f"{crop} {name}").key


def validate_card(card: object) -> dict[str, object]:
    if not isinstance(card, dict):
        raise CardError("card must be an object")
    unknown = set(card) - set(REQUIRED) - set(OPTIONAL)
    if unknown:
        raise CardError(f"unknown fields {sorted(unknown)}")
    for key in REQUIRED:
        if key not in card:
            raise CardError(f"missing field {key}")
    kind = card["kind"]
    lang = card["lang"]
    if kind not in KINDS:
        raise CardError(f"kind must be one of {KINDS}")
    if lang not in LANGS:
        raise CardError(f"lang must be one of {LANGS}")
    crop = _text(card["crop"], "crop", 3, 40)
    name = _text(card["name"], "name", 3, 80)
    cid = card["id"]
    label = card.get("label")
    if label is not None:
        label = _text(label, "label", 3, 120)
        want = normalize_label(label).key
    else:
        want = expected_id(crop, name, str(kind))
    if not isinstance(cid, str) or cid != want:
        raise CardError(f"id {cid!r} must be {want!r}")
    out: dict[str, object] = {
        "id": cid,
        "crop": crop,
        "name": name,
        "kind": kind,
        "lang": lang,
        "summary": _text(card["summary"], "summary", *LIMITS["summary"]),
        "symptoms": _list(card["symptoms"], "symptoms", 2, 6, LIMITS["symptom"]),
        "causes": _list(card["causes"], "causes", 1, 4, LIMITS["cause"]),
        "prevention": _list(card["prevention"], "prevention", 2, 6, LIMITS["prevention"]),
    }
    actions = card["actions"]
    if not isinstance(actions, list) or not 3 <= len(actions) <= 7:
        raise CardError("actions: expected 3-7 items")
    clean_actions: list[dict[str, str]] = []
    for i, item in enumerate(actions):
        if not isinstance(item, dict) or set(item) != {"text", "priority"}:
            raise CardError(f"actions[{i}]: expected text and priority")
        if item["priority"] not in PRIORITIES:
            raise CardError(f"actions[{i}]: priority must be one of {PRIORITIES}")
        clean_actions.append(
            {
                "text": _text(item["text"], f"actions[{i}].text", *LIMITS["action"]),
                "priority": str(item["priority"]),
            }
        )
    if not any(a["priority"] in ("critical", "high") for a in clean_actions):
        raise CardError("actions: at least one must be critical or high")
    out["actions"] = clean_actions
    sources = card["sources"]
    if not isinstance(sources, list) or not 1 <= len(sources) <= 4:
        raise CardError("sources: expected 1-4 items")
    clean_sources: list[dict[str, str]] = []
    for i, src in enumerate(sources):
        if not isinstance(src, dict) or set(src) != {"title", "url"}:
            raise CardError(f"sources[{i}]: expected title and url")
        url = src["url"]
        if not isinstance(url, str) or not re.fullmatch(r"https://[^\s]+\.[^\s]+", url):
            raise CardError(f"sources[{i}]: url must be https")
        title = src["title"]
        if not isinstance(title, str) or not 3 <= len(title.strip()) <= 140:
            raise CardError(f"sources[{i}]: title length")
        clean_sources.append({"title": title.strip(), "url": url})
    out["sources"] = clean_sources
    if "help" in card:
        out["help"] = _text(card["help"], "help", *LIMITS["help"])
    if label is not None:
        out["label"] = label
    return out


def load_cards(folder: Path) -> list[dict[str, object]]:
    cards: list[dict[str, object]] = []
    seen: set[tuple[str, str]] = set()
    for path in sorted(folder.glob("*.jsonl")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip():
                continue
            try:
                card = validate_card(json.loads(line))
            except (json.JSONDecodeError, CardError) as exc:
                raise CardError(f"{path.name}:{number}: {exc}") from exc
            marker = (str(card["id"]), str(card["lang"]))
            if marker in seen:
                raise CardError(f"{path.name}:{number}: duplicate card {marker}")
            seen.add(marker)
            cards.append(card)
    return cards


def card_chunks(card: dict[str, object]) -> list[dict[str, str]]:
    crop = str(card["crop"])
    name = str(card["name"])
    head = name if card["kind"] == "pest" else f"{crop} {name}"
    label = card.get("label")
    if isinstance(label, str):
        tail = re.sub(r"^pest\s+", "", label, flags=re.IGNORECASE)
        if tail.lower() not in head.lower():
            head = f"{head} ({tail})"
    sources = card["sources"]
    first = sources[0]["title"] if isinstance(sources, list) and sources else ""
    parts: list[tuple[str, str]] = [("summary", f"{head}. {card['summary']}")]
    symptoms = card["symptoms"]
    causes = card["causes"]
    actions = card["actions"]
    prevention = card["prevention"]
    if isinstance(symptoms, list):
        parts.append(("symptoms", f"{head} symptoms: " + " ".join(str(s) for s in symptoms)))
    if isinstance(causes, list):
        parts.append(("causes", f"{head} causes and spread: " + " ".join(str(s) for s in causes)))
    if isinstance(actions, list):
        parts.append(
            (
                "actions",
                f"{head} what to do, treatment and control: "
                + " ".join(str(a["text"]) for a in actions if isinstance(a, dict)),
            )
        )
    if isinstance(prevention, list):
        parts.append(("prevention", f"{head} prevention: " + " ".join(str(s) for s in prevention)))
    if "help" in card:
        parts.append(("help", f"{head} when to get help: {card['help']}"))
    return [
        {
            "id": f"{card['id']}:{section}",
            "text": text,
            "crop": crop,
            "disease": name,
            "stage": "any",
            "lang": str(card["lang"]),
            "region": "any",
            "source": first,
        }
        for section, text in parts
    ]


def build(folder: Path, out: Path) -> tuple[int, int]:
    cards = load_cards(folder)
    if not cards:
        raise CardError("no cards found")
    cards.sort(key=lambda c: (str(c["id"]), str(c["lang"])))
    doc = {"version": 1, "cards": cards}
    (out / "cards.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    lines = [json.dumps(chunk, ensure_ascii=False) for card in cards for chunk in card_chunks(card)]
    (out / "chunks.jsonl").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(cards), len(lines)


def label_keys(labels: list[str]) -> dict[str, str]:
    keys: dict[str, str] = {}
    for raw in labels:
        parsed = normalize_label(raw)
        if parsed.kind == "healthy":
            continue
        keys.setdefault(parsed.key, parsed.label)
    return keys


def coverage(folder: Path, labels: list[str]) -> tuple[list[str], list[str]]:
    have = {str(c["id"]) for c in load_cards(folder) if c["lang"] == "en"}
    want = label_keys(labels)
    missing = sorted(k for k in want if k not in have)
    extra = sorted(k for k in have if k not in want)
    return missing, extra


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["validate", "build", "coverage"])
    p.add_argument("--cards", type=Path, default=Path("knowledge/cards"))
    p.add_argument("--out", type=Path, default=Path("knowledge"))
    p.add_argument("--labels", type=Path, default=Path("models/all-crops/labels.json"))
    a = p.parse_args()
    try:
        if a.command == "validate":
            print(f"{len(load_cards(a.cards))} cards valid")
        elif a.command == "build":
            cards, chunks = build(a.cards, a.out)
            print(f"wrote {cards} cards and {chunks} chunks to {a.out}")
        else:
            labels = json.loads(a.labels.read_text(encoding="utf-8"))
            missing, extra = coverage(a.cards, labels)
            print(f"missing cards: {len(missing)}")
            for key in missing:
                print(f"  {key}")
            print(f"cards without a matching label: {len(extra)}")
            for key in extra:
                print(f"  {key}")
    except CardError as exc:
        sys.exit(f"knowledge problem: {exc}")


if __name__ == "__main__":
    main()
