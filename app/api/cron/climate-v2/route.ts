import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runClimateOrchestration } from "@/modules/weather/orchestration/climateOrchestrator";
import { ingestFarmClimate, ingestOpenMeteoObservations, type IngestionStation } from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";
import { isMeteoblueAgroCronAuthorized } from "../meteoblue-agro/auth";
import { summarizeDailySelections, validFarmCoordinate } from "./guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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

  // Recupera 110 dias de ETo operacional, incluindo arquivo histórico fora
  // da janela de 92 dias do endpoint de observações recentes.
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
    approved?: number;
    blocked?: number;
    blockedDates?: Array<{ date: string; reason: string }>;
    error?: string;
  }> = [];

  if (farmsError) {
    dailyResults.push({ farmId: "*", status: "failed", error: farmsError.message });
  } else {
    for (const farm of farms ?? []) {
      const farmId = farm.id as string;
      const latitude = farm.latitude == null ? null : Number(farm.latitude);
      const longitude = farm.longitude == null ? null : Number(farm.longitude);
      if (!validFarmCoordinate(latitude, longitude)) {
        dailyResults.push({ farmId, status: "skipped", error: "Coordenadas ausentes ou invalidas" });
        continue;
      }

      try {
        const runs = await ingestFarmClimate(supabase, farmId, {
          pastDays: 92,
          forecastDays: 7,
        });
        // A API recente não cobre o início da safra. O arquivo histórico passa
        // pelo mesmo cálculo FAO-56 e controle de qualidade, sem ETo fixa.
        const { data: archiveStations, error: archiveStationsError } = await supabase
          .from("weather_stations")
          .select("id,farm_id,name,latitude,longitude,altitude,altitude_origin,timezone,data_source")
          .eq("farm_id", farmId)
          .eq("active", true)
          .eq("data_source", "open_meteo");
        if (archiveStationsError) throw new Error(archiveStationsError.message);
        for (const station of (archiveStations ?? []) as IngestionStation[]) {
          const backfill = await ingestOpenMeteoObservations(
            supabase, station, 92, "model_estimate",
            { startDate: isoDate(-109), endDate: isoDate(-92) },
          );
          if (backfill.status === "failed") {
            throw new Error(`Falha no arquivo Open-Meteo: ${backfill.station_id}`);
          }
        }
        const selections = await resolveDailyRange(
          supabase,
          farmId,
          isoDate(-109),
          isoDate(0),
        );
        const audit = summarizeDailySelections(selections);
        dailyResults.push({
          farmId,
          status: "success",
          runs: runs.length,
          ...audit,
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
