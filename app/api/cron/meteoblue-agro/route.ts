import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ingestMeteoblueForecast,
  ingestMeteoblueObservations,
} from "@/modules/weather/services/meteoblue-ingest";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";
import { ensureVirtualStation } from "@/modules/weather/services/virtual-station.service";
import { isMeteoblueAgroCronAuthorized } from "./auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

interface VirtualStation {
  id: string;
  farm_id: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!isMeteoblueAgroCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json({
      error: "Falha na configuração do servidor climático",
      detail: err instanceof Error ? err.message : "Erro de configuração desconhecido",
    }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const serviceKeyType = serviceRoleKey.startsWith("sb_secret_")
    ? "sb_secret"
    : serviceRoleKey.startsWith("eyJ")
      ? "legacy_jwt"
      : "unknown";
  let supabaseHost = "invalid_url";
  try {
    supabaseHost = new URL(supabaseUrl).host;
  } catch {
    // createAdminClient already validates that a value exists. This diagnostic
    // intentionally exposes only the host/type/length, never a secret value.
  }

  const { data, error } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, latitude, longitude, elevation_m, timezone")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({
      error: error.message,
      diagnostic: {
        version: "2026-08-23.1",
        supabaseHost,
        serviceKeyType,
        serviceKeyLength: serviceRoleKey.length,
      },
    }, { status: 500 });
  }

  const results: Array<{
    virtualStationId: string;
    farmId: string;
    status: "success" | "failed";
    operationalRows?: number;
    forecastRows?: number;
    selections?: number;
    error?: string;
  }> = [];

  for (const virtual of (data ?? []) as VirtualStation[]) {
    try {
      const ensured = await ensureVirtualStation(supabase, virtual.farm_id, {
        dataSource: "meteoblue",
        priority: 6,
        namePrefix: "Meteoblue Agro",
      });

      const altitude = virtual.elevation_m ?? ensured.station.altitude;
      const timezone = virtual.timezone || "America/Bahia";
      const station = {
        id: ensured.station.id,
        farm_id: virtual.farm_id,
        name: ensured.station.name,
        latitude: virtual.latitude,
        longitude: virtual.longitude,
        altitude,
        altitude_origin: ensured.station.altitude_origin,
        timezone,
        data_source: "meteoblue",
      };

      const { error: stationUpdateError } = await supabase
        .from("weather_stations")
        .update({
          latitude: virtual.latitude,
          longitude: virtual.longitude,
          altitude,
          timezone,
          provider: "meteoblue",
        })
        .eq("id", ensured.station.id);
      if (stationUpdateError) throw new Error(stationUpdateError.message);

      // Primeiro grava weather_readings operacionais com ETo interna FAO-56.
      // O cron antigo atualizava somente forecast, deixando last_sync_at recente
      // sem criar dados que o balanço hídrico pudesse realmente consumir.
      const observations = await ingestMeteoblueObservations(supabase, station, 7);
      if (observations.status === "failed") {
        throw new Error(observations.errorMessage ?? "Falha na ingestão operacional Meteoblue.");
      }

      // Depois mantém a previsão de 7 dias para a tela de clima.
      const forecast = await ingestMeteoblueForecast(supabase, station, 7);
      if (forecast.errorMessage) throw new Error(forecast.errorMessage);

      // Reexecuta a seleção diária apenas na janela recente. `ok` é aprovado;
      // `degraded` permanece somente diagnóstico e não alimenta o motor hídrico.
      const selections = await resolveDailyRange(
        supabase,
        virtual.farm_id,
        isoDate(-6),
        isoDate(0),
      );

      results.push({
        virtualStationId: virtual.id,
        farmId: virtual.farm_id,
        status: "success",
        operationalRows: observations.rowsInserted + observations.rowsUpdated,
        forecastRows: forecast.rowsInserted + forecast.rowsUpdated,
        selections: selections.length,
      });
    } catch (err) {
      results.push({
        virtualStationId: virtual.id,
        farmId: virtual.farm_id,
        status: "failed",
        error: err instanceof Error ? err.message : "Falha desconhecida",
      });
    }
  }

  const failed = results.filter((result) => result.status === "failed").length;
  return NextResponse.json({
    ok: failed === 0,
    schedule: "06:15 e 18:15 America/Bahia",
    stationsProcessed: results.length,
    failed,
    results,
  }, { status: failed === results.length && failed > 0 ? 502 : 200 });
}
