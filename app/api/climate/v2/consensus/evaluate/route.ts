import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evaluateClimateConsensusShadow } from "@/modules/weather/services/climate-consensus-shadow.service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let body: { virtualStationId?: string; intervalStart?: string; intervalEnd?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const virtualStationId = body.virtualStationId?.trim();
  const intervalStart = body.intervalStart?.trim();
  const intervalEnd = body.intervalEnd?.trim();
  if (!virtualStationId || !intervalStart || !intervalEnd) {
    return NextResponse.json(
      { error: "virtualStationId, intervalStart e intervalEnd sao obrigatorios" },
      { status: 400 },
    );
  }

  try {
    const result = await evaluateClimateConsensusShadow(supabase, {
      virtualStationId,
      intervalStart,
      intervalEnd,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na avaliacao de consenso";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
