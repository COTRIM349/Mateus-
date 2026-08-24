import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runClimateOrchestration } from "@/modules/weather/orchestration/climateOrchestrator";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";
import { isMeteoblueAgroCronAuthorized } from "../meteoblue-agro/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function validCoordinate(latitude: number | null, longitude: number | null): boolean {
  return latitude != null && longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  // Aceita CRON_SECRET do Vercel ou o token do Supabase Vault já usado pelo
  // cron Meteoblue. Assim a migração do job não exige duplicar segredo.
  if (!isMeteoblueAgroCronAuthorized(request)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // O V3 pode recuperar continuidade em até 60 dias. Reprocessamos 60 dias
  // para não deixar a janela climática menor que a janela de recuperação do ARM.
  const { data: farms, error: farmsError } = await supabase
    .from("farms")
    .select("id,latitude,longitude")
    .eq("active", true)
    .order("created_at", { ascending: true });

  const dailyResults: Array<{
    farmId: string;
    status: "success" | "failed" | "skipped";
    runs?: number;
    selections?: number;
    error?: string;
  }> = [];

  if (farmsError) {
    dailyResults.push({ farmId: "*", status: "failed", error: farmsError.message });
  } else {
    for (const farm of farms ?? []) {
      const farmId = farm.id as string;
      const latitude = farm.latitude == null ? null : Number(farm.latitude);
      const longitude = farm.longitude == null ? null : Number(farm.longitude);
      if (!validCoordinate(latitude, longitude)) {
        dailyResults.push({ farmId, status: "skipped", error: "Coordenadas ausentes ou invalidas" });
        continue;
      }

      try {
        const runs = await ingestFarmClimate(supabase, farmId, {
          pastDays: 60,
          forecastDays: 7,
        });
        const selections = await resolveDailyRange(
          supabase,
          farmId,
          isoDate(-59),
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
