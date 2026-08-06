// ============================================================================
// modules/weather/quality/weatherQuality.ts
// ----------------------------------------------------------------------------
// Classificador central da qualidade de um registro climático diário.
//
// Regras (obrigatórias):
//   • NUNCA apaga registro suspeito. Apenas classifica.
//   • Preserva null: um campo ausente entra em missingFields, não é zerado.
//   • Distingue "essencial" (definido pelo caller) de "não essencial".
//   • Convive com validateWeatherReading (weather.service.ts) sem substituí-lo.
//
// Ordem de precedência do status retornado (do mais grave para o mais leve):
//   invalid  > missing (essencial)  > stale  > suspicious  > partial  > complete
// ============================================================================

import type {
  DailyWeatherData,
  WeatherQualityStatus,
} from "@/modules/weather/types/weatherTypes";

/** Faixas fisicamente plausíveis para o clima do Cerrado (ajustáveis). */
export interface PhysicalRanges {
  temperatureC: { min: number; max: number };
  humidityPct: { min: number; max: number };
  precipitationMm: { min: number; max: number };
  windSpeedMs: { min: number; max: number };
  radiationMjM2Day: { min: number; max: number };
  pressureKpa: { min: number; max: number };
  etoMmDay: { min: number; max: number };
}

export const DEFAULT_PHYSICAL_RANGES: PhysicalRanges = {
  temperatureC: { min: -15, max: 55 },
  humidityPct: { min: 0, max: 100 },
  precipitationMm: { min: 0, max: 500 },
  windSpeedMs: { min: 0, max: 40 },
  radiationMjM2Day: { min: 0, max: 45 },
  pressureKpa: { min: 60, max: 110 },
  etoMmDay: { min: 0, max: 20 },
};

export interface QualityAssessmentOptions {
  /**
   * Nomes de campos considerados essenciais para o uso pretendido do dado.
   * Se algum deles estiver ausente/null, o status vira "missing".
   * Se ficarem apenas campos NÃO essenciais faltando, status vira "partial".
   *
   * Ex.: para calcular ETo FAO-56 completo, os essenciais são:
   *   temperatureMinC, temperatureMaxC, windSpeed2mMs, solarRadiationMjM2Day
   *   e (relativeHumidityMeanPct OU {Min+Max}).
   */
  essentialFields: (keyof DailyWeatherData)[];
  ranges?: PhysicalRanges;
  /**
   * Instante "agora" — permite testes determinísticos. Se omitido usa Date.now().
   */
  now?: Date;
  /**
   * Idade máxima considerada "fresca" para o dado. Acima disso o status
   * vira "stale". Default: 48h.
   */
  staleAfterMs?: number;
}

export interface DailyWeatherQualityReport {
  qualityStatus: WeatherQualityStatus;
  missingFields: string[];
  warnings: string[];
}

const NUMERIC_FIELDS: (keyof DailyWeatherData)[] = [
  "temperatureMinC",
  "temperatureMaxC",
  "temperatureMeanC",
  "relativeHumidityMinPct",
  "relativeHumidityMaxPct",
  "relativeHumidityMeanPct",
  "precipitationMm",
  "precipitationProbabilityPct",
  "windSpeed2mMs",
  "windSpeed10mMs",
  "windDirectionDeg",
  "solarRadiationMjM2Day",
  "surfacePressureKpa",
  "vapourPressureDeficitKpa",
  "providerReferenceEtoMm",
  "internallyCalculatedEtoMm",
];

function getNumeric(day: DailyWeatherData, field: keyof DailyWeatherData): number | null {
  const v = day[field];
  return typeof v === "number" ? v : null;
}

/**
 * Avalia a qualidade de um registro diário. Nunca modifica o objeto de
 * entrada.
 */
export function assessDailyWeatherQuality(
  day: DailyWeatherData,
  options: QualityAssessmentOptions,
): DailyWeatherQualityReport {
  const ranges = options.ranges ?? DEFAULT_PHYSICAL_RANGES;
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? 48 * 60 * 60 * 1000;

  const missingFields: string[] = [];
  const warnings: string[] = [];
  let hasInvalid = false;
  let hasSuspicious = false;

  // 1. Ausências (todos os campos numéricos)
  for (const field of NUMERIC_FIELDS) {
    if (getNumeric(day, field) === null) missingFields.push(field);
  }

  // 2. Faixas físicas — só valida quando presente
  const check = (
    field: keyof DailyWeatherData,
    range: { min: number; max: number },
    label: string,
  ): void => {
    const v = getNumeric(day, field);
    if (v === null) return;
    if (v < range.min || v > range.max) {
      hasInvalid = true;
      warnings.push(`${label} fora do intervalo físico (${v}).`);
    }
  };
  check("temperatureMinC", ranges.temperatureC, "temperatureMinC");
  check("temperatureMaxC", ranges.temperatureC, "temperatureMaxC");
  check("temperatureMeanC", ranges.temperatureC, "temperatureMeanC");
  check("relativeHumidityMinPct", ranges.humidityPct, "relativeHumidityMinPct");
  check("relativeHumidityMaxPct", ranges.humidityPct, "relativeHumidityMaxPct");
  check("relativeHumidityMeanPct", ranges.humidityPct, "relativeHumidityMeanPct");
  check("precipitationMm", ranges.precipitationMm, "precipitationMm");
  check("windSpeed2mMs", ranges.windSpeedMs, "windSpeed2mMs");
  check("windSpeed10mMs", ranges.windSpeedMs, "windSpeed10mMs");
  check("solarRadiationMjM2Day", ranges.radiationMjM2Day, "solarRadiationMjM2Day");
  check("surfacePressureKpa", ranges.pressureKpa, "surfacePressureKpa");
  check("providerReferenceEtoMm", ranges.etoMmDay, "providerReferenceEtoMm");
  check("internallyCalculatedEtoMm", ranges.etoMmDay, "internallyCalculatedEtoMm");

  // 3. Coerência interna (min/max)
  const tMin = getNumeric(day, "temperatureMinC");
  const tMax = getNumeric(day, "temperatureMaxC");
  const tMean = getNumeric(day, "temperatureMeanC");
  if (tMin !== null && tMax !== null && tMin > tMax) {
    hasInvalid = true;
    warnings.push("temperatureMinC maior que temperatureMaxC.");
  }
  if (tMin !== null && tMax !== null && tMean !== null && (tMean < tMin || tMean > tMax)) {
    hasSuspicious = true;
    warnings.push("temperatureMeanC fora do intervalo min-max.");
  }

  const rhMin = getNumeric(day, "relativeHumidityMinPct");
  const rhMax = getNumeric(day, "relativeHumidityMaxPct");
  if (rhMin !== null && rhMax !== null && rhMin > rhMax) {
    hasInvalid = true;
    warnings.push("relativeHumidityMinPct maior que relativeHumidityMaxPct.");
  }

  // 4. Timestamps
  const validAtDate = new Date(day.metadata.validAt);
  const fetchedAtDate = new Date(day.metadata.fetchedAt);
  if (Number.isNaN(validAtDate.getTime())) {
    hasInvalid = true;
    warnings.push("metadata.validAt inválido.");
  }
  if (Number.isNaN(fetchedAtDate.getTime())) {
    hasInvalid = true;
    warnings.push("metadata.fetchedAt inválido.");
  }
  // Dado observado com validAt futuro é fisicamente impossível.
  if (
    !Number.isNaN(validAtDate.getTime()) &&
    day.metadata.dataType === "observed" &&
    validAtDate.getTime() > now.getTime() + 60 * 60 * 1000 // tolerância 1h fuso
  ) {
    hasInvalid = true;
    warnings.push("metadata.validAt no futuro para dataType='observed'.");
  }

  // 5. Freshness — só faz sentido para observação; forecast é intrínseco de "no futuro".
  let isStale = false;
  if (
    !Number.isNaN(fetchedAtDate.getTime()) &&
    day.metadata.dataType !== "forecast"
  ) {
    const ageMs = now.getTime() - fetchedAtDate.getTime();
    if (ageMs > staleAfterMs) {
      isStale = true;
      warnings.push(`Dado antigo: ${Math.round(ageMs / 3600000)}h desde fetchedAt.`);
    }
  }

  // 6. Essenciais
  const missingEssential = options.essentialFields.filter(
    (f) => getNumeric(day, f) === null,
  );

  // 7. Precedência
  let status: WeatherQualityStatus;
  if (hasInvalid) status = "invalid";
  else if (missingEssential.length > 0) status = "missing";
  else if (isStale) status = "stale";
  else if (hasSuspicious) status = "suspicious";
  else if (missingFields.length > 0) status = "partial";
  else status = "complete";

  return { qualityStatus: status, missingFields, warnings };
}
