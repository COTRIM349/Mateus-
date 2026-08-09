import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderName = "open_meteo" | "meteoblue" | "weatherapi" | "met_norway";

export interface ClimateObservabilityProvider {
  provider: ProviderName;
  enabled: boolean;
  lastFetchedAt: string | null;
  lastCandidateAt: string | null;
  lastQualityStatus: string | null;
  lastError: string | null;
  rowsInWindow: number;
  requestLatitude: number | null;
  requestLongitude: number | null;
  responseLatitude: number | null;
  responseLongitude: number | null;
  coordinateDistanceKm: number | null;
}

export interface ClimateObservabilityRun {
  id: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  intervalsFound: number;
  consensusCreated: number;
  etoCreated: number;
  etoAvailable: number;
  confidenceCounts: Record<string, number>;
  providerResults: Record<string, unknown>;
  warnings: string[];
  errorMessage: string | null;
}

export interface ClimateObservabilityInterval {
  intervalStart: string;
  intervalEnd: string;
  confidence: string;
  sourceCount: number;
  contributingProviders: string[];
  outlierProviders: string[];
  disputedFields: string[];
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeed2mMs: number | null;
  solarRadiationWm2: number | null;
  precipitationMm: number | null;
  etoMm30Min: number | null;
  etoRateMmH: number | null;
  etoQualityStatus: string | null;
  calculatedAt: string | null;
}

export interface ClimateObservabilitySnapshot {
  station: {
    id: string;
    farmId: string;
    name: string;
    scopeType: string;
    latitude: number;
    longitude: number;
    elevationM: number | null;
    timezone: string;
    shadowMode: boolean;
    active: boolean;
  };
  providers: ClimateObservabilityProvider[];
  summary: {
    lastRunStatus: string | null;
    lastRunAt: string | null;
    etoAvailabilityPct: number | null;
    highConfidencePct: number | null;
    disputedIntervals: number;
    outlierIntervals: number;
    intervalsEvaluated: number;
  };
  recentRuns: ClimateObservabilityRun[];
  intervals: ClimateObservabilityInterval[];
}

const PROVIDERS: ProviderName[] = ["open_meteo", "meteoblue", "weatherapi", "met_norway"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function coordinateDistanceKm(input: {
  requestLatitude: number | null;
  requestLongitude: number | null;
  responseLatitude: number | null;
  responseLongitude: number | null;
}): number | null {
  const { requestLatitude, requestLongitude, responseLatitude, responseLongitude } = input;
  if (
    requestLatitude === null
    || requestLongitude === null
    || responseLatitude === null
    || responseLongitude === null
  ) return null;

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(responseLatitude - requestLatitude);
  const longitudeDelta = toRadians(responseLongitude - requestLongitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(requestLatitude))
    * Math.cos(toRadians(responseLatitude))
    * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * 6_371 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export async function getClimateObservabilitySnapshot(
  supabase: SupabaseClient,
  input: { virtualStationId: string; hours?: number },
): Promise<ClimateObservabilitySnapshot> {
  const hours = Math.max(1, Math.min(168, Math.floor(input.hours ?? 24)));
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  const { data: stationData, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, name, scope_type, latitude, longitude, elevation_m, timezone, shadow_mode, active")
    .eq("id", input.virtualStationId)
    .single();

  if (stationError || !stationData) {
    throw new Error(stationError?.message ?? "Estacao virtual nao encontrada");
  }

  const { data: providerConfig, error: providerError } = await supabase
    .from("virtual_weather_station_providers")
    .select("provider, enabled")
    .eq("virtual_station_id", input.virtualStationId);
  if (providerError) throw new Error(providerError.message);

  const { data: rawRows, error: rawError } = await supabase
    .from("weather_provider_payloads_raw")
    .select("provider, fetched_at, request_latitude, request_longitude, response_latitude, response_longitude")
    .eq("virtual_station_id", input.virtualStationId)
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false });
  if (rawError) throw new Error(rawError.message);

  const { data: candidateRows, error: candidateError } = await supabase
    .from("weather_interval_30m_candidates")
    .select("provider, fetched_at, quality_status, interval_start")
    .eq("virtual_station_id", input.virtualStationId)
    .gte("interval_start", since)
    .order("fetched_at", { ascending: false });
  if (candidateError) throw new Error(candidateError.message);

  const { data: runsData, error: runsError } = await supabase
    .from("climate_orchestration_runs")
    .select("id, trigger_type, status, started_at, finished_at, duration_ms, intervals_found, consensus_created, eto_created, eto_available, confidence_counts, provider_results, warnings, error_message")
    .eq("virtual_station_id", input.virtualStationId)
    .order("started_at", { ascending: false })
    .limit(20);
  if (runsError) throw new Error(runsError.message);

  const { data: consensusData, error: consensusError } = await supabase
    .from("weather_interval_30m_consensus_shadow")
    .select("id, interval_start, interval_end, confidence, source_count, contributing_providers, outlier_providers, disputed_fields, temperature_c, relative_humidity_pct, wind_speed_2m_ms, solar_radiation_wm2, precipitation_mm, evaluated_at")
    .eq("virtual_station_id", input.virtualStationId)
    .gte("interval_start", since)
    .order("interval_start", { ascending: false })
    .limit(96);
  if (consensusError) throw new Error(consensusError.message);

  const consensusIds = (consensusData ?? []).map((row) => row.id as string);
  const etoByConsensus = new Map<string, { eto_mm_30m: number | null; eto_rate_mm_h: number | null; quality_status: string; calculated_at: string }>();
  if (consensusIds.length > 0) {
    const { data: etoData, error: etoError } = await supabase
      .from("weather_eto_30m_shadow")
      .select("consensus_id, eto_mm_30m, eto_rate_mm_h, quality_status, calculated_at")
      .in("consensus_id", consensusIds)
      .order("calculated_at", { ascending: false });
    if (etoError) throw new Error(etoError.message);
    for (const row of etoData ?? []) {
      const id = row.consensus_id as string;
      if (!etoByConsensus.has(id)) etoByConsensus.set(id, row as never);
    }
  }

  const enabledMap = new Map<string, boolean>(
    (providerConfig ?? []).map((row) => [row.provider as string, Boolean(row.enabled)]),
  );

  const latestRaw = new Map<string, {
    fetchedAt: string;
    requestLatitude: number | null;
    requestLongitude: number | null;
    responseLatitude: number | null;
    responseLongitude: number | null;
  }>();
  for (const row of rawRows ?? []) {
    const provider = row.provider as string;
    if (!latestRaw.has(provider)) {
      latestRaw.set(provider, {
        fetchedAt: row.fetched_at as string,
        requestLatitude: asFiniteNumber(row.request_latitude),
        requestLongitude: asFiniteNumber(row.request_longitude),
        responseLatitude: asFiniteNumber(row.response_latitude),
        responseLongitude: asFiniteNumber(row.response_longitude),
      });
    }
  }

  const latestCandidate = new Map<string, { fetchedAt: string; qualityStatus: string | null }>();
  const candidateCount = new Map<string, number>();
  for (const row of candidateRows ?? []) {
    const provider = row.provider as string;
    candidateCount.set(provider, (candidateCount.get(provider) ?? 0) + 1);
    if (!latestCandidate.has(provider)) {
      latestCandidate.set(provider, {
        fetchedAt: row.fetched_at as string,
        qualityStatus: (row.quality_status as string | null) ?? null,
      });
    }
  }

  const latestRunProviderResults = asObject(runsData?.[0]?.provider_results);
  const providers: ClimateObservabilityProvider[] = PROVIDERS.map((provider) => {
    const providerResult = asObject(latestRunProviderResults[provider]);
    const raw = latestRaw.get(provider);
    const coordinates = {
      requestLatitude: raw?.requestLatitude ?? null,
      requestLongitude: raw?.requestLongitude ?? null,
      responseLatitude: raw?.responseLatitude ?? null,
      responseLongitude: raw?.responseLongitude ?? null,
    };
    return {
      provider,
      enabled: enabledMap.get(provider) ?? false,
      lastFetchedAt: raw?.fetchedAt ?? null,
      lastCandidateAt: latestCandidate.get(provider)?.fetchedAt ?? null,
      lastQualityStatus: latestCandidate.get(provider)?.qualityStatus ?? null,
      lastError: typeof providerResult.error === "string" ? providerResult.error : null,
      rowsInWindow: candidateCount.get(provider) ?? 0,
      ...coordinates,
      coordinateDistanceKm: coordinateDistanceKm(coordinates),
    };
  });

  const recentRuns: ClimateObservabilityRun[] = (runsData ?? []).map((row) => ({
    id: row.id as string,
    triggerType: row.trigger_type as string,
    status: row.status as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    durationMs: (row.duration_ms as number | null) ?? null,
    intervalsFound: Number(row.intervals_found ?? 0),
    consensusCreated: Number(row.consensus_created ?? 0),
    etoCreated: Number(row.eto_created ?? 0),
    etoAvailable: Number(row.eto_available ?? 0),
    confidenceCounts: Object.fromEntries(
      Object.entries(asObject(row.confidence_counts)).map(([k, v]) => [k, Number(v ?? 0)]),
    ),
    providerResults: asObject(row.provider_results),
    warnings: asStringArray(row.warnings),
    errorMessage: (row.error_message as string | null) ?? null,
  }));

  const intervals: ClimateObservabilityInterval[] = (consensusData ?? []).map((row) => {
    const eto = etoByConsensus.get(row.id as string);
    return {
      intervalStart: row.interval_start as string,
      intervalEnd: row.interval_end as string,
      confidence: row.confidence as string,
      sourceCount: Number(row.source_count ?? 0),
      contributingProviders: asStringArray(row.contributing_providers),
      outlierProviders: asStringArray(row.outlier_providers),
      disputedFields: asStringArray(row.disputed_fields),
      temperatureC: (row.temperature_c as number | null) ?? null,
      relativeHumidityPct: (row.relative_humidity_pct as number | null) ?? null,
      windSpeed2mMs: (row.wind_speed_2m_ms as number | null) ?? null,
      solarRadiationWm2: (row.solar_radiation_wm2 as number | null) ?? null,
      precipitationMm: (row.precipitation_mm as number | null) ?? null,
      etoMm30Min: eto?.eto_mm_30m ?? null,
      etoRateMmH: eto?.eto_rate_mm_h ?? null,
      etoQualityStatus: eto?.quality_status ?? null,
      calculatedAt: eto?.calculated_at ?? null,
    };
  });

  const evaluated = intervals.length;
  const etoAvailable = intervals.filter((i) => i.etoMm30Min !== null).length;
  const high = intervals.filter((i) => i.confidence === "high").length;
  const disputed = intervals.filter((i) => i.confidence === "disputed" || i.disputedFields.length > 0).length;
  const outlierIntervals = intervals.filter((i) => i.outlierProviders.length > 0).length;

  return {
    station: {
      id: stationData.id as string,
      farmId: stationData.farm_id as string,
      name: stationData.name as string,
      scopeType: stationData.scope_type as string,
      latitude: Number(stationData.latitude),
      longitude: Number(stationData.longitude),
      elevationM: (stationData.elevation_m as number | null) ?? null,
      timezone: stationData.timezone as string,
      shadowMode: Boolean(stationData.shadow_mode),
      active: Boolean(stationData.active),
    },
    providers,
    summary: {
      lastRunStatus: recentRuns[0]?.status ?? null,
      lastRunAt: recentRuns[0]?.startedAt ?? null,
      etoAvailabilityPct: evaluated > 0 ? (etoAvailable / evaluated) * 100 : null,
      highConfidencePct: evaluated > 0 ? (high / evaluated) * 100 : null,
      disputedIntervals: disputed,
      outlierIntervals,
      intervalsEvaluated: evaluated,
    },
    recentRuns,
    intervals,
  };
}
