import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export const NASA_POWER_DAILY_URL =
  "https://power.larc.nasa.gov/api/temporal/daily/point";

const PARAMETERS = [
  "T2M",
  "RH2M",
  "PRECTOTCORR",
  "WS10M",
  "PS",
  "ALLSKY_SFC_SW_DWN",
] as const;

type NasaPowerParameter = typeof PARAMETERS[number];

export interface NasaPowerDailyPayload {
  properties?: {
    parameter?: Partial<Record<NasaPowerParameter, Record<string, unknown>>>;
  };
  parameters?: Partial<Record<NasaPowerParameter, { units?: string; longname?: string }>>;
}

export interface NasaPowerDailyReference {
  status: "available" | "stale" | "unavailable";
  observedAt: string | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  precipitationMm: number | null;
  windSpeed10mMs: number | null;
  surfacePressureKpa: number | null;
  solarRadiationDailyMjM2: number | null;
  completenessPct: number;
  message: string;
}

export interface FetchNasaPowerDailyOptions {
  now?: Date;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function dateOffsetUtc(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10).replaceAll("-", "");
}

export function buildNasaPowerDailyUrl(
  location: WeatherLocation,
  now = new Date(),
  baseUrl = NASA_POWER_DAILY_URL,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("parameters", PARAMETERS.join(","));
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("start", dateOffsetUtc(now, -14));
  url.searchParams.set("end", dateOffsetUtc(now, -1));
  url.searchParams.set("format", "JSON");
  url.searchParams.set("time-standard", "UTC");
  if (location.elevationM !== null && Number.isFinite(location.elevationM)) {
    url.searchParams.set("site-elevation", String(location.elevationM));
  }
  return url.toString();
}

function validNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= -900) return null;
  return parsed;
}

function bounded(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = validNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function radiationMjM2(value: unknown, unit: string | undefined): number | null {
  const parsed = bounded(value, 0, 100);
  if (parsed === null) return null;
  const normalizedUnit = (unit ?? "").toLowerCase();
  if (normalizedUnit.includes("kw-hr") || normalizedUnit.includes("kwh")) {
    return parsed * 3.6;
  }
  if (normalizedUnit.includes("mj")) return parsed;
  // A resposta diária padrão do POWER usa kW-hr/m²/dia. Sem unidade no
  // payload, preferimos não assumir e não exibimos um valor convertido.
  return null;
}

function unavailable(message: string): NasaPowerDailyReference {
  return {
    status: "unavailable",
    observedAt: null,
    temperatureC: null,
    relativeHumidityPct: null,
    precipitationMm: null,
    windSpeed10mMs: null,
    surfacePressureKpa: null,
    solarRadiationDailyMjM2: null,
    completenessPct: 0,
    message,
  };
}

export function normalizeNasaPowerDaily(
  payload: NasaPowerDailyPayload,
  now = new Date(),
): NasaPowerDailyReference {
  const parameter = payload.properties?.parameter;
  if (!parameter) return unavailable("Resposta inválida do NASA POWER");

  const dates = Array.from(new Set(
    PARAMETERS.flatMap((name) => Object.keys(parameter[name] ?? {})),
  ))
    .filter((date) => /^\d{8}$/.test(date))
    .sort()
    .reverse();

  for (const date of dates) {
    const temperatureC = bounded(parameter.T2M?.[date], -60, 60);
    const relativeHumidityPct = bounded(parameter.RH2M?.[date], 0, 100);
    const precipitationMm = bounded(parameter.PRECTOTCORR?.[date], 0, 500);
    const windSpeed10mMs = bounded(parameter.WS10M?.[date], 0, 75);
    const surfacePressureKpa = bounded(parameter.PS?.[date], 50, 115);
    const solarRadiationDailyMjM2 = radiationMjM2(
      parameter.ALLSKY_SFC_SW_DWN?.[date],
      payload.parameters?.ALLSKY_SFC_SW_DWN?.units,
    );
    const values = [
      temperatureC,
      relativeHumidityPct,
      precipitationMm,
      windSpeed10mMs,
      surfacePressureKpa,
      solarRadiationDailyMjM2,
    ];
    const availableValues = values.filter((value) => value !== null).length;
    if (availableValues < 4) continue;

    const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const observedAt = `${isoDate}T12:00:00.000Z`;
    const ageDays = (now.getTime() - new Date(observedAt).getTime()) / 86_400_000;
    const stale = ageDays > 10;

    return {
      status: stale ? "stale" : "available",
      observedAt,
      temperatureC,
      relativeHumidityPct,
      precipitationMm,
      windSpeed10mMs,
      surfacePressureKpa,
      solarRadiationDailyMjM2,
      completenessPct: Math.round((availableValues / values.length) * 100),
      message: stale
        ? "Referência NASA POWER disponível, porém desatualizada"
        : "Referência diária de satélite e reanálise disponível",
    };
  }

  return unavailable("NASA POWER não retornou dia com dados suficientes");
}

export async function fetchLatestNasaPowerDaily(
  location: WeatherLocation,
  options: FetchNasaPowerDailyOptions = {},
): Promise<NasaPowerDailyReference> {
  const now = options.now ?? new Date();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);

  try {
    const response = await (options.fetchImpl ?? fetch)(
      buildNasaPowerDailyUrl(location, now, options.baseUrl),
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      return unavailable(`NASA POWER indisponível (HTTP ${response.status})`);
    }
    return normalizeNasaPowerDaily(await response.json() as NasaPowerDailyPayload, now);
  } catch (error) {
    return unavailable(
      error instanceof Error && error.name === "AbortError"
        ? "Tempo limite excedido no NASA POWER"
        : "Falha temporária ao consultar o NASA POWER",
    );
  } finally {
    clearTimeout(timeout);
  }
}
