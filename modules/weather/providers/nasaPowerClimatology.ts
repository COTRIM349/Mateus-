import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export const NASA_POWER_CLIMATOLOGY_URL =
  "https://power.larc.nasa.gov/api/temporal/climatology/point";

export interface NasaPowerClimatologyPayload {
  properties?: {
    parameter?: {
      T2M?: Record<string, unknown>;
    };
  };
  header?: {
    range?: string;
  };
}

export interface NasaPowerTemperatureNormal {
  status: "available" | "unavailable";
  annualMeanTemperatureC: number | null;
  sourceLabel: string;
  message: string;
}

export interface FetchNasaPowerClimatologyOptions {
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function buildNasaPowerClimatologyUrl(
  location: WeatherLocation,
  baseUrl = NASA_POWER_CLIMATOLOGY_URL,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set("parameters", "T2M");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("format", "JSON");
  if (location.elevationM !== null && Number.isFinite(location.elevationM)) {
    url.searchParams.set("site-elevation", String(location.elevationM));
  }
  return url.toString();
}

function validTemperature(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > -60 && parsed < 60 ? parsed : null;
}

export function normalizeNasaPowerTemperatureNormal(
  payload: NasaPowerClimatologyPayload,
): NasaPowerTemperatureNormal {
  const values = payload.properties?.parameter?.T2M;
  const annual = validTemperature(values?.ANN);
  if (annual !== null) {
    const range = payload.header?.range?.trim();
    return {
      status: "available",
      annualMeanTemperatureC: annual,
      sourceLabel: range
        ? `Normal climatológica NASA POWER T2M · ${range}`
        : "Normal climatológica NASA POWER T2M (ANN)",
      message: "Temperatura média anual climatológica disponível",
    };
  }

  const monthKeys = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const months = monthKeys
    .map((key) => validTemperature(values?.[key]))
    .filter((value): value is number => value !== null);
  if (months.length === 12) {
    return {
      status: "available",
      annualMeanTemperatureC: months.reduce((sum, value) => sum + value, 0) / 12,
      sourceLabel: "Normal climatológica NASA POWER T2M (média dos 12 meses)",
      message: "Temperatura média anual derivada das 12 normais mensais",
    };
  }

  return {
    status: "unavailable",
    annualMeanTemperatureC: null,
    sourceLabel: "Normal climatológica NASA POWER T2M",
    message: "NASA POWER não retornou normal anual completa",
  };
}

export async function fetchNasaPowerTemperatureNormal(
  location: WeatherLocation,
  options: FetchNasaPowerClimatologyOptions = {},
): Promise<NasaPowerTemperatureNormal> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(
      buildNasaPowerClimatologyUrl(location, options.baseUrl),
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) {
      return {
        status: "unavailable",
        annualMeanTemperatureC: null,
        sourceLabel: "Normal climatológica NASA POWER T2M",
        message: `NASA POWER climatologia indisponível (HTTP ${response.status})`,
      };
    }
    return normalizeNasaPowerTemperatureNormal(
      await response.json() as NasaPowerClimatologyPayload,
    );
  } catch (error) {
    return {
      status: "unavailable",
      annualMeanTemperatureC: null,
      sourceLabel: "Normal climatológica NASA POWER T2M",
      message: error instanceof Error && error.name === "AbortError"
        ? "Tempo limite excedido no NASA POWER climatologia"
        : "Falha temporária ao consultar a climatologia NASA POWER",
    };
  } finally {
    clearTimeout(timeout);
  }
}
