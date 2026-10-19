# AgriEdge-Copilot (PlantAI) — White Paper

**An offline, secure, plug-and-play AI crop-advisory system for Raspberry Pi 5 (+ Hailo) and Android**

| | |
|---|---|
| Document version | 1.0 |
| Date | 9 October 2026 |
| Theme | Applied AI on SoC: 2nd Edition — engineering AI-enabled products, not just AI apps |
| Status | Planning baseline — all performance numbers are **targets to be measured**, not results |
| Source documents | `PlantAI_formatted.docx` (architecture), `Thought_for_51s.docx` (build plan, UI and cross-platform decisions) |

---

## 1. Executive Summary

Smallholder farmers lose a large share of yield to crop disease and pests, and the nearest agronomist is often days away and internet is unreliable. **AgriEdge-Copilot** is a device and app that takes a leaf photo plus a spoken or typed question and returns a safe, local-language, spoken treatment advisory — **fully offline**, in about two seconds, on hardware that costs a few hundred dollars.

Three ideas define the design:

1. **Two pipelines on two kinds of silicon.** Vision (disease/pest detection) runs on the Hailo NPU through HailoRT. Language reasoning (Llama 3.2 1B, optionally 3B) runs on the Arm CPU through ExecuTorch.
2. **Plug-and-play through ports and adapters.** The core logic only talks to small interfaces (`VisionBackend`, `LLMBackend`, `AudioBackend`, `Retriever`). A YAML config chooses the adapter at startup, so the same product runs as `rpi5_hailo`, `rpi5_cpu` or `android`.
3. **The LLM is never trusted alone.** Dosage math is done by deterministic code. A rule engine enforces banned-pesticide lists before and after generation. Output must match a strict JSON schema, otherwise a templated fallback is used.

This version of the paper adds a **security architecture** built from a 20-point hardening checklist (SQL injection, XSS, CSRF, upload validation, BOLA, rate limiting, JWT secrets, API secrets, password hashing, MFA, CORS, token storage, server-side permissions, row-level security, webhook signatures, SSRF, source maps, default credentials, log hygiene, dependency updates). Each item is mapped honestly to this offline-first architecture: most apply directly, a few apply in an adapted form, and two have an equivalent control instead (Section 11).

---

## 2. Problem and Context

| Aspect | Reality in the field |
|---|---|
| Connectivity | Intermittent or absent. Cloud inference is not a dependable option. |
| Literacy and language | Many users prefer voice and local languages (Hindi, Marathi, others). |
| Risk of bad advice | A wrong pesticide or dose harms the crop, the farmer and the consumer. Banned chemicals are a legal and health problem. |
| Device constraints | 4–8 GB RAM, thermal limits in sunlight, battery or unreliable power. |
| Privacy | Photos, voice, location and land details are personal data. |

The "2nd Edition" theme shifts the success metric from model accuracy to **system-level outcomes**: P99 latency, energy per inference, memory ceiling, thermal behaviour, update safety and security.

---

## 3. Goals, Non-Goals and Success Metrics

### 3.1 Goals
- Offline photo → diagnosis → severity → advisory → spoken answer.
- One crop for the first release (**tomato**), 2–3 languages (**English, Hindi, Marathi**).
- Same codebase contracts on Raspberry Pi 5 (with and without Hailo) and Android.
- Zero banned pesticides recommended in the test set.
- Security by default, with no secrets in the client and no sensitive data in logs.

### 3.2 Non-goals (first release)
- Multiple crops, more than three languages.
- Training on device and federated learning (kept as a later extension).
- Audio pest detection and Grad-CAM explainability (later extensions).
- Cloud dashboards. The officer dashboard runs on a local network only.

### 3.3 Target metrics (to be measured, not assumed)

| Category | Metric | Target | How measured |
|---|---|---|---|
| Vision | Capture → JSON latency (P99) | < 120 ms on Hailo | Hardware timestamp |
| Vision | mAP@0.5 on **real field photos** | Report honestly; aim > 0.80 | Held-out field set |
| LLM | Decode speed, 1B INT4 on Pi 5 | ≥ 8 tok/s (3B is optional and likely slower) | On-device benchmark |
| End to end | Button press → voice starts | < 2–4 s | Stopwatch + logs |
| Memory | Peak RSS | < 2.8 GB on 4 GB Pi | `VmHWM` |
| Energy | Joules per advisory | < 2 J (estimate only) | INA219/INA3221 |
| Safety | Banned pesticide in output | 0 of the test set | Rule-engine audit |
| Safety | Invalid JSON reaching the UI | 0 | Schema validation logs |
| Security | High/critical dependency findings at release | 0 | CI scanners |

---

## 4. System Architecture

### 4.1 Layered view

```
┌──────────────────────────────────────────────────────────────┐
│ UI  (React + TypeScript + Vite + Tailwind + i18next)         │
│   same code on Pi (Chromium kiosk / hotspot) and Android     │
│   (Capacitor).  Talks only to  EngineClient                  │
├──────────────────────────────────────────────────────────────┤
│ EngineClient interface                                       │
│   HttpEngineClient (Pi)   |   NativeEngineClient (Android)   │
├──────────────────────────────────────────────────────────────┤
│ CORE (platform independent)                                  │
│   Orchestrator · Rule engine · Dosage tools · Prompt builder │
│   JSON-schema guard · Case history · Policy/auth             │
├──────────────────────────────────────────────────────────────┤
│ INTERFACES (ports)                                           │
│   VisionBackend · LLMBackend · AudioBackend · Retriever      │
├──────────────────────────────────────────────────────────────┤
│ ADAPTERS (plug-ins chosen by config)                         │
│   hailo · executorch_linux · executorch_android · piper ·    │
│   whisper_cpp · android_audio · faiss · hnswlib/sqlite-vec   │
├──────────────────────────────────────────────────────────────┤
│ SoC SERVICES: power/thermal · dmabuf/CMA · TEE/Keystore ·    │
│               RAUC/SWUpdate OTA · dm-verity                  │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 Plug-and-play mechanism
The core calls `vision.detect(image)`, `llm.generate(prompt, schema)`, `audio.tts(text, lang)` and `retriever.search(query, filters)`. It never knows what runs underneath. A config file selects adapters:

```yaml
# configs/rpi5_hailo.yaml
platform: rpi5_hailo
vision:    { adapter: hailo,             model: models/yolo11n_seg_tomato.hef, conf_threshold: 0.55 }
llm:       { adapter: executorch_linux,  model: models/llama32_1b_int4.pte,    max_ctx: 2048 }
retriever: { adapter: faiss,             index: knowledge/index.faiss }
audio:     { stt: whisper_cpp, tts: piper }
security:  { bind: 127.0.0.1, require_auth: true, rate_limit: { llm_per_min: 6 } }
fallback:  { vision: rpi5_cpu }      # auto-switch if Hailo missing
```

Changing hardware means writing one adapter, not editing the core. If Hailo is not detected, the config falls back to `rpi5_cpu` and the same app runs.

### 4.3 What is shared and what is not

| Shared on all platforms | Platform-specific |
|---|---|
| Llama `.pte` model (ExecuTorch on Arm CPU) | Hailo `.hef` (Pi + Hailo only) |
| Knowledge base, prompts, JSON schemas | UI shell (Chromium kiosk vs Capacitor) |
| Rule engine, dosage logic, language files | Camera, microphone, audio access |
| Vision model weights (the trained YOLO) | Vision runtime: HailoRT on Pi, ExecuTorch/XNNPACK on Android |
| UI source code | Vector search library (FAISS on Pi; lighter option on Android) |

### 4.4 Realistic implementation route
A single shared C++ core is the cleanest design but costly. The plan: **share the contracts, models, prompts and knowledge base**; write the core in **Python on the Pi first**; then **re-implement the thin core in Kotlin on Android** against the same interfaces. This stays faithful to the plug-and-play idea at far lower risk. The earlier "no Python in src/" rule from the first document is **superseded** by this decision.

---

## 5. Build-Time Pipeline (done once, on a laptop or workstation)

### 5.1 Vision models
1. **Data:** PlantVillage (tomato classes), IP102 (pests), plus **100–300 real field photos**. PlantVillage is lab-clean; real photos are essential for honest accuracy.
2. **Train:** YOLO11n-seg (or YOLOv8n-seg) for disease and pest detection.
3. **Export:** ONNX → calibration with about 200 images → compile to `.hef` with the **Hailo Dataflow Compiler** (x86 Linux only).
4. **Second export:** a CPU model (`.pte` via ExecuTorch/XNNPACK, or ONNX Runtime) for Android and the no-Hailo fallback.
5. **Split discipline:** keep field photos mostly for **testing**; split by farm or plot, never by random image, to avoid leakage.

### 5.2 Language model
- Llama 3.2 1B Instruct as the main model, 3B optional.
- Optional fine-tune on 500–1000 agri Q&A pairs.
- INT4 quantization and export: `torch.export → to_edge → to_executorch → .pte`.
- Accept the Meta Llama licence before download and keep a record of the accepted terms.

### 5.3 Knowledge base
- Sources: FAO and ICAR advisories, official banned-pesticide list, dosage tables.
- Chunk by **crop + disease + growth stage** (semantic chunking).
- Embedder: the first document names `bge-small-en-v1.5`, which is **English-only**. For Hindi and Marathi queries use a multilingual small embedder (for example multilingual-e5-small) or keep the knowledge base in English and let Llama answer in the target language. Decide with a retrieval test.
- Index: FAISS HNSW on the Pi; a lighter library behind the same `Retriever` interface on Android.
- Metadata filters on crop, region and language before vector search.
- **Sign** the knowledge pack (see Section 11) so a tampered pack is rejected.

---

## 6. Runtime Pipeline

```
Farmer input (photo + voice/text)
   → Pre-process (resize, normalize, letterbox)
   → Detect (class, box, mask, confidence)  ── low confidence → "retake photo"
   → Severity (mask area ÷ leaf area → level 1-5)
   → Orchestrator: profile + vision JSON + question
   → Rule engine pre-check (banned list, season, region)
   → RAG retrieve top 3-5 chunks (filtered)
   → Prompt build (system rules + context + vision JSON + question)
   → Llama generates STRICT JSON (tool_call, not numbers)
   → Tools: deterministic dosage math
   → Validation: JSON schema + banned-list re-check
        ├─ pass → Advisory card + TTS + local history
        └─ fail → templated safe answer
```

### 6.1 Vision pipeline details
| Stage | Detail |
|---|---|
| Input | V4L2/libcamera on Pi (dmabuf where possible); Android camera API |
| Pre-process | Hailo hardware pre-processing if it works; OpenCV on CPU first, optimize later |
| Detection | YOLO seg: disease, pest, healthy; box, mask, confidence |
| Confidence gate | Below threshold → ask for a clearer photo instead of guessing |
| Severity v1 | Infected mask area ÷ leaf area mapped to levels 1–5 (no extra model) |
| Severity v2 (optional) | Small classifier on cropped region |
| Tracking | ByteTrack only for live video; cut first if behind schedule |

### 6.2 Language pipeline details
| Component | Decision |
|---|---|
| Runtime | ExecuTorch with XNNPACK delegate; `.pte` is memory-mapped for fast load |
| Model | Llama 3.2 1B Instruct INT4 (3B optional if memory and speed allow) |
| Output control | Grammar-constrained decoding if feasible, otherwise validate-and-retry (max 2 retries) then fallback |
| Tool use | The model emits `tool_call`; code computes dosage. The model never calculates numbers |
| Language | Llama 3.2 officially supports English and Hindi among others; **Marathi is not officially supported**, so test it and state limits honestly |
| Context | Keep context small (about 2k) on a 4 GB Pi; truncate RAG chunks, not the system rules |

### 6.3 Advisory output schema (contract)

```json
{
  "schema_version": "advisory_v3",
  "diagnosis": { "primary": "Early Blight", "confidence": 0.92, "differential": ["Late Blight"] },
  "severity":  { "level": 3, "label": "Moderate", "affected_area_pct": 15 },
  "actions":   [ { "text": "Remove infected leaves", "priority": "critical" } ],
  "tool_call": { "tool": "calc_dosage", "args": { "crop": "tomato", "area_ha": 0.5, "severity": 3 } },
  "preventive": ["Crop rotation", "Drip irrigation to reduce leaf wetness"],
  "safety_notice": "Wear gloves and a mask when spraying.",
  "lang": "mr"
}
```

The vision contract (`VisionResult`) carries `class_id, label, confidence, bbox, mask_polygon, severity_level, low_confidence`. Both schemas live in `core/schemas/` and are validated on every call.

---

## 7. Platform Matrix

| Capability | `rpi5_hailo` | `rpi5_cpu` | `android` |
|---|---|---|---|
| Vision runtime | HailoRT (`.hef`) | ExecuTorch/ONNX Runtime CPU | ExecuTorch/XNNPACK |
| LLM | ExecuTorch Linux | ExecuTorch Linux | ExecuTorch Android (Kotlin plugin) |
| UI | Chromium kiosk or hotspot | Same | Capacitor WebView |
| STT / TTS | whisper.cpp / Piper | Same | Android built-in or on-device engines |
| Retriever | FAISS | FAISS | hnswlib or SQLite vector extension |
| Secrets/keys | OS keyring + TEE where available | Same | Android Keystore / StrongBox |
| OTA | RAUC/SWUpdate A/B | Same | App store / signed APK + signed model packs |

Build order: **Pi first, Android second.** Android is the first thing cut if the schedule slips.

---

## 8. User Interface Architecture

### 8.1 Stack
React + TypeScript + Vite + Tailwind + i18next. Everything bundled locally (fonts, icons, libraries) with **no CDN links**, because the product must work in airplane mode.

### 8.2 Four screens
1. **Setup:** language, crop, region (once).
2. **Capture:** camera/gallery and a large microphone button.
3. **Result card:** disease or pest, severity (green/amber/red plus word/icon), detected area highlighted, confidence indicator.
4. **Advisory:** steps in the local language, dosage for farm size, safety warning, play-audio button, "Offline mode" badge.

### 8.3 Farmer-friendly rules
Large buttons, icons over text, voice in and out, very few steps, never colour alone.

### 8.4 EngineClient contract

```ts
interface EngineClient {
  analyzeImage(photo: Blob): Promise<VisionResult>;
  ask(query: string, vision?: VisionResult): Promise<Advisory>;
  speak(text: string, lang: string): Promise<void>;
}
```
`HttpEngineClient` calls the local FastAPI on the Pi. `NativeEngineClient` calls a Capacitor plugin (Kotlin) on Android. Screens never know which one they use. A simpler alternative is a tiny local HTTP server inside the Android app so one client works everywhere; this is acceptable if the loopback server is bound to `127.0.0.1` and authenticated like the Pi backend.

---

## 9. Backend and Data Design

### 9.1 Local API (Pi; mirrored in the Android plugin)
| Endpoint | Purpose | Auth / limits |
|---|---|---|
| `POST /api/v1/session` | Start session (PIN or device pairing) | Rate-limited, lockout |
| `POST /api/v1/vision/analyze` | Upload leaf photo | Auth, size/type checks, 1 concurrent |
| `POST /api/v1/advisory` | Generate advisory | Auth, LLM queue (1 at a time), 6/min |
| `POST /api/v1/tts` | Speak text | Auth |
| `GET /api/v1/cases` | List this profile's cases | Auth, scoped to profile |
| `GET /api/v1/cases/{id}` | One case | Auth + ownership check (BOLA) |
| `GET /api/v1/health` | Device health (no sensitive data) | Role: officer/admin |
| `POST /api/v1/ota/apply` | Apply signed update | Role: admin, signature required |

All requests and responses are validated by Pydantic models; unknown fields are rejected.

### 9.2 Data model (SQLite, encrypted with SQLCipher)
`profiles(id, name_hash/label, lang, region, land_unit, pin_hash)` · `cases(id, profile_id, created_at, crop, diagnosis_json, advisory_json, model_hash)` · `audit(id, ts, actor, action, result)`.
Rules: parameterized queries only; every query on `cases` includes `profile_id`; images are processed in memory and **not stored** unless the farmer opts in to save a thumbnail (encrypted, EXIF stripped). This resolves the earlier conflict between "zero persistence" and "save the case to history": the history keeps structured results, not pixels.

### 9.3 Roles
`farmer` (own cases), `champion` (shared-phone mode, multiple profiles, each isolated), `officer` (read device health and aggregated, privacy-preserving stats), `admin` (updates, provisioning).

---

## 10. Performance, Memory, Power and Thermal Plan

These are engineering targets and hypotheses; each must be replaced by a measured number in the benchmark report.

- **Memory:** the first document proposed a 1.5 GB CMA reservation and a 3B model in about 1.2 GB. These figures are unverified. Start with 1B INT4, memory-map the `.pte`, cap context, and measure `VmHWM`. Do not reserve large CMA regions without evidence the Hailo path needs them.
- **LLM speed:** 3B INT4 above 10 tok/s on a Pi 5 CPU is optimistic. Expect 1B to be the realistic main model; report 3B as an option.
- **Power modes:** deep sleep, standby (keyword spotting), vision idle, inference burst, throttled (above about 75 °C). Implement as a simple state machine; measure with an INA219/INA3221.
- **Thermal:** run a 30–60 minute soak at full load, log temperature, and verify graceful throttling (frame skip, reduced clocks).
- **Energy accounting:** the first document estimates about 1.67 J per interaction. Treat as an estimate until measured.
- **Optimization ideas kept for later:** speculative prompt pre-fill while the user is speaking, cascade ROI inference, pre-cached TTS sentences.

---

## 11. Security and Privacy Architecture

### 11.1 Security principles
1. **Offline-first reduces exposure**, but the local API, the WebView, uploads, updates and the supply chain are still attack surface.
2. **Bind to loopback by default.** Only expose a port on the hotspot network when the officer dashboard or phone-over-hotspot mode is explicitly enabled, with authentication.
3. **Untrusted inputs:** photos, audio, text queries, LLM output, knowledge packs and update bundles are all untrusted until validated or verified.
4. **Secrets never ship in clients.** No keys in the UI bundle, APK, repo or logs.
5. **Defence in depth:** UI checks are cosmetic; the server/core enforces everything.

### 11.2 Threat model summary

| Asset | Threat | Main mitigations |
|---|---|---|
| Farmer data (photos, voice, location) | Leak, over-collection | In-memory processing, SQLCipher, redacted logs, no cloud telemetry, consent screen |
| Advisory integrity | Hallucination, prompt injection | Schema enforcement, deterministic dosage, rule-engine override, injection-safe prompt layout |
| Model/IP | Extraction | Encrypted at rest, keys in TEE/Keystore where available (best effort on Pi) |
| Updates | Malicious or rolled-back firmware/model | Ed25519-signed manifests, A/B slots, rollback counters, dm-verity |
| Local API | Unauthorized access, abuse, DoS | Auth, rate limits, loopback binding, strict CORS, input validation |
| Knowledge pack | Poisoning (wrong or unsafe advice) | Signed packs, hash check at load, banned-list kept in separate signed file |
| Devices in the field | Default or weak credentials | Per-device generated credentials at provisioning |

### 11.3 The 20-point checklist mapped to this project

Status key: **Add** = implement as stated. **Add (adapted)** = implement in a form that fits an offline architecture. **Equivalent** = the item's technology is absent, so the underlying risk is covered another way.

| # | Control | Status | How it applies to AgriEdge-Copilot |
|---|---|---|---|
| 1 | SQL injection | **Add** | SQLite/SQLCipher and FTS5 queries are parameterized only; no string-built SQL; Semgrep/Bandit rules in CI; FTS5 query input is escaped. |
| 2 | Cross-site scripting | **Add** | React escaping by default; `dangerouslySetInnerHTML` banned by lint; **LLM output is rendered as plain text** or sanitized; strict Content-Security-Policy; no inline scripts. |
| 3 | CSRF | **Add (adapted)** | If the Pi uses a cookie session: `SameSite=Strict`, CSRF token, `Origin`/`Host` validation (also stops DNS-rebinding on localhost). If header-token auth is used (Android, API clients), CSRF is not applicable, but Origin checks stay. |
| 4 | Validate file uploads | **Add** | Photo endpoint: max size and dimensions, allow-list JPEG/PNG/WebP by **magic bytes**, decode and **re-encode** with Pillow (protects against decompression bombs and polyglots), strip EXIF/GPS, random server-side names, nothing executable, no archive uploads. Same rigor for update bundles and knowledge packs (signature first, then parse). |
| 5 | Broken object-level authorization | **Add** | Shared-phone "champion" mode makes this real: every case, profile and audio lookup checks ownership; IDs are unguessable (UUIDv4); negative tests try cross-profile access. |
| 6 | Rate limiting | **Add** | `slowapi`/middleware limits; the LLM endpoint also has a **single-flight queue** (CPU protection), session creation has lockout/backoff, upload size caps. Limits are per client and per device. |
| 7 | Secure JWT secrets | **Add (adapted)** | If JWTs are used for sessions and the dashboard: per-device random key generated at provisioning, stored in OS keyring/TEE/Keystore (never in repo or env files in git), prefer asymmetric signing (EdDSA), short expiry (about 15 min) with refresh, fixed algorithm allow-list, `iss/aud/exp` validation, rotation procedure. |
| 8 | Keep API secrets server side | **Add** | The product needs no third-party API keys at runtime. Rule: **no secret in the UI bundle or APK**; any OTA/registry token lives in the backend or Keystore; `gitleaks` pre-commit and CI scan. |
| 9 | Hash passwords securely | **Add (adapted)** | For officer/admin accounts and optional profile PINs: **Argon2id** with per-user salt and tuned cost (no SHA/MD5, no plain bcrypt below policy); PIN attempts limited with lockout; no passwords in logs. |
| 10 | Multi-factor authentication | **Add (scoped)** | Not for farmers (offline, low-literacy, voice-first; device-bound PIN instead). **Required** for admin/officer dashboard login (TOTP or hardware key), and for people who hold release/signing power (GitHub, Hugging Face, signing keys). |
| 11 | Tighten CORS | **Add** | Pi UI is served same-origin by FastAPI, so CORS is off by default. For Capacitor allow only its exact origins (`capacitor://localhost`, `http://localhost`) and the dashboard origin. **Never `*`**, never reflect arbitrary Origin, no credentials with wildcards. |
| 12 | Remove auth token from local storage | **Add** | Pi web UI: `HttpOnly; Secure; SameSite=Strict` cookie (pairs with item 3). Android: tokens in **Keystore-backed secure storage**, never `localStorage`/`sessionStorage`. The shared UI must not touch tokens directly. |
| 13 | Enforce permissions server side | **Add** | Role checks as FastAPI dependencies / core policy functions on every route and plugin method; UI hiding is cosmetic; deny by default; tests per role and route. |
| 14 | Row-level security | **Equivalent** | SQLite has no RLS. The same risk is covered by profile-scoped repository functions plus items 5 and 13. **If** a Postgres/Supabase backend is added later (for example a cloud officer portal), enable RLS on every table before launch. |
| 15 | Verify webhook signature | **Equivalent** | No webhooks exist. The matching risk (trusting inbound messages) is covered by **Ed25519 verification of OTA manifests and knowledge packs** and, if a sync callback is ever added, HMAC-SHA256 with timestamp, replay protection and constant-time compare. |
| 16 | SSRF | **Add** | The backend accepts **no user-supplied URLs**; images arrive as bytes, not links. Outbound calls (only OTA/officer sync) go to a **fixed allow-list**, with private/loopback/link-local ranges blocked and redirects disabled. LLM tool calls are an allow-list of local pure functions with **no network tools**. |
| 17 | Remove exposed source maps | **Add** | Vite `build.sourcemap: false` for production; CI step fails if any `*.map` appears in `dist/` or the APK assets; ProGuard/R8 enabled for the Android release. Keep maps only in a private debug build. |
| 18 | Change default credentials | **Add** | No default `pi` password, no default hotspot password, no default admin: generated per device at provisioning, printed on the device label or shown once. SSH is key-only (or disabled), unused services off, first-boot setup wizard forces credential creation. **Partly manual** (Section 17). |
| 19 | Keep sensitive data out of logs | **Add** | Structured logging with a **redaction filter**; never log images, audio, transcripts, GPS, farmer names, tokens or prompts containing personal data; log IDs and latencies only; debug logging off in production; log files encrypted or rotated and capped. Unit tests assert redaction. |
| 20 | Update vulnerable dependencies | **Add** | Lockfiles committed; `pip-audit`, `npm audit`, `osv-scanner`, Trivy for images, Gradle dependency checks; Dependabot or Renovate; CycloneDX **SBOM** per release; pinned ExecuTorch/HailoRT/OS versions upgraded deliberately with benchmark re-runs. |

### 11.4 Additional controls from the two source documents
- **LLM safety (OWASP LLM Top 10 mindset):** treat retrieved text and user text as untrusted; keep system rules separate from data; reject outputs that fail the schema; the rule engine has the final say on banned chemicals; tool calls are allow-listed and argument-validated.
- **Secure boot and verified rootfs:** A/B partitions, dm-verity, signed manifests, rollback protection, three-failed-boot automatic revert.
- **Model protection:** AES-GCM/XTS encryption at rest, key held by TEE/Keystore where the hardware supports it. A Raspberry Pi 5 has weaker hardware root-of-trust than an Android StrongBox device, so claims must stay modest and honest.
- **Privacy:** consent screen, data-minimization, local-only processing, an export/delete-my-data function, and a note on compliance with India's Digital Personal Data Protection Act (legal review is a manual task).
- **Provisioning:** device certificate and per-device keys created at provisioning; QR + BLE enrolment uses an authenticated, encrypted channel.

### 11.5 Security testing plan
| Test | Tool | When |
|---|---|---|
| Static analysis | Semgrep, Bandit, ESLint security plugins, Android Lint | Every PR |
| Secret scanning | gitleaks | Pre-commit and CI |
| Dependency and SBOM | pip-audit, npm audit, osv-scanner, Trivy, CycloneDX | Every PR + weekly |
| Dynamic scan of local API | OWASP ZAP (baseline) | Release candidate |
| Fuzzing uploads | Custom corrupt-image corpus, `hypothesis` | Phase 3 |
| AuthZ tests | pytest matrix: role × route × profile | Every PR |
| Prompt-injection suite | 30+ adversarial prompts and poisoned chunks | Phase 3 and release |
| Update attack tests | Bad signature, old version, truncated bundle, power loss | Phase 5 |
| Manual review | External or peer security review | Before demo |

---

## 12. Lifecycle, Updates and Reliability

- **Partitions:** boot A/B, rootfs A/B (SquashFS read-only), data partition (ext4/f2fs), recovery image.
- **Updates:** signed manifest (Ed25519) → verify → delta (bsdiff) or full bundle → write to inactive slot → switch → health check → mark good, otherwise auto-revert. Models and knowledge packs are versioned and hash-checked.
- **Fallbacks:** Hailo missing → CPU vision; low RAM → smaller model or shorter context; ASR failure → pictogram menu; FAISS failure → SQLite FTS5 keyword search; invalid JSON → templated advisory; thermal limit → frame skip and DVFS.
- **Observability (local):** latency histograms, error codes, model hash and version, thermal readings, with no personal data.

---

## 13. Validation and Benchmarking

1. **Accuracy:** report mAP on lab data and, separately, on real field photos; confusion matrix per class.
2. **Advisory quality:** 50 agronomist-style test questions; compare Llama alone, Llama + RAG, Llama + RAG + tools + rules.
3. **Safety:** 0 banned pesticides across the test set; adversarial prompts cannot override the rule engine.
4. **Performance:** table of vision latency, tokens/s, end-to-end time, peak RAM, power and mAP for Pi+Hailo, Pi CPU and Android.
5. **Soak:** 1-hour continuous load; 10 power-cut tests during OTA.
6. **Offline test:** Wi-Fi and mobile data off for the full demo flow.
7. **Golden vectors:** fixed inputs with expected outputs for regression (tolerance-based for INT8).
8. **CI:** unit tests (target above 80% on core), schema tests, security scans, and a hardware-in-the-loop runner for nightly benchmarks when hardware is available.

---

## 14. Complete Tool Stack

| Layer | Tools |
|---|---|
| Hardware | Raspberry Pi 5 (4/8 GB), Hailo-8L AI HAT+ (13 TOPS), eMMC/NVMe/SD, camera (IMX519/Arducam), mic HAT (ReSpeaker), speaker, touch display, UPS/battery HAT, INA219/INA3221 power monitor, Android phone (arm64) |
| Models | YOLO11n-seg (Ultralytics), optional MobileNetV4/EfficientNet, Llama 3.2 1B/3B Instruct, whisper.cpp (tiny), Piper/Sherpa-ONNX TTS, Silero VAD, fastText LID, multilingual small embedder |
| ML build | Python, PyTorch, ONNX, Hailo Dataflow Compiler (x86 Linux), HailoRT, ExecuTorch (XNNPACK), GPTQ/AWQ or ExecuTorch quantization, Hugging Face Hub, Label Studio or CVAT, Roboflow (optional) |
| Retrieval | FAISS (Pi), hnswlib or SQLite vector extension (Android), SQLite FTS5, Sentence-Transformers |
| Backend (Pi) | Python 3.11+, FastAPI, Uvicorn, Pydantic, slowapi, SQLCipher, argon2-cffi, PyJWT or Authlib, Pillow, structlog |
| Android | Kotlin, Android Studio, Capacitor plugin, ExecuTorch Android library, Keystore/EncryptedSharedPreferences |
| UI | React, TypeScript, Vite, Tailwind CSS, i18next, ESLint + security plugin, Vitest, Playwright |
| System/OTA | Raspberry Pi OS or Yocto/Buildroot (later), RAUC or SWUpdate, U-Boot, dm-verity, OP-TEE (where applicable), systemd, bsdiff |
| DevOps | Git, GitHub Actions (+ self-hosted HIL runner), pre-commit, Docker (build only), CMake |
| Security | Semgrep, Bandit, gitleaks, pip-audit, npm audit, osv-scanner, Trivy, CycloneDX/syft, OWASP ZAP, Dependabot/Renovate |
| Testing/bench | pytest, hypothesis, pytest-benchmark, MLPerf-style methodology, `hailortcli`, thermal logging, `/proc` monitors |
| Docs | Markdown, Mermaid, this white paper |

---

## 15. Implementation Roadmap (about 6 weeks, team of 2–4)

| Phase | Weeks | Outcomes |
|---|---|---|
| 0 Decisions and setup | Days 1–3 | One crop, 2–3 languages, repo and contracts (schemas, interfaces, configs), hello-world on Pi and phone |
| 1 Parallel tracks | 1–2 | A: Llama on ExecuTorch (Pi and Android) with real numbers. B: vision data, training, `.hef` and CPU export. C: UI scaffold on a mock `EngineClient` |
| 2 End-to-end on Pi | 2–3 | Adapters, orchestrator, severity, confidence gate, strict JSON, FastAPI + real UI. Security baseline lands here: auth, validation, logging redaction, CORS, headers |
| 3 Knowledge and safety | 3–4 | RAG, rule engine, dosage tool, fallbacks, 50-question evaluation, prompt-injection and AuthZ test suites |
| 4 Languages, voice, Android | 4–5 | Prompts and UI strings, STT/TTS, Capacitor + Kotlin plugin, lighter retriever |
| 5 Benchmark, harden, deliver | 5–6 | Benchmark table, soak, OTA attack tests, dependency/SBOM, README, report, video. Week 6: no new features |

**Cut order if behind:** Android port → fine-tuning → tracking → OTA demo.

---

## 16. Risks and Corrections to the Source Documents

| Item | Source claim | Correction or decision |
|---|---|---|
| Main model | First doc: Llama 3B; plan: 1B | **1B is the main model**, 3B optional |
| Speed | 3B INT4 above 10 tok/s | Unverified; measure; 1B is realistic |
| Languages | "100+ languages" | Llama 3.2 lists Hindi but **not Marathi**; test and disclose limits |
| Embedder | `bge-small-en` | English-only; use multilingual embedder or English KB with a retrieval test |
| Language of code | "No Python in src/" | Superseded: Python core on Pi, Kotlin on Android |
| Memory map | 1.5 GB CMA for Hailo | Unverified; measure before reserving |
| Persistence | Zero persistence vs history | Structured history yes; images no (optional encrypted thumbnail) |
| Accuracy target | mAP above 92% on PlantVillage | Lab data inflates; report field-photo mAP separately |
| Training on NPU | "Hailo supports training?" | Do not plan on it; keep on-device learning as a future item |
| BOM | About $255 | A planning figure; recheck prices at purchase time |
| Security | Not in the original 20-point list | Added in Section 11 |

---

## 17. Manual Tasks (cannot be done by the coding LLM)

**Accounts, licences, access**
- Accept the Meta Llama licence and create a Hugging Face account/token.
- Register on the Hailo Developer Zone to download the Dataflow Compiler and HailoRT.
- Download PlantVillage and IP102, and check each licence.
- Turn on MFA for GitHub, Hugging Face and any cloud account.

**Hardware and physical security**
- Buy and assemble the Pi 5, AI HAT, camera, mic, display and battery.
- Flash OS images, set a unique password/SSH key and hotspot password on **every** device.
- Wire the INA219/INA3221 power monitor and set up thermal measurement.
- Burn eFuses or enable secure boot only if the team decides to; this is irreversible.

**Keys and secrets**
- Generate the Ed25519 release-signing key and the Android keystore **offline**, back them up in two places, and never commit them.
- Set GitHub branch protection, secret scanning, Dependabot alerts and required reviews.

**Data and domain**
- Collect 100–300 real field photos with consent; label them.
- Get an agronomist to review the 50 test answers, the dosage tables and the banned-pesticide list from the official regulator.
- Native speakers review Hindi and Marathi text and audio.

**Compute and testing**
- Use a GPU laptop or cloud notebook for YOLO training and an x86 Linux machine for Hailo compilation.
- Test on a real phone and real Pi in airplane mode; run the soak and power-cut tests physically.
- Arrange an independent security review and any legal/privacy review (consent text, DPDP).

**Delivery**
- Record the demo video and photograph the hardware setup.

---

## 18. Deliverables

| Deliverable | Content |
|---|---|
| Source code | Monorepo with README, configs, setup scripts, tests |
| Application | Pi build and Android APK |
| Model artifacts | `.hef`, `.pte`, FAISS index, build/export scripts |
| Benchmark report | Latency, tokens/s, RAM, power, accuracy for three platforms |
| Security report | Control matrix (Section 11.3) with evidence per item, scan reports, SBOM |
| Demo video (3–4 min) | Airplane mode on, leaf photo, spoken local-language answer, banned-pesticide refusal |
| Technical report | Architecture of both pipelines, evaluation, limitations |

---

## 19. Appendix: Repository Layout

```
agriedge/
  core/            # orchestrator, rules, tools, prompts, schemas, policy
  interfaces/      # VisionBackend, LLMBackend, AudioBackend, Retriever
  adapters/        # hailo, executorch_linux, executorch_android, piper, whisper_cpp, android_audio
  backend/         # FastAPI app, auth, rate limiting, middleware
  models/          # .pte, .hef, embedder (git-ignored; fetched by script)
  knowledge/       # chunks, index, signed manifests
  ui/web/          # React + TypeScript
  ui/android/      # Capacitor shell + Kotlin plugin
  configs/         # rpi5_hailo.yaml, rpi5_cpu.yaml, android.yaml
  security/        # threat model, checklist evidence, scan configs
  scripts/         # export, quantize, benchmark, sign, provision
  tests/           # unit, schema, authz, injection, perf, resilience
  .github/workflows/
```

*End of white paper.*
