# AgriEdge-Copilot (PlantAI) — Master Prompt for the Build LLM

You are a senior engineer (embedded AI, backend, frontend and security) building **AgriEdge-Copilot**, an offline crop-advisory product that runs on **Raspberry Pi 5 (with and without a Hailo NPU)** and **Android**. Read this whole file, then start work as described in Section 12.

---

## 1. Files you have been given (read in this order)

| # | File | Role |
|---|---|---|
| 1 | `PlantAI_formatted.docx` | Original architecture ("AgriEdge-Copilot", Applied AI on SoC 2nd Edition). Source of ideas, not the final word. |
| 2 | `Thought_for_51s.docx` | Later decisions: 1B model first, plug-and-play ports and adapters, React + TypeScript UI, Capacitor for Android, 6-week phased plan. |
| 3 | `AgriEdge_MASTER_PROMPT.md` | This file. Your instructions and rules. |
| 4 | `AgriEdge_WhitePaper.md` | **The authoritative specification.** It reconciles files 1 and 2 and adds the security architecture. Start building from it. |

**Precedence when documents disagree:** White paper > this prompt > `Thought_for_51s.docx` > `PlantAI_formatted.docx`. If you find a conflict the white paper does not resolve, choose the safer option, write the decision in `docs/DECISIONS.md`, and continue. Ask the human only for the blockers listed in Section 11.

---

## 2. Product in one paragraph

A farmer photographs a tomato leaf and asks a question by voice or text. Offline, the device detects the disease or pest (YOLO segmentation), estimates severity from mask area, retrieves local knowledge (RAG), has Llama 3.2 1B produce a **strict JSON** advisory in Hindi, Marathi or English, computes dosage with **deterministic code**, validates everything against a rule engine (banned pesticides) and a JSON schema, then shows an advisory card and speaks it. No internet is needed at runtime.

---

## 3. Frozen decisions (do not reopen)

- **Crop:** tomato only (first release). **Languages:** English, Hindi, Marathi.
- **LLM:** Llama 3.2 1B Instruct INT4 via ExecuTorch (XNNPACK). 3B is optional and only if measured memory and speed allow.
- **Vision:** YOLO11n-seg (or YOLOv8n-seg). Hailo `.hef` for Pi+Hailo; CPU model (ExecuTorch or ONNX Runtime) for Android and the no-Hailo fallback.
- **Severity v1:** infected mask area ÷ leaf area → levels 1–5. No extra model.
- **Confidence gate:** below threshold, ask the user to retake the photo; never guess.
- **Architecture:** ports and adapters. Interfaces: `VisionBackend`, `LLMBackend`, `AudioBackend`, `Retriever`. Adapters are chosen from YAML (`rpi5_hailo`, `rpi5_cpu`, `android`).
- **Core language:** Python on the Pi first; re-implement the thin core in Kotlin for Android later, following the same interfaces and JSON schemas. (This supersedes "no Python in src/" from file 1.)
- **UI:** React + TypeScript + Vite + Tailwind + i18next, all assets bundled locally (no CDN). Talks only to an `EngineClient` interface (`HttpEngineClient` on Pi; `NativeEngineClient` via Capacitor on Android).
- **Backend (Pi):** FastAPI + Pydantic. **Storage:** SQLite with SQLCipher.
- **Build order:** Pi first, Android second. If behind, cut in this order: Android port, fine-tuning, tracking, OTA demo.
- **LLM never does math.** The model emits a `tool_call`; code calculates dosage.

---

## 4. Non-negotiable safety rules

1. A banned pesticide must never appear in output. The rule engine checks **before** retrieval/generation and **after** generation, using a separate signed banned-list file. Rule engine has the final say.
2. LLM output is untrusted. It must validate against `advisory_v3` JSON schema. On failure: retry at most twice, then return a templated safe answer.
3. Retrieved text, user text, photos, audio, knowledge packs and update bundles are untrusted inputs.
4. Dosage values come only from deterministic tools using vetted tables. If a table entry is missing, say so; do not invent a number.
5. If confidence is low or crop is unsupported, say so plainly and ask for another photo or refer to an extension officer.
6. Never present numbers in the white paper as achieved results. Every metric is a target until you measure it.

---

## 5. Security requirements (build them in from Phase 0, not at the end)

Implement the following controls. Status: **Add** = implement as stated, **Adapted** = implement in the offline-appropriate form, **Equivalent** = implement the substitute control. Details are in white paper Section 11.3.

| # | Control | Status | What you must implement |
|---|---|---|---|
| 1 | SQL injection | Add | Parameterized queries only; no string-built SQL (including FTS5 queries); Semgrep/Bandit rule in CI. |
| 2 | XSS | Add | React default escaping; ban `dangerouslySetInnerHTML` by lint; render LLM output as plain text or sanitize; strict CSP; no inline scripts. |
| 3 | CSRF | Adapted | Cookie sessions on Pi: `SameSite=Strict` + CSRF token + `Origin`/`Host` validation. Header-token auth: Origin checks only. |
| 4 | File upload validation | Add | Size and dimension caps, magic-byte allow-list (JPEG/PNG/WebP), decode and re-encode with Pillow, strip EXIF/GPS, random filenames, no executable paths. Same discipline for update bundles and knowledge packs (verify signature first). |
| 5 | BOLA | Add | Every case/profile lookup checks `profile_id` ownership; UUIDv4 IDs; negative tests for cross-profile access. |
| 6 | Rate limiting | Add | Per-client limits; LLM endpoint single-flight queue; session lockout with backoff; upload caps. |
| 7 | JWT secrets | Adapted | Per-device random key generated at provisioning, stored in keyring/TEE/Keystore (never in repo); EdDSA preferred; ~15 min expiry; algorithm allow-list; validate `iss/aud/exp`; rotation doc. |
| 8 | API secrets server side | Add | No secret in UI bundle, APK or repo; gitleaks pre-commit + CI. |
| 9 | Password hashing | Adapted | Argon2id with per-user salt for officer/admin and optional profile PIN; attempt limits; no secrets in logs. |
| 10 | MFA | Scoped | Required for officer/admin dashboard (TOTP or hardware key); not for farmers (device-bound PIN). Document MFA requirement for repo and signing-key holders. |
| 11 | CORS | Add | Same-origin on Pi (CORS off); Capacitor allow-list only; never `*`, never reflect Origin. |
| 12 | Tokens out of local storage | Add | Pi: `HttpOnly; Secure; SameSite=Strict` cookie. Android: Keystore-backed secure storage. UI code never reads or stores tokens in `localStorage`/`sessionStorage`. |
| 13 | Server-side permissions | Add | Roles `farmer`, `champion`, `officer`, `admin`; deny by default; policy checks in FastAPI dependencies and the Android plugin; tests for role × route. |
| 14 | Row-level security | Equivalent | SQLite has no RLS: use profile-scoped repository functions. Add a comment/ADR: enable RLS on every table if Postgres/Supabase is ever introduced. |
| 15 | Webhook signatures | Equivalent | No webhooks. Verify Ed25519 signatures on OTA manifests and knowledge packs; if any callback is later added, HMAC-SHA256 + timestamp + replay protection + constant-time compare. |
| 16 | SSRF | Add | No user-supplied URLs accepted; outbound only to a fixed allow-list; block private/loopback/link-local ranges; disable redirects; LLM tools are local pure functions with **no network access**. |
| 17 | Source maps | Add | Vite `build.sourcemap: false` in production; CI fails if any `*.map` is in `dist/` or APK assets; R8/ProGuard on Android release. |
| 18 | Default credentials | Add | No default OS, hotspot, SSH or admin credentials: provisioning script generates unique ones; SSH key-only; first-boot wizard. Document the physical steps for the human (Section 11). |
| 19 | Sensitive data in logs | Add | Structured logging with redaction filter; never log images, audio, transcripts, GPS, names, tokens or personal prompts; debug off in production; tests assert redaction. |
| 20 | Dependencies | Add | Lockfiles; `pip-audit`, `npm audit`, `osv-scanner`, Trivy; Dependabot/Renovate config; CycloneDX SBOM per release; pinned ExecuTorch/HailoRT versions upgraded deliberately. |

Extra controls: bind the backend to `127.0.0.1` by default (hotspot exposure is opt-in and authenticated); SQLCipher for local data; images processed in memory and not stored (optional encrypted thumbnail on opt-in); signed Ed25519 manifests for OTA and knowledge packs with rollback protection; prompt-injection test suite (30+ cases); consent screen and delete-my-data function.

Deliver security evidence in `security/CONTROLS.md`: one row per control, with the file, test and CI job that proves it.

---

## 6. Repository layout to create

```
agriedge/
  core/            # orchestrator, rules, tools, prompts, schemas, policy
  interfaces/      # VisionBackend, LLMBackend, AudioBackend, Retriever
  adapters/        # hailo, executorch_linux, executorch_android, piper, whisper_cpp, android_audio, faiss
  backend/         # FastAPI app, auth, rate limiting, middleware
  models/          # git-ignored; fetched by scripts
  knowledge/       # chunks, index, signed manifests
  ui/web/          # React + TypeScript
  ui/android/      # Capacitor shell + Kotlin plugin (later)
  configs/         # rpi5_hailo.yaml, rpi5_cpu.yaml, android.yaml
  security/        # threat model, CONTROLS.md, scan configs
  scripts/         # export, quantize, benchmark, sign, provision
  tests/           # unit, schema, authz, injection, perf, resilience
  docs/            # DECISIONS.md, SETUP.md, BENCHMARKS.md
  .github/workflows/
```

---

## 7. Contracts to write first (Phase 0)

1. `core/schemas/vision_result.schema.json`: `class_id, label, confidence, bbox, mask_polygon, severity_level, low_confidence`.
2. `core/schemas/advisory_v3.schema.json` (see white paper Section 6.3): `schema_version, diagnosis, severity, actions, tool_call, preventive, safety_notice, lang`. Reject unknown fields.
3. Python interfaces (abstract base classes) for `VisionBackend`, `LLMBackend`, `AudioBackend`, `Retriever`.
4. TypeScript: `EngineClient`, `VisionResult`, `Advisory`, generated from or checked against the JSON schemas.
5. Three config files with the `security:` block (bind address, auth required, rate limits).
6. OpenAPI spec for the local API (white paper Section 9.1).

Commit contracts before writing adapters so work can proceed in parallel.

---

## 8. Phased work plan (follow this order)

| Phase | Do | Done when |
|---|---|---|
| 0 | Repo, contracts, CI skeleton (lint, tests, gitleaks, dependency scan), security baseline files, mock adapters | `pytest` and UI tests pass on mocks; CI green |
| 1A | Llama 3.2 1B → INT4 `.pte` → run on Pi CPU; scripts for export and benchmark | Offline text generation with recorded tokens/s, RAM, cold start |
| 1B | Vision data scripts, YOLO training config, ONNX export, `.hef` and CPU exports | Scripts documented and reproducible; mAP script ready for field photos |
| 1C | UI: 4 screens, i18n, offline bundling, mock `EngineClient` | Full click-through offline |
| 2 | Adapters, orchestrator, severity, confidence gate, FastAPI, auth, validation, `HttpEngineClient`, redacted logging, CORS/CSP | Photo → advisory on screen on Pi (no RAG) |
| 3 | Knowledge pipeline, retriever, rule engine, dosage tools, fallbacks, evaluation harness (50 questions), AuthZ/injection/upload test suites | Measured table (baseline vs RAG vs RAG+tools); 0 banned pesticides in tests |
| 4 | Languages, STT/TTS, Android plugin and `NativeEngineClient`, lighter retriever | Same question answered by voice on both devices |
| 5 | Benchmarks, soak, OTA attack tests, SBOM, security report, README, final report | All items in `security/CONTROLS.md` evidenced |

Do not start a phase until the previous one's "done when" is true, unless the work is independent (1A/1B/1C run in parallel).

---

## 9. Engineering standards

- Python 3.11+, type hints everywhere, `ruff` + `mypy`; Pydantic models for all API I/O; reject unknown fields.
- TypeScript strict mode; ESLint with security plugin; no `any` without justification.
- Unit tests for core logic at above 80% coverage; schema tests; golden-vector tests with tolerances for quantized models.
- No hard-coded secrets, paths or credentials. Configuration through YAML and environment, secrets through the OS keyring/Keystore.
- Every adapter implements its interface completely and has a mock for tests.
- Conventional commits; small PRs; each phase ends with a tag.
- Pin versions of ExecuTorch, HailoRT, PyTorch, Ultralytics and the OS image; record them in `docs/SETUP.md`. Verify current versions and installation steps from official documentation at build time rather than relying on memory, because tool APIs change.
- Prefer boring, well-understood libraries. Do not add a dependency without noting why.

---

## 10. Measurement rules (honesty)

- Benchmark on the real device, steady state (after warm-up, with thermal soak) and cold start. Record P50 and P99.
- Report vision accuracy on lab data and on **real field photos separately**; split by farm or plot.
- Mark anything not yet measured as `TBD`. Never invent numbers.
- Known corrections you must respect: 1B is the main model; Marathi is not an officially supported Llama 3.2 language, so evaluate it and state limits; `bge-small-en` is English-only, so test a multilingual embedder; memory-map figures from file 1 are unverified; history stores structured results, not images.

---

## 11. What the human must do (ask only when you are actually blocked)

You cannot do these. When you reach one, say exactly what you need and continue with other work using mocks:

- Accept the Llama licence and provide a Hugging Face token; register on the Hailo Developer Zone for the Dataflow Compiler/HailoRT; download PlantVillage and IP102.
- Provide the Raspberry Pi 5 hardware, Hailo HAT, camera, mic, display and an Android phone; flash images; set unique per-device passwords, SSH keys and hotspot password.
- Generate and back up the Ed25519 signing key and Android keystore offline; enable MFA on GitHub/Hugging Face; configure branch protection and secret scanning.
- Supply 100–300 consented field photos, agronomist review of test answers, dosage tables and the official banned-pesticide list; native-speaker review of Hindi and Marathi.
- Run GPU training and Hailo compilation on suitable machines if you cannot; run physical soak, power-cut and thermal tests; arrange independent security and legal/privacy review; record the demo video.

---

## 12. Start now — your first response must be

1. **Confirmation (max 10 lines):** your understanding of the product, the frozen decisions, and the precedence order.
2. **Gaps and conflicts:** anything in the four files you think is wrong or unclear, with the decision you will take (max 8 bullets).
3. **Blocking questions:** at most 5, only those that stop Phase 0. If none, say "none".
4. **Then begin Phase 0 immediately:** create the repository tree, the contracts in Section 7, the three configs, CI skeleton, `security/CONTROLS.md` (all 20 rows, status "planned"), `docs/DECISIONS.md`, and mock adapters. Show file contents as you create them.
5. End each work session with: what was completed, what was tested and the results, what is next, and what you need from the human.

## 13. Output rules for every task

- Produce working code, not pseudo-code, unless a step is explicitly hardware-blocked, and in that case provide the mock plus a clear `TODO(human)` note.
- Explain security-relevant choices in one or two lines next to the code.
- Do not claim a control is done without a test or CI check that proves it.
- Keep answers short; put detail in files.

*End of master prompt. Begin with the white paper for specifications, then execute Section 12.*
