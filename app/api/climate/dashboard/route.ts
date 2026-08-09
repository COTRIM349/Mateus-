import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEtoSummary,
  climateCondition,
  haversineDistanceKm,
  localDateInTimeZone,
  selectLatestOfficialForecastPerDay,
  windDirectionLabel,
  type ClimateDashboardResponse,
  type ClimateForecastInput,
  type ClimateReadingInput,
} from "@/modules/weather/dashboard/climateDashboard";
import { fetchLatestInmetObservation } from "@/modules/weather/providers/inmetPublicObservation";
import { fetchLatestNasaPowerDaily } from "@/modules/weather/providers/nasaPowerDaily";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StationRow {
  id: string;
  name: string;
  timezone: string | null;
  data_source: string;
  source_priority: number;
  external_id: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
}

interface VirtualStationRow {
  id: string;
  timezone: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
}

interface ConsensusRow {
  interval_start: string;
  evaluated_at: string;
  confidence: string;
  temperature_c: number | null;
  relative_humidity_pct: number | null;
  precipitation_mm: number | null;
  wind_speed_2m_ms: number | null;
  wind_direction_deg: number | null;
  solar_radiation_wm2: number | null;
  surface_pressure_kpa: number | null;
}

interface ProviderConfigRow {
  provider: string;
  enabled: boolean;
}

interface OrchestrationRunRow {
  status: string;
  finished_at: string | null;
  provider_results: Record<string, {
    status?: string;
    fetchedAt?: string | null;
    error?: string | null;
  }> | null;
  confidence_counts: Record<string, number> | null;
}

function isoDateOffset(dateIso: string, offsetDays: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function latestConsensusPerInterval(rows: ConsensusRow[]): ConsensusRow[] {
  const byInterval = new Map<string, ConsensusRow>();
  for (const row of rows) {
    const existing = byInterval.get(row.interval_start);
    if (!existing || row.evaluated_at > existing.evaluated_at) {
      byInterval.set(row.interval_start, row);
    }
  }
  return Array.from(byInterval.values()).sort((a, b) =>
    a.interval_start.localeCompare(b.interval_start),
  );
}

function consensusLabel(confidence: string | null): string {
  if (confidence === "high") return "Clima: consenso alto";
  if (confidence === "medium") return "Clima: consenso moderado";
  if (confidence === "low") return "Clima: consenso baixo";
  if (confidence === "disputed") return "Clima: fontes divergentes";
  return "Clima: consenso indisponível";
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const farmId = new URL(request.url).searchParams.get("farmId")?.trim();
  if (!farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  const [stationsResult, virtualStationResult] = await Promise.all([
    supabase
      .from("weather_stations")
      .select("id, name, timezone, data_source, source_priority, external_id, latitude, longitude, altitude")
      .eq("farm_id", farmId)
      .eq("active", true)
      .order("source_priority", { ascending: true }),
    supabase
      .from("virtual_weather_stations")
      .select("id, timezone, latitude, longitude, elevation_m")
      .eq("farm_id", farmId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);

  if (stationsResult.error) {
    return NextResponse.json({ error: stationsResult.error.message }, { status: 422 });
  }
  if (virtualStationResult.error) {
    return NextResponse.json({ error: virtualStationResult.error.message }, { status: 422 });
  }

  const stations = (stationsResult.data ?? []) as StationRow[];
  const station = stations.find((item) => item.data_source === "open_meteo") ?? stations[0];
  if (!station) {
    return NextResponse.json(
      { error: "Nenhuma estação climática ativa encontrada para a fazenda" },
      { status: 404 },
    );
  }

  const virtualStation = (virtualStationResult.data?.[0] ?? null) as VirtualStationRow | null;
  const timezone = virtualStation?.timezone || station.timezone || "America/Sao_Paulo";
  const now = new Date();
  const nowIso = now.toISOString();
  const next24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const currentFreshnessCutoff = new Date(now.getTime() - 2 * 60 * 60 * 1_000).toISOString();
  const today = localDateInTimeZone(now, timezone);
  const historyStart = isoDateOffset(today, -39);
  const publicStations = stations.filter(
    (item) => item.data_source === "api_inmet" && Boolean(item.external_id),
  );
  const publicObservationsPromise = Promise.all(
    publicStations.map(async (publicStation) => ({
      station: publicStation,
      observation: await fetchLatestInmetObservation(publicStation.external_id!, {
        token: process.env.INMET_TOKEN,
        now,
      }),
    })),
  );
  const nasaPowerPromise = virtualStation
    ? fetchLatestNasaPowerDaily({
        id: virtualStation.id,
        name: "Ponto da fazenda",
        latitude: virtualStation.latitude,
        longitude: virtualStation.longitude,
        elevationM: virtualStation.elevation_m,
        timezone,
      }, { now, timeoutMs: 8_000 })
    : Promise.resolve(null);

  const emptyResult = Promise.resolve({ data: [], error: null });
  const [
    readingsResult,
    forecastsResult,
    providersResult,
    runsResult,
    currentConsensusResult,
    hourlyConsensusResult,
    publicObservationResults,
    nasaPowerReference,
  ] = await Promise.all([
    supabase
      .from("weather_readings")
      .select("date, temp_max, temp_min, temp_mean, humidity, wind_speed, solar_radiation, precipitation, et0_source, imported_at")
      .eq("station_id", station.id)
      .gte("date", historyStart)
      .lte("date", today)
      .order("date", { ascending: true })
      .order("imported_at", { ascending: false }),
    supabase
      .from("weather_forecasts")
      .select("id, issued_at, target_date, temp_max, temp_min, humidity, wind_speed, solar_radiation, precipitation, precipitation_probability, et0_source")
      .eq("station_id", station.id)
      .gte("target_date", today)
      .not("et0_source", "is", null)
      .order("issued_at", { ascending: false })
      .limit(400),
    virtualStation
      ? supabase
          .from("virtual_weather_station_providers")
          .select("provider, enabled")
          .eq("virtual_station_id", virtualStation.id)
      : emptyResult,
    virtualStation
      ? supabase
          .from("climate_orchestration_runs")
          .select("status, finished_at, provider_results, confidence_counts")
          .eq("virtual_station_id", virtualStation.id)
          .order("started_at", { ascending: false })
          .limit(1)
      : emptyResult,
    virtualStation
      ? supabase
          .from("weather_interval_30m_consensus_shadow")
          .select("interval_start, evaluated_at, confidence, temperature_c, relative_humidity_pct, precipitation_mm, wind_speed_2m_ms, wind_direction_deg, solar_radiation_wm2, surface_pressure_kpa")
          .eq("virtual_station_id", virtualStation.id)
          .gte("interval_start", currentFreshnessCutoff)
          .lte("interval_start", nowIso)
          .order("interval_start", { ascending: false })
          .order("evaluated_at", { ascending: false })
          .limit(20)
      : emptyResult,
    virtualStation
      ? supabase
          .from("weather_interval_30m_consensus_shadow")
          .select("interval_start, evaluated_at, confidence, temperature_c, relative_humidity_pct, precipitation_mm, wind_speed_2m_ms, wind_direction_deg, solar_radiation_wm2, surface_pressure_kpa")
          .eq("virtual_station_id", virtualStation.id)
          .gte("interval_start", nowIso)
          .lte("interval_start", next24hIso)
          .order("interval_start", { ascending: true })
          .limit(300)
      : emptyResult,
    publicObservationsPromise,
    nasaPowerPromise,
  ]);

  const queryError = [
    readingsResult.error,
    forecastsResult.error,
    providersResult.error,
    runsResult.error,
    currentConsensusResult.error,
    hourlyConsensusResult.error,
  ].find(Boolean);
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 422 });
  }

  const readings = (readingsResult.data ?? []) as ClimateReadingInput[];
  const forecasts = selectLatestOfficialForecastPerDay(
    (forecastsResult.data ?? []) as ClimateForecastInput[],
  );
  const eto = buildEtoSummary(readings, today);
  const todayReading = readings
    .filter((reading) => reading.date === today)
    .sort((a, b) => (b.imported_at ?? "").localeCompare(a.imported_at ?? ""))[0];
  const todayForecast = forecasts.find((forecast) => forecast.target_date === today) ?? null;
  const currentConsensus = latestConsensusPerInterval(
    (currentConsensusResult.data ?? []) as ConsensusRow[],
  ).at(-1) ?? null;
  const hourlyConsensus = latestConsensusPerInterval(
    (hourlyConsensusResult.data ?? []) as ConsensusRow[],
  );
  const providerConfigs = (providersResult.data ?? []) as ProviderConfigRow[];
  const latestRun = ((runsResult.data ?? [])[0] ?? null) as OrchestrationRunRow | null;
  const activeProviders = latestRun?.provider_results
    ? Object.entries(latestRun.provider_results)
        .filter(([, result]) => result?.status === "success")
        .map(([provider]) => provider)
    : [];
  const latestConfidence = currentConsensus?.confidence
    ?? (latestRun?.confidence_counts?.high ? "high" : null);
  const updatedAtCandidates = [
    currentConsensus?.evaluated_at,
    latestRun?.finished_at,
    forecasts[0]?.issued_at,
    todayReading?.imported_at,
  ].filter((value): value is string => Boolean(value));
  const updatedAt = updatedAtCandidates.sort().at(-1) ?? null;
  const publicReferences = publicObservationResults.map(({ station: publicStation, observation }) => {
    const hasCoordinates = virtualStation
      && typeof publicStation.latitude === "number"
      && typeof publicStation.longitude === "number";
    const distanceKm = hasCoordinates
      ? haversineDistanceKm(
          virtualStation.latitude,
          virtualStation.longitude,
          publicStation.latitude!,
          publicStation.longitude!,
        )
      : null;
    const elevationDifferenceM = virtualStation?.elevation_m !== null
      && virtualStation?.elevation_m !== undefined
      && publicStation.altitude !== null
      ? Math.abs(virtualStation.elevation_m - publicStation.altitude)
      : null;

    return {
      stationId: publicStation.id,
      code: publicStation.external_id!,
      name: publicStation.name,
      distanceKm,
      elevationDifferenceM,
      status: observation.status,
      observedAt: observation.observedAt,
      temperatureC: observation.temperatureC,
      relativeHumidityPct: observation.relativeHumidityPct,
      precipitationMm: observation.precipitationMm,
      windSpeedMs: observation.windSpeedMs,
      completenessPct: observation.completenessPct,
      message: observation.message,
    };
  });
  const providerResult = (provider: string) => latestRun?.provider_results?.[provider] ?? null;
  const meteoblueResult = providerResult("meteoblue");
  const weatherApiResult = providerResult("weatherapi");
  const openMeteoResult = providerResult("open_meteo");
  const metNorwayResult = providerResult("met_norway");
  const inmetAvailable = publicReferences.find((reference) => reference.status === "available");
  const inmetStale = publicReferences.find((reference) => reference.status === "stale");
  const inmetNeedsToken = publicReferences.some((reference) => reference.status === "token_required");
  const latestInmetReference = publicReferences
    .filter((reference) => reference.observedAt)
    .sort((a, b) => (a.observedAt ?? "").localeCompare(b.observedAt ?? ""))
    .at(-1);
  const sourceHealth: ClimateDashboardResponse["sourceHealth"] = [
    {
      provider: "open_meteo",
      label: "Open-Meteo",
      role: "Fonte oficial da ETo",
      status: openMeteoResult?.status === "success" ? "active" : "unavailable",
      updatedAt: openMeteoResult?.fetchedAt ?? latestRun?.finished_at ?? null,
      message: openMeteoResult?.status === "success"
        ? "ETo, radiação, pressão e demais variáveis recebidas"
        : openMeteoResult?.error ?? "Fonte principal não respondeu no último ciclo",
    },
    {
      provider: "meteoblue",
      label: "Meteoblue",
      role: "Conferência parcial",
      status: meteoblueResult?.status === "success"
        ? "partial"
        : process.env.METEOBLUE_API_KEY?.trim()
          ? "unavailable"
          : "credential_required",
      updatedAt: meteoblueResult?.fetchedAt ?? latestRun?.finished_at ?? null,
      message: meteoblueResult?.status === "success"
        ? "Temperatura, umidade, vento e chuva; sem radiação e pressão"
        : process.env.METEOBLUE_API_KEY?.trim()
          ? meteoblueResult?.error ?? "Fonte não respondeu no último ciclo"
          : "Chave não configurada",
    },
    {
      provider: "weatherapi",
      label: "WeatherAPI",
      role: "Previsão de conferência",
      status: weatherApiResult?.status === "success"
        ? "active"
        : process.env.WEATHERAPI_API_KEY?.trim()
          ? "unavailable"
          : "credential_required",
      updatedAt: weatherApiResult?.fetchedAt ?? latestRun?.finished_at ?? null,
      message: weatherApiResult?.status === "success"
        ? "Dados recebidos normalmente"
        : process.env.WEATHERAPI_API_KEY?.trim()
          ? weatherApiResult?.error ?? "Fonte não respondeu no último ciclo"
          : "WEATHERAPI_API_KEY ausente no ambiente deste deploy",
    },
    {
      provider: "met_norway",
      label: "MET Norway",
      role: "Conferência parcial",
      status: metNorwayResult?.status === "success" ? "partial" : "unavailable",
      updatedAt: metNorwayResult?.fetchedAt ?? latestRun?.finished_at ?? null,
      message: metNorwayResult?.status === "success"
        ? "Temperatura, umidade, vento e chuva; sem radiação e pressão"
        : metNorwayResult?.error ?? "Fonte não respondeu no último ciclo",
    },
    {
      provider: "nasa_power",
      label: "NASA POWER",
      role: "Auditoria por satélite",
      status: nasaPowerReference?.status === "available"
        ? "active"
        : nasaPowerReference?.status === "stale"
          ? "delayed"
          : "unavailable",
      updatedAt: nasaPowerReference?.observedAt ?? null,
      message: nasaPowerReference?.message ?? "Coordenadas da estação virtual indisponíveis",
    },
    {
      provider: "inmet",
      label: "INMET",
      role: "Estações físicas próximas",
      status: inmetAvailable
        ? "active"
        : inmetStale
          ? "delayed"
          : inmetNeedsToken
            ? "credential_required"
            : "unavailable",
      updatedAt: latestInmetReference?.observedAt ?? null,
      message: inmetAvailable?.message
        ?? inmetStale?.message
        ?? (inmetNeedsToken
          ? "Consulta pública testada; o INMET exigiu token para dados horários"
          : publicReferences[0]?.message ?? "Nenhuma estação INMET configurada"),
    },
  ];

  const response: ClimateDashboardResponse = {
    farmId,
    timezone,
    localDate: today,
    generatedAt: nowIso,
    current: {
      observedAt: currentConsensus?.interval_start ?? todayReading?.imported_at ?? null,
      sourceKind: "model_estimate",
      sourceLabel: "Modelo meteorológico no ponto da fazenda",
      condition: climateCondition(
        currentConsensus?.precipitation_mm ?? todayReading?.precipitation ?? null,
        todayForecast?.precipitation_probability ?? null,
      ),
      temperatureC: currentConsensus?.temperature_c ?? todayReading?.temp_mean ?? null,
      tempMinC: todayReading?.temp_min ?? todayForecast?.temp_min ?? null,
      tempMaxC: todayReading?.temp_max ?? todayForecast?.temp_max ?? null,
      relativeHumidityPct: currentConsensus?.relative_humidity_pct ?? todayReading?.humidity ?? null,
      precipitationTodayMm: todayReading?.precipitation ?? null,
      windSpeed2mMs: currentConsensus?.wind_speed_2m_ms ?? todayReading?.wind_speed ?? null,
      windDirection: windDirectionLabel(currentConsensus?.wind_direction_deg ?? null),
      solarRadiationWm2: currentConsensus?.solar_radiation_wm2 ?? null,
      solarRadiationDailyMjM2: todayReading?.solar_radiation ?? null,
      surfacePressureKpa: currentConsensus?.surface_pressure_kpa ?? null,
      etoTodayMm: eto.todayMm,
    },
    eto: {
      ...eto,
      method: "FAO-56 Penman-Monteith",
      quality: eto.todayMm === null ? "missing" : "provider_model",
      sourceLabel: "Valor original da API Open-Meteo · sem recálculo pela plataforma",
    },
    dailyForecast: forecasts.map((forecast) => ({
      id: forecast.id,
      date: forecast.target_date,
      issuedAt: forecast.issued_at,
      condition: climateCondition(
        forecast.precipitation,
        forecast.precipitation_probability,
      ),
      tempMaxC: forecast.temp_max,
      tempMinC: forecast.temp_min,
      relativeHumidityPct: forecast.humidity,
      precipitationMm: forecast.precipitation,
      precipitationProbabilityPct: forecast.precipitation_probability,
      etoMm: forecast.et0_source,
      windSpeed2mMs: forecast.wind_speed,
    })),
    hourlyForecast: hourlyConsensus.map((row) => ({
      intervalStart: row.interval_start,
      condition: climateCondition(row.precipitation_mm),
      temperatureC: row.temperature_c,
      relativeHumidityPct: row.relative_humidity_pct,
      precipitationMm: row.precipitation_mm,
      windSpeed2mMs: row.wind_speed_2m_ms,
      confidence: row.confidence,
    })),
    status: {
      configuredSources: providerConfigs.filter((provider) => provider.enabled).length,
      activeSources: activeProviders.length,
      sourceNames: activeProviders,
      consensusLabel: consensusLabel(latestConfidence),
      qualityLabel: "ETo oficial Open-Meteo · sem recálculo",
      updatedAt,
      etoInputSources: activeProviders.includes("open_meteo") ? 1 : 0,
    },
    sourceHealth,
    nasaPowerReference,
    publicReferences,
    attribution: [
      "Dados de previsão por Open-Meteo.com (CC-BY 4.0)",
      "NASA POWER usada como referência diária de satélite e reanálise; não entra diretamente na ETo",
      "Estações públicas INMET usadas somente como referência externa; dados horários brutos e não validados pelo órgão",
      "ETo de referência fornecida pelo Open-Meteo, calculada pelo método FAO-56 Penman-Monteith; a plataforma não recalcula o valor exibido",
    ],
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
