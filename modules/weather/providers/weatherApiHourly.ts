import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export const WEATHERAPI_FORECAST_URL = "https://api.weatherapi.com/v1/forecast.json";

export interface WeatherApiHour {
  time_epoch?: number;
  time?: string;
  temp_c?: number | null;
  humidity?: number | null;
  wind_kph?: number | null;
  wind_degree?: number | null;
  pressure_mb?: number | null;
  precip_mm?: number | null;
  dewpoint_c?: number | null;
  short_rad?: number | null;
}

export interface WeatherApiForecastPayload {
  location?: {
    name?: string;
    region?: string;
    country?: string;
    lat?: number;
    lon?: number;
    tz_id?: string;
    localtime_epoch?: number;
  };
  forecast?: { forecastday?: Array<{ date?: string; hour?: WeatherApiHour[] }> };
}

export interface WeatherApiHourlyFetchResult {
  payload: WeatherApiForecastPayload;
  requestUrl: string;
  requestedAt: string;
  finishedAt: string;
  httpStatus: number;
}

function weatherApiKey(): string {
  const value = (process.env.WEATHERAPI_API_KEY ?? "").trim();
  if (!value) throw new Error("WEATHERAPI_API_KEY nao configurada");
  return value;
}

export const WEATHERAPI_MAX_RESPONSE_DISTANCE_KM = 5;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function weatherApiResponseDistanceKm(
  location: WeatherLocation,
  payload: WeatherApiForecastPayload,
): number | null {
  const responseLatitude = payload.location?.lat;
  const responseLongitude = payload.location?.lon;
  if (
    typeof responseLatitude !== "number"
    || !Number.isFinite(responseLatitude)
    || typeof responseLongitude !== "number"
    || !Number.isFinite(responseLongitude)
  ) {
    return null;
  }

  const earthRadiusKm = 6_371;
  const latitudeDelta = toRadians(responseLatitude - location.latitude);
  const longitudeDelta = toRadians(responseLongitude - location.longitude);
  const requestedLatitude = toRadians(location.latitude);
  const returnedLatitude = toRadians(responseLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(requestedLatitude)
    * Math.cos(returnedLatitude)
    * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function assertWeatherApiResponseLocation(
  location: WeatherLocation,
  payload: WeatherApiForecastPayload,
  maxDistanceKm = WEATHERAPI_MAX_RESPONSE_DISTANCE_KM,
): number {
  const distanceKm = weatherApiResponseDistanceKm(location, payload);
  if (distanceKm === null) {
    throw new Error("WeatherAPI nao informou as coordenadas da resposta");
  }
  if (distanceKm > maxDistanceKm) {
    throw new Error(
      `WeatherAPI respondeu para um ponto ${distanceKm.toFixed(1)} km distante da estacao virtual`,
    );
  }
  return distanceKm;
}

export function redactWeatherApiKey(url: string): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("key")) parsed.searchParams.set("key", "***");
  return parsed.toString();
}

export function buildWeatherApiHourlyUrl(location: WeatherLocation, days = 3): string {
  const url = new URL(WEATHERAPI_FORECAST_URL);
  url.searchParams.set("key", weatherApiKey());
  url.searchParams.set("q", `${location.latitude},${location.longitude}`);
  url.searchParams.set("days", String(Math.max(1, Math.min(days, 14))));
  url.searchParams.set("aqi", "no");
  url.searchParams.set("alerts", "no");
  return url.toString();
}

export async function fetchWeatherApiHourlyRaw(
  location: WeatherLocation,
  options: { timeoutMs?: number; days?: number } = {},
): Promise<WeatherApiHourlyFetchResult> {
  const requestUrlWithKey = buildWeatherApiHourlyUrl(location, options.days ?? 3);
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(requestUrlWithKey, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const finishedAt = new Date().toISOString();
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`WeatherAPI HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as WeatherApiForecastPayload;
    assertWeatherApiResponseLocation(location, payload);
    const hours = payload.forecast?.forecastday?.flatMap((d) => d.hour ?? []) ?? [];
    if (hours.length === 0) throw new Error("WeatherAPI retornou payload sem dados horarios");
    return {
      payload,
      requestUrl: redactWeatherApiKey(requestUrlWithKey),
      requestedAt,
      finishedAt,
      httpStatus: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}
