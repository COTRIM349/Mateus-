import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMeteoblueHourlyRaw } from "@/modules/weather/providers/meteoblueHourly";
import { normalizeMeteoblueHourlyTo30Min } from "@/modules/weather/normalizers/normalizeMeteoblue30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

interface VirtualStationRow {
  id: string;
  farm_id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
  shadow_mode: boolean;
  active: boolean;
}

export interface Meteoblue30MinSyncResult {
  stationId: string;
  rawPayloadId: string;
  fetchedAt: string;
  rowsInserted: number;
  sourceResolutionMinutes: 60;
}

function localDateFromIso(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toLocation(station: VirtualStationRow): WeatherLocation {
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    elevationM: station.elevation_m,
    timezone: station.timezone,
  };
}

export async function syncMeteoblue30MinShadow(
  supabase: SupabaseClient,
  virtualStationId: string,
): Promise<Meteoblue30MinSyncResult> {
  const { data: stationData, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, name, latitude, longitude, elevation_m, timezone, shadow_mode, active")
    .eq("id", virtualStationId)
    .eq("active", true)
    .single();

  if (stationError || !stationData) {
    throw new Error(stationError?.message ?? "Estacao virtual nao encontrada");
  }

  const station = stationData as VirtualStationRow;
  if (!station.shadow_mode) throw new Error("CLIMA 3 so pode executar em shadow_mode");

  const { data: providerConfig, error: providerError } = await supabase
    .from("virtual_weather_station_providers")
    .select("enabled")
    .eq("virtual_station_id", station.id)
    .eq("provider", "meteoblue")
    .single();

  if (providerError || !providerConfig?.enabled) {
    throw new Error("Meteoblue nao esta habilitado para esta estacao virtual");
  }

  const location = toLocation(station);
  const result = await fetchMeteoblueHourlyRaw(location);
  const normalized = normalizeMeteoblueHourlyTo30Min({
    payload: result.payload,
    location,
    fetchedAt: result.finishedAt,
    requestUrl: result.requestUrl,
  });

  const modelName = result.payload.metadata?.name ?? "meteoblue_basic_1h";
  const issuedAt =
    result.payload.metadata?.modelrun_utc ??
    result.payload.metadata?.modelrun_updatetime_utc ??
    null;

  const { data: rawRow, error: rawError } = await supabase
    .from("weather_provider_payloads_raw")
    .insert({
      virtual_station_id: station.id,
      provider: "meteoblue",
      data_type: "mixed",
      model_name: modelName,
      forecast_issued_at: issuedAt,
      fetched_at: result.finishedAt,
      request_started_at: result.requestedAt,
      request_finished_at: result.finishedAt,
      request_latitude: station.latitude,
      request_longitude: station.longitude,
      request_timezone: "UTC",
      request_url: result.requestUrl,
      http_status: result.httpStatus,
      response_latitude: result.payload.metadata?.latitude ?? null,
      response_longitude: result.payload.metadata?.longitude ?? null,
      response_elevation_m: result.payload.metadata?.height ?? null,
      source_resolution_minutes: 60,
      provider_interpolated: false,
      payload: result.payload,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    throw new Error(rawError?.message ?? "Falha ao persistir payload bruto Meteoblue");
  }

  if (normalized.length === 0) {
    return {
      stationId: station.id,
      rawPayloadId: rawRow.id as string,
      fetchedAt: result.finishedAt,
      rowsInserted: 0,
      sourceResolutionMinutes: 60,
    };
  }

  const rows = normalized.map((row) => ({
    virtual_station_id: station.id,
    raw_payload_id: rawRow.id,
    provider: "meteoblue",
    data_type: row.metadata.dataType,
    model_name: row.metadata.modelName,
    forecast_issued_at: row.metadata.forecastIssuedAt,
    interval_start: row.intervalStart,
    interval_end: row.intervalEnd,
    local_date: localDateFromIso(row.intervalEnd, station.timezone),
    temperature_c: row.temperatureC,
    relative_humidity_pct: row.relativeHumidityPct,
    dew_point_c: row.dewPointC,
    precipitation_mm: row.precipitationMm,
    wind_speed_10m_ms: row.windSpeed10mMs,
    wind_speed_2m_ms: row.windSpeed2mMs,
    wind_direction_deg: row.windDirectionDeg,
    solar_radiation_wm2: row.solarRadiationWm2,
    surface_pressure_kpa: row.surfacePressureKpa,
    vapour_pressure_deficit_kpa: null,
    source_resolution_minutes: 60,
    target_resolution_minutes: 30,
    interpolated: true,
    estimated: true,
    quality_status: row.metadata.qualityStatus,
    missing_fields: row.metadata.missingFields,
    warnings: row.metadata.warnings,
    fetched_at: row.metadata.fetchedAt,
  }));

  const { error: insertError } = await supabase
    .from("weather_interval_30m_candidates")
    .insert(rows);

  if (insertError) throw new Error(insertError.message);

  return {
    stationId: station.id,
    rawPayloadId: rawRow.id as string,
    fetchedAt: result.finishedAt,
    rowsInserted: rows.length,
    sourceResolutionMinutes: 60,
  };
}
