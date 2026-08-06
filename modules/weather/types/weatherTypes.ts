// ============================================================================
// modules/weather/types/weatherTypes.ts
// ----------------------------------------------------------------------------
// Tipos climáticos padronizados da Cotrim Irrigação Pro (Etapa 1).
//
// Regras de projeto (obrigatórias):
//   • Todos os campos numéricos aceitam number | null. Ausência é null; nunca
//     use zero para representar dado ausente.
//   • Unidades estão no NOME do campo (ex.: temperatureMinC, windSpeed2mMs).
//     Se precisar de outra unidade, converta em conversions/weatherUnits.ts.
//   • Nunca misture previsão, observação e reanálise no mesmo registro.
//     A distinção vive em metadata.dataType.
//   • Estes tipos são server-safe e independentes de UI, DB e provider.
// ============================================================================

/** Provedores climáticos suportados (nome canônico do sistema). */
export type WeatherProviderName =
  | "open_meteo"
  | "meteoblue"
  | "nasa_power"
  | "meteostat"
  | "noaa"
  | "farm_station"
  | "manual";

/** Natureza do dado — usada para nunca misturar categorias diferentes. */
export type WeatherDataType =
  | "observed"    // medido por rede/estação em tempo real
  | "forecast"    // previsão
  | "reanalysis"  // grade histórica / reanálise
  | "station"     // estação da fazenda (in situ)
  | "manual"      // digitado pelo operador
  | "calculated"  // derivado por cálculo (ex.: ETo interna)
  | "estimated";  // valor estimado quando faltam variáveis

/** Classificação de qualidade agregada de um registro climático. */
export type WeatherQualityStatus =
  | "complete"     // todas as variáveis essenciais presentes e válidas
  | "partial"      // faltam variáveis não críticas ou algo suspeito
  | "stale"        // dado antigo/atrasado para o uso pretendido
  | "missing"      // faltam variáveis essenciais para o uso pretendido
  | "invalid"      // contém valores fisicamente impossíveis
  | "suspicious"   // dentro do possível, mas fora do esperado
  | "unavailable"  // consulta não pôde ser realizada
  | "estimated";   // valor(es) foram estimados por método declarado

/** Localização de referência para consulta ou registro climático. */
export interface WeatherLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string; // IANA (ex.: "America/Sao_Paulo")
}

/**
 * Metadados de origem/qualidade que acompanham SEMPRE um registro climático.
 * Ficam separados dos valores para deixar claro o que é dado × o que é
 * proveniência.
 */
export interface WeatherSourceMetadata {
  provider: WeatherProviderName;
  /** Nome do modelo/dataset (ex.: "ECMWF-IFS", "GHCND", "ICON-D2"). */
  modelName: string | null;
  dataType: WeatherDataType;
  /** Instante em que a previsão foi emitida (só para dataType='forecast'). */
  forecastIssuedAt: string | null;   // ISO-8601 UTC
  /** Instante para o qual o dado é válido. */
  validAt: string;                    // ISO-8601 UTC
  /** Momento em que o dado foi buscado da fonte. */
  fetchedAt: string;                  // ISO-8601 UTC
  /** Referência técnica opcional (URL sanitizada, id do payload bruto, etc.). */
  sourceReference: string | null;
  qualityStatus: WeatherQualityStatus;
  /** Nomes dos campos ausentes na resposta original. */
  missingFields: string[];
  /** Avisos textuais legíveis (ex.: "vento estimado a partir de u10"). */
  warnings: string[];
}

/**
 * Dado climático diário padronizado.
 *
 * Convenção de unidades:
 *   • temperatura: °C
 *   • umidade relativa: %
 *   • chuva: mm (acumulado do dia)
 *   • probabilidade de chuva: %
 *   • vento: m/s (2m ou 10m — explícito no nome)
 *   • direção do vento: graus (0..360)
 *   • radiação solar: MJ/m²/dia (integrada no dia)
 *   • pressão: kPa
 *   • VPD: kPa
 *   • ETo: mm/dia
 */
export interface DailyWeatherData {
  location: WeatherLocation;
  /** Data local da fazenda no formato YYYY-MM-DD. */
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

  /** ETo entregue pelo provedor (mm/dia), quando disponível. */
  providerReferenceEtoMm: number | null;
  /** ETo calculada internamente pelo motor FAO-56 (mm/dia). */
  internallyCalculatedEtoMm: number | null;

  metadata: WeatherSourceMetadata;
}

/**
 * Dado climático horário padronizado.
 *
 * Diferenças frente ao diário:
 *   • Sem min/max/mean (é o valor pontual da hora).
 *   • Radiação em W/m² (fluxo instantâneo/horário) — convertida para
 *     MJ/m²/dia apenas quando agregada.
 */
export interface HourlyWeatherData {
  location: WeatherLocation;
  /** Timestamp exato de validade da leitura (ISO-8601 UTC). */
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

/** Intervalo de busca fechado em datas locais da fazenda (YYYY-MM-DD). */
export interface WeatherFetchRange {
  startDate: string;
  endDate: string;
}
