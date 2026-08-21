"use client";

import { useState, type MouseEvent } from "react";
import {
  MANEJO_ALL,
  MANEJO_GROUPS,
  cumulativeIrrigationMm,
  formatSeriesValue,
  seriesHasData,
  seriesValue,
  type ManejoSeriesDef,
  type ManejoSeriesKey,
} from "@/modules/reports/services/manejo-chart";
import { hasEtp, type ManagementReportRow } from "@/modules/reports/services/management-report";

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function yFor(s: ManejoSeriesDef, v: number, yP: (p: number) => number, yM: (v: number) => number) {
  if (s.axis === "pct") return yP(v);
  if (s.axis === "mm") return yM(v);
  const [lo, hi] = s.norm ?? [0, 1];
  return yP(clampN(((v - lo) / (hi - lo)) * 100, 0, 100));
}

export function ManejoSeriesPicker({
  visible,
  onToggle,
  rows,
}: {
  visible: Record<ManejoSeriesKey, boolean>;
  onToggle: (k: ManejoSeriesKey) => void;
  rows: ManagementReportRow[];
}) {
  const [activeCat, setActiveCat] = useState<(typeof MANEJO_GROUPS)[number]["cat"]>("Solo");
  const etpOn = hasEtp(rows);

  return (
    <div className="border-b border-gray-100 p-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r dark:border-white/[0.06]">
      <div className="flex gap-0.5 rounded-lg bg-gray-100/70 p-0.5 dark:bg-white/[0.04]">
        {MANEJO_GROUPS.map((g) => (
          <button
            key={g.cat}
            type="button"
            onClick={() => setActiveCat(g.cat)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${activeCat === g.cat ? "bg-white text-graphite-800 shadow-xs dark:bg-white/[0.1] dark:text-white" : "text-graphite-400 hover:text-graphite-600 dark:text-gray-500"}`}
          >
            {g.cat}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[300px] space-y-0.5 overflow-y-auto pr-1">
        {MANEJO_GROUPS.find((g) => g.cat === activeCat)!.items.map((s) => {
          const on = visible[s.k];
          const pending = s.k === "etp" ? !etpOn : !seriesHasData(s.k, rows) && s.k !== "cc" && s.k !== "fase";
          const disabled = s.k === "etp" && !etpOn;
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => !disabled && onToggle(s.k)}
              aria-pressed={on}
              disabled={disabled}
              title={disabled ? "Sem ETP no dado climático" : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors ${disabled ? "cursor-default opacity-50" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"}`}
            >
              <span
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border"
                style={{ borderColor: disabled ? "#cbd5e1" : s.color, background: on && !disabled ? s.color : "transparent" }}
              >
                {on && !disabled && (
                  <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={`text-[12px] ${on && !disabled ? "font-semibold text-graphite-700 dark:text-gray-200" : "text-graphite-400 dark:text-gray-500"}`}>
                {s.label}
              </span>
              {pending && (
                <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-graphite-300 dark:text-gray-600">
                  {s.k === "etp" ? "sem dado" : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 border-t border-gray-100 pt-2.5 text-[10px] leading-relaxed text-graphite-300 dark:border-white/[0.06] dark:text-gray-600">
        Passe o mouse no gráfico para ver os valores do dia. Padrão: umidade, ARM, irrigação, chuva, ETc e nota sensorial.
      </p>
    </div>
  );
}

export function ManejoChart({
  rows,
  visible,
}: {
  rows: ManagementReportRow[];
  visible: Record<ManejoSeriesKey, boolean>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 940, H = 350, padL = 44, padR = 52, padT = 20, padB = 42;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const n = rows.length || 1;
  const band = (x1 - x0) / n;
  const cx = (i: number) => x0 + band * i + band / 2;
  const cum = cumulativeIrrigationMm(rows);

  const yP = (p: number) => y1 - (clampN(p, 0, 125) / 125) * (y1 - y0);
  const mmCandidates = rows.flatMap((r, i) => [
    r.rainMm, r.irrigationGrossMm, r.etcMm, r.etoMm, r.etpMm ?? 0,
    r.cadMm, r.afdMm, r.armMm, r.recommendedGrossMm, cum[i],
  ]);
  const mmMax = Math.max(10, Math.ceil(Math.max(1, ...mmCandidates) / 10) * 10);
  const yM = (v: number) => y1 - (clampN(v, 0, mmMax) / mmMax) * (y1 - y0);

  const bw = Math.min(4, band * 0.28);
  const lineKeys = MANEJO_ALL
    .filter((s) => s.kind !== "bar" && s.kind !== "marker" && s.k !== "umidade")
    .map((s) => s.k)
    .concat("umidade" as ManejoSeriesKey);
  const step = Math.max(1, Math.ceil(n / 9));
  const activeVisible = MANEJO_ALL.filter((s) => visible[s.k]);
  const hasNorm = activeVisible.some((s) => s.axis === "norm");
  const segPct = rows.length ? rows[n - 1].safetyPctCc : 50;

  const extrasAt = (i: number) => ({
    cumulativeIrrigation: cum[i],
    phaseChanged: i > 0 && rows[i].phase !== rows[i - 1].phase,
  });

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setHover(clampN(Math.round((svgX - x0) / band - 0.5), 0, n - 1));
  };

  return (
    <div className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible">
        <rect x={x0} y={yP(100)} width={x1 - x0} height={Math.max(0, yP(segPct) - yP(100))} fill="#1ea85b" opacity={0.05} />
        <rect x={x0} y={yP(segPct)} width={x1 - x0} height={Math.max(0, yP(segPct * 0.6) - yP(segPct))} fill="#f97316" opacity={0.05} />
        <rect x={x0} y={yP(segPct * 0.6)} width={x1 - x0} height={Math.max(0, yP(0) - yP(segPct * 0.6))} fill="#e5484d" opacity={0.05} />
        {[0, 25, 50, 75, 100, 125].map((p) => (
          <g key={p}>
            <line x1={x0} x2={x1} y1={yP(p)} y2={yP(p)} className="stroke-gray-100 dark:stroke-white/[0.05]" strokeWidth={1} />
            <text x={x0 - 6} y={yP(p) + 3} textAnchor="end" className="fill-graphite-300 text-[9px] dark:fill-gray-600">{p}</text>
          </g>
        ))}
        <text x={x0 - 6} y={y0 - 7} textAnchor="end" className="fill-graphite-400 text-[9px] font-semibold dark:fill-gray-500">%CC</text>
        {[0, mmMax / 2, mmMax].map((v) => (
          <text key={v} x={x1 + 7} y={yM(v) + 3} className="fill-graphite-300 text-[9px] dark:fill-gray-600">{Math.round(v)}</text>
        ))}
        <text x={x1 + 7} y={y0 - 7} className="fill-graphite-400 text-[9px] font-semibold dark:fill-gray-500">mm</text>

        {rows.map((r, i) => (
          <g key={i}>
            {visible.chuva && r.rainMm > 0 && (
              <rect x={cx(i) - bw - 0.6} y={yM(r.rainMm)} width={bw} height={y1 - yM(r.rainMm)} rx={1} fill="#2f6bff" opacity={0.85} />
            )}
            {visible.irrig && r.irrigationGrossMm > 0 && (
              <rect x={cx(i) + 0.6} y={yM(r.irrigationGrossMm)} width={bw} height={y1 - yM(r.irrigationGrossMm)} rx={1} fill="#14b8c9" opacity={0.9} />
            )}
          </g>
        ))}

        {lineKeys.filter((k) => visible[k]).map((k) => {
          const s = MANEJO_ALL.find((d) => d.k === k)!;
          const pts = rows
            .map((r, i) => {
              const v = seriesValue(k, r, extrasAt(i));
              if (v == null) return null;
              return `${cx(i)},${yFor(s, v, yP, yM)}`;
            })
            .filter((p): p is string => p != null)
            .join(" ");
          if (!pts) return null;
          return (
            <polyline
              key={k}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={k === "umidade" || k === "arm" ? 2.3 : 1.5}
              strokeDasharray={s.kind === "dash" ? "5 3" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        <line x1={x0} x2={x1} y1={y1} y2={y1} className="stroke-gray-200 dark:stroke-white/[0.1]" strokeWidth={1} />

        {visible.sensorial && rows.map((r, i) => {
          if (r.sensoryNote == null) return null;
          return (
            <g key={`sens${i}`}>
              <circle cx={cx(i)} cy={y0 + 12} r={8} fill="#a855f7" />
              <text x={cx(i)} y={y0 + 15.5} textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700">{r.sensoryNote}</text>
            </g>
          );
        })}

        {visible.fase && rows.map((r, i) => {
          if (i === 0 || r.phase === rows[i - 1].phase) return null;
          return (
            <g key={`fase${i}`}>
              <line x1={cx(i)} x2={cx(i)} y1={y0} y2={y1} stroke="#84cc16" strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
            </g>
          );
        })}

        {rows.map((r, i) => (i % step === 0 || i === n - 1) && (
          <text key={`d${i}`} x={cx(i)} y={H - 12} textAnchor="middle" className="fill-graphite-400 text-[9px] dark:fill-gray-500">{fmtDia(r.date)}</text>
        ))}

        {hover != null && rows[hover] && (
          <g>
            <line x1={cx(hover)} x2={cx(hover)} y1={y0} y2={y1} className="stroke-graphite-300 dark:stroke-white/20" strokeWidth={1} strokeDasharray="3 3" />
            {activeVisible.filter((s) => s.kind !== "bar" && s.kind !== "marker").map((s) => {
              const v = seriesValue(s.k, rows[hover], extrasAt(hover));
              if (v == null) return null;
              return <circle key={s.k} cx={cx(hover)} cy={yFor(s, v, yP, yM)} r={2.6} fill={s.color} stroke="#fff" strokeWidth={1} />;
            })}
          </g>
        )}
      </svg>

      {hover != null && rows[hover] && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[160px] -translate-x-1/2 rounded-xl border border-gray-100 bg-white/95 p-2.5 shadow-elevated backdrop-blur dark:border-white/[0.1] dark:bg-graphite-800/95"
          style={{ left: `${(cx(hover) / W) * 100}%` }}
        >
          <p className="mb-1.5 text-[11px] font-bold text-graphite-800 dark:text-white">
            {fmtDia(rows[hover].date)} <span className="font-normal text-graphite-400">· {rows[hover].phase}</span>
          </p>
          <div className="space-y-1">
            {activeVisible.filter((s) => s.k !== "fase" && (s.k !== "sensorial" || rows[hover].sensoryNote != null)).map((s) => (
              <div key={s.k} className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-graphite-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-graphite-800 dark:text-gray-100">
                  {formatSeriesValue(s.k, rows[hover], { cumulativeIrrigation: cum[hover] })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasNorm && (
        <p className="mt-1 text-[10px] text-graphite-300 dark:text-gray-600">Séries de clima/cultura em escala relativa — valor real no tooltip.</p>
      )}
    </div>
  );
}
