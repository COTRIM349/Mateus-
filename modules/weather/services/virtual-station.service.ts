// ============================================================================
// Serviço de Estação Virtual (Sprint 5.2)
// ----------------------------------------------------------------------------
// Estação virtual = weather_station com station_type='virtual', vinculada
// à fazenda pelas suas coordenadas. Usa uma fonte climática configurável
// (padrão: Open-Meteo) e serve de fallback quando não há estação física.
//
// Este serviço NÃO duplica lógica de ingestão nem de seleção — apenas
// gerencia o cadastro da estação virtual (criar/consultar/estado).
// A sincronização em si é feita por `ingestFarmClimate` (Sprint 5.1),
// que já despacha via provider-registry.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { listProviderKeys } from "./provider-registry";

/** Prioridade default de estações virtuais (menor que estação física típica). */
export const VIRTUAL_STATION_DEFAULT_PRIORITY = 5;

/** Fonte default para uma estação virtual recém-criada. */
export const VIRTUAL_STATION_DEFAULT_SOURCE = "open_meteo";

export interface VirtualStationRow {
  id: string;
  farm_id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  timezone: string;
  data_source: string;
  source_priority: number;
  active: boolean;
  sync_status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
}

export interface FarmCoordinates {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  timezone: string | null;
}

async function fetchFarm(
  supabase: SupabaseClient,
  farmId: string,
): Promise<FarmCoordinates | null> {
  const { data, error } = await supabase
    .from("farms")
    .select("id, name, latitude, longitude, altitude, timezone")
    .eq("id", farmId)
    .single();
  if (error || !data) return null;
  return data as FarmCoordinates;
}

/**
 * Retorna a estação virtual da fazenda (se existir).
 * Considera-se estação virtual: station_type='virtual' e active=true.
 * Só há uma por fazenda por convenção; se houver múltiplas, retorna a
 * de menor source_priority.
 */
export async function getVirtualStation(
  supabase: SupabaseClient,
  farmId: string,
): Promise<VirtualStationRow | null> {
  const { data, error } = await supabase
    .from("weather_stations")
    .select(
      "id, farm_id, name, latitude, longitude, altitude, timezone, data_source, source_priority, active, sync_status, last_sync_at, sync_error, created_at",
    )
    .eq("farm_id", farmId)
    .eq("station_type", "virtual")
    .eq("active", true)
    .order("source_priority", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0] ?? null) as VirtualStationRow | null;
}

export async function hasVirtualStation(
  supabase: SupabaseClient,
  farmId: string,
): Promise<boolean> {
  const s = await getVirtualStation(supabase, farmId);
  return s !== null;
}

export interface EnsureVirtualStationOptions {
  dataSource?: string;
  priority?: number;
  namePrefix?: string;
}

export interface EnsureVirtualStationResult {
  station: VirtualStationRow;
  created: boolean;
}

/**
 * Idempotente: cria estação virtual se ainda não existir para a fazenda.
 * Requisito: fazenda deve ter latitude e longitude válidas.
 * Se dataSource informado, valida que existe no provider-registry.
 */
export async function ensureVirtualStation(
  supabase: SupabaseClient,
  farmId: string,
  options: EnsureVirtualStationOptions = {},
): Promise<EnsureVirtualStationResult> {
  const existing = await getVirtualStation(supabase, farmId);
  if (existing) return { station: existing, created: false };

  const farm = await fetchFarm(supabase, farmId);
  if (!farm) throw new Error("Fazenda não encontrada.");
  if (
    farm.latitude == null ||
    farm.longitude == null ||
    Number.isNaN(farm.latitude) ||
    Number.isNaN(farm.longitude)
  ) {
    throw new Error(
      "Fazenda sem latitude/longitude; não é possível criar estação virtual.",
    );
  }

  const dataSource = options.dataSource ?? VIRTUAL_STATION_DEFAULT_SOURCE;
  if (!listProviderKeys().includes(dataSource)) {
    throw new Error(
      `Fonte '${dataSource}' não registrada no provider-registry.`,
    );
  }

  const priority = options.priority ?? VIRTUAL_STATION_DEFAULT_PRIORITY;
  const namePrefix = options.namePrefix ?? "Estação Virtual";

  const insertPayload = {
    farm_id: farmId,
    name: `${namePrefix} — ${farm.name}`,
    model: null,
    latitude: farm.latitude,
    longitude: farm.longitude,
    altitude: farm.altitude ?? 0,
    timezone: farm.timezone ?? "America/Sao_Paulo",
    station_type: "virtual",
    data_source: dataSource,
    provider: dataSource,
    source_priority: priority,
    active: true,
    sync_status: "idle",
  };

  const { data, error } = await supabase
    .from("weather_stations")
    .insert(insertPayload)
    .select(
      "id, farm_id, name, latitude, longitude, altitude, timezone, data_source, source_priority, active, sync_status, last_sync_at, sync_error, created_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return { station: data as VirtualStationRow, created: true };
}

// ── Snapshot para UI ────────────────────────────────────────────────────────

export interface VirtualStationSnapshot {
  station: VirtualStationRow;
  latestReading: {
    date: string;
    temp_max: number | null;
    temp_min: number | null;
    temp_mean: number | null;
    humidity: number | null;
    wind_speed: number | null;
    solar_radiation: number | null;
    precipitation: number | null;
    effective_precip: number | null;
    et0_calculated: number | null;
    et0_source: number | null;
    data_quality: string;
    origin: string;
    imported_at: string;
  } | null;
  lastRun: {
    run_at: string;
    status: string;
    rows_inserted: number;
    rows_updated: number;
    rows_skipped: number;
    duration_ms: number | null;
    error_message: string | null;
  } | null;
}

/**
 * Reúne, em uma única chamada, o cadastro + última leitura observada +
 * última execução de ingestão — tudo o que a aba "Estação Virtual" mostra.
 */
export async function getVirtualStationSnapshot(
  supabase: SupabaseClient,
  farmId: string,
): Promise<VirtualStationSnapshot | null> {
  const station = await getVirtualStation(supabase, farmId);
  if (!station) return null;

  const [readingRes, runRes] = await Promise.all([
    supabase
      .from("weather_readings")
      .select(
        "date, temp_max, temp_min, temp_mean, humidity, wind_speed, solar_radiation, precipitation, effective_precip, et0_calculated, et0_source, data_quality, origin, imported_at",
      )
      .eq("station_id", station.id)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("climate_ingestion_runs")
      .select(
        "run_at, status, rows_inserted, rows_updated, rows_skipped, duration_ms, error_message",
      )
      .eq("station_id", station.id)
      .order("run_at", { ascending: false })
      .limit(1),
  ]);

  return {
    station,
    latestReading: ((readingRes.data ?? [])[0] ?? null) as
      | VirtualStationSnapshot["latestReading"]
      | null,
    lastRun: ((runRes.data ?? [])[0] ?? null) as
      | VirtualStationSnapshot["lastRun"]
      | null,
  };
}
