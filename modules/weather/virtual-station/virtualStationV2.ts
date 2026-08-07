import type { WeatherLocation, WeatherProviderName } from "@/modules/weather/types/weatherTypes";

export const VIRTUAL_STATION_TARGET_RESOLUTION_MINUTES = 30 as const;
export const VIRTUAL_STATION_DEFAULT_TIMEZONE = "America/Bahia" as const;

export const VIRTUAL_STATION_PROVIDERS = [
  "open_meteo",
  "meteoblue",
  "weatherapi",
  "met_norway",
] as const satisfies readonly WeatherProviderName[];

export type VirtualStationProvider = (typeof VIRTUAL_STATION_PROVIDERS)[number];
export type VirtualStationProviderRole = "primary" | "candidate" | "fallback" | "audit";
export type VirtualStationScopeType = "farm" | "module" | "pivot";

export interface VirtualStationProviderConfig {
  provider: VirtualStationProvider;
  enabled: boolean;
  priority: number;
  role: VirtualStationProviderRole;
}

export interface VirtualWeatherStationV2 extends WeatherLocation {
  farmId: string;
  scopeType: VirtualStationScopeType;
  moduleId: string | null;
  pivotId: string | null;
  targetResolutionMinutes: typeof VIRTUAL_STATION_TARGET_RESOLUTION_MINUTES;
  shadowMode: boolean;
  active: boolean;
  providers: VirtualStationProviderConfig[];
}

export const DEFAULT_VIRTUAL_STATION_PROVIDERS: readonly VirtualStationProviderConfig[] = [
  { provider: "open_meteo", enabled: true, priority: 1, role: "candidate" },
  { provider: "meteoblue", enabled: true, priority: 2, role: "candidate" },
  { provider: "weatherapi", enabled: true, priority: 3, role: "candidate" },
  { provider: "met_norway", enabled: true, priority: 4, role: "candidate" },
] as const;

export interface VirtualStationValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateVirtualStationLocation(
  location: Pick<WeatherLocation, "latitude" | "longitude" | "elevationM" | "timezone">,
): VirtualStationValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) {
    errors.push("latitude deve estar entre -90 e 90 graus");
  }
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) {
    errors.push("longitude deve estar entre -180 e 180 graus");
  }
  if (location.elevationM != null && !Number.isFinite(location.elevationM)) {
    errors.push("elevationM deve ser finita ou null");
  }
  if (!location.timezone || !location.timezone.includes("/")) {
    errors.push("timezone deve usar identificador IANA");
  }

  return { valid: errors.length === 0, errors };
}

export function validateVirtualStationScope(input: {
  scopeType: VirtualStationScopeType;
  moduleId: string | null;
  pivotId: string | null;
}): VirtualStationValidationResult {
  const errors: string[] = [];

  if (input.scopeType === "farm" && (input.moduleId !== null || input.pivotId !== null)) {
    errors.push("escopo farm nao aceita moduleId nem pivotId");
  }
  if (input.scopeType === "module" && (!input.moduleId || input.pivotId !== null)) {
    errors.push("escopo module exige moduleId e nao aceita pivotId");
  }
  if (input.scopeType === "pivot" && (!input.pivotId || input.moduleId !== null)) {
    errors.push("escopo pivot exige pivotId e nao aceita moduleId");
  }

  return { valid: errors.length === 0, errors };
}

export function buildDefaultVirtualStation(input: {
  id: string;
  farmId: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone?: string | null;
  scopeType?: VirtualStationScopeType;
  moduleId?: string | null;
  pivotId?: string | null;
}): VirtualWeatherStationV2 {
  const scopeType = input.scopeType ?? "farm";
  const station: VirtualWeatherStationV2 = {
    id: input.id,
    farmId: input.farmId,
    scopeType,
    moduleId: input.moduleId ?? null,
    pivotId: input.pivotId ?? null,
    name: input.name,
    latitude: input.latitude,
    longitude: input.longitude,
    elevationM: input.elevationM,
    timezone: input.timezone ?? VIRTUAL_STATION_DEFAULT_TIMEZONE,
    targetResolutionMinutes: VIRTUAL_STATION_TARGET_RESOLUTION_MINUTES,
    shadowMode: true,
    active: true,
    providers: DEFAULT_VIRTUAL_STATION_PROVIDERS.map((provider) => ({ ...provider })),
  };

  const locationValidation = validateVirtualStationLocation(station);
  const scopeValidation = validateVirtualStationScope(station);
  const errors = [...locationValidation.errors, ...scopeValidation.errors];
  if (errors.length > 0) {
    throw new Error(`Estacao virtual invalida: ${errors.join("; ")}`);
  }

  return station;
}

/**
 * Ordena candidatos pela regra espacial oficial do Cotrim:
 * pivo especifico > modulo do pivo > fazenda.
 */
export function rankVirtualStationForPivot(
  station: Pick<VirtualWeatherStationV2, "farmId" | "scopeType" | "moduleId" | "pivotId" | "active">,
  target: { farmId: string; moduleId: string | null; pivotId: string },
): number | null {
  if (!station.active || station.farmId !== target.farmId) return null;
  if (station.scopeType === "pivot") {
    return station.pivotId === target.pivotId ? 300 : null;
  }
  if (station.scopeType === "module") {
    return target.moduleId !== null && station.moduleId === target.moduleId ? 200 : null;
  }
  return 100;
}
