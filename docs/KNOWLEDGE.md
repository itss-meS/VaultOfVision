# Knowledge pack and vetted data

Advice quality depends on three signed or curated inputs. All are supplied by a human and reviewed by an agronomist; the code never invents agronomy.

## 1. Files

| File | Purpose | Format | State |
|---|---|---|---|
| `knowledge/chunks.jsonl` | Text the model may use as context | one JSON object per line | Empty |
| `banned_pesticides.json` + `.sig` | Products that must never appear | `{ "version": n, "items": [...], "aliases": [...] }` | Placeholder from `make_dev_assets` only |
| `dosage_table.json` + `.sig` | Vetted doses | `{ "version": n, "entries": [ ... ] }` | Placeholder from `make_dev_assets` only |
| `release_ed25519.pub` | Public key that verifies the signed files | PEM | Dev key in `.dev\` |

`chunks.jsonl` line:

```
{"id": "tomato-early-blight-001", "crop": "tomato", "disease": "Early Blight", "stage": "any", "lang": "en", "region": "any", "text": "..."}
```

Dosage entry:

```
{"crop": "tomato", "disease": "Early Blight", "severity_min": 2, "severity_max": 4, "product": "...", "dose_per_ha": 2.5, "unit": "kg", "notes": "..."}
```

Rules:

- `disease` must match the vision label (case-insensitive) for retrieval filtering and dosage lookup.
- Severity ranges are 1 to 5. A case outside every range gets "no vetted dosage".
- Chunks that mention a banned product are dropped before prompting.
- A banned product in a dosage entry makes that entry unusable.

## 2. Signing

```
python -m scripts.sign keygen --out <dir>
python -m scripts.sign sign --key <offline key> knowledge\banned_pesticides.json
python -m scripts.sign sign --key <offline key> knowledge\dosage_table.json
```

The signature is a hex Ed25519 signature in a `.sig` file next to the data. The app refuses to advise if verification fails. Keep the private key offline and backed up in two places; never commit it (`KEY_ROTATION.md`).

## 3. Where the content should come from

- Banned list: the official list from the Government of India (Central Insecticides Board and Registration Committee) and state notices, maintained by a person.
- Dosage: registered label claims and state agricultural university recommendations, checked by an agronomist. No number from a language model.
- Advisory text: package-of-practices guides, ICAR and state university advisories, and question-and-answer records, ideally in English, Hindi and Marathi.

Candidate source: the IndiaAI platform AIKosh (aikosh.indiaai.gov.in), which lists government datasets across sectors including agriculture. Its catalogue loads in a browser and I could not read individual listings, so licences and file formats are unconfirmed. Suggested searches: crop disease, plant disease, pest management, package of practices, crop advisory, Kisan, ICAR, agriculture Hindi, agriculture Marathi. Download into `data\knowledge_raw\` with a `SOURCES.txt` listing each dataset name, link and licence. Check each licence before redistributing the text inside an app.

## 4. Importer (not written yet)

Planned script: read PDF, CSV, JSON or text files from `data\knowledge_raw\`, split into chunks of a few hundred words, tag crop, disease and language, drop banned-product text and write `knowledge/chunks.jsonl`. It needs a sample of each source format before it can be written.

## 5. Multi-crop

Retrieval and dosage already filter by crop and disease; what is missing is data for crops beyond tomato and code that derives the crop from the vision label (`DECISIONS.md`). Crops without a vetted dosage entry correctly show "ask your extension officer" while still giving grounded general advice.

## 6. Dev placeholders

`python -m scripts.make_dev_assets` writes a synthetic signed banned list (it includes Endosulfan), a dummy dosage entry and a development key under `.dev\knowledge`. These exist only so the pipeline runs; they are not agronomy data and must be replaced before real use.
