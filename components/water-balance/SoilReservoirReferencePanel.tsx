"use client";

import { useMemo, useState } from "react";
import type { DailyBalanceRow } from "@/modules/water-balance/services/water-balance.service";
import { buildRasPoint, currentWeekStats, rasWaterReplenishment, type RasPoint } from "@/modules/water-balance/services/ras-panel-model";

type ZoomMode = "full" | "arm" | "lamina";
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
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-[23px] font-bold" style={{ color: colours[tone] }} aria-hidden="true">{symbol}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium leading-snug text-slate-300">{label}</div>
        <div className="mt-1 whitespace-nowrap text-[23px] font-extrabold leading-none tracking-tight tabular-nums sm:text-[25px]" style={{ color: colours[tone] }}>{value}</div>
        {hint && <div className="mt-1.5 text-[10px] leading-snug text-slate-400">{hint}</div>}
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
        <div className="mt-1 text-[18px] font-extrabold leading-none tabular-nums text-white">{value}</div>
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

function RasFullWidthChart({ points, replacementMm, mode }: { points: RasPoint[]; replacementMm: number; mode: ZoomMode }) {
  const W = 1560, H = 410, l = 57, r = 138, t = 22, b = 43;
  const width = W - l - r, height = H - t - b;
  const newest = points[points.length - 1];
  if (!newest || points.length === 0) return null;
  const values = points.flatMap((p) => [p.ccPercent, p.limitPercentCc, p.pmpPercentCc]);
  let yMin = 0, yMax = 105;
  if (mode === "arm") {
    yMin = clamp(Math.floor(Math.min(...values) - 12), 0, 85);
    yMax = clamp(Math.ceil(Math.max(...values) + 8), yMin + 15, 105);
  }
  if (mode === "lamina") {
    // Destaque da reposição no eixo em %CC, sem alterar as unidades físicas.
    yMin = clamp(Math.floor(Math.min(newest.ccPercent, newest.limitPercentCc, newest.pmpPercentCc) - 12), 0, 80);
    yMax = 105;
  }
  const x = (i: number) => l + (points.length === 1 ? width / 2 : i / (points.length - 1) * width);
  const y = (v: number) => t + (yMax - v) / (yMax - yMin) * height;
  const line = (key: "ccPercent" | "limitPercentCc" | "pmpPercentCc") =>
    points.map((p, i) => `${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(" ");
  const segments = (upper: "ccPercent" | "limitPercentCc" | "pmpPercentCc", lower: "ccPercent" | "limitPercentCc" | "pmpPercentCc", fill: string) =>
    points.slice(0, -1).map((p, i) => {
      const q = points[i + 1];
      const d = `M ${x(i)},${y(p[upper])} L ${x(i + 1)},${y(q[upper])} L ${x(i + 1)},${y(q[lower])} L ${x(i)},${y(p[lower])} Z`;
      return <path key={`${upper}-${lower}-${i}`} d={d} fill={fill} />;
    });
  const thetaPmp = newest.pmpPercentCc;
  const mmAt = (pct: number) => (pct - thetaPmp) / (100 - thetaPmp) * newest.ctaMm;
  const lastX = x(points.length - 1);
  const lastY = y(newest.ccPercent);
  const hasReplacement = replacementMm > 0.05;
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label="Evolução da umidade em porcentagem da capacidade de campo, com linhas de PMP e limite de irrigação"
        className="h-[390px] min-w-[900px] w-full lg:h-[440px]" preserveAspectRatio="none">
        <defs>
          <clipPath id="rasFullClip"><rect x={l} y={t} width={width} height={height} /></clipPath>
          <linearGradient id="rasFullArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#15aa75" stopOpacity=".28" />
            <stop offset="100%" stopColor="#b81e43" stopOpacity=".24" />
          </linearGradient>
        </defs>
        {[0,25,50,75,100].filter((q)=>q>=yMin&&q<=yMax).map((q) => (
          <g key={q}>
            <line x1={l} x2={l+width} y1={y(q)} y2={y(q)} stroke="#ffffff" strokeOpacity=".10" strokeWidth={1}/>
            <text x={l-12} y={y(q)+5} fill="#d7e4eb" textAnchor="end" fontSize={14}>{q}</text>
          </g>
        ))}
        <text x={3} y={t+8} fill="#d8e6ed" fontSize={13}>% da CC</text>
        <g clipPath="url(#rasFullClip)">
          {segments("ccPercent","limitPercentCc","rgba(12,113,81,.35)")}
          {segments("limitPercentCc","pmpPercentCc","rgba(182,48,54,.25)")}
          {points.slice(0,-1).map((p,i) => <path key={i} d={`M ${x(i)} ${y(p.pmpPercentCc)} L ${x(i+1)} ${y(points[i+1].pmpPercentCc)} L ${x(i+1)} ${y(0)} L ${x(i)} ${y(0)} Z`} fill="rgba(113,29,31,.25)"/>)}
          <polyline points={line("limitPercentCc")} stroke="#ff5a60" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>
          <polyline points={line("pmpPercentCc")} stroke="#ff9f23" fill="none" strokeDasharray="10 7" strokeWidth={2.8}/>
          <line x1={l} x2={l+width} y1={y(100)} y2={y(100)} stroke="#1ce277" strokeWidth={2.6} strokeDasharray="10 7"/>
          <polyline points={line("ccPercent")} stroke="#ba4bff" fill="none" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round"/>
          {points.map((p,i)=><circle key={p.date} cx={x(i)} cy={y(p.ccPercent)} r={5.3} stroke="#eacbff" strokeWidth={1.7} fill="#b449ff"/>)}
        </g>
        {hasReplacement && (
          <g>
            <line x1={lastX+18} y1={lastY} x2={lastX+18} y2={y(100)+5} stroke="#24baff" strokeWidth={5} strokeLinecap="round"/>
            <polygon points={`${lastX+18},${y(100)-5} ${lastX+10},${y(100)+10} ${lastX+26},${y(100)+10}`} fill="#24baff"/>
            <rect x={lastX-125} y={y(Math.min(95,Math.max(newest.ccPercent+15,75)))} width={118} height={51} rx={7} fill="#1068db" stroke="#3baaff"/>
            <text x={lastX-66} y={y(Math.min(95,Math.max(newest.ccPercent+15,75)))+20} textAnchor="middle" fontSize={15} fill="white" fontWeight="bold">Repor {n(replacementMm,1)} mm</text>
            <text x={lastX-66} y={y(Math.min(95,Math.max(newest.ccPercent+15,75)))+39} textAnchor="middle" fontSize={12} fill="white">100% da CC</text>
          </g>
        )}
        {points.map((p,i)=>(points.length<=20||i%2===0)?
          <text key={p.date} x={x(i)} y={H-15} fill="#d1dae2" textAnchor="middle" fontSize={12}>{fmtDate(p.date)}</text>:null)}
        {[0,25,50,75,100].filter((q)=>q>=yMin&&q<=yMax).map((q)=>{
          const mm=mmAt(q);
          return <text key={q} x={l+width+12} y={y(q)+4} fill="#b8c7d1" fontSize={11}>{q>=thetaPmp-0.1 && mm>=0 ? n(mm,1)+" mm" : "—"}</text>;
        })}
        <text x={l+width+12} y={t-9} fontSize={12} fill="#dce8ef">ARM atual¹</text>
        <text x={l+7} y={y(100)-10} fontSize={14} fill="#36e98a" fontWeight="bold">Capacidade de campo · 100% CC</text>
        <text x={l+7} y={y(newest.limitPercentCc)-10} fontSize={13} fill="#ff656c" fontWeight="bold">Limite de irrigação · {n(newest.limitPercentCc,1)}% CC</text>
        <text x={l+7} y={y(newest.pmpPercentCc)-10} fontSize={13} fill="#ffae37" fontWeight="bold">Ponto de murcha · {n(newest.pmpPercentCc,1)}% CC</text>
      </svg>
      <p className="mt-1 px-1 text-[10px] text-slate-400">¹ O eixo direito é a equivalência em mm do perfil atual; as profundidades radiculares e a CTA podem variar entre os dias históricos.</p>
    </div>
  );
}

export function SoilReservoirReferencePanel({ rows, cultureName, stage, areaHa, flowRateM3h, efficiencyPercent }: {
  rows: DailyBalanceRow[];
  cultureName: string | null;
  stage: string | null;
  areaHa: number | null;
  flowRateM3h: number | null;
  efficiencyPercent: number | null;
}) {
  const [zoom, setZoom] = useState<ZoomMode>("full");
  const points = useMemo(() => rows.slice(-16).map(buildRasPoint).filter((p): p is RasPoint => p != null), [rows]);
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

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-8">
        <Tile label="Cultura" value={cultureName ?? "—"} hint="Parcela em manejo" tone="green" symbol="❧"/>
        <Tile label="Fase atual" value={phaseLabel} hint={last.dae!=null?`${last.dae} DAE`:undefined} tone="green" symbol="▦"/>
        <Tile label="Prof. radicular efetiva" value={n(last.rootDepth*100,0)+" cm"} hint="Profundidade na CTA" tone="green" symbol="♧"/>
        <Tile label="CTA atual" value={mmOrDash(now.ctaMm)} hint="Água total disponível" tone="blue" symbol="◉"/>
        <Tile label="F médio semanal" value={n(now.f,3)} hint="Mesmo valor durante a semana" tone="cyan" symbol="≋"/>
        <Tile label="Ponto de murcha (PMP)" value={n(now.pmpPercentCc,1)+"% CC"} hint={n(now.pmpAbsoluteMm,1)+" mm retidos no solo"} tone="orange" symbol="◉"/>
        <Tile label="AFD / CRA · lâmina" value={mmOrDash(now.afdMm)} hint={n(now.f*100,1)+"% da CTA"} tone="purple" symbol="◉"/>
        <Tile label="Água disponível (ARM)" value={mmOrDash(now.armMm)} hint={n(reservePct,1)+"% da CTA · "+n(now.ccPercent,1)+"% CC"} tone={now.ccPercent<=now.limitPercentCc?"red":"blue"} symbol="◉"/>
      </div>

      <div className="rounded-xl border border-white/[0.09] bg-[#091920] p-2 sm:p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3 px-1">
          <div className="mr-auto text-[14px] font-bold text-white">Evolução da água no solo</div>
          <Legend color="#ba4bff" text="Umidade do solo (%CC)"/>
          <Legend color="#1ce277" text="Capacidade de campo (100% CC)" dashed/>
          <Legend color="#ff6067" text="Limite de irrigação (F semanal)" dashed/>
          <Legend color="#ff9f23" text="Ponto de murcha (PMP)" dashed/>
        </div>
        <RasFullWidthChart points={points} replacementMm={repl.netMm} mode={zoom}/>
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
