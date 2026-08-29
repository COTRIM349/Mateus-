import { clamp, roundTo } from "@/utils/math";

export type DegreeDayMethod = "simple_mean" | "simple_mean_capped";

export interface DailyTemperature {
  date: string;
  tminC: number;
  tmaxC: number;
}

export interface DailyDegreeDayResult extends DailyTemperature {
  meanC: number;
  degreeDays: number;
  accumulatedDegreeDays: number;
}

export interface DegreeDayOptions {
  baseTemperatureC: number;
  upperTemperatureC?: number | null;
  method?: DegreeDayMethod;
}

export interface PhenologyObservationSample {
  id?: string;
  observedDae?: number | null;
  predictedDae?: number | null;
  dailyTemperatures: DailyTemperature[];
}

export interface ThermalSummary {
  n: number;
  mean: number | null;
  median: number | null;
  standardDeviation: number | null;
  cvPct: number | null;
  min: number | null;
  max: number | null;
  p10: number | null;
  p90: number | null;
}

export interface BaseTemperatureCandidateResult extends ThermalSummary {
  baseTemperatureC: number;
  rmseDays: number | null;
  score: number | null;
}

/**
 * Graus-dia diário pela média simples:
 * GD = max(0, ((Tmax + Tmin) / 2) - Tb)
 *
 * No método simple_mean_capped, Tmin/Tmax são limitadas à temperatura
 * superior antes do cálculo da média. Este método é uma aproximação simples,
 * não substitui métodos seno/triângulo quando estes forem requeridos.
 */
export function calculateDailyDegreeDays(
  tminC: number,
  tmaxC: number,
  options: DegreeDayOptions,
): number {
  if (![tminC, tmaxC, options.baseTemperatureC].every(Number.isFinite)) {
    throw new Error("Temperaturas e Tb devem ser números finitos.");
  }

  const tmin = Math.min(tminC, tmaxC);
  const tmax = Math.max(tminC, tmaxC);
  const method = options.method ?? "simple_mean";

  let low = tmin;
  let high = tmax;

  if (method === "simple_mean_capped") {
    const upper = options.upperTemperatureC;
    if (upper == null || !Number.isFinite(upper) || upper <= options.baseTemperatureC) {
      throw new Error("Temperatura superior válida é obrigatória no método capped.");
    }
    low = Math.min(low, upper);
    high = Math.min(high, upper);
  }

  const mean = (low + high) / 2;
  return roundTo(Math.max(0, mean - options.baseTemperatureC), 3);
}

export function accumulateDegreeDays(
  temperatures: DailyTemperature[],
  options: DegreeDayOptions,
): DailyDegreeDayResult[] {
  let accumulated = 0;

  return temperatures.map((row) => {
    const degreeDays = calculateDailyDegreeDays(row.tminC, row.tmaxC, options);
    accumulated += degreeDays;

    const cappedMin =
      options.method === "simple_mean_capped" && options.upperTemperatureC != null
        ? Math.min(row.tminC, options.upperTemperatureC)
        : row.tminC;
    const cappedMax =
      options.method === "simple_mean_capped" && options.upperTemperatureC != null
        ? Math.min(row.tmaxC, options.upperTemperatureC)
        : row.tmaxC;

    return {
      ...row,
      meanC: roundTo((cappedMin + cappedMax) / 2, 2),
      degreeDays,
      accumulatedDegreeDays: roundTo(accumulated, 3),
    };
  });
}

export function totalDegreeDays(
  temperatures: DailyTemperature[],
  options: DegreeDayOptions,
): number {
  return roundTo(
    temperatures.reduce(
      (sum, row) => sum + calculateDailyDegreeDays(row.tminC, row.tmaxC, options),
      0,
    ),
    3,
  );
}

/**
 * Fotoperíodo astronômico aproximado (horas entre nascer e pôr do sol),
 * calculado por latitude e dia juliano. Não inclui crepúsculo civil.
 */
export function calculatePhotoperiodHours(date: Date | string, latitudeDeg: number): number {
  if (!Number.isFinite(latitudeDeg) || latitudeDeg < -90 || latitudeDeg > 90) {
    throw new Error("Latitude deve estar entre -90 e 90 graus.");
  }

  const d = typeof date === "string" ? new Date(`${date}T12:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida.");

  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start) / 86_400_000);

  const phi = (latitudeDeg * Math.PI) / 180;
  const declination = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
  const argument = clamp(-Math.tan(phi) * Math.tan(declination), -1, 1);
  const sunsetHourAngle = Math.acos(argument);
  return roundTo((24 / Math.PI) * sunsetHourAngle, 2);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const index = clamp(p, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

export function summarizeThermalValues(values: number[]): ThermalSummary {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = clean.length;
  if (n === 0) {
    return {
      n: 0,
      mean: null,
      median: null,
      standardDeviation: null,
      cvPct: null,
      min: null,
      max: null,
      p10: null,
      p90: null,
    };
  }

  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
  const median = percentile(clean, 0.5)!;
  const variance =
    n > 1
      ? clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)
      : 0;
  const sd = Math.sqrt(variance);
  const cvPct = mean !== 0 ? (sd / Math.abs(mean)) * 100 : null;

  return {
    n,
    mean: roundTo(mean, 2),
    median: roundTo(median, 2),
    standardDeviation: roundTo(sd, 2),
    cvPct: cvPct == null ? null : roundTo(cvPct, 2),
    min: roundTo(clean[0], 2),
    max: roundTo(clean[n - 1], 2),
    p10: roundTo(percentile(clean, 0.1)!, 2),
    p90: roundTo(percentile(clean, 0.9)!, 2),
  };
}

export function rmseDays(samples: PhenologyObservationSample[]): number | null {
  const errors = samples
    .filter(
      (sample) =>
        sample.observedDae != null &&
        sample.predictedDae != null &&
        Number.isFinite(sample.observedDae) &&
        Number.isFinite(sample.predictedDae),
    )
    .map((sample) => (sample.predictedDae as number) - (sample.observedDae as number));

  if (errors.length === 0) return null;
  return roundTo(
    Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length),
    2,
  );
}

/**
 * Compara candidatos de Tb pelo grau-dia acumulado até o MESMO evento
 * fenológico em várias parcelas/datas. Menor CV indica maior estabilidade
 * térmica do evento. RMSE em dias é usado como critério secundário quando
 * houver previsões DAE independentes.
 *
 * A função apenas RANQUEIA candidatos; não aprova calibração automaticamente.
 */
export function evaluateBaseTemperatureCandidates(
  samples: PhenologyObservationSample[],
  candidateBaseTemperaturesC: number[],
  options?: Omit<DegreeDayOptions, "baseTemperatureC">,
): BaseTemperatureCandidateResult[] {
  const uniqueCandidates = Array.from(new Set(candidateBaseTemperaturesC))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  return uniqueCandidates
    .map((baseTemperatureC) => {
      const gddValues = samples
        .filter((sample) => sample.dailyTemperatures.length > 0)
        .map((sample) =>
          totalDegreeDays(sample.dailyTemperatures, {
            baseTemperatureC,
            method: options?.method ?? "simple_mean",
            upperTemperatureC: options?.upperTemperatureC ?? null,
          }),
        );

      const stats = summarizeThermalValues(gddValues);
      const rmse = rmseDays(samples);
      // Score preserva interpretabilidade: CV domina; RMSE apenas desempata.
      const score =
        stats.cvPct == null
          ? null
          : roundTo(stats.cvPct + (rmse == null ? 0 : rmse / 1000), 4);

      return {
        baseTemperatureC,
        ...stats,
        rmseDays: rmse,
        score,
      };
    })
    .sort((a, b) => {
      if (a.score == null && b.score == null) return a.baseTemperatureC - b.baseTemperatureC;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return a.score - b.score || a.baseTemperatureC - b.baseTemperatureC;
    });
}

export function bestBaseTemperatureCandidate(
  results: BaseTemperatureCandidateResult[],
): BaseTemperatureCandidateResult | null {
  return results.find((result) => result.score != null) ?? null;
}
