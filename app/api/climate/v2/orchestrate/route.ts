import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runClimateOrchestration } from "@/modules/weather/orchestration/climateOrchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let body: { virtualStationId?: string };
  try {
    body = (await request.json()) as { virtualStationId?: string };
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const virtualStationId = body.virtualStationId?.trim();
  if (!virtualStationId) {
    return NextResponse.json({ error: "virtualStationId e obrigatorio" }, { status: 400 });
  }

  try {
    const result = await runClimateOrchestration(supabase, {
      virtualStationId,
      triggerType: "manual",
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no ciclo climatico";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
