// ============================================================================
// Provider Open-Meteo (https://open-meteo.com/)
// ----------------------------------------------------------------------------
// Não persiste nada. Apenas busca, normaliza e devolve dados diários prontos
// para o serviço de ingestão decidir o que fazer.
//
// Licença dos dados: CC-BY 4.0. A atribuição "Weather data by Open-Meteo.com"
// deve aparecer em telas e relatórios que exibem esses dados.
// ============================================================================

export const OPEN_METEO_PROVIDER = "open_meteo";
export const OPEN_METEO_ATTRIBUTION = "Weather data by Open-Meteo.com (CC-BY 4.0)";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

/**
 * Parâmetro `daily` compartilhado por observações e forecast.
 * A ordem afeta a ordem das colunas na resposta.
 */
const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "temperature_2m_mean",
  "relative_humidity_2m_mean",
  "wind_speed_10m_mean",
  "shortwave_radiation_sum",
  "precipitation_sum",
  "precipitation_probability_max",
  "et0_fao_evapotranspiration",
].join(",");

/** Dado climático diário normalizado para as unidades usadas pela Cotrim. */
export interface OpenMeteoDaily {
  date: string;                    // YYYY-MM-DD
  tempMax: number | null;          // °C
  tempMin: number | null;          // °C
  tempMean: number | null;         // °C
  humidity: number | null;         // %
  windSpeed2m: number | null;      // m/s (convertido de 10m para 2m)
  solarRadiation: number | null;   // MJ/m²/dia
  precipitation: number | null;    // mm
  precipitationProbability: number | null; // % (0..100), pode ser null p/ observado
  et0Source: number | null;        // mm/dia
}

/**
 * Converte vento a 10 m para vento a 2 m usando a equação FAO-56 eq. 47.
 * u2 = u10 × 4.87 / ln(67.8 × z − 5.42), z = 10 → fator ≈ 0.7480.
 */
export function convertWind10mTo2m(wind10m: number): number {
  const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
  return wind10m * factor;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        throw new Error(`Open-Meteo HTTP ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      // backoff simples: 500ms, 1500ms
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (1 + i * 2)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface OpenMeteoDailyPayload {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  utc_offset_seconds?: number;
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    temperature_2m_mean?: (number | null)[];
    relative_humidity_2m_mean?: (number | null)[];
    wind_speed_10m_mean?: (number | null)[];
    shortwave_radiation_sum?: (number | null)[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    et0_fao_evapotranspiration?: (number | null)[];
  };
}

/** Contexto retornado junto com os dados diários — usado para auditoria. */
export interface OpenMeteoContext {
  requestUrl: string;
  requestLatitude: number;
  requestLongitude: number;
  requestTimezone: string;
  responseLatitude: number | null;
  responseLongitude: number | null;
  elevation: number | null;
  utcOffsetSeconds: number | null;
}

export interface OpenMeteoFetchResult {
  context: OpenMeteoContext;
  daily: OpenMeteoDaily[];
}

export interface OpenMeteoForecastResult extends OpenMeteoFetchResult {
  issuedAt: string;
}

function parseDaily(payload: OpenMeteoDailyPayload): OpenMeteoDaily[] {
  const d = payload.daily;
  if (!d?.time) return [];
  const out: OpenMeteoDaily[] = [];
  for (let i = 0; i < d.time.length; i += 1) {
    const wind10 = d.wind_speed_10m_mean?.[i] ?? null;
    out.push({
      date: d.time[i],
      tempMax: d.temperature_2m_max?.[i] ?? null,
      tempMin: d.temperature_2m_min?.[i] ?? null,
      tempMean: d.temperature_2m_mean?.[i] ?? null,
      humidity: d.relative_humidity_2m_mean?.[i] ?? null,
      windSpeed2m: wind10 == null ? null : convertWind10mTo2m(wind10),
      solarRadiation: d.shortwave_radiation_sum?.[i] ?? null,
      precipitation: d.precipitation_sum?.[i] ?? null,
      precipitationProbability: d.precipitation_probability_max?.[i] ?? null,
      et0Source: d.et0_fao_evapotranspiration?.[i] ?? null,
    });
  }
  return out;
}

/**
 * Busca observações diárias (dia atual e passado até 92 dias) no endpoint de
 * forecast, que também expõe dados observados recentes. Para janelas maiores
 * usar `fetchArchive`.
 */
export async function fetchRecentObservations(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  pastDays: number;   // 1..92
}): Promise<OpenMeteoFetchResult> {
  const pastDays = Math.max(1, Math.min(params.pastDays, 92));
  const qs = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    daily: DAILY_VARS,
    wind_speed_unit: "ms",
    timezone: params.timezone,
    past_days: String(pastDays),
    forecast_days: "1",
  });
  const url = `${FORECAST_URL}?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as OpenMeteoDailyPayload;
  return {
    context: buildContext(url, params, payload),
    daily: parseDaily(payload),
  };
}

function buildContext(
  url: string,
  req: { latitude: number; longitude: number; timezone: string },
  payload: OpenMeteoDailyPayload,
): OpenMeteoContext {
  return {
    requestUrl: url,
    requestLatitude: req.latitude,
    requestLongitude: req.longitude,
    requestTimezone: req.timezone,
    responseLatitude: payload.latitude ?? null,
    responseLongitude: payload.longitude ?? null,
    elevation: payload.elevation ?? null,
    utcOffsetSeconds: payload.utc_offset_seconds ?? null,
  };
}

/**
 * Busca dados históricos entre `startDate` e `endDate` (inclusive) no endpoint
 * de arquivo. Latência típica: dados definitivos com ~5 dias de atraso.
 */
export async function fetchArchive(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}): Promise<OpenMeteoFetchResult> {
  const qs = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    daily: DAILY_VARS,
    wind_speed_unit: "ms",
    timezone: params.timezone,
    start_date: params.startDate,
    end_date: params.endDate,
  });
  const url = `${ARCHIVE_URL}?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as OpenMeteoDailyPayload;
  return {
    context: buildContext(url, params, payload),
    daily: parseDaily(payload),
  };
}

/**
 * Busca previsão para os próximos `days` dias (1..16).
 */
export async function fetchForecast(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  days: number;
}): Promise<OpenMeteoForecastResult> {
  const days = Math.max(1, Math.min(params.days, 16));
  const qs = new URLSearchParams({
    latitude: String(params.latitude),
    longitude: String(params.longitude),
    daily: DAILY_VARS,
    wind_speed_unit: "ms",
    timezone: params.timezone,
    forecast_days: String(days),
  });
  const url = `${FORECAST_URL}?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as OpenMeteoDailyPayload;
  return {
    issuedAt: new Date().toISOString(),
    context: buildContext(url, params, payload),
    daily: parseDaily(payload),
  };
}
