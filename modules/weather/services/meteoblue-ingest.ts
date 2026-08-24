// ============================================================================
// Serviço de ingestão meteoblue
// ----------------------------------------------------------------------------
// Grava dias atuais/passados elegíveis em weather_readings e futuro apenas em
// weather_forecasts. A ETo do provedor fica em et0_source para auditoria; a ETo
// operacional é sempre calculada internamente pelo núcleo FAO-56.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  METEOBLUE_PROVIDER,
  fetchMeteoblueDaily,
  type MeteoblueDaily,
} from "@/modules/weather/providers/meteoblue";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";
import type { IngestionStation, ObservationIngestionResult } from "./ingestion.service";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function addUtcDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Garante que forecast nunca seja persistido como observação operacional.
 * A API daily pode devolver uma janela que mistura hoje e futuro.
 */
export function isOperationalMeteoblueDate(
  date: string,
  today: string,
  pastDays: number,
): boolean {
  const window = Math.max(Math.trunc(pastDays), 1);
  const earliest = addUtcDays(today, -(window - 1));
  return date >= earliest && date <= today;
}

/**
 * Calcula ETo interna usando exclusivamente variáveis meteorológicas da fonte.
 * A velocidade do vento da meteoblue é válida a 10 m; o motor FAO-56 faz o
 * ajuste para 2 m.
 */
function calculateInternalEto(
  station: IngestionStation,
  day: MeteoblueDaily,
): { eto: number | null; delta: number | null; deltaPct: number | null } {
  const result = calculateReferenceEtoFao56({
    date: day.date,
    latitude: station.latitude,
    elevationM: Number.isFinite(station.altitude) ? station.altitude : null,
    temperatureMinC: day.tempMin,
    temperatureMaxC: day.tempMax,
    temperatureMeanC: day.tempMean,
    relativeHumidityMinPct: null,
    relativeHumidityMaxPct: null,
    relativeHumidityMeanPct: day.humidity,
    actualVapourPressureKpa: null,
    windSpeedMs: day.windSpeed,
    windMeasurementHeightM: 10,
    solarRadiationMjM2Day: day.solarRadiationMjM2Day,
    // O pacote expõe pressão ao nível do mar; o motor deriva P pela altitude.
    surfacePressureKpa: null,
  });

  const eto = result.etoMmDay == null ? null : round(result.etoMmDay, 2);
  const source = day.referenceEtoFaoMm;
  if (eto == null || source == null || !Number.isFinite(source)) {
    return { eto, delta: null, deltaPct: null };
  }
  const delta = round(eto - source, 2);
  const deltaPct = source > 0 ? round((delta / source) * 100, 1) : null;
  return { eto, delta, deltaPct };
}

export async function ingestMeteoblueObservations(
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
  let requestUrl: string | null = null;
  const etoSourceValues: number[] = [];
  const etoCalculatedValues: number[] = [];
  const etoDeltaPctValues: number[] = [];

  try {
    const result = await fetchMeteoblueDaily({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Bahia",
      elevationM: station.altitude,
    });
    requestUrl = result.requestUrl;

    const today = new Date().toISOString().slice(0, 10);
    const daily = result.daily.filter((d) => isOperationalMeteoblueDate(d.date, today, pastDays));
    if (daily.length === 0) {
      status = "partial";
    }

    const dates = daily.map((d) => d.date);
    const { data: existing } = dates.length > 0
      ? await supabase
          .from("weather_readings")
          .select("id, date, is_locked")
          .eq("station_id", station.id)
          .in("date", dates)
      : { data: [] };

    const byDate = new Map(
      (existing ?? []).map((r) => [r.date as string, r as { id: string; is_locked: boolean }]),
    );

    let partial = status === "partial";

    for (const d of daily) {
      const existingRow = byDate.get(d.date);
      if (existingRow?.is_locked) {
        rowsSkipped += 1;
        continue;
      }

      const internal = calculateInternalEto(station, d);
      if (d.referenceEtoFaoMm != null && Number.isFinite(d.referenceEtoFaoMm)) {
        etoSourceValues.push(d.referenceEtoFaoMm);
      }
      if (internal.eto != null) etoCalculatedValues.push(internal.eto);
      if (internal.deltaPct != null) etoDeltaPctValues.push(internal.deltaPct);

      const divergenceTooHigh = internal.deltaPct != null && Math.abs(internal.deltaPct) > 15;
      const quality = internal.eto == null || d.precipitation == null || divergenceTooHigh
        ? "degraded"
        : "ok";
      if (quality !== "ok") partial = true;

      const rowPayload = {
        station_id: station.id,
        date: d.date,
        temp_max: d.tempMax ?? null,
        temp_min: d.tempMin ?? null,
        temp_mean: d.tempMean ?? (d.tempMax != null && d.tempMin != null ? (d.tempMax + d.tempMin) / 2 : null),
        humidity: d.humidity ?? null,
        wind_speed: d.windSpeed ?? null,
        solar_radiation: d.solarRadiationMjM2Day,
        precipitation: d.precipitation ?? null,
        sunshine: null,
        et0_source: d.referenceEtoFaoMm,
        et0_calculated: internal.eto,
        et0_delta: internal.delta,
        et0_delta_pct: internal.deltaPct,
        effective_precip: null,
        data_kind: "model_estimate",
        origin: METEOBLUE_PROVIDER,
        data_quality: quality,
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
  const avg = (values: number[]) => values.length > 0
    ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 2)
    : null;

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
    et0_source_avg: avg(etoSourceValues),
    et0_calculated_avg: avg(etoCalculatedValues),
    et0_delta_pct_avg: avg(etoDeltaPctValues),
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
): Promise<{
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage: string | null;
  requestUrl: string | null;
  etoDaysReceived: number;
}> {
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let errorMessage: string | null = null;
  let requestUrl: string | null = null;
  let etoDaysReceived = 0;

  try {
    const result = await fetchMeteoblueDaily({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Bahia",
      forecastDays: days,
      elevationM: station.altitude,
    });
    requestUrl = result.requestUrl;
    const daily = result.daily.slice(0, days);
    etoDaysReceived = daily.filter((day) => day.referenceEtoFaoMm != null).length;

    const issuedAt = new Date().toISOString();
    const issuedDay = new Date(issuedAt.slice(0, 10) + "T12:00:00Z");

    for (const d of daily) {
      const targetDay = new Date(d.date + "T12:00:00Z");
      const horizonDays = Math.round(
        (targetDay.getTime() - issuedDay.getTime()) / 86400000,
      );
      if (horizonDays < 0) continue;

      const internal = calculateInternalEto(station, d);
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
        solar_radiation: d.solarRadiationMjM2Day,
        precipitation: d.precipitation,
        precipitation_probability: d.precipitationProbabilityPct,
        et0_source: d.referenceEtoFaoMm,
        et0_calculated: internal.eto,
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

  return { rowsInserted, rowsUpdated, errorMessage, requestUrl, etoDaysReceived };
}
