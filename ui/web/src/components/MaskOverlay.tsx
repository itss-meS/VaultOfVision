import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VisionResult } from "../contracts/types";
import {
  findLesions,
  RISK_COLOR,
  riskOf,
  type LesionBox,
} from "../lib/lesions";

interface Props {
  src: string;
  vision: VisionResult;
}

const SIDE = 96;

function measure(src: string): Promise<LesionBox[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = SIDE / Math.max(img.naturalWidth, img.naturalHeight);
        const w = Math.max(8, Math.round(img.naturalWidth * scale));
        const h = Math.max(8, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve([]);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(findLesions(ctx.getImageData(0, 0, w, h).data, w, h).boxes);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

export function MaskOverlay({ src, vision }: Props) {
  const { t } = useTranslation();
  const [boxes, setBoxes] = useState<LesionBox[]>([]);
  const marked = !vision.low_confidence && vision.severity_level !== null;
  const risk = riskOf(vision.severity_level);
  const color = RISK_COLOR[risk];
  const points = vision.mask_polygon.map(([x, y]) => `${x},${y}`).join(" ");

  useEffect(() => {
    let live = true;
    setBoxes([]);
    if (marked)
      void measure(src).then((found) => {
        if (live) setBoxes(found);
      });
    return () => {
      live = false;
    };
  }, [src, marked]);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-3xl border border-line shadow-card">
        <img src={src} alt="" className="block h-auto w-full" />
        {points || boxes.length > 0 ? (
          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {points ? (
              <polygon
                points={points}
                fill="rgba(242,103,122,0.30)"
                stroke="#f2677a"
                strokeWidth="0.006"
              />
            ) : null}
            {boxes.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx="0.01"
                fill={color}
                fillOpacity="0.12"
                stroke={color}
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
      </div>
      {boxes.length > 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <svg viewBox="0 0 1 1" className="h-3 w-3" aria-hidden="true">
            <rect width="1" height="1" rx="0.15" fill={color} />
          </svg>
          {t(`result.risk.${risk}`)}
        </p>
      ) : null}
    </div>
  );
}
