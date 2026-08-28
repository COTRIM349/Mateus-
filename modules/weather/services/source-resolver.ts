// ============================================================================
// Seleção diária auditável da fonte climática operacional
// ============================================================================
// Ordem de decisão: qualidade -> prioridade -> natureza do dado -> recência.
// Uma leitura pode ser selecionada para diagnóstico sem ser automaticamente
// aprovada para manejo. Modelos genéricos e grades históricas permanecem
// auditáveis; somente dados observados/manuais ou modelos virtuais de origem
// explicitamente confiável podem alimentar automaticamente o balanço.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CandidateReading {
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

export const OPERATIONAL_CLIMATE_LIMITS = {
  et0Min: 0,
  et0Max: 15,
  precipitationMin: 0,
  precipitationMax: 200,
} as const;

/**
 * Origens virtuais que já passam pelo pipeline interno de ingestão, cálculo de
 * ETo e validação física. A origem continua registrada como modelo; a lista
 * apenas autoriza uso operacional quando todas as demais guardas também passam.
 */
export const TRUSTED_OPERATIONAL_MODEL_ORIGINS = new Set([
  "open-meteo",
]);

const QUALITY_ORDER: Record<string, number> = { ok: 0, degraded: 1, missing: 2 };
const KIND_ORDER: Record<string, number> = {
  observed: 0,
  manual: 1,
  model_estimate: 2,
  historical_grid: 3,
};

/** Qualidade válida sempre vence prioridade de fonte. */
export function rankClimateCandidate(a: CandidateReading, b: CandidateReading): number {
  const qa = QUALITY_ORDER[a.data_quality] ?? 3;
  const qb = QUALITY_ORDER[b.data_quality] ?? 3;
  if (qa !== qb) return qa - qb;
  if (a.source_priority !== b.source_priority) return a.source_priority - b.source_priority;
  const ka = KIND_ORDER[a.data_kind] ?? 9;
  const kb = KIND_ORDER[b.data_kind] ?? 9;
  if (ka !== kb) return ka - kb;
  return b.imported_at.localeCompare(a.imported_at);
}

export function candidateHasOperationalValues(candidate: Pick<CandidateReading, "et0_calculated" | "precipitation">): boolean {
  return Number.isFinite(candidate.et0_calculated)
    && candidate.et0_calculated >= OPERATIONAL_CLIMATE_LIMITS.et0Min
    && candidate.et0_calculated <= OPERATIONAL_CLIMATE_LIMITS.et0Max
    && Number.isFinite(candidate.precipitation)
    && candidate.precipitation >= OPERATIONAL_CLIMATE_LIMITS.precipitationMin
    && candidate.precipitation <= OPERATIONAL_CLIMATE_LIMITS.precipitationMax;
}

function normalizeProviderOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/_/g, "-");
}

export function isTrustedOperationalModelOrigin(origin: string): boolean {
  return TRUSTED_OPERATIONAL_MODEL_ORIGINS.has(normalizeProviderOrigin(origin));
}

/**
 * Aprovação automática é mais restrita que a seleção:
 * - observado/manual: qualidade ok + faixa física válida;
 * - model_estimate: além disso, origem precisa estar na allowlist operacional;
 * - historical_grid e modelos desconhecidos nunca são aprovados automaticamente.
 */
export function candidateCanBeOperationallyApproved(
  candidate: Pick<CandidateReading, "data_quality" | "data_kind" | "origin" | "et0_calculated" | "precipitation">,
): boolean {
  if (candidate.data_quality !== "ok" || !candidateHasOperationalValues(candidate)) return false;

  if (candidate.data_kind === "observed" || candidate.data_kind === "manual") return true;

  return candidate.data_kind === "model_estimate"
    && isTrustedOperationalModelOrigin(candidate.origin);
}

function invalidOperationalValueReason(et0: number, rain: number): string {
  if (!Number.isFinite(et0) || !Number.isFinite(rain)) return "ETo ou precipitação ausente/inválida";
  if (et0 < OPERATIONAL_CLIMATE_LIMITS.et0Min) return "ETo negativa";
  if (et0 > OPERATIONAL_CLIMATE_LIMITS.et0Max) return `ETo acima do limite operacional (${OPERATIONAL_CLIMATE_LIMITS.et0Max} mm/dia)`;
  if (rain < OPERATIONAL_CLIMATE_LIMITS.precipitationMin) return "precipitação negativa";
  if (rain > OPERATIONAL_CLIMATE_LIMITS.precipitationMax) return `precipitação acima do limite operacional (${OPERATIONAL_CLIMATE_LIMITS.precipitationMax} mm/dia)`;
  return "leitura fora da faixa operacional";
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
}

export async function resolveDailyClimateSource(
  supabase: SupabaseClient,
  farmId: string,
  date: string,
): Promise<DailySelectionResult> {
  const { data: stationsRaw, error: stErr } = await supabase
    .from("weather_stations")
    .select("id,name,source_priority")
    .eq("farm_id", farmId)
    .eq("active", true)
    .order("source_priority", { ascending: true });
  if (stErr) throw new Error(stErr.message);

  const stations = (stationsRaw ?? []) as Array<{ id: string; name: string; source_priority: number }>;
  if (stations.length === 0) {
    const result: DailySelectionResult = {
      farm_id:farmId, date, selected_station_id:null, selected_reading_id:null,
      priority_used:null, quality_used:null,
      reason:"nenhuma estação ativa cadastrada para a fazenda",
      rejected_sources:[], fallback_used:false, operational_approved:false,
    };
    await persistSelection(supabase, result);
    return result;
  }

  const stationIds = stations.map((s) => s.id);
  const { data: readingsRaw, error: rErr } = await supabase
    .from("weather_readings")
    .select("id,station_id,data_quality,data_kind,imported_at,origin,et0_calculated,precipitation")
    .in("station_id", stationIds)
    .eq("date", date);
  if (rErr) throw new Error(rErr.message);

  const stationById = new Map(stations.map((s) => [s.id, s]));
  const rejected: DailySelectionResult["rejected_sources"] = [];
  const candidates: CandidateReading[] = [];
  const stationsWithAnyReading = new Set<string>();

  for (const raw of (readingsRaw ?? []) as Array<Record<string, unknown>>) {
    const stationId = raw.station_id as string;
    stationsWithAnyReading.add(stationId);
    const station = stationById.get(stationId);
    if (!station) continue;

    const et0Raw = raw.et0_calculated;
    const rainRaw = raw.precipitation;
    const et0 = et0Raw == null ? Number.NaN : Number(et0Raw);
    const rain = rainRaw == null ? Number.NaN : Number(rainRaw);
    const quality = String(raw.data_quality ?? "missing");

    if (quality === "missing" || !candidateHasOperationalValues({ et0_calculated: et0, precipitation: rain })) {
      rejected.push({
        station_id: stationId,
        station_name: station.name,
        reason: quality === "missing" ? "leitura marcada como ausente" : invalidOperationalValueReason(et0, rain),
      });
      continue;
    }

    candidates.push({
      reading_id: raw.id as string,
      station_id: stationId,
      station_name: station.name,
      source_priority: Number(station.source_priority) || 999,
      data_quality: quality,
      data_kind: String(raw.data_kind ?? "model_estimate"),
      imported_at: String(raw.imported_at ?? ""),
      origin: String(raw.origin ?? ""),
      et0_calculated: et0,
      precipitation: rain,
    });
  }

  for (const station of stations) {
    if (!stationsWithAnyReading.has(station.id)) {
      rejected.push({ station_id:station.id, station_name:station.name, reason:"sem leitura para a data" });
    }
  }

  if (candidates.length === 0) {
    const result: DailySelectionResult = {
      farm_id:farmId, date, selected_station_id:null, selected_reading_id:null,
      priority_used:null, quality_used:null,
      reason:"nenhuma leitura com ETo e precipitação válidas para a data",
      rejected_sources:rejected, fallback_used:false, operational_approved:false,
    };
    await persistSelection(supabase, result);
    return result;
  }

  candidates.sort(rankClimateCandidate);
  const winner = candidates[0];
  for (const candidate of candidates.slice(1)) {
    rejected.push({
      station_id:candidate.station_id,
      station_name:candidate.station_name,
      reason:`não selecionada (${candidate.data_quality}, P${candidate.source_priority}, ${candidate.data_kind})`,
    });
  }

  const topPriority = Math.min(...stations.map((s) => Number(s.source_priority) || 999));
  const fallbackUsed = winner.source_priority > topPriority;
  const operationalApproved = candidateCanBeOperationallyApproved(winner);

  const result: DailySelectionResult = {
    farm_id:farmId,
    date,
    selected_station_id:winner.station_id,
    selected_reading_id:winner.reading_id,
    priority_used:winner.source_priority,
    quality_used:winner.data_quality,
    reason: operationalApproved
      ? winner.data_kind === "model_estimate"
        ? `modelo virtual operacional aprovado: ${winner.station_name} (${winner.origin}, P${winner.source_priority}, ${winner.data_quality})`
        : `leitura operacional aprovada: ${winner.station_name} (P${winner.source_priority}, ${winner.data_quality}, ${winner.data_kind})`
      : winner.data_kind === "model_estimate"
        ? `leitura selecionada apenas para diagnóstico: ${winner.station_name} (${winner.data_kind}, ${winner.origin}); origem de modelo não autorizada para manejo`
        : winner.data_kind === "historical_grid"
          ? `leitura selecionada apenas para diagnóstico: ${winner.station_name} (${winner.data_kind}); grade histórica não possui aprovação operacional automática`
          : `leitura selecionada apenas para diagnóstico: ${winner.station_name} (${winner.data_quality})`,
    rejected_sources:rejected,
    fallback_used:fallbackUsed,
    operational_approved:operationalApproved,
  };

  await persistSelection(supabase, result);
  return result;
}

async function persistSelection(supabase: SupabaseClient, result: DailySelectionResult): Promise<void> {
  const payload = {
    farm_id:result.farm_id,
    date:result.date,
    selected_station_id:result.selected_station_id,
    selected_reading_id:result.selected_reading_id,
    priority_used:result.priority_used,
    quality_used:result.quality_used,
    reason:result.reason,
    rejected_sources:result.rejected_sources,
    fallback_used:result.fallback_used,
    operational_approved:result.operational_approved,
    selected_at:new Date().toISOString(),
  };
  const { error } = await supabase
    .from("weather_daily_selection")
    .upsert(payload, { onConflict:"farm_id,date" });
  if (error) throw new Error(error.message);
}

export async function resolveDailyRange(
  supabase: SupabaseClient,
  farmId: string,
  startDate: string,
  endDate: string,
): Promise<DailySelectionResult[]> {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  const results: DailySelectionResult[] = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    results.push(await resolveDailyClimateSource(supabase, farmId, d.toISOString().slice(0, 10)));
  }
  return results;
}
