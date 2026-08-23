import { roundTo } from "@/utils/math";

export interface DualCropPhaseLike {
  kcb_start?: number | null;
  kcb_end?: number | null;
  kc_start: number;
  kc_end: number;
  canopy_cover_start?: number | null;
  canopy_cover_end?: number | null;
  plant_height_start_m?: number | null;
  plant_height_end_m?: number | null;
}

export interface DualSoilLike {
  field_capacity: number;
  wilting_point: number;
  texture?: string | null;
  evaporation_layer_depth_m?: number | null;
  readily_evaporable_water_mm?: number | null;
}

export interface DualWeatherLike {
  wind_speed_2m?: number | null;
  rh_min?: number | null;
}

export interface SurfaceEvaporationState {
  deStartMm: number;
  deEndMm: number;
  tewMm: number;
  rewMm: number;
  kr: number;
  kcbReference: number;
  kcbAdjusted: number;
  kcMax: number;
  canopyCoverFraction: number;
  wettedFraction: number;
  exposedWettedFraction: number;
  ke: number;
  soilEvaporationMm: number;
  evaporationLayerDepthM: number;
  climateAdjustmentSource: "observed" | "fao56_standard_climate";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function interpolateDualValue(start: number, end: number, progress: number): number {
  const p = clamp(progress, 0, 1);
  return start + (end - start) * p;
}

/**
 * Kcb de referência da fase. Durante a transição, kc_start/kc_end são usados
 * somente como fallback para culturas ainda não migradas explicitamente.
 */
export function interpolateKcb(phase: DualCropPhaseLike, progress: number): number {
  const start = phase.kcb_start ?? phase.kc_start;
  const end = phase.kcb_end ?? phase.kc_end;
  return roundTo(interpolateDualValue(start, end, progress), 3);
}

export function interpolatePlantHeightM(phase: DualCropPhaseLike, progress: number): number {
  const start = phase.plant_height_start_m ?? 0.1;
  const end = phase.plant_height_end_m ?? start;
  return roundTo(Math.max(interpolateDualValue(start, end, progress), 0.05), 3);
}

/**
 * FAO-56 Eq. 70. Quando u2/RHmin confiáveis não existem, usa as condições
 * padrão da tabela (u2=2 m/s; RHmin=45%) e marca a origem no resultado.
 */
export function calculateKcbAdjusted(
  kcbReference: number,
  heightM: number,
  weather: DualWeatherLike = {},
): { value: number; source: "observed" | "fao56_standard_climate" } {
  const hasObserved = Number.isFinite(weather.wind_speed_2m) && Number.isFinite(weather.rh_min);
  const u2 = hasObserved ? clamp(Number(weather.wind_speed_2m), 0.5, 6) : 2;
  const rhMin = hasObserved ? clamp(Number(weather.rh_min), 20, 80) : 45;
  const h = clamp(heightM, 0.1, 10);
  const adjustment = (0.04 * (u2 - 2) - 0.004 * (rhMin - 45)) * Math.pow(h / 3, 0.3);
  return {
    value: roundTo(Math.max(kcbReference + adjustment, 0), 3),
    source: hasObserved ? "observed" : "fao56_standard_climate",
  };
}

/** FAO-56 Eq. 72. */
export function calculateKcMax(
  kcbAdjusted: number,
  heightM: number,
  weather: DualWeatherLike = {},
): number {
  const hasObserved = Number.isFinite(weather.wind_speed_2m) && Number.isFinite(weather.rh_min);
  const u2 = hasObserved ? clamp(Number(weather.wind_speed_2m), 0.5, 6) : 2;
  const rhMin = hasObserved ? clamp(Number(weather.rh_min), 20, 80) : 45;
  const h = clamp(heightM, 0.1, 10);
  const climateLimit = 1.2 + (0.04 * (u2 - 2) - 0.004 * (rhMin - 45)) * Math.pow(h / 3, 0.3);
  return roundTo(Math.max(climateLimit, kcbAdjusted + 0.05), 3);
}

/**
 * FAO-56 Eq. 76. Se houver cobertura cadastrada na fase, ela tem prioridade;
 * caso contrário a cobertura é estimada a partir de Kcb, Kcmax e altura.
 */
export function calculateCanopyCoverFraction(
  phase: DualCropPhaseLike,
  progress: number,
  kcbAdjusted: number,
  kcMax: number,
  heightM: number,
): number {
  if (phase.canopy_cover_start != null && phase.canopy_cover_end != null) {
    return roundTo(clamp(interpolateDualValue(phase.canopy_cover_start, phase.canopy_cover_end, progress), 0, 0.99), 3);
  }
  const kcMin = 0.15;
  if (kcMax <= kcMin || kcbAdjusted <= kcMin) return 0;
  const base = clamp((kcbAdjusted - kcMin) / (kcMax - kcMin), 0, 1);
  const fc = Math.pow(base, 1 + 0.5 * Math.max(heightM, 0));
  return roundTo(clamp(fc, 0, 0.99), 3);
}

/** FAO-56 Eq. 73. Pivô central usa fw=1 por padrão. */
export function calculateExposedWettedFraction(canopyCoverFraction: number, wettedFraction = 1): number {
  return roundTo(clamp(Math.min(1 - canopyCoverFraction, wettedFraction), 0.01, 1), 3);
}

/** FAO-56 Eq. 73/79: TEW da camada evaporante. */
export function calculateTEW(thetaFc: number, thetaWp: number, zeM: number): number {
  return roundTo(Math.max(1000 * (thetaFc - 0.5 * thetaWp) * zeM, 0), 2);
}

/**
 * REW de referência por classe textural, baseado nas faixas da Tabela 19 do
 * FAO-56. Usa o centro da faixa e mantém a origem auditável no solo.
 */
export function referenceREWByTexture(texture?: string | null): number | null {
  if (!texture) return null;
  const t = texture.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/_/g, "-");
  if (t.includes("franco-arenoso") || t.includes("sandy loam")) return 8;
  if (t.includes("areia-franca") || t.includes("loamy sand")) return 6;
  if (t === "areia" || t.includes("sand")) return 5;
  if (t.includes("franco-silt") || t.includes("silt loam")) return 9.5;
  if (t.includes("franco-argil") || t.includes("clay loam")) return 9.5;
  if (t.includes("argil") || t.includes("clay")) return 10;
  if (t.includes("franco") || t.includes("loam")) return 9;
  return null;
}

export function resolveSurfaceSoilParameters(soil: DualSoilLike): { zeM: number; tewMm: number; rewMm: number } | null {
  const zeM = soil.evaporation_layer_depth_m ?? 0.1;
  const tewMm = calculateTEW(soil.field_capacity, soil.wilting_point, zeM);
  const rewDerived = soil.readily_evaporable_water_mm ?? referenceREWByTexture(soil.texture);
  if (!Number.isFinite(tewMm) || tewMm <= 0 || rewDerived == null || !Number.isFinite(rewDerived) || rewDerived <= 0) return null;
  return { zeM, tewMm, rewMm: roundTo(Math.min(rewDerived, tewMm), 2) };
}

/** FAO-56 Eq. 74. */
export function calculateKr(deStartMm: number, rewMm: number, tewMm: number): number {
  if (deStartMm <= rewMm) return 1;
  if (tewMm <= rewMm) return 0;
  return roundTo(clamp((tewMm - deStartMm) / (tewMm - rewMm), 0, 1), 3);
}

/** FAO-56 Eq. 71. */
export function calculateKe(kr: number, kcMax: number, kcbAdjusted: number, few: number): number {
  const stageLimit = kr * Math.max(kcMax - kcbAdjusted, 0);
  const exposedLimit = few * kcMax;
  return roundTo(clamp(Math.min(stageLimit, exposedLimit), 0, Math.max(kcMax - kcbAdjusted, 0)), 3);
}

/**
 * Passo diário simplificado para aspersão de área total (fw=1): chuva e
 * irrigação efetiva reduzem De; evaporação do solo aumenta De. O estado fica
 * limitado entre 0 e TEW. Não há hipótese silenciosa de molhamento localizado.
 */
export function computeSurfaceEvaporationDay(input: {
  phase: DualCropPhaseLike;
  phaseProgress: number;
  et0Mm: number;
  precipitationMm: number;
  effectiveIrrigationMm: number;
  soil: DualSoilLike;
  previousDeMm?: number | null;
  weather?: DualWeatherLike;
  wettedFraction?: number;
}): SurfaceEvaporationState | null {
  const params = resolveSurfaceSoilParameters(input.soil);
  if (!params) return null;

  const kcbReference = interpolateKcb(input.phase, input.phaseProgress);
  const heightM = interpolatePlantHeightM(input.phase, input.phaseProgress);
  const adjusted = calculateKcbAdjusted(kcbReference, heightM, input.weather);
  const kcMax = calculateKcMax(adjusted.value, heightM, input.weather);
  const fc = calculateCanopyCoverFraction(input.phase, input.phaseProgress, adjusted.value, kcMax, heightM);
  const fw = clamp(input.wettedFraction ?? 1, 0.01, 1);
  const few = calculateExposedWettedFraction(fc, fw);

  // Para o primeiro dia sem seed superficial, assume-se a camada superficial
  // seca até REW (limite entre estágio 1 e 2), em vez de assumir solo saturado.
  const deStartMm = roundTo(clamp(input.previousDeMm ?? params.rewMm, 0, params.tewMm), 2);
  const kr = calculateKr(deStartMm, params.rewMm, params.tewMm);
  const ke = calculateKe(kr, kcMax, adjusted.value, few);
  const soilEvaporationMm = roundTo(Math.max(ke * input.et0Mm, 0), 2);
  const wettingMm = Math.max(input.precipitationMm, 0) + Math.max(input.effectiveIrrigationMm, 0) / fw;
  const deEndMm = roundTo(clamp(deStartMm - wettingMm + soilEvaporationMm / few, 0, params.tewMm), 2);

  return {
    deStartMm,
    deEndMm,
    tewMm: params.tewMm,
    rewMm: params.rewMm,
    kr,
    kcbReference,
    kcbAdjusted: adjusted.value,
    kcMax,
    canopyCoverFraction: fc,
    wettedFraction: fw,
    exposedWettedFraction: few,
    ke,
    soilEvaporationMm,
    evaporationLayerDepthM: params.zeM,
    climateAdjustmentSource: adjusted.source,
  };
}
