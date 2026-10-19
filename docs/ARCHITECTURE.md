# Architecture

> Edge-server material. This document describes the Raspberry Pi and Python backend track, which lives in the separate AgriEdge edge repository. It is kept here for reference; the mobile app in this repository does not use a server.

The diagrams use Mermaid. GitHub, PyCharm (Markdown preview) and mermaid.live render them.

## System overview

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        WEB["Web UI<br/>React 18, TypeScript, Tailwind<br/>light and dark theme, en / hi / mr"]
        APK["Android app<br/>Capacitor shell<br/>on-phone TypeScript engine, Kotlin plugin pending"]
    end

    subgraph Backend["Backend: FastAPI (Raspberry Pi 5 or Windows)"]
        GUARD["HTTP guards<br/>host and origin checks, CSP, CSRF,<br/>rate limits, body limits"]
        ROUTES["Routes<br/>session, vision, advisory, cases,<br/>tts, health, profiles, ota"]
        AUTH["Auth and policy<br/>cookie session, argon2 PIN, TOTP,<br/>role and route permissions"]
        ORCH["Orchestrator<br/>retrieve, prompt, generate,<br/>schema check, retry, fallback"]
        SEV["Severity<br/>thresholds"]
        RULES["Rule engine<br/>signed banned pesticide list"]
        DOSE["Dosage tool<br/>signed dosage table"]
    end

    subgraph Ports["Adapter ports"]
        VIS["VisionBackend<br/>onnx_cpu"]
        LLM["LLMBackend<br/>executorch"]
        RET["Retriever<br/>fts5"]
        AUD["AudioBackend<br/>piper + whisper.cpp, or none"]
    end

    subgraph Assets["Files on the device"]
        ONNX[("models/vision.onnx<br/>models/labels.json")]
        PTE[("models/llama32_1b_int4.pte<br/>models/tokenizer.model")]
        KB[("knowledge/chunks.jsonl")]
        SIGNED[("Signed assets<br/>banned list, dosage table,<br/>Ed25519 public key")]
        DB[("SQLite database<br/>profiles, cases, audit, meta")]
    end

    subgraph Training["Training on your PC (RTX GPU)"]
        DATA["Datasets<br/>PlantVillage, Cassava, IP102,<br/>any folder-per-class set"]
        PREP["datasets.py<br/>load, split, write layout"]
        TRAIN["train_all.py<br/>YOLO11 classifier, PyTorch + CUDA"]
        EVAL["Evaluate<br/>lab vs field accuracy"]
        EXPORT["Export<br/>ONNX, labels, calibration images"]
    end

    subgraph LlamaPrep["Llama preparation (Colab)"]
        HF["Llama 3.2 1B Instruct<br/>Hugging Face"]
        ET["ExecuTorch export<br/>8da4w quantization"]
    end

    WEB -->|HTTPS or proxy /api| GUARD
    APK -.->|native plugin| ORCH
    GUARD --> AUTH --> ROUTES
    ROUTES --> VIS
    ROUTES --> ORCH
    ROUTES --> AUD
    ROUTES --> DB
    ORCH --> SEV
    ORCH --> RET
    ORCH --> LLM
    ORCH --> RULES
    ORCH --> DOSE
    VIS --> ONNX
    LLM --> PTE
    RET --> KB
    RULES --> SIGNED
    DOSE --> SIGNED

    DATA --> PREP --> TRAIN --> EVAL --> EXPORT --> ONNX
    HF --> ET --> PTE
```

## Request flow: photo to advice

```mermaid
sequenceDiagram
    autonumber
    actor Farmer
    participant UI as Web UI
    participant API as FastAPI guards and auth
    participant V as Vision (ONNX)
    participant O as Orchestrator
    participant R as Retriever (FTS5)
    participant L as Llama (ExecuTorch)
    participant RE as Rule engine
    participant D as Dosage tool
    participant DB as SQLite

    Farmer->>UI: Sign in with profile code and PIN
    UI->>API: POST /session
    API-->>UI: HttpOnly cookie and CSRF token
    Farmer->>UI: Take or choose a leaf photo
    UI->>API: POST /vision/analyze
    API->>V: validated, re-encoded image
    V-->>API: label, confidence
    API-->>UI: diagnosis (retake if low confidence)
    Farmer->>UI: Ask for advice
    UI->>API: POST /advisory
    API->>O: query, diagnosis, language, area
    O->>R: search knowledge chunks
    R-->>O: relevant text
    O->>L: prompt asking for strict JSON
    L-->>O: JSON advisory
    O->>O: schema check, retry up to 2, else templated fallback
    O->>RE: check output for banned pesticides
    RE-->>O: pass or block
    O->>D: calculate dosage from signed table
    D-->>O: product, dose, total
    O-->>API: advisory with dosage
    API->>DB: save case
    API-->>UI: advisory JSON
    UI-->>Farmer: steps, dosage, safety notice
    opt Play audio
        UI->>API: POST /tts
        API-->>UI: WAV audio
    end
```

## Training flow

```mermaid
flowchart LR
    A["Download dataset<br/>PlantVillage, Cassava, IP102"] --> B["datasets.py<br/>read labels, group by leaf,<br/>split train / val / test"]
    B --> C["data/NAME<br/>train, val, test_lab,<br/>optional test_field"]
    C --> D["train_all.py<br/>YOLO11 classifier<br/>GPU, mixed precision"]
    D --> E["best.pt"]
    E --> F["Evaluate<br/>report.json,<br/>confusion CSVs"]
    E --> G["Export ONNX"]
    G --> H["models/NAME/vision.onnx<br/>labels.json, calibration"]
    H -->|"--activate"| I["models/vision.onnx<br/>read by backend"]
```

## On-phone engine (APK)

```mermaid
flowchart TB
    UI["React UI"] --> LE["LocalEngineClient"]
    LE --> AUTH["PIN login<br/>PBKDF2, lockout"]
    LE --> ORCH["Orchestrator (TypeScript)<br/>refuse, retake, healthy template,<br/>retrieve, generate, validate, retry, fallback"]
    ORCH --> RULES["Rules<br/>signed banned list"]
    ORCH --> DOSE["Dosage<br/>signed table"]
    ORCH --> BM25["BM25 retriever<br/>chunks.jsonl"]
    LE --> PORTS["NativePorts"]
    ORCH --> PORTS
    PORTS --> K["Kotlin plugin AgriEdgeEngine<br/>(not written)"]
    K --> V["ONNX Runtime: vision.onnx"]
    K --> L["ExecuTorch: Llama .pte + tokenizer"]
    K --> S["TextToSpeech"]
    K --> F["Private storage"]
```

Details of the ports and the build are in `ANDROID.md`. The Python orchestrator and the TypeScript orchestrator implement the same flow; see decision 15 in `DECISIONS.md`.

## Open architecture item: multi-crop advice

Today the crop is fixed to tomato in the advisory schema, the prompt, the retrieval filter and the dosage arguments. The planned design derives crop and disease from the vision label (for example `Potato Late Blight`), validates the crop against the loaded knowledge pack and dosage table, and keeps the same safety rules per crop: no vetted dosage entry means referral to an extension officer. See decision 21.

