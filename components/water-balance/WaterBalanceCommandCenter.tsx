"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
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

const STATUS: Record<WaterStatus, { label: string; priority: string; color: string; bg: string }> = {
  saturado: { label: "Excesso hídrico", priority: "Monitorar", color: "#60a5fa", bg: "#172554" },
  ideal: { label: "Condição adequada", priority: "Baixa", color: "#34d399", bg: "#052e2b" },
  atencao: { label: "Atenção", priority: "Média", color: "#fbbf24", bg: "#451a03" },
  deficit: { label: "Irrigar", priority: "Alta", color: "#fb923c", bg: "#431407" },
  deficit_critico: { label: "Irrigação urgente", priority: "Crítica", color: "#fb7185", bg: "#4c0519" },
};

function brDate(iso: string) {
  if (!iso || iso.length < 10) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function Icon({ type, color = "currentColor" }: { type: "pivot" | "area" | "drop" | "deficit" | "irrigation" | "alert" | "sun" | "leaf" | "root" | "layers" | "clock" | "field"; color?: string }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "drop") return <svg {...common}><path d="M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11Z" /></svg>;
  if (type === "deficit") return <svg {...common}><path d="M4 15c3-6 5 5 8-2s5 4 8-3" /><path d="M4 19h16" /></svg>;
  if (type === "irrigation") return <svg {...common}><path d="M4 18h16" /><path d="M7 18V9m5 9V5m5 13v-7" /><path d="M5 9c3-3 11-3 14 0" /></svg>;
  if (type === "alert") return <svg {...common}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5m0 3h.01" /></svg>;
  if (type === "sun") return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
  if (type === "leaf") return <svg {...common}><path d="M20 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 10-7 10-16Z" /><path d="M5 19c4-5 7-8 12-11" /></svg>;
  if (type === "root") return <svg {...common}><path d="M12 3v8m0 0-4 4m4-4 4 4m-4-2v8m-4-6-3 4m11-4 3 4" /></svg>;
  if (type === "layers") return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>;
  if (type === "clock") return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
  if (type === "field") return <svg {...common}><path d="M3 18c5-7 13-7 18 0M5 21c4-5 10-5 14 0M8 13c2-3 6-3 8 0" /></svg>;
  if (type === "area") return <svg {...common}><path d="M4 18V9m4 9V6m4 12V9m4 9V6m4 12V9" /><path d="M2 18h20" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v6m0 4v6M4 12h6m4 0h6" /></svg>;
}

function SummaryCard({ icon, label, value, unit, accent, muted }: { icon: Parameters<typeof Icon>[0]["type"]; label: string; value: string; unit?: string; accent: string; muted?: string }) {
  return (
    <div className="flex min-h-[78px] items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0d1a29] px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${accent}15`, color: accent }}><Icon type={icon} color={accent} /></div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
        <p className="mt-0.5 text-[21px] font-extrabold leading-none text-white"><span style={{ color: accent }}>{value}</span>{unit ? <span className="ml-1 text-[12px] font-semibold text-slate-400">{unit}</span> : null}</p>
        {muted ? <p className="mt-1 truncate text-[9px] text-slate-600">{muted}</p> : null}
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return <div className="rounded-lg border border-white/[0.08] bg-[#102033] px-3 py-2.5"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-[18px] font-extrabold leading-none" style={{ color }}>{value}{unit ? <span className="ml-1 text-[11px] font-semibold text-slate-500">{unit}</span> : null}</p></div>;
}

function TinyMetric({ icon, label, value, color = "#e2e8f0" }: { icon: Parameters<typeof Icon>[0]["type"]; label: string; value: string; color?: string }) {
  return <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-white/[0.07] bg-[#0b1827] px-3 py-2.5"><Icon type={icon} color={color}/><div className="min-w-0"><p className="truncate text-[9px] text-slate-500">{label}</p><p className="truncate text-[13px] font-extrabold text-white">{value}</p></div></div>;
}

function EmptyState({ loading }: { loading?: boolean }) {
  return <div className="flex min-h-[620px] items-center justify-center rounded-xl border border-white/[0.08] bg-[#07111f] p-8 text-center text-white"><div><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10"><Icon type="drop" color="#34d399"/></div><p className="mt-4 font-semibold">{loading ? "Calculando balanço hídrico..." : "Selecione um pivô com parcela ativa"}</p><p className="mt-2 text-xs text-slate-500">A interface será preenchida somente com dados reais do motor hídrico.</p></div></div>;
}

export function WaterBalanceCommandCenter({ rows, pivotName, cultureName, farmName, areaHa, efficiencyPct, activePivotCount, loading, onProgramIrrigation, onOpenCalculationMemory }: WaterBalanceCommandCenterProps) {
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
  const demand = Math.max(last.etcPotentialValue, 0);
  const marginToLimit = last.storedWater - stressLimit;
  const daysToLimit = marginToLimit <= 0 ? 0 : demand > 0 ? marginToLimit / demand : null;
  const shouldIrrigate = last.waterStatus === "deficit" || last.waterStatus === "deficit_critico";
  const recommendedGross = shouldIrrigate ? last.grossDepth : 0;
  const recommendedNet = shouldIrrigate ? last.netDepth : 0;
  const last14 = data.slice(-14);
  const chartRange = data.length > 30 ? data.slice(-30) : data;
  const updatedDate = brDate(last.date);
  const selectedDeficit = Math.max(last.cad - last.storedWater, 0);

  const projected = Array.from({ length: 8 }, (_, i) => ({
    day: i === 0 ? "Hoje" : `+${i}`,
    arm: Math.max(last.storedWater - demand * i, 0),
  }));

  const decisionText = shouldIrrigate
    ? `Aplicar ${fmt(recommendedGross)} mm. O armazenamento está no ou abaixo do limite de manejo e requer reposição.`
    : daysToLimit != null && daysToLimit <= 2
      ? `O pivô ainda está na faixa manejável, mas pode atingir o limite em cerca de ${fmt(daysToLimit)} dia(s) sem nova entrada de água.`
      : "Sem necessidade imediata de irrigação. Manter acompanhamento do ARM e das próximas entradas de água.";

  const priorityTone = status.priority === "Crítica" ? "#fb7185" : status.priority === "Alta" ? "#fb923c" : status.priority === "Média" ? "#fbbf24" : "#34d399";

  return (
    <section className="overflow-hidden rounded-xl border border-[#1c2b3d] bg-[#07111f] text-slate-100 shadow-[0_20px_60px_rgba(2,8,23,.28)]">
      <div className="border-b border-white/[0.06] bg-[#091522] px-4 py-3 lg:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-[25px] font-extrabold tracking-tight text-white">Balanço Hídrico</h1>
            <p className="text-[11px] text-slate-500">Central de decisão do manejo de irrigação</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <div className="rounded-lg border border-white/[0.09] bg-[#0d1a29] px-3 py-2"><span className="text-slate-500">Fazenda: </span><b className="text-slate-200">{farmName ?? "—"}</b></div>
            <div className="rounded-lg border border-white/[0.09] bg-[#0d1a29] px-3 py-2"><span className="text-slate-500">Cultura: </span><b className="text-slate-200">{cultureName ?? "—"}</b></div>
            <div className="rounded-lg border border-white/[0.09] bg-[#0d1a29] px-3 py-2"><span className="text-slate-500">Pivô: </span><b className="text-slate-200">{pivotName ?? "—"}</b></div>
            <div className="flex overflow-hidden rounded-lg border border-white/[0.09] bg-[#0d1a29]"><span className="bg-emerald-500 px-4 py-2 font-extrabold text-emerald-950">LISTA</span><span className="px-4 py-2 text-slate-500">MAPA</span></div>
            <div className="px-2 py-1 text-right"><p className="text-[9px] text-slate-600">Última atualização</p><b className="text-[11px] text-slate-300">{updatedDate}</b></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-white/[0.06] p-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard icon="pivot" label="Pivôs ativos" value={String(activePivotCount ?? "—")} accent="#34d399" />
        <SummaryCard icon="area" label="Área selecionada" value={areaHa != null ? fmt(areaHa, 0) : "—"} unit="ha" accent="#5eead4" />
        <SummaryCard icon="drop" label="ETc hoje" value={fmt(last.etc)} unit="mm" accent="#38bdf8" />
        <SummaryCard icon="deficit" label="Déficit do pivô" value={fmt(selectedDeficit)} unit="mm" accent="#fb7185" />
        <SummaryCard icon="irrigation" label="Lâmina recomendada" value={fmt(recommendedGross)} unit="mm" accent="#f59e0b" />
        <SummaryCard icon="alert" label="Prioridade" value={status.priority} accent={priorityTone} muted="ranking geral será conectado depois" />
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-white/[0.07] bg-[#0a1725] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex min-w-[230px] items-center gap-3">
                <div className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-emerald-500/20 bg-[#0d2b24]">
                  <div className="absolute h-12 w-12 rounded-full border border-emerald-400/40"/><div className="absolute h-px w-12 bg-emerald-400/30"/><div className="absolute h-12 w-px bg-emerald-400/30"/><span className="z-10 h-2 w-2 rounded-full bg-emerald-400"/>
                </div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h2 className="text-[18px] font-extrabold text-white">{pivotName ?? "Pivô"}</h2><span className="text-slate-600">•</span><b className="text-[11px] text-slate-300">{cultureName ?? "—"}</b></div><p className="mt-1 text-[10px] text-slate-500">Estádio {last.phase || "—"} · {areaHa != null ? `${fmt(areaHa, 0)} ha` : "—"} · {last.dae != null ? `${last.dae} DAE` : "DAE —"}</p></div>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <Kpi label="ARM atual" value={fmt(last.storedWater)} unit="mm" color="#38bdf8"/>
                <Kpi label="Depleção" value={fmt(depletion)} unit="mm" color="#fbbf24"/>
                <Kpi label="AFD utilizada" value={fmt(afdUsedPct,0)} unit="%" color={afdUsedPct >= 100 ? "#fb7185" : "#fb923c"}/>
                <Kpi label="ETc hoje" value={fmt(last.etc)} unit="mm" color="#7dd3fc"/>
                <Kpi label="Limite em" value={daysToLimit == null ? "—" : daysToLimit <= 0 ? "atingido" : fmt(daysToLimit)} unit={daysToLimit != null && daysToLimit > 0 ? "dias" : undefined} color="#fbbf24"/>
                <Kpi label="Lâmina recomendada" value={fmt(recommendedGross)} unit="mm" color="#4ade80"/>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0a1725] p-3">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-[13px] font-extrabold text-white">Entradas e Consumo</h3><p className="text-[10px] text-slate-500">Últimos {last14.length} dias · chuva efetiva, irrigação efetiva e ETc</p></div><div className="flex gap-4 text-[9px] text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-500"/>Chuva efetiva</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400"/>Irrigação efetiva</span><span><i className="mr-1 inline-block h-[2px] w-3 bg-white align-middle"/>ETc</span></div></div>
            <div className="h-[210px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={last14} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}><CartesianGrid stroke="rgba(148,163,184,.09)" vertical={false}/><XAxis dataKey="label" tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false} unit=" mm" width={52}/><Tooltip contentStyle={{background:"#0f1f31",border:"1px solid #26384d",borderRadius:10,fontSize:11}} labelStyle={{color:"#e2e8f0"}}/><Bar dataKey="effectivePrecipitation" name="Chuva efetiva" fill="#38bdf8" radius={[2,2,0,0]} maxBarSize={13}/><Bar dataKey="effectiveIrrigationValue" name="Irrigação efetiva" fill="#4ade80" radius={[2,2,0,0]} maxBarSize={13}/><Line dataKey="etc" name="ETc" type="monotone" stroke="#f8fafc" strokeWidth={2} dot={{r:2,fill:"#f8fafc"}}/></ComposedChart></ResponsiveContainer></div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#0a1725] p-3">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-[13px] font-extrabold text-white">Reservatório de Água do Solo</h3><p className="text-[10px] text-slate-500">ARM, capacidade de água disponível e limite de manejo</p></div><div className="text-right text-[9px]"><p className="text-sky-400">CAD / CC <b>{fmt(last.cad)} mm</b></p><p className="text-amber-400">Limite de manejo <b>{fmt(stressLimit)} mm</b></p></div></div>
            <div className="h-[295px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartRange} margin={{top:10,right:10,left:-18,bottom:0}}><CartesianGrid stroke="rgba(148,163,184,.08)" vertical={false}/><ReferenceArea y1={stressLimit} y2={last.cad} fill="#16a34a" fillOpacity={0.19}/><ReferenceArea y1={Math.max(stressLimit*0.72,0)} y2={stressLimit} fill="#eab308" fillOpacity={0.18}/><ReferenceArea y1={Math.max(stressLimit*0.38,0)} y2={Math.max(stressLimit*0.72,0)} fill="#f97316" fillOpacity={0.18}/><ReferenceArea y1={0} y2={Math.max(stressLimit*0.38,0)} fill="#ef4444" fillOpacity={0.20}/><ReferenceLine y={last.cad} stroke="#60a5fa" strokeWidth={1.4} label={{value:"CC / CAD",fill:"#93c5fd",fontSize:9,position:"insideTopLeft"}}/><ReferenceLine y={stressLimit} stroke="#facc15" strokeWidth={1.5} label={{value:"Limite de manejo",fill:"#fde047",fontSize:9,position:"insideTopLeft"}}/><ReferenceLine y={0} stroke="#ef4444" strokeWidth={1.2} label={{value:"PMP / ARM = 0",fill:"#fca5a5",fontSize:9,position:"insideBottomLeft"}}/><XAxis dataKey="label" tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false} minTickGap={18}/><YAxis domain={[0,Math.max(last.cad*1.08,1)]} tick={{fill:"#64748b",fontSize:9}} axisLine={false} tickLine={false} unit=" mm" width={54}/><Tooltip contentStyle={{background:"#0f1f31",border:"1px solid #26384d",borderRadius:10,fontSize:11}} labelStyle={{color:"#e2e8f0"}}/><Area dataKey="storedWater" name="ARM" type="monotone" stroke="#168cff" fill="#0c62b8" fillOpacity={0.50} strokeWidth={2.4} dot={false} activeDot={{r:4}}/></ComposedChart></ResponsiveContainer></div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7"><TinyMetric icon="sun" label="ETo" value={`${fmt(last.et0)} mm/d`} color="#fbbf24"/><TinyMetric icon="leaf" label="Kc" value={fmt(last.kc,2)} color="#34d399"/><TinyMetric icon="leaf" label="Ks" value={fmt(last.ks ?? 1,2)} color="#4ade80"/><TinyMetric icon="layers" label="CAD" value={`${fmt(last.cad)} mm`} color="#60a5fa"/><TinyMetric icon="drop" label="AFD" value={`${fmt(last.afd)} mm`} color="#38bdf8"/><TinyMetric icon="root" label="Raiz efetiva" value={`${fmt(last.rootDepth,2)} m`} color="#fb923c"/><TinyMetric icon="field" label="Estádio atual" value={last.phase || "—"} color="#fb7185"/></div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#0b1a29] p-4">
            <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-[13px] font-extrabold text-white"><Icon type="leaf" color="#34d399"/>Recomendação de Hoje</h3><span className="rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase" style={{color:status.color,background:status.bg}}>Prioridade: {status.priority}</span></div>
            <div className="mt-3 flex items-end justify-between gap-3"><p className="text-[38px] font-black leading-none text-emerald-400">{fmt(recommendedGross)} <span className="text-[17px]">mm</span></p><span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] text-slate-400">Janela: {shouldIrrigate ? "Hoje" : "Monitorar"}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-white/[0.07] py-3 text-[10px]"><div><p className="text-slate-500">Lâmina líquida</p><b className="text-[13px] text-white">{fmt(recommendedNet)} mm</b></div><div><p className="text-slate-500">Eficiência do pivô</p><b className="text-[13px] text-white">{efficiencyPct != null ? `${fmt(efficiencyPct,0)}%` : "—"}</b></div><div><p className="text-slate-500">Lâmina bruta</p><b className="text-[13px] text-white">{fmt(recommendedGross)} mm</b></div><div><p className="text-slate-500">Tempo estimado</p><b className="text-[13px] text-white">{shouldIrrigate && last.irrigationTime > 0 ? `${fmt(last.irrigationTime)} h` : "—"}</b></div></div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{decisionText}</p>
            <div className="mt-3 space-y-2">{onProgramIrrigation ? <button type="button" onClick={onProgramIrrigation} className="w-full rounded-lg bg-emerald-500 px-3 py-2.5 text-[12px] font-extrabold text-emerald-950 hover:bg-emerald-400">Programar irrigação →</button> : null}{onOpenCalculationMemory ? <button type="button" onClick={onOpenCalculationMemory} className="w-full rounded-lg border border-sky-500/50 bg-sky-500/5 px-3 py-2 text-[11px] font-bold text-sky-300 hover:bg-sky-500/10">▣ Ver memória de cálculo</button> : null}</div>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0b1a29] p-4">
            <h3 className="flex items-center gap-2 text-[12px] font-extrabold text-white"><Icon type="area" color="#38bdf8"/>Projeção Hídrica <span className="font-normal text-slate-600">(cenário sem irrigação)</span></h3>
            <p className="mt-1 text-[9px] text-slate-600">Cenário rápido mantendo a demanda atual constante; não é previsão meteorológica.</p>
            <div className="mt-3 space-y-1.5">{projected.map((p) => { const pct = last.cad > 0 ? Math.min(100, Math.max(0, (p.arm/last.cad)*100)) : 0; const tone = p.arm <= stressLimit ? "#fb7185" : "#94a3b8"; return <div key={p.day} className="grid grid-cols-[42px_58px_1fr] items-center gap-2 text-[9px]"><span className="text-slate-500">{p.day}</span><b className="text-slate-300">{fmt(p.arm)} mm</b><div className="h-2 overflow-hidden rounded-sm bg-white/[0.05]"><div className="h-full rounded-sm" style={{width:`${pct}%`,background:tone}}/></div></div>; })}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-[#0b1a29] p-3"><h3 className="flex items-center gap-1.5 text-[10px] font-extrabold text-white"><Icon type="drop" color="#38bdf8"/>Nota de Umidade</h3><div className="mt-3 flex h-16 items-center justify-center rounded-full border-[7px] border-slate-700 text-center"><div><b className="block text-[18px] text-white">—</b><span className="text-[8px] text-slate-500">sem leitura</span></div></div><p className="mt-2 text-[9px] leading-relaxed text-slate-600">A leitura sensorial será exibida aqui quando registrada no pivô.</p></div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0b1a29] p-3"><h3 className="flex items-center gap-1.5 text-[10px] font-extrabold text-white"><Icon type="alert" color="#fb7185"/>Alertas Inteligentes</h3><div className="mt-3 space-y-2 text-[9px] leading-relaxed text-slate-400">{daysToLimit != null && daysToLimit <= 2 ? <p className="flex gap-1.5"><i className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"/>Limite de manejo {daysToLimit <= 0 ? "atingido" : `em ${fmt(daysToLimit)} dia(s)`}.</p> : <p className="flex gap-1.5"><i className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"/>ARM dentro da faixa manejável.</p>}{(last.ks ?? 1) < 1 ? <p className="flex gap-1.5"><i className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400"/>Ks {fmt(last.ks ?? 1,2)} indica restrição hídrica.</p> : null}{last.effectivePrecipitation <= 0 && last.effectiveIrrigationValue <= 0 ? <p className="flex gap-1.5"><i className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500"/>Sem entrada efetiva no último dia.</p> : null}</div></div>
          </div>
        </aside>
      </div>
    </section>
  );
}
