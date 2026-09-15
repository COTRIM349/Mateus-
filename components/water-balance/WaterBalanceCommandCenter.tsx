"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyBalanceRow, WaterStatus } from "@/modules/water-balance/services";

interface WaterBalanceCommandCenterProps {
  rows: DailyBalanceRow[];
  pivotName?: string | null;
  cultureName?: string | null;
  farmName?: string | null;
  areaHa?: number | null;
  efficiencyPct?: number | null;
  activePivotCount?: number;
  loading?: boolean;
  onProgramIrrigation?: () => void;
  onOpenCalculationMemory?: () => void;
}

const STATUS: Record<WaterStatus, { label: string; tone: string; dot: string; priority: string }> = {
  saturado: {
    label: "Excesso hídrico",
    tone: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    dot: "#3b82f6",
    priority: "Monitorar",
  },
  ideal: {
    label: "Condição adequada",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    dot: "#22c55e",
    priority: "Baixa",
  },
  atencao: {
    label: "Atenção",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    dot: "#f59e0b",
    priority: "Média",
  },
  deficit: {
    label: "Irrigar",
    tone: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    dot: "#f97316",
    priority: "Alta",
  },
  deficit_critico: {
    label: "Irrigação urgente",
    tone: "border-red-500/30 bg-red-500/10 text-red-300",
    dot: "#ef4444",
    priority: "Crítica",
  },
};

function brDate(iso: string) {
  if (!iso || iso.length < 10) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function MetricCard({ label, value, unit, accent, sub }: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-950/45 px-4 py-3 shadow-sm backdrop-blur-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-white" style={accent ? { color: accent } : undefined}>
        {value}{unit ? <span className="ml-1 text-[13px] font-semibold text-slate-400">{unit}</span> : null}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function EmptyState({ loading }: { loading?: boolean }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/[0.08] bg-slate-950/50 p-8 text-center">
      <div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-2xl text-cyan-300">
          ◌
        </div>
        <p className="mt-4 text-sm font-semibold text-white">
          {loading ? "Calculando balanço hídrico..." : "Calcule o balanço para abrir a Central de Decisão"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
          A nova interface usa somente os dados reais do motor hídrico já existente: ETo, Kc, ETc, chuva, irrigação, CAD, AFD, ARM e Ks.
        </p>
      </div>
    </div>
  );
}

export function WaterBalanceCommandCenter({
  rows,
  pivotName,
  cultureName,
  farmName,
  areaHa,
  efficiencyPct,
  activePivotCount,
  loading,
  onProgramIrrigation,
  onOpenCalculationMemory,
}: WaterBalanceCommandCenterProps) {
  const data = useMemo(() => rows.map((row) => {
    const safety = row.safetyMoistureMm ?? Math.max(row.cad - row.afd, 0);
    const depletion = Math.max(row.cad - row.storedWater, 0);
    return {
      ...row,
      label: brDate(row.date),
      safety,
      depletion,
      afdUsedPct: row.afd > 0 ? (depletion / row.afd) * 100 : 0,
      effectiveIrrigationValue: row.effectiveIrrigation ?? row.irrigationApplied,
      etcPotentialValue: row.etcPotential ?? row.etc,
    };
  }), [rows]);

  if (!rows.length) return <EmptyState loading={loading} />;

  const last = data[data.length - 1];
  const status = STATUS[last.waterStatus];
  const stressLimit = last.safety;
  const depletion = last.depletion;
  const afdUsedPct = last.afdUsedPct;
  const etcDemand = Math.max(last.etcPotentialValue, 0);
  const marginToLimit = last.storedWater - stressLimit;
  const daysToLimit = marginToLimit <= 0
    ? 0
    : etcDemand > 0
      ? marginToLimit / etcDemand
      : null;
  const shouldIrrigate = last.waterStatus === "deficit" || last.waterStatus === "deficit_critico";
  const recommendedGross = shouldIrrigate ? last.grossDepth : 0;
  const recommendedNet = shouldIrrigate ? last.netDepth : 0;
  const fieldCapacity = last.cad;
  const pmpDisplay = 0;
  const last14 = data.slice(-14);
  const range = data.length > 30 ? data.slice(-30) : data;
  const totalRain = rows.reduce((sum, row) => sum + row.effectivePrecipitation, 0);
  const totalIrrigation = rows.reduce((sum, row) => sum + (row.effectiveIrrigation ?? row.irrigationApplied), 0);
  const avgEtc = rows.reduce((sum, row) => sum + row.etc, 0) / rows.length;
  const latestDae = last.dae ?? null;
  const updatedDate = brDate(last.date);

  const decisionText = shouldIrrigate
    ? `Aplicar ${fmt(recommendedGross)} mm. O ARM está ${marginToLimit <= 0 ? "no ou abaixo do" : "próximo do"} limite de manejo.`
    : daysToLimit != null && daysToLimit <= 2
      ? `Ainda não é necessário irrigar, mas o limite de manejo pode ser atingido em aproximadamente ${fmt(daysToLimit)} dia(s) se não houver entrada de água.`
      : "Não há necessidade imediata de irrigação. Manter o acompanhamento da evolução do ARM.";

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#07111f] text-slate-100 shadow-2xl">
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#07111f] via-[#0a1727] to-[#07111f] px-4 py-4 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
              {farmName ? <span>{farmName}</span> : null}
              {farmName && pivotName ? <span>•</span> : null}
              {pivotName ? <span className="text-slate-200">{pivotName}</span> : null}
              {cultureName ? <><span>•</span><span>{cultureName}</span></> : null}
              {last.phase ? <><span>•</span><span className="text-cyan-300">{last.phase}</span></> : null}
              {areaHa != null ? <><span>•</span><span>{fmt(areaHa, 0)} ha</span></> : null}
              {latestDae != null ? <><span>•</span><span>{latestDae} DAE</span></> : null}
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white sm:text-2xl">Central de decisão do balanço hídrico</h2>
            <p className="mt-1 text-xs text-slate-400">Atualizado até {updatedDate} · dados reais do motor hídrico operacional</p>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide ${status.tone}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: status.dot }} />
            Prioridade {status.priority}
          </span>
        </div>
      </div>

      <div className="grid gap-3 border-b border-white/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 lg:p-5">
        <MetricCard label="ARM atual" value={fmt(last.storedWater)} unit="mm" accent="#38bdf8" />
        <MetricCard label="Depleção" value={fmt(depletion)} unit="mm" accent="#fbbf24" />
        <MetricCard label="AFD utilizada" value={fmt(afdUsedPct, 0)} unit="%" accent={afdUsedPct >= 100 ? "#fb7185" : "#f59e0b"} />
        <MetricCard label="ETc hoje" value={fmt(last.etc)} unit="mm" accent="#7dd3fc" />
        <MetricCard
          label="Limite em"
          value={daysToLimit == null ? "—" : daysToLimit <= 0 ? "atingido" : fmt(daysToLimit)}
          unit={daysToLimit != null && daysToLimit > 0 ? "dias" : undefined}
          accent={daysToLimit != null && daysToLimit <= 2 ? "#fbbf24" : undefined}
        />
        <MetricCard label="Lâmina recomendada" value={fmt(recommendedGross)} unit="mm" accent={shouldIrrigate ? "#4ade80" : "#94a3b8"} />
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_330px] lg:p-5">
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-extrabold text-white">Entradas e consumo</p>
                <p className="text-[11px] text-slate-400">Últimos {last14.length} dias · chuva efetiva, irrigação efetiva e ETc</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
                <span>Chuva ef. <b className="text-white">{fmt(totalRain)} mm</b></span>
                <span>Irrigação ef. <b className="text-white">{fmt(totalIrrigation)} mm</b></span>
                <span>ETc média <b className="text-white">{fmt(avgEtc)} mm/d</b></span>
              </div>
            </div>
            <div className="h-[245px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={last14} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} unit=" mm" width={54} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                  <Bar dataKey="effectivePrecipitation" name="Chuva efetiva" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={12} />
                  <Bar dataKey="effectiveIrrigationValue" name="Irrigação efetiva" fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={12} />
                  <Line dataKey="etc" name="ETc" type="monotone" stroke="#f8fafc" strokeWidth={2.2} dot={{ r: 2, fill: "#f8fafc" }} activeDot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[13px] font-extrabold text-white">Reservatório de água do solo</p>
                <p className="text-[11px] text-slate-400">ARM dentro dos limites agronômicos do perfil radicular explorado</p>
              </div>
              <div className="text-right text-[10px] text-slate-400">
                <p>CAD <b className="text-cyan-300">{fmt(fieldCapacity)} mm</b></p>
                <p>Limite de manejo <b className="text-amber-300">{fmt(stressLimit)} mm</b></p>
              </div>
            </div>
            <div className="h-[330px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={range} margin={{ top: 12, right: 14, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
                  <ReferenceArea y1={stressLimit} y2={fieldCapacity} fill="#14532d" fillOpacity={0.28} />
                  <ReferenceArea y1={Math.max(stressLimit * 0.55, 0)} y2={stressLimit} fill="#78350f" fillOpacity={0.30} />
                  <ReferenceArea y1={pmpDisplay} y2={Math.max(stressLimit * 0.55, 0)} fill="#7f1d1d" fillOpacity={0.32} />
                  <ReferenceLine y={fieldCapacity} stroke="#60a5fa" strokeWidth={1.5} label={{ value: "CAD / CC", fill: "#93c5fd", fontSize: 10, position: "insideTopLeft" }} />
                  <ReferenceLine y={stressLimit} stroke="#facc15" strokeWidth={1.5} label={{ value: "Limite de manejo", fill: "#fde047", fontSize: 10, position: "insideTopLeft" }} />
                  <ReferenceLine y={pmpDisplay} stroke="#ef4444" strokeWidth={1.2} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} />
                  <YAxis domain={[0, Math.max(fieldCapacity * 1.08, 1)]} tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} unit=" mm" width={55} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid rgba(148,163,184,.18)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 700 }}
                    formatter={(value: number | string) => [`${fmt(Number(value))} mm`, "ARM"]}
                  />
                  <Area dataKey="storedWater" name="ARM" type="monotone" stroke="#0ea5e9" fill="#0284c7" fillOpacity={0.42} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricCard label="ETo" value={fmt(last.et0)} unit="mm/d" />
              <MetricCard label="Kc" value={fmt(last.kc, 2)} />
              <MetricCard label="Ks" value={fmt(last.ks ?? 1, 2)} />
              <MetricCard label="Raiz efetiva" value={fmt(last.rootDepth, 2)} unit="m" />
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-slate-950/35 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">Recomendação atual</p>
                <p className="mt-2 text-[34px] font-black leading-none text-emerald-300">
                  {fmt(recommendedGross)}<span className="ml-1 text-base font-bold text-emerald-200/70">mm</span>
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ${status.tone}`}>{status.label}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">Lâmina líquida</p>
                <p className="mt-1 font-bold text-white">{fmt(recommendedNet)} mm</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">Eficiência</p>
                <p className="mt-1 font-bold text-white">{efficiencyPct != null ? `${fmt(efficiencyPct, 0)}%` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">Tempo estimado</p>
                <p className="mt-1 font-bold text-white">{shouldIrrigate && last.irrigationTime > 0 ? `${fmt(last.irrigationTime)} h` : "—"}</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-2.5">
                <p className="text-[9px] uppercase tracking-wide text-slate-500">Pivôs ativos</p>
                <p className="mt-1 font-bold text-white">{activePivotCount ?? "—"}</p>
              </div>
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-slate-300">{decisionText}</p>
            <div className="mt-4 space-y-2">
              {onProgramIrrigation ? (
                <button
                  type="button"
                  onClick={onProgramIrrigation}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-emerald-950 transition hover:bg-emerald-400"
                >
                  Programar irrigação
                </button>
              ) : null}
              {onOpenCalculationMemory ? (
                <button
                  type="button"
                  onClick={onOpenCalculationMemory}
                  className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/5 px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-400/10"
                >
                  Ver memória de cálculo
                </button>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
            <p className="text-[12px] font-extrabold text-white">Situação hídrica</p>
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>AFD utilizada</span>
                  <b className="text-white">{fmt(afdUsedPct, 0)}%</b>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(afdUsedPct, 0), 100)}%`, background: afdUsedPct >= 100 ? "#ef4444" : afdUsedPct >= 80 ? "#f59e0b" : "#22c55e" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-slate-500">CAD</span><b className="mt-1 block text-white">{fmt(last.cad)} mm</b></div>
                <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-slate-500">AFD</span><b className="mt-1 block text-white">{fmt(last.afd)} mm</b></div>
                <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-slate-500">ARM</span><b className="mt-1 block text-cyan-300">{fmt(last.storedWater)} mm</b></div>
                <div className="rounded-xl bg-white/[0.035] p-2.5"><span className="text-slate-500">Limite</span><b className="mt-1 block text-amber-300">{fmt(stressLimit)} mm</b></div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-slate-950/35 p-4">
            <p className="text-[12px] font-extrabold text-white">Alertas inteligentes</p>
            <div className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-slate-300">
              {daysToLimit != null && daysToLimit <= 2 ? (
                <p className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" />Limite de manejo próximo: {daysToLimit <= 0 ? "já atingido" : `${fmt(daysToLimit)} dia(s)`} na demanda atual.</p>
              ) : (
                <p className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />ARM ainda dentro da faixa operacional de manejo.</p>
              )}
              {last.surplus > 0 ? <p className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-400" />Excedente de {fmt(last.surplus)} mm no último dia; verificar drenagem profunda.</p> : null}
              {(last.ks ?? 1) < 1 ? <p className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-400" />Ks em {fmt(last.ks ?? 1, 2)} indica restrição hídrica sobre a ETc.</p> : null}
              {last.effectivePrecipitation <= 0 && last.effectiveIrrigationValue <= 0 ? <p className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-400" />Sem entrada efetiva de água no último dia calculado.</p> : null}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
