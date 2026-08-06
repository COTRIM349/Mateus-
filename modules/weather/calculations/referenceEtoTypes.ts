// ============================================================================
// modules/weather/calculations/referenceEtoTypes.ts
// ----------------------------------------------------------------------------
// Tipos do motor FAO-56 Penman-Monteith interno da Cotrim.
//
// Este cálculo é ISOLADO. Não substitui o `calculateET0` de irrigation.service.
// Convive com ele até que a Etapa 6 valide a paridade numérica.
// ============================================================================

import type { WeatherQualityStatus } from "@/modules/weather/types/weatherTypes";

export type EtoMethod =
  | "fao_56_penman_monteith"
  | "fao_56_pm_estimated"; // método aplicado quando 1+ variável foi estimada

/**
 * Entrada para o cálculo. Campos numéricos podem ser null — o motor decide
 * se estima (registrando em estimatedFields) ou se degrada a qualidade.
 *
 * Unidades:
 *   • temperatura: °C
 *   • humidade: %
 *   • pressão: kPa
 *   • vento: m/s (a altura registrada em windMeasurementHeightM)
 *   • radiação solar: MJ/m²/dia (integrada no dia)
 *   • latitude: graus decimais
 *   • elevação: m
 */
export interface ReferenceEtoInput {
  /** Data local (YYYY-MM-DD). Usada para calcular o dia do ano solar. */
  date: string;
  latitude: number;
  elevationM: number | null;

  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  /** Se ausente, é derivada como (Tmin+Tmax)/2. */
  temperatureMeanC: number | null;

  relativeHumidityMinPct: number | null;
  relativeHumidityMaxPct: number | null;
  /** Fallback quando min/max não vieram. */
  relativeHumidityMeanPct: number | null;

  /** Pressão real de vapor (kPa) — se fornecida, tem precedência sobre RH. */
  actualVapourPressureKpa: number | null;

  windSpeedMs: number | null;
  /** Altura em que o vento foi medido (m). Se 2, sem ajuste. */
  windMeasurementHeightM: number;

  solarRadiationMjM2Day: number | null;
  /** Pressão à superfície (kPa) — se ausente, é derivada da elevação. */
  surfacePressureKpa: number | null;
}

/**
 * Variáveis intermediárias do Penman-Monteith. Todas em suas unidades naturais.
 * Retornadas para permitir auditoria e comparação entre implementações.
 */
export interface EtoIntermediateValues {
  /** Pressão atmosférica final usada (kPa). */
  atmosphericPressureKpa: number | null;
  /** Constante psicrométrica γ (kPa/°C). */
  psychrometricConstantKpaC: number | null;
  /** Pressão de saturação de vapor es (kPa) — média entre esMin e esMax. */
  saturationVapourPressureKpa: number | null;
  /** Pressão real de vapor ea (kPa). */
  actualVapourPressureKpa: number | null;
  /** Déficit de pressão de vapor (kPa). */
  vapourPressureDeficitKpa: number | null;
  /** Inclinação da curva de pressão de vapor Δ (kPa/°C). */
  saturationSlopeKpaC: number | null;
  /** Radiação extraterrestre Ra (MJ/m²/dia). */
  extraterrestrialRadiationMjM2Day: number | null;
  /** Radiação de céu claro Rso (MJ/m²/dia). */
  clearSkyRadiationMjM2Day: number | null;
  /** Radiação líquida de ondas curtas Rns (MJ/m²/dia). */
  netShortwaveRadiationMjM2Day: number | null;
  /** Radiação líquida de ondas longas Rnl (MJ/m²/dia). */
  netLongwaveRadiationMjM2Day: number | null;
  /** Radiação líquida Rn (MJ/m²/dia). */
  netRadiationMjM2Day: number | null;
  /** Fluxo de calor no solo G (MJ/m²/dia) — 0 na base diária FAO-56. */
  soilHeatFluxMjM2Day: number | null;
  /** Velocidade do vento ajustada para 2 m (m/s). */
  windSpeed2mMs: number | null;
}

export interface ReferenceEtoResult {
  /** ETo em mm/dia. null quando faltar variável essencial. */
  etoMmDay: number | null;
  method: EtoMethod;
  qualityStatus: WeatherQualityStatus;
  /** Nomes dos campos ausentes na entrada. */
  missingFields: string[];
  /** Avisos textuais (ex.: "windSpeed ajustado de 10m para 2m"). */
  warnings: string[];
  /**
   * Campos que foram estimados pelo próprio motor com uma metodologia
   * declarada (ex.: pressão a partir da elevação).
   */
  estimatedFields: EstimatedField[];
  intermediateValues: EtoIntermediateValues;
}

export interface EstimatedField {
  field: keyof ReferenceEtoInput | "atmosphericPressureKpa" | "actualVapourPressureKpa";
  method: string;
  reason: string;
}
