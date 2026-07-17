"use client";

import { useId } from "react";

/**
 * Anel de progresso circular com conteúdo central opcional.
 * Vocabulário visual compartilhado de "instrumento" (linha iCrop).
 */
export function ProgressRing({
  value,
  max,
  color,
  size = 56,
  thickness = 6,
  children,
}: {
  value: number;
  max: number;
  color: string;
  size?: number;
  thickness?: number;
  children?: React.ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const offset = c * (1 - frac);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-gray-100 dark:stroke-white/[0.07]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}

/** Gauge semicircular (arco) com gradiente verde→amarelo→vermelho. */
export function ArcGauge({
  value,
  max,
  size = 74,
}: {
  value: number | null;
  max: number;
  size?: number;
}) {
  const gid = useId();
  const r = 40;
  const len = Math.PI * r;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <svg viewBox="0 0 100 64" width={size} height={size * 0.62} className="mx-auto">
      <defs>
        <linearGradient id={gid} x1="0" x2="1">
          <stop offset="0" stopColor="#57c98a" />
          <stop offset="0.5" stopColor="#f5b301" />
          <stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path
        d="M10 52 A40 40 0 0 1 90 52"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        className="stroke-gray-100 dark:stroke-white/[0.08]"
      />
      <path
        d="M10 52 A40 40 0 0 1 90 52"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(frac * len).toFixed(1)} ${len.toFixed(1)}`}
      />
    </svg>
  );
}
