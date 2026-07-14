// ============================================================================
// Provider meteoblue (https://www.meteoblue.com/)
// ----------------------------------------------------------------------------
// Busca dados diários via Packages API (basic-day). Não persiste nada —
// apenas normaliza e devolve para o serviço de ingestão.
//
// Chave: METEOBLUE_API_KEY (server-only, nunca exposta ao client).
// ============================================================================

export const METEOBLUE_PROVIDER = "meteoblue";
export const METEOBLUE_ATTRIBUTION = "Weather data by meteoblue.com";

const PACKAGES_URL = "https://my.meteoblue.com/packages/basic-day";

function getApiKey(): string {
  const key = (process.env.METEOBLUE_API_KEY ?? "").trim();
  if (!key) throw new Error("METEOBLUE_API_KEY não configurada.");
  return key;
}

export function redactKey(url: string): string {
  return url.replace(/apikey=[^&]+/, "apikey=***");
}

export interface MeteoblueDaily {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  tempMean: number | null;
  humidity: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  pressureHpa: number | null;
}

export interface MeteoblueFetchResult {
  requestUrl: string;
  daily: MeteoblueDaily[];
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
        throw new Error(`meteoblue HTTP ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (1 + i * 2)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

interface MeteoblueDayPayload {
  data_day?: {
    time?: string[];
    temperature_max?: (number | null)[];
    temperature_min?: (number | null)[];
    temperature_mean?: (number | null)[];
    relativehumidity_mean?: (number | null)[];
    windspeed_mean?: (number | null)[];
    precipitation?: (number | null)[];
    sealevelpressure_mean?: (number | null)[];
  };
}

function parseDaily(payload: MeteoblueDayPayload): MeteoblueDaily[] {
  const d = payload.data_day;
  if (!d?.time) return [];
  const out: MeteoblueDaily[] = [];
  for (let i = 0; i < d.time.length; i += 1) {
    const windKmh = d.windspeed_mean?.[i] ?? null;
    out.push({
      date: d.time[i],
      tempMax: d.temperature_max?.[i] ?? null,
      tempMin: d.temperature_min?.[i] ?? null,
      tempMean: d.temperature_mean?.[i] ?? null,
      humidity: d.relativehumidity_mean?.[i] ?? null,
      windSpeed: windKmh != null ? windKmh / 3.6 : null,
      precipitation: d.precipitation?.[i] ?? null,
      pressureHpa: d.sealevelpressure_mean?.[i] ?? null,
    });
  }
  return out;
}

export async function fetchMeteoblueDaily(params: {
  latitude: number;
  longitude: number;
  timezone: string;
  forecastDays?: number;
}): Promise<MeteoblueFetchResult> {
  const apiKey = getApiKey();
  const qs = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    apikey: apiKey,
    format: "json",
    timeformat: "Y-M-D",
    windspeed: "kmh",
  });
  const url = `${PACKAGES_URL}?${qs.toString()}`;
  const payload = (await fetchJsonWithRetry(url)) as MeteoblueDayPayload;
  return {
    requestUrl: redactKey(url),
    daily: parseDaily(payload),
  };
}

export interface MeteobluePingResult {
  keyPresent: boolean;
  status: "ok" | "error";
  httpStatus: number | null;
  latencyMs: number;
  error: string | null;
}

export async function pingMeteoblue(params: {
  latitude: number;
  longitude: number;
}): Promise<MeteobluePingResult> {
  const key = (process.env.METEOBLUE_API_KEY ?? "").trim();
  if (!key) {
    return { keyPresent: false, status: "error", httpStatus: null, latencyMs: 0, error: "METEOBLUE_API_KEY não configurada." };
  }
  const qs = new URLSearchParams({
    lat: String(params.latitude),
    lon: String(params.longitude),
    apikey: key,
    format: "json",
    timeformat: "Y-M-D",
  });
  const url = `${PACKAGES_URL}?${qs.toString()}`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, 10000);
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { keyPresent: true, status: "error", httpStatus: res.status, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { keyPresent: true, status: "ok", httpStatus: res.status, latencyMs, error: null };
  } catch (err) {
    return { keyPresent: true, status: "error", httpStatus: null, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}
