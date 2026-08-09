// ============================================================================
// modules/weather/config/climateSpecification.ts
// ----------------------------------------------------------------------------
// Climate Specification v1.0.0 — representação em código.
//
// Este arquivo é a fonte única e versionada das regras da camada climática.
// Documento humano equivalente: modules/weather/CLIMATE_SPECIFICATION.md
//
// Princípios:
//   • Todas as constantes normativas moram AQUI ou são re-exportadas a partir
//     de weatherQuality/weatherUnits/openMeteoProvider — nunca redeclaradas.
//   • Nenhuma regra desta spec altera comportamento em tempo de execução.
//     A spec descreve o contrato; a mudança do fluxo antigo é assunto de
//     etapas dedicadas.
// ============================================================================

import { DEFAULT_PHYSICAL_RANGES } from "@/modules/weather/quality/weatherQuality";
import { OPEN_METEO_FALLBACK_TIMEZONE } from "@/modules/weather/providers/openMeteoProvider";
import type {
  DailyWeatherData,
  WeatherProviderName,
} from "@/modules/weather/types/weatherTypes";

// ── Versão ──────────────────────────────────────────────────────────────────
export const CLIMATE_SPEC_VERSION = "1.0.0" as const;

// ── Fuso oficial (spec) ─────────────────────────────────────────────────────
// A camada nova adota America/Bahia. O fluxo antigo mantém America/Sao_Paulo
// e será migrado em etapa própria — divergência conhecida C1.
export const DEFAULT_TIMEZONE = OPEN_METEO_FALLBACK_TIMEZONE;

// ── Unidades oficiais ──────────────────────────────────────────────────────
export const OFFICIAL_UNITS = {
  temperature: "°C",
  humidity: "%",
  precipitation: "mm",
  probability: "%",
  windSpeed: "m/s",
  windDirection: "°",
  solarRadiationHourly: "W/m²",
  solarRadiationDaily: "MJ/m²/dia",
  pressure: "kPa",
  vpd: "kPa",
  eto: "mm/dia",
  elevation: "m",
  coordinates: "graus decimais",
} as const;

// ── Faixas físicas (re-exportadas de weatherQuality; NÃO redeclarar) ───────
export const PHYSICAL_RANGES = DEFAULT_PHYSICAL_RANGES;

// ── Completude horária → diária (regras 90 / 70 / <70) ─────────────────────
export const COMPLETENESS_THRESHOLDS = {
  complete: 0.9,
  partial: 0.7,
} as const;

// ── Idades máximas ─────────────────────────────────────────────────────────
export const MAX_AGE = {
  /** Observação após este limite entra em `stale`. */
  observedHours: 48,
  /** Previsão emitida além disso é considerada desatualizada para uso operacional. */
  forecastHours: 24,
} as const;

// ── ETo — política de validação ────────────────────────────────────────────
/** Nenhuma ETo está liberada como oficial enquanto não houver validação local. */
export const ETO_OPERATIONAL_STATUS = "validation_blocked" as const;
export const OFFICIAL_ETO_METHOD = null;
export const OFFICIAL_ETO_FIELD = null;
export const INTERNAL_ETO_AUDIT_FIELD = "internallyCalculatedEtoMm" as const;
export const PROVIDER_ETO_FIELD = "providerReferenceEtoMm" as const;
/** Consumidores autorizados a usar `providerReferenceEtoMm`. */
export const PROVIDER_ETO_ALLOWED_USES = [
  "diagnostic",
  "ui_comparison",
  "audit",
] as const;
/** Consumidores PROIBIDOS de usar `providerReferenceEtoMm`. */
export const PROVIDER_ETO_FORBIDDEN_USES = [
  "water_balance",
  "irrigation_recommendation",
] as const;

// Campos que o motor FAO-56 exige (cascata da Etapa 2). Estar no essencial
// significa: ausência de TODOS impede cálculo, ETo interna = null.
export const ETO_ESSENTIAL_FIELDS = [
  "temperatureMinC",
  "temperatureMaxC",
  "solarRadiationMjM2Day",
  "windSpeed2mMs",
  // ea é essencial, mas pode vir de ea direto ou derivada de RH:
  // pelo menos UMA dessas cascatas deve existir.
  "relativeHumidityMeanPct",
] as const satisfies readonly (keyof DailyWeatherData)[];

// Campos derivados/estimáveis pelo motor com metodologia declarada.
export const ETO_ESTIMABLE_FIELDS = [
  "temperatureMeanC",         // (Tmin+Tmax)/2 — método permitido
  "surfacePressureKpa",       // FAO-56 eq. 7 via elevação
  "windSpeed2mMs",            // FAO-56 eq. 47 a partir de u10
  "vapourPressureDeficitKpa", // interno, es − ea
] as const satisfies readonly (keyof DailyWeatherData)[];

// ── Prioridade das fontes (MATRIZ INICIAL, configurável) ───────────────────
// Menor índice = maior prioridade. Provedores ausentes na lista não são
// consumidos para aquela variável. `configuravel_por_fazenda: true` na spec
// indica que a matriz pode ser sobrescrita por configuração futura.
export type SourceMatrixKey =
  | "temperature"
  | "humidity"
  | "precipitationObserved"
  | "precipitationForecast"
  | "wind"
  | "radiation"
  | "pressure"
  | "eto";

export const SOURCE_PRIORITY: Readonly<
  Record<SourceMatrixKey, readonly WeatherProviderName[]>
> = {
  temperature: [
    "farm_station",
    "manual",
    "open_meteo",
    "meteoblue",
    "noaa",
    "meteostat",
    "nasa_power",
  ],
  humidity: [
    "farm_station",
    "manual",
    "open_meteo",
    "meteoblue",
    "noaa",
    "meteostat",
    "nasa_power",
  ],
  precipitationObserved: [
    "farm_station",
    "manual",
    "noaa",
    "meteostat",
    "nasa_power",
  ],
  precipitationForecast: [
    "open_meteo",
    "meteoblue",
  ],
  wind: [
    "farm_station",
    "manual",
    "open_meteo",
    "meteoblue",
    "meteostat",
    "noaa",
    "nasa_power",
  ],
  radiation: [
    "farm_station",
    "open_meteo",
    "meteoblue",
    "nasa_power",
  ],
  pressure: [
    "farm_station",
    "open_meteo",
    "meteoblue",
  ],
  eto: [
    // ETo NÃO tem prioridade externa — é sempre interna.
    // Provedores ficam disponíveis apenas para diagnóstico/UI.
  ],
} as const;

// ── Blocos de bloqueio (cálculo permitido / negado) ────────────────────────
export interface EtoBlockingRule {
  /** Condição em uma linguagem legível. */
  when: string;
  /** Bloqueia cálculo? (true) ou apenas degrada qualidade? (false) */
  block: boolean;
}

export const ETO_BLOCKING_RULES: readonly EtoBlockingRule[] = [
  { when: "temperatureMinC ausente", block: true },
  { when: "temperatureMaxC ausente", block: true },
  { when: "solarRadiationMjM2Day ausente", block: true },
  { when: "windSpeed2mMs ausente e windSpeed10mMs ausente", block: true },
  {
    when: "actualVapourPressureKpa, RHmin/RHmax e RHmean todos ausentes",
    block: true,
  },
  {
    when: "surfacePressureKpa e elevationM ambos ausentes",
    block: true,
  },
  {
    when: "surfacePressureKpa ausente mas elevationM presente",
    block: false, // estimativa via FAO-56 eq. 7; qualidade → 'estimated'
  },
  {
    when: "temperatureMeanC ausente mas Tmin+Tmax presentes",
    block: false, // (Tmin+Tmax)/2; qualidade → 'estimated'
  },
  {
    when: "RHmin/RHmax ausentes mas RHmean presente",
    block: false, // fallback via es × RHmean/100; qualidade → 'estimated'
  },
] as const;

// ── Regras de agregação horária → diária ───────────────────────────────────
export type HourlyAggregationRule =
  | "min"
  | "max"
  | "mean"
  | "sum"
  | "integrationWm2ToMjPerDay"
  | "circularMeanWeightedByWind";

export const DAILY_AGGREGATION_RULES: Readonly<Record<
  | "temperatureMinC"
  | "temperatureMaxC"
  | "temperatureMeanC"
  | "relativeHumidityMinPct"
  | "relativeHumidityMaxPct"
  | "relativeHumidityMeanPct"
  | "precipitationMm"
  | "surfacePressureKpa"
  | "vapourPressureDeficitKpaMean"
  | "vapourPressureDeficitKpaMax"
  | "windSpeed2mMsMean"
  | "windSpeed2mMsMax"
  | "windDirectionDeg"
  | "solarRadiationMjM2Day",
  HourlyAggregationRule
>> = {
  temperatureMinC: "min",
  temperatureMaxC: "max",
  temperatureMeanC: "mean",
  relativeHumidityMinPct: "min",
  relativeHumidityMaxPct: "max",
  relativeHumidityMeanPct: "mean",
  precipitationMm: "sum",
  surfacePressureKpa: "mean",
  vapourPressureDeficitKpaMean: "mean",
  vapourPressureDeficitKpaMax: "max",
  windSpeed2mMsMean: "mean",
  windSpeed2mMsMax: "max",
  windDirectionDeg: "circularMeanWeightedByWind",
  solarRadiationMjM2Day: "integrationWm2ToMjPerDay",
} as const;

// ── Divergências conhecidas com o fluxo legado ─────────────────────────────
export interface KnownDivergence {
  id: string;
  location: string;
  legacyBehavior: string;
  specDecision: string;
  toFixIn: string;
}

export const KNOWN_DIVERGENCES: readonly KnownDivergence[] = [
  {
    id: "C1",
    location:
      "ingestion.service.ts:132,374; meteoblue-ingest.ts:34,182; virtual-station.service.ts:171,234",
    legacyBehavior: "Fallback de timezone = America/Sao_Paulo",
    specDecision: "Fuso canônico = America/Bahia (DEFAULT_TIMEZONE)",
    toFixIn: "Etapa futura de migração do timezone do fluxo antigo",
  },
  {
    id: "C2",
    location: "modules/weather/services/weather.service.ts (validateWeatherReading)",
    legacyBehavior:
      "Faixas de temperatura mais estreitas (temp_max −10..55; temp_min −15..45)",
    specDecision:
      "PHYSICAL_RANGES.temperatureC = −15..55 é a faixa oficial; validateWeatherReading é validador legado, não normativo",
    toFixIn: "Etapa futura de consolidação de validações",
  },
  {
    id: "C3",
    location:
      "app/(app)/clima/page.tsx: `d.et0_calculated ?? d.et0_source ?? 0`",
    legacyBehavior:
      "UI usa providerReferenceEtoMm como fallback de exibição com `?? 0`",
    specDecision:
      "UI PODE mostrar providerReferenceEtoMm para comparação, mas nunca como ETo oficial e nunca como zero por ausência. Balanço hídrico e recomendação continuam PROIBIDOS de consumir providerEto.",
    toFixIn:
      "Etapa futura de limpeza da UI (`?? 0` → tratamento explícito de null)",
  },
] as const;

// ── Contrato futuro com o balanço hídrico ──────────────────────────────────
export const WATER_BALANCE_CONTRACT = {
  allowedEtoSource: OFFICIAL_ETO_FIELD, // internallyCalculatedEtoMm
  allowedPrecipitationTypes: ["observed", "manual"] as const,
  allowedForecastPrecipitationTypes: ["forecast"] as const,
  requiresOriginMetadata: true,
  requiresQualityMetadata: true,
  /**
   * A conexão real do balanço à nova camada é assunto de etapa futura.
   * Este objeto apenas define o contrato mínimo que a integração terá
   * que satisfazer.
   */
  connectedInEtapa: null as string | null,
} as const;

// ── Snapshot informativo para introspecção ─────────────────────────────────
export const CLIMATE_SPECIFICATION = {
  version: CLIMATE_SPEC_VERSION,
  officialUnits: OFFICIAL_UNITS,
  defaultTimezone: DEFAULT_TIMEZONE,
  physicalRanges: PHYSICAL_RANGES,
  completenessThresholds: COMPLETENESS_THRESHOLDS,
  maxAge: MAX_AGE,
  eto: {
    method: OFFICIAL_ETO_METHOD,
    officialField: OFFICIAL_ETO_FIELD,
    providerField: PROVIDER_ETO_FIELD,
    providerAllowedUses: PROVIDER_ETO_ALLOWED_USES,
    providerForbiddenUses: PROVIDER_ETO_FORBIDDEN_USES,
    essentialFields: ETO_ESSENTIAL_FIELDS,
    estimableFields: ETO_ESTIMABLE_FIELDS,
    blockingRules: ETO_BLOCKING_RULES,
  },
  sourcePriority: SOURCE_PRIORITY,
  dailyAggregationRules: DAILY_AGGREGATION_RULES,
  waterBalanceContract: WATER_BALANCE_CONTRACT,
  knownDivergences: KNOWN_DIVERGENCES,
} as const;

export type ClimateSpecification = typeof CLIMATE_SPECIFICATION;
