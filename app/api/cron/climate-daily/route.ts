import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";
import { isMeteoblueAgroCronAuthorized } from "../meteoblue-agro/auth";
import { validFarmCoordinate } from "../climate-v2/guards";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!isMeteoblueAgroCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: farms, error: farmsError } = await supabase
    .from("farms")
    .select("id,latitude,longitude")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (farmsError) {
    return NextResponse.json({ ok: false, error: farmsError.message }, { status: 500 });
  }

  const results: Array<{
    farmId: string;
    status: "success" | "partial" | "failed" | "skipped";
    providers?: number;
    selections?: number;
    error?: string;
  }> = [];

  for (const farm of farms ?? []) {
    const farmId = farm.id as string;
    const latitude = farm.latitude == null ? null : Number(farm.latitude);
    const longitude = farm.longitude == null ? null : Number(farm.longitude);

    if (!validFarmCoordinate(latitude, longitude)) {
      results.push({
        farmId,
        status: "skipped",
        error: "Coordenadas ausentes ou inválidas",
      });
      continue;
    }

    try {
      const runs = await ingestFarmClimate(supabase, farmId, {
        pastDays: 3,
        forecastDays: 7,
      });

      const selections = await resolveDailyRange(
        supabase,
        farmId,
        isoDate(-2),
        isoDate(0),
      );

      const failedRun = runs.some((run) => run.status === "failed");
      const partialRun = runs.some((run) => run.status === "partial");

      results.push({
        farmId,
        status: failedRun ? "failed" : partialRun ? "partial" : "success",
        providers: runs.length,
        selections: selections.length,
      });
    } catch (error) {
      results.push({
        farmId,
        status: "failed",
        error: error instanceof Error ? error.message : "Falha desconhecida",
      });
    }
  }

  return NextResponse.json({
    ok: !results.some((result) => result.status === "failed"),
    processedAt: new Date().toISOString(),
    farmsProcessed: results.length,
    results,
  });
}
