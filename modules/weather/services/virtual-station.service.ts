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
  altitude_origin: string;
  timezone: string;
  data_source: string;
  source_priority: number;
  active: boolean;
  sync_status: string;
  last_sync_at: string | null;
  sync_error: string | null;
  created_at: string;
}

const STATION_SELECT =
  "id, farm_id, name, latitude, longitude, altitude, altitude_origin, timezone, data_source, source_priority, active, sync_status, last_sync_at, sync_error, created_at";

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
    .select(STATION_SELECT)
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
  const dataSource = options.dataSource ?? VIRTUAL_STATION_DEFAULT_SOURCE;
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

  if (!listProviderKeys().includes(dataSource)) {
    throw new Error(
      `Fonte '${dataSource}' não registrada no provider-registry.`,
    );
  }

  const priority = options.priority ?? VIRTUAL_STATION_DEFAULT_PRIORITY;
  const namePrefix = options.namePrefix ?? "Estação Virtual";

  const hasManualAltitude =
    farm.altitude != null && Number.isFinite(farm.altitude) && farm.altitude > 0;

  const insertPayload = {
    farm_id: farmId,
    name: `${namePrefix} — ${farm.name}`,
    model: null,
    latitude: farm.latitude,
    longitude: farm.longitude,
    altitude: hasManualAltitude ? farm.altitude : 0,
    altitude_origin: hasManualAltitude ? "manual" : "unknown",
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
    .select(STATION_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return { station: data as VirtualStationRow, created: true };
}

/**
 * Propaga alterações da fazenda (coords/altitude/timezone) para a estação
 * virtual associada. Não recria a estação — apenas sincroniza.
 *
 * Estratégia:
 *  - Coordenadas: sempre atualiza para as da fazenda.
 *  - Altitude: se a fazenda tem altitude manual > 0, atualiza e marca
 *    origem 'manual'. Se não, mantém a que já estava (a próxima ingestão
 *    resolverá via Open-Meteo `elevation`).
 *  - Timezone: propaga o valor da fazenda.
 *  - Ao mudar coords, invalida sync (idle) para forçar nova ingestão.
 */
export interface SyncVirtualStationResult {
  station: VirtualStationRow;
  coordinatesChanged: boolean;
  altitudeChanged: boolean;
}

export async function syncVirtualStationWithFarm(
  supabase: SupabaseClient,
  farmId: string,
): Promise<SyncVirtualStationResult | null> {
  const station = await getVirtualStation(supabase, farmId);
  if (!station) return null;

  const farm = await fetchFarm(supabase, farmId);
  if (!farm || farm.latitude == null || farm.longitude == null) return null;

  const coordinatesChanged =
    Math.abs(station.latitude - farm.latitude) > 1e-6 ||
    Math.abs(station.longitude - farm.longitude) > 1e-6;

  const hasManualAltitude =
    farm.altitude != null && Number.isFinite(farm.altitude) && farm.altitude > 0;
  const altitudeChanged =
    hasManualAltitude && Math.abs(station.altitude - (farm.altitude as number)) > 0.5;

  if (!coordinatesChanged && !altitudeChanged) {
    return { station, coordinatesChanged: false, altitudeChanged: false };
  }

  const updatePayload: Record<string, unknown> = {
    latitude: farm.latitude,
    longitude: farm.longitude,
    timezone: farm.timezone ?? station.timezone ?? "America/Sao_Paulo",
  };

  if (hasManualAltitude) {
    updatePayload.altitude = farm.altitude;
    updatePayload.altitude_origin = "manual";
  }

  if (coordinatesChanged) {
    // Invalida a sincronização anterior; a próxima ingestão sobrescreve
    // as leituras recentes com as coordenadas corretas.
    updatePayload.sync_status = "idle";
    updatePayload.sync_error =
      "coordenadas atualizadas — nova sincronização necessária";
  }

  const { data, error } = await supabase
    .from("weather_stations")
    .update(updatePayload)
    .eq("id", station.id)
    .select(STATION_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return {
    station: data as VirtualStationRow,
    coordinatesChanged,
    altitudeChanged,
  };
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
    et0_delta: number | null;
    et0_delta_pct: number | null;
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
    request_latitude: number | null;
    request_longitude: number | null;
    request_timezone: string | null;
    request_url: string | null;
    altitude_used: number | null;
    altitude_origin: string | null;
    response_elevation: number | null;
    et0_source_avg: number | null;
    et0_calculated_avg: number | null;
    et0_delta_pct_avg: number | null;
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
        "date, temp_max, temp_min, temp_mean, humidity, wind_speed, solar_radiation, precipitation, effective_precip, et0_calculated, et0_source, et0_delta, et0_delta_pct, data_quality, origin, imported_at",
      )
      .eq("station_id", station.id)
      .order("date", { ascending: false })
      .limit(1),
    supabase
      .from("climate_ingestion_runs")
      .select(
        "run_at, status, rows_inserted, rows_updated, rows_skipped, duration_ms, error_message, request_latitude, request_longitude, request_timezone, request_url, altitude_used, altitude_origin, response_elevation, et0_source_avg, et0_calculated_avg, et0_delta_pct_avg",
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
