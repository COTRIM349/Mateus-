import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runClimateOrchestration } from "@/modules/weather/orchestration/climateOrchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: stations, error } = await supabase
    .from("virtual_weather_stations")
    .select("id")
    .eq("active", true)
    .eq("shadow_mode", true)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ stationId: string; status: string; runId?: string; error?: string }> = [];
  for (const station of stations ?? []) {
    try {
      const result = await runClimateOrchestration(supabase, {
        virtualStationId: station.id as string,
        triggerType: "cron",
      });
      results.push({ stationId: station.id as string, status: result.status, runId: result.runId });
    } catch (err) {
      results.push({
        stationId: station.id as string,
        status: "failed",
        error: err instanceof Error ? err.message : "Falha desconhecida",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    stationsProcessed: results.length,
    results,
  });
}
