"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import { buildRasPoint, currentWeekStats, rasWaterReplenishment, type RasPoint } from "@/modules/water-balance/services/ras-panel-model";
import { rasDisplaySeries, RAS_UNITS, type RasDisplayUnit, type RasDisplayPoint } from "@/modules/water-balance/services/ras-display-modes";
import type { SoilProfileLayer } from "@/modules/soil/services/soil-profile";

type ZoomMode = "full" | "arm" | "lamina";
type RASObservationsVisibility = { chuva: boolean; irrigacao: boolean; eto: boolean };
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
    <div className="flex min-h-[113px] min-w-0 items-center gap-3 rounded-xl border border-white/[0.09] bg-[#0b1c23] px-3 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-[21px] font-bold" style={{ color: colours[tone] }} aria-hidden="true">{symbol}</div>
      <div className="min-w-0">
        <div className="break-words text-[12px] font-medium leading-snug text-slate-300">{label}</div>
        <div title={value} className="mt-1 max-w-full truncate text-[clamp(16px,1.5vw,25px)] font-extrabold leading-tight tracking-normal tabular-nums" style={{ color: colours[tone] }}>{value}</div>
        {hint && <div className="mt-1.5 break-words text-[11px] leading-snug text-slate-400">{hint}</div>}
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
        <div title={value} className="mt-1 max-w-full truncate text-[clamp(16px,1.25vw,20px)] font-extrabold leading-tight tabular-nums text-white">{value}</div>
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
  const [size, setSize] = useState({ width: 1200, height: 700 });
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
  const W = Math.max(900, size.width), H = Math.max(560, size.height);
  const l = 66, r = 142, t = 30, b = 190;
  const width = W - l - r, height = H - t - b;
  const newest = points[points.length - 1];
  const latest = displayed[displayed.length - 1];
  if (!newest || !latest || points.length !== displayed.length) return null;
  // Escala por unidade, limites variáveis a cada dia (não usa CAD final para todo o ciclo).
  const maxCapacity = Math.max(1, ...displayed.map(p => p.capacity));
  const fullMax = unit === "cc" ? 105 : maxCapacity * 1.08;
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
  const hasReplacement = replacementMm > 0.05;

  // A banda inferior utiliza escala INDEPENDENTE em mm/dia. Não mistura
  // eventos de entrada/ETo com o eixo da umidade em % da capacidade de campo.
  // Irrigação é a lâmina bruta REAL lançada; chuva é a chuva efetiva usada no
  // balanço. Valores originais da chuva manual ficam acessíveis nos detalhes.
  const eventsTop = t + height + 46;
  const eventsHeight = 85;
  const eventsBottom = eventsTop + eventsHeight;
  const eventMaxRaw = Math.max(1, ...points.map(p => Math.max(
    visible.chuva ? p.rainEffectiveMm : 0,
    visible.irrigacao ? p.irrigationAppliedMm : 0,
    visible.eto ? p.et0 : 0,
  )));
  const eventMax = Math.max(2, Math.ceil(eventMaxRaw / 2) * 2);
  const eventY = (mm: number) => eventsBottom - clamp(mm, 0, eventMax) / eventMax * eventsHeight;
  const eventBarWidth = Math.max(4, Math.min(11, width / Math.max(points.length, 1) / 5));
  const labelStride = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(width / 64))));
  const etoPoints = points.filter(p => Number.isFinite(p.et0));
  const etoPath = etoPoints.map(p => {
    const index = points.findIndex(r => r.date === p.date);
    return `${x(index).toFixed(2)},${eventY(p.et0).toFixed(2)}`;
  }).join(" ");
  return (
    <div ref={containerRef} className={`w-full overflow-x-auto ${expanded ? "h-[calc(100dvh-170px)] min-h-[420px] max-h-none" : "h-[74vh] min-h-[580px] max-h-[900px]"}`}>
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
            <text x={l-12} y={y(q)+5} fill="#d7e4eb" textAnchor="end" fontSize={12}>{n(q,unit==="weight"?2:1)}</text>
          </g>
        ))}
        <text x={3} y={t+8} fill="#d8e6ed" fontSize={13}>{RAS_UNITS[unit].axis}</text>
        <g clipPath="url(#rasFullClip)">
          {segments("capacity","safety","rgba(12,113,81,.35)")}
          {segments("safety","pmp","rgba(182,48,54,.25)")}
          {displayed.slice(0,-1).map((p,i) => <path key={i} d={`M ${x(i)} ${y(p.pmp)} L ${x(i+1)} ${y(displayed[i+1].pmp)} L ${x(i+1)} ${y(0)} L ${x(i)} ${y(0)} Z`} fill="rgba(113,29,31,.14)"/>)}
          <polyline points={line("safety")} stroke="#ff5a60" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>
          <polyline points={line("pmp")} stroke="#ff9f23" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>
          <polyline points={line("capacity")} stroke="#1ce277" fill="none" strokeWidth={2.6} strokeDasharray="10 7"/>
          <polyline points={line("current")} stroke="#ba4bff" fill="none" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round"/>
          {displayed.map((p,i)=><circle key={p.date} cx={x(i)} cy={y(p.current)} r={Math.max(2.4, Math.min(5.3, width / displayed.length / 7))} stroke="#eacbff" strokeWidth={1.2} fill="#b449ff">
            <title>{p.date}: atual {n(p.current,unit==="weight"?2:1)} {RAS_UNITS[unit].axis}; CC {n(p.capacity,1)}, limite {n(p.safety,1)}, PMP {n(p.pmp,1)}; ARM {n(points[i].armMm,1)} mm, CAD {n(points[i].ctaMm,1)} mm.</title>
          </circle>)}
        </g>
        {hasReplacement && (
          <g>
            <line x1={lastX+18} y1={lastY} x2={lastX+18} y2={y(latest.capacity)+5} stroke="#24baff" strokeWidth={5} strokeLinecap="round"/>
            <polygon points={`${lastX+18},${y(latest.capacity)-5} ${lastX+10},${y(latest.capacity)+10} ${lastX+26},${y(latest.capacity)+10}`} fill="#24baff"/>
            <rect x={lastX-125} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))} width={118} height={51} rx={7} fill="#1068db" stroke="#3baaff"/>
            <text x={lastX-66} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))+20} textAnchor="middle" fontSize={15} fill="white" fontWeight="bold">Repor {n(replacementMm,1)} mm</text>
            <text x={lastX-66} y={y(Math.min(yMax-0.5,Math.max(latest.current+(yMax-yMin)*.12,yMin+(yMax-yMin)*.72)))+39} textAnchor="middle" fontSize={12} fill="white">até CC do dia</text>
          </g>
        )}
        {/* Eventos registrados: mesma data e eixo X do reservatório, escala mm/dia separada. */}
        <text x={l} y={eventsTop-21} fill="#d1e1e8" fontSize={14} fontWeight={700}>
          Chuva efetiva, irrigação realizada e ETo diária
        </text>
        <text x={l+width+12} y={eventsTop-21} fill="#b7cbd5" fontSize={12}>mm/dia</text>
        {[0, eventMax / 2, eventMax].map((tick, i)=>(
          <g key={i}>
            <line x1={l} x2={l+width} y1={eventY(tick)} y2={eventY(tick)}
              stroke="#ffffff" strokeOpacity={tick===0?.20:.07} />
            <text x={l+width+12} y={eventY(tick)+5} fill="#b9cdd7" fontSize={11}>{n(tick,1)}</text>
          </g>
        ))}
        <g>
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
                  rx={2} fill="#17d780" opacity={.94}>
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
          <text key={p.date} x={x(i)} y={H-13} fill="#d1dae2" textAnchor="middle" fontSize={12}>{fmtDate(p.date)}</text>:null)}
        <text x={l+width+12} y={t+9} fill="#dce8ef" fontSize={11}>ARM atual</text>
        <text x={l+width+12} y={t+25} fill="#dce8ef" fontSize={12}>{n(newest.armMm,1)} mm</text>
        <text x={l+width+12} y={t+41} fill="#dce8ef" fontSize={11}>CAD atual</text>
        <text x={l+width+12} y={t+57} fill="#dce8ef" fontSize={12}>{n(newest.ctaMm,1)} mm</text>
        <text x={l+7} y={y(latest.capacity)-10} fontSize={13} fill="#36e98a" fontWeight="bold">Capacidade de campo</text>
        <text x={l+7} y={y(latest.safety)-10} fontSize={12} fill="#ff656c" fontWeight="bold">Limite de irrigação</text>
        <text x={l+7} y={y(latest.pmp)-10} fontSize={12} fill="#ffae37" fontWeight="bold">PMP</text>
      </svg>
      <p className="mt-1 px-1 text-[10px] text-slate-400">As séries CC, limite, PMP e umidade atual usam os valores e a zona radicular de cada dia; o ARM à direita mostra apenas o dia atual. Na banda inferior, as barras azuis representam a chuva efetiva da chuva registrada, as verdes representam a irrigação bruta realizada e a linha amarela mostra a ETo diária em mm/dia; somente dados observados são utilizados.</p>
    </div>
  );
}

export function SoilReservoirReferencePanel({ rows, cultureName, varietyName, stage, areaHa, flowRateM3h, efficiencyPercent }: {
  rows: DailyBalanceRow[];
  cultureName: string | null;
  varietyName: string | null;
  stage: string | null;
  areaHa: number | null;
  flowRateM3h: number | null;
  efficiencyPercent: number | null;
}) {
  const [zoom, setZoom] = useState<ZoomMode>("full");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);
  const [eventVisibility, setEventVisibility] = useState<RASObservationsVisibility>({
    chuva: true, irrigacao: true, eto: true,
  });
  const points = useMemo(() => rows.map(buildRasPoint).filter((p): p is RasPoint => p != null), [rows]);
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
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.13] bg-[#081b21] p-1">
          {([
            ["full", "Escala completa"], ["arm", "Zoom ARM"], ["lamina", "Zoom lâmina"],
          ] as const).map(([id,label])=>(
            <button key={id} type="button" onClick={()=>setZoom(id)} aria-pressed={zoom===id}
              className={`rounded-md px-3 py-2 text-[11px] font-semibold transition-colors ${zoom===id?"bg-emerald-500 text-[#072119]":"text-slate-200 hover:bg-white/[0.08]"}`}>{label}</button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/lancamentos/chuvas" className="rounded-lg border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-[12px] font-semibold text-blue-100 hover:bg-blue-500/20">Lançar chuva manual</Link>
        <Link href="/lancamentos/irrigacao" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/20">Lançar irrigação realizada</Link>
        <span className="text-[11px] text-slate-400">Ao retornar ao balanço, o RAS será recalculado com os novos lançamentos.</span>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 min-[2000px]:grid-cols-9">
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

      <div className={expanded
        ? "fixed inset-0 z-[100] flex min-h-0 flex-col overflow-hidden rounded-none border border-white/[0.09] bg-[#091920] p-3 shadow-2xl sm:p-5"
        : "rounded-xl border border-white/[0.09] bg-[#091920] p-2 sm:p-3"}>
        <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
          <div className="mr-auto text-[14px] font-bold text-white">Evolução da água no solo</div>
          <button type="button" onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? "Sair da tela cheia" : "Ampliar o gráfico para toda a tela"}
            aria-pressed={expanded}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-100 hover:bg-emerald-500/20">{expanded ? "Sair da tela cheia (Esc)" : "Tela cheia"}</button>
          <Legend color="#ba4bff" text="Umidade do solo (%CC)"/>
          <Legend color="#1ce277" text="Capacidade de campo (100% CC)" dashed/>
          <Legend color="#ff6067" text="Limite de irrigação (F semanal)" dashed/>
          <Legend color="#ff9f23" text="Ponto de murcha (PMP)" dashed/>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-1 pt-2">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entradas e clima</span>
          {([
            { key: "chuva", label: "Chuva efetiva", colour: "#2e91ff" },
            { key: "irrigacao", label: "Irrigação realizada", colour: "#17d780" },
            { key: "eto", label: "ETo diária", colour: "#ffca42" },
          ] as const).map((item) => (
            <button key={item.key} type="button" aria-pressed={eventVisibility[item.key]}
              onClick={() => setEventVisibility(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                eventVisibility[item.key]
                  ? "border-white/[0.17] bg-white/[0.08] text-white"
                  : "border-white/[0.08] bg-transparent text-slate-500 line-through"
              }`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.colour, opacity: eventVisibility[item.key] ? 1 : .35 }}/>
              {item.label}
            </button>
          ))}
          <span className="text-[10px] text-slate-400">Valores em mm/dia · passe o cursor sobre cada registro</span>
        </div>
        <RasFullWidthChart points={points} replacementMm={repl.netMm} mode={zoom} visible={eventVisibility} expanded={expanded}/>
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
      <p className="px-1 text-[10px] leading-relaxed text-slate-400">Escala principal: % da capacidade de campo (CC). PMP = θPMP/θCC × 100; não é 0% da CC. Em % da água disponível (CTA), o PMP corresponde a 0%. AFD/CRA = CTA × F médio semanal; retorno a 100% CC = CTA − ARM. Os valores vêm do balanço hídrico do pivô e não dos números ilustrativos da imagem.</p>
    </section>
  );
}
