from __future__ import annotations

import ast
import io
import sys
import tokenize
from pathlib import Path

SKIP_DIRS = {
    "node_modules",
    "dist",
    ".git",
    ".venv",
    "__pycache__",
    ".dev",
    "android",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
}
JS_EXT = {".ts", ".tsx", ".js", ".mjs", ".cjs"}
HASH_EXT = {".yaml", ".yml", ".sh", ".toml", ".gitignore", ".cfg", ".ini"}


def py_findings(path: Path) -> list[int]:
    src = path.read_text(encoding="utf-8")
    lines: list[int] = []
    for tok in tokenize.generate_tokens(io.StringIO(src).readline):
        if tok.type == tokenize.COMMENT:
            lines.append(tok.start[0])
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            body = node.body
            if (
                body
                and isinstance(body[0], ast.Expr)
                and isinstance(body[0].value, ast.Constant)
                and isinstance(body[0].value.value, str)
            ):
                lines.append(body[0].lineno)
    return lines


def js_findings(path: Path) -> list[int]:
    s = path.read_text(encoding="utf-8")
    i, n, line = 0, len(s), 1
    found: list[int] = []
    quote = ""
    while i < n:
        c = s[i]
        if c == "\n":
            line += 1
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = ""
        elif c in "'\"`":
            quote = c
        elif c == "/" and i + 1 < n and s[i + 1] in "/*":
            found.append(line)
            if s[i + 1] == "/":
                while i < n and s[i] != "\n":
                    i += 1
                continue
            end = s.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        i += 1
    return found


def hash_findings(path: Path) -> list[int]:
    found: list[int] = []
    for idx, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        quote = ""
        prev = " "
        for ch in raw:
            if quote:
                if ch == quote:
                    quote = ""
            elif ch in "'\"":
                quote = ch
            elif ch == "#" and prev in " \t":
                found.append(idx)
                break
            prev = ch
    return found


def css_findings(path: Path) -> list[int]:
    return [i for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1) if "/*" in line]


def html_findings(path: Path) -> list[int]:
    return [i for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1) if "<!--" in line]


def scan(root: Path) -> list[tuple[Path, int]]:
    out: list[tuple[Path, int]] = []
    for path in sorted(root.rglob("*")):
        parts = path.relative_to(root).parts
        if (
            not path.is_file()
            or any(part in SKIP_DIRS for part in parts)
            or parts[:3] == ("ui", "android", "android")
        ):
            continue
        ext = path.suffix if path.suffix else path.name
        if ext == ".py":
            lines = py_findings(path)
        elif ext in JS_EXT:
            lines = js_findings(path)
        elif ext in HASH_EXT:
            lines = hash_findings(path)
        elif ext == ".css":
            lines = css_findings(path)
        elif ext == ".html":
            lines = html_findings(path)
        else:
            continue
        out.extend((path, ln) for ln in lines)
    return out


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    findings = scan(root)
    for path, line in findings:
        print(f"{path.relative_to(root)}:{line}: comment or docstring")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
