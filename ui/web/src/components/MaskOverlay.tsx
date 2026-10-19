import type { VisionResult } from '../contracts/types';

interface Props {
  src: string;
  vision: VisionResult;
}

export function MaskOverlay({ src, vision }: Props) {
  const points = vision.mask_polygon.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <div className="relative overflow-hidden rounded-xl border border-line">
      <img src={src} alt="" className="block h-auto w-full" />
      {points ? (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <polygon points={points} fill="rgba(242,103,122,0.30)" stroke="#f2677a" strokeWidth="0.006" />
        </svg>
      ) : null}
    </div>
  );
}
