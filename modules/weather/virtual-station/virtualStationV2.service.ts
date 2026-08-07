import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDefaultVirtualStation,
  rankVirtualStationForPivot,
  type VirtualWeatherStationV2,
  type VirtualStationScopeType,
} from "./virtualStationV2";

interface DbVirtualStationRow {
  id: string;
  farm_id: string;
  scope_type: VirtualStationScopeType;
  module_id: string | null;
  pivot_id: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  timezone: string;
  target_resolution_minutes: number;
  shadow_mode: boolean;
  active: boolean;
}

function fromDb(row: DbVirtualStationRow): VirtualWeatherStationV2 {
  return buildDefaultVirtualStation({
    id: row.id,
    farmId: row.farm_id,
    scopeType: row.scope_type,
    moduleId: row.module_id,
    pivotId: row.pivot_id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    elevationM: row.elevation_m,
    timezone: row.timezone,
  });
}

/**
 * Cria a estacao virtual de fazenda usando a coordenada cadastrada na fazenda.
 * O trigger da migration 00025 liga automaticamente as quatro APIs.
 */
export async function ensureFarmVirtualStationV2(
  supabase: SupabaseClient,
  farmId: string,
): Promise<VirtualWeatherStationV2> {
  const { data: existing, error: existingError } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, scope_type, module_id, pivot_id, name, latitude, longitude, elevation_m, timezone, target_resolution_minutes, shadow_mode, active")
    .eq("farm_id", farmId)
    .eq("scope_type", "farm")
    .eq("active", true)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing) return fromDb(existing as DbVirtualStationRow);

  const { data: farm, error: farmError } = await supabase
    .from("farms")
    .select("id, name, latitude, longitude, altitude, timezone")
    .eq("id", farmId)
    .single();

  if (farmError || !farm) {
    throw new Error(farmError?.message ?? "Fazenda nao encontrada");
  }
  if (
    typeof farm.latitude !== "number" || !Number.isFinite(farm.latitude) ||
    typeof farm.longitude !== "number" || !Number.isFinite(farm.longitude)
  ) {
    throw new Error("Fazenda sem coordenadas validas");
  }

  const elevationM =
    typeof farm.altitude === "number" && Number.isFinite(farm.altitude) && farm.altitude > 0
      ? farm.altitude
      : null;

  // Valida em memoria antes de tocar no banco.
  const candidate = buildDefaultVirtualStation({
    id: "pending",
    farmId,
    name: `Estacao Virtual Cotrim — ${farm.name}`,
    latitude: farm.latitude,
    longitude: farm.longitude,
    elevationM,
    timezone: farm.timezone ?? "America/Bahia",
  });

  const { data: inserted, error: insertError } = await supabase
    .from("virtual_weather_stations")
    .insert({
      farm_id: farmId,
      scope_type: "farm",
      module_id: null,
      pivot_id: null,
      name: candidate.name,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      elevation_m: candidate.elevationM,
      timezone: candidate.timezone,
      target_resolution_minutes: 30,
      shadow_mode: true,
      active: true,
    })
    .select("id, farm_id, scope_type, module_id, pivot_id, name, latitude, longitude, elevation_m, timezone, target_resolution_minutes, shadow_mode, active")
    .single();

  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Falha ao criar estacao virtual");
  }

  return fromDb(inserted as DbVirtualStationRow);
}

/**
 * Resolve qual estacao atende um pivo. Ordem oficial: pivo > modulo > fazenda.
 */
export async function resolveVirtualStationForPivotV2(
  supabase: SupabaseClient,
  pivotId: string,
): Promise<VirtualWeatherStationV2 | null> {
  const { data: pivot, error: pivotError } = await supabase
    .from("pivots")
    .select("id, farm_id, module_id")
    .eq("id", pivotId)
    .single();

  if (pivotError || !pivot) {
    throw new Error(pivotError?.message ?? "Pivo nao encontrado");
  }

  const { data: rows, error: stationError } = await supabase
    .from("virtual_weather_stations")
    .select("id, farm_id, scope_type, module_id, pivot_id, name, latitude, longitude, elevation_m, timezone, target_resolution_minutes, shadow_mode, active")
    .eq("farm_id", pivot.farm_id)
    .eq("active", true);

  if (stationError) throw new Error(stationError.message);

  const stations = (rows ?? []).map((row) => fromDb(row as DbVirtualStationRow));
  const ranked = stations
    .map((station) => ({
      station,
      rank: rankVirtualStationForPivot(station, {
        farmId: pivot.farm_id,
        moduleId: pivot.module_id ?? null,
        pivotId: pivot.id,
      }),
    }))
    .filter((item): item is { station: VirtualWeatherStationV2; rank: number } => item.rank !== null)
    .sort((a, b) => b.rank - a.rank);

  return ranked[0]?.station ?? null;
}
