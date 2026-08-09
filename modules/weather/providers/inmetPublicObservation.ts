export const INMET_API_BASE_URL = "https://apitempo.inmet.gov.br";

export type InmetObservationStatus =
  | "available"
  | "stale"
  | "token_required"
  | "unavailable";

export interface InmetRawObservation {
  CD_ESTACAO?: unknown;
  DT_MEDICAO?: unknown;
  HR_MEDICAO?: unknown;
  TEM_INS?: unknown;
  UMD_INS?: unknown;
  CHUVA?: unknown;
  VEN_VEL?: unknown;
  VEN_DIR?: unknown;
  PRE_INS?: unknown;
}

export interface InmetPublicObservation {
  status: InmetObservationStatus;
  observedAt: string | null;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  windDirectionDeg: number | null;
  pressureKpa: number | null;
  completenessPct: number;
  message: string;
}

export interface FetchInmetObservationOptions {
  token?: string | null;
  now?: Date;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || Math.abs(parsed) === 9999) return null;
  return parsed;
}

function bounded(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = parseNumber(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

export function inmetObservedAt(dateValue: unknown, hourValue: unknown): string | null {
  if (typeof dateValue !== "string") return null;
  const date = dateValue.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const hourText = String(hourValue ?? "").replace(/\D/g, "").padStart(4, "0");
  if (!/^\d{4}$/.test(hourText)) return null;
  const hours = Number(hourText.slice(0, 2));
  const minutes = Number(hourText.slice(2, 4));
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;

  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
}

export function normalizeInmetObservation(
  raw: InmetRawObservation,
  now = new Date(),
): InmetPublicObservation | null {
  const observedAt = inmetObservedAt(raw.DT_MEDICAO, raw.HR_MEDICAO);
  if (!observedAt) return null;

  const temperatureC = bounded(raw.TEM_INS, -60, 60);
  const relativeHumidityPct = bounded(raw.UMD_INS, 0, 100);
  const precipitationMm = bounded(raw.CHUVA, 0, 500);
  const windSpeedMs = bounded(raw.VEN_VEL, 0, 75);
  const windDirectionDeg = bounded(raw.VEN_DIR, 0, 360);
  const pressureHpa = bounded(raw.PRE_INS, 700, 1_100);
  const pressureKpa = pressureHpa === null ? null : Math.round(pressureHpa * 10) / 100;
  const principalValues = [
    temperatureC,
    relativeHumidityPct,
    precipitationMm,
    windSpeedMs,
    pressureKpa,
  ];
  const completenessPct = Math.round(
    (principalValues.filter((value) => value !== null).length / principalValues.length) * 100,
  );
  const ageMs = now.getTime() - new Date(observedAt).getTime();
  const stale = ageMs > 3 * 60 * 60 * 1_000;

  return {
    status: stale ? "stale" : "available",
    observedAt,
    temperatureC,
    relativeHumidityPct,
    precipitationMm,
    windSpeedMs,
    windDirectionDeg,
    pressureKpa,
    completenessPct,
    message: stale
      ? "Leitura pública desatualizada"
      : "Observação pública bruta validada por faixas físicas",
  };
}

export function buildInmetObservationUrl(
  stationCode: string,
  startDate: string,
  endDate: string,
  token: string,
  baseUrl = INMET_API_BASE_URL,
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/token/estacao/${startDate}/${endDate}/${encodeURIComponent(stationCode)}/${encodeURIComponent(token)}`;
}

export function buildInmetPublicObservationUrl(
  stationCode: string,
  startDate: string,
  endDate: string,
  baseUrl = INMET_API_BASE_URL,
): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/estacao/${startDate}/${endDate}/${encodeURIComponent(stationCode)}`;
}

function unavailable(
  status: Exclude<InmetObservationStatus, "available" | "stale">,
  message: string,
): InmetPublicObservation {
  return {
    status,
    observedAt: null,
    temperatureC: null,
    relativeHumidityPct: null,
    precipitationMm: null,
    windSpeedMs: null,
    windDirectionDeg: null,
    pressureKpa: null,
    completenessPct: 0,
    message,
  };
}

function dateOffsetUtc(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export async function fetchLatestInmetObservation(
  stationCode: string,
  options: FetchInmetObservationOptions = {},
): Promise<InmetPublicObservation> {
  const token = options.token?.trim();
  const now = options.now ?? new Date();
  const startDate = dateOffsetUtc(now, -1);
  const endDate = dateOffsetUtc(now, 0);
  const requestUrl = token
    ? buildInmetObservationUrl(
        stationCode,
        startDate,
        endDate,
        token,
        options.baseUrl,
      )
    : buildInmetPublicObservationUrl(
        stationCode,
        startDate,
        endDate,
        options.baseUrl,
      );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);

  try {
    const response = await (options.fetchImpl ?? fetch)(requestUrl, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 Cotrim-Irrigacao-Clima/1.0",
      },
    });
    if (response.status === 204) {
      return unavailable(
        "token_required",
        token
          ? "Credencial da API INMET não retornou dados"
          : "O INMET exige credencial para a leitura horária desta estação",
      );
    }
    if (!response.ok) {
      const credentialRequired = response.status === 401
        || response.status === 403;
      return unavailable(
        credentialRequired ? "token_required" : "unavailable",
        credentialRequired
          ? token
            ? "Credencial da API INMET recusada"
            : "O INMET exige credencial para a leitura horária desta estação"
          : `API INMET indisponível (HTTP ${response.status})`,
      );
    }

    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      return unavailable("unavailable", "Resposta inválida da API INMET");
    }

    const normalized = payload
      .map((row) => normalizeInmetObservation(row as InmetRawObservation, now))
      .filter((row): row is InmetPublicObservation => row !== null)
      .sort((a, b) => (a.observedAt ?? "").localeCompare(b.observedAt ?? ""));
    return normalized.at(-1)
      ?? unavailable("unavailable", "INMET não retornou leitura válida");
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Tempo limite excedido na API INMET"
      : "Falha temporária ao consultar a API INMET";
    return unavailable("unavailable", message);
  } finally {
    clearTimeout(timeout);
  }
}
