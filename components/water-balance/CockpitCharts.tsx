"use client";

/**
 * Gráficos dedicados do cockpit de Balanço Hídrico.
 *
 * São dois quadros específicos da "central de decisão":
 *  - EntradasConsumoChart — barras de chuva efetiva + irrigação e a linha de
 *    ETc (realizada sólida, previsão tracejada), com a região de previsão
 *    sombreada.
 *  - ReservatorioChart — armazenamento de água do solo em escala absoluta
 *    (PMP ↔ CC), com faixas de manejo, ARM realizado (sólido) e projetado
 *    (tracejado), destacando o cruzamento com o limite de manejo.
 *
 * Não inventam dados: recebem séries já derivadas do motor FAO-56 e da
 * previsão climática aprovada. A previsão é sempre desenhada tracejada e
 * rotulada como tal — nunca se confunde com observação realizada.
 */

export interface EntradaConsumoPoint {
  label: string;
  chuvaEf: number;
  irrig: number;
  etc: number | null;
  isForecast: boolean;
}

export interface ReservatorioPoint {
  label: string;
  /** Armazenamento absoluto do solo em mm (ARM + PMP). null = sem dado. */
  storageAbs: number | null;
  isForecast: boolean;
}

const NUM = (v: number) => (Number.isFinite(v) ? v : 0);

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
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (points.length === 0) {
    return <EmptyChart label="Sem dados no período." height={H} />;
  }

  const maxInput = Math.max(...points.map((p) => NUM(p.chuvaEf) + NUM(p.irrig)), 0);
  const maxEtc = Math.max(...points.map((p) => NUM(p.etc ?? 0)), 0);
  const yMax = Math.max(25, Math.ceil(Math.max(maxInput, maxEtc) / 5) * 5);

  const n = points.length;
  const band = plotW / n;
  const barW = Math.min(band * 0.5, 18);

  const x = (i: number) => padL + band * i + band / 2;
  const y = (v: number) => padT + plotH - (NUM(v) / yMax) * plotH;

  const yTicks = [0, 5, 10, 15, 20, 25].filter((t) => t <= yMax);
  const forecastStart = todayIndex >= 0 && todayIndex < n ? x(todayIndex) : null;

  // linha de ETc: segmento realizado (sólido) e segmento previsto (tracejado)
  const etcReal: string[] = [];
  const etcFore: string[] = [];
  points.forEach((p, i) => {
    if (p.etc == null) return;
    const pt = `${x(i).toFixed(1)},${y(p.etc).toFixed(1)}`;
    if (p.isForecast) etcFore.push(pt);
    else etcReal.push(pt);
  });
  // conecta a última realizada ao início da previsão
  if (etcReal.length > 0 && etcFore.length > 0) etcFore.unshift(etcReal[etcReal.length - 1]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Entradas e consumo de água">
      {/* região de previsão */}
      {forecastStart != null && (
        <rect x={forecastStart} y={padT} width={W - padR - forecastStart} height={plotH} fill="currentColor" className="text-brand-500/[0.06] dark:text-white/[0.04]" />
      )}
      {/* grades e eixo Y */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="currentColor" strokeWidth={1} className="text-gray-200/70 dark:text-white/[0.06]" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-graphite-400 dark:fill-gray-500" fontSize={10}>{t}</text>
        </g>
      ))}
      <text x={4} y={padT + 4} className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>mm</text>

      {/* barras: chuva (base) + irrigação (empilhada) */}
      {points.map((p, i) => {
        const cx = x(i);
        const chuva = NUM(p.chuvaEf);
        const irr = NUM(p.irrig);
        const yChuvaTop = y(chuva);
        const chuvaH = padT + plotH - yChuvaTop;
        const yIrrTop = y(chuva + irr);
        const irrH = yChuvaTop - yIrrTop;
        const op = p.isForecast ? 0.5 : 1;
        return (
          <g key={i} opacity={op}>
            {chuva > 0 && <rect x={cx - barW / 2} y={yChuvaTop} width={barW} height={Math.max(chuvaH, 0)} rx={2} fill="#2f6bff" />}
            {irr > 0 && <rect x={cx - barW / 2} y={yIrrTop} width={barW} height={Math.max(irrH, 0)} rx={2} fill="#16a34a" />}
          </g>
        );
      })}

      {/* linha ETc realizada */}
      {etcReal.length > 1 && <polyline points={etcReal.join(" ")} fill="none" stroke="#e5e7eb" strokeWidth={2} className="stroke-graphite-700 dark:stroke-white" />}
      {/* linha ETc previsão (tracejada) */}
      {etcFore.length > 1 && <polyline points={etcFore.join(" ")} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" />}
      {/* pontos ETc realizada */}
      {points.map((p, i) => p.etc != null && !p.isForecast ? (
        <circle key={`d${i}`} cx={x(i)} cy={y(p.etc)} r={2.4} className="fill-graphite-700 dark:fill-white" />
      ) : null)}

      {/* divisor HOJE */}
      {forecastStart != null && (
        <>
          <line x1={forecastStart} x2={forecastStart} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={forecastStart} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}

      {/* rótulos X (a cada ~2) */}
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
  ccMm,
  pmpMm,
  safetyMm,
  criticalMm,
}: {
  points: ReservatorioPoint[];
  todayIndex: number;
  /** Água no solo na capacidade de campo (mm, absoluto). */
  ccMm: number;
  /** Água no solo no ponto de murcha (mm, absoluto = piso). */
  pmpMm: number;
  /** Limite de manejo em mm absoluto (PMP + (CAD − AFD)). */
  safetyMm: number;
  /** Piso da faixa de alerta em mm absoluto (abaixo = déficit crítico). */
  criticalMm: number;
}) {
  const W = 1000;
  const H = 320;
  const padL = 34;
  const padR = 96;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (points.length === 0 || ccMm <= 0) {
    return <EmptyChart label="Sem dados no período." height={H} />;
  }

  const yTop = Math.ceil(ccMm / 10) * 10;
  const yBottom = 0;
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH - ((NUM(v) - yBottom) / (yTop - yBottom)) * plotH;

  const bandRect = (lo: number, hi: number, fill: string) => (
    <rect x={padL} y={y(hi)} width={plotW} height={Math.max(y(lo) - y(hi), 0)} fill={fill} />
  );

  // séries ARM: realizada (sólida) e projetada (tracejada)
  const real: string[] = [];
  const fore: string[] = [];
  points.forEach((p, i) => {
    if (p.storageAbs == null) return;
    const pt = `${x(i).toFixed(1)},${y(p.storageAbs).toFixed(1)}`;
    if (p.isForecast) fore.push(pt);
    else real.push(pt);
  });
  if (real.length > 0 && fore.length > 0) fore.unshift(real[real.length - 1]);

  const todayPt = todayIndex >= 0 && todayIndex < n ? points[todayIndex] : null;
  const todayX = todayIndex >= 0 && todayIndex < n ? x(todayIndex) : null;

  // ponto de cruzamento projetado com o limite de manejo
  let crossIdx = -1;
  for (let i = Math.max(todayIndex, 0); i < n; i += 1) {
    const v = points[i].storageAbs;
    if (v != null && v <= safetyMm) { crossIdx = i; break; }
  }

  const yTicks = [] as number[];
  for (let t = 0; t <= yTop; t += 20) yTicks.push(t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Reservatório de água do solo">
      {/* faixas de manejo */}
      {bandRect(safetyMm, ccMm, "#16a34a22")}
      {bandRect(criticalMm, safetyMm, "#eab30826")}
      {bandRect(pmpMm, criticalMm, "#dc262622")}
      {bandRect(yBottom, pmpMm, "#7f1d1d22")}

      {/* grades / eixo Y */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="currentColor" strokeWidth={1} className="text-gray-200/60 dark:text-white/[0.05]" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-graphite-400 dark:fill-gray-500" fontSize={10}>{t}</text>
        </g>
      ))}
      <text x={4} y={padT + 4} className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>mm</text>

      {/* rótulos das faixas (à esquerda) */}
      <ZoneLabel y={y((safetyMm + ccMm) / 2)} text="Zona ótima" color="#16a34a" x={padL + 6} />
      <ZoneLabel y={y((criticalMm + safetyMm) / 2)} text="Alerta" color="#b45309" x={padL + 6} />
      <ZoneLabel y={y((pmpMm + criticalMm) / 2)} text="Déficit crítico" color="#dc2626" x={padL + 6} />

      {/* linhas de referência à direita */}
      <RefLine y={y(ccMm)} label="CAD / CC" value={`${ccMm.toFixed(0)} mm`} color="#2563eb" plotRight={padL + plotW} />
      <RefLine y={y(safetyMm)} label="Limite de manejo" value={`${safetyMm.toFixed(1)} mm`} color="#ca8a04" plotRight={padL + plotW} dashed />
      <RefLine y={y(pmpMm)} label="PMP" value={`${pmpMm.toFixed(0)} mm`} color="#dc2626" plotRight={padL + plotW} />

      {/* ARM realizado */}
      {real.length > 1 && <polyline points={real.join(" ")} fill="none" stroke="#3b82f6" strokeWidth={2.4} />}
      {/* ARM projetado (tracejado) */}
      {fore.length > 1 && <polyline points={fore.join(" ")} fill="none" stroke="#3b82f6" strokeWidth={2.2} strokeDasharray="6 4" opacity={0.85} />}
      {/* pontos realizados */}
      {points.map((p, i) => p.storageAbs != null && !p.isForecast ? (
        <circle key={`p${i}`} cx={x(i)} cy={y(p.storageAbs)} r={2.2} fill="#3b82f6" />
      ) : null)}

      {/* HOJE */}
      {todayX != null && (
        <>
          <line x1={todayX} x2={todayX} y1={padT} y2={padT + plotH} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" className="text-graphite-400 dark:text-gray-500" />
          <text x={todayX} y={padT - 4} textAnchor="middle" className="fill-graphite-500 dark:fill-gray-400" fontSize={9} fontWeight={700}>HOJE</text>
        </>
      )}
      {/* ponto de hoje com valor */}
      {todayPt?.storageAbs != null && todayX != null && (
        <>
          <circle cx={todayX} cy={y(todayPt.storageAbs)} r={4.5} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
          <g transform={`translate(${todayX - 46}, ${y(todayPt.storageAbs) - 30})`}>
            <rect width={92} height={20} rx={5} className="fill-graphite-900/90 dark:fill-black/70" />
            <text x={46} y={14} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>Hoje: {(todayPt.storageAbs - pmpMm).toFixed(1)} mm ARM</text>
          </g>
        </>
      )}
      {/* cruzamento previsto com o limite */}
      {crossIdx > todayIndex && points[crossIdx].storageAbs != null && (
        <circle cx={x(crossIdx)} cy={y(safetyMm)} r={4} fill="#ca8a04" stroke="#fff" strokeWidth={1.4} />
      )}

      {/* rótulos X */}
      {points.map((p, i) => (n <= 18 || i % 2 === 0) ? (
        <text key={`rx${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="fill-graphite-400 dark:fill-gray-500" fontSize={9}>{p.label}</text>
      ) : null)}
    </svg>
  );
}

function ZoneLabel({ y, text, color, x }: { y: number; text: string; color: string; x: number }) {
  return (
    <text x={x} y={y + 3} fontSize={9.5} fontWeight={700} fill={color} opacity={0.85}>{text}</text>
  );
}

function RefLine({ y, label, value, color, plotRight, dashed }: { y: number; label: string; value: string; color: string; plotRight: number; dashed?: boolean }) {
  return (
    <g>
      <line x1={34} x2={plotRight} y1={y} y2={y} stroke={color} strokeWidth={1.2} strokeDasharray={dashed ? "5 4" : undefined} opacity={0.7} />
      <text x={plotRight + 6} y={y - 1} fontSize={9.5} fontWeight={700} fill={color}>{label}</text>
      <text x={plotRight + 6} y={y + 10} fontSize={9} className="fill-graphite-400 dark:fill-gray-500">{value}</text>
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
