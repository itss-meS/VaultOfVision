# Threat model summary

> Edge-server material. This document describes the Raspberry Pi and Python backend track, which lives in the separate AgriEdge edge repository. It is kept here for reference; the mobile app in this repository does not use a server.

| Asset | Threat | Mitigations | Where |
|---|---|---|---|
| Farmer data | Leak, over-collection | Photos processed in memory and never stored, SQLCipher outside dev mode, redacted logs, no cloud telemetry, consent text in Setup, export and delete endpoints | `core/security/upload.py`, `core/storage.py`, `core/security/logs.py`, `backend/routes/profiles.py` |
| Advisory integrity | Hallucination, prompt injection | Strict `advisory_v3` schema, max 2 retries then template, deterministic dosage, rule engine before and after generation, data tags in prompt | `core/orchestrator.py`, `core/rules.py`, `core/prompts.py` |
| Local API | Unauthorised access, abuse, DNS rebinding | Loopback bind, Host and Origin checks, auth on every route, rate limits, body caps | `backend/` |
| Knowledge pack and banned list | Poisoning | Ed25519 signatures verified at load, startup fails closed | `core/rules.py`, `core/tools.py` |
| Updates | Malicious or rolled back bundle | Signed manifest, hash and size check, monotonic version counter | `core/security/signing.py`, `backend/routes/ota.py` |
| Devices | Default or weak credentials | Per-device provisioning | `scripts/provision.py` |
| Supply chain | Vulnerable or malicious dependency | Lockfiles, scanners, SBOM, pinned versions | `.github/workflows` |

Known gaps: Pi has a weaker hardware root of trust than Android StrongBox; model encryption at rest is not implemented yet; physical access to an unlocked device is out of scope.
