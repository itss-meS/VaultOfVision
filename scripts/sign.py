from __future__ import annotations

import argparse
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def keygen(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True, mode=0o700)
    private = Ed25519PrivateKey.generate()
    priv_path = out / "release_ed25519.pem"
    with priv_path.open("xb") as fh:
        fh.write(
            private.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
    priv_path.chmod(0o600)
    (out / "release_ed25519.pub").write_bytes(
        private.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        )
    )
    print(f"wrote {priv_path} (keep offline, back up twice) and the public key")


def sign_file(key: Path, target: Path) -> None:
    loaded = serialization.load_pem_private_key(key.read_bytes(), password=None)
    if not isinstance(loaded, Ed25519PrivateKey):
        raise SystemExit("key must be Ed25519")
    signature = loaded.sign(target.read_bytes())
    Path(f"{target}.sig").write_text(signature.hex(), encoding="utf-8")
    print(f"wrote {target}.sig")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("keygen")
    g.add_argument("--out", type=Path, required=True)
    s = sub.add_parser("sign")
    s.add_argument("--key", type=Path, required=True)
    s.add_argument("file", type=Path)
    args = parser.parse_args()
    if args.cmd == "keygen":
        keygen(args.out)
    else:
        sign_file(args.key, args.file)


if __name__ == "__main__":
    main()
