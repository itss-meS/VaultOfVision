import type { RawDetection, VisionResult } from "./types";

function polygonArea(points: ReadonlyArray<readonly [number, number]>): number {
  const n = points.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (!a || !b) continue;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

export function levelFor(pct: number, thresholds: readonly number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    const t = thresholds[i];
    if (t !== undefined && pct < t) return i + 1;
  }
  return 5;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const round = (v: number, d: number): number =>
  Math.round(v * 10 ** d) / 10 ** d;

export function buildVisionResult(
  det: RawDetection,
  confThreshold: number,
  thresholds: readonly number[],
): VisionResult {
  const mask = det.mask_polygon ?? [];
  const leaf = det.leaf_polygon ?? [];
  const leafArea = polygonArea(leaf);
  const measured = leafArea > 0;
  const pct = measured
    ? Math.max(0, Math.min(100, (polygonArea(mask) / leafArea) * 100))
    : null;
  const low = det.confidence < confThreshold;
  const healthy = det.label.toLowerCase() === "healthy";
  const level =
    low || healthy || pct === null ? null : levelFor(pct, thresholds);
  const bbox = det.bbox ?? [0, 0, 0, 0];
  return {
    class_id: det.class_id,
    label: det.label,
    confidence: round(clamp01(det.confidence), 4),
    bbox: [
      clamp01(bbox[0]),
      clamp01(bbox[1]),
      clamp01(bbox[2]),
      clamp01(bbox[3]),
    ],
    mask_polygon: mask.slice(0, 2000).map(([x, y]) => [clamp01(x), clamp01(y)]),
    severity_level: level,
    low_confidence: low,
    affected_area_pct: pct === null ? null : round(pct, 2),
  };
}

export function unsupportedVision(): VisionResult {
  return {
    class_id: 0,
    label: "unsupported",
    confidence: 0,
    bbox: [0, 0, 0, 0],
    mask_polygon: [],
    severity_level: null,
    low_confidence: true,
    affected_area_pct: null,
  };
}
