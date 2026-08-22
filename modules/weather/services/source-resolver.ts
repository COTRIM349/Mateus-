// ============================================================================
// Serviço de seleção diária de fonte climática.
// ============================================================================
// Regras operacionais:
// 1. somente estações ativas da fazenda;
// 2. leitura missing ou sem ETo interna/chuva válida não é candidata;
// 3. prioridade da estação + qualidade + tipo + recência;
// 4. qualidade `ok` com dados completos recebe aprovação operacional automática
//    auditável; `degraded` pode ser selecionada para diagnóstico, mas NÃO é
//    aprovada para balanço hídrico;
// 5. ausência nunca vira ETo/chuva zero.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

interface CandidateReading {
  reading_id: string;
  station_id: string;
  station_name: string;
  source_priority: number;
  data_quality: string;
  data_kind: string;
  imported_at: string;
  origin: string;
  et0_calculated: number;
  precipitation: number;
}

const QUALITY_ORDER: Record<string, number> = { ok: 0, degraded: 1, missing: 2 };
const KIND_ORDER: Record<string, number> = {
  observed: 0,
  manual: 1,
  model_estimate: 2,
  historical_grid: 3,
};

function rankCandidate(a: CandidateReading, b: CandidateReading): number {
  if (a.source_priority !== b.source_priority) return a.source_priority - b.source_priority;
  const qa = QUALITY_ORDER[a.data_quality] ?? 3;
  const qb = QUALITY_ORDER[b.data_quality] ?? 3;
  if (qa !== qb) return qa - qb;
  const ka = KIND_ORDER[a.data_kind] ?? 9;
  const kb = KIND_ORDER[b.data_kind] ?? 9;
  if (ka !== kb) return ka - kb;
  return b.imported_at.localeCompare(a.imported_at);
}

export interface DailySelectionResult {
  farm_id: string;
  date: string;
  selected_station_id: string | null;
  selected_reading_id: string | null;
  priority_used: number | null;
  quality_used: string | null;
  reason: string;
  rejected_sources: Array<{
    station_id: string;
    station_name: string;
    reason: string;
  }>;
  fallback_used: boolean;
  operational_approved: boolean;
  approval_note: string | null;
}

export async function resolveDailyClimateSource(
  supabase: SupabaseClient,
  farmId: string,
  date: string,
): Promise<DailySelectionResult> {
  const { data: stationsRaw, error: stErr } = await supabase
    .from("weather_stations")
    .select("id, name, source_priority")
    .eq("farm_id", farmId)
    .eq("active", true)
    .order("source_priority", { ascending: true });
  if (stErr) throw new Error(stErr.message);

  const stations = (stationsRaw ?? []) as Array<{
    id: string;
    name: string;
    source_priority: number;
  }>;

  if (stations.length === 0) {
    const result: DailySelectionResult = {
      farm_id: farmId,
      date,
      selected_station_id: null,
      selected_reading_id: null,
      priority_used: null,
      quality_used: null,
      reason: "nenhuma estação ativa cadastrada para a fazenda",
      rejected_sources: [],
      fallback_used: false,
      operational_approved: false,
      approval_note: "Sem estação ativa: balanço bloqueado.",
    };
    await persistSelection(supabase, result);
    return result;
  }

  const stationIds = stations.map((s) => s.id);
  const { data: readingsRaw, error: rErr } = await supabase
    .from("weather_readings")
    .select("id, station_id, data_quality, data_kind, imported_at, origin, et0_calculated, precipitation")
    .in("station_id", stationIds)
    .eq("date", date);
  if (rErr) throw new Error(rErr.message);

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const rejected: DailySelectionResult["rejected_sources"] = [];

  const candidates: CandidateReading[] = [];
  for (const r of (readingsRaw ?? []) as Array<{
    id: string;
    station_id: string;
    data_quality: string;
    data_kind: string;
    imported_at: string;
    origin: string;
    et0_calculated: number | null;
    precipitation: number | null;
  }>) {
    const st = stationById.get(r.station_id);
    if (!st) continue;
    if (r.data_quality === "missing") {
      rejected.push({ station_id: r.station_id, station_name: st.name, reason: "qualidade missing" });
      continue;
    }
    if (
      r.et0_calculated == null ||
      !Number.isFinite(r.et0_calculated) ||
      r.et0_calculated < 0 ||
      r.precipitation == null ||
      !Number.isFinite(r.precipitation) ||
      r.precipitation < 0
    ) {
      rejected.push({
        station_id: r.station_id,
        station_name: st.name,
        reason: "sem ETo interna ou chuva válida para uso operacional",
      });
      continue;
    }
    candidates.push({
      reading_id: r.id,
      station_id: r.station_id,
      station_name: st.name,
      source_priority: st.source_priority,
      data_quality: r.data_quality,
      data_kind: r.data_kind,
      imported_at: r.imported_at,
      origin: r.origin,
      et0_calculated: r.et0_calculated,
      precipitation: r.precipitation,
    });
  }

  const stationsWithReading = new Set((readingsRaw ?? []).map((r) => r.station_id as string));
  for (const s of stations) {
    if (!stationsWithReading.has(s.id)) {
      rejected.push({ station_id: s.id, station_name: s.name, reason: "sem leitura para a data" });
    }
  }

  if (candidates.length === 0) {
    const result: DailySelectionResult = {
      farm_id: farmId,
      date,
      selected_station_id: null,
      selected_reading_id: null,
      priority_used: null,
      quality_used: null,
      reason: "nenhuma leitura operacional válida para a data",
      rejected_sources: rejected,
      fallback_used: false,
      operational_approved: false,
      approval_note: "Sem leitura com ETo interna e chuva válidas: balanço bloqueado.",
    };
    await persistSelection(supabase, result);
    return result;
  }

  candidates.sort(rankCandidate);
  const winner = candidates[0];
  for (const c of candidates.slice(1)) {
    rejected.push({
      station_id: c.station_id,
      station_name: c.station_name,
      reason: `prioridade inferior (P${c.source_priority}, ${c.data_quality})`,
    });
  }

  const topPriority = stations[0].source_priority;
  const fallbackUsed = winner.source_priority > topPriority;
  const approved = winner.data_quality === "ok";
  const result: DailySelectionResult = {
    farm_id: farmId,
    date,
    selected_station_id: winner.station_id,
    selected_reading_id: winner.reading_id,
    priority_used: winner.source_priority,
    quality_used: winner.data_quality,
    reason: fallbackUsed
      ? `estação prioritária sem dado válido; usada ${winner.station_name} (P${winner.source_priority}, ${winner.data_quality})`
      : `prioridade máxima com qualidade ${winner.data_quality} (${winner.station_name})`,
    rejected_sources: rejected,
    fallback_used: fallbackUsed,
    operational_approved: approved,
    approval_note: approved
      ? `Aprovação automática: qualidade ok, ETo FAO-56 interna e precipitação válidas (${winner.origin}).`
      : `Leitura ${winner.data_quality}: selecionada para auditoria, não liberada para balanço operacional.`,
  };

  await persistSelection(supabase, result);
  return result;
}

async function persistSelection(
  supabase: SupabaseClient,
  r: DailySelectionResult,
): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    farm_id: r.farm_id,
    date: r.date,
    selected_station_id: r.selected_station_id,
    selected_reading_id: r.selected_reading_id,
    priority_used: r.priority_used,
    quality_used: r.quality_used,
    reason: r.reason,
    rejected_sources: r.rejected_sources,
    fallback_used: r.fallback_used,
    selected_at: now,
    operational_approved: r.operational_approved,
    approved_at: r.operational_approved ? now : null,
    approved_by: null,
    approval_note: r.approval_note,
  };
  const { error } = await supabase
    .from("weather_daily_selection")
    .upsert(payload, { onConflict: "farm_id,date" });
  if (error) throw new Error(error.message);
}

export async function resolveDailyRange(
  supabase: SupabaseClient,
  farmId: string,
  startDate: string,
  endDate: string,
): Promise<DailySelectionResult[]> {
  const start = new Date(startDate + "T12:00:00Z");
  const end = new Date(endDate + "T12:00:00Z");
  const results: DailySelectionResult[] = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    results.push(await resolveDailyClimateSource(supabase, farmId, d.toISOString().slice(0, 10)));
  }
  return results;
}
