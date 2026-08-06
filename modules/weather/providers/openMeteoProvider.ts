// ============================================================================
// modules/weather/providers/openMeteoProvider.ts
// ----------------------------------------------------------------------------
// Provider Open-Meteo na NOVA arquitetura climática.
//
// Papel: HTTP puro. Faz a requisição, valida o status, tipifica a resposta,
// registra timeout / erro / tentativa. NENHUM cálculo agronômico aqui —
// conversões e derivações vivem em normalizeOpenMeteo.ts.
//
// Convivência: o provider legado (providers/open-meteo.ts) segue intocado e
// continua sendo o único consumido em produção pela ingestion.service.
// ============================================================================

import type {
  WeatherProvider,
  WeatherProviderConfig,
  WeatherHealthCheckResult,
} from "@/modules/weather/providers/weatherProvider";
import type {
  DailyWeatherData,
  HourlyWeatherData,
  WeatherFetchRange,
  WeatherLocation,
  WeatherProviderName,
} from "@/modules/weather/types/weatherTypes";
import {
  WeatherProviderError,
  WeatherTimeoutError,
  WeatherValidationError,
} from "@/modules/weather/errors/weatherErrors";
import {
  normalizeOpenMeteoDaily,
  normalizeOpenMeteoHourly,
  type OpenMeteoDailyPayload,
  type OpenMeteoHourlyPayload,
} from "@/modules/weather/normalizers/normalizeOpenMeteo";

export const OPEN_METEO_PROVIDER_NAME: WeatherProviderName = "open_meteo";
export const OPEN_METEO_ATTRIBUTION =
  "Weather data by Open-Meteo.com (CC-BY 4.0)";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// ── Variáveis oficiais (confirmadas na API real da Open-Meteo em 2026-08) ──
// A doc pública em Markdown lista alguns nomes com prefixo (mean_*, maximum_*)
// que a API rejeita com HTTP 400. Os nomes abaixo foram verificados 1-a-1
// pingando /v1/forecast — só entram os que retornam 200. Alterar exige nova
// verificação empírica.
const DAILY_VARS = [
  "temperature_2m_min",
  "temperature_2m_max",
  "temperature_2m_mean",
  "relative_humidity_2m_min",
  "relative_humidity_2m_max",
  "relative_humidity_2m_mean",
  "precipitation_sum",
  "precipitation_probability_max",
  "shortwave_radiation_sum",
  "wind_speed_10m_mean",
  "wind_speed_10m_max",
  "wind_direction_10m_dominant",
  // Pressão: a Open-Meteo não expõe surface_pressure_mean diário. Pedimos
  // min e max — a média é derivável do horário quando necessário.
  "surface_pressure_min",
  "surface_pressure_max",
  "vapour_pressure_deficit_max",
  "et0_fao_evapotranspiration",
].join(",");

// Horárias — nomes exatamente como estão na Open-Meteo:
const HOURLY_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "precipitation_probability",
  "shortwave_radiation",
  "wind_speed_10m",
  "wind_direction_10m",
  "surface_pressure",
  "vapour_pressure_deficit",
  "et0_fao_evapotranspiration",
].join(",");

export const DEFAULT_OPEN_METEO_CONFIG: WeatherProviderConfig = {
  enabled: true,
  timeoutMs: 15000,
  maxAttempts: 2,        // 1 retry no máximo (decisão da Etapa 3)
  baseUrl: null,          // usa FORECAST_URL/ARCHIVE_URL padrão
  apiKey: null,           // Open-Meteo é sem chave
};

// ── Timezone fallback (decisão da Etapa 3) ──────────────────────────────────
export const OPEN_METEO_FALLBACK_TIMEZONE = "America/Bahia";

function resolveTimezone(loc: WeatherLocation): string {
  const tz = loc.timezone?.trim();
  return tz && tz.length > 0 ? tz : OPEN_METEO_FALLBACK_TIMEZONE;
}

// ── HTTP com timeout e uma tentativa adicional ─────────────────────────────
async function fetchOnce(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  cfg: WeatherProviderConfig,
): Promise<Response> {
  const attempts = Math.max(1, Math.min(cfg.maxAttempts, 2));
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetchOnce(url, cfg.timeoutMs);
      // 4xx que não seja 429/5xx → não tentar de novo
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return res;
      }
      if (res.ok) return res;
      lastError = new WeatherProviderError(
        `Open-Meteo HTTP ${res.status}`,
        {
          provider: OPEN_METEO_PROVIDER_NAME,
          requestUrl: url,
          httpStatus: res.status,
        },
      );
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastError = isAbort
        ? new WeatherTimeoutError("Open-Meteo timeout", {
            provider: OPEN_METEO_PROVIDER_NAME,
            requestUrl: url,
            cause: err,
          })
        : new WeatherProviderError(
            err instanceof Error ? err.message : String(err),
            { provider: OPEN_METEO_PROVIDER_NAME, requestUrl: url, cause: err },
          );
    }
    // Backoff simples entre tentativas (única retentativa)
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new WeatherProviderError("Open-Meteo falhou sem detalhe", {
    provider: OPEN_METEO_PROVIDER_NAME,
    requestUrl: url,
  });
}

async function fetchJson(
  url: string,
  cfg: WeatherProviderConfig,
): Promise<unknown> {
  const res = await fetchWithRetry(url, cfg);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new WeatherProviderError(
      `Open-Meteo HTTP ${res.status}: ${body.slice(0, 200)}`,
      {
        provider: OPEN_METEO_PROVIDER_NAME,
        requestUrl: url,
        httpStatus: res.status,
      },
    );
  }
  try {
    return await res.json();
  } catch (err) {
    throw new WeatherValidationError(
      "Open-Meteo retornou payload não-JSON",
      {
        provider: OPEN_METEO_PROVIDER_NAME,
        requestUrl: url,
        cause: err,
      },
    );
  }
}

// ── Construção de URLs ──────────────────────────────────────────────────────
function buildForecastUrl(
  base: string,
  loc: WeatherLocation,
  range: WeatherFetchRange,
  which: "daily" | "hourly",
): string {
  const qs = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    timezone: resolveTimezone(loc),
    start_date: range.startDate,
    end_date: range.endDate,
    wind_speed_unit: "ms",
  });
  if (which === "daily") qs.set("daily", DAILY_VARS);
  else qs.set("hourly", HOURLY_VARS);
  return `${base}?${qs.toString()}`;
}

// ── Fábrica do provider ─────────────────────────────────────────────────────
export function createOpenMeteoProvider(
  config: WeatherProviderConfig = DEFAULT_OPEN_METEO_CONFIG,
): WeatherProvider {
  const cfg: WeatherProviderConfig = { ...DEFAULT_OPEN_METEO_CONFIG, ...config };
  const forecastBase = cfg.baseUrl ?? FORECAST_URL;
  const archiveBase = cfg.baseUrl ?? ARCHIVE_URL;

  return {
    name: OPEN_METEO_PROVIDER_NAME,
    displayName: "Open-Meteo",
    attribution: OPEN_METEO_ATTRIBUTION,
    config: cfg,

    async fetchDaily(
      location: WeatherLocation,
      range: WeatherFetchRange,
    ): Promise<DailyWeatherData[]> {
      // Escolhe archive para janelas 100% no passado (>5 dias atrás) e
      // forecast caso contrário (que também expõe past_days).
      const today = new Date().toISOString().slice(0, 10);
      const useArchive =
        range.endDate < today &&
        // margem: 6 dias no passado, pra pegar dados definitivos
        new Date(range.endDate).getTime() <
          new Date(today).getTime() - 5 * 86400000;
      const base = useArchive ? archiveBase : forecastBase;
      const url = buildForecastUrl(base, location, range, "daily");
      const fetchedAt = new Date().toISOString();
      const payload = (await fetchJson(url, cfg)) as OpenMeteoDailyPayload;
      return normalizeOpenMeteoDaily({
        payload,
        location,
        requestUrl: url,
        fetchedAt,
        // ETo do Open-Meteo em past_days do endpoint forecast é "observado";
        // em days futuros é "forecast". O normalizer resolve por comparação
        // com `today`.
      });
    },

    async fetchHourly(
      location: WeatherLocation,
      range: WeatherFetchRange,
    ): Promise<HourlyWeatherData[]> {
      const url = buildForecastUrl(forecastBase, location, range, "hourly");
      const fetchedAt = new Date().toISOString();
      const payload = (await fetchJson(url, cfg)) as OpenMeteoHourlyPayload;
      return normalizeOpenMeteoHourly({
        payload,
        location,
        requestUrl: url,
        fetchedAt,
      });
    },

    async healthCheck(): Promise<WeatherHealthCheckResult> {
      const url = `${forecastBase}?latitude=0&longitude=0&daily=temperature_2m_max&forecast_days=1`;
      const startedAt = Date.now();
      const checkedAt = new Date().toISOString();
      try {
        const res = await fetchOnce(url, Math.min(cfg.timeoutMs, 8000));
        const latencyMs = Date.now() - startedAt;
        return {
          provider: OPEN_METEO_PROVIDER_NAME,
          status: res.ok ? "ok" : "degraded",
          httpStatus: res.status,
          latencyMs,
          message: res.ok ? "Alcance HTTP OK" : `HTTP ${res.status}`,
          checkedAt,
        };
      } catch (err) {
        return {
          provider: OPEN_METEO_PROVIDER_NAME,
          status: "unavailable",
          httpStatus: null,
          latencyMs: Date.now() - startedAt,
          message: err instanceof Error ? err.message : String(err),
          checkedAt,
        };
      }
    },
  };
}
