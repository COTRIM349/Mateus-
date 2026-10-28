"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import { buildRasPoint, currentWeekStats, rasWaterReplenishment, type RasPoint } from "@/modules/water-balance/services/ras-panel-model";
import { rasDisplaySeries, rasDisplayAxisCeiling, RAS_UNITS, type RasDisplayUnit, type RasDisplayPoint } from "@/modules/water-balance/services/ras-display-modes";
import type { SoilProfileLayer } from "@/modules/soil/services/soil-profile";
import { rasEventAxisCeiling, rasEventVerticalPosition } from "@/modules/water-balance/services/ras-event-axis";
import { auditRasGraph } from "@/modules/water-balance/services/ras-chart-audit";

type ZoomMode = "full" | "arm" | "lamina";
type RASObservationsVisibility = { current: boolean; capacity: boolean; safety: boolean; pmp: boolean; chuva: boolean; irrigacao: boolean; eto: boolean };
type StatTone = "green" | "blue" | "cyan" | "purple" | "orange" | "red" | "white";
const colours: Record<StatTone, string> = {
  green: "#41d77b", blue: "#58baff", cyan: "#41e7c0", purple: "#c06bff",
  orange: "#ffc058", red: "#ff6477", white: "#f3f7fa",
};
const n = (value: number, digits = 1) => Number.isFinite(value)
  ? value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : "—";
const fmtDate = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function Tile({ label, value, hint, tone = "white", symbol = "◉" }: {
  label: string; value: string; hint?: string; tone?: StatTone; symbol?: string;
}) {
  return (
    <div className="flex min-h-[82px] min-w-0 items-center gap-2 rounded-lg border border-white/[0.09] bg-[#0b1c23] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-[17px] font-bold" style={{ color: colours[tone] }} aria-hidden="true">{symbol}</div>
      <div className="min-w-0">
        <div className="break-words text-[10.5px] font-medium leading-tight text-slate-300">{label}</div>
        <div title={value} className="mt-0.5 max-w-full truncate text-[clamp(16px,1.25vw,21px)] font-extrabold leading-tight tracking-normal tabular-nums" style={{ color: colours[tone] }}>{value}</div>
        {hint && <div className="mt-1 break-words text-[9.5px] leading-tight text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, hint, symbol, tone = "white" }: {
  label: string; value: string; hint?: string; symbol: string; tone?: StatTone;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0a1a21] p-3">
      <span className="text-xl" style={{ color: colours[tone] }} aria-hidden="true">{symbol}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-300">{label}</div>
        <div title={value} className="mt-1 max-w-full truncate text-[clamp(18px,1.25vw,23px)] font-extrabold leading-tight tabular-nums text-white">{value}</div>
        {hint && <div className="mt-1 text-[10px] leading-snug text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

function Legend({ color, text, dashed = false }: { color: string; text: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-200">
      <span className="inline-block w-8 border-t-[3px]" style={{ borderColor: color, borderTopStyle: dashed ? "dashed" : "solid" }} />
      <span>{text}</span>
    </div>
  );
}

function RasFullWidthChart({ points, displayed, unit, replacementMm, mode, visible, expanded }: {
  points: RasPoint[]; displayed: RasDisplayPoint[]; unit: RasDisplayUnit; replacementMm: number; mode: ZoomMode; visible: RASObservationsVisibility; expanded: boolean;
}) {
  // O SVG recebe dimensões em pixels reais: textos, círculos e nomes não são
  // deformados pelo redimensionamento da janela ou ao entrar em tela cheia.
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 350 });
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width), height = Math.round(rect.height);
      if (width <= 0 || height <= 0) return;
      setSize(prev => prev.width === width && prev.height === height ? prev : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Os três gráficos usam o mesmo plano de datas, com escala de eventos independente em mm/dia.
  const integratedCc = true;
  const W = Math.max(900, size.width), H = Math.max(300, size.height);
  // No gráfico %CC, os eventos utilizam o mesmo plano de datas e o eixo direito em mm/dia.
  // As demais unidades conservam a banda inferior original até a revisão dos seus modelos.
  const l = 66, r = 185, t = 30, b = 58;
  const width = W - l - r, height = H - t - b;
  const newest = points[points.length - 1];
  const latest = displayed[displayed.length - 1];
  if (!newest || !latest || points.length !== displayed.length) return null;
  // Escala por unidade, limites variáveis a cada dia (não usa CAD final para todo o ciclo).
  // 100% CC é o topo visual exato: sem margem artificial de 5–8%.
  // Para ARM (mm) e % em peso, a CC máxima do período define o teto.
  const fullMax = rasDisplayAxisCeiling(displayed, unit);
  let yMin = 0, yMax = fullMax;
  if (mode !== "full") {
    const selected = mode === "lamina" ? displayed.slice(-14) : displayed;
    const values = selected.flatMap(p => [p.current, p.safety]);
    const low = Math.min(...values), high = Math.max(...values);
    const margin = Math.max(fullMax * .07, (high - low) * .20);
    yMin = Math.max(0, low - margin);
    yMax = Math.min(fullMax, Math.max(yMin + fullMax * .15, high + margin));
  }
  const x = (i: number) => l + (points.length === 1 ? width / 2 : i / (points.length - 1) * width);
  const y = (v: number) => t + (yMax - v) / (yMax - yMin) * height;
  type DisplayKey = "current" | "capacity" | "safety" | "pmp";
  const line = (key: DisplayKey) =>
    displayed.map((p, i) => `${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(" ");
  const segments = (upper: DisplayKey, lower: DisplayKey, fill: string) =>
    displayed.slice(0, -1).map((p, i) => {
      const next = displayed[i + 1];
      const d = `M ${x(i)},${y(p[upper])} L ${x(i+1)},${y(next[upper])} L ${x(i+1)},${y(next[lower])} L ${x(i)},${y(p[lower])} Z`;
      return <path key={`${upper}-${lower}-${i}`} d={d} fill={fill} />;
    });
  const lastX = x(points.length - 1);
  const lastY = y(latest.current);
  const hasReplacement = replacementMm > 0.05 && visible.current && visible.capacity;

  // A banda inferior utiliza escala INDEPENDENTE em mm/dia. Não mistura
  // eventos de entrada/ETo com o eixo da umidade em % da capacidade de campo.
  // Irrigação é a lâmina bruta REAL lançada; chuva é a chuva efetiva usada no
  // balanço. Valores originais da chuva manual ficam acessíveis nos detalhes.
  const eventsTop = integratedCc ? t : t + height + 46;
  const eventsHeight = integratedCc ? height : 85;
  const eventsBottom = eventsTop + eventsHeight;
  const eventMaxRaw = Math.max(1, ...points.map(p => Math.max(
    visible.chuva ? p.rainEffectiveMm : 0,
    visible.irrigacao ? p.irrigationAppliedMm : 0,
    visible.eto ? p.et0 : 0,
  )));
  const eventMax = integratedCc ? rasEventAxisCeiling(points, visible) : Math.max(2, Math.ceil(eventMaxRaw / 2) * 2);
  // Irrigação, chuva e ETo têm eixo secundário independente: 0 mm = base do gráfico.
  const eventY = (mm: number) => rasEventVerticalPosition(mm, eventMax, eventsTop, eventsHeight);
  const eventBarWidth = Math.max(4, Math.min(11, width / Math.max(points.length, 1) / 5));
  const summaryX = integratedCc ? l+width+64 : l+width+12;
  const labelStride = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(width / 64))));
  const etoPoints = points.filter(p => Number.isFinite(p.et0));
  const etoPath = etoPoints.map(p => {
    const index = points.findIndex(r => r.date === p.date);
    return `${x(index).toFixed(2)},${eventY(p.et0).toFixed(2)}`;
  }).join(" ");
  return (
    <div ref={containerRef} className={`w-full overflow-x-auto ${expanded ? "h-[calc(100dvh-170px)] min-h-[420px] max-h-none" : "h-[320px] sm:h-[350px] xl:h-[390px]"}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
        aria-label={`Reservatório em ${RAS_UNITS[unit].axis}: água atual, capacidade de campo, limite de manejo, PMP e eventos diários`}
        className="block max-w-none" preserveAspectRatio="xMinYMin meet">
        <defs>
          <clipPath id="rasFullClip"><rect x={l} y={t} width={width} height={height} /></clipPath>
          <linearGradient id="rasFullArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#15aa75" stopOpacity=".28" />
            <stop offset="100%" stopColor="#b81e43" stopOpacity=".24" />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => yMin + i * (yMax - yMin) / 4).map((q) => (
          <g key={q}>
            <line x1={l} x2={l+width} y1={y(q)} y2={y(q)} stroke="#ffffff" strokeOpacity=".10" strokeWidth={1}/>
            <text x={l-12} y={y(q)+5} fill="#d7e4eb" textAnchor="end" fontSize={16}>{unit === "cc" ? n(q,0) : n(q,unit==="weight"?2:1)}</text>
          </g>
        ))}
        <text x={3} y={t+8} fill="#d8e6ed" fontSize={16}>{RAS_UNITS[unit].axis}</text>
        <g clipPath="url(#rasFullClip)">
          {visible.current && unit === "mm" && (
            <path d={"M "+x(0)+" "+y(0)+" L "+displayed.map((p,i) => x(i)+" "+y(p.current)).join(" L ")+" L "+x(displayed.length-1)+" "+y(0)+" Z"}
              fill="rgba(179,198,215,.22)"/>
          )}
          {visible.safety && <polyline points={line("safety")} stroke="#ff5a60" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>}
          {visible.pmp && <polyline points={line("pmp")} stroke="#a2adb8" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>}
          {visible.capacity && <polyline points={line("capacity")} stroke={unit === "mm" ? "#fa8568" : "#6576ff"} fill="none" strokeWidth={2.6}/>}
          {visible.current && <polyline points={line("current")} stroke={unit === "mm" ? "#ced8e2" : "#b77841"} fill="none" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round"/>}
          {visible.current && displayed.map((p,i)=><circle key={p.date} cx={x(i)} cy={y(p.current)} r={Math.max(2.4, Math.min(5.3, width / displayed.length / 7))} stroke="#dbe4ed" strokeWidth={1} fill={unit === "mm" ? "#d1dae5" : "#b77841"}>
            <title>{p.date}: atual {n(p.current,unit==="weight"?2:1)} {RAS_UNITS[unit].axis}; CC {n(p.capacity,1)}, limite {n(p.safety,1)}, PMP {n(p.pmp,1)}; ARM {n(points[i].armMm,1)} mm, CAD {n(points[i].ctaMm,1)} mm.</title>
          </circle>)}
        </g>
        {hasReplacement && (
          <g>
            <line x1={lastX+18} y1={lastY} x2={lastX+18} y2={y(latest.capacity)+5} stroke="#24baff" strokeWidth={5} strokeLinecap="round"/>
            <polygon points={`${lastX+18},${y(latest.capacity)-5} ${lastX+10},${y(latest.capacity)+10} ${lastX+26},${y(latest.capacity)+10}`} fill="#24baff"/>
            <rect x={lastX-125} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))} width={118} height={51} rx={7} fill="#1068db" stroke="#3baaff"/>
            <text x={lastX-66} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))+20} textAnchor="middle" fontSize={18} fill="white" fontWeight="bold">Repor {n(replacementMm,1)} mm</text>
            <text x={lastX-66} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))+39} textAnchor="middle" fontSize={18} fill="white">até CC do dia</text>
          </g>
        )}
        {/* Modo %CC: uma única área plotada; eixo direito exclusivo dos eventos em mm/dia.
            As barras começam exatamente em 0 mm na base, independentemente do eixo esquerdo. */}
        {integratedCc ? (
          <g aria-label="Eixo direito: irrigação, chuva e ETo em mm por dia">
            <text x={l+width+12} y={t-12} fill="#b7cbd5" fontSize={17}>mm/dia</text>
            {[0, eventMax/4, eventMax/2, eventMax*3/4, eventMax].map((tick, i)=>(
              <g key={i}>
                <text x={l+width+12} y={eventY(tick)+5} fill="#b9cdd7" fontSize={17}>{n(tick,1)}</text>
              </g>
            ))}
          </g>
        ) : (
          <>
            <text x={l} y={eventsTop-21} fill="#d1e1e8" fontSize={17} fontWeight={700}>
              Chuva efetiva, irrigação realizada e ETo diária
            </text>
            <text x={l+width+12} y={eventsTop-21} fill="#b7cbd5" fontSize={18}>mm/dia</text>
            {[0, eventMax / 2, eventMax].map((tick, i)=>(
              <g key={i}>
                <line x1={l} x2={l+width} y1={eventY(tick)} y2={eventY(tick)}
                  stroke="#ffffff" strokeOpacity={tick===0?.20:.07} />
                <text x={l+width+12} y={eventY(tick)+5} fill="#b9cdd7" fontSize={17}>{n(tick,1)}</text>
              </g>
            ))}
          </>
        )}
        <g clipPath={integratedCc ? "url(#rasFullClip)" : undefined}>
          {points.map((p,i)=>(
            <g key={p.date}>
              {visible.chuva && p.rainEffectiveMm>0 && (
                <rect x={x(i)-eventBarWidth-1} y={eventY(p.rainEffectiveMm)}
                  width={eventBarWidth} height={Math.max(0,eventsBottom-eventY(p.rainEffectiveMm))}
                  rx={2} fill="#2e91ff" opacity={.9}>
                  <title>{fmtDate(p.date)}: chuva registrada {n(p.rainRecordedMm,2)} mm; chuva efetiva {n(p.rainEffectiveMm,2)} mm</title>
                </rect>
              )}
              {visible.irrigacao && p.irrigationAppliedMm>0 && (
                <rect x={x(i)+1} y={eventY(p.irrigationAppliedMm)}
                  width={eventBarWidth} height={Math.max(0,eventsBottom-eventY(p.irrigationAppliedMm))}
                  rx={2} fill="#1ce0db" opacity={.86}>
                  <title>{fmtDate(p.date)}: irrigação realizada {n(p.irrigationAppliedMm,2)} mm brutos; efetiva {n(p.irrigationEffectiveMm,2)} mm</title>
                </rect>
              )}
            </g>
          ))}
          {visible.eto && etoPoints.length>1 && (
            <polyline points={etoPath} fill="none" stroke="#ffca42" strokeWidth={2.7}
              strokeLinejoin="round" strokeLinecap="round"/>
          )}
          {visible.eto && points.map((p,i)=>Number.isFinite(p.et0)?(
            <circle key={p.date} cx={x(i)} cy={eventY(p.et0)} r={3.4} stroke="#1b2528" strokeWidth={1} fill="#ffca42">
              <title>{fmtDate(p.date)}: ETo diária {n(p.et0,2)} mm/dia</title>
            </circle>
          ):null)}
        </g>
        {points.map((p,i)=>(i % labelStride === 0 || i === points.length - 1)?
          <text key={p.date} x={x(i)} y={H-13} fill="#d1dae2" textAnchor="middle" fontSize={18}>{fmtDate(p.date)}</text>:null)}
        <text x={summaryX} y={t+27} fill="#dce8ef" fontSize={17}>ARM atual</text>
        <text x={summaryX} y={t+45} fill="#dce8ef" fontSize={18}>{n(newest.armMm,1)} mm</text>
        <text x={summaryX} y={t+67} fill="#dce8ef" fontSize={17}>CAD atual</text>
        <text x={summaryX} y={t+85} fill="#dce8ef" fontSize={18}>{n(newest.ctaMm,1)} mm</text>
        {visible.capacity && <text x={l+7} y={y(latest.capacity)-10} fontSize={16} fill="#36e98a" fontWeight="bold">Capacidade de campo</text>}
        {visible.safety && <text x={l+7} y={y(latest.safety)-10} fontSize={18} fill="#ff656c" fontWeight="bold">Limite de irrigação</text>}
        {visible.pmp && <text x={l+7} y={y(latest.pmp)-10} fontSize={18} fill="#ffae37" fontWeight="bold">PMP</text>}
      </svg>
      <p className="mt-1 px-1 text-[10px] text-slate-400">As séries CC, limite, PMP e umidade atual usam os valores e a zona radicular de cada dia; o ARM à direita mostra apenas o dia atual. {integratedCc ? "As barras de irrigação bruta realizada (verde) e chuva efetiva (azul) partem de 0 mm na base do mesmo gráfico; a linha amarela é a ETo diária. O eixo direito em mm/dia é independente da umidade no eixo esquerdo." : "Na banda inferior, as barras azuis representam a chuva efetiva da chuva registrada, as verdes representam a irrigação bruta realizada e a linha amarela mostra a ETo diária em mm/dia."} Somente dados observados são utilizados.</p>
    </div>
  );
}

export function SoilReservoirReferencePanel({ rows, soilLayers = [], bulkDensity = null, cultureName, varietyName, stage, areaHa, flowRateM3h, efficiencyPercent }: {
  rows: DailyBalanceRow[];
  soilLayers?: SoilProfileLayer[];
  bulkDensity?: number | null;
  cultureName: string | null;
  varietyName: string | null;
  stage: string | null;
  areaHa: number | null;
  flowRateM3h: number | null;
  efficiencyPercent: number | null;
}) {
  const [selectedUnit, setSelectedUnit] = useState<RasDisplayUnit>("cc");
  const [seriesVisibility, setSeriesVisibility] = useState<RASObservationsVisibility>({
    current: true, capacity: true, safety: true, pmp: true,
    chuva: true, irrigacao: true, eto: true,
  });
  const [showAudit, setShowAudit] = useState(false);
  const [expanded, setExpanded] = useState<RasDisplayUnit | null>(null);
  useEffect(() => {
    if (expanded === null) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(null); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);
  const points = useMemo(() => rows.map(buildRasPoint).filter((p): p is RasPoint => p != null), [rows]);
  const gravimetric = useMemo(
    () => rasDisplaySeries(points, "weight", soilLayers, bulkDensity),
    [points, soilLayers, bulkDensity],
  );
  const mmSeries = useMemo(
    () => rasDisplaySeries(points, "mm", soilLayers, bulkDensity) ?? [],
    [points, soilLayers, bulkDensity],
  );
  const ccSeries = useMemo(
    () => rasDisplaySeries(points, "cc", soilLayers, bulkDensity) ?? [],
    [points, soilLayers, bulkDensity],
  );
  const auditedSeries = selectedUnit === "mm" ? mmSeries : selectedUnit === "cc" ? ccSeries : gravimetric;
  const audit = useMemo(
    () => auditRasGraph(rows, points, auditedSeries, selectedUnit),
    [rows, points, auditedSeries, selectedUnit],
  );
  const cards: { id: RasDisplayUnit; title: string; description: string; series: RasDisplayPoint[] | null; symbol: string }[] = [
    { id: "mm", title: "Água disponível (mm)", description: "ARM diário, CAD/CTA e limite de manejo (CAD − AFD)", series: mmSeries, symbol: "◉" },
    { id: "weight", title: "Umidade do solo (% em peso)", description: "Equivalência calculada com densidade e camadas do perfil", series: gravimetric, symbol: "❧" },
    { id: "cc", title: "Umidade do solo (% da CC)", description: "Capacidade de campo = 100% • limite de manejo e PMP", series: ccSeries, symbol: "♧" },
  ];
  const last = rows[rows.length-1];
  const now = points[points.length-1];
  const weekly = currentWeekStats(rows);
  if (!last || !now || !weekly) {
    return <div className="rounded-2xl border border-amber-500/20 bg-[#0b1c23] p-5 text-sm text-amber-200">Dados de CC, PMP e balanço incompletos; o gráfico RAS em %CC só é exibido com perfil hídrico válido.</div>;
  }
  const efficiency = efficiencyPercent != null && efficiencyPercent > 0 ? efficiencyPercent/100 : null;
  const repl = rasWaterReplenishment(now.ctaMm, now.armMm, efficiency, areaHa, flowRateM3h);
  const reservePct = now.ctaMm > 0 ? now.armMm/now.ctaMm*100 : 0;
  const phaseLabel = last.phase && last.phase !== "—" ? last.phase : (stage ?? "—");
  const mmOrDash = (value: number | null, digits=1) => value==null ? "—" : n(value,digits)+" mm";

  return (
    <section className="w-full min-w-0 space-y-3 rounded-[18px] border border-emerald-900/40 bg-[#051216] p-3 text-white shadow-xl sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
        <div>
          <h2 className="text-[22px] font-extrabold leading-tight tracking-tight text-white sm:text-[28px]">Reservatório de Água do Solo (RAS)</h2>
          <p className="mt-1 text-[12px] text-slate-300">Disponibilidade hídrica e recomendação para retornar a 100% da capacidade de campo</p>
          <p className="mt-1 text-[11px] text-slate-400">As barras de chuva e irrigação utilizam os lançamentos realizados na operação, na data de cada registro.</p>
        </div>
      </header>
      <p className="px-1 text-[12px] text-slate-300">
        Selecione uma das três visualizações do mesmo balanço diário. As barras de irrigação e chuva partem de 0 mm
        no eixo direito, sem interferir na escala de umidade e na exploração radicular.
      </p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#0c232a] p-2.5"
        role="group" aria-label="Selecionar gráfico do reservatório">
        {cards.map((card) => (
          <button key={card.id} type="button" aria-pressed={selectedUnit === card.id}
            onClick={() => { setSelectedUnit(card.id); setExpanded(null); }}
            className={"rounded-lg px-3 py-2 text-[12px] font-bold transition-colors " +
              (selectedUnit === card.id ? "bg-santa-600 text-white" : "text-slate-200 hover:bg-white/10")}>
            {card.title}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/lancamentos/chuvas" className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-[12px] font-semibold text-blue-100 hover:bg-blue-500/20">Lançar chuva manual</Link>
        <Link href="/lancamentos/irrigacao" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/20">Lançar irrigação realizada</Link>
        <span className="text-[11px] text-slate-400">Ao retornar ao balanço, o RAS será recalculado com os novos lançamentos.</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 min-[1550px]:grid-cols-9">
        <Tile label="Cultura" value={cultureName ?? "—"} hint="Parcela em manejo" tone="green" symbol="❧"/>
        <Tile label="Cultivar" value={varietyName ?? "Não cadastrada"} hint="Cultivar da parcela ativa" tone="cyan" symbol="✧"/>
        <Tile label="Fase atual" value={phaseLabel} hint={last.dae!=null?`${last.dae} DAE`:undefined} tone="green" symbol="▦"/>
        <Tile label="Prof. radicular efetiva" value={n(last.rootDepth*100,0)+" cm"} hint="Profundidade na CTA" tone="green" symbol="♧"/>
        <Tile label="CTA atual" value={mmOrDash(now.ctaMm)} hint="Água total disponível" tone="blue" symbol="◉"/>
        <Tile label="F médio semanal" value={n(now.f,3)} hint="Mesmo valor durante a semana" tone="cyan" symbol="≋"/>
        <Tile label="Ponto de murcha (PMP)" value={n(now.pmpPercentCc,1)+"% CC"} hint={n(now.pmpAbsoluteMm,1)+" mm retidos no solo"} tone="orange" symbol="◉"/>
        <Tile label="AFD / CRA · lâmina" value={mmOrDash(now.afdMm)} hint={n(now.f*100,1)+"% da CTA"} tone="purple" symbol="◉"/>
        <Tile label="Água disponível (ARM)" value={mmOrDash(now.armMm)} hint={n(reservePct,1)+"% da CTA · "+n(now.ccPercent,1)+"% CC"} tone={now.ccPercent<=now.limitPercentCc?"red":"blue"} symbol="◉"/>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#0c232a] px-3 py-2.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-slate-200">Variáveis exibidas no gráfico</span>
          <button type="button" className="text-[11px] font-semibold text-emerald-300 hover:underline"
            onClick={() => setSeriesVisibility({
              current:true, capacity:true, safety:true, pmp:true,
              chuva:true, irrigacao:true, eto:true,
            })}>Mostrar todas</button>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher as variáveis do gráfico">
          {([
            { key:"current", name:selectedUnit === "mm" ? "ARM" : "Umidade atual", color:"#ced8e2" },
            { key:"capacity", name:selectedUnit === "mm" ? "CAD / CTA" : "Capacidade de campo", color:"#6576ff" },
            { key:"safety", name:"Limite de irrigação", color:"#ff6067" },
            { key:"pmp", name:"PMP", color:"#a2adb8" },
            { key:"chuva", name:"Chuva", color:"#2e91ff" },
            { key:"irrigacao", name:"Irrigação", color:"#1ce0db" },
            { key:"eto", name:"ETo", color:"#ffca42" },
          ] as const).map(variable => (
            <button key={variable.key} type="button" aria-pressed={seriesVisibility[variable.key]}
              onClick={() => setSeriesVisibility(prev => ({ ...prev, [variable.key]: !prev[variable.key] }))}
              className={"inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors " +
                (seriesVisibility[variable.key]
                  ? "border-white/20 bg-white/10 text-white"
                  : "border-white/10 text-slate-500 line-through")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor:variable.color,
                opacity:seriesVisibility[variable.key] ? 1 : .35 }} aria-hidden="true"/>
              {variable.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3" aria-label="Gráfico selecionado do reservatório de água do solo">
        {cards.map(card => {
          if (card.id !== selectedUnit) return null;
          const isExpanded = expanded === card.id;
          const colour = card.id === "mm"
            ? { current:"#ced8e2", capacity:"#fa8568" }
            : { current:"#b77841", capacity:"#6576ff" };
          return (
            <div key={card.id} className={isExpanded
              ? "fixed inset-0 z-[100] flex flex-col overflow-y-auto border border-white/15 bg-[#091920] p-3 shadow-2xl sm:p-5"
              : "rounded-2xl border border-blue-800/35 bg-[#091920] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] sm:p-3"}>
              <div className="flex flex-wrap items-center gap-2 px-2 py-1">
                <span className="text-[20px] font-bold text-cyan-300" aria-hidden="true">{card.symbol}</span>
                <div className="mr-auto min-w-0">
                  <h3 className="text-[17px] font-extrabold text-white">{card.title}</h3>
                  <p className="text-[11px] text-slate-400">{card.description}</p>
                </div>
                <span className="text-[11px] font-medium text-slate-300">
                  {fmtDate(points[0].date) + " – " + fmtDate(now.date)}
                </span>
                <button type="button" onClick={() => setExpanded(isExpanded ? null : card.id)}
                  aria-pressed={isExpanded} aria-label={isExpanded ? "Sair da tela cheia" : "Ampliar "+card.title}
                  className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 hover:bg-white/10">
                  {isExpanded ? "Fechar (Esc)" : "Tela cheia"}
                </button>
              </div>
              {card.series === null ? (
                <div className="my-4 flex min-h-[250px] items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 text-center text-[13px] text-amber-200">
                  Não é possível calcular % em peso: cadastre a densidade de todas as camadas exploradas.
                  Não serão inventados valores de solo.
                </div>
              ) : (
                <RasFullWidthChart points={points} displayed={card.series} unit={card.id}
                  replacementMm={repl.netMm} mode="full"
                  visible={seriesVisibility} expanded={isExpanded}/>
              )}
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 py-2">
                {seriesVisibility.current && <Legend color={colour.current} text={card.id === "mm" ? "Água disponível (ARM)" : "Umidade calculada"}/>}
                {seriesVisibility.capacity && <Legend color={colour.capacity} text={card.id === "mm" ? "CAD / CTA" : "Capacidade de campo"}/>}
                {seriesVisibility.safety && <Legend color="#ff6067" text="Limite de irrigação"/>}
                {seriesVisibility.pmp && <Legend color="#a2adb8" text="PMP"/>}
                {seriesVisibility.irrigacao && <Legend color="#1ce0db" text="Irrigação"/>}
                {seriesVisibility.chuva && <Legend color="#2e91ff" text="Chuva"/>}
                {seriesVisibility.eto && <Legend color="#ffca42" text="ETo"/>}
              </div>
              {card.id === "weight" && (
                <p className="px-2 pb-1 text-[10px] text-slate-400">
                  % em peso é uma equivalência calculada do balanço, não uma leitura de sensor.
                </p>
              )}
              {card.id === "mm" && (
                <p className="px-2 pb-1 text-[10px] text-slate-400">
                  CAD/CTA = armazenamento total disponível à planta; AFD/CRA = parcela facilmente disponível.
                  A linha vermelha marca CAD − AFD, a reserva mínima para irrigar.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className={"rounded-xl border px-3 py-3 " +
        (audit.passed ? "border-emerald-600/30 bg-emerald-900/10" : "border-amber-500/40 bg-amber-900/10")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[12px] font-bold text-slate-100">
              {audit.passed ? "✓ Coerência dos dados conferida" : "⚠ Inconsistências detectadas no gráfico"}
            </div>
            <div className="mt-1 text-[11px] text-slate-300">
              {audit.checkedDays} dia(s) verificados · {audit.issues.length} ocorrência(s) · ARM, CAD, AFD,
              %CC, ETc sem Kl, eventos e datas
            </div>
          </div>
          <button type="button" onClick={() => setShowAudit(v => !v)} aria-expanded={showAudit}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10">
            {showAudit ? "Ocultar auditoria" : "Ver conferência e fórmulas"}
          </button>
        </div>
        {showAudit && (
          <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
            <p className="text-[11px] text-slate-300">
              Validação de coerência interna do cálculo; não substitui medição de umidade,
              conferência agronômica do solo nem verificação dos lançamentos no campo.
              ETc potencial = ETo × Kc; ETc real = ETo × Kc × Ks. Kl não é aplicado.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3 xl:grid-cols-6">
              {([
                ["Data", now.date],
                ["Raiz efetiva", n(now.rootDepth*100,0)+" cm"],
                ["CAD", n(now.ctaMm,2)+" mm"],
                ["ARM", n(now.armMm,2)+" mm"],
                ["AFD", n(now.afdMm,2)+" mm"],
                ["ARM limite", n(now.ctaMm-now.afdMm,2)+" mm"],
                ["PMP", n(now.pmpPercentCc,2)+" %CC"],
                ["Umidade atual", n(now.ccPercent,2)+" %CC"],
                ["ETo", n(now.et0,2)+" mm/dia"],
                ["Kc", n(now.kc,3)],
                ["Ks", last.ks != null ? n(last.ks,3) : "—"],
                ["ETc potencial", last.etcPotential != null ? n(last.etcPotential,2)+" mm/dia" : "—"],
                ["ETc real", n(now.etc,2)+" mm/dia"],
                ["Chuva manual", n(now.rainRecordedMm,2)+" mm"],
                ["Chuva armazenada", n(now.rainEffectiveMm,2)+" mm"],
                ["Irrigação bruta", n(now.irrigationAppliedMm,2)+" mm"],
                ["Irrigação efetiva", n(now.irrigationEffectiveMm,2)+" mm"],
              ] as const).map(([label,value])=>(
                <div key={label} className="rounded-lg border border-white/10 bg-black/10 p-2">
                  <div className="text-slate-400">{label}</div>
                  <div className="mt-1 font-semibold text-slate-100">{value}</div>
                </div>
              ))}
            </div>
            {audit.issues.length > 0 && (
              <div className="rounded-lg border border-amber-500/25 p-2 text-[11px] text-amber-100">
                <div className="font-bold">Inconsistências encontradas</div>
                {audit.issues.slice(0,12).map((issue,index)=>(
                  <p key={index} className="mt-1">
                    {issue.date} · {issue.field}: {issue.detail}
                  </p>
                ))}
                {audit.issues.length > 12 && <p>Mais {audit.issues.length-12} ocorrência(s) não exibidas.</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.2fr_1.25fr_.75fr]">
        <div className="rounded-xl border border-white/[0.09] bg-[#0b1c23] p-3">
          <div className="mb-2 text-[13px] font-bold">Parâmetros da semana <span className="ml-1 font-normal text-slate-400">({fmtDate(weekly.start)} a {fmtDate(weekly.end)})</span></div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MiniMetric symbol="☀" label="ETo média" value={n(weekly.etoMean,2)} hint="mm/dia" tone="orange"/>
            <MiniMetric symbol="❧" label="Kc da cultura" value={n(weekly.currentKc,2)} hint="Fase atual" tone="green"/>
            <MiniMetric symbol="♧" label="ETc média" value={n(weekly.etcMean,2)} hint="mm/dia (real)" tone="cyan"/>
            <MiniMetric symbol="≋" label="F semanal" value={n(now.f,3)} hint={weekly.days+" dia(s) com dados"} tone="blue"/>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.09] bg-[#0b1c23] p-3">
          <div className="mb-2 text-[13px] font-bold">Cálculo da necessidade de reposição</div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MiniMetric symbol="◉" label="ARM atual" value={mmOrDash(now.armMm)} tone="purple"/>
            <MiniMetric symbol="◎" label="Meta: 100% da CC" value={mmOrDash(now.ctaMm)} tone="green"/>
            <MiniMetric symbol="◉" label="Lâmina líquida" value={mmOrDash(repl.netMm)} hint="CTA − ARM" tone="blue"/>
            <MiniMetric symbol="⚙" label="Lâmina bruta" value={mmOrDash(repl.grossMm)} hint={efficiency!=null?`Eficiência ${n(efficiency*100,0)}%`:"Ea não cadastrada"} tone="white"/>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.09] bg-[#0b1c23] p-3">
          <div className="mb-2 text-[13px] font-bold">Resumo da recomendação</div>
          <div className="rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 p-4">
            <div className="text-[12px] text-blue-100">Lâmina bruta para 100% CC</div>
            <div className="mt-1 text-[29px] font-extrabold leading-none">{mmOrDash(repl.grossMm)}</div>
            <div className="mt-4 text-[12px] text-blue-100">Tempo estimado de irrigação</div>
            <div className="mt-1 text-[20px] font-extrabold">{repl.hours==null?"—":n(repl.hours,1)+" horas"}</div>
            <div className="mt-2 text-[10px] text-blue-100">{flowRateM3h!=null?`Vazão: ${n(flowRateM3h,0)} m³/h`:"Vazão não cadastrada"}</div>
          </div>
        </div>
      </div>
      <p className="px-1 text-[10px] leading-relaxed text-slate-400">Todos os gráficos usam o mesmo balanço e as mesmas datas: %CC (PMP acima de zero), ARM em mm (PMP = zero) e % em peso (convertido com densidade por camada). AFD/CRA = CTA × F semanal; retorno a 100% CC = CTA − ARM. Chuva somente de lançamentos manuais por pivô; ETo conforme fonte aprovada.</p>
    </section>
  );
}
