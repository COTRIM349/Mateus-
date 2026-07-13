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

/** Categoria de dado que um provedor grava em weather_readings.data_kind. */
type ProviderDataKind = "observed" | "historical_grid";

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
  altitude_origin?: string | null;
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

/**
 * Resolve a altitude a usar em calculateET0 seguindo a cascata:
 *  1. Se a estação já tem altitude > 0 e origem 'manual'/'physical', mantém.
 *  2. Senão usa a `elevation` retornada pelo Open-Meteo.
 *  3. Senão marca 'unknown' e usa 0 (com data_quality degradada).
 */
function resolveAltitude(
  station: IngestionStation & { altitude_origin?: string | null },
  elevationFromProvider: number | null,
): { altitude: number; origin: "manual" | "open_meteo" | "physical" | "unknown" } {
  const currentOrigin = (station.altitude_origin as string | undefined) ?? "unknown";
  if (
    (currentOrigin === "manual" || currentOrigin === "physical") &&
    typeof station.altitude === "number" &&
    Number.isFinite(station.altitude) &&
    station.altitude > 0
  ) {
    return { altitude: station.altitude, origin: currentOrigin as "manual" | "physical" };
  }
  if (elevationFromProvider != null && Number.isFinite(elevationFromProvider)) {
    return { altitude: elevationFromProvider, origin: "open_meteo" };
  }
  if (
    typeof station.altitude === "number" &&
    Number.isFinite(station.altitude) &&
    station.altitude > 0
  ) {
    return { altitude: station.altitude, origin: "manual" };
  }
  return { altitude: 0, origin: "unknown" };
}

export async function ingestOpenMeteoObservations(
  supabase: SupabaseClient,
  station: IngestionStation,
  pastDays = 7,
  dataKind: ProviderDataKind = "observed",
): Promise<ObservationIngestionResult> {
  const startedAt = Date.now();
  let rowsInserted = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;
  let errorMessage: string | null = null;
  let status: ObservationIngestionResult["status"] = "success";

  // Contexto de auditoria — preenchido dentro do try; usado no INSERT de runs.
  let requestUrl: string | null = null;
  let responseElevation: number | null = null;
  let altitudeUsed: number | null = null;
  let altitudeOrigin: string | null = null;
  let et0SourceSum = 0;
  let et0CalcSum = 0;
  let et0PairsCount = 0;
  let et0DeltaPctSum = 0;

  try {
    const result = await fetchRecentObservations({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      pastDays,
    });
    const { context, daily } = result;
    requestUrl = context.requestUrl;
    responseElevation = context.elevation;

    const resolved = resolveAltitude(
      station as IngestionStation & { altitude_origin?: string },
      context.elevation,
    );
    altitudeUsed = resolved.altitude;
    altitudeOrigin = resolved.origin;

    // Se a origem virou open_meteo (não era manual/física), persiste na estação
    // para futuras execuções não precisarem consultar o provedor de novo.
    if (
      resolved.origin === "open_meteo" &&
      (station.altitude ?? 0) !== resolved.altitude
    ) {
      await supabase
        .from("weather_stations")
        .update({
          altitude: resolved.altitude,
          altitude_origin: "open_meteo",
        })
        .eq("id", station.id);
    }

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
            altitude: resolved.altitude,
            latitude: station.latitude,
            dayOfYear: dayOfYear(d.date),
          })
        : null;

      const precipitation = d.precipitation ?? 0;
      const effectivePrecip = calculateEffectivePrecipitation(precipitation);

      // Delta ET₀ Cotrim × Open-Meteo
      let et0Delta: number | null = null;
      let et0DeltaPct: number | null = null;
      if (et0Calculated != null && d.et0Source != null) {
        et0Delta = et0Calculated - d.et0Source;
        if (d.et0Source !== 0) {
          et0DeltaPct = (et0Delta / d.et0Source) * 100;
          et0SourceSum += d.et0Source;
          et0CalcSum += et0Calculated;
          et0DeltaPctSum += Math.abs(et0DeltaPct);
          et0PairsCount += 1;
        }
      }

      // Qualidade: degradada se ET₀ não pôde ser calculada, se altitude é
      // desconhecida, ou se a divergência com a fonte passar de 15%.
      let quality: "ok" | "degraded" = canComputeEt0 ? "ok" : "degraded";
      if (!canComputeEt0) partial = true;
      if (resolved.origin === "unknown") {
        quality = "degraded";
        partial = true;
      }
      if (et0DeltaPct != null && Math.abs(et0DeltaPct) > 15) {
        quality = "degraded";
      }

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
        et0_delta: et0Delta,
        et0_delta_pct: et0DeltaPct,
        effective_precip: effectivePrecip,
        data_kind: dataKind,
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

  const et0SourceAvg = et0PairsCount > 0 ? et0SourceSum / et0PairsCount : null;
  const et0CalcAvg = et0PairsCount > 0 ? et0CalcSum / et0PairsCount : null;
  const et0DeltaPctAvg = et0PairsCount > 0 ? et0DeltaPctSum / et0PairsCount : null;

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
    request_latitude: station.latitude,
    request_longitude: station.longitude,
    request_timezone: station.timezone,
    request_url: requestUrl,
    altitude_used: altitudeUsed,
    altitude_origin: altitudeOrigin,
    response_elevation: responseElevation,
    et0_source_avg: et0SourceAvg,
    et0_calculated_avg: et0CalcAvg,
    et0_delta_pct_avg: et0DeltaPctAvg,
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
    const { issuedAt, daily, context } = await fetchForecast({
      latitude: station.latitude,
      longitude: station.longitude,
      timezone: station.timezone || "America/Sao_Paulo",
      days,
    });

    const resolved = resolveAltitude(
      station as IngestionStation & { altitude_origin?: string },
      context.elevation,
    );
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
            altitude: resolved.altitude,
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

// ── Ingestão completa despachada por registry de provedores ─────────────────
// Estas funções não conhecem provedores específicos: consultam o registry.
// Importam de forma tardia para evitar ciclo (registry importa daqui).

export async function ingestFarmClimate(
  supabase: SupabaseClient,
  farmId: string,
  options: {
    pastDays?: number;
    forecastDays?: number;
    /** Se informado, sincroniza apenas provedores nessa lista. */
    providers?: string[];
  } = {},
): Promise<ObservationIngestionResult[]> {
  const { getProvider, listProviderKeys } = await import("./provider-registry");

  const registered = listProviderKeys();
  const filter =
    options.providers && options.providers.length > 0
      ? options.providers.filter((k) => registered.includes(k))
      : registered;

  const { data: stations, error } = await supabase
    .from("weather_stations")
    .select(
      "id, farm_id, name, latitude, longitude, altitude, altitude_origin, timezone, data_source",
    )
    .eq("farm_id", farmId)
    .eq("active", true)
    .in("data_source", filter);

  if (error) throw new Error(error.message);

  const results: ObservationIngestionResult[] = [];
  for (const s of (stations ?? []) as IngestionStation[]) {
    const provider = getProvider(s.data_source);
    if (!provider) continue; // nenhum handler registrado — pula silenciosamente
    const obs = await provider.ingestObservations(supabase, s, options.pastDays ?? 7);
    results.push(obs);
    if (provider.ingestForecast) {
      await provider.ingestForecast(supabase, s, options.forecastDays ?? 7);
    }
  }
  return results;
}
