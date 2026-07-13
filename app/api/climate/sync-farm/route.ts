// ============================================================================
// POST /api/climate/sync-farm  (Sprint 5.2)
// ----------------------------------------------------------------------------
// Sincroniza a estação virtual + demais fontes automáticas de uma fazenda,
// acionado pelo usuário na tela Clima. Usa a sessão autenticada (cookies) —
// RLS garante que o usuário só consiga sincronizar fazendas às quais tem
// acesso. Não requer CLIMATE_CRON_SECRET.
//
// Body (JSON):
//   { farmId: string;      // obrigatório
//     pastDays?: number;   // 1..92 (default 7)
//     forecastDays?: number; // 1..16 (default 7)
//     ensureVirtual?: boolean; // se true, garante estação virtual antes de sincronizar
//   }
//
// Response:
//   { runs, selections, virtualStationCreated, farmId }
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestFarmClimate } from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";
import { ensureVirtualStation } from "@/modules/weather/services/virtual-station.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  let body: {
    farmId?: string;
    pastDays?: number;
    forecastDays?: number;
    ensureVirtual?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo JSON inválido" }, { status: 400 });
  }

  if (!body.farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  // RLS: se o usuário não tiver acesso à fazenda, o select retorna vazio.
  const { data: farm, error: farmErr } = await supabase
    .from("farms")
    .select("id")
    .eq("id", body.farmId)
    .maybeSingle();
  if (farmErr || !farm) {
    return NextResponse.json({ error: "fazenda inacessível" }, { status: 403 });
  }

  const pastDays = Math.max(1, Math.min(body.pastDays ?? 7, 92));
  const forecastDays = Math.max(1, Math.min(body.forecastDays ?? 7, 16));

  let virtualStationCreated = false;
  if (body.ensureVirtual) {
    try {
      const result = await ensureVirtualStation(supabase, body.farmId);
      virtualStationCreated = result.created;
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "falha ao garantir estação virtual",
        },
        { status: 400 },
      );
    }
  }

  try {
    const runs = await ingestFarmClimate(supabase, body.farmId, {
      pastDays,
      forecastDays,
    });
    const selections = await resolveDailyRange(
      supabase,
      body.farmId,
      isoDate(-(pastDays - 1)),
      isoDate(0),
    );
    return NextResponse.json({
      farmId: body.farmId,
      virtualStationCreated,
      runs,
      selections: selections.length,
      window: { pastDays, forecastDays },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
