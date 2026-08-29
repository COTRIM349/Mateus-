/**
 * Motor agronômico de cultura — funções puras e auditáveis.
 *
 * IMPORTANTE SOBRE CAD:
 * - este módulo NÃO calcula CAD a partir de CC/PMP/camadas;
 * - CAD é responsabilidade do domínio de solo/balanço hídrico;
 * - quando necessário para AFD/RAW/Ks, este módulo recebe cadMm como entrada.
 */

import { clamp, roundTo } from "@/utils/math";

export interface DegreeDayInput {
  tmaxC: number;
  tminC: number;
  baseTemperatureC: number;
}

export interface PiecewisePoint {
  x: number;
  y: number;
}

export interface CalibrationStats {
  n: number;
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  cvPct: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface PredictionErrorStats {
  n: number;
  meanError: number | null;
  mae: number | null;
  rmse: number | null;
}

export interface BaseTemperatureCandidateResult {
  baseTemperatureC: number;
  n: number;
  meanGdd: number | null;
  stdDevGdd: number | null;
  cvPct: number | null;
}

export interface ThermalObservation {
  dailyTemperatures: Array<{ tmaxC: number; tminC: number }>;
}

export function calculateDegreeDay(input: DegreeDayInput): number {
  const { tmaxC, tminC, baseTemperatureC } = input;
  if (![tmaxC, tminC, baseTemperatureC].every(Number.isFinite)) {
    throw new Error("Temperaturas inválidas para cálculo de graus-dia.");
  }
  const tmean = (tmaxC + tminC) / 2;
  return roundTo(Math.max(0, tmean - baseTemperatureC), 3);
}

export function calculateAccumulatedDegreeDays(
  days: DegreeDayInput[],
  initialGdd = 0,
): number {
  return roundTo(
    Math.max(initialGdd, 0) + days.reduce((sum, day) => sum + calculateDegreeDay(day), 0),
    3,
  );
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000);
}

/**
 * Duração astronômica do dia em horas.
 * Usa latitude + data. Longitude não é necessária para duração do fotoperíodo.
 */
export function calculateDayLengthHours(latitudeDeg: number, date: Date | string): number {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new Error("Latitude inválida.");
  }
  const parsed = typeof date === "string" ? new Date(`${date}T12:00:00Z`) : date;
  if (Number.isNaN(parsed.getTime())) throw new Error("Data inválida.");

  const j = dayOfYear(parsed);
  const phi = (latitudeDeg * Math.PI) / 180;
  const delta = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
  const cosArg = clamp(-Math.tan(phi) * Math.tan(delta), -1, 1);
  const omegaS = Math.acos(cosArg);
  return roundTo((24 / Math.PI) * omegaS, 3);
}

function normalizePoints(points: PiecewisePoint[]): PiecewisePoint[] {
  if (points.length === 0) throw new Error("A curva não possui pontos âncora.");
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i];
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("Ponto âncora inválido.");
    }
    if (i > 0 && point.x === sorted[i - 1].x) {
      throw new Error("A curva possui pontos duplicados no mesmo X.");
    }
  }
  return sorted;
}

/** Interpolação linear por trechos; patamares são permitidos. */
export function interpolatePiecewiseLinear(points: PiecewisePoint[], x: number): number {
  if (!Number.isFinite(x)) throw new Error("Valor X inválido.");
  const sorted = normalizePoints(points);
  if (x <= sorted[0].x) return sorted[0].y;
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y;

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (x <= b.x) {
      const progress = (x - a.x) / (b.x - a.x);
      return roundTo(a.y + (b.y - a.y) * progress, 4);
    }
  }
  return sorted[sorted.length - 1].y;
}

export function calculateDailyKc(points: PiecewisePoint[], x: number): number {
  return clamp(interpolatePiecewiseLinear(points, x), 0, 2.5);
}

export function calculateRootDepthMeters(points: PiecewisePoint[], x: number): number {
  return Math.max(0, roundTo(interpolatePiecewiseLinear(points, x), 4));
}

export function calculatePotentialEtcMm(etoMm: number, kc: number, kl = 1): number {
  if (![etoMm, kc, kl].every(Number.isFinite)) throw new Error("Entradas inválidas para ETc.");
  return roundTo(Math.max(0, etoMm) * clamp(kc, 0, 2.5) * clamp(kl, 0, 1), 3);
}

/**
 * Ajuste FAO-56 de p usando ETc potencial, nunca ETo como proxy.
 * p_adj = p_table + 0.04 * (5 - ETc)
 */
export function calculateAdjustedDepletionFraction(
  baseP: number,
  etcPotentialMm: number,
): number {
  if (![baseP, etcPotentialMm].every(Number.isFinite)) {
    throw new Error("Entradas inválidas para ajuste de p.");
  }
  const adjusted = baseP + 0.04 * (5 - etcPotentialMm);
  return roundTo(clamp(adjusted, 0.1, 0.8), 3);
}

/** CAD é fornecida pelo módulo de solo/balanço; aqui apenas calculamos AFD/RAW. */
export function calculateRawAfdMm(cadMm: number, p: number): number {
  if (![cadMm, p].every(Number.isFinite)) throw new Error("CAD/p inválidos.");
  if (cadMm < 0) throw new Error("CAD não pode ser negativa.");
  return roundTo(cadMm * clamp(p, 0, 1), 3);
}

/**
 * Ks FAO-56 usando depleção em mm.
 * Dr <= RAW => Ks = 1.
 */
export function calculateKsFromCad(input: {
  cadMm: number;
  depletionMm: number;
  p: number;
}): number {
  const { cadMm, depletionMm, p } = input;
  if (![cadMm, depletionMm, p].every(Number.isFinite)) {
    throw new Error("Entradas inválidas para Ks.");
  }
  if (cadMm <= 0) return 0;

  const pp = clamp(p, 0.1, 0.8);
  const dr = clamp(depletionMm, 0, cadMm);
  const raw = cadMm * pp;
  if (dr <= raw) return 1;

  const denominator = (1 - pp) * cadMm;
  if (denominator <= 0) return 0;
  return roundTo(clamp((cadMm - dr) / denominator, 0, 1), 3);
}

export function calculateAdjustedEtcMm(etcPotentialMm: number, ks: number): number {
  if (![etcPotentialMm, ks].every(Number.isFinite)) {
    throw new Error("Entradas inválidas para ETc ajustada.");
  }
  return roundTo(Math.max(0, etcPotentialMm) * clamp(ks, 0, 1), 3);
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next == null ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function calculateCalibrationStatistics(values: number[]): CalibrationStats {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = clean.length;
  if (n === 0) {
    return {
      n: 0, mean: null, median: null, stdDev: null, cvPct: null,
      min: null, max: null, p10: null, p25: null, p50: null, p75: null, p90: null,
    };
  }

  const mean = clean.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1
    ? clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const cvPct = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : null;

  return {
    n,
    mean: roundTo(mean, 3),
    median: roundTo(quantile(clean, 0.5)!, 3),
    stdDev: roundTo(stdDev, 3),
    cvPct: cvPct == null ? null : roundTo(cvPct, 2),
    min: roundTo(clean[0], 3),
    max: roundTo(clean[n - 1], 3),
    p10: roundTo(quantile(clean, 0.1)!, 3),
    p25: roundTo(quantile(clean, 0.25)!, 3),
    p50: roundTo(quantile(clean, 0.5)!, 3),
    p75: roundTo(quantile(clean, 0.75)!, 3),
    p90: roundTo(quantile(clean, 0.9)!, 3),
  };
}

export function calculatePredictionErrors(
  observed: number[],
  predicted: number[],
): PredictionErrorStats {
  const pairs = observed
    .map((obs, i) => ({ obs, pred: predicted[i] }))
    .filter((p) => Number.isFinite(p.obs) && Number.isFinite(p.pred));

  if (pairs.length === 0) return { n: 0, meanError: null, mae: null, rmse: null };

  const errors = pairs.map((p) => p.pred - p.obs);
  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;
  const mae = errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b ** 2, 0) / errors.length);

  return {
    n: errors.length,
    meanError: roundTo(meanError, 3),
    mae: roundTo(mae, 3),
    rmse: roundTo(rmse, 3),
  };
}

/**
 * Avalia Tb candidata pela estabilidade do tempo térmico até o MESMO evento.
 * O resultado é diagnóstico e nunca deve ser ativado automaticamente.
 */
export function evaluateBaseTemperatureCandidates(
  observations: ThermalObservation[],
  candidatesC: number[],
): BaseTemperatureCandidateResult[] {
  return candidatesC.map((baseTemperatureC) => {
    const totals = observations.map((obs) =>
      calculateAccumulatedDegreeDays(
        obs.dailyTemperatures.map((d) => ({ ...d, baseTemperatureC })),
      ),
    );
    const stats = calculateCalibrationStatistics(totals);
    return {
      baseTemperatureC,
      n: stats.n,
      meanGdd: stats.mean,
      stdDevGdd: stats.stdDev,
      cvPct: stats.cvPct,
    };
  });
}
