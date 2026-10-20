from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.sign import keygen, sign_file
BANNED = {
    "version": 1,
    "items": ["Endosulfan", "Monocrotophos"],
    "aliases": ["Thiodan"],
}

DOSAGE = {
    "version": 1,
    "entries": [
        {
            "crop": "tomato",
            "disease": "Early Blight",
            "severity_min": 1,
            "severity_max": 5,
            "product": "Placeholder product",
            "dose_per_ha": 1.0,
            "unit": "kg",
            "notes": "Development placeholder, not agronomic advice",
        }
    ],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".dev"))
    args = parser.parse_args()
    keys = args.out / "keys"
    knowledge = args.out / "knowledge"
    knowledge.mkdir(parents=True, exist_ok=True)
    if not (keys / "release_ed25519.pem").exists():
        keygen(keys)
    (knowledge / "release_ed25519.pub").write_bytes((keys / "release_ed25519.pub").read_bytes())
    for name, doc in (("banned_pesticides.json", BANNED), ("dosage_table.json", DOSAGE)):
        target = knowledge / name
        target.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        sign_file(keys / "release_ed25519.pem", target)
    print(f"development assets written to {knowledge}")
    print("these are placeholders, not agronomy data")


if __name__ == "__main__":
    main()
