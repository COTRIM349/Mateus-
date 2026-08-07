import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOpenMeteo30MinRaw } from "@/modules/weather/providers/openMeteo30Min";
import { normalizeOpenMeteo15MinTo30Min } from "@/modules/weather/normalizers/normalizeOpenMeteo30Min";
import type { WeatherLocation } from "@/modules/weather/types/weatherTypes";

export interface ShadowVirtualStationRow {
  id: string;
  farm_id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
  target_resolution_minutes: number;
  shadow_mode: boolean;
  active: boolean;
}

export interface OpenMeteoShadowIngestionResult {
  rawPayloadId: string;
  intervalsReceived: number;
  intervalsUpserted: number;
  fetchedAt: string;
  requestUrl: string;
}

function asLocation(station: ShadowVirtualStationRow): WeatherLocation {
  return {
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    elevationM: station.elevation_m,
    timezone: station.timezone,
  };
}

/**
 * Ingestao CLIMA 2 em shadow mode.
 *
 * Garantias:
 * - nao escreve em weather_readings;
 * - nao escreve em water_balances;
 * - preserva payload bruto;
 * - grava cada provider separadamente;
 * - ausencia continua null;
 * - ETo Cotrim permanece null nesta fase.
 */
export async function ingestOpenMeteo30MinShadow(
  supabase: SupabaseClient,
  station: ShadowVirtualStationRow,
): Promise<OpenMeteoShadowIngestionResult> {
  if (!station.active) throw new Error("Estacao virtual inativa.");
  if (!station.shadow_mode) throw new Error("CLIMA 2 exige shadow_mode=true.");
  if (station.target_resolution_minutes !== 30) {
    throw new Error("CLIMA 2 exige target_resolution_minutes=30.");
  }

  const location = asLocation(station);
  const raw = await fetchOpenMeteo30MinRaw(location);
  const normalized = normalizeOpenMeteo15MinTo30Min({
    payload: raw.payload,
    location,
    fetchedAt: raw.finishedAt,
    requestUrl: raw.requestUrl,
  });

  const { data: rawRow, error: rawError } = await supabase
    .from("climate_raw_payloads")
    .insert({
      virtual_station_id: station.id,
      provider: "open_meteo",
      // A mesma resposta possui passos passados/atuais e previsoes futuras.
      data_type: "mixed",
      requested_at: raw.requestedAt,
      fetched_at: raw.finishedAt,
      request_url: raw.requestUrl,
      http_status: raw.httpStatus,
      model_name: "open_meteo_best_match",
      source_resolution_minutes: normalized[0]?.metadata.sourceResolutionMinutes ?? null,
      response_latitude: raw.payload.latitude ?? null,
      response_longitude: raw.payload.longitude ?? null,
      response_elevation_m: raw.payload.elevation ?? null,
      response_timezone: raw.payload.timezone ?? null,
      payload: raw.payload,
    })
    .select("id")
    .single();

  if (rawError || !rawRow) {
    throw new Error(`Falha ao salvar payload bruto Open-Meteo: ${rawError?.message ?? "sem id"}`);
  }

  if (normalized.length === 0) {
    return {
      rawPayloadId: rawRow.id as string,
      intervalsReceived: 0,
      intervalsUpserted: 0,
      fetchedAt: raw.finishedAt,
      requestUrl: raw.requestUrl,
    };
  }

  const rows = normalized.map((item) => ({
    virtual_station_id: station.id,
    raw_payload_id: rawRow.id,
    provider: "open_meteo",
    interval_start: item.intervalStart,
    interval_end: item.intervalEnd,
    target_resolution_minutes: 30,
    source_resolution_minutes: item.metadata.sourceResolutionMinutes ?? null,
    temperature_c: item.temperatureC,
    relative_humidity_pct: item.relativeHumidityPct,
    dew_point_c: item.dewPointC,
    surface_pressure_kpa: item.surfacePressureKpa,
    vapour_pressure_deficit_kpa: item.vapourPressureDeficitKpa,
    wind_speed_10m_ms: item.windSpeed10mMs,
    wind_speed_2m_ms: item.windSpeed2mMs,
    wind_direction_deg: item.windDirectionDeg,
    solar_radiation_wm2: item.solarRadiationWm2,
    precipitation_mm: item.precipitationMm,
    provider_reference_eto_mm: null,
    cotrim_pm_eto_mm: null,
    data_type: item.metadata.dataType,
    quality_status: item.metadata.qualityStatus,
    interpolated: item.metadata.interpolated ?? false,
    estimated: item.metadata.estimated ?? false,
    missing_fields: item.metadata.missingFields,
    warnings: item.metadata.warnings,
    fetched_at: item.metadata.fetchedAt,
  }));

  const { data: upserted, error: intervalError } = await supabase
    .from("climate_interval_readings")
    .upsert(rows, {
      onConflict: "virtual_station_id,provider,interval_start,interval_end",
    })
    .select("id");

  if (intervalError) {
    throw new Error(`Falha ao salvar intervalos Open-Meteo: ${intervalError.message}`);
  }

  return {
    rawPayloadId: rawRow.id as string,
    intervalsReceived: normalized.length,
    intervalsUpserted: upserted?.length ?? 0,
    fetchedAt: raw.finishedAt,
    requestUrl: raw.requestUrl,
  };
}
