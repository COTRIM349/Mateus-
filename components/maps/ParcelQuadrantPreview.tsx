"use client";

import { isFullCircleParcel, sweepAngleDeg } from "@/modules/assignment/services";

/** Miniatura do setor: 0° = norte, horário. Só visual — a geometria real é a do pivô. */
export function ParcelQuadrantPreview({
  startDeg,
  endDeg,
}: {
  startDeg: number | null;
  endDeg: number | null;
}) {
  const full = isFullCircleParcel(startDeg, endDeg);
  const sweep = full ? 360 : sweepAngleDeg(startDeg as number, endDeg as number);
  const start = full ? 0 : ((startDeg as number) % 360 + 360) % 360;
  const r = 42;
  const cx = 50;
  const cy = 50;
  const polar = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  };
  const startPt = polar(start);
  const endPt = polar(start + sweep);
  const large = sweep > 180 ? 1 : 0;
  const d = full
    ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
    : `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${large} 1 ${endPt.x} ${endPt.y} Z`;

  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-gray-300 dark:text-white/20" strokeWidth="1.2" />
      <path d={d} fill="#2196F3" fillOpacity="0.35" stroke="#2196F3" strokeWidth="1.8" />
      <text x={cx} y="12" textAnchor="middle" className="fill-graphite-400 dark:fill-gray-500" fontSize="8">N</text>
    </svg>
  );
}
