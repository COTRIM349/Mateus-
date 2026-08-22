export const ORBITAL_MOISTURE_SOURCE = "open_meteo_soil";
export const ORBITAL_MOISTURE_ATTRIBUTION =
  "Umidade de superfície por Open-Meteo (modelo de solo). Não substitui o balanço FAO-56 nem sensor de campo.";

export interface OrbitalPointInput {
  id: string;
  latitude: number;
  longitude: number;
}

export interface ParsedOrbitalHour {
  time: string;
  moisture07: number | null;
  moisture728: number | null;
  moisture28100: number | null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function buildOrbitalMoistureUrl(lat: number, lng: number, pastDays = 7): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "hourly",
    "soil_moisture_0_to_7cm,soil_moisture_7_to_28cm,soil_moisture_28_to_100cm",
  );
  url.searchParams.set("past_days", String(pastDays));
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "UTC");
  return url.toString();
}

export function parseOrbitalMoistureResponse(payload: unknown): ParsedOrbitalHour[] {
  if (!payload || typeof payload !== "object") return [];
  const hourly = (payload as { hourly?: Record<string, unknown> }).hourly;
  if (!hourly) return [];
  const times = Array.isArray(hourly.time) ? hourly.time : [];
  const a = Array.isArray(hourly.soil_moisture_0_to_7cm) ? hourly.soil_moisture_0_to_7cm : [];
  const b = Array.isArray(hourly.soil_moisture_7_to_28cm) ? hourly.soil_moisture_7_to_28cm : [];
  const c = Array.isArray(hourly.soil_moisture_28_to_100cm) ? hourly.soil_moisture_28_to_100cm : [];
  const rows: ParsedOrbitalHour[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const time = typeof times[i] === "string" ? times[i] : "";
    if (!time) continue;
    rows.push({
      time,
      moisture07: num(a[i]),
      moisture728: num(b[i]),
      moisture28100: num(c[i]),
    });
  }
  return rows;
}

/** Última hora com pelo menos uma camada preenchida — não inventa valor. */
export function latestOrbitalSample(rows: ParsedOrbitalHour[]): ParsedOrbitalHour | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row.moisture07 != null || row.moisture728 != null || row.moisture28100 != null) return row;
  }
  return null;
}

export function sampleDateUtc(isoHour: string): string {
  return isoHour.slice(0, 10);
}

export function isValidMapCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

export async function fetchLatestOrbitalHour(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedOrbitalHour | null> {
  if (!isValidMapCoordinate(lat, lng)) return null;
  const res = await fetchImpl(buildOrbitalMoistureUrl(lat, lng), { cache: "no-store" });
  if (!res.ok) return null;
  const payload: unknown = await res.json();
  return latestOrbitalSample(parseOrbitalMoistureResponse(payload));
}
