import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runClimateOrchestration } from "@/modules/weather/orchestration/climateOrchestrator";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Pipeline diário operacional. Reprocessa os últimos 30 dias porque o mapa
  // hídrico mantém uma janela histórica de 30 dias e exige série contínua.
  const { data: farms, error: farmsError } = await supabase
    .from("farms")
    .select("id")
    .order("created_at", { ascending: true });

  const dailyResults: Array<{
    farmId: string;
    status: "success" | "failed";
    runs?: number;
    selections?: number;
    error?: string;
  }> = [];

  if (farmsError) {
    dailyResults.push({ farmId: "*", status: "failed", error: farmsError.message });
  } else {
    for (const farm of farms ?? []) {
      const farmId = farm.id as string;
      try {
        const runs = await ingestFarmClimate(supabase, farmId, {
          pastDays: 30,
          forecastDays: 7,
        });
        const selections = await resolveDailyRange(
          supabase,
          farmId,
          isoDate(-29),
          isoDate(0),
        );
        dailyResults.push({
          farmId,
          status: "success",
          runs: runs.length,
          selections: selections.length,
        });
      } catch (err) {
        dailyResults.push({
          farmId,
          status: "failed",
          error: err instanceof Error ? err.message : "Falha desconhecida",
        });
      }
    }
  }

  // Pipeline CLIMA V2 / shadow de 30 min: consenso multi-provider e ETo interna.
  const { data: stations, error } = await supabase
    .from("virtual_weather_stations")
    .select("id")
    .eq("active", true)
    .eq("shadow_mode", true)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({
      ok: false,
      dailyResults,
      error: error.message,
    }, { status: 500 });
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

  const dailyFailed = dailyResults.some((r) => r.status === "failed");
  const shadowFailed = results.some((r) => r.status === "failed");
  return NextResponse.json({
    ok: !dailyFailed && !shadowFailed,
    dailyResults,
    stationsProcessed: results.length,
    results,
  });
}
