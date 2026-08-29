import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEtoSummary,
  climateCondition,
  coalesceNumber,
  ensureDailyForecastWindow,
  haversineDistanceKm,
  latestCandidatePerInterval,
  latestCandidatePerProvider,
  localDateInTimeZone,
  mergeDailyForecastFields,
  pickLatestCurrentCandidate,
  selectLatestOfficialForecastPerDay,
  type ClimateDashboardResponse,
  type ClimateForecastInput,
  type ClimateProviderCandidateInput,
  type ClimateReadingInput,
} from "@/modules/weather/dashboard/climateDashboard";
import { OPEN_METEO_FALLBACK_TIMEZONE } from "@/modules/weather/providers/openMeteoProvider";
import { fetchLatestInmetObservation } from "@/modules/weather/providers/inmetPublicObservation";
import { fetchLatestNasaPowerDaily } from "@/modules/weather/providers/nasaPowerDaily";
import { fetchNasaPowerTemperatureNormal } from "@/modules/weather/providers/nasaPowerClimatology";
import { calculateReferenceEtoAsceEwri } from "@/modules/weather/calculations/referenceEtoAsceEwri";
import { calculateReferenceEtoBlaneyCriddle } from "@/modules/weather/calculations/referenceEtoBlaneyCriddle";
import { calculateReferenceEtoCamargo1971 } from "@/modules/weather/calculations/referenceEtoCamargo1971";
import { calculateReferenceEtoHargreavesSamani } from "@/modules/weather/calculations/referenceEtoHargreavesSamani";
import { calculateReferenceEtoIvanov } from "@/modules/weather/calculations/referenceEtoIvanov";
import { calculateReferenceEtoJensenHaise } from "@/modules/weather/calculations/referenceEtoJensenHaise";
import { calculateReferenceEtoLinacre } from "@/modules/weather/calculations/referenceEtoLinacre";
import { calculateReferenceEtoMakkink } from "@/modules/weather/calculations/referenceEtoMakkink";
import { calculateReferenceEtoPriestleyTaylor } from "@/modules/weather/calculations/referenceEtoPriestleyTaylor";
import { calculateReferenceEtoThornthwaiteCamargo } from "@/modules/weather/calculations/referenceEtoThornthwaiteCamargo";
import { calculateReferenceEtoTurc } from "@/modules/weather/calculations/referenceEtoTurc";
import type { ReferenceEtoInput } from "@/modules/weather/calculations/referenceEtoTypes";

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
  source_count: number;
  disputed_fields: string[] | null;
  outlier_providers: string[] | null;
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
  if (confidence === "high") return "Comparação: alta concordância";
  if (confidence === "medium") return "Comparação: concordância moderada";
  if (confidence === "low") return "Comparação: baixa concordância";
  if (confidence === "disputed") return "Comparação: fontes divergentes";
  return "Comparação indisponível";
}

function dailyReferenceInput(input: {
  date: string;
  latitude: number;
  elevationM: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMeanC: number | null;
  relativeHumidityMeanPct: number | null;
  windSpeed2mMs: number | null;
  solarRadiationMjM2Day: number | null;
}): ReferenceEtoInput {
  return {
    date: input.date,
    latitude: input.latitude,
    elevationM: input.elevationM,
    temperatureMinC: input.temperatureMinC,
    temperatureMaxC: input.temperatureMaxC,
    temperatureMeanC: input.temperatureMeanC,
    relativeHumidityMinPct: null,
    relativeHumidityMaxPct: null,
    relativeHumidityMeanPct: input.relativeHumidityMeanPct,
    actualVapourPressureKpa: null,
    windSpeedMs: input.windSpeed2mMs,
    windMeasurementHeightM: 2,
    solarRadiationMjM2Day: input.solarRadiationMjM2Day,
    surfacePressureKpa: null,
  };
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
  const meteoblueStation = stations.find((item) => item.data_source === "meteoblue") ?? null;
  if (!station) {
    return NextResponse.json(
      { error: "Nenhuma estação climática ativa encontrada para a fazenda" },
      { status: 404 },
    );
  }

  const virtualStation = (virtualStationResult.data?.[0] ?? null) as VirtualStationRow | null;
  const timezone = virtualStation?.timezone || station.timezone || OPEN_METEO_FALLBACK_TIMEZONE;
  const now = new Date();
  const nowIso = now.toISOString();
  const next24hIso = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  const currentFreshnessCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
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
  const nasaPowerClimatologyPromise = virtualStation
    ? fetchNasaPowerTemperatureNormal({
        id: virtualStation.id,
        name: "Ponto da fazenda",
        latitude: virtualStation.latitude,
        longitude: virtualStation.longitude,
        elevationM: virtualStation.elevation_m,
        timezone,
      }, { timeoutMs: 8_000 })
    : Promise.resolve({
        status: "unavailable" as const,
        annualMeanTemperatureC: null,
        sourceLabel: "Normal climatológica NASA POWER T2M",
        message: "Coordenadas da estação virtual indisponíveis",
      });

  const emptyResult = Promise.resolve({ data: [], error: null });
  const [
    readingsResult,
    forecastsResult,
    meteoblueForecastsResult,
    providersResult,
    runsResult,
    currentConsensusResult,
    currentCandidatesResult,
    hourlyOpenMeteoResult,
    publicObservationResults,
    nasaPowerReference,
    nasaPowerClimatology,
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
      .order("issued_at", { ascending: false })
      .limit(400),
    meteoblueStation
      ? supabase
          .from("weather_forecasts")
          .select("id, issued_at, target_date, temp_max, temp_min, humidity, wind_speed, solar_radiation, precipitation, precipitation_probability, et0_source")
          .eq("station_id", meteoblueStation.id)
          .eq("provider", "meteoblue")
          .gte("target_date", today)
          .order("issued_at", { ascending: false })
          .limit(400)
      : emptyResult,
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
          .select("interval_start, evaluated_at, confidence, temperature_c, relative_humidity_pct, precipitation_mm, wind_speed_2m_ms, wind_direction_deg, solar_radiation_wm2, surface_pressure_kpa, source_count, disputed_fields, outlier_providers")
          .eq("virtual_station_id", virtualStation.id)
          .gte("interval_start", currentFreshnessCutoff)
          .lte("interval_start", nowIso)
          .order("interval_start", { ascending: false })
          .order("evaluated_at", { ascending: false })
          .limit(20)
      : emptyResult,
    virtualStation
      ? supabase
          .from("weather_interval_30m_candidates")
          .select("provider, interval_start, data_type, temperature_c, relative_humidity_pct, precipitation_mm, wind_speed_2m_ms, solar_radiation_wm2, surface_pressure_kpa, quality_status, missing_fields, interpolated, estimated, fetched_at")
          .eq("virtual_station_id", virtualStation.id)
          .gte("interval_start", currentFreshnessCutoff)
          .lte("interval_start", nowIso)
          .order("interval_start", { ascending: false })
          .order("fetched_at", { ascending: false })
          .limit(200)
      : emptyResult,
    virtualStation
      ? supabase
          .from("weather_interval_30m_candidates")
          .select("provider, interval_start, data_type, temperature_c, relative_humidity_pct, precipitation_mm, wind_speed_2m_ms, solar_radiation_wm2, surface_pressure_kpa, quality_status, missing_fields, interpolated, estimated, fetched_at")
          .eq("virtual_station_id", virtualStation.id)
          .eq("provider", "open_meteo")
          .gte("interval_start", nowIso)
          .lte("interval_start", next24hIso)
          .order("interval_start", { ascending: true })
          .order("fetched_at", { ascending: false })
          .limit(300)
      : emptyResult,
    publicObservationsPromise,
    nasaPowerPromise,
    nasaPowerClimatologyPromise,
  ]);

  const queryError = [
    readingsResult.error,
    forecastsResult.error,
    meteoblueForecastsResult.error,
    providersResult.error,
    runsResult.error,
    currentConsensusResult.error,
    currentCandidatesResult.error,
    hourlyOpenMeteoResult.error,
  ].find(Boolean);
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 422 });
  }

  const readings = (readingsResult.data ?? []) as ClimateReadingInput[];
  const forecasts = ensureDailyForecastWindow(
    (forecastsResult.data ?? []) as ClimateForecastInput[],
    today,
    7,
  );
  const meteoblueForecasts = selectLatestOfficialForecastPerDay(
    (meteoblueForecastsResult.data ?? []) as ClimateForecastInput[],
  );
  const meteoblueForecastByDate = new Map(
    meteoblueForecasts.map((forecast) => [forecast.target_date, forecast]),
  );
  const eto = buildEtoSummary(readings, today);
  const etoLatitude = virtualStation?.latitude ?? station.latitude;
  const etoElevationM = virtualStation?.elevation_m ?? station.altitude;
  const hargreavesValue = (
    date: string,
    temperatureMinC: number | null,
    temperatureMaxC: number | null,
  ): number | null => {
    if (etoLatitude === null) return null;
    return calculateReferenceEtoHargreavesSamani({
      date,
      latitude: etoLatitude,
      temperatureMinC,
      temperatureMaxC,
    }).etoMmDay;
  };
  const etoHargreavesSamani = buildEtoSummary(
    readings.map((reading) => ({
      ...reading,
      et0_source: hargreavesValue(
        reading.date,
        reading.temp_min,
        reading.temp_max,
      ),
    })),
    today,
  );
  const hargreavesForecastById = new Map(
    forecasts.map((forecast) => [
      forecast.id,
      hargreavesValue(
        forecast.target_date,
        forecast.temp_min,
        forecast.temp_max,
      ),
    ]),
  );
  const calculateFullMethods = (input: ReferenceEtoInput) => {
    const temperatureMeanC = input.temperatureMeanC
      ?? (input.temperatureMinC !== null && input.temperatureMaxC !== null
        ? (input.temperatureMinC + input.temperatureMaxC) / 2
        : null);
    return {
      asceEwri: calculateReferenceEtoAsceEwri(input).etoMmDay,
      priestleyTaylor: calculateReferenceEtoPriestleyTaylor(input).etoMmDay,
      thornthwaiteCamargo: calculateReferenceEtoThornthwaiteCamargo({
        date: input.date,
        latitude: input.latitude,
        temperatureMinC: input.temperatureMinC,
        temperatureMaxC: input.temperatureMaxC,
        climatologicalAnnualMeanTemperatureC: nasaPowerClimatology.annualMeanTemperatureC,
      }).etoMmDay,
      blaneyCriddle: calculateReferenceEtoBlaneyCriddle({
        date: input.date,
        latitude: input.latitude,
        temperatureMeanC,
        temperatureMinC: input.temperatureMinC,
        temperatureMaxC: input.temperatureMaxC,
      }).etoMmDay,
      makkink: calculateReferenceEtoMakkink({ ...input, temperatureMeanC }).etoMmDay,
      jensenHaise: calculateReferenceEtoJensenHaise({
        temperatureMeanC,
        temperatureMinC: input.temperatureMinC,
        temperatureMaxC: input.temperatureMaxC,
        solarRadiationMjM2Day: input.solarRadiationMjM2Day,
      }).etoMmDay,
      turc: calculateReferenceEtoTurc({
        temperatureMeanC,
        relativeHumidityMeanPct: input.relativeHumidityMeanPct,
        solarRadiationMjM2Day: input.solarRadiationMjM2Day,
      }).etoMmDay,
      linacre: calculateReferenceEtoLinacre({
        latitude: input.latitude,
        elevationM: input.elevationM,
        temperatureMeanC,
        relativeHumidityMeanPct: input.relativeHumidityMeanPct,
      }).etoMmDay,
      ivanov: calculateReferenceEtoIvanov({
        date: input.date,
        temperatureMeanC,
        relativeHumidityMeanPct: input.relativeHumidityMeanPct,
      }).etoMmDay,
      camargo1971: calculateReferenceEtoCamargo1971({
        date: input.date,
        latitude: input.latitude,
        temperatureMeanC,
        temperatureMinC: input.temperatureMinC,
        temperatureMaxC: input.temperatureMaxC,
        climatologicalAnnualMeanTemperatureC: nasaPowerClimatology.annualMeanTemperatureC,
      }).etoMmDay,
    };
  };
  const readingMethodValues = new Map(readings.map((reading) => {
    if (etoLatitude === null) return [reading, null] as const;
    return [reading, calculateFullMethods(dailyReferenceInput({
      date: reading.date,
      latitude: etoLatitude,
      elevationM: etoElevationM,
      temperatureMinC: reading.temp_min,
      temperatureMaxC: reading.temp_max,
      temperatureMeanC: reading.temp_mean,
      relativeHumidityMeanPct: reading.humidity,
      windSpeed2mMs: reading.wind_speed,
      solarRadiationMjM2Day: reading.solar_radiation,
    }))] as const;
  }));
  const buildCalculatedSummary = (method: keyof NonNullable<ReturnType<typeof calculateFullMethods>>) =>
    buildEtoSummary(readings.map((reading) => ({
      ...reading,
      et0_source: readingMethodValues.get(reading)?.[method] ?? null,
    })), today);
  const etoAsceEwri = buildCalculatedSummary("asceEwri");
  const etoPriestleyTaylor = buildCalculatedSummary("priestleyTaylor");
  const etoThornthwaiteCamargo = buildCalculatedSummary("thornthwaiteCamargo");
  const etoBlaneyCriddle = buildCalculatedSummary("blaneyCriddle");
  const etoMakkink = buildCalculatedSummary("makkink");
  const etoJensenHaise = buildCalculatedSummary("jensenHaise");
  const etoTurc = buildCalculatedSummary("turc");
  const etoLinacre = buildCalculatedSummary("linacre");
  const etoIvanov = buildCalculatedSummary("ivanov");
  const etoCamargo1971 = buildCalculatedSummary("camargo1971");
  const forecastMethodValues = new Map(forecasts.map((forecast) => {
    if (etoLatitude === null) return [forecast.id, null] as const;
    return [forecast.id, calculateFullMethods(dailyReferenceInput({
      date: forecast.target_date,
      latitude: etoLatitude,
      elevationM: etoElevationM,
      temperatureMinC: forecast.temp_min,
      temperatureMaxC: forecast.temp_max,
      temperatureMeanC: null,
      relativeHumidityMeanPct: forecast.humidity,
      windSpeed2mMs: forecast.wind_speed,
      solarRadiationMjM2Day: forecast.solar_radiation,
    }))] as const;
  }));
  const deltaTodayMm = eto.todayMm !== null && etoHargreavesSamani.todayMm !== null
    ? etoHargreavesSamani.todayMm - eto.todayMm
    : null;
  const deltaTodayPct = deltaTodayMm !== null && eto.todayMm !== null && eto.todayMm !== 0
    ? (deltaTodayMm / eto.todayMm) * 100
    : null;
  const todayReading = readings
    .filter((reading) => reading.date === today)
    .sort((a, b) => (b.imported_at ?? "").localeCompare(a.imported_at ?? ""))[0];
  const todayForecast = forecasts.find((forecast) => forecast.target_date === today) ?? null;
  const currentConsensus = latestConsensusPerInterval(
    (currentConsensusResult.data ?? []) as ConsensusRow[],
  ).at(-1) ?? null;
  const currentCandidates = latestCandidatePerProvider(
    (currentCandidatesResult.data ?? []) as ClimateProviderCandidateInput[],
  );
  const openMeteoCurrent = currentCandidates.get("open_meteo") ?? null;
  const currentObservation = pickLatestCurrentCandidate(currentCandidates) ?? openMeteoCurrent;
  const hourlyOpenMeteo = latestCandidatePerInterval(
    (hourlyOpenMeteoResult.data ?? []) as ClimateProviderCandidateInput[],
    "open_meteo",
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
      role: "Fonte principal da estimativa de ETo",
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
  const comparisonLabels = {
    open_meteo: "Open-Meteo",
    meteoblue: "Meteoblue",
    weatherapi: "WeatherAPI",
    met_norway: "MET Norway",
  } as const;
  const providerComparison: ClimateDashboardResponse["providerComparison"] = (
    Object.keys(comparisonLabels) as Array<keyof typeof comparisonLabels>
  ).map((provider) => {
    const row = currentCandidates.get(provider) ?? null;
    return {
      provider,
      label: comparisonLabels[provider],
      status: row === null
        ? "unavailable"
        : row.quality_status === "complete"
          ? "available"
          : "partial",
      validAt: row?.interval_start ?? null,
      fetchedAt: row?.fetched_at ?? null,
      dataType: row?.data_type ?? null,
      temperatureC: row?.temperature_c ?? null,
      relativeHumidityPct: row?.relative_humidity_pct ?? null,
      precipitationMm: row?.precipitation_mm ?? null,
      windSpeed2mMs: row?.wind_speed_2m_ms ?? null,
      solarRadiationWm2: row?.solar_radiation_wm2 ?? null,
      surfacePressureKpa: row?.surface_pressure_kpa ?? null,
      missingFields: row?.missing_fields ?? [],
      interpolated: row?.interpolated ?? false,
      estimated: row?.estimated ?? false,
    };
  });

  const response: ClimateDashboardResponse = {
    farmId,
    timezone,
    localDate: today,
    generatedAt: nowIso,
    current: {
      observedAt: currentObservation?.interval_start ?? todayReading?.imported_at ?? null,
      sourceKind: "model_estimate",
      sourceLabel: "Estimativa no ponto da fazenda · não é medição local",
      condition: climateCondition(
        coalesceNumber(todayReading?.precipitation, currentObservation?.precipitation_mm, todayForecast?.precipitation),
        todayForecast?.precipitation_probability ?? null,
      ),
      temperatureC: coalesceNumber(
        currentObservation?.temperature_c,
        todayReading?.temp_mean,
        todayReading?.temp_max,
        todayForecast?.temp_max,
      ),
      tempMinC: coalesceNumber(todayReading?.temp_min, todayForecast?.temp_min),
      tempMaxC: coalesceNumber(todayReading?.temp_max, todayForecast?.temp_max),
      relativeHumidityPct: coalesceNumber(
        currentObservation?.relative_humidity_pct,
        todayReading?.humidity,
        todayForecast?.humidity,
      ),
      precipitationTodayMm: coalesceNumber(todayReading?.precipitation, todayForecast?.precipitation),
      windSpeed2mMs: coalesceNumber(
        currentObservation?.wind_speed_2m_ms,
        todayReading?.wind_speed,
        todayForecast?.wind_speed,
      ),
      windDirection: null,
      solarRadiationWm2: coalesceNumber(currentObservation?.solar_radiation_wm2, openMeteoCurrent?.solar_radiation_wm2),
      solarRadiationDailyMjM2: todayReading?.solar_radiation ?? null,
      surfacePressureKpa: coalesceNumber(currentObservation?.surface_pressure_kpa, openMeteoCurrent?.surface_pressure_kpa),
      etoTodayMm: eto.todayMm,
      etoHargreavesSamaniTodayMm: etoHargreavesSamani.todayMm,
    },
    eto: {
      ...eto,
      method: "FAO-56 Penman-Monteith",
      quality: eto.todayMm === null && etoHargreavesSamani.todayMm === null
        ? "missing"
        : "model_unvalidated",
      sourceLabel: "Penman-Monteith recebido do Open-Meteo",
      hargreavesSamani: {
        ...etoHargreavesSamani,
        method: "Hargreaves-Samani 1985",
        formulaVersion: "hs-1985-v1",
        sourceLabel: "Calculado pela Cotrim com Tmin/Tmax do Open-Meteo, data e latitude da fazenda",
      },
      asceEwri: {
        ...etoAsceEwri,
        method: "ASCE-EWRI ETos 2005",
        formulaVersion: "asce-ewri-2005-etos-daily-v1",
        sourceLabel: "ETos diária para superfície curta, calculada pela Cotrim com os dados diários do Open-Meteo",
      },
      priestleyTaylor: {
        ...etoPriestleyTaylor,
        method: "Priestley-Taylor 1972",
        formulaVersion: "pt-1972-alpha-1.26-v1",
        sourceLabel: "Calculado pela Cotrim com saldo de radiação FAO-56 e α=1,26",
      },
      thornthwaiteCamargo: {
        ...etoThornthwaiteCamargo,
        method: "Thornthwaite-Camargo 1999",
        formulaVersion: "thornthwaite-camargo-1999-b0.36-v1",
        sourceLabel: `${nasaPowerClimatology.sourceLabel}; Tmin/Tmax do Open-Meteo`,
        climatologicalAnnualMeanTemperatureC: nasaPowerClimatology.annualMeanTemperatureC,
        climatologyStatus: nasaPowerClimatology.status,
      },
      blaneyCriddle: {
        ...etoBlaneyCriddle,
        method: "Blaney-Criddle FAO-24",
        formulaVersion: "fao-24-blaney-criddle-basic-daily-v1",
        sourceLabel: "Calculado pela Cotrim com temperatura média, data e fotoperíodo da latitude da fazenda; método originalmente mensal",
      },
      makkink: {
        ...etoMakkink,
        method: "Makkink 1957",
        formulaVersion: "makkink-1957-c0.61-v1",
        sourceLabel: "Calculado pela Cotrim com temperatura, radiação solar diária e pressão estimada pela altitude",
      },
      jensenHaise: {
        ...etoJensenHaise,
        method: "Jensen-Haise 1963",
        formulaVersion: "jensen-haise-1963-simplified-v1",
        sourceLabel: "Forma simplificada calculada pela Cotrim com temperatura média e radiação solar diária convertida em equivalente de água",
      },
      turc: {
        ...etoTurc,
        method: "Turc 1961",
        formulaVersion: "turc-1961-rh-corrected-v1",
        sourceLabel: "Calculado pela Cotrim com temperatura, umidade relativa e radiação solar diária; correção aplicada quando UR < 50%",
      },
      linacre: {
        ...etoLinacre,
        method: "Linacre 1977",
        formulaVersion: "linacre-1977-vegetation-c500-v1",
        sourceLabel: "Forma para vegetação calculada pela Cotrim com temperatura, ponto de orvalho derivado da UR, latitude e altitude",
      },
      ivanov: {
        ...etoIvanov,
        method: "Ivanov 1954",
        formulaVersion: "ivanov-1954-monthly-daily-equivalent-v1",
        sourceLabel: "Equação mensal de Ivanov calculada pela Cotrim; o painel mostra o equivalente dividido pelos dias do mês",
      },
      camargo1971: {
        ...etoCamargo1971,
        method: "Camargo 1971",
        formulaVersion: "camargo-1971-k-by-annual-temperature-v1",
        sourceLabel: `${nasaPowerClimatology.sourceLabel}; temperatura diária do Open-Meteo`,
        climatologicalAnnualMeanTemperatureC: nasaPowerClimatology.annualMeanTemperatureC,
        climatologyStatus: nasaPowerClimatology.status,
      },
      comparison: {
        deltaTodayMm,
        deltaTodayPct,
      },
    },
    validation: {
      mode: "validation",
      operationalUse: "blocked",
      confidence: "low",
      message: "Dados de modelo em validação. Não usar automaticamente para balanço hídrico, recomendação ou programação de irrigação.",
      latitude: virtualStation?.latitude ?? station.latitude,
      longitude: virtualStation?.longitude ?? station.longitude,
      elevationM: virtualStation?.elevation_m ?? station.altitude,
      sourceCount: currentConsensus?.source_count ?? currentCandidates.size,
      disputedFields: currentConsensus?.disputed_fields ?? [],
      outlierProviders: currentConsensus?.outlier_providers ?? [],
    },
    providerComparison,
    dailyForecast: forecasts.map((forecast) => {
      const meteoblueForecast = meteoblueForecastByDate.get(forecast.target_date) ?? null;
      const merged = mergeDailyForecastFields(forecast, meteoblueForecast);
      const meteoblueDeltaMm = forecast.et0_source != null && meteoblueForecast?.et0_source != null
        ? meteoblueForecast.et0_source - forecast.et0_source
        : null;
      const meteoblueDeltaPct = meteoblueDeltaMm != null && forecast.et0_source != null && forecast.et0_source !== 0
        ? (meteoblueDeltaMm / forecast.et0_source) * 100
        : null;
      return {
      id: forecast.id,
      date: forecast.target_date,
      issuedAt: forecast.issued_at,
      condition: climateCondition(
        merged.precipitation,
        merged.precipitation_probability,
      ),
      tempMaxC: merged.temp_max,
      tempMinC: merged.temp_min,
      relativeHumidityPct: merged.humidity,
      precipitationMm: merged.precipitation,
      precipitationProbabilityPct: merged.precipitation_probability,
      precipitationMeteoblueMm: meteoblueForecast?.precipitation ?? null,
      precipitationProbabilityMeteobluePct: meteoblueForecast?.precipitation_probability ?? null,
      solarRadiationMeteoblueMjM2Day: meteoblueForecast?.solar_radiation ?? null,
      etoMm: forecast.et0_source,
      etoMeteoblueMm: meteoblueForecast?.et0_source ?? null,
      etoOperationalMm: meteoblueForecast?.et0_source ?? forecast.et0_source ?? null,
      etoOperationalSource: meteoblueForecast?.et0_source != null
        ? "meteoblue_fao"
        : forecast.et0_source != null
          ? "open_meteo_pm_fao56"
          : null,
      etoMeteoblueIssuedAt: meteoblueForecast?.issued_at ?? null,
      etoMeteoblueDeltaMm: meteoblueDeltaMm,
      etoMeteoblueDeltaPct: meteoblueDeltaPct,
      etoHargreavesSamaniMm: hargreavesForecastById.get(forecast.id) ?? null,
      etoAsceEwriMm: forecastMethodValues.get(forecast.id)?.asceEwri ?? null,
      etoPriestleyTaylorMm: forecastMethodValues.get(forecast.id)?.priestleyTaylor ?? null,
      etoThornthwaiteCamargoMm: forecastMethodValues.get(forecast.id)?.thornthwaiteCamargo ?? null,
      etoBlaneyCriddleMm: forecastMethodValues.get(forecast.id)?.blaneyCriddle ?? null,
      etoMakkinkMm: forecastMethodValues.get(forecast.id)?.makkink ?? null,
      etoJensenHaiseMm: forecastMethodValues.get(forecast.id)?.jensenHaise ?? null,
      etoTurcMm: forecastMethodValues.get(forecast.id)?.turc ?? null,
      etoLinacreMm: forecastMethodValues.get(forecast.id)?.linacre ?? null,
      etoIvanovMm: forecastMethodValues.get(forecast.id)?.ivanov ?? null,
      etoCamargo1971Mm: forecastMethodValues.get(forecast.id)?.camargo1971 ?? null,
      windSpeed2mMs: merged.wind_speed,
      };
    }),
    hourlyForecast: hourlyOpenMeteo.map((row) => ({
      intervalStart: row.interval_start,
      condition: climateCondition(row.precipitation_mm),
      temperatureC: row.temperature_c,
      relativeHumidityPct: row.relative_humidity_pct,
      precipitationMm: row.precipitation_mm,
      windSpeed2mMs: row.wind_speed_2m_ms,
      confidence: "model_unvalidated",
    })),
    status: {
      configuredSources: providerConfigs.filter((provider) => provider.enabled).length,
      activeSources: activeProviders.length,
      sourceNames: activeProviders,
      consensusLabel: consensusLabel(latestConfidence),
      qualityLabel: "ETo de modelo · validação pendente",
      updatedAt,
      etoInputSources: activeProviders.includes("open_meteo") ? 1 : 0,
    },
    sourceHealth,
    nasaPowerReference,
    publicReferences,
    attribution: [
      "Dados de previsão por Open-Meteo.com (CC-BY 4.0)",
      "Meteoblue: probabilidade de chuva do basic-day, ETo FAO do agro-day sem recálculo e GHI diário do solar-day convertido para MJ/m²/dia; sincronização às 06:15 e 18:15 America/Bahia",
      "NASA POWER usada como referência diária de satélite e reanálise; não entra diretamente na ETo",
      "Estações públicas INMET usadas somente como referência externa; dados horários brutos e não validados pelo órgão",
      "Métodos de ETo exibidos separadamente: PM FAO-56 do Open-Meteo; FAO da Meteoblue; Hargreaves-Samani, ASCE-EWRI ETos, Priestley-Taylor, Thornthwaite-Camargo, Blaney-Criddle, Makkink, Jensen-Haise, Turc, Linacre, Ivanov e Camargo 1971 calculados pela Cotrim",
      "Blaney-Criddle e Ivanov são originalmente mensais; suas leituras diárias são apenas equivalentes comparativos. Makkink e Turc dependem da radiação solar diária e ficam sem valor quando essa entrada falta",
      "Linacre usa ponto de orvalho derivado de temperatura e umidade; Turc foi desenvolvido para condições úmidas. Camargo 1971 e Thornthwaite-Camargo usam normal anual de temperatura NASA POWER",
      "Todos os métodos permanecem não validados por estação física local e bloqueados para uso operacional automático",
    ],
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
