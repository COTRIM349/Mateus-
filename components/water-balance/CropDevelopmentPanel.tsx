"use client";

import { useMemo, useState } from "react";
import { calculateDailyKc, calculateRootDepthMeters } from "@/modules/culture/services/agronomic-engine";
import { buildDevelopmentAudit } from "@/modules/culture/services/crop-development-view";
import { activeFieldObservation, type PhenologyStageOption, type PhenologyFieldObservation } from "@/modules/culture/services/phenology-observed";
import { PhenologyStageEditor, type PhenologyObservationContext } from "@/components/water-balance/PhenologyStageEditor";
import { buildCropDevelopmentBands, cropDevelopmentStageLabel, isCropPhaseShown, setCropPhaseShown } from "@/modules/culture/services/crop-development-bands";
import type { CulturePhase } from "@/modules/culture/services/culture.service";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import type { PhenologyChartMarker } from "@/modules/culture/services/phenology-chart-markers";

type CurvePoint = { x: number; y: number };
type ChartVariable = "kc" | "root" | "potential" | "stages";
type ChartVisibility = Record<ChartVariable, boolean>;
type AxisMode = "dae" | "date";

interface Props {
  rows: DailyBalanceRow[];
  markers: PhenologyChartMarker[];
  stageOptions?: PhenologyStageOption[];
  fieldObservations?: PhenologyFieldObservation[];
  observationContext?: PhenologyObservationContext | null;
  onObservationSaved?: (observation:PhenologyFieldObservation)=>void;
  kcCurve: CurvePoint[] | null;
  rootCurve?: CurvePoint[] | null;
  culturePhases?: CulturePhase[];
  daeOffsetFromPlanting?: number;
  kcCurveLabel?: string | null;
  cropName: string | null;
  varietyName: string | null;
  pivotName?: string | null;
  seasonName?: string | null;
}

const fmt = (n: number, digits = 1) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n);

function dateAtDae(lastDate: string, currentDae: number, targetDae: number) {
  const ref = new Date(lastDate + "T12:00:00Z");
  if (Number.isNaN(ref.getTime())) return "—";
  ref.setUTCDate(ref.getUTCDate() + Math.round(targetDae - currentDae));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(ref);
}

function fullDateAtDae(lastDate: string, currentDae: number, targetDae: number) {
  const ref = new Date(lastDate + "T12:00:00Z");
  if (Number.isNaN(ref.getTime())) return "—";
  ref.setUTCDate(ref.getUTCDate() + Math.round(targetDae - currentDae));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(ref);
}

const groupFor = (code: string) => {
  if (/^R[78]$/.test(code)) return "Maturação";
  if (/^R[3-6]$/.test(code)) return "Enchimento de grãos";
  if (/^R[12]$/.test(code)) return "Florescimento";
  return "Estádios vegetativos";
};

const stagePalette: Record<string, { fill: string; header: string }> = {
  "Estádios vegetativos": { fill: "#e3faf0", header: "#b5efd5" },
  "Florescimento": { fill: "#fff8d4", header: "#fdec9d" },
  "Enchimento de grãos": { fill: "#fff0df", header: "#fed6ab" },
  "Maturação": { fill: "#ffe6e6", header: "#fac6c6" },
};

function GraphLegend({ color, name, dashed = false }: { color: string; name: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[11px] font-medium text-slate-600 dark:text-slate-300">
      <span className="h-1 w-6 rounded" style={{
        background: dashed ? "transparent" : color,
        borderTop: dashed ? "3px dashed " + color : undefined,
      }} />
      {name}
    </span>
  );
}

/**
 * Gráfico único como referência: Kc no eixo direito, raiz no esquerdo,
 * bandas com DAE cadastrados, e histórico separado visualmente de curvas futuras.
 */
export function CropDevelopmentPanel({
  rows, markers, kcCurve, rootCurve = null, kcCurveLabel, cropName,
  varietyName, pivotName, seasonName, culturePhases = [], daeOffsetFromPlanting = 0,
  stageOptions = [],fieldObservations = [],observationContext = null,onObservationSaved,
}: Props) {
  const [axisMode, setAxisMode] = useState<AxisMode>("dae");
  const [showPicker, setShowPicker] = useState(false);
  const [visible, setVisible] = useState<ChartVisibility>({
    kc: true, root: true, potential: true, stages: true,
  });
  const [hoverDae, setHoverDae] = useState<number | null>(null);
  const [hiddenPhases, setHiddenPhases] = useState<string[]>([]);

  const last = rows.at(-1);
  const dae = last?.dae != null && Number.isFinite(last.dae) ? Math.max(0, last.dae) : null;
  const isSoy = /soja/i.test(cropName ?? "");
  const fieldStage=activeFieldObservation(fieldObservations,stageOptions,last?.date??"");
  const audit = useMemo(
    () => buildDevelopmentAudit({ isSoy, currentDae: dae, markers, rows, kcCurve }),
    [isSoy, dae, markers, rows, kcCurve],
  );

  const observed = useMemo(
    () => rows.filter((r) => r.dae != null && Number.isFinite(r.dae) &&
      Number.isFinite(r.kc) && Number.isFinite(r.rootDepth))
      .map((r) => ({
        dae: r.dae!, date: r.date, kc: r.kc, root: r.rootDepth,
        estimatedRoot: r.rootDepthEstimated ?? null,
      })).sort((a, b) => a.dae - b.dae),
    [rows],
  );
  if (!last) return null;

  const stageDated = audit.stages
    .filter((s) => s.dae != null && Number.isFinite(s.dae))
    .sort((a, b) => (a.dae ?? 0) - (b.dae ?? 0));
  const r8Dae = audit.stages.find((s) => s.code === "R8")?.dae ?? null;
  const phaseBands = useMemo(
    () => buildCropDevelopmentBands(culturePhases, daeOffsetFromPlanting),
    [culturePhases, daeOffsetFromPlanting],
  );
  const phaseEnd = Math.max(0, ...phaseBands.map((b) => b.end));
  // Legenda e seletor exibem as mesmas fases; nomes repetidos no cadastro
  // compartilham um único controle e nenhum filtro modifica o balanço.
  const phaseChoices = phaseBands.length
    ? Array.from(new Map(phaseBands.map((b) => [b.label, { label: b.label, color: b.stripe }])).values())
    : Object.entries(stagePalette).map(([label, palette]) => ({ label, color: palette.header }));
  const phaseIsVisible = (label: string) => visible.stages && isCropPhaseShown(label, hiddenPhases);
  const setPhaseVisible = (label: string, shown: boolean) => {
    setHiddenPhases((prev) => setCropPhaseShown(prev, label, shown));
    if (shown) setVisible((prev) => ({ ...prev, stages: true }));
  };

  const curveEnd = Math.max(0,
    ...(kcCurve ?? []).filter((p) => Number.isFinite(p.x)).map((p) => p.x),
    ...(rootCurve ?? []).filter((p) => Number.isFinite(p.x)).map((p) => p.x),
  );
  // Só expande a linha do tempo se o calendário/curva aprovados contiverem pontos futuros.
  // Sem referência, não inventa duração para os estádios não cadastrados.
  const endDae = Math.max(1, dae ?? 0, r8Dae ?? 0, curveEnd, phaseEnd,
    ...stageDated.map((s) => s.dae ?? 0));
  const effectiveCm = Number.isFinite(last.rootDepth) ? last.rootDepth * 100 : null;
  const estimatedCm = last.rootDepthEstimated != null && Number.isFinite(last.rootDepthEstimated)
    ? last.rootDepthEstimated * 100 : null;
  const rootLimited = effectiveCm != null && estimatedCm != null && estimatedCm > effectiveCm + 1;
  const completeKc = (kcCurve ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0);
  const completeRoot = (rootCurve ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0);

  const futureKc = dae != null && completeKc.length >= 2
    ? Array.from({ length: Math.max(0, Math.min(450, Math.floor(endDae - dae))) + 1 },
        (_, i) => ({ dae: dae + i, value: calculateDailyKc(completeKc, dae + i) }))
    : [];
  const futureRoot = dae != null && completeRoot.length >= 2
    ? Array.from({ length: Math.max(0, Math.min(450, Math.floor(endDae - dae))) + 1 },
        (_, i) => ({ dae: dae + i, value: calculateRootDepthMeters(completeRoot, dae + i) }))
    : [];

  const rootCeiling = Math.max(0.6, last.rootDepth,
    ...observed.map((r) => r.root), ...futureRoot.map((r) => r.value));
  const kcCeiling = Math.max(1.1, last.kc,
    ...observed.map((r) => r.kc), ...futureKc.map((r) => r.value));
  const rootAxisMax = Math.ceil(rootCeiling * 5.2) / 5;
  const kcAxisMax = Math.ceil(kcCeiling * 5.2) / 5;

  const plot = { left: 65, right: 1110, top: 83, bottom: 338 };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const px = (d: number) => plot.left + (Math.min(endDae, Math.max(0, d)) / endDae) * plotWidth;
  const pyRoot = (v: number) => plot.bottom - Math.max(0, Math.min(rootAxisMax, v)) / rootAxisMax * plotHeight;
  const pyKc = (v: number) => plot.bottom - Math.max(0, Math.min(kcAxisMax, v)) / kcAxisMax * plotHeight;
  const trace = (arr: Array<{ dae: number; value: number }>, fn: (n: number) => number) =>
    arr.map((v) => px(v.dae).toFixed(1) + "," + fn(v.value).toFixed(1)).join(" ");
  const kcObserved = observed.map((r) => ({ dae: r.dae, value: r.kc }));
  const rootObserved = observed.map((r) => ({ dae: r.dae, value: r.root }));
  const rootAvailable = observed.length > 0;
  const visibleStages = stageDated.filter((s) => (s.dae ?? 0) <= endDae);

  // Segmentos resultam EXCLUSIVAMENTE de marcos fenológicos com DAE cadastrados.
  const stageBands = visibleStages.map((stage, i) => {
    const next = visibleStages[i + 1]?.dae;
    const end = next != null ? next : endDae;
    return { ...stage, start: stage.dae ?? 0, end: Math.max(stage.dae ?? 0, end),
      group: groupFor(stage.code) };
  }).filter((stage) => stage.end > stage.start);
  const groupBands: Array<{ group: string; start: number; end: number }> = [];
  for (const stage of stageBands) {
    const prev = groupBands.at(-1);
    if (prev && prev.group === stage.group && stage.start <= prev.end) prev.end = stage.end;
    else groupBands.push({ group: stage.group, start: stage.start, end: stage.end });
  }
  const todayX = dae != null ? px(dae) : null;
  const activeDae = hoverDae;
  const hoverRow = activeDae != null
    ? [...observed].reverse().find((row) => row.dae <= activeDae)
    : null;
  const hoverStage = activeDae != null
    ? [...visibleStages].reverse().find((s) => (s.dae ?? 0) <= activeDae)
    : null;
  const hoverPhase = activeDae != null
    ? phaseBands.find((b) => b.start <= activeDae && b.end > activeDae)
    : null;
  const selectedPhenology=fieldStage?.stage.code ??
    cropDevelopmentStageLabel(audit.currentStage?.code,last.phase);
  const observedAtDae=fieldStage?.observation.dae ?? null;
  const tooltipKc = activeDae == null ? null : activeDae <= (dae ?? 0)
    ? hoverRow?.kc ?? null
    : completeKc.length >= 2 ? calculateDailyKc(completeKc, activeDae) : null;
  const tooltipRoot = activeDae == null ? null : activeDae <= (dae ?? 0)
    ? hoverRow?.root ?? null
    : completeRoot.length >= 2 ? calculateRootDepthMeters(completeRoot, activeDae) : null;
  const seasonDateRange = dae != null
    ? fullDateAtDae(last.date, dae, 0) + " – " + fullDateAtDae(last.date, dae, endDae)
    : "Ciclo sem DAE";
  const metric = (symbol: string, title: string, value: string, subtitle: string, color: string) => (
    <div key={title} className="flex min-h-[102px] items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[21px]"
        style={{ color, backgroundColor: color + "12" }} aria-hidden="true">{symbol}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight text-slate-900 dark:text-white">{value}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4" aria-label="Desenvolvimento da cultura, Kc e profundidade radicular">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[23px] font-black tracking-tight text-slate-900 dark:text-white">
              {cropName ?? "Cultura"} - {varietyName ?? "cultivar não cadastrada"}
            </h2>
            {kcCurve && <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              Curva ativa · cultivar/cultura
            </span>}
          </div>
          <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
            {pivotName ?? "Pivô"}{seasonName ? "  |  " + seasonName : ""} ·
            evolução por DAE cadastrado, valores do balanço e curvas aprovadas
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {metric("◈", fieldStage?"Último estádio observado":"Estádio / fase estimada", selectedPhenology,
          fieldStage?fieldStage.stage.name+" · "+fieldStage.observation.observed_date+" (campo)"
            : audit.currentStage?audit.currentStage.label+" · referência da cultivar"
            : "Macrofase estimada · sem observação detalhada", "#059669")}
        {metric("▦", "DAE", dae == null ? "—" : String(dae),
          r8Dae != null ? "de " + r8Dae + " dias até R8 (estimado)" : "Ciclo final não cadastrado", "#0284c7")}
        {metric("⌁", "Kc atual", fmt(last.kc, 2), "Conforme cálculo do motor", "#0284c7")}
        {metric("♧", "Prof. radicular efetiva", effectiveCm == null ? "—" : fmt(last.rootDepth, 2) + " m",
          rootLimited ? "Potencial: " + fmt(estimatedCm! / 100, 2) + " m" : "Raiz usada no balanço", "#7c3aed")}
        {metric("▱", "Fase da cultura", last.phase ?? "—", "Macroestádio do manejo", "#d97706")}
        {metric("◷", "Ciclo estimado", r8Dae != null ? r8Dae + " dias" :
          phaseEnd > 0 ? Math.round(phaseEnd) + " dias" : "—",
          r8Dae != null ? "VE → R8 · cultivar" : "Duração das fases cadastradas", "#f97316")}
      </div>

      {observationContext && onObservationSaved && stageOptions.length>0 && dae!=null && (
        <PhenologyStageEditor key={observationContext.assignmentId}
          context={observationContext} stages={stageOptions} observations={fieldObservations}
          today={last.date} todayDae={dae} onSaved={onObservationSaved}/>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-graphite-900 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-extrabold text-slate-900 dark:text-white">
              Desenvolvimento fenológico da cultura
            </h3>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
              Fases coloridas do ciclo, curva de Kc e crescimento radicular no mesmo eixo de tempo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:text-slate-200">
              {seasonDateRange}
            </span>
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-white/10 dark:bg-white/[0.06]"
              role="group" aria-label="Eixo horizontal do desenvolvimento">
              {(["dae", "date"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => setAxisMode(mode)}
                  aria-pressed={axisMode === mode}
                  className={"rounded-md px-3 py-1.5 text-[11px] font-bold " +
                    (axisMode === mode ? "bg-emerald-700 text-white shadow-sm" : "text-slate-500 dark:text-slate-300")}>
                  {mode === "dae" ? "DAE" : "Data"}
                </button>
              ))}
            </div>
            <div className="relative">
              <button type="button" aria-expanded={showPicker}
                onClick={() => setShowPicker((s) => !s)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white dark:hover:bg-white/10">
                ⚙ Variáveis do gráfico
              </button>
              {showPicker && (
                <div className="absolute right-0 top-full z-20 mt-2 min-w-[220px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#13262e]">
                  <p className="mb-2 text-[11px] font-extrabold text-slate-800 dark:text-white">Exibir no gráfico</p>
                  {([
                    ["kc", "Kc da cultura"],
                    ["root", "Raiz efetiva (histórico)"],
                    ["potential", "Curvas futuras aprovadas"],
                    ["stages", "Faixas fenológicas"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 py-1.5 text-[12px] text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={visible[key]}
                        onChange={(event) => setVisible((old) => ({ ...old, [key]: event.target.checked }))}
                        className="accent-emerald-600" />
                      {label}
                    </label>
                  ))}
                  <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/15" role="group"
                    aria-label="Selecionar fases fenológicas no menu">
                    <p className="mb-2 text-[11px] font-bold text-slate-700 dark:text-slate-100">
                      Fases do ciclo (seleção individual)
                    </p>
                    {phaseChoices.map((phase) => (
                      <label key={phase.label}
                        className="flex cursor-pointer items-center gap-2 py-1.5 text-[12px] text-slate-700 dark:text-slate-200">
                        <input type="checkbox"
                          checked={phaseIsVisible(phase.label)}
                          onChange={(event) => setPhaseVisible(phase.label, event.target.checked)}
                          className="accent-emerald-600" />
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: phase.color }} />
                        {phase.label}
                      </label>
                    ))}
                  </div>
                  <button type="button" onClick={() => {
                    setVisible({ kc: true, root: true, potential: true, stages: true });
                    setHiddenPhases([]);
                  }} className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Mostrar todas
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {audit.currentStage == null && fieldStage == null && (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-400/25 dark:bg-amber-950/20 dark:text-amber-200">
            {phaseBands.length > 0
              ? "As faixas coloridas vêm do cadastro das fases da cultura. Para indicar VE, VC, V1…R8 no dia correto, cadastre os DAE esperados ou calibrados da cultivar."
              : "Não há fases nem datas de estádios registrados: complete o cadastro fenológico para preencher o desenvolvimento."}
          </p>
        )}
        {dae == null || observed.length === 0 ? (
          <div className="rounded-xl bg-amber-50 p-6 text-[12px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            DAE ou histórico do balanço indisponível. Cadastre a referência de emergência e recalcule o manejo.
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-xl border border-slate-100 bg-white dark:border-white/10 dark:bg-[#0d2328]">
            <svg viewBox="0 0 1190 414" className="block min-w-[900px] w-full"
              role="img" aria-label="Gráfico único de desenvolvimento da cultura com Kc e profundidade radicular">
              <defs>
                <clipPath id="culture-development-clip">
                  <rect x={plot.left} y={plot.top} width={plotWidth} height={plotHeight} />
                </clipPath>
              </defs>

              {visible.stages && (
                <g>
                  {/* As macrofases reais do cadastro colorem o ciclo mesmo sem VC, V1 ou R1 com DAE. */}
                  {phaseBands.map((band) => {
                    if (!phaseIsVisible(band.label)) return null;
                    const bx=px(band.start),bw=Math.max(0,px(band.end)-bx);
                    return <g key={band.key}>
                      <rect x={bx} y={plot.top} width={bw} height={plotHeight}
                        fill={band.fill} opacity={.82}/>
                      <rect x={bx} y={21} width={bw} height={33} fill={band.stripe} opacity={.97}/>
                      <line x1={bx} y1={21} x2={bx} y2={plot.bottom}
                        stroke={band.text} strokeOpacity={.18}/>
                      {bw>=44 && <text x={bx+bw/2} y={42} textAnchor="middle"
                        fontSize={bw>150?15:11} fontWeight={800} fill={band.text}>
                        {band.label.length>23 && bw<180 ? band.label.slice(0,20)+"…" : band.label}
                      </text>}
                      <title>{band.label} · {Math.round(band.start)}–{Math.round(band.end)} DAE · cadastro da cultura</title>
                    </g>;
                  })}
                  {phaseBands.length===0 && groupBands.map((group, i) => {
                    if (!phaseIsVisible(group.group)) return null;
                    const palette = stagePalette[group.group] ?? stagePalette["Estádios vegetativos"];
                    const bx = px(group.start), bw = Math.max(0, px(group.end) - bx);
                    return <g key={group.group + i}>
                      <rect x={bx} y={plot.top} width={bw} height={plotHeight}
                        fill={palette.fill} opacity={.62} />
                      <rect x={bx} y={20} width={bw} height={34} fill={palette.header} />
                      {bw >= 98 && <text x={bx + bw / 2} y={41} textAnchor="middle"
                        fontSize={13} fontWeight={800} fill="#334155">{group.group}</text>}
                    </g>;
                  })}
                  {stageBands.map((stage, i) => {
                    // Interseção impede que um estádio desenhe sobre uma fase desmarcada.
                    const spans = phaseBands.length
                      ? phaseBands.filter((b) => phaseIsVisible(b.label))
                          .map((b) => ({ start: Math.max(stage.start, b.start), end: Math.min(stage.end, b.end) }))
                          .filter((span) => span.end > span.start)
                      : phaseIsVisible(stage.group) ? [{start:stage.start,end:stage.end}] : [];
                    return spans.map((span, j) => {
                    const bx = px(span.start), bw = Math.max(0, px(span.end) - bx);
                    return <g key={stage.code + "-" + i + "-" + j}>
                      <rect x={bx} y={54} width={bw} height={29}
                        fill={stagePalette[stage.group]?.fill ?? "#f1f5f9"} opacity={.95}/>
                      <line x1={bx} y1={54} x2={bx} y2={plot.bottom}
                        stroke="#475569" strokeOpacity={.09} />
                      {bw >= 18 && <text x={bx + bw / 2} y={72} textAnchor="middle"
                        fontSize={bw >= 32 ? 12 : 10} fontWeight={800} fill="#334155">{stage.code}</text>}
                      <title>{stage.code} · {stage.label} · a partir de {stage.dae} DAE ({stage.origin})</title>
                    </g>;
                    });
                  })}
                  {visibleStages.length === 0 && phaseBands.length === 0 && <text x={plot.left + 12} y={63}
                    fontSize={12} fill="#b45309">Fases e marcos fenológicos não cadastrados</text>}
                </g>
              )}

              {[0,.25,.5,.75,1].map((part) => (
                <g key={part}>
                  <line x1={plot.left} x2={plot.right} y1={plot.bottom - part * plotHeight}
                    y2={plot.bottom - part * plotHeight} stroke="#64748b" strokeOpacity={.14} />
                  <text x={plot.left - 10} y={plot.bottom - part * plotHeight + 4}
                    textAnchor="end" fontSize={13} fill="#64748b">{fmt(rootAxisMax * part, 2)}</text>
                  <text x={plot.right + 10} y={plot.bottom - part * plotHeight + 4}
                    textAnchor="start" fontSize={13} fill="#64748b">{fmt(kcAxisMax * part, 2)}</text>
                </g>
              ))}
              <text x={16} y={plot.top + plotHeight / 2} transform={"rotate(-90 16 " + (plot.top + plotHeight / 2) + ")"}
                textAnchor="middle" fontSize={13} fontWeight={700} fill="#334155">Profundidade radicular (m)</text>
              <text x={1168} y={plot.top + plotHeight / 2}
                transform={"rotate(90 1168 " + (plot.top + plotHeight / 2) + ")"}
                textAnchor="middle" fontSize={13} fontWeight={700} fill="#334155">Kc</text>

              {Array.from({length:7},(_,i)=>endDae*i/6).map((d,i)=>(
                <g key={i}>
                  <line x1={px(d)} x2={px(d)} y1={plot.bottom} y2={plot.bottom + 5} stroke="#94a3b8"/>
                  <text x={px(d)} y={plot.bottom + 20} textAnchor="middle" fontSize={12} fill="#64748b">
                    {axisMode === "dae" ? Math.round(d) : dateAtDae(last.date,dae,d)}
                  </text>
                </g>
              ))}
              <text x={(plot.left + plot.right)/2} y={390} textAnchor="middle" fontSize={13}
                fontWeight={700} fill="#475569">
                {axisMode === "dae" ? "DAE (dias após emergência)" : "Data do ciclo"}
              </text>

              <g clipPath="url(#culture-development-clip)">
                {/* Curvas de referência completas, mais claras, mostram o ciclo cadastrado.
                    Traços históricos mantêm os dados efetivos em primeiro plano. */}
                {visible.kc && visible.potential && completeKc.length>=2 && (
                  <polyline points={trace(
                    Array.from({length:Math.min(451,Math.floor(endDae)+1)},(_,i)=>({
                      dae:i, value:calculateDailyKc(completeKc,i),
                    })),pyKc)} fill="none" stroke="#10b981" opacity={.32}
                    strokeWidth={2.6} strokeLinejoin="round"/>
                )}
                {visible.root && visible.potential && completeRoot.length>=2 && (
                  <polyline points={trace(
                    Array.from({length:Math.min(451,Math.floor(endDae)+1)},(_,i)=>({
                      dae:i,value:calculateRootDepthMeters(completeRoot,i),
                    })),pyRoot)} fill="none" stroke="#3b82f6" opacity={.28}
                    strokeWidth={2.6} strokeLinejoin="round"/>
                )}
                {visible.kc && kcObserved.length > 0 && (
                  <polyline points={trace(kcObserved, pyKc)} fill="none" stroke="#047857"
                    strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {visible.root && rootAvailable && (
                  <polyline points={trace(rootObserved, pyRoot)} fill="none" stroke="#1672ef"
                    strokeWidth={3.6} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {visible.kc && visible.potential && futureKc.length > 1 && (
                  <polyline points={trace(futureKc, pyKc)} fill="none" stroke="#047857"
                    strokeWidth={3} strokeDasharray="8 5" opacity={.76} strokeLinejoin="round"/>
                )}
                {visible.root && visible.potential && futureRoot.length > 1 && (
                  <polyline points={trace(futureRoot, pyRoot)} fill="none" stroke="#1672ef"
                    strokeWidth={3} strokeDasharray="8 5" opacity={.76} strokeLinejoin="round"/>
                )}
                {todayX != null && (
                  <line x1={todayX} x2={todayX} y1={plot.top} y2={plot.bottom}
                    stroke="#065f46" strokeDasharray="6 5" strokeWidth={1.6} opacity={.84}/>
                )}
                {visible.kc && todayX != null && (
                  <circle cx={todayX} cy={pyKc(last.kc)} r={6}
                    fill="#047857" stroke="white" strokeWidth={2} />
                )}
                {visible.root && todayX != null && (
                  <circle cx={todayX} cy={pyRoot(last.rootDepth)} r={6}
                    fill="#1672ef" stroke="white" strokeWidth={2} />
                )}
              </g>

              {fieldStage && observedAtDae!=null && visible.stages && (
                <g>
                  {/* Marco de campo persistido: futuras faixas continuam como referência. */}
                  <rect x={todayX??plot.right} y={plot.top}
                    width={Math.max(0,plot.right-(todayX??plot.right))}
                    height={plotHeight} fill="#f8fafc" opacity={.35}/>
                  <line x1={px(observedAtDae)} x2={px(observedAtDae)}
                    y1={plot.top} y2={plot.bottom}
                    stroke="#eab308" strokeWidth={2.4} strokeDasharray="6 4"/>
                  <rect x={Math.min(plot.right-166,Math.max(plot.left,px(observedAtDae)-83))}
                    y={56} width={166} height={24} rx={6} fill="#065f46"/>
                  <text x={Math.min(plot.right-83,Math.max(plot.left+83,px(observedAtDae)))}
                    y={72} fill="white" fontSize={12} fontWeight={800} textAnchor="middle">
                    {fieldStage.stage.code} · REGISTRO DE CAMPO
                  </text>
                </g>
              )}
              {todayX != null && (
                <g>
                  <rect x={Math.min(plot.right - 114, Math.max(plot.left, todayX - 48))} y={1}
                    width={122} height={20} rx={5} fill="#065f46"/>
                  <text x={Math.min(plot.right - 53, Math.max(plot.left + 61, todayX + 13))}
                    y={15} textAnchor="middle" fill="#ecfdf5" fontSize={11} fontWeight={800}>
                    HOJE · {dae} DAE
                  </text>
                </g>
              )}
              {activeDae != null && (
                <g>
                  <rect x={Math.min(plot.right - 202, Math.max(plot.left + 8, px(activeDae) - 82))}
                    y={plot.top + 14} width={200} height={75} rx={8} fill="#0f2336" opacity={.96}/>
                  <text x={Math.min(plot.right - 192, Math.max(plot.left + 18, px(activeDae) - 72))}
                    y={plot.top + 32} fill="white" fontSize={12} fontWeight={800}>
                    {activeDae > dae ? "Referência · " : "Histórico · "}{Math.round(activeDae)} DAE
                  </text>
                  <text x={Math.min(plot.right - 192, Math.max(plot.left + 18, px(activeDae) - 72))}
                    y={plot.top + 49} fill="#e2e8f0" fontSize={12}>
                    {fieldStage && activeDae>=fieldStage.observation.dae && activeDae<=dae
                      ? "Observado: "+fieldStage.stage.code
                      : hoverStage ? "Estimado: "+hoverStage.code : "Fase: "+(hoverPhase?.label ?? "não cadastrada")}
                  </text>
                  <text x={Math.min(plot.right - 192, Math.max(plot.left + 18, px(activeDae) - 72))}
                    y={plot.top + 65} fill="#e2e8f0" fontSize={12}>
                    Kc: {tooltipKc == null ? "—" : fmt(tooltipKc, 2)} · Raiz: {tooltipRoot == null ? "—" : fmt(tooltipRoot, 2) + " m"}
                  </text>
                </g>
              )}
              <rect x={plot.left} y={plot.top} width={plotWidth} height={plotHeight}
                fill="transparent" onMouseMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const fraction = (event.clientX - box.left) / Math.max(1, box.width);
                  setHoverDae(Math.round(Math.max(0, Math.min(1, fraction)) * endDae));
                }}
                onMouseLeave={() => setHoverDae(null)}>
                <title>Passe o cursor para consultar DAE, Kc, raiz e estádio</title>
              </rect>
            </svg>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-slate-100 py-3 dark:border-white/10">
          {visible.kc && <GraphLegend color="#047857" name="Kc (direita)"/>}
          {visible.root && <GraphLegend color="#1672ef" name="Profundidade radicular efetiva (esquerda)"/>}
          {visible.potential && <GraphLegend color="#64748b" name="Referência futura cadastrada" dashed/>}
          <div className="flex flex-wrap items-center justify-center gap-1.5" role="group"
            aria-label="Selecionar fases fenológicas">
            <span className="mr-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Fases (clique para mostrar/ocultar):
            </span>
            {phaseChoices.map((phase) => {
              const isActive = phaseIsVisible(phase.label);
              return (
                <button key={phase.label} type="button" aria-pressed={isActive}
                  aria-label={(isActive ? "Ocultar fase " : "Mostrar fase ") + phase.label}
                  title={(isActive ? "Ocultar" : "Mostrar") + " a faixa " + phase.label}
                  onClick={() => setPhaseVisible(phase.label, !isActive)}
                  className={"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors " +
                    (isActive ? "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:bg-white/10 dark:text-slate-100" :
                      "border-dashed border-slate-300 bg-transparent text-slate-400 line-through hover:bg-slate-50 dark:border-white/15 dark:text-slate-500")}>
                  <span className="h-3 w-3 rounded-sm" style={{backgroundColor:phase.color,opacity:isActive?1:.3}}/>
                  {phase.label}
                </button>
              );
            })}
            {(hiddenPhases.length>0 || !visible.stages) && (
              <button type="button" onClick={() => {
                setHiddenPhases([]);
                setVisible((prev) => ({...prev,stages:true}));
              }} className="ml-1 text-[11px] font-bold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300">
                Todas as fases
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3 dark:border-white/10">
          <h4 className="text-[13px] font-extrabold text-slate-800 dark:text-white">
            Estádios e parâmetros da cultivar
          </h4>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            DAE, Kc e profundidade radicular por estádio cadastrado.
            Referências futuras são estimativas da cultivar; não representam medições de campo.
          </p>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-2">
            {audit.stages.map((stage) => {
              const manuallyObserved=fieldStage?.stage.code===stage.code;
              const stageDae=manuallyObserved?observedAtDae:stage.dae;
              const kcAtStage = stageDae != null && completeKc.length >= 2
                ? calculateDailyKc(completeKc, stageDae) : null;
              const rootAtStage = stageDae != null && completeRoot.length >= 2
                ? calculateRootDepthMeters(completeRoot, stageDae)
                : observed.find((row) => row.dae === stageDae)?.root ?? null;
              const palette = stagePalette[groupFor(stage.code)] ?? stagePalette["Estádios vegetativos"];
              return (
                <div key={stage.code} title={stageDae == null ? "Sem DAE cadastrado" :
                  stage.label + " · " + stageDae + " DAE (" + stage.origin + ")"}
                  className={"min-w-[100px] flex-1 rounded-lg border px-2 py-3 text-center " +
                    (manuallyObserved || (!fieldStage && stage.current) ? "border-amber-500 bg-amber-50 shadow-sm dark:bg-amber-800/20" :
                      "border-slate-200 dark:border-white/10")}
                  style={stage.current ? undefined : {backgroundColor:palette.fill}}>
                  <p className="text-[13px] font-black text-slate-800">{stage.code}</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-600">
                    {stageDae == null ? "DAE —" : stageDae + " DAE"}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-700">
                    Kc: {kcAtStage == null ? "—" : fmt(kcAtStage,2)}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-700">
                    Raiz: {rootAtStage == null ? "—" : fmt(rootAtStage,2) + " m"}
                  </p>
                  {manuallyObserved && <p className="mt-1 text-[10px] font-bold text-amber-700">Observado</p>}
                  {!fieldStage && stage.current && <p className="mt-1 text-[10px] font-bold text-amber-700">Estimado</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {rootLimited && <p className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[12px] font-medium text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/20 dark:text-amber-200">
        Raiz potencial da cultura: {fmt(estimatedCm! / 100,2)} m; raiz efetiva usada no balanço:
        {" " + fmt(last.rootDepth,2)} m. O perfil de solo limita o cálculo da água disponível.
      </p>}
      <div className={"rounded-xl border px-3 py-2.5 text-[11px] " +
        (audit.issues.length ? "border-amber-300/50 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-950/20 dark:text-amber-200" :
          "border-emerald-300/50 bg-emerald-50 text-emerald-900 dark:border-emerald-600/25 dark:bg-emerald-900/10 dark:text-emerald-200")}>
        <p className="font-extrabold">
          {audit.issues.length ? "Conferências e dados a revisar" : "Coerência dos dados do desenvolvimento"}
        </p>
        <p className="mt-1">Kc confrontado com curva ativa em {audit.checkedKcDays} dia(s).
          Fenologia por idade esperada/calibrada, não por observação automática da planta.
          ETc potencial = ETo × Kc; sem Kl.</p>
        {audit.issues.map((issue,i)=><p key={i} className="mt-1">• {issue}</p>)}
      </div>
    </div>
  );
}
