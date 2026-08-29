// ============================================================================
// Serviço de ingestão meteoblue
// ----------------------------------------------------------------------------
// Grava observações/forecast da meteoblue em weather_readings com
// origin='meteoblue'. As variáveis meteorológicas alimentam o mesmo motor
// interno FAO-56 da plataforma; a ETo do pacote agro-day fica só como
// referência de auditoria. Nunca altera weather_daily_selection.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  METEOBLUE_PROVIDER,
  fetchMeteoblueDaily,
  redactKey,
  type MeteoblueDaily,
} from "@/modules/weather/providers/meteoblue";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";
import { calculateEffectivePrecipitation, validateWeatherReading } from "./weather.service";
import type { IngestionStation, ObservationIngestionResult } from "./ingestion.service";


function calculateMeteoblueInternalEto(
  station: IngestionStation,
  day: MeteoblueDaily,
): number | null {
  const elevationM =
    station.altitude_origin === "unknown" || !Number.isFinite(station.altitude)
      ? null
      : station.altitude;

  return calculateReferenceEtoFao56({
    date: day.date,
    latitude: station.latitude,
    elevationM,
    temperatureMinC: day.tempMin,
    temperatureMaxC: day.tempMax,
    temperatureMeanC: day.tempMean,
    relativeHumidityMinPct: null,
    relativeHumidityMaxPct: null,
    relativeHumidityMeanPct: day.humidity,
    actualVapourPressureKpa: null,
    windSpeedMs: day.windSpeed,
    // O pacote basic-day reporta vento de referência a 10 m; o motor
    // converte para 2 m pela FAO-56 eq. 47.
    windMeasurementHeightM: 10,
    solarRadiationMjM2Day: day.solarRadiationMjM2Day,
    // Meteoblue expõe pressão ao nível do mar; não usar como pressão de
    // superfície. O motor deriva P pela altitude da fazenda quando disponível.
    surfacePressureKpa: null,
  }).etoMmDay;
}

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
      timezone: station.timezone || "America/Bahia",
      elevationM: station.altitude,
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

      const et0Calculated = calculateMeteoblueInternalEto(station, d);
      const precipitation = d.precipitation ?? null;
      const effectivePrecip = precipitation != null
        ? calculateEffectivePrecipitation(precipitation)
        : null;
      const validationIssues = validateWeatherReading({
        et0_calculated: et0Calculated,
        precipitation,
        temp_max: d.tempMax,
        temp_min: d.tempMin,
        temp_mean: d.tempMean,
        humidity: d.humidity,
        wind_speed: d.windSpeed,
        solar_radiation: d.solarRadiationMjM2Day,
      });
      const hasValidationError = validationIssues.some((issue) => issue.level === "error");

      const et0Delta = et0Calculated != null && d.referenceEtoFaoMm != null
        ? et0Calculated - d.referenceEtoFaoMm
        : null;
      const et0DeltaPct = et0Delta != null && d.referenceEtoFaoMm != null && d.referenceEtoFaoMm !== 0
        ? (et0Delta / d.referenceEtoFaoMm) * 100
        : null;

      const rowPayload = {
        station_id: station.id,
        date: d.date,
        temp_max: d.tempMax ?? null,
        temp_min: d.tempMin ?? null,
        temp_mean: d.tempMean ?? (d.tempMax != null && d.tempMin != null ? (d.tempMax + d.tempMin) / 2 : null),
        humidity: d.humidity ?? null,
        humidity_min: null,
        humidity_max: null,
        wind_speed: d.windSpeed ?? null,
        // GHI diário recebido do solar-day e normalizado para MJ/m²/dia.
        solar_radiation: d.solarRadiationMjM2Day,
        precipitation,
        sunshine: null,
        // ETo do provedor é somente referência; a canônica é sempre interna.
        et0_source: d.referenceEtoFaoMm,
        et0_calculated: et0Calculated,
        et0_delta: et0Delta,
        et0_delta_pct: et0DeltaPct,
        effective_precip: effectivePrecip,
        data_kind: "model_estimate",
        origin: METEOBLUE_PROVIDER,
        data_quality: et0Calculated == null || hasValidationError ? "degraded" : "ok",
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

      const et0Calculated = calculateMeteoblueInternalEto(station, d);
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
        humidity_min: null,
        humidity_max: null,
        wind_speed: d.windSpeed,
        solar_radiation: d.solarRadiationMjM2Day,
        precipitation: d.precipitation,
        precipitation_probability: d.precipitationProbabilityPct,
        // Valor fornecido pela própria Meteoblue: apenas auditoria/comparação.
        et0_source: d.referenceEtoFaoMm,
        // ETo canônica calculada pela Cotrim com o mesmo motor diário.
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
