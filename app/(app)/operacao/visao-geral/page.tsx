"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, EmptyState } from "@/components/ui";
import { ProgressRing } from "@/components/ui/instruments";
import { useAuth } from "@/components/providers";
import { useFarmHydricState } from "@/lib/hooks";
import { radiusFromArea } from "@/utils/geo";
import { cn } from "@/utils/cn";
import {
  HYDRIC_STATUS_CONFIG,
  type HydricStatus,
  type PivotHydricState,
  type FarmHydricSummary,
  type BalanceDay,
} from "@/modules/water-balance/services";

const PivotMap = dynamic(
  () => import("@/components/maps/PivotMap").then((m) => ({ default: m.PivotMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/50 dark:border-white/[0.06] dark:bg-graphite-800">
        <p className="text-sm text-graphite-400">Carregando mapa...</p>
      </div>
    ),
  },
);

// ── KPI Card ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  unit,
  sub,
  accent = "#1ea85b",
  icon,
  ring,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: React.ReactNode;
  accent?: string;
  icon: React.ReactNode;
  ring?: { value: number; max: number };
}) {
  return (
    <Card className="interactive-surface p-5 hover:shadow-elevated dark:hover:shadow-dark-elevated">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase leading-tight tracking-wide text-graphite-400 dark:text-gray-500">
            {label}
          </p>
          <p className="mt-2 text-[26px] font-extrabold leading-none tabular-nums tracking-tight text-graphite-900 dark:text-white">
            {value}
            {unit && <span className="ml-1 text-[13px] font-semibold text-graphite-400 dark:text-gray-500">{unit}</span>}
          </p>
          {sub && (
            <p className="mt-2 text-[11px] leading-tight text-graphite-400 dark:text-gray-500">{sub}</p>
          )}
        </div>
        {ring ? (
          <ProgressRing value={ring.value} max={ring.max} color={accent} size={52} thickness={5.5}>
            <span className="flex items-center justify-center" style={{ color: accent }}>{icon}</span>
          </ProgressRing>
        ) : (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${accent}14`, color: accent }}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Status summary ring ─────────────────────────────────────────────────

function StatusRing({ summary }: { summary: FarmHydricSummary }) {
  const total = summary.totalPivots || 1;
  const segments = [
    { pct: summary.adequate / total, color: HYDRIC_STATUS_CONFIG.verde.color, label: `${summary.adequate} Adequados` },
    { pct: summary.attention / total, color: HYDRIC_STATUS_CONFIG.amarelo.color, label: `${summary.attention} Atenção` },
    { pct: summary.needIrrigationToday / total, color: HYDRIC_STATUS_CONFIG.vermelho.color, label: `${summary.needIrrigationToday} Irrigar` },
    { pct: summary.noData / total, color: HYDRIC_STATUS_CONFIG.cinza.color, label: `${summary.noData} Sem dados` },
  ].filter((s) => s.pct > 0);

  const r = 44;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        {segments.map((seg, i) => {
          const dash = seg.pct * c;
          const el = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={10}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: seg.color }}
            />
            <span className="text-graphite-600 dark:text-gray-400">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pivot ranking row ───────────────────────────────────────────────────

function RankingRow({
  pivot,
  rank,
  selected,
  onClick,
}: {
  pivot: PivotHydricState;
  rank: number;
  selected: boolean;
  onClick: () => void;
}) {
  const day = pivot.current;
  const status = day?.status ?? "cinza";
  const cfg = HYDRIC_STATUS_CONFIG[status];
  const depletionPct = day ? Math.round(day.depletion * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        selected
          ? "bg-brand-600/10 ring-1 ring-brand-500/30 dark:bg-brand-900/20"
          : "hover:bg-gray-50 dark:hover:bg-white/[0.04]",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-bold tabular-nums text-graphite-500 dark:bg-white/[0.06] dark:text-gray-400">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-graphite-800 dark:text-white">
          {pivot.pivotName}
        </p>
        <p className="truncate text-[11px] text-graphite-400 dark:text-gray-500">
          {pivot.cultureName} {pivot.varietyName ? `· ${pivot.varietyName}` : ""}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold",
            cfg.bgClass,
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {cfg.label}
        </span>
        {day && status !== "cinza" && (
          <span className="text-[10px] tabular-nums text-graphite-400 dark:text-gray-500">
            {depletionPct}% depl.
          </span>
        )}
      </div>
    </button>
  );
}

// ── Recommendation card ─────────────────────────────────────────────────

function RecommendationCard({ pivot }: { pivot: PivotHydricState }) {
  const day = pivot.current;
  if (!day || !day.shouldIrrigate) return null;

  return (
    <div className="rounded-xl border border-red-200/60 bg-red-50/50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-red-800 dark:text-red-300">
            {pivot.pivotName}
          </p>
          <p className="mt-0.5 text-[11px] text-red-600/80 dark:text-red-400/70">
            {day.recommendationReason}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {day.recommendedGrossDepth.toFixed(1)} mm
        </span>
      </div>
    </div>
  );
}

// ── Weather summary card ────────────────────────────────────────────────

function WeatherSummaryCard({ states }: { states: PivotHydricState[] }) {
  const latest = states.find((s) => s.current)?.current;
  if (!latest) return null;

  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">
        Clima Hoje
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[20px] font-bold tabular-nums text-graphite-900 dark:text-white">
            {latest.et0.toFixed(1)}
            <span className="ml-1 text-[12px] font-normal text-graphite-400 dark:text-gray-500">mm</span>
          </p>
          <p className="text-[10px] text-graphite-400 dark:text-gray-500">ETo</p>
        </div>
        <div>
          <p className="text-[20px] font-bold tabular-nums text-graphite-900 dark:text-white">
            {latest.precipitation.toFixed(1)}
            <span className="ml-1 text-[12px] font-normal text-graphite-400 dark:text-gray-500">mm</span>
          </p>
          <p className="text-[10px] text-graphite-400 dark:text-gray-500">Precipitação</p>
        </div>
      </div>
    </Card>
  );
}

// ── Selected pivot detail sidebar ───────────────────────────────────────

function PivotSideDetail({ pivot }: { pivot: PivotHydricState }) {
  const day = pivot.current;
  if (!day) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-graphite-800 dark:text-white">{pivot.pivotName}</p>
        <p className="mt-2 text-[12px] text-graphite-400 dark:text-gray-500">
          Sem dados disponíveis para cálculo do balanço hídrico.
        </p>
      </Card>
    );
  }

  const status = day.status;
  const cfg = HYDRIC_STATUS_CONFIG[status];
  const armPct = day.adt > 0 ? Math.round((day.storage / day.adt) * 100) : 0;

  const metrics = [
    { label: "ARM", value: `${day.storage.toFixed(1)} mm`, sub: `${armPct}% do CAD` },
    { label: "CAD", value: `${day.adt.toFixed(1)} mm` },
    { label: "AFD", value: `${day.afd.toFixed(1)} mm` },
    { label: "Déficit", value: `${day.deficit.toFixed(1)} mm` },
    { label: "ETc", value: `${day.etc.toFixed(1)} mm` },
    { label: "Kc", value: day.kc.toFixed(2) },
    { label: "Prof. raiz", value: `${(day.rootDepth * 100).toFixed(0)} cm` },
    { label: "Fase", value: day.phase },
    { label: "DAE", value: `${day.dae}` },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-gray-100 p-5 dark:border-white/[0.06]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-graphite-800 dark:text-white">{pivot.pivotName}</p>
            <p className="text-[11px] text-graphite-400 dark:text-gray-500">
              {pivot.cultureName}{pivot.varietyName ? ` · ${pivot.varietyName}` : ""}
              {pivot.seasonName ? ` · ${pivot.seasonName}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold",
              cfg.bgClass,
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
            {cfg.label}
          </span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] text-graphite-400 dark:text-gray-500">
            <span>ARM</span>
            <span>{armPct}%</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(armPct, 100)}%`,
                backgroundColor: cfg.color,
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-gray-100 dark:bg-white/[0.06]">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white px-3 py-2.5 dark:bg-graphite-800">
            <p className="text-[10px] text-graphite-400 dark:text-gray-500">{m.label}</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-graphite-800 dark:text-white">
              {m.value}
            </p>
            {m.sub && (
              <p className="text-[9px] text-graphite-400 dark:text-gray-500">{m.sub}</p>
            )}
          </div>
        ))}
      </div>

      {day.shouldIrrigate && (
        <div className="border-t border-gray-100 bg-red-50/50 p-4 dark:border-white/[0.06] dark:bg-red-900/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
            Recomendação
          </p>
          <p className="mt-1 text-[12px] text-red-700/80 dark:text-red-400/70">
            {day.recommendationReason}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-red-100/50 px-2.5 py-2 dark:bg-red-900/20">
              <p className="text-[10px] text-red-600/70 dark:text-red-400/60">Lâmina bruta</p>
              <p className="text-[14px] font-bold tabular-nums text-red-700 dark:text-red-400">
                {day.recommendedGrossDepth.toFixed(1)} mm
              </p>
            </div>
            <div className="rounded-lg bg-red-100/50 px-2.5 py-2 dark:bg-red-900/20">
              <p className="text-[10px] text-red-600/70 dark:text-red-400/60">Volume</p>
              <p className="text-[14px] font-bold tabular-nums text-red-700 dark:text-red-400">
                {day.recommendedVolume.toFixed(0)} m³
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Greeting header + weather chips ─────────────────────────────────────

function Chip({ label, value, icon, bg, color }: {
  label: string;
  value: string;
  icon: React.ReactNode;
  bg: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-gray-100 bg-white px-3.5 py-2 shadow-card dark:border-white/[0.06] dark:bg-graphite-800 dark:shadow-dark-card">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: bg, color }}>
        {icon}
      </div>
      <div>
        <p className="text-[9.5px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">{label}</p>
        <p className="text-[13px] font-bold leading-tight tabular-nums text-graphite-800 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function GreetingHeader({ firstName, farmName, weather, totalPivots, irrigatedArea }: {
  firstName: string | null;
  farmName: string | null;
  weather: BalanceDay | null;
  totalPivots: number;
  irrigatedArea: number;
}) {
  const h = new Date().getHours();
  const greet = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const dateStr = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mb-1 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-graphite-900 dark:text-white">
          {greet}{firstName ? `, ${firstName}` : ""} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-[13px] text-graphite-400 first-letter:uppercase dark:text-gray-500">
          {farmName ? `${farmName} · ` : ""}{dateStr}
        </p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Chip
          label="ETo hoje" value={weather ? `${weather.et0.toFixed(1)} mm` : "—"}
          bg="rgba(30,168,91,.12)" color="#1ea85b"
          icon={<svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 8s3.5 3.8 3.5 6.5a3.5 3.5 0 0 1-7 0C8.5 11.8 12 8 12 8z" /><path d="M12 6V3M9 5l3-2 3 2" /></svg>}
        />
        <Chip
          label="Chuva hoje" value={weather ? `${weather.precipitation.toFixed(1)} mm` : "—"}
          bg="rgba(47,143,216,.12)" color="#2f8fd8"
          icon={<svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>}
        />
        <Chip
          label="Pivôs ativos" value={`${totalPivots}`}
          bg="rgba(30,168,91,.12)" color="#1ea85b"
          icon={<svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-9a9 9 0 100 .001" /></svg>}
        />
        <Chip
          label="Área irrigada" value={`${irrigatedArea.toFixed(0)} ha`}
          bg="rgba(124,92,255,.12)" color="#7c5cff"
          icon={<svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5-2m0 16V2m0 0L9 4" /></svg>}
        />
      </div>
    </div>
  );
}

// ── Situação do manejo (lista + donut) ─────────────────────────────────────

function StatusDonut({ summary, size = 132 }: { summary: FarmHydricSummary; size?: number }) {
  const total = summary.totalPivots || 1;
  const thickness = 15;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: summary.adequate, color: HYDRIC_STATUS_CONFIG.verde.color },
    { v: summary.attention, color: HYDRIC_STATUS_CONFIG.amarelo.color },
    { v: summary.needIrrigationToday, color: HYDRIC_STATUS_CONFIG.vermelho.color },
    { v: summary.noData, color: HYDRIC_STATUS_CONFIG.cinza.color },
  ].filter((s) => s.v > 0);
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={thickness} className="stroke-gray-100 dark:stroke-white/[0.06]" />
        {segs.map((s, i) => {
          const dash = (s.v / total) * c;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(dash - 3, 0)} ${c - Math.max(dash - 3, 0)}`} strokeDashoffset={-offset} strokeLinecap="round" />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[24px] font-extrabold tabular-nums leading-none text-graphite-900 dark:text-white">{summary.totalPivots}</span>
        <span className="mt-0.5 text-[10px] text-graphite-400 dark:text-gray-500">Pivôs totais</span>
      </div>
    </div>
  );
}

function SituacaoManejo({ summary }: { summary: FarmHydricSummary }) {
  const total = summary.totalPivots || 1;
  const rows = [
    { color: HYDRIC_STATUS_CONFIG.verde.color, label: "Dentro do ideal", count: summary.adequate },
    { color: HYDRIC_STATUS_CONFIG.amarelo.color, label: "Atenção (déficit leve)", count: summary.attention },
    { color: HYDRIC_STATUS_CONFIG.vermelho.color, label: "Déficit alto", count: summary.needIrrigationToday },
    { color: HYDRIC_STATUS_CONFIG.cinza.color, label: "Sem dados", count: summary.noData },
  ];
  return (
    <Card className="p-0">
      <div className="border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
        <p className="text-[13px] font-bold text-graphite-800 dark:text-white">Situação do manejo hoje</p>
      </div>
      <div className="flex items-center gap-5 p-5">
        <ul className="flex-1 space-y-3.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <span className="text-[12.5px] font-medium text-graphite-700 dark:text-gray-300">{r.label}</span>
              </span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-graphite-400 dark:text-gray-500">
                <b className="text-graphite-800 dark:text-white">{r.count}</b> · {Math.round((r.count / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
        <StatusDonut summary={summary} />
      </div>
    </Card>
  );
}

// ── Consumo / água recomendada (números + mini-barras) ──────────────────────

function MiniBars({ data, color = "#1ea85b" }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex h-24 items-end gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[9px] font-semibold tabular-nums text-graphite-500 dark:text-gray-400">
              {d.value > 0 ? d.value.toFixed(0) : ""}
            </span>
            <div
              className="w-full rounded-t-md"
              style={{ height: `${Math.max((d.value / max) * 100, 4)}%`, background: color, opacity: d.value > 0 ? 0.85 : 0.2 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {data.map((d) => (
          <span key={d.label} className="min-w-0 flex-1 truncate text-center text-[9px] text-graphite-400 dark:text-gray-500">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function ConsumoAgua({ summary, states }: { summary: FarmHydricSummary; states: PivotHydricState[] }) {
  const totalVol = summary.totalRecommendedVolume;
  const mediaHa = summary.totalIrrigatedArea > 0 ? totalVol / summary.totalIrrigatedArea : 0;
  const bars = states
    .filter((s) => s.current)
    .slice(0, 8)
    .map((s) => ({ label: s.pivotName.replace(/^Piv[oô]\s*/i, "PC"), value: s.current!.deficit }));
  return (
    <Card className="p-0">
      <div className="border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
        <p className="text-[13px] font-bold text-graphite-800 dark:text-white">Água recomendada hoje</p>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[19px] font-extrabold tabular-nums leading-none text-graphite-900 dark:text-white">
              {(totalVol / 1000).toFixed(1)}<span className="ml-0.5 text-[11px] font-semibold text-graphite-400">mil m³</span>
            </p>
            <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">Total recomendado</p>
          </div>
          <div>
            <p className="text-[19px] font-extrabold tabular-nums leading-none text-graphite-900 dark:text-white">
              {mediaHa.toFixed(0)}<span className="ml-0.5 text-[11px] font-semibold text-graphite-400">m³/ha</span>
            </p>
            <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">Média por hectare</p>
          </div>
          <div>
            <p className="text-[19px] font-extrabold tabular-nums leading-none text-graphite-900 dark:text-white">
              {summary.avgRecommendedDepth.toFixed(1)}<span className="ml-0.5 text-[11px] font-semibold text-graphite-400">mm</span>
            </p>
            <p className="mt-1 text-[10px] text-graphite-400 dark:text-gray-500">Lâmina média</p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-graphite-400 dark:text-gray-500">Déficit por pivô (mm)</p>
          <MiniBars data={bars} color="#1ea85b" />
        </div>
      </div>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function VisaoGeralPage() {
  const { farms, activeFarmId, profile } = useAuth();
  const activeFarm = farms.find((f) => f.id === activeFarmId);
  const { states, summary, loading } = useFarmHydricState();
  const [selectedPivotId, setSelectedPivotId] = useState<string | null>(null);

  const latestWeather = states.find((s) => s.current)?.current ?? null;

  const mapPivots = useMemo(
    () =>
      states
        .filter((s) => s.latitude && s.longitude)
        .map((s) => ({
          id: s.pivotId,
          name: s.pivotName,
          latitude: s.latitude,
          longitude: s.longitude,
          radiusMeters: radiusFromArea(s.area),
          color: HYDRIC_STATUS_CONFIG[s.current?.status ?? "cinza"].color,
        })),
    [states],
  );

  const selectedPivot = states.find((s) => s.pivotId === selectedPivotId) ?? null;

  const ranking = useMemo(
    () =>
      [...states].sort((a, b) => {
        const da = a.current?.depletion ?? -1;
        const db = b.current?.depletion ?? -1;
        return db - da;
      }),
    [states],
  );

  const irrigationNeeded = useMemo(
    () => states.filter((s) => s.current?.shouldIrrigate),
    [states],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600 dark:border-white/[0.08] dark:border-t-brand-500" />
      </div>
    );
  }

  if (!summary || states.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          titulo="Visão Geral"
          descricao={activeFarm?.name ?? "Operação"}
        />
        <EmptyState
          title="Nenhum pivô cadastrado"
          description="Cadastre pivôs e vincule culturas para ver a visão geral operacional."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Visão Geral" descricao={activeFarm?.name ?? "Centro operacional"} />

      {/* ── KPIs (6) ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Pivôs"
          value={summary.totalPivots}
          sub={`${summary.adequate} adequados`}
          accent="#1ea85b"
          ring={{ value: summary.adequate, max: summary.totalPivots }}
          icon={<svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-9a9 9 0 100 .001" /></svg>}
        />
        <KpiCard
          label="Área irrigada"
          value={summary.totalIrrigatedArea.toFixed(0)}
          unit="ha"
          sub={`${summary.areaInDeficit.toFixed(0)} ha em déficit`}
          accent="#1ea85b"
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20m0 0c-4 0-7-3-7-7 3 0 5 1 7 4 2-3 4-4 7-4 0 4-3 7-7 7z" /></svg>}
        />
        <KpiCard
          label="Lâmina rec."
          value={summary.avgRecommendedDepth.toFixed(1)}
          unit="mm"
          sub="média a irrigar"
          accent="#3b82f6"
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8c2 0 2-1.5 4-1.5S12 8 14 8s2-1.5 4-1.5S20 8 22 8M2 14c2 0 2-1.5 4-1.5S10 14 12 14s2-1.5 4-1.5S18 14 20 14" /></svg>}
        />
        <KpiCard
          label="Déficit médio"
          value={summary.avgDeficit.toFixed(1)}
          unit="mm"
          sub="na fazenda"
          accent="#f59e0b"
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" /></svg>}
        />
        <KpiCard
          label="Chuva hoje"
          value={(latestWeather?.precipitation ?? 0).toFixed(1)}
          unit="mm"
          sub="registrada"
          accent="#2f8fd8"
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" viewBox="0 0 24 24"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>}
        />
        <KpiCard
          label="ETo hoje"
          value={(latestWeather?.et0 ?? 0).toFixed(1)}
          unit="mm"
          sub="demanda atmosférica"
          accent="#f59e0b"
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></svg>}
        />
      </div>

      {/* ── Mapa · Manejo · Consumo ─────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <svg className="h-[18px] w-[18px] text-graphite-400 dark:text-gray-500" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5-2m0 16V2" />
              </svg>
              <p className="whitespace-nowrap text-[13px] font-bold text-graphite-800 dark:text-white">Mapa dos pivôs</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2.5 xl:flex">
              {(["verde", "amarelo", "vermelho"] as HydricStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full ring-2 ring-white dark:ring-graphite-800" style={{ background: HYDRIC_STATUS_CONFIG[s].color }} />
                  <span className="text-[10px] font-medium text-graphite-400 dark:text-gray-500">{HYDRIC_STATUS_CONFIG[s].label}</span>
                </div>
              ))}
            </div>
          </div>
          <PivotMap
            pivots={mapPivots}
            highlightId={selectedPivotId ?? undefined}
            onSelect={setSelectedPivotId}
            className="h-[420px] w-full"
          />
        </Card>

        <SituacaoManejo summary={summary} />
        <ConsumoAgua summary={summary} states={states} />
      </div>

      {/* Selected pivot detail (ao clicar no mapa) */}
      {selectedPivot && (
        <div className="grid gap-5 lg:grid-cols-2">
          <PivotSideDetail pivot={selectedPivot} />
        </div>
      )}

      {/* ── Recommendations ──────────────────────────────────────────── */}
      {irrigationNeeded.length > 0 && (
        <Card className="p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">
            Recomendações de Irrigação ({irrigationNeeded.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {irrigationNeeded.map((p) => (
              <RecommendationCard key={p.pivotId} pivot={p} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Ranking ──────────────────────────────────────────────────── */}
      <Card className="p-5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-graphite-400 dark:text-gray-500">
          Ranking por Depleção
        </p>
        <div className="space-y-1">
          {ranking.map((pivot, i) => (
            <RankingRow
              key={pivot.pivotId}
              pivot={pivot}
              rank={i + 1}
              selected={pivot.pivotId === selectedPivotId}
              onClick={() => setSelectedPivotId(pivot.pivotId)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
