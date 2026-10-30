import copy
import json
from pathlib import Path

import pytest

from scripts.knowledge import CardError, build, card_chunks, coverage, load_cards, validate_card

GOOD = {
    "id": "potato-late-blight",
    "crop": "Potato",
    "name": "Late Blight",
    "kind": "disease",
    "lang": "en",
    "summary": "A fast spreading disease of potato leaves and tubers that thrives in cool, wet weather.",
    "symptoms": [
        "Dark water soaked patches on leaves.",
        "White fuzzy growth under leaves in humid mornings.",
    ],
    "causes": ["A water mould that spreads by wind and rain splash."],
    "actions": [
        {"text": "Remove and bury badly affected plants away from the field.", "priority": "critical"},
        {
            "text": "Ask your agriculture officer which registered product suits your crop.",
            "priority": "high",
        },
        {"text": "Avoid watering in the evening so leaves dry quickly.", "priority": "normal"},
    ],
    "prevention": ["Plant certified disease free seed tubers.", "Do not leave cull potatoes in piles."],
    "sources": [{"title": "Example extension page", "url": "https://extension.example.edu/late-blight"}],
}


def mutated(**changes):
    card = copy.deepcopy(GOOD)
    card.update(changes)
    return card


def test_good_card_is_valid():
    assert validate_card(GOOD)["id"] == "potato-late-blight"


@pytest.mark.parametrize(
    "bad",
    [
        mutated(id="potato-blight"),
        mutated(kind="weed"),
        mutated(lang="fr"),
        mutated(symptoms=["x"]),
        mutated(summary="Short."),
        mutated(prevention=["Use 5 ml per litre of water every week."]),
        mutated(causes=["Spray mancozeb weekly to stop the spread."]),
        mutated(
            summary="A disease described at https://example.com that spreads very quickly in wet weather."
        ),
        mutated(sources=[{"title": "Plain http", "url": "http://example.com/x"}]),
        mutated(sources=[]),
        mutated(extra="field"),
        mutated(actions=[{"text": "Remove infected plants from the field.", "priority": "normal"}] * 3),
    ],
)
def test_bad_cards_are_rejected(bad):
    with pytest.raises(CardError):
        validate_card(bad)


def test_pest_card_id_uses_pest_prefix():
    card = mutated(
        id="pest-aphids",
        crop="Pest",
        name="aphids",
        kind="pest",
        summary="Small soft insects that suck sap from young leaves and shoots of many crops.",
    )
    assert validate_card(card)["id"] == "pest-aphids"


def write(folder: Path, cards):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "a.jsonl").write_text("\n".join(json.dumps(c) for c in cards) + "\n", encoding="utf-8")


def test_chunks_carry_source_and_filters():
    chunks = card_chunks(validate_card(GOOD))
    assert {c["id"].split(":")[1] for c in chunks} >= {"summary", "symptoms", "actions", "prevention"}
    assert all(c["crop"] == "Potato" and c["disease"] == "Late Blight" for c in chunks)
    assert all(
        c["source"]
        == {"document": "Example extension page", "url": "https://extension.example.edu/late-blight"}
        for c in chunks
    )
    assert all("Potato Late Blight" in c["text"] for c in chunks)


def test_build_writes_cards_and_chunks(tmp_path):
    write(tmp_path / "cards", [GOOD])
    out = tmp_path / "out"
    out.mkdir()
    cards, chunks = build(tmp_path / "cards", out)
    assert cards == 1 and chunks >= 5
    doc = json.loads((out / "cards.json").read_text(encoding="utf-8"))
    assert doc["cards"][0]["id"] == "potato-late-blight"


def test_duplicate_cards_are_rejected(tmp_path):
    write(tmp_path / "cards", [GOOD, GOOD])
    with pytest.raises(CardError):
        load_cards(tmp_path / "cards")


def test_coverage_reports_missing_and_extra(tmp_path):
    write(tmp_path / "cards", [GOOD])
    missing, extra = coverage(
        tmp_path / "cards", ["Potato Late Blight", "Potato Early Blight", "Potato Healthy"]
    )
    assert missing == ["potato-early-blight"]
    assert extra == []
    missing, extra = coverage(tmp_path / "cards", ["Tomato Early Blight"])
    assert missing == ["tomato-early-blight"]
    assert extra == ["potato-late-blight"]


def test_label_field_sets_the_expected_id():
    card = mutated(
        id="pest-dacus-dorsalis-hendel",
        crop="Pest",
        name="Oriental fruit fly",
        kind="pest",
        label="Pest Dacus dorsalis(Hendel)",
        summary="A fruit piercing fly whose maggots ruin mango, guava and many other fruits.",
    )
    assert validate_card(card)["id"] == "pest-dacus-dorsalis-hendel"
    chunks = card_chunks(validate_card(card))
    assert "Dacus dorsalis(Hendel)" in chunks[0]["text"]
    with pytest.raises(CardError):
        validate_card({**card, "id": "pest-oriental-fruit-fly"})
