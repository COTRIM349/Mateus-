import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestOpenMeteo30MinShadow } from "@/modules/weather/services/openMeteoShadowIngestion.service";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { stationId?: string }
      | null;
    const stationId = body?.stationId?.trim();
    if (!stationId) {
      return NextResponse.json(
        { error: "stationId e obrigatorio." },
        { status: 400 },
      );
    }

    // A propria RLS garante que o usuario so encontra estacoes de fazendas
    // a que possui acesso.
    const { data: station, error: stationError } = await supabase
      .from("virtual_weather_stations")
      .select(
        "id, farm_id, name, latitude, longitude, elevation_m, timezone, target_resolution_minutes, shadow_mode, active",
      )
      .eq("id", stationId)
      .single();

    if (stationError || !station) {
      return NextResponse.json(
        { error: "Estacao virtual nao encontrada ou sem acesso." },
        { status: 404 },
      );
    }

    const result = await ingestOpenMeteo30MinShadow(supabase, station);

    return NextResponse.json({
      ok: true,
      provider: "open_meteo",
      stationId,
      shadowMode: true,
      intervalsReceived: result.intervalsReceived,
      intervalsUpserted: result.intervalsUpserted,
      fetchedAt: result.fetchedAt,
      rawPayloadId: result.rawPayloadId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha desconhecida na ingestao Open-Meteo.",
      },
      { status: 500 },
    );
  }
}
