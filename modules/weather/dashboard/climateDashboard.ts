export interface ClimateReadingInput {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity: number | null;
  wind_speed: number | null;
  solar_radiation: number | null;
  precipitation: number | null;
  et0_calculated: number | null;
  imported_at: string | null;
}

export interface ClimateForecastInput {
  id: string;
  issued_at: string;
  target_date: string;
  temp_max: number | null;
  temp_min: number | null;
  humidity: number | null;
  wind_speed: number | null;
  solar_radiation: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  et0_calculated: number | null;
}

export interface EtoHistoryPoint {
  date: string;
  etoMm: number | null;
  quality: "available" | "missing";
}

export interface EtoSummary {
  todayMm: number | null;
  yesterdayMm: number | null;
  average7dMm: number | null;
  average30dMm: number | null;
  monthTotalMm: number | null;
  history: EtoHistoryPoint[];
}

export type ClimateCondition = "sunny" | "partly_cloudy" | "rain" | "unknown";

export interface ClimateDashboardResponse {
  farmId: string;
  timezone: string;
  localDate: string;
  generatedAt: string;
  current: {
    observedAt: string | null;
    sourceKind: "model_estimate" | "local_observation";
    sourceLabel: string;
    condition: ClimateCondition;
    temperatureC: number | null;
    tempMinC: number | null;
    tempMaxC: number | null;
    relativeHumidityPct: number | null;
    precipitationTodayMm: number | null;
    windSpeed2mMs: number | null;
    windDirection: string | null;
    solarRadiationWm2: number | null;
    solarRadiationDailyMjM2: number | null;
    surfacePressureKpa: number | null;
    etoTodayMm: number | null;
  };
  eto: EtoSummary & {
    method: "FAO-56 Penman-Monteith";
    quality: "estimated_model" | "observed_inputs" | "missing";
    sourceLabel: string;
  };
  dailyForecast: Array<{
    id: string;
    date: string;
    issuedAt: string;
    condition: ClimateCondition;
    tempMaxC: number | null;
    tempMinC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    precipitationProbabilityPct: number | null;
    etoMm: number | null;
    windSpeed2mMs: number | null;
  }>;
  hourlyForecast: Array<{
    intervalStart: string;
    condition: ClimateCondition;
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    windSpeed2mMs: number | null;
    etoMm: number | null;
    confidence: string;
  }>;
  status: {
    configuredSources: number;
    activeSources: number;
    sourceNames: string[];
    consensusLabel: string;
    qualityLabel: string;
    updatedAt: string | null;
    etoInputSources: number;
  };
  publicReferences: Array<{
    stationId: string;
    code: string;
    name: string;
    distanceKm: number | null;
    elevationDifferenceM: number | null;
    status: "available" | "stale" | "token_required" | "unavailable";
    observedAt: string | null;
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    windSpeedMs: number | null;
    completenessPct: number;
    message: string;
  }>;
  attribution: string[];
}

export function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
    * Math.sin(deltaLongitude / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function localDateInTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function latestReadingPerDate(
  readings: ClimateReadingInput[],
): ClimateReadingInput[] {
  const byDate = new Map<string, ClimateReadingInput>();
  for (const reading of readings) {
    const existing = byDate.get(reading.date);
    const readingImportedAt = reading.imported_at ?? "";
    const existingImportedAt = existing?.imported_at ?? "";
    if (!existing || readingImportedAt > existingImportedAt) {
      byDate.set(reading.date, reading);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildEtoSummary(
  readings: ClimateReadingInput[],
  today: string,
): EtoSummary {
  const latest = latestReadingPerDate(readings);
  const byDate = new Map(latest.map((reading) => [reading.date, reading]));
  const valuesInRange = (days: number) => {
    const start = addDays(today, -(days - 1));
    return latest
      .filter((reading) => reading.date >= start && reading.date <= today)
      .map((reading) => reading.et0_calculated)
      .filter((value): value is number => value !== null && Number.isFinite(value));
  };
  const monthPrefix = today.slice(0, 7);
  const monthValues = latest
    .filter((reading) => reading.date.startsWith(monthPrefix) && reading.date <= today)
    .map((reading) => reading.et0_calculated)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const history = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    const etoMm = byDate.get(date)?.et0_calculated ?? null;
    return { date, etoMm, quality: etoMm === null ? "missing" : "available" } as const;
  });

  return {
    todayMm: byDate.get(today)?.et0_calculated ?? null,
    yesterdayMm: byDate.get(addDays(today, -1))?.et0_calculated ?? null,
    average7dMm: average(valuesInRange(7)),
    average30dMm: average(valuesInRange(30)),
    monthTotalMm: monthValues.length > 0
      ? monthValues.reduce((sum, value) => sum + value, 0)
      : null,
    history,
  };
}

export function selectLatestOfficialForecastPerDay(
  rows: ClimateForecastInput[],
  limit = 7,
): ClimateForecastInput[] {
  const byDate = new Map<string, ClimateForecastInput>();
  for (const row of rows) {
    if (row.et0_calculated === null || !Number.isFinite(row.et0_calculated)) continue;
    const existing = byDate.get(row.target_date);
    if (!existing || row.issued_at > existing.issued_at) byDate.set(row.target_date, row);
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, limit);
}

export function windDirectionLabel(degrees: number | null): string | null {
  if (degrees === null || !Number.isFinite(degrees)) return null;
  const labels = ["N", "NE", "L", "SE", "S", "SO", "O", "NO"];
  return labels[Math.round((((degrees % 360) + 360) % 360) / 45) % labels.length];
}

export function climateCondition(
  precipitationMm: number | null,
  probabilityPct: number | null = null,
): ClimateCondition {
  if (precipitationMm === null && probabilityPct === null) return "unknown";
  const precipitation = precipitationMm ?? 0;
  const probability = probabilityPct ?? 0;
  if (precipitation >= 5 || probability >= 60) return "rain";
  if (precipitation > 0 || probability >= 30) return "partly_cloudy";
  return "sunny";
}
