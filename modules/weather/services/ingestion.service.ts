// ============================================================================
// Serviço de ingestão climática (Sprint 5.1)
// ----------------------------------------------------------------------------
// Orquestra: fetch (provider) → valida → calcula ET₀ e chuva efetiva →
// upsert em weather_readings / weather_forecasts → atualiza status da
// estação → registra climate_ingestion_runs.
//
// Recebe um cliente Supabase por injeção (o chamador escolhe: serviço role
// para cron, ou anon para acionamento pelo usuário — RLS aplicará).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateET0 } from "@/modules/irrigation/services/irrigation.service";
import { calculateEffectivePrecipitation, validateWeatherReading } from "./weather.service";
import {
  fetchRecentObservations,
  fetchForecast,
  OPEN_METEO_PROVIDER,
  type OpenMeteoDaily,
} from "@/modules/weather/providers/open-meteo";

// Considera dados suficientes para calcular ET₀ pelo Penman-Monteith FAO-56.
function hasEt0Inputs(d: OpenMeteoDaily): boolean {
  return (
    d.tempMax != null &&
    d.tempMin != null &&
    d.humidity != null &&
    d.windSpeed2m != null &&
    d.solarRadiation != null &&
    d.tempMin <= d.tempMax
  );
}

function dayOfYear(dateIso: string): number {
  const d = new Date(dateIso + "T12:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

// ── Estação alvo da ingestão ─────────────────────────────────────────────────

export interface IngestionStation {
  id: string;
  farm_id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timezone: string;
  data_source: string;
}

// ── Resultado da ingestão observada por estação ──────────────────────────────

export interface ObservationIngestionResult {
  station_id: string;
  provider: string;
  status: "success" | "partial" | "failed";
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  durationMs: number;
  errorMessage: string | null;
}

// ── Ingestão de observações recentes de uma estação ──────────────────────────

export async function ingestOpenMeteoObservations(
  supabase: SupabaseClient,
  station: IngestionStation,
  pastDays = 7,
): Promise<ObservationIngestionResult> {
  const startedAt = Date.now();
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  let errorMessage: string | null = null;
  let status: ObservationIngestionResult["status"] = "success";

  try {
    const daily = await fetchRecentObservations({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      pastDays,
    });

    // Carrega linhas existentes para respeitar is_locked e diferenciar
    // insert de update.
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

      const canComputeEt0 = hasEt0Inputs(d);
      const et0Calculated = canComputeEt0
        ? calculateET0({
            tempMax: d.tempMax as number,
            tempMin: d.tempMin as number,
            humidity: d.humidity as number,
            windSpeed: d.windSpeed2m as number,
            solarRadiation: d.solarRadiation as number,
            altitude: station.altitude ?? 0,
            latitude: station.latitude,
            dayOfYear: dayOfYear(d.date),
          })
        : null;

      const precipitation = d.precipitation ?? 0;
      const effectivePrecip = calculateEffectivePrecipitation(precipitation);

      const quality = canComputeEt0 ? "ok" : "degraded";
      if (!canComputeEt0) partial = true;

      const rowPayload = {
        station_id: station.id,
        date: d.date,
        temp_max: d.tempMax ?? 0,
        temp_min: d.tempMin ?? 0,
        temp_mean:
          d.tempMean ??
          (d.tempMax != null && d.tempMin != null ? (d.tempMax + d.tempMin) / 2 : 0),
        humidity: d.humidity ?? 0,
        wind_speed: d.windSpeed2m ?? 0,
        solar_radiation: d.solarRadiation ?? 0,
        precipitation,
        sunshine: null,
        et0_source: d.et0Source,
        et0_calculated: et0Calculated,
        effective_precip: effectivePrecip,
        data_kind: "observed",
        origin: OPEN_METEO_PROVIDER,
        data_quality: quality,
        imported_at: new Date().toISOString(),
        is_locked: false,
      };

      const issues = validateWeatherReading({
        et0_calculated: et0Calculated,
        precipitation,
        temp_max: rowPayload.temp_max,
        temp_min: rowPayload.temp_min,
        temp_mean: rowPayload.temp_mean,
        humidity: rowPayload.humidity,
        wind_speed: rowPayload.wind_speed,
        solar_radiation: rowPayload.solar_radiation,
      });
      const hasError = issues.some((i) => i.level === "error");
      if (hasError) {
        rowsSkipped += 1;
        partial = true;
        continue;
      }

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
    provider: OPEN_METEO_PROVIDER,
    status,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    rows_skipped: rowsSkipped,
    error_message: errorMessage,
    duration_ms: durationMs,
  });

  return {
    station_id: station.id,
    provider: OPEN_METEO_PROVIDER,
    status,
    rowsInserted,
    rowsUpdated,
    rowsSkipped,
    durationMs,
    errorMessage,
  };
}

// ── Ingestão de forecast de uma estação ──────────────────────────────────────

export async function ingestOpenMeteoForecast(
  supabase: SupabaseClient,
  station: IngestionStation,
  days = 7,
): Promise<{ rowsInserted: number; rowsUpdated: number; errorMessage: string | null }> {
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let errorMessage: string | null = null;

  try {
    const { issuedAt, daily } = await fetchForecast({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      days,
    });

    const issuedDay = new Date(issuedAt.slice(0, 10) + "T12:00:00Z");

    for (const d of daily) {
      const targetDay = new Date(d.date + "T12:00:00Z");
      const horizonDays = Math.round(
        (targetDay.getTime() - issuedDay.getTime()) / 86400000,
      );

      const canComputeEt0 = hasEt0Inputs(d);
      const et0Calculated = canComputeEt0
        ? calculateET0({
            tempMax: d.tempMax as number,
            tempMin: d.tempMin as number,
            humidity: d.humidity as number,
            windSpeed: d.windSpeed2m as number,
            solarRadiation: d.solarRadiation as number,
            altitude: station.altitude ?? 0,
            latitude: station.latitude,
            dayOfYear: dayOfYear(d.date),
          })
        : null;

      const rowPayload = {
        farm_id: station.farm_id,
        station_id: station.id,
        issued_at: issuedAt,
        target_date: d.date,
        horizon_days: horizonDays,
        provider: OPEN_METEO_PROVIDER,
        external_id: null,
        temp_max: d.tempMax,
        temp_min: d.tempMin,
        temp_mean: d.tempMean,
        humidity: d.humidity,
        wind_speed: d.windSpeed2m,
        solar_radiation: d.solarRadiation,
        precipitation: d.precipitation,
        precipitation_probability: d.precipitationProbability,
        et0_source: d.et0Source,
        et0_calculated: et0Calculated,
        imported_at: new Date().toISOString(),
      };

      const { error, data } = await supabase
        .from("weather_forecasts")
        .upsert(rowPayload, { onConflict: "station_id,issued_at,target_date" })
        .select("id");

      if (error) {
        errorMessage = error.message;
      } else if (data && data.length > 0) {
        rowsInserted += 1; // upsert conta como inserção lógica para o log
      } else {
        rowsUpdated += 1;
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return { rowsInserted, rowsUpdated, errorMessage };
}

// ── Ingestão completa (observado + forecast) para uma fazenda ────────────────

export async function ingestFarmClimate(
  supabase: SupabaseClient,
  farmId: string,
  options: { pastDays?: number; forecastDays?: number } = {},
): Promise<ObservationIngestionResult[]> {
  const { data: stations, error } = await supabase
    .from("weather_stations")
    .select(
      "id, farm_id, name, latitude, longitude, altitude, timezone, data_source",
    )
    .eq("farm_id", farmId)
    .eq("active", true)
    .eq("data_source", OPEN_METEO_PROVIDER);

  if (error) throw new Error(error.message);

  const results: ObservationIngestionResult[] = [];
  for (const s of (stations ?? []) as IngestionStation[]) {
    const obs = await ingestOpenMeteoObservations(supabase, s, options.pastDays ?? 7);
    results.push(obs);
    await ingestOpenMeteoForecast(supabase, s, options.forecastDays ?? 7);
  }
  return results;
}
