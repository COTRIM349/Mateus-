// ============================================================================
// POST /api/climate/ingest
// ----------------------------------------------------------------------------
// Aciona a ingestão climática (observação + forecast + resolução diária) para
// uma ou mais fazendas via Open-Meteo.
//
// Autenticação: header `x-cron-secret` deve bater com CLIMATE_CRON_SECRET.
// Isso permite acionamento por serviços de cron (Vercel Cron, Supabase pg_cron
// via net.http_post, GitHub Actions, etc.) sem depender de sessão de usuário.
//
// Body (JSON):
//   { farmId?: string;      // uma fazenda específica; ausente = todas as ativas
//     pastDays?: number;    // dias observados a buscar (default 7)
//     forecastDays?: number // dias de forecast (default 7)
//   }
//
// Response:
//   { runs: [...ObservationIngestionResult], selections: number }
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  ingestFarmClimate,
  type ObservationIngestionResult,
} from "@/modules/weather/services/ingestion.service";
import { resolveDailyRange } from "@/modules/weather/services/source-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos.",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const expected = process.env.CLIMATE_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CLIMATE_CRON_SECRET não configurado no servidor." },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-cron-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: { farmId?: string; pastDays?: number; forecastDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    // corpo vazio é aceito
  }

  const pastDays = Math.max(1, Math.min(body.pastDays ?? 7, 92));
  const forecastDays = Math.max(1, Math.min(body.forecastDays ?? 7, 16));

  let supabase;
  try {
    supabase = serviceRoleClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // Descobre quais fazendas processar.
  let farmIds: string[] = [];
  if (body.farmId) {
    farmIds = [body.farmId];
  } else {
    const { data, error } = await supabase.from("farms").select("id");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    farmIds = (data ?? []).map((f) => f.id as string);
  }

  const allRuns: ObservationIngestionResult[] = [];
  let selectionCount = 0;
  const errors: string[] = [];

  const startDate = isoDate(-(pastDays - 1));
  const endDate = isoDate(0);

  for (const farmId of farmIds) {
    try {
      const runs = await ingestFarmClimate(supabase, farmId, { pastDays, forecastDays });
      allRuns.push(...runs);
      const selections = await resolveDailyRange(supabase, farmId, startDate, endDate);
      selectionCount += selections.length;
    } catch (err) {
      errors.push(`${farmId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    farms: farmIds.length,
    runs: allRuns,
    selections: selectionCount,
    errors,
    window: { startDate, endDate, pastDays, forecastDays },
  });
}
