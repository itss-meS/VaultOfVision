# Knowledge pack and vetted data

Advice quality depends on three signed or curated inputs. All are supplied by a human and reviewed by an agronomist; the code never invents agronomy.

## 1. Files

| File | Purpose | Format | State |
|---|---|---|---|
| `knowledge/chunks.jsonl` | Sourced text the model may use as context | one JSON object per line | 29 chunks: potato, tomato, rice, grape and 5 pests |
| `knowledge/banned_pesticides.json` + `.sig` | Products that must never appear | `{ "version", "as_on", "items", "aliases", "sources", "notes" }` | Official list, **unsigned until the release key signs it** |
| `knowledge/dosage_table.json` + `.sig` | Vetted doses | `{ "version": n, "entries": [ ... ] }` | 8 entries, **unsigned and awaiting agronomist sign-off** |
| `knowledge/release_ed25519.pub` | Public key that verifies the signed files | PEM | Not in the repo; dev key in `.dev/` |
| `schemas/dosage_table.schema.json` | Schema of the dosage table | JSON Schema 2020-12 | Checked by a test and by `scripts/validate_knowledge.py` |

`chunks.jsonl` line:

```
{"id": "potato-late-blight-001", "crop": "potato", "disease": "Late Blight", "stage": "any", "lang": "en", "region": "any", "text": "...", "source": {"authority": "ICAR", "document": "...", "url": "https://..."}}
```

For a pest chunk, `disease` holds the pest name exactly as it appears after `Pest ` in the scan label, for example `Brown Plant Hopper`.

Dosage entry (disease):

```
{"kind": "disease", "crop": "potato", "disease": "Late Blight", "severity_min": 1, "severity_max": 5, "product": "Mancozeb 75% WG", "dose_per_ha": 1.0, "unit": "kg", "notes": "...", "source": {"authority": "CIBRC", "document": "...", "url": "https://..."}, "checked_by": null}
```

Dosage entry (pest) uses `"kind": "pest"` and `"pest": "Brown Plant Hopper"` in place of `disease`.

Rules:

- `source` is mandatory on every dosage entry. `authority` must be `ICAR`, `SAU`, `State Department of Agriculture` or `CIBRC` (the Central Insecticides Board and Registration Committee registered-use list). The app drops any entry without a valid source when it loads the table, and the validator rejects it.
- Chunk sources may also use `DPPQS` (Directorate of Plant Protection, Quarantine and Storage advisories) or `Peer-reviewed journal`.
- `checked_by` holds the name of the person who checked the entry against its source. It is `null` until that happens. `python -m scripts.validate_knowledge --release` fails while any entry has no name, so run it before signing for release.
- The crop comes from the scan label through `parseLabel` (`ui/web/src/engine/core/labelParse.ts`). A disease label only gets model advice when its crop has rows in the signed table and the disease has a row for that crop. Everything else gets the safe "no vetted data" template with a referral to the extension officer.
- A pest label gets model advice only when the knowledge pack has chunks for that pest. It gets a dose only when the table has a pest row, and only when that pest maps to a single crop in the table.
- A healthy label gets fixed care and prevention tips and no treatment.
- If the model writes any quantity (a number with a weight, volume or per-area unit), the answer is rejected. Only the dosage tool produces quantities.
- Severity ranges are 1 to 5. A disease case outside every range gets "no vetted dosage". Pest rows ignore severity.
- Chunks that mention a banned product are dropped before prompting. A banned product in a dosage entry makes that entry unusable.
- The scanner label for a crop and the crop in the table are both normalised (`maize` is `corn`, `pepper bell` is `bell pepper`), so one spelling per crop is enough in the table.

## 2. Signing

```
python -m scripts.sign keygen --out <dir>
python -m scripts.sign sign --key <offline key> knowledge\banned_pesticides.json
python -m scripts.sign sign --key <offline key> knowledge\dosage_table.json
```

The signature is a hex Ed25519 signature in a `.sig` file next to the data. The app refuses to advise if verification fails. Keep the private key offline and backed up in two places; never commit it (`KEY_ROTATION.md`).

## 3. Where the content comes from

- Banned list: the official Government of India list. `banned_pesticides.json` holds the 46 pesticides in Annexure-I of Rajya Sabha Unstarred Question 2562 (answered 11.08.2023, list as on 01.06.2023) plus Dicofol, Dinocap and Methomyl added by S.O. 4294(E) of 03.10.2023, which makes 49. It also blocks Captafol, Carbofuran and Nicotin Sulfate (banned for use or in some formulations) and Monocrotophos (banned on vegetables). The list was read from a copy of the parliamentary reply and from a trade site that reproduces the Directorate list effective 31.03.2024. Before signing, a person must compare it with the current list on ppqs.gov.in.
- Dosage: registered label claims from the CIB&RC "Major Uses of Pesticides" tables and the Directorate advisories that reproduce the Registration Committee approved lists. No dose comes from a language model. Where a source gave a range of doses, or where the text I could read was inconsistent, the crop and disease were left out instead of choosing a number (see the next batch).
- Advisory text: TNAU Agritech Portal, ICAR institute articles, Directorate advisories and two Indian journal articles, paraphrased into short chunks with the source in every record.

Candidate source for the next batches: the IndiaAI platform AIKosh (aikosh.indiaai.gov.in). Its catalogue loads in a browser and individual listings could not be read, so licences and file formats are unconfirmed. Check each licence before redistributing text inside an app.

## 4. Importer (not written yet)

Planned script: read PDF, CSV, JSON or text files from `data\knowledge_raw\`, split into chunks of a few hundred words, tag crop, disease and language, drop banned-product text and write `knowledge/chunks.jsonl`. It needs a sample of each source format before it can be written.

## 5. Multi-crop: what is done and the next batch

Done in this batch: potato, tomato, rice and grape (diseases) and five pests with chunks (Brown Plant Hopper, Rice Leaf Roller, Yellow Rice Borer, Aphids, Thrips). Only Brown Plant Hopper has a dose row. Aphids and thrips attack many crops, so they have no dose row until a crop is chosen.

Gaps to close in the next batch, in this order:

1. Maize (corn). The CIB&RC table lists Mancozeb and Zineb for maize leaf blight only as a dose range of 1.5 to 2 kg per hectare, and the table format holds one number per entry. Either extend the format with a minimum and maximum or use a state agricultural university recommendation with a single dose. Corn Northern Leaf Blight, Gray Leaf Spot, Common Rust and Smut also need chunks.
2. Wheat, cotton, soybean, chilli, brinjal (eggplant), cabbage, cauliflower, banana, citrus: collect CIB&RC rows and chunks the same way.
3. Grape Black Rot, Grape Leaf Spot and Grapevine Leafroll Disease: no CIB&RC grape row exists for them in the 2012 table, so they correctly return the safe template.
4. Tomato Late Blight, Rice Sheath Blight and Potato Early Blight chunks: dose rows exist, the descriptive chunks still need a source.
5. Pests: Army Worm, Corn Borer, Cutworms, Spider Mites, Asiatic Rice Borer, White Backed Plant Hopper and the other IP102 insects. Pest labels carry no crop, so a dose is only given when the table maps the pest to one crop.
6. Refresh every dose row against the newest CIB&RC document (the fungicide table used here is as on 30.09.2012). Registrations change.
7. Add Hindi, Marathi and Telugu chunks.

Label problems to fix in the scanner label list: the entry `images` is not a crop label and parses with no crop; `bell pepper bacterial spot` and `Pepper bell Bacterial Spot` are the same class under two spellings; `apple black rot` has no matching `Healthy` class.

## 6. Dev assets

`python -m scripts.make_dev_assets` copies the real `knowledge/banned_pesticides.json` and `knowledge/dosage_table.json` into `.dev/knowledge`, creates a local development key and signs the copies. The app then runs on the real data in development. These signatures come from a local development key, not the release key, and must never ship.

## 7. Checks before release

```
python -m scripts.validate_knowledge --release
python -m scripts.sign sign --key <offline key> knowledge/banned_pesticides.json
python -m scripts.sign sign --key <offline key> knowledge/dosage_table.json
```

Signing must be the last step: any later edit to a data file invalidates its `.sig`.
