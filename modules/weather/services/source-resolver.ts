// ============================================================================
// Serviço de seleção diária de fonte climática (Sprint 5.1)
// ----------------------------------------------------------------------------
// Para uma fazenda e uma data, escolhe qual leitura observada será utilizada
// pelo Motor do Balanço Hídrico. Persiste a escolha em weather_daily_selection
// para auditoria (fonte escolhida, prioridade, qualidade, motivo, fontes
// rejeitadas, fallback).
//
// Regras:
//  1. Considera apenas leituras de estações active=true da fazenda.
//  2. Descarta leituras com data_quality='missing'.
//  3. Ordena por source_priority ASC (1 = maior prioridade) e, em empate,
//     data_quality (ok > degraded) e imported_at mais recente.
//  4. Se a estação de prioridade máxima da fazenda não tiver leitura para a
//     data, marca fallback_used=true.
//  5. Se nenhuma leitura sobra, grava selection sem selected_reading_id e
//     motivo "sem leituras disponíveis".
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

interface CandidateReading {
  reading_id: string;
  station_id: string;
  station_name: string;
  source_priority: number;
  data_quality: string;
  imported_at: string;
  origin: string;
}

const QUALITY_ORDER: Record<string, number> = { ok: 0, degraded: 1, missing: 2 };

function rankCandidate(a: CandidateReading, b: CandidateReading): number {
  if (a.source_priority !== b.source_priority) return a.source_priority - b.source_priority;
  const qa = QUALITY_ORDER[a.data_quality] ?? 3;
  const qb = QUALITY_ORDER[b.data_quality] ?? 3;
  if (qa !== qb) return qa - qb;
  // mais recente vence
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
}

export async function resolveDailyClimateSource(
  supabase: SupabaseClient,
  farmId: string,
  date: string,
): Promise<DailySelectionResult> {
  // 1. Todas as estações ativas da fazenda, ordenadas por prioridade.
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
    };
    await persistSelection(supabase, result);
    return result;
  }

  // 2. Leituras dessas estações para a data.
  const stationIds = stations.map((s) => s.id);
  const { data: readingsRaw, error: rErr } = await supabase
    .from("weather_readings")
    .select("id, station_id, data_quality, imported_at, origin")
    .in("station_id", stationIds)
    .eq("date", date);
  if (rErr) throw new Error(rErr.message);

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const candidates: CandidateReading[] = ((readingsRaw ?? []) as Array<{
    id: string;
    station_id: string;
    data_quality: string;
    imported_at: string;
    origin: string;
  }>)
    .filter((r) => r.data_quality !== "missing")
    .map((r) => {
      const st = stationById.get(r.station_id)!;
      return {
        reading_id: r.id,
        station_id: r.station_id,
        station_name: st.name,
        source_priority: st.source_priority,
        data_quality: r.data_quality,
        imported_at: r.imported_at,
        origin: r.origin,
      };
    });

  const rejected: DailySelectionResult["rejected_sources"] = [];

  // Estações sem leitura para o dia.
  const stationsWithReading = new Set(candidates.map((c) => c.station_id));
  for (const s of stations) {
    if (!stationsWithReading.has(s.id)) {
      rejected.push({
        station_id: s.id,
        station_name: s.name,
        reason: "sem leitura para a data",
      });
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
      reason: "nenhuma leitura disponível para a data",
      rejected_sources: rejected,
      fallback_used: false,
    };
    await persistSelection(supabase, result);
    return result;
  }

  candidates.sort(rankCandidate);
  const winner = candidates[0];

  // Rejeições internas (outros candidatos não escolhidos).
  for (const c of candidates.slice(1)) {
    rejected.push({
      station_id: c.station_id,
      station_name: c.station_name,
      reason: `prioridade inferior (P${c.source_priority}, ${c.data_quality})`,
    });
  }

  const topPriority = stations[0].source_priority;
  const fallbackUsed = winner.source_priority > topPriority;

  const result: DailySelectionResult = {
    farm_id: farmId,
    date,
    selected_station_id: winner.station_id,
    selected_reading_id: winner.reading_id,
    priority_used: winner.source_priority,
    quality_used: winner.data_quality,
    reason: fallbackUsed
      ? `estação prioritária sem dado; usada ${winner.station_name} (P${winner.source_priority}, ${winner.data_quality})`
      : `prioridade máxima com qualidade ${winner.data_quality} (${winner.station_name})`,
    rejected_sources: rejected,
    fallback_used: fallbackUsed,
  };

  await persistSelection(supabase, result);
  return result;
}

async function persistSelection(
  supabase: SupabaseClient,
  r: DailySelectionResult,
): Promise<void> {
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
    selected_at: new Date().toISOString(),
  };
  await supabase
    .from("weather_daily_selection")
    .upsert(payload, { onConflict: "farm_id,date" });
}

/**
 * Roda o resolver para um intervalo de datas. Útil após ingestão em lote e
 * para backfill controlado.
 */
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
    const iso = d.toISOString().slice(0, 10);
    results.push(await resolveDailyClimateSource(supabase, farmId, iso));
  }
  return results;
}
