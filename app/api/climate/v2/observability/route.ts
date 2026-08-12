import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClimateObservabilitySnapshot } from "@/modules/weather/observability/climateObservability.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", authData.user.id)
    .single();
  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso exclusivo para administradores" }, { status: 403 });
  }

  const url = new URL(request.url);
  const virtualStationId = url.searchParams.get("virtualStationId")?.trim();
  const hoursParam = Number(url.searchParams.get("hours") ?? "24");
  if (!virtualStationId) {
    return NextResponse.json({ error: "virtualStationId e obrigatorio" }, { status: 400 });
  }
  if (!Number.isFinite(hoursParam) || hoursParam < 1 || hoursParam > 168) {
    return NextResponse.json({ error: "hours deve estar entre 1 e 168" }, { status: 400 });
  }

  try {
    const snapshot = await getClimateObservabilitySnapshot(supabase, {
      virtualStationId,
      hours: Math.floor(hoursParam),
    });
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar observabilidade climatica";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
