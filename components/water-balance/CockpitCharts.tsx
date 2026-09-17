"use client";

/**
 * Gráficos dedicados do cockpit de Balanço Hídrico.
 *
 * Regras visuais:
 * - Entradas/consumo: chuva efetiva + irrigação em barras; ETc e ETo em mm;
 *   Kc em eixo secundário adimensional.
 * - Reservatório: ARM em mm absolutos, referências do solo e curva de umidade
 *   do solo em % da CC no eixo secundário.
 * - Previsão é sempre tracejada; observado é sempre sólido.
 */

export interface EntradaConsumoPoint {
  label: string;
  chuvaEf: number;
  irrig: number;
  etc: number | null;
  eto?: number | null;
  kc?: number | null;
  phase?: string | null;
  isForecast: boolean;
}

export interface ReservatorioPoint {
  label: string;
  /** Água total no perfil explorado em mm absolutos (PMP + ARM). */
  storageAbs: number | null;
  /** Umidade volumétrica relativa à CC, em %. */
  moisturePctCc?: number | null;
  /** Referências por data; permitem acompanhar crescimento radicular. */
  ccAbs?: number | null;
  safetyAbs?: number | null;
  pmpAbs?: number | null;
  attentionAbs?: number | null;
  isForecast: boolean;
}

const NUM = (v: number) => (Number.isFinite(v) ? v : 0);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

// ── Séries editáveis (add/remover variáveis, estilo Scheduling) ──────────────

export type EntradaSeriesKey = "chuva" | "irrig" | "etc" | "eto" | "kc" | "fase";
export type ReservSeriesKey =
  | "arm"
  | "umidade"
  | "cc"
  | "seguranca"
  | "pmp"
  | "zonas";

export interface SeriesDef<K extends string> {
  k: K;
  label: string;
  color: string;
}

export const ENTRADAS_SERIES: SeriesDef<EntradaSeriesKey>[] = [
  { k: "chuva", label: "Chuva efetiva", color: "#2f6bff" },
  { k: "irrig", label: "Irrigação efetiva", color: "#16a34a" },
  { k: "etc", label: "ETc", color: "#64748b" },
  { k: "eto", label: "ETo", color: "#f59e0b" },
  { k: "kc", label: "Kc", color: "#22c55e" },
  { k: "fase", label: "Faixa fenológica", color: "#365314" },
];

export const RESERVATORIO_SERIES: SeriesDef<ReservSeriesKey>[] = [
  { k: "arm", label: "ARM — Água armazenada", color: "#3b82f6" },
  { k: "umidade", label: "Umidade do solo (curva de secagem, %CC)", color: "#7c3aed" },
  { k: "cc", label: "DTA / CC operacional", color: "#16a34a" },
  { k: "seguranca", label: "Segurança (DTA − CRA)", color: "#eab308" },
  { k: "pmp", label: "PMP", color: "#dc2626" },
  { k: "zonas", label: "Faixas de zona (ótima/alerta/déficit)", color: "#94a3b8" },
];

export const defaultEntradasVisible: Record<EntradaSeriesKey, boolean> = {
  chuva: true,
  irrig: true,
  etc: true,
  eto: true,
  kc: true,
  fase: true,
};

export const defaultReservatorioVisible: Record<ReservSeriesKey, boolean> = {
  arm: true,
  umidade: true,
  cc: true,
  seguranca: true,
  pmp: true,
  zonas: true,
};

/**
 * Chips clicáveis para incluir/remover variáveis do gráfico — mesma lógica de
 * seleção do Scheduling, porém sempre visível (sem popover) e reaproveitável
 * pelos dois gráficos do cockpit.
 */
export function CockpitSeriesToggles<K extends string>({
  series,
  visible,
  onToggle,
}: {
  series: SeriesDef<K>[];
  visible: Record<K, boolean>;
  onToggle: (k: K) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {series.map((s) => {
        const on = visible[s.k];
        return (
          <button
            key={s.k}
            type="button"
            onClick={() => onToggle(s.k)}
            aria-pressed={on}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              on
                ? "border-transparent text-graphite-700 dark:text-gray-200"
                : "border-gray-200 text-graphite-400 line-through opacity-60 hover:opacity-90 dark:border-white/10 dark:text-gray-500"
            }`}
            style={on ? { background: `${s.color}1f` } : undefined}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{
                background: on ? s.color : "transparent",
                boxShadow: on ? undefined : `inset 0 0 0 1.5px ${s.color}`,
              }}
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function splitSeries(
  points: EntradaConsumoPoint[],
  value: (p: EntradaConsumoPoint) => number | null | undefined,
  x: (i: number) => number,
  y: (v: number) => number,
) {
  const real: string[] = [];
  const fore: string[] = [];
  points.forEach((p, i) => {
    const v = value(p);
    if (v == null || !Number.isFinite(v)) return;
    const pt = `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    if (p.isForecast) fore.push(pt);
    else real.push(pt);
  });
  if (real.length > 0 && fore.length > 0) fore.unshift(real[real.length - 1]);
  return { real, fore };
}

// ── Entradas e Consumo ──────────────────────────────────────────────────────

export function EntradasConsumoChart({
  points,
  todayIndex,
  visible = defaultEntradasVisible,
}: {
  points: EntradaConsumoPoint[];
  todayIndex: number;
  visible?: Record<EntradaSeriesKey, boolean>;
}) {
  const W = 1000;
  const H = 300;
  const padL = 38;
  const padR = 42;
  const padT = 18;
  const padB = 48;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (points.length === 0) return <EmptyChart label="Sem dados no período." height={H} />;

  const maxInput = Math.max(...points.map((p) => NUM(p.chuvaEf) + NUM(p.irrig)), 0);
  const maxDemand = Math.max(
    ...points.map((p) => Math.max(NUM(p.etc ?? 0), NUM(p.eto ?? 0))),
    0,
  );
  const yMax = Math.max(10, Math.ceil(Math.max(maxInput, maxDemand) / 5) * 5);
  const kcMax = 1.5;

  const n = points.length;
  const band = plotW / n;
  const barW = Math.min(band * 0.46, 18);
  const x = (i: number) => padL + band * i + band / 2;
  const yMm = (v: number) => padT + plotH - (NUM(v) / yMax) * plotH;
  const yKc = (v: number) => padT + plotH - (clamp(v, 0, kcMax) / kcMax) * plotH;

  const step = yMax / 5;
  const yTicks = Array.from({ length: 6 }, (_, i) => Math.round(i * step * 10) / 10);
  const kcTicks = [0, 0.5, 1, 1.5];
  const forecastStart = todayIndex >= 0 && todayIndex < n ? x(todayIndex) : null;

  const etc = splitSeries(points, (p) => p.etc, x, yMm);
  const eto = splitSeries(points, (p) => p.eto, x, yMm);
  const kc = splitSeries(points, (p) => p.kc, x, yKc);
  const phaseRuns: Array<{ phase: string; start: number; end: number }> = [];
  points.forEach((p, i) => {
    const phase = p.phase?.trim();
    if (!phase) return;
    const lastRun = phaseRuns[phaseRuns.length - 1];
    if (lastRun && lastRun.phase === phase && lastRun.end === i - 1) lastRun.end = i;
    else phaseRuns.push({ phase, start: i, end: i });
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Entradas, demanda e Kc">
      {forecastStart != null && (
        <rect x={forecastStart} y={padT} width={W - padR - forecastStart} height={plotH} fill="currentColor" className="text-brand-500/[0.06] dark:text-white/[0.04]" />
      )}

      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yMm(t)} y2={yMm(t)} stroke="currentColor" strokeWidth={1} className="text-gray-200/70 dark:text-white/[0.06]" />
          <text x={padL - 7} y={yMm(t) + 3} textAnchor="end" className="fill-graphite-400 dark:fill-gray-500" fontSize={10}>{t}</text>
        </g>
      ))}
      <text x={4} y={padT + 4} className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>mm</text>

      {visible.kc && (
        <>
          {kcTicks.map((t) => (
            <text key={`kc-${t}`} x={W - padR + 7} y={yKc(t) + 3} className="fill-green-600 dark:fill-green-400" fontSize={9}>{t.toFixed(1)}</text>
          ))}
          <text x={W - 24} y={padT - 5} className="fill-green-600 dark:fill-green-400" fontSize={9} fontWeight={700}>Kc</text>
        </>
      )}

      {/* entradas */}
      {points.map((p, i) => {
        const cx = x(i);
        const chuva = NUM(p.chuvaEf);
        const irr = NUM(p.irrig);
        const yChuvaTop = yMm(chuva);
        const chuvaH = padT + plotH - yChuvaTop;
        const yIrrTop = yMm(chuva + irr);
        const irrH = yChuvaTop - yIrrTop;
        const opacity = p.isForecast ? 0.45 : 1;
        return (
          <g key={i} opacity={opacity}>
            {visible.chuva && chuva > 0 && <rect x={cx - barW / 2} y={yChuvaTop} width={barW} height={Math.max(chuvaH, 0)} rx={2} fill="#2f6bff" />}
            {visible.irrig && irr > 0 && <rect x={cx - barW / 2} y={yIrrTop} width={barW} height={Math.max(irrH, 0)} rx={2} fill="#16a34a" />}
          </g>
        );
      })}

      {/* ETc */}
      {visible.etc && etc.real.length > 1 && <polyline points={etc.real.join(" ")} fill="none" stroke="#64748b" strokeWidth={2.2} />}
      {visible.etc && etc.fore.length > 1 && <polyline points={etc.fore.join(" ")} fill="none" stroke="#94a3b8" strokeWidth={2.1} strokeDasharray="5 4" />}

      {/* ETo */}
      {visible.eto && eto.real.length > 1 && <polyline points={eto.real.join(" ")} fill="none" stroke="#f59e0b" strokeWidth={2} />}
      {visible.eto && eto.fore.length > 1 && <polyline points={eto.fore.join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.9} strokeDasharray="5 4" opacity={0.8} />}

      {/* Kc */}
      {visible.kc && kc.real.length > 1 && <polyline points={kc.real.join(" ")} fill="none" stroke="#22c55e" strokeWidth={2.2} />}
      {visible.kc && kc.fore.length > 1 && <polyline points={kc.fore.join(" ")} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />}

      {forecastStart != null && (
        <>
          <line x1={forecastStart} x2={forecastStart} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={forecastStart} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}

      {points.map((p, i) => (n <= 16 || i % 2 === 0) ? (
        <text key={`x${i}`} x={x(i)} y={H - 27} textAnchor="middle" className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>{p.label}</text>
      ) : null)}

      {/* Faixa fenológica — usa exatamente a fase calculada pelo motor. */}
      {visible.fase && phaseRuns.map((run, i) => {
        const x1 = padL + band * run.start;
        const width = band * (run.end - run.start + 1);
        const fills = ["#14532d", "#166534", "#365314", "#713f12", "#7c2d12"];
        return (
          <g key={`${run.phase}-${run.start}`}>
            <rect x={x1} y={H - 18} width={width} height={12} rx={2} fill={fills[i % fills.length]} opacity={0.72} />
            {width > 70 && <text x={x1 + width / 2} y={H - 9} textAnchor="middle" fill="#e5e7eb" fontSize={8.2} fontWeight={700}>{run.phase}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── Reservatório de Água do Solo ────────────────────────────────────────────

export function ReservatorioChart({
  points,
  todayIndex,
  crossIndex,
  ccMm,
  pmpMm,
  safetyMm,
  attentionMm,
  visible = defaultReservatorioVisible,
  unit = "pct",
}: {
  points: ReservatorioPoint[];
  todayIndex: number;
  crossIndex: number;
  ccMm: number;
  pmpMm: number;
  safetyMm: number;
  attentionMm: number;
  visible?: Record<ReservSeriesKey, boolean>;
  /** "pct" = eixo em % da água disponível (PMP=0, CC=100, estilo Scheduling);
   *  "mm" = ARM em mm absolutos com umidade θ/θCC no eixo secundário. */
  unit?: "pct" | "mm";
}) {
  const W = 1000;
  const H = 320;
  const padL = 38;
  const padR = 112;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (points.length === 0 || ccMm <= 0) return <EmptyChart label="Sem dados no período." height={H} />;

  const pct = unit === "pct";
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));

  // Água disponível como % da CAD por data: PMP = 0 %, CC = 100 % (estilo Valley
  // Scheduling). Cada valor sai de (ARM − PMP) / (CC − PMP) do próprio dia,
  // acompanhando o crescimento radicular.
  const cadOf = (p: ReservatorioPoint) =>
    p.ccAbs != null && p.pmpAbs != null ? p.ccAbs - p.pmpAbs : null;
  const availOf = (p: ReservatorioPoint) => {
    const cad = cadOf(p);
    if (cad == null || cad <= 0 || p.storageAbs == null) return null;
    return ((p.storageAbs - (p.pmpAbs ?? 0)) / cad) * 100;
  };
  const segAvailOf = (p: ReservatorioPoint) => {
    const cad = cadOf(p);
    if (cad == null || cad <= 0 || p.safetyAbs == null) return null;
    return ((p.safetyAbs - (p.pmpAbs ?? 0)) / cad) * 100;
  };

  // Referências "de hoje" nas duas escalas.
  const cadMm = Math.max(ccMm - pmpMm, 0);
  const ccRef = pct ? 100 : ccMm;
  const pmpRef = pct ? 0 : pmpMm;
  const segRef = pct ? (cadMm > 0 ? ((safetyMm - pmpMm) / cadMm) * 100 : 0) : safetyMm;
  const attnRef = pct ? (cadMm > 0 ? ((attentionMm - pmpMm) / cadMm) * 100 : 0) : attentionMm;

  const maxPoint = Math.max(
    ccMm,
    ...points.flatMap((p) => [p.storageAbs ?? 0, p.ccAbs ?? 0, p.safetyAbs ?? 0]),
  );
  const yTop = pct ? 110 : Math.max(10, Math.ceil(maxPoint / 10) * 10);
  const y = (v: number) => padT + plotH - (clamp(NUM(v), 0, yTop) / yTop) * plotH;
  const yPct = (v: number) => padT + plotH - (clamp(v, 0, 125) / 125) * plotH; // θ/θCC secundário (só mm)

  const bandRect = (lo: number, hi: number, fill: string) => (
    <rect x={padL} y={y(hi)} width={plotW} height={Math.max(y(lo) - y(hi), 0)} fill={fill} />
  );

  // Curva de água no solo (ARM em mm, ou umidade em % da CAD).
  const waterOf = (p: ReservatorioPoint) => (pct ? availOf(p) : p.storageAbs);
  const waterReal: string[] = [];
  const waterFore: string[] = [];
  const moistureReal: string[] = []; // θ/θCC — apenas no modo mm (eixo secundário)
  const moistureFore: string[] = [];
  const ccPts: string[] = [];
  const safetyPts: string[] = [];
  const pmpPts: string[] = [];

  points.forEach((p, i) => {
    const w = waterOf(p);
    if (w != null && Number.isFinite(w)) {
      const ptStr = `${x(i).toFixed(1)},${y(w).toFixed(1)}`;
      if (p.isForecast) waterFore.push(ptStr); else waterReal.push(ptStr);
    }
    if (!pct && p.moisturePctCc != null && Number.isFinite(p.moisturePctCc)) {
      const ptStr = `${x(i).toFixed(1)},${yPct(p.moisturePctCc).toFixed(1)}`;
      if (p.isForecast) moistureFore.push(ptStr); else moistureReal.push(ptStr);
    }
    const ccV = pct ? 100 : p.ccAbs;
    const segV = pct ? segAvailOf(p) : p.safetyAbs;
    const pmpV = pct ? 0 : p.pmpAbs;
    if (ccV != null && Number.isFinite(ccV)) ccPts.push(`${x(i).toFixed(1)},${y(ccV).toFixed(1)}`);
    if (segV != null && Number.isFinite(segV)) safetyPts.push(`${x(i).toFixed(1)},${y(segV).toFixed(1)}`);
    if (pmpV != null && Number.isFinite(pmpV)) pmpPts.push(`${x(i).toFixed(1)},${y(pmpV).toFixed(1)}`);
  });
  if (waterReal.length > 0 && waterFore.length > 0) waterFore.unshift(waterReal[waterReal.length - 1]);
  if (moistureReal.length > 0 && moistureFore.length > 0) moistureFore.unshift(moistureReal[moistureReal.length - 1]);

  const todayPt = todayIndex >= 0 && todayIndex < n ? points[todayIndex] : null;
  const todayX = todayIndex >= 0 && todayIndex < n ? x(todayIndex) : null;
  const crossIdx = crossIndex >= 0 && crossIndex < n ? crossIndex : -1;
  const todayWater = todayPt ? waterOf(todayPt) : null;
  const crossWater = crossIdx >= 0 ? waterOf(points[crossIdx]) : null;

  // A curva de água é comandada por "umidade" no modo %, e por "arm" no modo mm.
  const waterVisible = pct ? visible.umidade : visible.arm;
  const waterColor = pct ? "#7c3aed" : "#3b82f6";

  const mmTicks: number[] = [];
  const tickStep = yTop <= 60 ? 10 : 20;
  for (let t = 0; t <= yTop; t += tickStep) mmTicks.push(t);
  const leftTicks = pct ? [0, 25, 50, 75, 100] : mmTicks;
  const secTicks = [0, 25, 50, 75, 100, 125];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Reservatório de água e umidade do solo">
      {/* Faixas de manejo (verde/amarelo/vermelho) nas duas escalas. */}
      {visible.zonas && (
        <>
          {bandRect(attnRef, ccRef, "#16a34a22")}
          {bandRect(segRef, attnRef, "#eab30826")}
          {bandRect(pmpRef, segRef, "#dc262622")}
          {!pct && bandRect(0, pmpMm, "#7f1d1d22")}
        </>
      )}

      {leftTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="currentColor" strokeWidth={1} className="text-gray-200/60 dark:text-white/[0.05]" />
          <text x={padL - 7} y={y(t) + 3} textAnchor="end" className="fill-graphite-400 dark:fill-gray-500" fontSize={10}>{t}</text>
        </g>
      ))}
      <text x={4} y={padT + 4} className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>{pct ? "%CC" : "mm"}</text>

      {/* Eixo secundário θ/θCC — só faz sentido no modo mm. */}
      {!pct && visible.umidade && (
        <>
          {secTicks.map((t) => (
            <text key={`pct-${t}`} x={padL + plotW + 72} y={yPct(t) + 3} className="fill-violet-600 dark:fill-violet-400" fontSize={8.5}>{t}</text>
          ))}
          <text x={padL + plotW + 72} y={padT - 4} className="fill-violet-600 dark:fill-violet-400" fontSize={8.5} fontWeight={700}>%CC</text>
        </>
      )}

      {visible.zonas && (
        <>
          <ZoneLabel y={y((attnRef + ccRef) / 2)} text="Zona ótima" color="#16a34a" x={padL + 6} />
          <ZoneLabel y={y((segRef + attnRef) / 2)} text="Alerta" color="#b45309" x={padL + 6} />
          <ZoneLabel y={y((pmpRef + segRef) / 2)} text="Déficit crítico" color="#dc2626" x={padL + 6} />
        </>
      )}

      {/* Referências dinâmicas do perfil explorado */}
      {visible.cc && ccPts.length > 1 && <polyline points={ccPts.join(" ")} fill="none" stroke="#16a34a" strokeWidth={1.5} opacity={0.8} />}
      {visible.seguranca && safetyPts.length > 1 && <polyline points={safetyPts.join(" ")} fill="none" stroke="#eab308" strokeWidth={1.8} strokeDasharray="6 4" />}
      {visible.pmp && pmpPts.length > 1 && <polyline points={pmpPts.join(" ")} fill="none" stroke="#dc2626" strokeWidth={1.3} opacity={0.75} />}

      {visible.cc && <RefLine y={y(ccRef)} label="DTA / CC" value={pct ? "100 %CC" : `${ccMm.toFixed(0)} mm`} color="#16a34a" plotRight={padL + plotW} />}
      {visible.seguranca && <RefLine y={y(segRef)} label="Segurança (DTA−CRA)" value={pct ? `${segRef.toFixed(0)} %CC` : `${safetyMm.toFixed(1)} mm`} color="#ca8a04" plotRight={padL + plotW} dashed />}
      {visible.pmp && <RefLine y={y(pmpRef)} label="PMP" value={pct ? "0 %CC" : `${pmpMm.toFixed(0)} mm`} color="#dc2626" plotRight={padL + plotW} />}

      {/* θ/θCC (só no modo mm, eixo secundário) */}
      {!pct && visible.umidade && moistureReal.length > 1 && <polyline points={moistureReal.join(" ")} fill="none" stroke="#7c3aed" strokeWidth={2.1} />}
      {!pct && visible.umidade && moistureFore.length > 1 && <polyline points={moistureFore.join(" ")} fill="none" stroke="#7c3aed" strokeWidth={1.9} strokeDasharray="5 4" opacity={0.75} />}

      {/* Curva de água no solo — cai conforme o solo seca. */}
      {waterVisible && waterReal.length > 1 && <polyline points={waterReal.join(" ")} fill="none" stroke={waterColor} strokeWidth={2.5} />}
      {waterVisible && waterFore.length > 1 && <polyline points={waterFore.join(" ")} fill="none" stroke={waterColor} strokeWidth={2.2} strokeDasharray="6 4" opacity={0.85} />}

      {todayX != null && (
        <>
          <line x1={todayX} x2={todayX} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={todayX} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}

      {waterVisible && todayWater != null && todayX != null && (
        <>
          <circle cx={todayX} cy={y(todayWater)} r={4.5} fill={waterColor} stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${todayX - 52}, ${y(todayWater) - 30})`}>
            <rect width={104} height={20} rx={5} className="fill-graphite-900/90 dark:fill-black/70" />
            <text x={52} y={14} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={700}>
              {pct
                ? `Hoje: ${todayWater.toFixed(0)}% da CC`
                : `Hoje: ${(todayWater - (todayPt?.pmpAbs ?? pmpMm)).toFixed(1)} mm ARM`}
            </text>
          </g>
        </>
      )}

      {waterVisible && crossIdx > todayIndex && crossWater != null && (
        <circle cx={x(crossIdx)} cy={y(crossWater)} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1.4} />
      )}

      {points.map((p, i) => (n <= 18 || i % 2 === 0) ? (
        <text key={`rx${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>{p.label}</text>
      ) : null)}
    </svg>
  );
}

function ZoneLabel({ y, text, color, x }: { y: number; text: string; color: string; x: number }) {
  return <text x={x} y={y + 3} fontSize={9.5} fontWeight={700} fill={color} opacity={0.85}>{text}</text>;
}

function RefLine({ y, label, value, color, plotRight, dashed }: { y: number; label: string; value: string; color: string; plotRight: number; dashed?: boolean }) {
  return (
    <g>
      <line x1={38} x2={plotRight} y1={y} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray={dashed ? "5 4" : undefined} opacity={0.7} />
      <text x={plotRight + 6} y={y - 1} fontSize={9.2} fontWeight={700} fill={color}>{label}</text>
      <text x={plotRight + 6} y={y + 10} fontSize={8.8} className="fill-graphite-400 dark:fill-gray-500">{value}</text>
    </g>
  );
}

function EmptyChart({ label, height }: { label: string; height: number }) {
  return (
    <div className="flex items-center justify-center text-[12px] text-graphite-400 dark:text-gray-500" style={{ height }}>
      {label}
    </div>
  );
}
