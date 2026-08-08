// ============================================================================
// modules/weather/types/weatherTypes.ts
// ----------------------------------------------------------------------------
// Tipos climáticos padronizados da Cotrim Irrigação Pro.
// Ausência de dado é sempre null; nunca zero artificial.
// ============================================================================

export type WeatherProviderName =
  | "open_meteo"
  | "meteoblue"
  | "weatherapi"
  | "met_norway"
  | "nasa_power"
  | "meteostat"
  | "noaa"
  | "farm_station"
  | "manual";

export type WeatherDataType =
  | "observed"
  | "forecast"
  | "reanalysis"
  | "station"
  | "manual"
  | "calculated"
  | "estimated";

export type WeatherQualityStatus =
  | "complete"
  | "partial"
  | "stale"
  | "missing"
  | "invalid"
  | "suspicious"
  | "unavailable"
  | "estimated";

export interface WeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string;
}

export interface WeatherSourceMetadata {
  provider: WeatherProviderName;
  modelName: string | null;
  dataType: WeatherDataType;
  forecastIssuedAt: string | null;
  validAt: string;
  fetchedAt: string;
  sourceReference: string | null;
  qualityStatus: WeatherQualityStatus;
  missingFields: string[];
  warnings: string[];
  /** Resolução nativa informada pelo provedor. */
  sourceResolutionMinutes?: number | null;
  /** true quando o valor do intervalo foi interpolado pelo Cotrim/provedor. */
  interpolated?: boolean;
  /** true quando uma ou mais variáveis foram estimadas. */
  estimated?: boolean;
}

export interface DailyWeatherData {
  location: WeatherLocation;
  date: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  temperatureMeanC: number | null;
  relativeHumidityMinPct: number | null;
  relativeHumidityMaxPct: number | null;
  relativeHumidityMeanPct: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPct: number | null;
  windSpeed2mMs: number | null;
  windSpeed10mMs: number | null;
  windDirectionDeg: number | null;
  solarRadiationMjM2Day: number | null;
  surfacePressureKpa: number | null;
  vapourPressureDeficitKpa: number | null;
  providerReferenceEtoMm: number | null;
  internallyCalculatedEtoMm: number | null;
  metadata: WeatherSourceMetadata;
}

export interface HourlyWeatherData {
  location: WeatherLocation;
  validAt: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPct: number | null;
  windSpeed2mMs: number | null;
  windSpeed10mMs: number | null;
  windDirectionDeg: number | null;
  solarRadiationWm2: number | null;
  surfacePressureKpa: number | null;
  vapourPressureDeficitKpa: number | null;
  providerReferenceEtoMm: number | null;
  metadata: WeatherSourceMetadata;
}

/** Registro canônico sub-horário usado pela futura ETo de 30 minutos. */
export interface WeatherInterval30MinData {
  location: WeatherLocation;
  intervalStart: string;
  intervalEnd: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  dewPointC: number | null;
  precipitationMm: number | null;
  windSpeed2mMs: number | null;
  windSpeed10mMs: number | null;
  windDirectionDeg: number | null;
  solarRadiationWm2: number | null;
  surfacePressureKpa: number | null;
  metadata: WeatherSourceMetadata;
}

export interface WeatherFetchRange {
  startDate: string;
  endDate: string;
}
