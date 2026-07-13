// ============================================================================
// Ingestão WeatherAPI — funções destinadas ao backend
// ----------------------------------------------------------------------------
// Espelha o padrão da ingestão Open-Meteo mas:
//   • NÃO calcula ETo Cotrim (WeatherAPI free não tem Rs adequado)
//   • NÃO grava et0_source (mesmo que a API entregasse, não usamos aqui)
//   • Grava pressão atmosférica quando disponível, marcando pressure_origin
//   • Cada leitura permanece integralmente do provider 'weather_api'
//   • URL persistida em climate_ingestion_runs vem redigida do provider
//
// Nota sobre "server-only": ver mesma nota em providers/weather-api.ts.
// Este módulo é referenciado pelo provider-registry (importado tanto por
// código servidor quanto, transitivamente, por componentes cliente). As
// funções em si só são chamadas de rotas API — a chave nunca é acessada
// no browser porque `process.env.WEATHERAPI_KEY` resolve para undefined
// no bundle cliente (sem prefixo NEXT_PUBLIC_).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateEffectivePrecipitation } from "./weather.service";
import {
  fetchWeatherApiForecast,
  fetchWeatherApiHistoryDay,
  WEATHER_API_PROVIDER,
  WeatherApiError,
  type WeatherApiContext,
} from "@/modules/weather/providers/weather-api";
import type {
  IngestionStation,
  ObservationIngestionResult,
} from "./ingestion.service";

const FREE_PLAN_MAX_HISTORY_DAYS = 7;
const FREE_PLAN_MAX_FORECAST_DAYS = 3;

function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function ingestWeatherApiObservations(
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
  let firstContext: WeatherApiContext | null = null;

  const days = Math.max(1, Math.min(pastDays, FREE_PLAN_MAX_HISTORY_DAYS));

  const targets: string[] = [];
  for (let i = days; i >= 1; i -= 1) targets.push(isoDaysAgo(i));

  try {
    const { data: existing } = await supabase
      .from("weather_readings")
      .select("id, date, is_locked")
      .eq("station_id", station.id)
      .in("date", targets);

    const byDate = new Map(
      (existing ?? []).map((r) => [
        r.date as string,
        r as { id: string; is_locked: boolean },
      ]),
    );

    let partial = false;
    let fatal = false;

    for (const dateStr of targets) {
      if (fatal) break;
      const existingRow = byDate.get(dateStr);
      if (existingRow?.is_locked) {
        rowsSkipped += 1;
        continue;
      }

      let daily = null as ReturnType<
        typeof buildRowPayload
      > extends never
        ? never
        : Awaited<
            ReturnType<typeof fetchWeatherApiHistoryDay>
          >["daily"][number] | null;

      try {
        const result = await fetchWeatherApiHistoryDay({
          latitude: station.latitude,
          longitude: station.longitude,
          timezone: station.timezone || "America/Sao_Paulo",
          date: dateStr,
        });
        if (!firstContext) firstContext = result.context;
        daily = result.daily.find((d) => d.date === dateStr) ?? result.daily[0] ?? null;
      } catch (err) {
        errorMessage =
          err instanceof Error ? err.message : String(err);
        if (err instanceof WeatherApiError) {
          if (err.kind === "no_key" || err.kind === "invalid_key") {
            fatal = true;
            status = "failed";
            break;
          }
          // 429 / 5xx / timeout → tenta próxima data, marca parcial
          partial = true;
          rowsSkipped += 1;
          continue;
        }
        partial = true;
        rowsSkipped += 1;
        continue;
      }

      if (!daily) {
        rowsSkipped += 1;
        partial = true;
        continue;
      }

      const hasCore =
        daily.tempMax != null &&
        daily.tempMin != null &&
        daily.humidity != null &&
        daily.windSpeed2m != null &&
        daily.precipitation != null;
      const quality = hasCore ? "ok" : "degraded";
      if (!hasCore) partial = true;

      const rowPayload = buildRowPayload(station.id, dateStr, daily, quality);

      if (existingRow) {
        const { error } = await supabase
          .from("weather_readings")
          .update(rowPayload)
          .eq("id", existingRow.id);
        if (error) {
          errorMessage = error.message;
          rowsSkipped += 1;
          partial = true;
        } else {
          rowsUpdated += 1;
        }
      } else {
        const { error } = await supabase
          .from("weather_readings")
          .insert(rowPayload);
        if (error) {
          errorMessage = error.message;
          rowsSkipped += 1;
          partial = true;
        } else {
          rowsInserted += 1;
        }
      }
    }

    if (fatal) {
      status = "failed";
    } else if (rowsInserted === 0 && rowsUpdated === 0) {
      status = errorMessage ? "failed" : "partial";
    } else if (partial) {
      status = "partial";
    }

    await supabase
      .from("weather_stations")
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status:
          status === "failed"
            ? "failed"
            : status === "partial"
              ? "degraded"
              : "ok",
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
    provider: WEATHER_API_PROVIDER,
    status,
    rows_inserted: rowsInserted,
    rows_updated: rowsUpdated,
    rows_skipped: rowsSkipped,
    error_message: errorMessage,
    duration_ms: durationMs,
    request_latitude: station.latitude,
    request_longitude: station.longitude,
    request_timezone: station.timezone,
    request_url: firstContext?.requestUrl ?? null, // já redigida
    altitude_used: null,
    altitude_origin: null,
    response_elevation: null,
    et0_source_avg: null,
    et0_calculated_avg: null,
    et0_delta_pct_avg: null,
  });

  return {
    station_id: station.id,
    provider: WEATHER_API_PROVIDER,
    status,
    rowsInserted,
    rowsUpdated,
    rowsSkipped,
    durationMs,
    errorMessage,
  };
}

function buildRowPayload(
  stationId: string,
  dateStr: string,
  daily: {
    tempMax: number | null;
    tempMin: number | null;
    tempMean: number | null;
    humidity: number | null;
    windSpeed2m: number | null;
    precipitation: number | null;
    pressureHpa: number | null;
    conditionText: string | null;
  },
  quality: "ok" | "degraded",
) {
  const precipitation = daily.precipitation ?? 0;
  const effectivePrecip = calculateEffectivePrecipitation(precipitation);
  const tempMean =
    daily.tempMean ??
    (daily.tempMax != null && daily.tempMin != null
      ? (daily.tempMax + daily.tempMin) / 2
      : 0);
  return {
    station_id: stationId,
    date: dateStr,
    temp_max: daily.tempMax ?? 0,
    temp_min: daily.tempMin ?? 0,
    temp_mean: tempMean,
    humidity: daily.humidity ?? 0,
    wind_speed: daily.windSpeed2m ?? 0,
    solar_radiation: null, // WeatherAPI free não fornece Rs
    precipitation,
    sunshine: null,
    et0_source: null, // regra: não gravar ETo pela WeatherAPI
    et0_calculated: null, // regra: não calcular ETo Cotrim para leituras WeatherAPI
    et0_delta: null,
    et0_delta_pct: null,
    effective_precip: effectivePrecip,
    atmospheric_pressure_hpa: daily.pressureHpa,
    pressure_origin: daily.pressureHpa != null ? WEATHER_API_PROVIDER : null,
    condition_text: daily.conditionText,
    data_kind: "observed",
    origin: WEATHER_API_PROVIDER,
    data_quality: quality,
    imported_at: new Date().toISOString(),
    is_locked: false,
  };
}

// ── Forecast (até 3 dias no free) ────────────────────────────────────────────

export async function ingestWeatherApiForecast(
  supabase: SupabaseClient,
  station: IngestionStation,
  days = 3,
): Promise<{
  rowsInserted: number;
  rowsUpdated: number;
  errorMessage: string | null;
}> {
  const capped = Math.max(1, Math.min(days, FREE_PLAN_MAX_FORECAST_DAYS));
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let errorMessage: string | null = null;

  try {
    const result = await fetchWeatherApiForecast({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      days: capped,
    });
    const issuedAt = new Date().toISOString();
    const issuedDay = new Date(issuedAt.slice(0, 10) + "T12:00:00Z");
    for (const d of result.daily) {
      const targetDay = new Date(d.date + "T12:00:00Z");
      const horizonDays = Math.round(
        (targetDay.getTime() - issuedDay.getTime()) / 86400000,
      );
      const rowPayload = {
        farm_id: station.farm_id,
        station_id: station.id,
        issued_at: issuedAt,
        target_date: d.date,
        horizon_days: horizonDays,
        provider: WEATHER_API_PROVIDER,
        external_id: null,
        temp_max: d.tempMax,
        temp_min: d.tempMin,
        temp_mean: d.tempMean,
        humidity: d.humidity,
        wind_speed: d.windSpeed2m,
        solar_radiation: null,
        precipitation: d.precipitation,
        precipitation_probability: d.precipitationProbability,
        et0_source: null,
        et0_calculated: null,
        imported_at: new Date().toISOString(),
      };
      const { error, data } = await supabase
        .from("weather_forecasts")
        .upsert(rowPayload, {
          onConflict: "station_id,issued_at,target_date",
        })
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
