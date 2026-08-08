import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncOpenMeteo30MinShadow } from "@/modules/weather/services/open-meteo-30m-shadow.service";

export const dynamic = "force-dynamic";

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
    return NextResponse.json(
      { error: "virtualStationId e obrigatorio" },
      { status: 400 },
    );
  }

  try {
    // O proprio Supabase/RLS garante que o usuario so consiga acessar uma
    // estacao pertencente a uma fazenda autorizada.
    const result = await syncOpenMeteo30MinShadow(supabase, virtualStationId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na sincronizacao Open-Meteo";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
