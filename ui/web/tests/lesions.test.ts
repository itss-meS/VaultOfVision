import { describe, expect, it } from "vitest";
import { findLesions, riskOf } from "../src/lib/lesions";

function image(
  w: number,
  h: number,
  paint: (x: number, y: number) => number[],
) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y) as [number, number, number];
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return data;
}

const LEAF = [60, 140, 60];
const SPOT = [120, 70, 30];
const SOIL = [110, 70, 40];

describe("findLesions", () => {
  it("boxes a brown patch on a green leaf", () => {
    const data = image(64, 64, (x, y) =>
      x >= 20 && x < 30 && y >= 24 && y < 34 ? SPOT : LEAF,
    );
    const r = findLesions(data, 64, 64);
    expect(r.boxes.length).toBe(1);
    const b = r.boxes[0];
    expect(b?.x).toBeCloseTo(20 / 64, 1);
    expect(b?.y).toBeCloseTo(24 / 64, 1);
    expect(r.affected).toBeGreaterThan(0.02);
  });

  it("finds nothing on a healthy leaf", () => {
    const data = image(64, 64, () => LEAF);
    expect(findLesions(data, 64, 64).boxes).toEqual([]);
  });

  it("ignores soil far from the leaf", () => {
    const data = image(64, 64, (x) =>
      x < 20 ? LEAF : x > 40 ? SOIL : [200, 200, 200],
    );
    expect(findLesions(data, 64, 64).boxes).toEqual([]);
  });

  it("finds nothing when there is no leaf", () => {
    const data = image(32, 32, () => SOIL);
    expect(findLesions(data, 32, 32).boxes).toEqual([]);
  });

  it("maps severity to risk", () => {
    expect(riskOf(null)).toBe("low");
    expect(riskOf(1)).toBe("low");
    expect(riskOf(3)).toBe("medium");
    expect(riskOf(5)).toBe("high");
  });
});
