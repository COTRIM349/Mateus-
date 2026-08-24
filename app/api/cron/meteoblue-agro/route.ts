import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestMeteoblueForecast } from "@/modules/weather/services/meteoblue-ingest";
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
        version: "2026-08-11.2",
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
    etoDaysReceived?: number;
    rowsWritten?: number;
    error?: string;
  }> = [];

  for (const virtual of (data ?? []) as VirtualStation[]) {
    const startedAt = Date.now();
    try {
      const ensured = await ensureVirtualStation(supabase, virtual.farm_id, {
        dataSource: "meteoblue",
        priority: 6,
        namePrefix: "Meteoblue Agro",
      });

      const altitude = virtual.elevation_m ?? ensured.station.altitude;
      const timezone = virtual.timezone || "America/Bahia";

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

      const result = await ingestMeteoblueForecast(supabase, {
        id: ensured.station.id,
        farm_id: virtual.farm_id,
        name: ensured.station.name,
        latitude: virtual.latitude,
        longitude: virtual.longitude,
        altitude,
        altitude_origin: ensured.station.altitude_origin,
        timezone,
        data_source: "meteoblue",
      }, 7);

      if (result.errorMessage) throw new Error(result.errorMessage);
      if (result.etoDaysReceived === 0) {
        throw new Error("O pacote respondeu, mas não retornou ETo FAO em nenhum dia.");
      }

      await Promise.all([
        supabase
          .from("weather_stations")
          .update({
            last_sync_at: new Date().toISOString(),
            sync_status: "ok",
            sync_error: null,
          })
          .eq("id", ensured.station.id),
        supabase.from("climate_ingestion_runs").insert({
          farm_id: virtual.farm_id,
          station_id: ensured.station.id,
          provider: "meteoblue",
          status: "success",
          rows_inserted: result.rowsInserted,
          rows_updated: result.rowsUpdated,
          rows_skipped: 0,
          duration_ms: Date.now() - startedAt,
          request_latitude: virtual.latitude,
          request_longitude: virtual.longitude,
          request_timezone: timezone,
          request_url: result.requestUrl,
          altitude_used: altitude,
          altitude_origin: ensured.station.altitude_origin ?? "unknown",
        }),
      ]);

      results.push({
        virtualStationId: virtual.id,
        farmId: virtual.farm_id,
        status: "success",
        etoDaysReceived: result.etoDaysReceived,
        rowsWritten: result.rowsInserted + result.rowsUpdated,
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
