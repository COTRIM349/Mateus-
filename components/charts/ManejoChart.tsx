"use client";

import { useState, type MouseEvent } from "react";
import {
  MANEJO_ALL,
  MANEJO_CHART_LAYOUT,
  MANEJO_GROUPS,
  cumulativeIrrigationMm,
  formatSeriesValue,
  phaseRanges,
  seriesHasData,
  seriesValue,
  type ManejoSeriesDef,
  type ManejoSeriesKey,
} from "@/modules/reports/services/manejo-chart";
import { hasEtp, type ManagementReportRow } from "@/modules/reports/services/management-report";

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

const PHASE_PALETTE = ["#1ea85b", "#3b82f6", "#eab308", "#f97316", "#14b8c9", "#84cc16", "#a855f7"];

function phaseColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % PHASE_PALETTE.length;
  return PHASE_PALETTE[h];
}

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
    <div className="border-b border-gray-100 p-4 lg:w-64 lg:shrink-0 lg:self-stretch lg:border-b-0 lg:border-r dark:border-white/[0.06]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-graphite-400 dark:text-gray-500">
        Séries
      </p>
      <div className="flex gap-0.5 rounded-lg bg-gray-100/70 p-0.5 dark:bg-white/[0.04]">
        {MANEJO_GROUPS.map((g) => (
          <button
            key={g.cat}
            type="button"
            onClick={() => setActiveCat(g.cat)}
            className={`flex-1 rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors ${activeCat === g.cat ? "bg-white text-graphite-800 shadow-xs dark:bg-white/[0.1] dark:text-white" : "text-graphite-400 hover:text-graphite-600 dark:text-gray-500"}`}
          >
            {g.cat}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[min(58vh,560px)] space-y-0.5 overflow-y-auto pr-1">
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
        Passe o mouse no gráfico para ver os valores do dia. Padrão: umidade, CC, segurança, ARM, irrigação, chuva, ETc e nota sensorial.
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
  const W = MANEJO_CHART_LAYOUT.width;
  const H = MANEJO_CHART_LAYOUT.height;
  const padL = 52, padR = 58, padT = 28, padB = 86;
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

  const bw = Math.min(8, Math.max(2.8, band * 0.34));
  const lineKeys = MANEJO_ALL
    .filter((s) => s.kind !== "bar" && s.kind !== "marker" && s.k !== "umidade")
    .map((s) => s.k)
    .concat("umidade" as ManejoSeriesKey);
  const step = Math.max(1, Math.ceil(n / 12));
  const activeVisible = MANEJO_ALL.filter((s) => visible[s.k]);
  const hasNorm = activeVisible.some((s) => s.axis === "norm");
  const segPct = rows.length ? rows[n - 1].safetyPctCc : 50;
  const phases = phaseRanges(rows);

  const extrasAt = (i: number) => ({
    cumulativeIrrigation: cum[i],
    phaseChanged: i > 0 && rows[i].phase !== rows[i - 1].phase,
  });

  const umidPts = visible.umidade
    ? rows
        .map((r, i) => {
          const v = seriesValue("umidade", r, extrasAt(i));
          if (v == null) return null;
          return { x: cx(i), y: yFor(MANEJO_ALL.find((d) => d.k === "umidade")!, v, yP, yM) };
        })
        .filter((p): p is { x: number; y: number } => p != null)
    : [];

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setHover(clampN(Math.round((svgX - x0) / band - 0.5), 0, n - 1));
  };

  return (
    <div className="relative min-h-[min(68vh,720px)]" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="h-full min-h-[min(68vh,720px)] overflow-visible">
        <defs>
          <linearGradient id="manejo-umid-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a5a2b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8a5a2b" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} className="fill-gray-50 dark:fill-black/25" rx={6} />
        <rect x={x0} y={yP(100)} width={x1 - x0} height={Math.max(0, yP(segPct) - yP(100))} fill="#1ea85b" opacity={0.08} />
        <rect x={x0} y={yP(segPct)} width={x1 - x0} height={Math.max(0, yP(segPct * 0.6) - yP(segPct))} fill="#f97316" opacity={0.08} />
        <rect x={x0} y={yP(segPct * 0.6)} width={x1 - x0} height={Math.max(0, yP(0) - yP(segPct * 0.6))} fill="#e5484d" opacity={0.07} />
        {[0, 25, 50, 75, 100, 125].map((p) => (
          <g key={p}>
            <line x1={x0} x2={x1} y1={yP(p)} y2={yP(p)} className="stroke-gray-200 dark:stroke-white/[0.07]" strokeWidth={1} />
            <text x={x0 - 8} y={yP(p) + 4} textAnchor="end" className="fill-graphite-400 text-[11px] tabular-nums dark:fill-gray-500">{p}</text>
          </g>
        ))}
        <text x={x0 - 8} y={y0 - 8} textAnchor="end" className="fill-graphite-500 text-[11px] font-bold dark:fill-gray-400">%CC</text>
        {[0, mmMax / 2, mmMax].map((v) => (
          <text key={v} x={x1 + 8} y={yM(v) + 4} className="fill-graphite-400 text-[11px] tabular-nums dark:fill-gray-500">{Math.round(v)}</text>
        ))}
        <text x={x1 + 8} y={y0 - 8} className="fill-graphite-500 text-[11px] font-bold dark:fill-gray-400">mm</text>

        {rows.map((r, i) => (
          <g key={i}>
            {visible.chuva && r.rainMm > 0 && (
              <rect x={cx(i) - bw - 0.8} y={yM(r.rainMm)} width={bw} height={y1 - yM(r.rainMm)} rx={1.5} fill="#2f6bff" opacity={0.88} />
            )}
            {visible.irrig && r.irrigationGrossMm > 0 && (
              <rect x={cx(i) + 0.8} y={yM(r.irrigationGrossMm)} width={bw} height={y1 - yM(r.irrigationGrossMm)} rx={1.5} fill="#14b8c9" opacity={0.95} />
            )}
          </g>
        ))}

        {umidPts.length > 1 && (
          <path
            d={`M ${umidPts[0].x},${y1} ${umidPts.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${umidPts[umidPts.length - 1].x},${y1} Z`}
            fill="url(#manejo-umid-fill)"
          />
        )}

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
          const hero = k === "umidade" || k === "cc" || k === "seg";
          return (
            <polyline
              key={k}
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth={k === "umidade" ? 3.1 : hero ? 2.2 : 1.7}
              strokeDasharray={s.kind === "dash" ? "6 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        <line x1={x0} x2={x1} y1={y1} y2={y1} className="stroke-gray-300 dark:stroke-white/15" strokeWidth={1.2} />

        {visible.sensorial && rows.map((r, i) => {
          if (r.sensoryNote == null) return null;
          return (
            <g key={`sens${i}`}>
              <circle cx={cx(i)} cy={y0 + 14} r={9} fill="#a855f7" />
              <text x={cx(i)} y={y0 + 18} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">{r.sensoryNote}</text>
            </g>
          );
        })}

        {visible.fase && rows.map((r, i) => {
          if (i === 0 || r.phase === rows[i - 1].phase) return null;
          return (
            <g key={`fase${i}`}>
              <line x1={cx(i)} x2={cx(i)} y1={y0} y2={y1} stroke="#84cc16" strokeWidth={1.2} strokeDasharray="3 4" opacity={0.7} />
            </g>
          );
        })}

        {phases.map((ph) => {
          const xStart = cx(ph.start) - band / 2;
          const xEnd = cx(ph.end) + band / 2;
          const color = phaseColor(ph.phase);
          return (
            <g key={`${ph.phase}-${ph.start}`}>
              <rect x={xStart} y={y1 + 22} width={Math.max(4, xEnd - xStart)} height={10} rx={2} fill={color} opacity={0.85} />
              {xEnd - xStart > 48 && (
                <text x={(xStart + xEnd) / 2} y={y1 + 30} textAnchor="middle" className="fill-white text-[8px] font-bold">
                  {ph.phase}
                </text>
              )}
            </g>
          );
        })}

        {rows.map((r, i) => (i % step === 0 || i === n - 1) && (
          <text key={`d${i}`} x={cx(i)} y={H - 14} textAnchor="middle" className="fill-graphite-400 text-[10px] dark:fill-gray-500">{fmtDia(r.date)}</text>
        ))}

        {hover != null && rows[hover] && (
          <g>
            <line x1={cx(hover)} x2={cx(hover)} y1={y0} y2={y1} className="stroke-brand-500/70" strokeWidth={1.4} strokeDasharray="4 3" />
            {activeVisible.filter((s) => s.kind !== "bar" && s.kind !== "marker").map((s) => {
              const v = seriesValue(s.k, rows[hover], extrasAt(hover));
              if (v == null) return null;
              return <circle key={s.k} cx={cx(hover)} cy={yFor(s, v, yP, yM)} r={3.4} fill={s.color} stroke="#fff" strokeWidth={1.3} />;
            })}
          </g>
        )}
      </svg>

      {hover != null && rows[hover] && (
        <div
          className="pointer-events-none absolute top-3 z-10 min-w-[188px] -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-950/92 p-3 shadow-elevated backdrop-blur"
          style={{ left: `${(cx(hover) / W) * 100}%` }}
        >
          <p className="mb-1.5 text-[12px] font-bold text-white">
            {fmtDia(rows[hover].date)} <span className="font-normal text-white/55">· {rows[hover].phase}</span>
          </p>
          <div className="space-y-1">
            {activeVisible.filter((s) => s.k !== "fase" && (s.k !== "sensorial" || rows[hover].sensoryNote != null)).map((s) => (
              <div key={s.k} className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-white/70">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-white">
                  {formatSeriesValue(s.k, rows[hover], { cumulativeIrrigation: cum[hover] })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
        {activeVisible.filter((s) => s.k !== "fase").map((s) => (
          <span key={s.k} className="inline-flex items-center gap-1.5 text-[11px] text-graphite-500 dark:text-gray-400">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {hasNorm && (
        <p className="mt-1 text-[10px] text-graphite-300 dark:text-gray-600">Séries de clima/cultura em escala relativa — valor real no tooltip.</p>
      )}
    </div>
  );
}
