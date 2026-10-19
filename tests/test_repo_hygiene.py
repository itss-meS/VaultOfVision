from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from scripts.check_no_comments import scan

ROOT = Path(__file__).resolve().parent.parent


def test_repo_has_no_code_comments() -> None:
    assert scan(ROOT) == []


def test_checker_detects_comments(tmp_path: Path) -> None:
    (tmp_path / "a.py").write_text("x = 1  # hi\n")
    (tmp_path / "b.py").write_text('def f():\n    """doc"""\n    return 1\n')
    (tmp_path / "c.ts").write_text("const a = 'http://x'; // c\n")
    (tmp_path / "d.yml").write_text("a: 1 # c\n")
    (tmp_path / "e.css").write_text("/* c */\n")
    (tmp_path / "f.ts").write_text("const a = '// not a comment';\n")
    (tmp_path / "g.yml").write_text("a: 'x # y'\n")
    flagged = {p.name for p, _ in scan(tmp_path)}
    assert flagged == {"a.py", "b.py", "c.ts", "d.yml", "e.css"}


def test_signing_roundtrip(tmp_path: Path) -> None:
    target = tmp_path / "list.json"
    target.write_text('{"version": 1, "items": ["x"]}')
    run = [sys.executable, "-m", "scripts.sign"]
    subprocess.run([*run, "keygen", "--out", str(tmp_path / "k")], cwd=ROOT, check=True, capture_output=True)
    subprocess.run(
        [*run, "sign", "--key", str(tmp_path / "k" / "release_ed25519.pem"), str(target)],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    assert (tmp_path / "list.json.sig").read_text().strip() != ""


def test_dev_assets_are_signed(tmp_path: Path) -> None:
    subprocess.run(
        [sys.executable, "-m", "scripts.make_dev_assets", "--out", str(tmp_path)],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    for name in ("banned_pesticides.json", "dosage_table.json", "release_ed25519.pub"):
        assert (tmp_path / "knowledge" / name).is_file()
    assert (tmp_path / "knowledge" / "banned_pesticides.json.sig").read_text().strip() != ""
