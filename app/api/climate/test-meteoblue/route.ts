import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureVirtualStation } from "@/modules/weather/services/virtual-station.service";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const farmId = body.farmId as string | undefined;
    if (!farmId) {
      return NextResponse.json({ error: "farmId obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();

    const { created } = await ensureVirtualStation(supabase, farmId, {
      dataSource: "meteoblue",
      priority: 6,
      namePrefix: "Estação Virtual (meteoblue)",
    });

    const runs = await ingestFarmClimate(supabase, farmId, {
      pastDays: 7,
      forecastDays: 7,
      providers: ["meteoblue"],
    });

    return NextResponse.json({
      virtualStationCreated: created,
      runs: runs.map((r) => ({
        stationId: r.station_id,
        provider: r.provider,
        status: r.status,
        rowsInserted: r.rowsInserted,
        rowsUpdated: r.rowsUpdated,
        rowsSkipped: r.rowsSkipped,
        errorMessage: r.errorMessage,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
