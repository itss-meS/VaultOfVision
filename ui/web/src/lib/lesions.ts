export interface LesionBox {
  x: number;
  y: number;
  w: number;
  h: number;
  share: number;
}

export interface Lesions {
  boxes: LesionBox[];
  affected: number;
}

const MAX_BOXES = 4;
const CLOSE = 3;
const MIN_CELLS = 2;
const MAX_SHARE = 0.6;

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function isGreen(h: number, s: number, v: number): boolean {
  return h >= 60 && h <= 170 && s >= 0.1 && v >= 0.2;
}

function isDamage(h: number, s: number, v: number): boolean {
  if (v < 0.12) return false;
  if (s >= 0.22 && (h < 70 || h > 340)) return true;
  return v < 0.28 && s < 0.5;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 0) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
        }
    }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, r: number) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] === 0 ? 1 : 0;
  const grown = dilate(inv, w, h, r);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = grown[i] === 0 ? 1 : 0;
  return out;
}

function largest(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length);
  let best: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    const stack = [start];
    const members: number[] = [];
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      members.push(p);
      const x = p % w;
      const y = (p - x) / w;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (mask[q] === 1 && seen[q] === 0) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (members.length > best.length) best = members;
  }
  const out = new Uint8Array(mask.length);
  for (const p of best) out[p] = 1;
  return out;
}

function fillHoles(mask: Uint8Array, w: number, h: number) {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const q = y * w + x;
    if (mask[q] === 0 && outside[q] === 0) {
      outside[q] = 1;
      stack.push(q);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length > 0) {
    const p = stack.pop() as number;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = outside[i] === 1 ? 0 : 1;
  return out;
}

export function findLesions(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Lesions {
  const total = width * height;
  const green = new Uint8Array(total);
  const damage = new Uint8Array(total);
  let greenCount = 0;
  for (let i = 0; i < total; i++) {
    const [h, s, v] = hsv(
      rgba[i * 4] ?? 0,
      rgba[i * 4 + 1] ?? 0,
      rgba[i * 4 + 2] ?? 0,
    );
    if (isGreen(h, s, v)) {
      green[i] = 1;
      greenCount++;
    } else if (isDamage(h, s, v)) damage[i] = 1;
  }
  if (greenCount < total * 0.05) return { boxes: [], affected: 0 };
  const core = largest(green, width, height);
  const closed = erode(
    dilate(core, width, height, CLOSE),
    width,
    height,
    CLOSE,
  );
  const leaf = fillHoles(closed, width, height);
  const cells = new Uint8Array(total);
  let lesionCount = 0;
  let leafCount = 0;
  for (let i = 0; i < total; i++) {
    if (leaf[i] === 0) continue;
    leafCount++;
    if (green[i] === 0 && damage[i] === 1) {
      cells[i] = 1;
      lesionCount++;
    }
  }
  const joined = dilate(cells, width, height, 1);
  const seen = new Uint8Array(total);
  const found: LesionBox[] = [];
  for (let start = 0; start < total; start++) {
    if (joined[start] === 0 || seen[start] === 1) continue;
    const stack = [start];
    seen[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let count = 0;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p - x) / width;
      if (cells[p] === 1) count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (joined[q] === 1 && seen[q] === 0) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (count < MIN_CELLS) continue;
    if (count > leafCount * MAX_SHARE) continue;
    found.push({
      x: minX / width,
      y: minY / height,
      w: (maxX - minX + 1) / width,
      h: (maxY - minY + 1) / height,
      share: count / total,
    });
  }
  found.sort((a, b) => b.share - a.share);
  return {
    boxes: found.slice(0, MAX_BOXES),
    affected: leafCount === 0 ? 0 : lesionCount / leafCount,
  };
}

export type Risk = "low" | "medium" | "high";

export function riskOf(level: number | null): Risk {
  if (level === null || level <= 2) return "low";
  if (level === 3) return "medium";
  return "high";
}

export const RISK_COLOR: Record<Risk, string> = {
  low: "#2e9e5b",
  medium: "#e0a100",
  high: "#e5484d",
};
