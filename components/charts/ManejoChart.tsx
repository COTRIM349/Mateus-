"use client";

import { useState, type MouseEvent } from "react";
import {
  MANEJO_ALL,
  MANEJO_CHART_LAYOUT,
  MANEJO_GROUPS,
  MANEJO_PRESET_OPTIONS,
  MANEJO_VIEW_OPTIONS,
  cumulativeIrrigationMm,
  formatManejoDate,
  formatPtNumber,
  formatSeriesValue,
  legendLabel,
  mmAxisMax,
  mmAxisTicks,
  seriesHasData,
  seriesValue,
  stepAfterPath,
  summarizeManejoKpis,
  visibilityMatchesDefault,
  type ManejoKpis,
  type ManejoSeriesDef,
  type ManejoSeriesKey,
} from "@/modules/reports/services/manejo-chart";
import { hasEtp, type ManagementReportRow } from "@/modules/reports/services/management-report";

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function yFor(s: ManejoSeriesDef, v: number, yP: (p: number) => number, yM: (v: number) => number) {
  if (s.axis === "pct") return yP(v);
  if (s.axis === "mm") return yM(v);
  const [lo, hi] = s.norm ?? [0, 1];
  return yP(clampN(((v - lo) / (hi - lo)) * 100, 0, 100));
}

const KPI_ITEMS: Array<{ key: keyof ManejoKpis; label: string; render: (k: ManejoKpis) => string }> = [
  { key: "daysManaged", label: "Dias Manejados", render: (k) => String(k.daysManaged) },
  { key: "daysPlanted", label: "Dias Plantados", render: (k) => k.daysPlanted != null ? String(k.daysPlanted) : "—" },
  { key: "irrigationMm", label: "Irrigação", render: (k) => `${formatPtNumber(k.irrigationMm, 2)} mm` },
  { key: "rainMm", label: "Chuva", render: (k) => `${formatPtNumber(k.rainMm, 2)} mm` },
  {
    key: "effectiveIrrigationMm",
    label: "Irrigação Efetiva",
    render: (k) => k.effectiveIrrigationPct != null
      ? `${formatPtNumber(k.effectiveIrrigationMm, 2)} mm (${formatPtNumber(k.effectiveIrrigationPct, 2)}%)`
      : `${formatPtNumber(k.effectiveIrrigationMm, 2)} mm`,
  },
  { key: "etpMm", label: "ETp", render: (k) => `${formatPtNumber(k.etpMm, 2)} mm` },
  { key: "etcMm", label: "ETc", render: (k) => `${formatPtNumber(k.etcMm, 2)} mm` },
  { key: "stressIndexPct", label: "Índice de Stress", render: (k) => k.stressIndexPct != null ? `${formatPtNumber(k.stressIndexPct, 2)}%` : "—" },
];

export function ManejoResultHeader({
  title,
  kpis,
}: {
  title: string;
  kpis: ManejoKpis;
}) {
  return (
    <div className="border-b border-slate-200 bg-white px-5 py-3.5">
      <h2 className="text-[18px] font-bold tracking-tight text-[#1d4ed8]">{title}</h2>
      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
        {KPI_ITEMS.map((item) => (
          <div key={item.key} className="min-w-[4.5rem]">
            <p className="text-[11px] text-slate-500">{item.label}</p>
            <p className="mt-0.5 text-[13.5px] font-bold tabular-nums text-[#1e40af]">{item.render(kpis)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ManejoSeriesPicker({
  visible,
  onToggle,
  onReset,
  rows,
}: {
  visible: Record<ManejoSeriesKey, boolean>;
  onToggle: (k: ManejoSeriesKey) => void;
  onReset?: () => void;
  rows: ManagementReportRow[];
}) {
  const [activeCat, setActiveCat] = useState<(typeof MANEJO_GROUPS)[number]["cat"]>("Solo");
  const etpOn = hasEtp(rows);
  const isDefault = visibilityMatchesDefault(visible);

  return (
    <div className="border-b border-slate-200 bg-white p-3.5 lg:w-[232px] lg:shrink-0 lg:self-stretch lg:border-b-0 lg:border-r">
      <div className="space-y-2">
        <select
          aria-label="Eixo do gráfico"
          className="w-full rounded border border-[#2f6bff] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#1d4ed8] outline-none"
          defaultValue="umidade_cc"
        >
          {MANEJO_VIEW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          aria-label="Pré-definição das séries"
          className="w-full rounded border border-[#2f6bff] bg-white px-2 py-1.5 text-[12px] font-semibold text-[#1d4ed8] outline-none"
          value={isDefault ? "padrao" : "personalizado"}
          onChange={(e) => {
            if (e.target.value === "padrao") onReset?.();
          }}
        >
          {MANEJO_PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex gap-0 border-b border-slate-200">
        {MANEJO_GROUPS.map((g) => (
          <button
            key={g.cat}
            type="button"
            onClick={() => setActiveCat(g.cat)}
            className={`flex-1 px-0.5 pb-1.5 text-[10.5px] font-semibold transition-colors ${
              activeCat === g.cat
                ? "border-b-2 border-slate-900 text-slate-900"
                : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            {g.cat}
          </button>
        ))}
      </div>
      <div className="mt-2 max-h-[min(58vh,520px)] space-y-0.5 overflow-y-auto pr-1">
        {MANEJO_GROUPS.find((g) => g.cat === activeCat)!.items.map((s) => {
          const on = visible[s.k];
          const pending = s.k === "etp" ? !etpOn : !seriesHasData(s.k, rows) && s.k !== "cc" && s.k !== "pmp" && s.k !== "fase";
          const disabled = s.k === "etp" && !etpOn;
          return (
            <button
              key={s.k}
              type="button"
              onClick={() => !disabled && onToggle(s.k)}
              aria-pressed={on}
              disabled={disabled}
              title={disabled ? "Sem ETP no dado climático" : undefined}
              className={`flex w-full items-center gap-2 rounded px-1 py-1.5 text-left ${disabled ? "cursor-default opacity-50" : "hover:bg-slate-50"}`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-[2px] border"
                style={{ borderColor: disabled ? "#cbd5e1" : s.color, background: on && !disabled ? s.color : "transparent" }}
              />
              <span className={`text-[11.5px] leading-snug ${on && !disabled ? "font-semibold text-slate-800" : "text-slate-500"}`}>
                {s.label}
              </span>
              {pending && s.k === "etp" && (
                <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-slate-400">sem dado</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClockMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={6.2} fill="#dc2626" />
      <circle r={4.4} fill="#fff" />
      <path d="M0,-2.4 V0.6 L1.8 1.8" fill="none" stroke="#dc2626" strokeWidth={1.15} strokeLinecap="round" />
    </g>
  );
}

function FlagMark({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d="M-1.2 8 V-7 H6.5 L4.6 -3.2 L6.5 0.6 H-1.2" fill={fill} />
      <line x1={-1.2} y1={-7} x2={-1.2} y2={8} stroke="#7c2d12" strokeWidth={1.1} />
    </g>
  );
}

function ExcessMark({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-5.5} y={-6.5} width={11} height={13} rx={1.5} fill="#dc2626" />
      <text x={0} y={3.2} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800">!</text>
    </g>
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
  const { padL, padR, padT, padB, pctMax } = MANEJO_CHART_LAYOUT;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const n = rows.length || 1;
  const band = (x1 - x0) / n;
  const cx = (i: number) => x0 + band * i + band / 2;
  const cum = cumulativeIrrigationMm(rows);

  const yP = (p: number) => y1 - (clampN(p, 0, pctMax) / pctMax) * (y1 - y0);
  const mmCandidates = rows.flatMap((r, i) => [
    r.rainMm, r.irrigationGrossMm, r.etcMm, r.etoMm, r.etpMm ?? 0,
    r.cadMm, r.afdMm, r.armMm, r.recommendedGrossMm, cum[i],
  ]);
  const mmMax = mmAxisMax(mmCandidates);
  const yM = (v: number) => y1 - (clampN(v, 0, mmMax) / mmMax) * (y1 - y0);
  const mmTicks = mmAxisTicks(mmMax);

  const bw = Math.min(5.2, Math.max(1.5, band * 0.22));
  const lineDefs = MANEJO_ALL.filter((s) => s.kind !== "bar" && s.kind !== "marker");
  const dateStep = Math.max(1, Math.ceil(n / 28));
  const activeVisible = MANEJO_ALL.filter((s) => visible[s.k]);
  const hasNorm = activeVisible.some((s) => s.axis === "norm");

  const extrasAt = (i: number) => ({
    cumulativeIrrigation: cum[i],
    phaseChanged: i > 0 && rows[i].phase !== rows[i - 1].phase,
  });

  const linePts = (k: ManejoSeriesKey) => {
    const s = MANEJO_ALL.find((d) => d.k === k)!;
    return rows
      .map((r, i) => {
        const v = seriesValue(k, r, extrasAt(i));
        if (v == null) return null;
        return { x: cx(i), y: yFor(s, v, yP, yM) };
      })
      .filter((p): p is { x: number; y: number } => p != null);
  };

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    setHover(clampN(Math.round((svgX - x0) / band - 0.5), 0, n - 1));
  };

  return (
    <div className="relative bg-white" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="h-full min-h-[min(62vh,640px)] overflow-visible">
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="#ffffff" />
        {[0, 25, 50, 75, 100, 125].map((p) => (
          <g key={p}>
            <line x1={x0} x2={x1} y1={yP(p)} y2={yP(p)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={x0 - 8} y={yP(p) + 4} textAnchor="end" fill="#64748b" fontSize="11">{p}%</text>
          </g>
        ))}
        <text x={x0 - 8} y={y0 - 6} textAnchor="end" fill="#334155" fontSize="11" fontWeight="700">%CC</text>
        {mmTicks.map((v) => (
          <text key={v} x={x1 + 8} y={yM(v) + 4} fill="#64748b" fontSize="11">{v}</text>
        ))}
        <text x={x1 + 8} y={y0 - 6} fill="#334155" fontSize="11" fontWeight="700">mm</text>

        {rows.map((r, i) => (
          <g key={`bar-${r.date}`}>
            {visible.chuva && r.rainMm > 0 && (
              <rect x={cx(i) - bw - 0.5} y={yM(r.rainMm)} width={bw} height={y1 - yM(r.rainMm)} fill="#1e4ea1" />
            )}
            {visible.irrig && r.irrigationGrossMm > 0 && (
              <rect x={cx(i) + 0.5} y={yM(r.irrigationGrossMm)} width={bw} height={y1 - yM(r.irrigationGrossMm)} fill="#5ec8d8" />
            )}
          </g>
        ))}

        {lineDefs.filter((s) => visible[s.k]).map((s) => {
          const pts = linePts(s.k);
          if (pts.length === 0) return null;
          const hero = s.k === "umidade" || s.k === "cc" || s.k === "seg";
          if (s.stepped) {
            return (
              <path
                key={s.k}
                d={stepAfterPath(pts)}
                fill="none"
                stroke={s.color}
                strokeWidth={hero ? 2.15 : 1.6}
                strokeLinejoin="miter"
                strokeLinecap="butt"
              />
            );
          }
          return (
            <polyline
              key={s.k}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={s.k === "umidade" ? 2.35 : hero ? 1.9 : 1.55}
              strokeDasharray={s.kind === "dash" ? "6 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="#94a3b8" strokeWidth={1.1} />

        {visible.irrig && band >= 6 && rows.map((r, i) => (
          r.irrigationGrossMm > 0 ? <ClockMark key={`clk-${r.date}`} x={cx(i)} y={y1 + 14} /> : null
        ))}
        {visible.sensorial && rows.map((r, i) => (
          r.sensoryNote != null ? <FlagMark key={`flg-${r.date}`} x={cx(i) + (r.irrigationGrossMm > 0 ? 9 : 0)} y={y1 + 14} fill="#f59e0b" /> : null
        ))}
        {visible.excesso && rows.map((r, i) => (
          r.surplusMm > 0 ? <ExcessMark key={`ex-${r.date}`} x={cx(i) - (r.irrigationGrossMm > 0 ? 9 : 0)} y={y1 + 14} /> : null
        ))}

        {visible.fase && rows.map((r, i) => {
          if (i === 0 || r.phase === rows[i - 1].phase) return null;
          return <line key={`fase-${r.date}`} x1={cx(i)} x2={cx(i)} y1={y0} y2={y1} stroke="#84cc16" strokeWidth={1.1} strokeDasharray="3 4" opacity={0.75} />;
        })}

        {rows.map((r, i) => (i % dateStep === 0 || i === n - 1) && (
          <text
            key={`d-${r.date}`}
            x={cx(i)}
            y={H - 8}
            textAnchor="end"
            fill="#64748b"
            fontSize="9.5"
            transform={`rotate(-90 ${cx(i)} ${H - 8})`}
          >
            {formatManejoDate(r.date)}
          </text>
        ))}

        {hover != null && rows[hover] && (
          <g>
            <line x1={cx(hover)} x2={cx(hover)} y1={y0} y2={y1} stroke="#2f6bff" strokeWidth={1.15} />
            {activeVisible.filter((s) => s.kind !== "bar" && s.kind !== "marker").map((s) => {
              const v = seriesValue(s.k, rows[hover], extrasAt(hover));
              if (v == null) return null;
              return <circle key={s.k} cx={cx(hover)} cy={yFor(s, v, yP, yM)} r={3.2} fill={s.color} stroke="#fff" strokeWidth={1.2} />;
            })}
          </g>
        )}
      </svg>

      {hover != null && rows[hover] && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[196px] -translate-x-1/2 rounded border-2 border-[#2f6bff] bg-white px-3 py-2 shadow-md"
          style={{ left: `${(cx(hover) / W) * 100}%` }}
        >
          <p className="mb-1.5 text-[12px] font-bold text-slate-800">{formatManejoDate(rows[hover].date)}</p>
          <div className="space-y-0.5">
            {activeVisible.filter((s) => s.k !== "fase" && (s.k !== "sensorial" || rows[hover].sensoryNote != null) && (s.k !== "excesso" || rows[hover].surplusMm > 0)).map((s) => (
              <div key={s.k} className="flex items-center justify-between gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatSeriesValue(s.k, rows[hover], { cumulativeIrrigation: cum[hover] })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-1 py-2">
        {activeVisible.filter((s) => s.k !== "fase").map((s) => (
          <span key={s.k} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
            {s.k === "sensorial" ? (
              <svg width="12" height="12" viewBox="-2 -8 12 18" aria-hidden>
                <path d="M-1.2 8 V-7 H6.5 L4.6 -3.2 L6.5 0.6 H-1.2" fill={s.color} />
              </svg>
            ) : s.k === "excesso" ? (
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-[#dc2626] text-[9px] font-extrabold text-white">!</span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
            )}
            {legendLabel(s)}
          </span>
        ))}
      </div>
      {hasNorm && (
        <p className="px-1 pb-2 text-[10px] text-slate-400">Séries de clima/cultura em escala relativa — valor real no tooltip.</p>
      )}
    </div>
  );
}

export function ManejoChartWorkspace({
  title,
  rows,
  visible,
  onToggle,
  onReset,
}: {
  title: string;
  rows: ManagementReportRow[];
  visible: Record<ManejoSeriesKey, boolean>;
  onToggle: (k: ManejoSeriesKey) => void;
  onReset: () => void;
}) {
  const kpis = summarizeManejoKpis(rows);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ManejoResultHeader title={title} kpis={kpis} />
      <div className="flex min-h-[min(72vh,calc(100vh-14rem))] flex-col lg:flex-row">
        <ManejoSeriesPicker rows={rows} visible={visible} onToggle={onToggle} onReset={onReset} />
        <div className="min-w-0 flex-1 p-2 sm:p-3">
          <ManejoChart rows={rows} visible={visible} />
        </div>
      </div>
    </div>
  );
}
