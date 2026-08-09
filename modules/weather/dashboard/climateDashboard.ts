export interface ClimateReadingInput {
  date: string;
  temp_max: number | null;
  temp_min: number | null;
  temp_mean: number | null;
  humidity: number | null;
  wind_speed: number | null;
  solar_radiation: number | null;
  precipitation: number | null;
  et0_source: number | null;
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
  et0_source: number | null;
}

export type DashboardClimateProvider = "open_meteo" | "meteoblue" | "weatherapi" | "met_norway";

export interface ClimateProviderCandidateInput {
  provider: DashboardClimateProvider;
  interval_start: string;
  data_type: string;
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  precipitation_mm: number | null;
  wind_speed_2m_ms: number | null;
  solar_radiation_wm2: number | null;
  surface_pressure_kpa: number | null;
  quality_status: string;
  missing_fields: string[] | null;
  interpolated: boolean;
  estimated: boolean;
  fetched_at: string;
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
    etoHargreavesSamaniTodayMm: number | null;
  };
  eto: EtoSummary & {
    method: "FAO-56 Penman-Monteith";
    quality: "model_unvalidated" | "missing";
    sourceLabel: string;
    hargreavesSamani: EtoSummary & {
      method: "Hargreaves-Samani 1985";
      formulaVersion: "hs-1985-v1";
      sourceLabel: string;
    };
    asceEwri: EtoSummary & {
      method: "ASCE-EWRI ETos 2005";
      formulaVersion: "asce-ewri-2005-etos-daily-v1";
      sourceLabel: string;
    };
    priestleyTaylor: EtoSummary & {
      method: "Priestley-Taylor 1972";
      formulaVersion: "pt-1972-alpha-1.26-v1";
      sourceLabel: string;
    };
    thornthwaiteCamargo: EtoSummary & {
      method: "Thornthwaite-Camargo 1999";
      formulaVersion: "thornthwaite-camargo-1999-b0.36-v1";
      sourceLabel: string;
      climatologicalAnnualMeanTemperatureC: number | null;
      climatologyStatus: "available" | "unavailable";
    };
    comparison: {
      deltaTodayMm: number | null;
      deltaTodayPct: number | null;
    };
  };
  validation: {
    mode: "validation";
    operationalUse: "blocked";
    confidence: "low";
    message: string;
    latitude: number | null;
    longitude: number | null;
    elevationM: number | null;
    sourceCount: number;
    disputedFields: string[];
    outlierProviders: string[];
  };
  providerComparison: Array<{
    provider: DashboardClimateProvider;
    label: string;
    status: "available" | "partial" | "unavailable";
    validAt: string | null;
    fetchedAt: string | null;
    dataType: string | null;
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    windSpeed2mMs: number | null;
    solarRadiationWm2: number | null;
    surfacePressureKpa: number | null;
    missingFields: string[];
    interpolated: boolean;
    estimated: boolean;
  }>;
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
    etoHargreavesSamaniMm: number | null;
    etoAsceEwriMm: number | null;
    etoPriestleyTaylorMm: number | null;
    etoThornthwaiteCamargoMm: number | null;
    windSpeed2mMs: number | null;
  }>;
  hourlyForecast: Array<{
    intervalStart: string;
    condition: ClimateCondition;
    temperatureC: number | null;
    relativeHumidityPct: number | null;
    precipitationMm: number | null;
    windSpeed2mMs: number | null;
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
  sourceHealth: Array<{
    provider: "open_meteo" | "meteoblue" | "weatherapi" | "met_norway" | "nasa_power" | "inmet";
    label: string;
    role: string;
    status: "active" | "partial" | "delayed" | "credential_required" | "unavailable";
    updatedAt: string | null;
    message: string;
  }>;
  nasaPowerReference: {
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
  } | null;
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
      .map((reading) => reading.et0_source)
      .filter((value): value is number => value !== null && Number.isFinite(value));
  };
  const monthPrefix = today.slice(0, 7);
  const monthValues = latest
    .filter((reading) => reading.date.startsWith(monthPrefix) && reading.date <= today)
    .map((reading) => reading.et0_source)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const history = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index - 6);
    const etoMm = byDate.get(date)?.et0_source ?? null;
    return { date, etoMm, quality: etoMm === null ? "missing" : "available" } as const;
  });

  return {
    todayMm: byDate.get(today)?.et0_source ?? null,
    yesterdayMm: byDate.get(addDays(today, -1))?.et0_source ?? null,
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
    const existing = byDate.get(row.target_date);
    if (!existing || row.issued_at > existing.issued_at) byDate.set(row.target_date, row);
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, limit);
}

export function latestCandidatePerProvider(
  rows: ClimateProviderCandidateInput[],
): Map<DashboardClimateProvider, ClimateProviderCandidateInput> {
  const latest = new Map<DashboardClimateProvider, ClimateProviderCandidateInput>();
  for (const row of rows) {
    const existing = latest.get(row.provider);
    if (!existing
      || row.interval_start > existing.interval_start
      || (row.interval_start === existing.interval_start && row.fetched_at > existing.fetched_at)) {
      latest.set(row.provider, row);
    }
  }
  return latest;
}

export function latestCandidatePerInterval(
  rows: ClimateProviderCandidateInput[],
  provider: DashboardClimateProvider,
): ClimateProviderCandidateInput[] {
  const latest = new Map<string, ClimateProviderCandidateInput>();
  for (const row of rows) {
    if (row.provider !== provider) continue;
    const existing = latest.get(row.interval_start);
    if (!existing || row.fetched_at > existing.fetched_at) latest.set(row.interval_start, row);
  }
  return Array.from(latest.values()).sort((a, b) => a.interval_start.localeCompare(b.interval_start));
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
