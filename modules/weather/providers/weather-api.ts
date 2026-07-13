// ============================================================================
// Provider WeatherAPI.com — funções destinadas ao backend
// ----------------------------------------------------------------------------
// Consulta forecast.json (dia atual + próximos 3 dias no free) e history.json
// (um dia observado passado por chamada). Normaliza kph → m/s a 10 m e a 2 m
// (FAO-56 eq. 47). NÃO calcula ETo — dados WeatherAPI são apenas para
// comparação. Chave é lida de process.env.WEATHERAPI_KEY e sempre redigida
// antes de ir para qualquer log ou coluna persistida.
//
// Nota sobre "server-only": este módulo pode ser transitivamente importado
// por client components (via provider-registry ← virtual-station.service).
// Não usamos throw no topo — em vez disso, `requireKey()` só falha quando
// uma função é efetivamente chamada, e process.env.WEATHERAPI_KEY é
// `undefined` no bundle do cliente (não tem prefixo NEXT_PUBLIC_), então
// a chave nunca vaza. As funções aqui só devem ser chamadas de rotas API
// e Server Components.
// ============================================================================

const BASE_URL = "https://api.weatherapi.com/v1";

export const WEATHER_API_PROVIDER = "weather_api";
export const WEATHER_API_ATTRIBUTION = "Weather data by WeatherAPI.com";

/** Substitui `key=<segredo>` por `key=[REDACTED]` na URL. */
export function redactWeatherApiUrl(url: string): string {
  return url.replace(/(\bkey=)[^&#]+/gi, "$1[REDACTED]");
}

export class WeatherApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number | null,
    public readonly retryable: boolean,
    public readonly kind:
      | "no_key"
      | "invalid_key"
      | "rate_limited"
      | "bad_request"
      | "server_error"
      | "timeout"
      | "network"
      | "unknown",
  ) {
    super(message);
    this.name = "WeatherApiError";
  }
}

function requireKey(): string {
  const key = process.env.WEATHERAPI_KEY;
  if (!key || key.trim() === "") {
    throw new WeatherApiError(
      "WEATHERAPI_KEY não configurada no ambiente do servidor.",
      null,
      false,
      "no_key",
    );
  }
  return key;
}

/** Conversão FAO-56 eq. 47 de vento a 10 m para 2 m, em m/s. */
function convertKph10mTo2mMs(windKph: number): number {
  const ms10 = windKph / 3.6;
  const factor = 4.87 / Math.log(67.8 * 10 - 5.42);
  return ms10 * factor;
}

async function doFetch(url: string, timeoutMs = 15000): Promise<Response> {
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
      const res = await doFetch(url);
      if (res.status === 401 || res.status === 403) {
        throw new WeatherApiError(
          "WeatherAPI: chave inválida ou sem permissão — verifique WEATHERAPI_KEY.",
          res.status,
          false,
          "invalid_key",
        );
      }
      if (res.status === 400) {
        let detail = "";
        try {
          const j = (await res.json()) as { error?: { message?: string } };
          detail = j?.error?.message ?? "";
        } catch {
          /* ignore */
        }
        throw new WeatherApiError(
          `WeatherAPI 400: ${detail || "requisição inválida"}`,
          400,
          false,
          "bad_request",
        );
      }
      if (res.status === 429) {
        throw new WeatherApiError(
          "WeatherAPI: limite de requisições atingido (429).",
          429,
          true,
          "rate_limited",
        );
      }
      if (res.status >= 500) {
        throw new WeatherApiError(
          `WeatherAPI ${res.status}: indisponibilidade do provedor.`,
          res.status,
          true,
          "server_error",
        );
      }
      if (!res.ok) {
        throw new WeatherApiError(
          `WeatherAPI HTTP ${res.status}`,
          res.status,
          false,
          "unknown",
        );
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      if (isAbort) {
        lastError = new WeatherApiError(
          "WeatherAPI: timeout (>15s).",
          null,
          true,
          "timeout",
        );
      }
      const retryable =
        (lastError instanceof WeatherApiError && lastError.retryable) ||
        (!(lastError instanceof WeatherApiError) && !isAbort);
      if (!retryable || i === attempts - 1) break;
      // Backoff: 500ms · 1500ms para transientes; 1s · 3s para 429.
      const base =
        lastError instanceof WeatherApiError && lastError.kind === "rate_limited"
          ? 1000
          : 500;
      await new Promise((r) => setTimeout(r, base * (1 + i * 2)));
    }
  }
  if (lastError instanceof WeatherApiError) throw lastError;
  throw new WeatherApiError(
    lastError instanceof Error ? lastError.message : String(lastError),
    null,
    false,
    "network",
  );
}

// ── Tipos normalizados ──────────────────────────────────────────────────────

export interface WeatherApiDaily {
  date: string;                              // YYYY-MM-DD
  tempMax: number | null;                    // °C
  tempMin: number | null;                    // °C
  tempMean: number | null;                   // °C
  humidity: number | null;                   // %
  windSpeed2m: number | null;                // m/s a 2 m (já convertido)
  precipitation: number | null;              // mm
  precipitationProbability: number | null;   // % (0..100)
  pressureHpa: number | null;                // hPa (média das 24 horas)
  conditionText: string | null;              // "Sunny", "Partly cloudy", etc.
}

export interface WeatherApiContext {
  requestUrl: string;              // URL executada, com chave redigida
  requestLatitude: number;
  requestLongitude: number;
  requestTimezone: string;
  locationName: string | null;
  locationRegion: string | null;
  locationLat: number | null;
  locationLon: number | null;
  tzId: string | null;
}

export interface WeatherApiFetchResult {
  context: WeatherApiContext;
  daily: WeatherApiDaily[];
}

// ── Parsing da resposta WeatherAPI ──────────────────────────────────────────

interface DayNode {
  date?: string;
  day?: {
    maxtemp_c?: number;
    mintemp_c?: number;
    avgtemp_c?: number;
    maxwind_kph?: number;
    totalprecip_mm?: number;
    avghumidity?: number;
    daily_chance_of_rain?: number;
    condition?: { text?: string };
  };
  hour?: Array<{ pressure_mb?: number }>;
}

interface WeatherApiPayload {
  location?: {
    name?: string;
    region?: string;
    lat?: number;
    lon?: number;
    tz_id?: string;
  };
  forecast?: { forecastday?: DayNode[] };
}

function parseDayNode(d: DayNode): WeatherApiDaily {
  const day = d.day ?? {};
  const pressures = (d.hour ?? [])
    .map((h) => h.pressure_mb)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  const pressureAvg =
    pressures.length > 0
      ? pressures.reduce((s, p) => s + p, 0) / pressures.length
      : null;
  const windKph = typeof day.maxwind_kph === "number" ? day.maxwind_kph : null;
  return {
    date: d.date ?? "",
    tempMax: typeof day.maxtemp_c === "number" ? day.maxtemp_c : null,
    tempMin: typeof day.mintemp_c === "number" ? day.mintemp_c : null,
    tempMean: typeof day.avgtemp_c === "number" ? day.avgtemp_c : null,
    humidity: typeof day.avghumidity === "number" ? day.avghumidity : null,
    windSpeed2m: windKph != null ? convertKph10mTo2mMs(windKph) : null,
    precipitation:
      typeof day.totalprecip_mm === "number" ? day.totalprecip_mm : null,
    precipitationProbability:
      typeof day.daily_chance_of_rain === "number"
        ? day.daily_chance_of_rain
        : null,
    pressureHpa: pressureAvg,
    conditionText: day.condition?.text ?? null,
  };
}

function buildContext(
  url: string,
  req: { latitude: number; longitude: number; timezone: string },
  payload: WeatherApiPayload,
): WeatherApiContext {
  const loc = payload.location ?? {};
  return {
    requestUrl: redactWeatherApiUrl(url),
    requestLatitude: req.latitude,
    requestLongitude: req.longitude,
    requestTimezone: req.timezone,
    locationName: loc.name ?? null,
    locationRegion: loc.region ?? null,
    locationLat: typeof loc.lat === "number" ? loc.lat : null,
    locationLon: typeof loc.lon === "number" ? loc.lon : null,
    tzId: loc.tz_id ?? null,
  };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Previsão até `days` dias (1..3 no plano free; passa 3 se pedir mais).
 * Retorna também `forecastday[0]` (hoje) — útil para "última leitura".
 */
export async function fetchWeatherApiForecast(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  days: number;
}): Promise<WeatherApiFetchResult> {
  const key = requireKey();
  const days = Math.max(1, Math.min(params.days, 3));
  const qs = new URLSearchParams({
    key,
    q: `${params.latitude},${params.longitude}`,
    days: String(days),
    aqi: "no",
    alerts: "no",
  });
  const url = `${BASE_URL}/forecast.json?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as WeatherApiPayload;
  return {
    context: buildContext(url, params, payload),
    daily: (payload.forecast?.forecastday ?? []).map(parseDayNode),
  };
}

/**
 * Um dia observado passado. Chamar N vezes para pastDays=N.
 * No plano free, WeatherAPI permite `dt` até 7 dias no passado.
 */
export async function fetchWeatherApiHistoryDay(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  date: string; // YYYY-MM-DD
}): Promise<WeatherApiFetchResult> {
  const key = requireKey();
  const qs = new URLSearchParams({
    key,
    q: `${params.latitude},${params.longitude}`,
    dt: params.date,
  });
  const url = `${BASE_URL}/history.json?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as WeatherApiPayload;
  return {
    context: buildContext(url, params, payload),
    daily: (payload.forecast?.forecastday ?? []).map(parseDayNode),
  };
}

/**
 * Chamada de diagnóstico bem leve (endpoint /current.json em coordenada
 * neutra). Retorna se a chave está válida, sem devolver a URL nem a chave.
 */
export async function pingWeatherApi(): Promise<{
  status: "ok" | "invalid_key" | "rate_limited" | "provider_error" | "timeout" | "error";
  httpStatus: number | null;
  latencyMs: number;
  errorMasked: string | null;
}> {
  const startedAt = Date.now();
  let key: string;
  try {
    key = requireKey();
  } catch (err) {
    return {
      status: "error",
      httpStatus: null,
      latencyMs: 0,
      errorMasked:
        err instanceof WeatherApiError && err.kind === "no_key"
          ? err.message
          : "não foi possível ler a chave",
    };
  }
  const qs = new URLSearchParams({
    key,
    q: "-15.7942,-47.8822", // Brasília — coordenada neutra pública
    aqi: "no",
  });
  const url = `${BASE_URL}/current.json?${qs.toString()}`;
  try {
    const res = await doFetch(url, 10000);
    const latencyMs = Date.now() - startedAt;
    if (res.status === 401 || res.status === 403) {
      return {
        status: "invalid_key",
        httpStatus: res.status,
        latencyMs,
        errorMasked: "chave rejeitada pelo provedor",
      };
    }
    if (res.status === 429) {
      return {
        status: "rate_limited",
        httpStatus: 429,
        latencyMs,
        errorMasked: "limite de requisições atingido",
      };
    }
    if (res.status >= 500) {
      return {
        status: "provider_error",
        httpStatus: res.status,
        latencyMs,
        errorMasked: `provedor retornou ${res.status}`,
      };
    }
    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        latencyMs,
        errorMasked: `HTTP ${res.status}`,
      };
    }
    return { status: "ok", httpStatus: 200, latencyMs, errorMasked: null };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isAbort =
      err instanceof Error &&
      (err.name === "AbortError" || /aborted/i.test(err.message));
    if (isAbort) {
      return {
        status: "timeout",
        httpStatus: null,
        latencyMs,
        errorMasked: "timeout (>10s)",
      };
    }
    return {
      status: "error",
      httpStatus: null,
      latencyMs,
      errorMasked: "falha de rede",
    };
  }
}
