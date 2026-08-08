import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildEtoSummary,
  climateCondition,
  localDateInTimeZone,
  selectLatestOfficialForecastPerDay,
  windDirectionLabel,
  type ClimateDashboardResponse,
  type ClimateForecastInput,
  type ClimateReadingInput,
} from "@/modules/weather/dashboard/climateDashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StationRow {
  id: string;
  timezone: string | null;
  data_source: string;
  source_priority: number;
}

interface VirtualStationRow {
  id: string;
  timezone: string;
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

interface EtoIntervalRow {
  interval_start: string;
  calculated_at: string;
  eto_mm_30m: number | null;
}

interface ProviderConfigRow {
  provider: string;
  enabled: boolean;
}

interface OrchestrationRunRow {
  status: string;
  finished_at: string | null;
  provider_results: Record<string, { status?: string }> | null;
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

function latestEtoPerInterval(rows: EtoIntervalRow[]): Map<string, number | null> {
  const latest = new Map<string, EtoIntervalRow>();
  for (const row of rows) {
    const existing = latest.get(row.interval_start);
    if (!existing || row.calculated_at > existing.calculated_at) {
      latest.set(row.interval_start, row);
    }
  }
  return new Map(
    Array.from(latest.entries()).map(([interval, row]) => [interval, row.eto_mm_30m]),
  );
}

function consensusLabel(confidence: string | null): string {
  if (confidence === "high") return "Consenso alto";
  if (confidence === "medium") return "Consenso moderado";
  if (confidence === "low") return "Consenso baixo";
  if (confidence === "disputed") return "Dados divergentes";
  return "Consenso indisponível";
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
      .select("id, timezone, data_source, source_priority")
      .eq("farm_id", farmId)
      .eq("active", true)
      .order("source_priority", { ascending: true }),
    supabase
      .from("virtual_weather_stations")
      .select("id, timezone")
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

  const emptyResult = Promise.resolve({ data: [], error: null });
  const [
    readingsResult,
    forecastsResult,
    providersResult,
    runsResult,
    currentConsensusResult,
    hourlyConsensusResult,
    hourlyEtoResult,
  ] = await Promise.all([
    supabase
      .from("weather_readings")
      .select("date, temp_max, temp_min, temp_mean, humidity, wind_speed, solar_radiation, precipitation, et0_calculated, imported_at")
      .eq("station_id", station.id)
      .gte("date", historyStart)
      .lte("date", today)
      .order("date", { ascending: true })
      .order("imported_at", { ascending: false }),
    supabase
      .from("weather_forecasts")
      .select("id, issued_at, target_date, temp_max, temp_min, humidity, wind_speed, solar_radiation, precipitation, precipitation_probability, et0_calculated")
      .eq("station_id", station.id)
      .gte("target_date", today)
      .not("et0_calculated", "is", null)
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
    virtualStation
      ? supabase
          .from("weather_eto_30m_shadow")
          .select("interval_start, calculated_at, eto_mm_30m")
          .eq("virtual_station_id", virtualStation.id)
          .gte("interval_start", nowIso)
          .lte("interval_start", next24hIso)
          .order("calculated_at", { ascending: false })
          .limit(300)
      : emptyResult,
  ]);

  const queryError = [
    readingsResult.error,
    forecastsResult.error,
    providersResult.error,
    runsResult.error,
    currentConsensusResult.error,
    hourlyConsensusResult.error,
    hourlyEtoResult.error,
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
  const hourlyEto = latestEtoPerInterval((hourlyEtoResult.data ?? []) as EtoIntervalRow[]);
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

  const response: ClimateDashboardResponse = {
    farmId,
    timezone,
    localDate: today,
    generatedAt: nowIso,
    current: {
      observedAt: currentConsensus?.interval_start ?? todayReading?.imported_at ?? null,
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
      surfacePressureKpa: currentConsensus?.surface_pressure_kpa ?? null,
      etoTodayMm: eto.todayMm,
    },
    eto: {
      ...eto,
      method: "FAO-56 Penman-Monteith",
      quality: eto.todayMm === null ? "missing" : "calculated",
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
      etoMm: forecast.et0_calculated,
      windSpeed2mMs: forecast.wind_speed,
    })),
    hourlyForecast: hourlyConsensus.map((row) => ({
      intervalStart: row.interval_start,
      condition: climateCondition(row.precipitation_mm),
      temperatureC: row.temperature_c,
      relativeHumidityPct: row.relative_humidity_pct,
      precipitationMm: row.precipitation_mm,
      windSpeed2mMs: row.wind_speed_2m_ms,
      etoMm: hourlyEto.get(row.interval_start) ?? null,
      confidence: row.confidence,
    })),
    status: {
      configuredSources: providerConfigs.filter((provider) => provider.enabled).length,
      activeSources: activeProviders.length,
      sourceNames: activeProviders,
      consensusLabel: consensusLabel(latestConfidence),
      qualityLabel: "Qualidade em validação",
      updatedAt,
    },
    attribution: [
      "Dados de previsão por Open-Meteo.com (CC-BY 4.0)",
      "ETo calculada internamente pelo método FAO-56 Penman-Monteith",
    ],
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
