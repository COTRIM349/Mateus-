import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";
import type { OpenMeteoMinutely15Payload } from "@/modules/weather/normalizers/normalizeOpenMeteo30Min";

export const OPEN_METEO_30M_BASE_URL = "https://api.open-meteo.com/v1/forecast";

export const OPEN_METEO_15M_VARIABLES = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "shortwave_radiation",
  "wind_speed_10m",
  "wind_direction_10m",
  "surface_pressure",
  "vapour_pressure_deficit",
] as const;

export interface OpenMeteo30MinFetchOptions {
  /** 15-min steps anteriores. 8 = 2 horas. */
  pastSteps15Min?: number;
  /** 15-min steps futuros. 96 = 24 horas. */
  forecastSteps15Min?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface OpenMeteo30MinRawResult {
  payload: OpenMeteoMinutely15Payload;
  requestUrl: string;
  requestedAt: string;
  finishedAt: string;
  httpStatus: number;
}

export function buildOpenMeteo30MinUrl(
  location: WeatherLocation,
  options: OpenMeteo30MinFetchOptions = {},
): string {
  const url = new URL(options.baseUrl ?? OPEN_METEO_30M_BASE_URL);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  // UTC evita ambiguidade na conversao de timestamps. A data local e
  // reconstruida depois com o timezone IANA cadastrado na estacao.
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("minutely_15", OPEN_METEO_15M_VARIABLES.join(","));
  url.searchParams.set("past_minutely_15", String(options.pastSteps15Min ?? 8));
  url.searchParams.set("forecast_minutely_15", String(options.forecastSteps15Min ?? 96));
  return url.toString();
}

export async function fetchOpenMeteo30MinRaw(
  location: WeatherLocation,
  options: OpenMeteo30MinFetchOptions = {},
): Promise<OpenMeteo30MinRawResult> {
  const requestUrl = buildOpenMeteo30MinUrl(location, options);
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const finishedAt = new Date().toISOString();

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Open-Meteo HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as OpenMeteoMinutely15Payload;
    if (!payload.minutely_15?.time?.length) {
      throw new Error("Open-Meteo retornou payload sem minutely_15.time");
    }

    return {
      payload,
      requestUrl,
      requestedAt,
      finishedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Open-Meteo timeout na consulta sub-horaria");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
