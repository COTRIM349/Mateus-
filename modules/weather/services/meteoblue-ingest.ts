// ============================================================================
// Serviço de ingestão meteoblue
// ----------------------------------------------------------------------------
// Grava observações/forecast da meteoblue em weather_readings com
// origin='meteoblue'. NÃO calcula ET₀ (meteoblue básico não fornece
// radiação solar). Nunca altera weather_daily_selection.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  METEOBLUE_PROVIDER,
  fetchMeteoblueDaily,
  redactKey,
} from "@/modules/weather/providers/meteoblue";
import type { IngestionStation, ObservationIngestionResult } from "./ingestion.service";

export async function ingestMeteoblueObservations(
  supabase: SupabaseClient,
  station: IngestionStation,
  _pastDays = 7,
): Promise<ObservationIngestionResult> {
  const startedAt = Date.now();
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  let errorMessage: string | null = null;
  let status: ObservationIngestionResult["status"] = "success";
  let requestUrl: string | null = null;

  try {
    const result = await fetchMeteoblueDaily({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
    });
    requestUrl = result.requestUrl;
    const { daily } = result;

    const dates = daily.map((d) => d.date);
    const { data: existing } = await supabase
      .from("weather_readings")
      .select("id, date, is_locked")
      .eq("station_id", station.id)
      .in("date", dates);

    const byDate = new Map(
      (existing ?? []).map((r) => [r.date as string, r as { id: string; is_locked: boolean }]),
    );

    let partial = false;

    for (const d of daily) {
      const existingRow = byDate.get(d.date);
      if (existingRow?.is_locked) {
        rowsSkipped += 1;
        continue;
      }

      const rowPayload = {
        station_id: station.id,
        date: d.date,
        temp_max: d.tempMax ?? 0,
        temp_min: d.tempMin ?? 0,
        temp_mean: d.tempMean ?? (d.tempMax != null && d.tempMin != null ? (d.tempMax + d.tempMin) / 2 : 0),
        humidity: d.humidity ?? 0,
        wind_speed: d.windSpeed ?? 0,
        solar_radiation: 0,
        precipitation: d.precipitation ?? 0,
        sunshine: null,
        et0_source: null,
        et0_calculated: null,
        et0_delta: null,
        et0_delta_pct: null,
        effective_precip: null,
        data_kind: "observed",
        origin: METEOBLUE_PROVIDER,
        data_quality: "degraded",
        imported_at: new Date().toISOString(),
        is_locked: false,
      };

      if (existingRow) {
        const { error } = await supabase
          .from("weather_readings")
          .update(rowPayload)
          .eq("id", existingRow.id);
        if (error) {
          partial = true;
          errorMessage = error.message;
          rowsSkipped += 1;
        } else {
          rowsUpdated += 1;
        }
      } else {
        const { error } = await supabase.from("weather_readings").insert(rowPayload);
        if (error) {
          partial = true;
          errorMessage = error.message;
          rowsSkipped += 1;
        } else {
          rowsInserted += 1;
        }
      }
    }

    if (rowsInserted === 0 && rowsUpdated === 0) {
      status = errorMessage ? "failed" : "partial";
    } else if (partial) {
      status = "partial";
    }

    await supabase
      .from("weather_stations")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: status === "failed" ? "failed" : status === "partial" ? "degraded" : "ok",
        sync_error: status === "failed" ? errorMessage : null,
      })
      .eq("id", station.id);
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    await supabase
      .from("weather_stations")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: "failed",
        sync_error: errorMessage,
      })
      .eq("id", station.id);
  }

  const durationMs = Date.now() - startedAt;

  await supabase.from("climate_ingestion_runs").insert({
    farm_id: station.farm_id,
    station_id: station.id,
    provider: METEOBLUE_PROVIDER,
    status,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    rows_skipped: rowsSkipped,
    error_message: errorMessage,
    duration_ms: durationMs,
    request_latitude: station.latitude,
    request_longitude: station.longitude,
    request_timezone: station.timezone,
    request_url: requestUrl,
    altitude_used: station.altitude,
    altitude_origin: station.altitude_origin ?? "unknown",
    response_elevation: null,
    et0_source_avg: null,
    et0_calculated_avg: null,
    et0_delta_pct_avg: null,
  });

  return {
    station_id: station.id,
    provider: METEOBLUE_PROVIDER,
    status,
    rowsInserted,
    rowsUpdated,
    rowsSkipped,
    durationMs,
    errorMessage,
  };
}

export async function ingestMeteoblueForecast(
  supabase: SupabaseClient,
  station: IngestionStation,
  days = 7,
): Promise<{ rowsInserted: number; rowsUpdated: number; errorMessage: string | null }> {
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let errorMessage: string | null = null;

  try {
    const { daily } = await fetchMeteoblueDaily({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      forecastDays: days,
    });

    const issuedAt = new Date().toISOString();
    const issuedDay = new Date(issuedAt.slice(0, 10) + "T12:00:00Z");

    for (const d of daily) {
      const targetDay = new Date(d.date + "T12:00:00Z");
      const horizonDays = Math.round(
        (targetDay.getTime() - issuedDay.getTime()) / 86400000,
      );
      if (horizonDays < 0) continue;

      const rowPayload = {
        farm_id: station.farm_id,
        station_id: station.id,
        issued_at: issuedAt,
        target_date: d.date,
        horizon_days: horizonDays,
        provider: METEOBLUE_PROVIDER,
        external_id: null,
        temp_max: d.tempMax,
        temp_min: d.tempMin,
        temp_mean: d.tempMean,
        humidity: d.humidity,
        wind_speed: d.windSpeed,
        solar_radiation: null,
        precipitation: d.precipitation,
        precipitation_probability: null,
        et0_source: null,
        et0_calculated: null,
        imported_at: new Date().toISOString(),
      };

      const { error, data } = await supabase
        .from("weather_forecasts")
        .upsert(rowPayload, { onConflict: "station_id,issued_at,target_date" })
        .select("id");

      if (error) {
        errorMessage = error.message;
      } else if (data && data.length > 0) {
        rowsInserted += 1;
      } else {
        rowsUpdated += 1;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return { rowsInserted, rowsUpdated, errorMessage };
}
