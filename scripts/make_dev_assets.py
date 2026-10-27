from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from scripts.sign import keygen, sign_file

ROOT = Path(__file__).resolve().parent.parent
SIGNED = ("banned_pesticides.json", "dosage_table.json")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path(".dev"))
    parser.add_argument("--source", type=Path, default=ROOT / "knowledge")
    args = parser.parse_args()
    for name in SIGNED:
        if not (args.source / name).is_file():
            raise SystemExit(f"missing {args.source / name}")
    keys = args.out / "keys"
    knowledge = args.out / "knowledge"
    knowledge.mkdir(parents=True, exist_ok=True)
    if not (keys / "release_ed25519.pem").exists():
        keygen(keys)
    (knowledge / "release_ed25519.pub").write_bytes((keys / "release_ed25519.pub").read_bytes())
    for name in SIGNED:
        target = knowledge / name
        shutil.copyfile(args.source / name, target)
        sign_file(keys / "release_ed25519.pem", target)
    print(f"development assets written to {knowledge}")
    print("signed with a local development key, not the release key")


if __name__ == "__main__":
    main()
