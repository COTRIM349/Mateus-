// ============================================================================
// GET /api/climate/weather-api-diagnostic
// ----------------------------------------------------------------------------
// Endpoint autenticado (sessão) que verifica se WEATHERAPI_KEY está
// configurada e faz uma chamada mínima ao provedor para confirmar validade
// e latência. NUNCA devolve a chave nem a URL contendo a chave. Só devolve
// status, latência, plano/limitações e erro mascarado.
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pingWeatherApi } from "@/modules/weather/providers/weather-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_LIMITATIONS = {
  requestsPerMonth: 1_000_000,
  historyDays: 7,
  forecastDays: 3,
  solarRadiation: false,
  ecoTo: false,
  notes:
    "Plano free: sem radiação solar (Rs) e sem ETo utilizável para o balanço. Uso apenas comparação de T, UR, vento, chuva e pressão.",
};

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const keyPresent =
    !!process.env.WEATHERAPI_KEY && process.env.WEATHERAPI_KEY.trim() !== "";

  if (!keyPresent) {
    return NextResponse.json({
      keyPresent: false,
      status: "not_configured",
      httpStatus: null,
      latencyMs: 0,
      plan: null,
      limitations: null,
      error: "WEATHERAPI_KEY não está definida no ambiente do servidor.",
    });
  }

  const ping = await pingWeatherApi();

  return NextResponse.json({
    keyPresent: true,
    status: ping.status,
    httpStatus: ping.httpStatus,
    latencyMs: ping.latencyMs,
    plan: ping.status === "ok" ? "free (assumido)" : null,
    limitations: ping.status === "ok" ? PLAN_LIMITATIONS : null,
    error: ping.errorMasked,
  });
}
