# Knowledge pack

Place human-supplied, agronomist-reviewed files here:

- `chunks.jsonl`: one `{id, crop, disease, stage, lang, region, text}` object per line
- `banned_pesticides.json` and `.sig`: official banned list, `{"version": n, "items": [...], "aliases": [...]}`
- `dosage_table.json` and `.sig`: vetted rows `{crop, disease, severity_min, severity_max, product, dose_per_ha, unit, notes}`
- `release_ed25519.pub`: public key that verifies the signed files

Sign with `python -m scripts.sign sign --key <offline key> <file>`. The backend and the app refuse to run if a signature does not verify.

Formats, sources, signing and the importer plan: `docs/KNOWLEDGE.md`.
