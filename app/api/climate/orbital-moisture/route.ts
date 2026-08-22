import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ORBITAL_MOISTURE_ATTRIBUTION,
  ORBITAL_MOISTURE_SOURCE,
  fetchLatestOrbitalHour,
  isValidMapCoordinate,
  sampleDateUtc,
  type OrbitalPointInput,
} from "@/modules/vision-map/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asPoints(raw: unknown): OrbitalPointInput[] {
  if (!Array.isArray(raw)) return [];
  const out: OrbitalPointInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; latitude?: unknown; longitude?: unknown };
    if (typeof row.id !== "string" || !row.id.trim()) continue;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    out.push({ id: row.id.trim(), latitude, longitude });
  }
  return out;
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

  const farmId = req.nextUrl.searchParams.get("farmId")?.trim();
  if (!farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  const { data: farm } = await supabase.from("farms").select("id").eq("id", farmId).maybeSingle();
  if (!farm) {
    return NextResponse.json({ error: "fazenda inacessível" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("orbital_moisture_samples")
    .select("pivot_id, sampled_at, moisture_0_7, moisture_7_28, moisture_28_100, source")
    .eq("farm_id", farmId)
    .order("sampled_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const latest = new Map<string, (typeof data)[number]>();
  for (const row of data ?? []) {
    const pivotId = row.pivot_id as string | null;
    if (!pivotId || latest.has(pivotId)) continue;
    latest.set(pivotId, row);
  }

  return NextResponse.json({
    attribution: ORBITAL_MOISTURE_ATTRIBUTION,
    samples: Array.from(latest.values()).map((row) => ({
      pivotId: row.pivot_id,
      sampledAt: row.sampled_at,
      moisture07: row.moisture_0_7,
      moisture728: row.moisture_7_28,
      moisture28100: row.moisture_28_100,
      source: row.source,
    })),
  });
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

  let body: { farmId?: string; points?: unknown };
  try {
    body = (await req.json()) as { farmId?: string; points?: unknown };
  } catch {
    return NextResponse.json({ error: "corpo JSON inválido" }, { status: 400 });
  }

  const farmId = body.farmId?.trim();
  if (!farmId) {
    return NextResponse.json({ error: "farmId é obrigatório" }, { status: 400 });
  }

  const { data: farm } = await supabase.from("farms").select("id").eq("id", farmId).maybeSingle();
  if (!farm) {
    return NextResponse.json({ error: "fazenda inacessível" }, { status: 403 });
  }

  const points = asPoints(body.points);
  const skipped: Array<{ id: string; reason: string }> = [];
  const samples: Array<{
    pivotId: string;
    sampledAt: string;
    moisture07: number | null;
    moisture728: number | null;
    moisture28100: number | null;
    source: string;
  }> = [];

  for (const point of points) {
    if (!isValidMapCoordinate(point.latitude, point.longitude)) {
      skipped.push({ id: point.id, reason: "coordenada inválida" });
      continue;
    }
    try {
      const hour = await fetchLatestOrbitalHour(point.latitude, point.longitude);
      if (!hour) {
        skipped.push({ id: point.id, reason: "fonte sem umidade nesta hora" });
        continue;
      }
      const sampledAt = sampleDateUtc(hour.time);
      const { error } = await supabase.from("orbital_moisture_samples").upsert(
        {
          farm_id: farmId,
          pivot_id: point.id,
          sampled_at: sampledAt,
          latitude: point.latitude,
          longitude: point.longitude,
          moisture_0_7: hour.moisture07,
          moisture_7_28: hour.moisture728,
          moisture_28_100: hour.moisture28100,
          source: ORBITAL_MOISTURE_SOURCE,
        },
        { onConflict: "pivot_id,sampled_at,source" },
      );
      if (error) {
        skipped.push({ id: point.id, reason: error.message });
        continue;
      }
      samples.push({
        pivotId: point.id,
        sampledAt,
        moisture07: hour.moisture07,
        moisture728: hour.moisture728,
        moisture28100: hour.moisture28100,
        source: ORBITAL_MOISTURE_SOURCE,
      });
    } catch (err) {
      skipped.push({
        id: point.id,
        reason: err instanceof Error ? err.message : "falha na fonte orbital",
      });
    }
  }

  return NextResponse.json({
    attribution: ORBITAL_MOISTURE_ATTRIBUTION,
    samples,
    skipped,
  });
}
