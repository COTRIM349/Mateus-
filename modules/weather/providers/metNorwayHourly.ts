import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export const MET_NORWAY_LOCATIONFORECAST_URL =
  "https://api.met.no/weatherapi/locationforecast/2.0/compact";

export interface MetNorwayInstantDetails {
  air_temperature?: number | null;
  dew_point_temperature?: number | null;
  relative_humidity?: number | null;
  wind_speed?: number | null;
  wind_from_direction?: number | null;
  air_pressure_at_sea_level?: number | null;
}

export interface MetNorwayTimeSeriesItem {
  time?: string;
  data?: {
    instant?: { details?: MetNorwayInstantDetails };
    next_1_hours?: { details?: { precipitation_amount?: number | null } };
  };
}

export interface MetNorwayCompactPayload {
  type?: string;
  geometry?: {
    type?: string;
    coordinates?: [number, number, number?];
  };
  properties?: {
    meta?: {
      updated_at?: string;
      units?: Record<string, string>;
    };
    timeseries?: MetNorwayTimeSeriesItem[];
  };
}

export interface MetNorwayHourlyFetchResult {
  payload: MetNorwayCompactPayload;
  requestUrl: string;
  requestedAt: string;
  finishedAt: string;
  httpStatus: number;
}

export function metNorwayUserAgent(): string {
  const configured = (process.env.MET_NORWAY_USER_AGENT ?? "").trim();
  return configured || "CotrimIrrigacaoPro/0.1 github.com/COTRIM349/Mateus-";
}

function roundedCoordinate(value: number): string {
  return value.toFixed(4);
}

export function buildMetNorwayHourlyUrl(location: WeatherLocation): string {
  const url = new URL(MET_NORWAY_LOCATIONFORECAST_URL);
  url.searchParams.set("lat", roundedCoordinate(location.latitude));
  url.searchParams.set("lon", roundedCoordinate(location.longitude));
  if (location.elevationM !== null && Number.isFinite(location.elevationM)) {
    url.searchParams.set("altitude", String(Math.round(location.elevationM)));
  }
  return url.toString();
}

export async function fetchMetNorwayHourlyRaw(
  location: WeatherLocation,
  options: { timeoutMs?: number } = {},
): Promise<MetNorwayHourlyFetchResult> {
  const requestUrl = buildMetNorwayHourlyUrl(location);
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": metNorwayUserAgent(),
      },
      cache: "no-store",
    });
    const finishedAt = new Date().toISOString();

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`MET Norway HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as MetNorwayCompactPayload;
    if (!payload.properties?.timeseries?.length) {
      throw new Error("MET Norway retornou payload sem properties.timeseries");
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
      throw new Error("MET Norway timeout na consulta Locationforecast");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
