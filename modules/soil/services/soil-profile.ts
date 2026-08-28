/**
 * Perfil físico do solo no pivô (Etapa B).
 *
 * O motor armazena e calcula CC/PMP SEMPRE em base volumétrica (cm³/cm³).
 * Densidade aparente (g/cm³) não entra na CAD quando CC/PMP já são
 * volumétricos. Quando o operador recebe um laudo em base gravimétrica
 * (% em peso), a conversão para volumétrica é explícita antes de persistir.
 *
 * KL padrão em pivô central com molhamento total = 1. Este módulo calcula o
 * KL ponderado; não aplica KL à ETc.
 */

import { roundTo } from "@/utils/math";
import { calculateLayerCAD, type LayerParams } from "./soil.service";

export const SOIL_UNITS = {
  fieldCapacity: "cm³/cm³",
  wiltingPoint: "cm³/cm³",
  bulkDensity: "g/cm³",
  layerDepth: "cm",
  rootDepth: "m",
  cad: "mm",
  afd: "mm",
  kl: "adimensional (0–1)",
} as const;

export type SoilWaterContentBasis =
  | "volumetric_fraction"
  | "volumetric_pct"
  | "gravimetric_fraction"
  | "gravimetric_pct";

/** Pivô central com molhamento total: KL = 1. Nunca aplicar outro valor às cegas. */
export const DEFAULT_CENTER_PIVOT_KL = 1;

export interface SoilProfileLayer {
  /** Profundidade inicial (cm). */
  depth_start: number;
  /** Profundidade final (cm). */
  depth_end: number;
  /** Capacidade de campo volumétrica (cm³/cm³). */
  field_capacity: number;
  /** Ponto de murcha permanente volumétrico (cm³/cm³). */
  wilting_point: number;
  /** Densidade aparente (g/cm³) — informativa na CAD volumétrica. */
  bulk_density?: number | null;
  /** Coeficiente de localização 0–1. Null = DEFAULT_CENTER_PIVOT_KL. */
  kl?: number | null;
}

export function mapDbLayersToProfile(
  rows: Array<{
    depth_start: number;
    depth_end: number;
    field_capacity: number;
    wilting_point: number;
    bulk_density?: number | null;
    kl?: number | null;
  }>,
): SoilProfileLayer[] {
  return rows.map((r) => ({
    depth_start: r.depth_start,
    depth_end: r.depth_end,
    field_capacity: r.field_capacity,
    wilting_point: r.wilting_point,
    bulk_density: r.bulk_density ?? null,
    kl: r.kl ?? null,
  }));
}

/**
 * Converte umidade gravimétrica (g/g) em volumétrica (cm³/cm³): θv = θg × Da.
 * Nunca deve ser chamada implicitamente pelo motor de balanço.
 */
export function volumetricFromGravimetric(
  thetaGravimetric: number,
  bulkDensity: number,
): number {
  if (!Number.isFinite(thetaGravimetric) || !Number.isFinite(bulkDensity)) return 0;
  if (thetaGravimetric < 0 || bulkDensity <= 0) return 0;
  return roundTo(thetaGravimetric * bulkDensity, 4);
}

/**
 * Normaliza uma leitura de CC/PMP para fração volumétrica (cm³/cm³).
 * A base da entrada é obrigatória; não tenta adivinhar unidade pelo valor.
 */
export function normalizeSoilWaterContent(
  value: number,
  basis: SoilWaterContentBasis,
  bulkDensity?: number | null,
): number | null {
  if (!Number.isFinite(value) || value < 0) return null;

  const asFraction = basis.endsWith("_pct") ? value / 100 : value;
  if (!Number.isFinite(asFraction) || asFraction < 0) return null;

  if (basis.startsWith("gravimetric")) {
    if (bulkDensity == null || !Number.isFinite(bulkDensity) || bulkDensity <= 0) return null;
    const converted = volumetricFromGravimetric(asFraction, bulkDensity);
    return converted > 0 ? converted : null;
  }

  return roundTo(asFraction, 4);
}

export interface NormalizedCcPmp {
  fieldCapacity: number;
  wiltingPoint: number;
}

/**
 * Converte CC/PMP da base declarada para a base volumétrica canônica e valida
 * a relação física CC > PMP. Retorna null se a entrada não puder ser usada com
 * segurança no balanço.
 */
export function normalizeCcPmpInput(input: {
  fieldCapacity: number;
  wiltingPoint: number;
  basis: SoilWaterContentBasis;
  bulkDensity?: number | null;
}): NormalizedCcPmp | null {
  const fieldCapacity = normalizeSoilWaterContent(input.fieldCapacity, input.basis, input.bulkDensity);
  const wiltingPoint = normalizeSoilWaterContent(input.wiltingPoint, input.basis, input.bulkDensity);
  if (fieldCapacity == null || wiltingPoint == null) return null;
  if (fieldCapacity <= wiltingPoint) return null;
  if (fieldCapacity > 0.7 || wiltingPoint > 0.5) return null;
  return { fieldCapacity, wiltingPoint };
}

export function resolveLayerKl(kl: number | null | undefined): number {
  if (kl == null || Number.isNaN(kl)) return DEFAULT_CENTER_PIVOT_KL;
  return Math.min(Math.max(kl, 0), 1);
}

/**
 * Recorta as camadas à profundidade radicular Z (m).
 * Camadas abaixo de Z são ignoradas; a camada que contém Z é cortada.
 */
export function clipLayersToRootDepth(
  layers: SoilProfileLayer[],
  rootDepthMeters: number,
): SoilProfileLayer[] {
  const zCm = rootDepthMeters * 100;
  if (zCm <= 0) return [];

  return layers
    .filter((l) => l.depth_end > l.depth_start && l.depth_start < zCm)
    .map((l) => ({
      ...l,
      depth_end: Math.min(l.depth_end, zCm),
    }))
    .filter((l) => l.depth_end > l.depth_start);
}

function toLayerParams(layer: SoilProfileLayer): LayerParams {
  return {
    depth_start: layer.depth_start,
    depth_end: layer.depth_end,
    field_capacity: layer.field_capacity,
    wilting_point: layer.wilting_point,
  };
}

/**
 * CAD/ADT (mm) do perfil no intervalo radicular Z.
 * CAD_camada = (CC − PMP) × espessura_m × 1000. Densidade não entra porque
 * todas as camadas já chegam aqui normalizadas para base volumétrica.
 */
export function calculateADTFromLayers(
  layers: SoilProfileLayer[],
  rootDepthMeters: number,
): number {
  const clipped = clipLayersToRootDepth(layers, rootDepthMeters);
  return roundTo(
    clipped.reduce((sum, layer) => sum + calculateLayerCAD(toLayerParams(layer)), 0),
    2,
  );
}

/**
 * KL médio ponderado pela espessura das camadas no intervalo Z.
 * Camada sem KL usa 1. Não aplica o coeficiente à ETc.
 */
export function weightedKlFromLayers(
  layers: SoilProfileLayer[],
  rootDepthMeters: number,
): number {
  const clipped = clipLayersToRootDepth(layers, rootDepthMeters);
  let numerator = 0;
  let thickness = 0;
  for (const layer of clipped) {
    const t = layer.depth_end - layer.depth_start;
    numerator += resolveLayerKl(layer.kl) * t;
    thickness += t;
  }
  if (thickness <= 0) return DEFAULT_CENTER_PIVOT_KL;
  return roundTo(numerator / thickness, 3);
}

export function soilProfileIsUsable(
  homogeneous: { field_capacity: number; wilting_point: number; effective_depth: number },
  layers?: SoilProfileLayer[] | null,
): boolean {
  if (layers && layers.length > 0) {
    return layers.some(
      (l) => l.field_capacity > l.wilting_point && l.depth_end > l.depth_start,
    );
  }
  return homogeneous.field_capacity > homogeneous.wilting_point && homogeneous.effective_depth > 0;
}
