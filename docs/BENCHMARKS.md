# Benchmarks

> Edge-server material. This document describes the Raspberry Pi and Python backend track, which lives in the separate AgriEdge edge repository. It is kept here for reference; the mobile app in this repository does not use a server.

Every figure is TBD until measured on real hardware. Targets come from the white paper and are not results.

| Metric | Target | Pi 5 + Hailo | Pi 5 CPU | Android |
|---|---|---|---|---|
| Vision capture to JSON P99 | under 120 ms (Hailo) | TBD | TBD | TBD |
| mAP@0.5 lab data | report | TBD | TBD | TBD |
| mAP@0.5 field photos | report separately, aim above 0.80 | TBD | TBD | TBD |
| LLM decode, 1B INT4 | 8 tok/s or more | TBD | TBD | TBD |
| Button press to voice start | under 2 to 4 s | TBD | TBD | TBD |
| Peak RSS | under 2.8 GB on 4 GB Pi | TBD | TBD | TBD |
| Energy per advisory | under 2 J (estimate) | TBD | TBD | TBD |
| Banned pesticide in output | 0 | 0 in injection suite (fake model) | 0 | 0 |
| Invalid JSON reaching UI | 0 | 0 in tests (fake model) | 0 | 0 |

The last two rows were measured against a fake LLM only; they must be re-run with the real model.

## Measured in the authoring environment (not on target hardware)

| Item | Value |
|---|---|
| Web UI production bundle | about 1.6 MB |
| Source tree (without dependencies) | about 5 MB |
| YOLO11n-cls ONNX | about 6 MB |

## Estimates, not measurements

| Item | Estimate |
|---|---|
| Llama 3.2 1B 8da4w `.pte` | about 1.0 to 1.2 GB |
| APK without Llama | about 60 to 150 MB |
| Phone RAM with Llama loaded | about 1.5 to 2 GB |
| Phone decode speed | about 5 to 15 tokens per second on a mid-range phone |
| Raspberry Pi bundle | about 1.6 to 2.2 GB |

Replace each estimate with a measurement on the target device. Also record vision accuracy on lab and on field photos from `runs\NAME\eval\report.json`.
