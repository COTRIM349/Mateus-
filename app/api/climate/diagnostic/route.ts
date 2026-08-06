// ============================================================================
// POST /api/climate/diagnostic  (Etapa 5 — Shadow Mode)
// ----------------------------------------------------------------------------
// Executa o Diagnóstico Climático em Shadow Mode. Chamada REAL à Open-Meteo,
// cálculo interno FAO-56, comparação com a ETo atual do sistema.
//
// Autenticação: sessão do usuário (cookies). RLS filtra `farms` e
// `weather_stations` por acesso; coordenadas são resolvidas SERVER-SIDE
// a partir da fazenda — o cliente NÃO envia lat/lon.
//
// Body (JSON):
//   { farmId: string;   // obrigatório — precisa ser acessível ao usuário
//     days: 7 | 14 | 30 // default 7
//   }
//
// Response 200: DiagnosticResponse (climateDiagnosticService).
// Response 400/401/403/500/502 com { error }.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_DIAGNOSTIC_DAYS,
  runClimateDiagnostic,
  type AllowedDiagnosticDays,
} from "@/modules/weather/diagnostics/climateDiagnosticService";

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

  let body: { farmId?: unknown; days?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo JSON inválido" }, { status: 400 });
  }

  const farmId = typeof body.farmId === "string" ? body.farmId : null;
  if (!farmId) {
    return NextResponse.json(
      { error: "farmId é obrigatório" },
      { status: 400 },
    );
  }

  const days = (body.days as AllowedDiagnosticDays | undefined) ?? 7;
  if (!ALLOWED_DIAGNOSTIC_DAYS.includes(days)) {
    return NextResponse.json(
      { error: `days deve ser um de ${ALLOWED_DIAGNOSTIC_DAYS.join(", ")}` },
      { status: 400 },
    );
  }

  // Confere autorização à fazenda ANTES de qualquer chamada externa.
  const { data: farm, error: farmErr } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .maybeSingle();
  if (farmErr || !farm) {
    return NextResponse.json({ error: "fazenda inacessível" }, { status: 403 });
  }

  const result = await runClimateDiagnostic(supabase, { farmId, days });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
