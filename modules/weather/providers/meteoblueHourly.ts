import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export const METEOBLUE_HOURLY_BASE_URL = "https://my.meteoblue.com/packages/basic-1h";

export interface MeteoblueHourlyBlock {
  time?: string[];
  temperature?: (number | null)[];
  relativehumidity?: (number | null)[];
  windspeed?: (number | null)[];
  winddirection?: (number | null)[];
  precipitation?: (number | null)[];
  sealevelpressure?: (number | null)[];
}

export interface MeteoblueHourlyPayload {
  metadata?: {
    latitude?: number;
    longitude?: number;
    height?: number;
    timezone_abbrevation?: string;
    utc_timeoffset?: number;
    modelrun_updatetime_utc?: string;
    modelrun_utc?: string;
    name?: string;
  };
  data_1h?: MeteoblueHourlyBlock;
}

export interface MeteoblueHourlyFetchResult {
  payload: MeteoblueHourlyPayload;
  requestUrl: string;
  requestedAt: string;
  finishedAt: string;
  httpStatus: number;
}

function apiKey(): string {
  const key = (process.env.METEOBLUE_API_KEY ?? "").trim();
  if (!key) throw new Error("METEOBLUE_API_KEY nao configurada");
  return key;
}

export function redactMeteoblueKey(url: string): string {
  return url.replace(/([?&]apikey=)[^&]+/i, "$1***");
}

export function buildMeteoblueHourlyUrl(location: WeatherLocation): string {
  const url = new URL(METEOBLUE_HOURLY_BASE_URL);
  url.searchParams.set("lat", String(location.latitude));
  url.searchParams.set("lon", String(location.longitude));
  url.searchParams.set("apikey", apiKey());
  url.searchParams.set("format", "json");
  url.searchParams.set("tz", "UTC");
  url.searchParams.set("temperature", "C");
  url.searchParams.set("windspeed", "ms-1");
  url.searchParams.set("precipitationamount", "mm");
  return url.toString();
}

export async function fetchMeteoblueHourlyRaw(
  location: WeatherLocation,
  options: { timeoutMs?: number } = {},
): Promise<MeteoblueHourlyFetchResult> {
  const requestUrlWithKey = buildMeteoblueHourlyUrl(location);
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
      throw new Error(`meteoblue HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    const payload = (await response.json()) as MeteoblueHourlyPayload;
    if (!payload.data_1h?.time?.length) {
      throw new Error("meteoblue retornou payload sem data_1h.time");
    }
    return {
      payload,
      requestUrl: redactMeteoblueKey(requestUrlWithKey),
      requestedAt,
      finishedAt,
      httpStatus: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("meteoblue timeout na consulta horaria");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
