import { describe, expect, it } from "vitest";
import {
  isNegativeLabel,
  isPlantPixel,
  screenDetection,
} from "../src/engine/core/crop";
import type { RawDetection } from "../src/engine/core/types";

const leaf: RawDetection = {
  class_id: 1,
  label: "Early Blight",
  confidence: 0.8,
  model: "plantvillage-all/vision.onnx",
};

describe("plant colour", () => {
  it("counts green and yellow-brown leaf colours", () => {
    expect(isPlantPixel(60, 160, 50)).toBe(true);
    expect(isPlantPixel(180, 150, 60)).toBe(true);
  });
  it("ignores grey, blue, red, skin tones and darkness", () => {
    expect(isPlantPixel(128, 128, 128)).toBe(false);
    expect(isPlantPixel(40, 80, 200)).toBe(false);
    expect(isPlantPixel(200, 40, 40)).toBe(false);
    expect(isPlantPixel(224, 172, 105)).toBe(false);
    expect(isPlantPixel(10, 30, 10)).toBe(false);
  });
});

describe("not a leaf or insect labels", () => {
  it("recognises negative class names", () => {
    expect(isNegativeLabel("Not a leaf or insect")).toBe(true);
    expect(isNegativeLabel("background")).toBe(true);
    expect(isNegativeLabel("Non plant")).toBe(true);
    expect(isNegativeLabel("Early Blight")).toBe(false);
    expect(isNegativeLabel("Notch Spot")).toBe(false);
  });
});

describe("screenDetection", () => {
  it("keeps a confident answer and the other models", () => {
    const out = screenDetection({
      ...leaf,
      plant_ratio: 0.4,
      alternatives: [{ class_id: 2, label: "Aphid", confidence: 0.5 }],
    });
    expect(out?.label).toBe("Early Blight");
    expect(out?.alternatives).toHaveLength(1);
    expect(out?.plant_ratio).toBe(0.4);
  });
  it("rejects a weak top answer", () => {
    expect(screenDetection({ ...leaf, confidence: 0.39 })).toBeNull();
    expect(screenDetection({ ...leaf, confidence: 0.4 })).not.toBeNull();
  });
  it("rejects a photo with almost no plant colour unless a model is very sure", () => {
    expect(screenDetection({ ...leaf, plant_ratio: 0.02 })).toBeNull();
    expect(
      screenDetection({ ...leaf, confidence: 0.95, plant_ratio: 0.02 }),
    ).not.toBeNull();
  });
  it("rejects a photo with no plant colour even when a model is sure", () => {
    expect(
      screenDetection({ ...leaf, confidence: 0.99, plant_ratio: 0.0007 }),
    ).toBeNull();
  });
  it("does not gate on colour when the ratio is unknown", () => {
    expect(screenDetection(leaf)).not.toBeNull();
  });
  it("rejects when every model says not a leaf or insect", () => {
    const out = screenDetection({
      class_id: 0,
      label: "Not a leaf or insect",
      confidence: 0.97,
      alternatives: [
        { class_id: 0, label: "Not a leaf or insect", confidence: 0.9 },
      ],
    });
    expect(out).toBeNull();
  });
  it("lets another model win when only one says not a leaf or insect", () => {
    const out = screenDetection({
      class_id: 0,
      label: "Not a leaf or insect",
      confidence: 0.95,
      alternatives: [
        { class_id: 7, label: "Colomerus vitis", confidence: 0.92 },
      ],
    });
    expect(out?.label).toBe("Colomerus vitis");
    expect(out?.alternatives).toHaveLength(0);
  });
});
