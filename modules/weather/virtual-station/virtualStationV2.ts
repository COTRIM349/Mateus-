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

export interface VirtualStationProviderConfig {
  provider: VirtualStationProvider;
  enabled: boolean;
  priority: number;
  role: VirtualStationProviderRole;
}

export interface VirtualWeatherStationV2 extends WeatherLocation {
  farmId: string;
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

export function buildDefaultVirtualStation(input: {
  id: string;
  farmId: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone?: string | null;
}): VirtualWeatherStationV2 {
  const station: VirtualWeatherStationV2 = {
    id: input.id,
    farmId: input.farmId,
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

  const validation = validateVirtualStationLocation(station);
  if (!validation.valid) {
    throw new Error(`Estacao virtual invalida: ${validation.errors.join("; ")}`);
  }

  return station;
}
