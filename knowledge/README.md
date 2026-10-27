# Knowledge pack

Human-supplied, agronomist-reviewed files live here:

- `chunks.jsonl`: one `{id, crop, disease, stage, lang, region, text, source}` object per line
- `banned_pesticides.json` and `.sig`: official banned list, `{"version": n, "items": [...], "aliases": [...], "sources": [...]}`
- `dosage_table.json` and `.sig`: vetted rows `{kind, crop, disease or pest, severity_min, severity_max, product, dose_per_ha, unit, notes, source, checked_by}`
- `release_ed25519.pub`: public key that verifies the signed files (not committed with the data until the release key exists)

Every dosage entry and every chunk carries a real `source`. Check the files with `python -m scripts.validate_knowledge` and sign with `python -m scripts.sign sign --key <offline key> <file>`. The backend and the app refuse to run if a signature does not verify. Never commit the private key.

Formats, sources, signing and the next batch of crops: `docs/KNOWLEDGE.md`.
