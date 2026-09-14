import { hasValidGeographicCoordinates } from "@/utils/coord";

export const DEFAULT_FARM_TIMEZONE = "America/Sao_Paulo";

export interface FarmAccess {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
}

interface FarmRelation {
  id: string;
  name: string;
  timezone: string | null;
  active: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface FarmAccessRow {
  is_default: boolean | null;
  farms: FarmRelation | null;
}

/**
 * Converte vínculos de acesso em fazendas aptas ao uso operacional.
 * Um vínculo existente não supera inativação nem coordenadas impossíveis.
 */
export function buildOperationalFarmAccess(
  rows: readonly FarmAccessRow[],
): FarmAccess[] {
  return rows.flatMap((row) => {
    const farm = row.farms;
    if (
      !farm ||
      farm.active !== true ||
      !hasValidGeographicCoordinates(farm.latitude, farm.longitude)
    ) {
      return [];
    }

    return [{
      id: farm.id,
      name: farm.name,
      timezone: farm.timezone || DEFAULT_FARM_TIMEZONE,
      isDefault: row.is_default === true,
    }];
  });
}

export function selectInitialFarmId(
  farms: readonly FarmAccess[],
  storedFarmId: string | null,
): string | null {
  const stored = farms.find((farm) => farm.id === storedFarmId);
  if (stored) return stored.id;

  const defaultFarm = farms.find((farm) => farm.isDefault);
  return defaultFarm?.id ?? farms[0]?.id ?? null;
}
