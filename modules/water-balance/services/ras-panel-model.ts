/**
 * Modelo de visualização RAS: o motor mantém ARM em mm da água DISPONÍVEL,
 * enquanto o gráfico %CC inclui também a água retida no PMP. Nunca misturar
 * os denominadores %CTA e %CC.
 */
export interface RasDayInput {
  date: string;
  cad: number;
  afd: number;
  storedWater: number;
  rootDepth: number;
  fieldCapacity?: number | null;
  wiltingPoint?: number | null;
  et0: number;
  etc: number;
  kc: number;
  /** Chuva registrada, sem buscar precipitação automaticamente. */
  precipitation?: number;
  /** Parcela da chuva que realmente entrou no balanço do solo. */
  effectivePrecipitation?: number;
  /** Lâmina bruta de irrigação REALMENTE executada, nunca recomendada/projetada. */
  irrigationApplied?: number;
  effectiveIrrigation?: number;
  factorWeekStart?: string;
}

export interface RasPoint {
  date: string;
  armMm: number;
  /** Profundidade da raiz considerada em cada dia (m). */
  rootDepth: number;
  /** Parâmetros volumétricos equivalentes na zona radicular daquele dia. */
  fieldCapacity: number;
  wiltingPoint: number;
  ctaMm: number;
  afdMm: number;
  f: number;
  ccPercent: number;
  pmpPercentCc: number;
  limitPercentCc: number;
  pmpAbsoluteMm: number;
  et0: number;
  etc: number;
  kc: number;
  /** Somente eventos observados; mm/dia, independentes do eixo %CC. */
  rainRecordedMm: number;
  rainEffectiveMm: number;
  irrigationAppliedMm: number;
  irrigationEffectiveMm: number;
}

const cap = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function buildRasPoint(row: RasDayInput): RasPoint | null {
  const { cad, afd, storedWater, fieldCapacity, wiltingPoint, rootDepth } = row;
  if (![cad, afd, storedWater, fieldCapacity, wiltingPoint, rootDepth].every((v) => v != null && Number.isFinite(v)) ||
      cad <= 0 || afd <= 0 || afd > cad || fieldCapacity == null || wiltingPoint == null ||
      fieldCapacity <= wiltingPoint || wiltingPoint < 0 || rootDepth <= 0) return null;
  const f = cap(afd / cad, 0, 1);
  const pmpPercentCc = cap((wiltingPoint / fieldCapacity) * 100, 0, 100);
  const availableFraction = cap(storedWater / cad, 0, 1);
  const ccPercent = pmpPercentCc + (100 - pmpPercentCc) * availableFraction;
  const limitPercentCc = pmpPercentCc + (100 - pmpPercentCc) * (1 - f);
  return {
    date: row.date,
    armMm: cap(storedWater, 0, cad),
    rootDepth,
    fieldCapacity,
    wiltingPoint,
    ctaMm: cad,
    afdMm: afd,
    f,
    ccPercent,
    pmpPercentCc,
    limitPercentCc,
    pmpAbsoluteMm: wiltingPoint * rootDepth * 1000,
    et0: row.et0,
    etc: row.etc,
    kc: row.kc,
    rainRecordedMm: Math.max(0, row.precipitation ?? 0),
    rainEffectiveMm: Math.max(0, row.effectivePrecipitation ?? 0),
    irrigationAppliedMm: Math.max(0, row.irrigationApplied ?? 0),
    irrigationEffectiveMm: Math.max(0, row.effectiveIrrigation ?? 0),
  };
}

export function rasWaterReplenishment(ctaMm: number, armMm: number, efficiencyFraction: number | null, areaHa: number | null, flowRateM3h: number | null) {
  const netMm = Number.isFinite(ctaMm) && Number.isFinite(armMm) && ctaMm > 0
    ? Math.max(0, ctaMm - cap(armMm, 0, ctaMm)) : 0;
  const validEfficiency = efficiencyFraction != null && Number.isFinite(efficiencyFraction) && efficiencyFraction > 0 && efficiencyFraction <= 1;
  const grossMm = validEfficiency ? netMm / efficiencyFraction : null;
  const volumeM3 = grossMm != null && areaHa != null && Number.isFinite(areaHa) && areaHa > 0
    ? grossMm * areaHa * 10 : null;
  const hours = volumeM3 != null && flowRateM3h != null && Number.isFinite(flowRateM3h) && flowRateM3h > 0
    ? volumeM3 / flowRateM3h : null;
  return { netMm, grossMm, hours, volumeM3 };
}

export function currentWeekStats<T extends RasDayInput>(rows: T[]) {
  const last = rows[rows.length - 1];
  if (!last) return null;
  const monday = last.factorWeekStart ?? last.date;
  const mondayMs = Date.parse(monday + "T00:00:00Z");
  const weekEnd = Number.isFinite(mondayMs)
    ? new Date(mondayMs + 6 * 86400000).toISOString().slice(0, 10) : monday;
  const selection = rows.filter((r) => r.date >= monday && r.date <= weekEnd);
  if (!selection.length) return null;
  const avg = (key: "et0" | "etc") => selection.reduce((sum, r) => sum + r[key], 0) / selection.length;
  return { start: monday, end: weekEnd, days: selection.length, etoMean: avg("et0"), etcMean: avg("etc"), currentKc: last.kc };
}
