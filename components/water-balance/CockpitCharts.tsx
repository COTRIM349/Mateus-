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
}: {
  points: EntradaConsumoPoint[];
  todayIndex: number;
}) {
  const W = 1000;
  const H = 300;
  const padL = 38;
  const padR = 42;
  const padT = 18;
  const padB = 28;
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

      {kcTicks.map((t) => (
        <text key={`kc-${t}`} x={W - padR + 7} y={yKc(t) + 3} className="fill-green-600 dark:fill-green-400" fontSize={9}>{t.toFixed(1)}</text>
      ))}
      <text x={W - 24} y={padT - 5} className="fill-green-600 dark:fill-green-400" fontSize={9} fontWeight={700}>Kc</text>

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
            {chuva > 0 && <rect x={cx - barW / 2} y={yChuvaTop} width={barW} height={Math.max(chuvaH, 0)} rx={2} fill="#2f6bff" />}
            {irr > 0 && <rect x={cx - barW / 2} y={yIrrTop} width={barW} height={Math.max(irrH, 0)} rx={2} fill="#16a34a" />}
          </g>
        );
      })}

      {/* ETc */}
      {etc.real.length > 1 && <polyline points={etc.real.join(" ")} fill="none" stroke="#64748b" strokeWidth={2.2} />}
      {etc.fore.length > 1 && <polyline points={etc.fore.join(" ")} fill="none" stroke="#94a3b8" strokeWidth={2.1} strokeDasharray="5 4" />}

      {/* ETo */}
      {eto.real.length > 1 && <polyline points={eto.real.join(" ")} fill="none" stroke="#f59e0b" strokeWidth={2} />}
      {eto.fore.length > 1 && <polyline points={eto.fore.join(" ")} fill="none" stroke="#f59e0b" strokeWidth={1.9} strokeDasharray="5 4" opacity={0.8} />}

      {/* Kc */}
      {kc.real.length > 1 && <polyline points={kc.real.join(" ")} fill="none" stroke="#22c55e" strokeWidth={2.2} />}
      {kc.fore.length > 1 && <polyline points={kc.fore.join(" ")} fill="none" stroke="#22c55e" strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />}

      {forecastStart != null && (
        <>
          <line x1={forecastStart} x2={forecastStart} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={forecastStart} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}

      {points.map((p, i) => (n <= 16 || i % 2 === 0) ? (
        <text key={`x${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>{p.label}</text>
      ) : null)}
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
}: {
  points: ReservatorioPoint[];
  todayIndex: number;
  crossIndex: number;
  ccMm: number;
  pmpMm: number;
  safetyMm: number;
  attentionMm: number;
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

  const maxPoint = Math.max(
    ccMm,
    ...points.flatMap((p) => [p.storageAbs ?? 0, p.ccAbs ?? 0, p.safetyAbs ?? 0]),
  );
  const yTop = Math.max(10, Math.ceil(maxPoint / 10) * 10);
  const yBottom = 0;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yMm = (v: number) => padT + plotH - ((NUM(v) - yBottom) / (yTop - yBottom)) * plotH;
  const yPct = (v: number) => padT + plotH - (clamp(v, 0, 125) / 125) * plotH;

  const bandRect = (lo: number, hi: number, fill: string) => (
    <rect x={padL} y={yMm(hi)} width={plotW} height={Math.max(yMm(lo) - yMm(hi), 0)} fill={fill} />
  );

  const armReal: string[] = [];
  const armFore: string[] = [];
  const moistureReal: string[] = [];
  const moistureFore: string[] = [];
  const ccPts: string[] = [];
  const safetyPts: string[] = [];
  const pmpPts: string[] = [];

  points.forEach((p, i) => {
    if (p.storageAbs != null && Number.isFinite(p.storageAbs)) {
      const pt = `${x(i).toFixed(1)},${yMm(p.storageAbs).toFixed(1)}`;
      if (p.isForecast) armFore.push(pt); else armReal.push(pt);
    }
    if (p.moisturePctCc != null && Number.isFinite(p.moisturePctCc)) {
      const pt = `${x(i).toFixed(1)},${yPct(p.moisturePctCc).toFixed(1)}`;
      if (p.isForecast) moistureFore.push(pt); else moistureReal.push(pt);
    }
    if (p.ccAbs != null && Number.isFinite(p.ccAbs)) ccPts.push(`${x(i).toFixed(1)},${yMm(p.ccAbs).toFixed(1)}`);
    if (p.safetyAbs != null && Number.isFinite(p.safetyAbs)) safetyPts.push(`${x(i).toFixed(1)},${yMm(p.safetyAbs).toFixed(1)}`);
    if (p.pmpAbs != null && Number.isFinite(p.pmpAbs)) pmpPts.push(`${x(i).toFixed(1)},${yMm(p.pmpAbs).toFixed(1)}`);
  });
  if (armReal.length > 0 && armFore.length > 0) armFore.unshift(armReal[armReal.length - 1]);
  if (moistureReal.length > 0 && moistureFore.length > 0) moistureFore.unshift(moistureReal[moistureReal.length - 1]);

  const todayPt = todayIndex >= 0 && todayIndex < n ? points[todayIndex] : null;
  const todayX = todayIndex >= 0 && todayIndex < n ? x(todayIndex) : null;
  const crossIdx = crossIndex >= 0 && crossIndex < n ? crossIndex : -1;

  const yTicks: number[] = [];
  const tickStep = yTop <= 60 ? 10 : 20;
  for (let t = 0; t <= yTop; t += tickStep) yTicks.push(t);
  const pctTicks = [0, 25, 50, 75, 100, 125];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Reservatório de água e umidade do solo">
      {/* Faixas atuais; as curvas dinâmicas de CC/segurança acompanham cada data. */}
      {bandRect(attentionMm, ccMm, "#16a34a22")}
      {bandRect(safetyMm, attentionMm, "#eab30826")}
      {bandRect(pmpMm, safetyMm, "#dc262622")}
      {bandRect(yBottom, pmpMm, "#7f1d1d22")}

      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={padL + plotW} y1={yMm(t)} y2={yMm(t)} stroke="currentColor" strokeWidth={1} className="text-gray-200/60 dark:text-white/[0.05]" />
          <text x={padL - 7} y={yMm(t) + 3} textAnchor="end" className="fill-graphite-400 dark:fill-gray-500" fontSize={10}>{t}</text>
        </g>
      ))}
      <text x={4} y={padT + 4} className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>mm</text>

      {pctTicks.map((t) => (
        <text key={`pct-${t}`} x={padL + plotW + 72} y={yPct(t) + 3} className="fill-violet-600 dark:fill-violet-400" fontSize={8.5}>{t}</text>
      ))}
      <text x={padL + plotW + 72} y={padT - 4} className="fill-violet-600 dark:fill-violet-400" fontSize={8.5} fontWeight={700}>%CC</text>

      <ZoneLabel y={yMm((attentionMm + ccMm) / 2)} text="Zona ótima" color="#16a34a" x={padL + 6} />
      <ZoneLabel y={yMm((safetyMm + attentionMm) / 2)} text="Alerta" color="#b45309" x={padL + 6} />
      <ZoneLabel y={yMm((pmpMm + safetyMm) / 2)} text="Déficit crítico" color="#dc2626" x={padL + 6} />

      {/* Referências dinâmicas do perfil explorado */}
      {ccPts.length > 1 && <polyline points={ccPts.join(" ")} fill="none" stroke="#16a34a" strokeWidth={1.5} opacity={0.8} />}
      {safetyPts.length > 1 && <polyline points={safetyPts.join(" ")} fill="none" stroke="#eab308" strokeWidth={1.8} strokeDasharray="6 4" />}
      {pmpPts.length > 1 && <polyline points={pmpPts.join(" ")} fill="none" stroke="#dc2626" strokeWidth={1.3} opacity={0.75} />}

      <RefLine y={yMm(ccMm)} label="CAD / CC" value={`${ccMm.toFixed(0)} mm`} color="#16a34a" plotRight={padL + plotW} />
      <RefLine y={yMm(safetyMm)} label="Segurança (CAD−AFD)" value={`${safetyMm.toFixed(1)} mm`} color="#ca8a04" plotRight={padL + plotW} dashed />
      <RefLine y={yMm(pmpMm)} label="PMP" value={`${pmpMm.toFixed(0)} mm`} color="#dc2626" plotRight={padL + plotW} />

      {/* ARM */}
      {armReal.length > 1 && <polyline points={armReal.join(" ")} fill="none" stroke="#3b82f6" strokeWidth={2.5} />}
      {armFore.length > 1 && <polyline points={armFore.join(" ")} fill="none" stroke="#3b82f6" strokeWidth={2.2} strokeDasharray="6 4" opacity={0.85} />}

      {/* Umidade do solo (% da CC) */}
      {moistureReal.length > 1 && <polyline points={moistureReal.join(" ")} fill="none" stroke="#7c3aed" strokeWidth={2.1} />}
      {moistureFore.length > 1 && <polyline points={moistureFore.join(" ")} fill="none" stroke="#7c3aed" strokeWidth={1.9} strokeDasharray="5 4" opacity={0.75} />}

      {todayX != null && (
        <>
          <line x1={todayX} x2={todayX} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={todayX} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}

      {todayPt?.storageAbs != null && todayX != null && (
        <>
          <circle cx={todayX} cy={yMm(todayPt.storageAbs)} r={4.5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${todayX - 48}, ${yMm(todayPt.storageAbs) - 30})`}>
            <rect width={96} height={20} rx={5} className="fill-graphite-900/90 dark:fill-black/70" />
            <text x={48} y={14} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={700}>Hoje: {(todayPt.storageAbs - (todayPt.pmpAbs ?? pmpMm)).toFixed(1)} mm ARM</text>
          </g>
        </>
      )}

      {crossIdx > todayIndex && points[crossIdx].storageAbs != null && (
        <circle cx={x(crossIdx)} cy={yMm(points[crossIdx].storageAbs!)} r={4} fill="#dc2626" stroke="#fff" strokeWidth={1.4} />
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
