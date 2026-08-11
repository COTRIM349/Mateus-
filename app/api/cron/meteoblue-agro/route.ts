import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestMeteoblueForecast } from "@/modules/weather/services/meteoblue-ingest";
import { ensureVirtualStation } from "@/modules/weather/services/virtual-station.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

interface VirtualStation {
  id: string;
  farm_id: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, latitude, longitude, elevation_m, timezone")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
