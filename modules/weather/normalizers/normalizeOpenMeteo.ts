// ============================================================================
// modules/weather/normalizers/normalizeOpenMeteo.ts
// ----------------------------------------------------------------------------
// Converte o payload bruto da Open-Meteo em DailyWeatherData / HourlyWeatherData.
//
// Regras (obrigatórias):
//   • Preserva null: se a Open-Meteo devolveu null (ou o campo simplesmente
//     não veio), o valor SEGUE null em toda a normalização.
//   • windSpeed10mMs original é preservado (nunca sobrescrito).
//   • windSpeed2mMs é derivado via adjustWindToTwoMeters (FAO-56 eq. 47).
//   • Unidades explícitas no nome do campo — nada de conversão silenciosa.
//   • Metadados de auditoria em cada registro (WeatherSourceMetadata).
//   • dataType: past_days → "observed" · dias futuros → "forecast" · janela
//     100% no passado (endpoint archive) → "observed" (dados definitivos).
// ============================================================================

import type {
  DailyWeatherData,
  HourlyWeatherData,
  WeatherDataType,
  WeatherLocation,
  WeatherSourceMetadata,
} from "@/modules/weather/types/weatherTypes";
import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";

// ── Payloads tipados (contrato oficial Open-Meteo) ─────────────────────────

export interface OpenMeteoResponseHead {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  generationtime_ms?: number;
}

export interface OpenMeteoDailyBlock {
  time?: string[];
  temperature_2m_min?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_mean?: (number | null)[];
  // Umidade — nomes reais confirmados na API (2026-08):
  relative_humidity_2m_min?: (number | null)[];
  relative_humidity_2m_max?: (number | null)[];
  relative_humidity_2m_mean?: (number | null)[];
  precipitation_sum?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
  shortwave_radiation_sum?: (number | null)[];
  wind_speed_10m_mean?: (number | null)[];
  wind_speed_10m_max?: (number | null)[];
  wind_direction_10m_dominant?: (number | null)[];
  // Pressão — API só expõe min/max diários; a média não existe como
  // agregação diária oficial (deriva-se do horário quando necessário).
  surface_pressure_min?: (number | null)[];
  surface_pressure_max?: (number | null)[];
  vapour_pressure_deficit_max?: (number | null)[];
  et0_fao_evapotranspiration?: (number | null)[];
}

export interface OpenMeteoHourlyBlock {
  time?: string[];
  temperature_2m?: (number | null)[];
  relative_humidity_2m?: (number | null)[];
  precipitation?: (number | null)[];
  precipitation_probability?: (number | null)[];
  shortwave_radiation?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  surface_pressure?: (number | null)[];
  vapour_pressure_deficit?: (number | null)[];
  et0_fao_evapotranspiration?: (number | null)[];
}

export interface OpenMeteoDailyPayload extends OpenMeteoResponseHead {
  daily?: OpenMeteoDailyBlock;
  daily_units?: Record<string, string>;
}

export interface OpenMeteoHourlyPayload extends OpenMeteoResponseHead {
  hourly?: OpenMeteoHourlyBlock;
  hourly_units?: Record<string, string>;
}

// ── Utilitários internos ───────────────────────────────────────────────────

function num(a: (number | null)[] | undefined, i: number): number | null {
  if (!a) return null;
  const v = a[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** hPa → kPa preservando null. Não usa a função central para evitar
 *  ciclo (weatherUnits importa nada; aqui não faria diferença) — mantida
 *  local para clareza. */
function hpaToKpaLocal(v: number | null): number | null {
  return v === null ? null : v / 10;
}

function metadataFor(
  provider: "open_meteo",
  dataType: WeatherDataType,
  validAt: string,
  fetchedAt: string,
  requestUrl: string,
  head: OpenMeteoResponseHead,
  missingFields: string[],
  warnings: string[],
): WeatherSourceMetadata {
  return {
    provider,
    modelName: null, // Open-Meteo não expõe modelo no payload (auto best-match)
    dataType,
    forecastIssuedAt: dataType === "forecast" ? fetchedAt : null,
    validAt,
    fetchedAt,
    sourceReference: requestUrl, // já sem chave — Open-Meteo não usa API key
    qualityStatus: missingFields.length === 0 ? "complete" : "partial",
    missingFields,
    warnings: [
      ...warnings,
      head.timezone
        ? `Timezone da resposta: ${head.timezone}${head.timezone_abbreviation ? ` (${head.timezone_abbreviation})` : ""}.`
        : "Timezone não retornado pela Open-Meteo.",
      head.elevation !== undefined
        ? `Elevação da grade: ${head.elevation} m.`
        : "Elevação não retornada pela Open-Meteo.",
      head.generationtime_ms !== undefined
        ? `generationTimeMs=${head.generationtime_ms}`
        : "generationtime_ms não retornado.",
    ],
  };
}

function computeMissingFields(day: DailyWeatherData): string[] {
  const missing: string[] = [];
  const check = (k: keyof DailyWeatherData): void => {
    const v = day[k];
    if (v === null) missing.push(k as string);
  };
  check("temperatureMinC");
  check("temperatureMaxC");
  check("temperatureMeanC");
  check("relativeHumidityMinPct");
  check("relativeHumidityMaxPct");
  check("relativeHumidityMeanPct");
  check("precipitationMm");
  check("precipitationProbabilityPct");
  check("windSpeed10mMs");
  check("windSpeed2mMs");
  check("windDirectionDeg");
  check("solarRadiationMjM2Day");
  check("surfacePressureKpa");
  check("vapourPressureDeficitKpa");
  check("providerReferenceEtoMm");
  return missing;
}

// ── Diário ─────────────────────────────────────────────────────────────────

export interface NormalizeDailyInput {
  payload: OpenMeteoDailyPayload;
  location: WeatherLocation;
  requestUrl: string;
  fetchedAt: string;
}

export function normalizeOpenMeteoDaily(
  input: NormalizeDailyInput,
): DailyWeatherData[] {
  const { payload, location, requestUrl, fetchedAt } = input;
  const daily = payload.daily;
  if (!daily?.time || daily.time.length === 0) return [];

  const todayLocal = new Date().toISOString().slice(0, 10);
  const out: DailyWeatherData[] = [];

  for (let i = 0; i < daily.time.length; i += 1) {
    const date = daily.time[i];
    const wind10 = num(daily.wind_speed_10m_mean, i);
    const warnings: string[] = [];
    let wind2: number | null = null;
    if (wind10 !== null) {
      wind2 = adjustWindToTwoMeters(wind10, 10);
      warnings.push("windSpeed2mMs derivado de windSpeed10mMs (FAO-56 eq. 47).");
    }
    // dataType: passado→observed · hoje→observed · futuro→forecast
    const dataType: WeatherDataType = date > todayLocal ? "forecast" : "observed";
    // validAt: meio-dia UTC do dia (para o consumidor decidir o intervalo).
    const validAt = `${date}T12:00:00Z`;

    // Pressão diária: Open-Meteo entrega min/max em hPa (sem _mean oficial).
    // Como estimativa razoável para a "média do dia", tomamos (min+max)/2.
    // Se ambos ausentes, resultado é null (não vira zero).
    const pMinHpa = num(daily.surface_pressure_min, i);
    const pMaxHpa = num(daily.surface_pressure_max, i);
    const meanHpa =
      pMinHpa !== null && pMaxHpa !== null
        ? (pMinHpa + pMaxHpa) / 2
        : null;
    const surfacePressureKpa = hpaToKpaLocal(meanHpa);
    if (meanHpa !== null && (pMinHpa === null || pMaxHpa === null)) {
      warnings.push("surface_pressure derivado apenas de min ou max.");
    }
    if (meanHpa !== null) {
      warnings.push("surface_pressure diário derivado de (min+max)/2 (sem _mean oficial).");
    }

    const day: DailyWeatherData = {
      location,
      date,
      temperatureMinC: num(daily.temperature_2m_min, i),
      temperatureMaxC: num(daily.temperature_2m_max, i),
      temperatureMeanC: num(daily.temperature_2m_mean, i),
      relativeHumidityMinPct: num(daily.relative_humidity_2m_min, i),
      relativeHumidityMaxPct: num(daily.relative_humidity_2m_max, i),
      relativeHumidityMeanPct: num(daily.relative_humidity_2m_mean, i),
      precipitationMm: num(daily.precipitation_sum, i),
      precipitationProbabilityPct: num(daily.precipitation_probability_max, i),
      windSpeed2mMs: wind2,
      windSpeed10mMs: wind10,
      windDirectionDeg: num(daily.wind_direction_10m_dominant, i),
      solarRadiationMjM2Day: num(daily.shortwave_radiation_sum, i),
      surfacePressureKpa,
      vapourPressureDeficitKpa: num(daily.vapour_pressure_deficit_max, i),
      providerReferenceEtoMm: num(daily.et0_fao_evapotranspiration, i),
      internallyCalculatedEtoMm: null,
      metadata: metadataFor(
        "open_meteo",
        dataType,
        validAt,
        fetchedAt,
        requestUrl,
        payload,
        [],
        warnings,
      ),
    };

    // Recalcula missingFields com todos os campos já preenchidos
    day.metadata.missingFields = computeMissingFields(day);
    day.metadata.qualityStatus =
      day.metadata.missingFields.length === 0 ? "complete" : "partial";

    out.push(day);
  }

  return out;
}

// ── Horário ────────────────────────────────────────────────────────────────

export interface NormalizeHourlyInput {
  payload: OpenMeteoHourlyPayload;
  location: WeatherLocation;
  requestUrl: string;
  fetchedAt: string;
}

export function normalizeOpenMeteoHourly(
  input: NormalizeHourlyInput,
): HourlyWeatherData[] {
  const { payload, location, requestUrl, fetchedAt } = input;
  const hourly = payload.hourly;
  if (!hourly?.time || hourly.time.length === 0) return [];

  // Guarda de comprimento: se algum array vier com length diferente de time,
  // registramos warning e usamos null para os índices excedentes.
  const nTime = hourly.time.length;
  const uneven: string[] = [];
  const lens: Array<[string, number | undefined]> = [
    ["temperature_2m", hourly.temperature_2m?.length],
    ["relative_humidity_2m", hourly.relative_humidity_2m?.length],
    ["precipitation", hourly.precipitation?.length],
    ["shortwave_radiation", hourly.shortwave_radiation?.length],
    ["wind_speed_10m", hourly.wind_speed_10m?.length],
    ["wind_direction_10m", hourly.wind_direction_10m?.length],
    ["surface_pressure", hourly.surface_pressure?.length],
    ["vapour_pressure_deficit", hourly.vapour_pressure_deficit?.length],
    ["et0_fao_evapotranspiration", hourly.et0_fao_evapotranspiration?.length],
  ];
  for (const [k, l] of lens) {
    if (l !== undefined && l !== nTime) uneven.push(`${k} (len=${l})`);
  }

  const nowIso = new Date().toISOString();
  const out: HourlyWeatherData[] = [];

  for (let i = 0; i < nTime; i += 1) {
    const validAt = hourly.time[i]; // já no timezone da localização
    const warnings: string[] = [];
    if (uneven.length > 0) {
      warnings.push(
        `Arrays horários com tamanho ≠ time (${uneven.join(", ")}).`,
      );
    }
    const wind10 = num(hourly.wind_speed_10m, i);
    let wind2: number | null = null;
    if (wind10 !== null) {
      wind2 = adjustWindToTwoMeters(wind10, 10);
    }
    const dataType: WeatherDataType =
      new Date(validAt).getTime() > new Date(nowIso).getTime()
        ? "forecast"
        : "observed";

    const hour: HourlyWeatherData = {
      location,
      validAt,
      temperatureC: num(hourly.temperature_2m, i),
      relativeHumidityPct: num(hourly.relative_humidity_2m, i),
      precipitationMm: num(hourly.precipitation, i),
      precipitationProbabilityPct: num(hourly.precipitation_probability, i),
      windSpeed2mMs: wind2,
      windSpeed10mMs: wind10,
      windDirectionDeg: num(hourly.wind_direction_10m, i),
      // Open-Meteo horária: shortwave_radiation é W/m² (fluxo médio da hora).
      solarRadiationWm2: num(hourly.shortwave_radiation, i),
      surfacePressureKpa: hpaToKpaLocal(num(hourly.surface_pressure, i)),
      vapourPressureDeficitKpa: num(hourly.vapour_pressure_deficit, i),
      providerReferenceEtoMm: num(hourly.et0_fao_evapotranspiration, i),
      metadata: metadataFor(
        "open_meteo",
        dataType,
        validAt,
        fetchedAt,
        requestUrl,
        payload,
        [],
        warnings,
      ),
    };
    out.push(hour);
  }

  return out;
}

// ── Agregações horárias → diário (utilitário para completude/derivação) ───

export interface HourlyAggregationSummary {
  expectedHours: number;
  validHours: number;
  completenessPct: number;
  qualityFromCompleteness: "complete" | "partial" | "missing";
}

/** Média circular de direções em graus, ponderada pela velocidade. */
export function circularMeanDirection(
  directions: (number | null)[],
  weights: (number | null)[],
): number | null {
  let sumSin = 0;
  let sumCos = 0;
  let usedWeight = 0;
  for (let i = 0; i < directions.length; i += 1) {
    const d = directions[i];
    const w = weights[i];
    if (d === null || w === null || !Number.isFinite(d) || !Number.isFinite(w) || w <= 0) continue;
    const rad = (d * Math.PI) / 180;
    sumSin += Math.sin(rad) * w;
    sumCos += Math.cos(rad) * w;
    usedWeight += w;
  }
  if (usedWeight <= 0) return null;
  const meanRad = Math.atan2(sumSin, sumCos);
  const deg = (meanRad * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function summarizeCompleteness(
  expectedHours: number,
  validValues: number,
): HourlyAggregationSummary {
  const pct = expectedHours > 0 ? (validValues / expectedHours) * 100 : 0;
  const q: HourlyAggregationSummary["qualityFromCompleteness"] =
    pct >= 90 ? "complete" : pct >= 70 ? "partial" : "missing";
  return {
    expectedHours,
    validHours: validValues,
    completenessPct: pct,
    qualityFromCompleteness: q,
  };
}
