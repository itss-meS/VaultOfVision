# Security controls evidence

> Edge-server material. This document describes the Raspberry Pi and Python backend track, which lives in the separate AgriEdge edge repository. It is kept here for reference; the mobile app in this repository does not use a server.

Status key: **verified** = implemented and proven by an automated test in this repo. **configured** = CI job or config exists but has not yet run on GitHub. **partial** = some parts done, remainder listed. **manual** = needs a human action. **equivalent** = substitute control.

| # | Control | Status | Implementation | Test / CI proof |
|---|---|---|---|---|
| 1 | SQL injection | verified | `core/storage.py` (bound parameters only), `adapters/fts5_retriever.py` (static SQL, escaped MATCH) | `tests/test_core.py::test_storage_scoping_and_ids`, `tests/test_orchestrator.py::test_fts5_retriever_is_injection_safe`; CI `python` (ruff S rules, bandit), `semgrep` (`security/semgrep.yml`) |
| 2 | XSS | verified | React escaping, LLM text rendered as text nodes, CSP in `backend/middleware.py` and `ui/web/index.html`, no inline styles | `ui/web/tests/hygiene.test.ts`, `tests/test_api.py::test_security_headers_and_no_caching`; ESLint `react/no-danger` and `no-restricted-syntax`; semgrep. Real-browser CSP check is not yet automated |
| 3 | CSRF | verified | `backend/deps.py` (token bound to JWT, constant-time compare), `backend/middleware.py` (Host, Origin, Sec-Fetch-Site), SameSite=Strict cookie | `test_csrf_enforced_for_cookie_sessions`, `test_host_and_origin_validation`, `test_login_cookie_flags_and_no_token_in_body` |
| 4 | File upload validation | verified | `core/security/upload.py` (size, pixels, magic bytes, Pillow decode and re-encode, EXIF stripped), `backend/middleware.py` body limit, signed bundles in `core/security/signing.py` | `test_vision_endpoint_upload_validation`, `test_upload_polyglot_and_exif_are_stripped`, `test_decompression_bomb_rejected`, `test_ota_signature_rollback_and_truncation`. Hypothesis fuzz corpus planned for Phase 3 |
| 5 | BOLA | verified | `Database.get_case(profile_id, case_id)`, UUIDv4 ids, 404 on mismatch | `test_bola_cases_isolated_between_profiles` |
| 6 | Rate limiting | verified | `core/security/ratelimit.py`, per-IP and per-profile limits, single-flight LLM and vision locks, login lockout with backoff | `test_llm_rate_limit`, `test_session_rate_limit`, `test_single_flight_llm_queue`, `test_vision_single_flight`, `test_login_failures_are_uniform_and_lock_out` |
| 7 | JWT secrets | partial | EdDSA only, algorithm allow-list, `iss/aud/exp/iat/jti` required, 15 min TTL, per-device key in 0600 file (`core/security/tokens.py`, `scripts/provision.py`). Pending: OS keyring/TEE on Pi, Android Keystore (Phase 4), rotation runbook (`docs/KEY_ROTATION.md` drafted) | `test_tokens_algorithm_and_claims`, `test_provision_creates_unique_credentials` |
| 8 | API secrets server side | configured | No third-party secrets exist; none in UI or APK | `hygiene.test.ts`; CI `secrets` (gitleaks), `.pre-commit-config.yaml` |
| 9 | Password hashing | verified | Argon2id with per-user salt, PIN policy, lockout (`core/security/passwords.py`) | `test_password_hashing_and_pin_policy`, `test_profile_creation_rules` |
| 10 | MFA | verified for app, manual for repo | TOTP required for officer and admin login (`backend/routes/session.py`). Farmers use device PIN. GitHub, Hugging Face and signing-key holders must enable MFA by hand | `test_mfa_required_for_officer_and_admin` |
| 11 | CORS | verified | CORS off by default, exact-origin allow-list only, wildcard rejected at config load (`core/config.py`) | `test_cors_not_enabled_by_default_and_no_wildcard`, `test_config_guards`, semgrep rule |
| 12 | Tokens out of local storage | partial | Pi: HttpOnly SameSite=Strict cookie, UI never sees the JWT. Android Keystore storage arrives with the native plugin (Phase 4) | `hygiene.test.ts`, `test_login_cookie_flags_and_no_token_in_body` |
| 13 | Server-side permissions | verified | `core/policy.py`, `require()` dependency, deny by default | `test_role_by_route_matrix` (4 roles x 8 routes), `test_policy_denies_unknown_roles` |
| 14 | Row-level security | equivalent | SQLite has no RLS: profile-scoped repository functions plus items 5 and 13. ADR in `docs/DECISIONS.md` | BOLA tests. If Postgres or Supabase is ever added, enable RLS on every table first |
| 15 | Webhook signatures | equivalent | No webhooks. Ed25519 verification of OTA bundles and signed banned list and dosage table | `test_bundle_verification`, `test_signed_rules_reject_tampering`, `test_ota_signature_rollback_and_truncation` |
| 16 | SSRF | verified | No user-supplied URLs accepted, `core/security/ssrf.py` allow-list guard, tools are local pure functions | `test_ssrf_guard`; semgrep rule blocks network imports in `core/tools.py` |
| 17 | Source maps | configured | `build.sourcemap: false`, `ui/web/scripts/check-no-maps.mjs`, APK `unzip -l` check, R8 enabled by `ui/android/scripts/harden-manifest.mjs` | CI `ui`, `build-apk`, `build-rpi` |
| 18 | Default credentials | partial | No default credentials in repo, `scripts/provision.py` generates unique admin password and TOTP. SSH key-only, hotspot password and first-boot wizard are manual or Phase 5 | `test_provision_creates_unique_credentials` |
| 19 | Sensitive data in logs | verified | `core/security/logs.py` redaction filter, only IDs and latencies logged | `test_log_redaction`, `test_logs_never_contain_sensitive_values` |
| 20 | Dependencies | configured | Pinned `requirements.txt`, committed npm lockfiles, Dependabot, CI pip-audit, npm audit, Trivy, osv-scanner, CycloneDX SBOM in `build-rpi` | CI jobs; first run pending |

Extra controls: loopback bind default and no auth-off mode (`core/config.py`, `test_config_guards`), SQLCipher required outside dev mode (`test_storage_requires_encryption_outside_dev`), prompt-injection suite of 32 attacks x 3 modes x 3 languages (`tests/test_injection.py`), delete-my-data and export (`test_privacy_export_and_delete`), rollback-protected OTA counter.

Not yet evidenced: ZAP baseline scan, external security review, OTA power-loss tests, secure boot and dm-verity.
