import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  approveOperationalSelections,
  listOperationalSelections,
  revokeOperationalSelections,
} from "@/modules/weather/services/climate-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function assertFarmAccess(
  supabase: ReturnType<typeof createClient>,
  farmId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: farm, error } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .maybeSingle();
  if (error || !farm) {
    return { ok: false, status: 403, error: "fazenda inacessível" };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const farmId = req.nextUrl.searchParams.get("farmId");
  if (!farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  const access = await assertFarmAccess(supabase, farmId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const pastDays = Math.max(1, Math.min(Number(req.nextUrl.searchParams.get("pastDays") ?? 7), 92));
  const startDate = req.nextUrl.searchParams.get("startDate") ?? isoDate(-(pastDays - 1));
  const endDate = req.nextUrl.searchParams.get("endDate") ?? isoDate(0);

  try {
    const summary = await listOperationalSelections(supabase, farmId, startDate, endDate);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha ao listar seleções";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    action?: "approve" | "revoke";
    dates?: string[];
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo JSON inválido" }, { status: 400 });
  }

  if (!body.farmId || !body.action) {
    return NextResponse.json({ error: "farmId e action são obrigatórios" }, { status: 400 });
  }

  const access = await assertFarmAccess(supabase, body.farmId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const dates = body.dates ?? [];
  if (dates.length === 0) {
    return NextResponse.json({ error: "dates é obrigatório" }, { status: 400 });
  }

  try {
    const result =
      body.action === "approve"
        ? await approveOperationalSelections(supabase, body.farmId, dates, user.id, body.note)
        : await revokeOperationalSelections(supabase, body.farmId, dates);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha na operação";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
