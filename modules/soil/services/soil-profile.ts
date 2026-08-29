/**
 * Perfil físico do solo no pivô (Etapa B).
 *
 * CC e PMP são gravados na unidade escolhida (gravimétrica %, volumétrica %
 * ou m³/m³). A fórmula de DTA muda no motor — densidade só entra na forma
 * gravimétrica. Conversão θv = θg × Da permanece disponível para legado.
 *
 * KL padrão em pivô central com molhamento total = 1. Este módulo calcula o
 * KL ponderado; não aplica KL à ETc (isso é Etapa E).
 */

import { roundTo } from "@/utils/math";
import { calculateLayerCAD, type LayerParams } from "./soil.service";
import { calculateRootZoneStorage, type MoistureUnit } from "@/modules/water-balance/agronomy";

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
  /** Densidade aparente (g/cm³) — informativa, não entra na CAD. */
  bulk_density?: number | null;
  /** Coeficiente de localização 0–1. Null = {@link DEFAULT_CENTER_PIVOT_KL}. */
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
 * Nunca é chamada pelo motor — só quando o operador informa dado em massa.
 */
export function volumetricFromGravimetric(
  thetaGravimetric: number,
  bulkDensity: number,
): number {
  if (thetaGravimetric < 0 || bulkDensity <= 0) return 0;
  return roundTo(thetaGravimetric * bulkDensity, 4);
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
 * CAD_camada = (CC − PMP) × espessura_m × 1000. Densidade não entra.
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

/**
 * CTA/CRA na unidade cadastrada. Não converte gravimetria em volumétrica.
 */
export function cadAfdFromMoistureUnit(input: {
  cc: number;
  pmp: number;
  bulkDensity: number | null;
  depthStartCm: number;
  depthEndCm: number;
  unit: MoistureUnit;
  fd?: number;
}): { cadMm: number | null; afdMm: number | null; missing: string[] } {
  const zone = calculateRootZoneStorage({
    layers: [{
      depthStartCm: input.depthStartCm,
      depthEndCm: input.depthEndCm,
      cc: input.cc,
      pmp: input.pmp,
      bulkDensity: input.bulkDensity,
    }],
    unit: input.unit,
    zrCm: Math.max(input.depthEndCm, 0),
    fd: input.fd ?? 0.5,
  });
  return { cadMm: zone.cta.value, afdMm: zone.cra.value, missing: zone.missing };
}
