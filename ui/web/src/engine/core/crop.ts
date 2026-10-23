import type { RawDetection } from "./types";

export interface CropGate {
  minTop: number;
  minPlant: number;
  sureTop: number;
}

export const DEFAULT_GATE: CropGate = {
  minTop: 0.4,
  minPlant: 0.04,
  sureTop: 0.9,
};

const NEGATIVE =
  /^(not a\b|not[ _-]?(leaf|plant|crop|insect)|non[ _-]?(plant|leaf)|background|negative)/i;

export function isPlantPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max < 38 || d === 0 || d / max < 0.15) return false;
  let h: number;
  if (max === r) h = (((g - b) / d) % 6) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  if (h < 0) h += 360;
  return h >= 40 && h <= 170;
}

export function isNegativeLabel(label: string): boolean {
  return NEGATIVE.test(label.trim());
}

export function screenDetection(
  det: RawDetection,
  gate: CropGate = DEFAULT_GATE,
): RawDetection | null {
  const kept = [det, ...(det.alternatives ?? [])]
    .filter((a) => !isNegativeLabel(a.label))
    .sort((a, b) => b.confidence - a.confidence);
  const best = kept[0];
  if (best === undefined || best.confidence < gate.minTop) return null;
  const plant = det.plant_ratio;
  if (
    plant !== undefined &&
    plant < gate.minPlant &&
    best.confidence < gate.sureTop
  )
    return null;
  const out: RawDetection = {
    class_id: best.class_id,
    label: best.label,
    confidence: best.confidence,
    bbox: det.bbox ?? [0, 0, 1, 1],
    mask_polygon: best === det ? (det.mask_polygon ?? []) : [],
    alternatives: kept.slice(1).map((a) => ({
      class_id: a.class_id,
      label: a.label,
      confidence: a.confidence,
      ...(a.model !== undefined ? { model: a.model } : {}),
    })),
    ...(best.model !== undefined ? { model: best.model } : {}),
    ...(det.leaf_polygon !== undefined
      ? { leaf_polygon: det.leaf_polygon }
      : {}),
    ...(plant !== undefined ? { plant_ratio: plant } : {}),
  };
  return out;
}
