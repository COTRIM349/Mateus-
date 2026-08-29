"use client";

import type { ReactNode } from "react";
import type { ProjectionDayResult } from "@/modules/water-balance/agronomy";
import type { DailyBalanceRow } from "@/modules/water-balance/services";

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * exp;
}

interface ChartPoint {
  date: string;
  kind: "observed" | "forecast";
  dr: number | null;
  cra: number | null;
  cta: number | null;
  rain: number;
  irrigation: number;
  et0: number | null;
  etcPot: number | null;
  etcAdj: number | null;
  kc: number | null;
}

function buildPoints(rows: DailyBalanceRow[], projection: ProjectionDayResult[]): ChartPoint[] {
  const observed: ChartPoint[] = rows.map((r) => ({
    date: r.date,
    kind: "observed",
    dr: r.deficit,
    cra: r.afd,
    cta: r.cad,
    rain: r.precipitation,
    irrigation: r.irrigationApplied,
    et0: r.et0,
    etcPot: r.etcPotential ?? r.etc,
    etcAdj: r.etc,
    kc: r.kc,
  }));
  const forecast: ChartPoint[] = projection.map((p) => ({
    date: p.date,
    kind: "forecast",
    dr: p.drEndMm,
    cra: p.craMm,
    cta: p.ctaMm,
    rain: p.rainMm,
    irrigation: 0,
    et0: p.etcPotentialMm != null && p.kc != null && p.kc > 0 ? p.etcPotentialMm / p.kc : null,
    etcPot: p.etcPotentialMm,
    etcAdj: p.etcAdjustedMm,
    kc: p.kc ?? null,
  }));
  return [...observed, ...forecast];
}

function SvgFrame({
  title,
  subtitle,
  children,
  legend,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  legend: Array<{ color: string; dash?: string; label: string }>;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-graphite-900/40">
      <p className="text-[13px] font-bold text-graphite-900 dark:text-white">{title}</p>
      <p className="mt-0.5 text-[11px] text-graphite-400">{subtitle}</p>
      <div className="mt-3 overflow-x-auto">{children}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-graphite-500">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: l.color, borderBottom: l.dash ? `2px ${l.dash} ${l.color}` : undefined }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WaterBalanceCharts({
  rows,
  projection,
}: {
  rows: DailyBalanceRow[];
  projection: ProjectionDayResult[];
}) {
  const points = buildPoints(rows, projection);
  if (points.length === 0) return null;

  const w = Math.max(640, points.length * 28);
  const h = 220;
  const pad = { l: 42, r: 12, t: 12, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yDrMax = niceMax(Math.max(...points.map((p) => Math.max(p.cta ?? 0, p.dr ?? 0, p.cra ?? 0)), 1));
  const yEtMax = niceMax(Math.max(...points.map((p) => Math.max(p.et0 ?? 0, p.etcPot ?? 0, p.etcAdj ?? 0, (p.kc ?? 0) * 10)), 1));
  const yDr = (v: number) => pad.t + innerH - (v / yDrMax) * innerH;
  const yEt = (v: number) => pad.t + innerH - (v / yEtMax) * innerH;

  const polyline = (
    vals: Array<number | null>,
    color: string,
    yFn: (v: number) => number,
    dash?: string,
  ) => {
    const segs: string[] = [];
    let buf: string[] = [];
    points.forEach((_p, i) => {
      const v = vals[i];
      if (v == null || !Number.isFinite(v)) {
        if (buf.length) {
          segs.push(buf.join(" "));
          buf = [];
        }
        return;
      }
      buf.push(`${buf.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${yFn(v).toFixed(1)}`);
    });
    if (buf.length) segs.push(buf.join(" "));
    return segs.map((d, i) => (
      <path key={`${color}-${i}-${dash ?? "s"}`} d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dash} />
    ));
  };

  const splitIdx = points.findIndex((p) => p.kind === "forecast");
  const cra = points.find((p) => p.cra != null)?.cra ?? 0;
  const cta = points.find((p) => p.cta != null)?.cta ?? 0;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SvgFrame
        title="Balanço hídrico — depleção"
        subtitle="Realizado (linha contínua) versus previsto (tracejado). 0 mm = CC · CRA = limite de manejo · CTA = PMP."
        legend={[
          { color: "#2563eb", label: "Dr realizado" },
          { color: "#93c5fd", dash: "4 3", label: "Dr previsto" },
          { color: "#fb8c00", label: "CRA" },
          { color: "#111111", label: "CTA" },
          { color: "#38bdf8", label: "Chuva" },
          { color: "#06b6d4", label: "Irrigação" },
        ]}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[220px] w-full min-w-[520px]" role="img" aria-label="Gráfico de depleção">
          <line x1={pad.l} y1={yDr(0)} x2={w - pad.r} y2={yDr(0)} stroke="#2196F3" strokeWidth={1} />
          <line x1={pad.l} y1={yDr(cra)} x2={w - pad.r} y2={yDr(cra)} stroke="#fb8c00" strokeWidth={1} strokeDasharray="6 4" />
          <line x1={pad.l} y1={yDr(cta)} x2={w - pad.r} y2={yDr(cta)} stroke="#111" strokeWidth={1} strokeDasharray="2 3" />
          {points.map((p, i) => {
            const barW = Math.max(3, innerW / points.length / 5);
            return (
              <g key={`ev-${p.date}`}>
                {p.rain > 0 && <rect x={x(i) - barW - 1} y={yDr(p.rain)} width={barW} height={Math.max(0, yDr(0) - yDr(p.rain))} fill="#38bdf8" opacity={0.55} />}
                {p.irrigation > 0 && <rect x={x(i) + 1} y={yDr(p.irrigation)} width={barW} height={Math.max(0, yDr(0) - yDr(p.irrigation))} fill="#06b6d4" opacity={0.7} />}
              </g>
            );
          })}
          {polyline(points.map((p) => (p.kind === "observed" ? p.dr : null)), "#2563eb", yDr)}
          {polyline(points.map((p) => (p.kind === "forecast" ? p.dr : null)), "#93c5fd", yDr, "5 4")}
          {splitIdx > 0 && (
            <line x1={x(splitIdx)} y1={pad.t} x2={x(splitIdx)} y2={h - pad.b} stroke="#9ca3af" strokeDasharray="2 3" />
          )}
          {points.map((p, i) => (
            (i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 8) === 0) ? (
              <text key={`x-${p.date}`} x={x(i)} y={h - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">{fmtDia(p.date)}</text>
            ) : null
          ))}
          <text x={4} y={yDr(yDrMax) + 4} fontSize={9} fill="#9ca3af">{yDrMax.toFixed(0)}</text>
          <text x={4} y={yDr(0) + 4} fontSize={9} fill="#9ca3af">0</text>
        </svg>
      </SvgFrame>

      <SvgFrame
        title="Demanda — clima × cultura × estresse"
        subtitle="ETo (clima) · ETc potencial (cultura) · ETc ajustada (× Ks). Ks < 1 reduz a transpiração, não a necessidade agronômica."
        legend={[
          { color: "#64748b", label: "ETo" },
          { color: "#16a34a", label: "ETc potencial" },
          { color: "#dc2626", label: "ETc ajustada" },
          { color: "#7c3aed", label: "Kc × 10" },
        ]}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[220px] w-full min-w-[520px]" role="img" aria-label="Gráfico de demanda">
          {polyline(points.map((p) => (p.kind === "observed" ? p.et0 : null)), "#64748b", yEt)}
          {polyline(points.map((p) => (p.kind === "forecast" ? p.et0 : null)), "#94a3b8", yEt, "5 4")}
          {polyline(points.map((p) => p.etcPot), "#16a34a", yEt)}
          {polyline(points.map((p) => p.etcAdj), "#dc2626", yEt)}
          {polyline(points.map((p) => (p.kc != null ? p.kc * 10 : null)), "#7c3aed", yEt)}
          {splitIdx > 0 && (
            <line x1={x(splitIdx)} y1={pad.t} x2={x(splitIdx)} y2={h - pad.b} stroke="#9ca3af" strokeDasharray="2 3" />
          )}
          {points.map((p, i) => (
            (i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 8) === 0) ? (
              <text key={`dx-${p.date}`} x={x(i)} y={h - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">{fmtDia(p.date)}</text>
            ) : null
          ))}
          <text x={4} y={yEt(yEtMax) + 4} fontSize={9} fill="#9ca3af">{yEtMax.toFixed(0)}</text>
          <text x={4} y={yEt(0) + 4} fontSize={9} fill="#9ca3af">0</text>
        </svg>
      </SvgFrame>
    </div>
  );
}

export function ProjectionTable({ projection }: { projection: ProjectionDayResult[] }) {
  if (projection.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-graphite-400 dark:border-white/[0.08]">
        Sem previsão de ETo/chuva além do último dia realizado. A projeção não mistura dado previsto com o saldo realizado.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-white/[0.06]">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-amber-50/80 text-graphite-500 dark:bg-amber-950/20 dark:text-gray-400">
            <th className="px-3 py-2 font-semibold">Previsto</th>
            <th className="px-3 py-2 font-semibold">ETc pot.</th>
            <th className="px-3 py-2 font-semibold">Ks</th>
            <th className="px-3 py-2 font-semibold">ETc aj.</th>
            <th className="px-3 py-2 font-semibold">Chuva prev.</th>
            <th className="px-3 py-2 font-semibold">Dr fim</th>
            <th className="px-3 py-2 font-semibold">CRA</th>
            <th className="px-3 py-2 font-semibold">Origem</th>
          </tr>
        </thead>
        <tbody>
          {projection.map((p) => (
            <tr key={p.date} className="border-t border-gray-100 dark:border-white/[0.06]">
              <td className="px-3 py-2 tabular-nums">{fmtDia(p.date)}</td>
              <td className="px-3 py-2 tabular-nums">{p.etcPotentialMm != null ? p.etcPotentialMm.toFixed(2) : "Dado ausente: ETo/Kc"}</td>
              <td className="px-3 py-2 tabular-nums">{p.ks != null ? p.ks.toFixed(2) : "—"}</td>
              <td className="px-3 py-2 tabular-nums">{p.etcAdjustedMm != null ? p.etcAdjustedMm.toFixed(2) : "—"}</td>
              <td className="px-3 py-2 tabular-nums">{p.rainMm.toFixed(1)}</td>
              <td className="px-3 py-2 tabular-nums">{p.drEndMm != null ? p.drEndMm.toFixed(1) : "—"}</td>
              <td className="px-3 py-2 tabular-nums">{p.craMm != null ? p.craMm.toFixed(1) : "—"}</td>
              <td className="px-3 py-2 text-amber-700 dark:text-amber-400">previsão · não entra no realizado</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
