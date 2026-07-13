// ============================================================================
// POST /api/climate/test-weather-api
// ----------------------------------------------------------------------------
// Autenticado por sessão (RLS aplica). Fluxo:
//   1) Garante que existe estação virtual WeatherAPI (data_source='weather_api',
//      priority=6) para a fazenda solicitada — idempotente.
//   2) Sincroniza APENAS o provider WeatherAPI (não toca Open-Meteo).
//   3) NÃO chama resolveDailyRange — a seleção diária do balanço não é
//      alterada por este endpoint (regra do usuário).
//   4) Devolve resultado da execução para exibição imediata na UI.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureVirtualStation } from "@/modules/weather/services/virtual-station.service";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";
import { WEATHER_API_PROVIDER } from "@/modules/weather/providers/weather-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  let body: { farmId?: string; pastDays?: number; forecastDays?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo JSON inválido" }, { status: 400 });
  }
  if (!body.farmId) {
    return NextResponse.json(
      { error: "farmId é obrigatório" },
      { status: 400 },
    );
  }

  // RLS: usuário só enxerga fazendas suas.
  const { data: farm } = await supabase
    .from("farms")
    .select("id")
    .eq("id", body.farmId)
    .maybeSingle();
  if (!farm) {
    return NextResponse.json({ error: "fazenda inacessível" }, { status: 403 });
  }

  // 1) Estação virtual WeatherAPI (P6) — abaixo de Open-Meteo (P5).
  let created = false;
  try {
    const result = await ensureVirtualStation(supabase, body.farmId, {
      dataSource: WEATHER_API_PROVIDER,
      priority: 6,
      namePrefix: "Estação Virtual WeatherAPI",
    });
    created = result.created;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // 2) Sincroniza somente o provider WeatherAPI.
  try {
    const pastDays = Math.max(1, Math.min(body.pastDays ?? 7, 7));
    const forecastDays = Math.max(1, Math.min(body.forecastDays ?? 3, 3));
    const runs = await ingestFarmClimate(supabase, body.farmId, {
      pastDays,
      forecastDays,
      providers: [WEATHER_API_PROVIDER],
    });
    // 3) NÃO chamamos resolveDailyRange aqui (regra: não alterar
    //    weather_daily_selection automaticamente).
    return NextResponse.json({
      farmId: body.farmId,
      virtualStationCreated: created,
      runs,
      window: { pastDays, forecastDays },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
