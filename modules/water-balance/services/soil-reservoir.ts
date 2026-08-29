/**
 * Reservatório de solo — DTA / CAD (CTA) / AFD (CRA) e validação de Ks por Dr.
 *
 * Equivalências operacionais:
 *   DTA (mm/cm) ≈ (θCC − θPMP) × 10   [θ volumétrico cm³/cm³]
 *   CAD (mm)    ≈ CTA = DTA × Z(cm)   [Z em cm no método clássico; motor usa Z em m × 1000]
 *   AFD (mm)    ≈ CRA = CAD × p
 */

import { roundTo } from "@/utils/math";
import { calculateKs } from "@/modules/assignment/services/parcel-motor-adapter";
import {
  calculateADT,
  calculateAFD,
} from "./pivot-engine";
import {
  calculateADTFromLayers,
  type SoilProfileLayer,
} from "@/modules/soil/services";

export const DTA_FORMULA_VOLUMETRIC = "DTA = (CC − PMP) × 10 mm/cm";
export const CAD_FORMULA = "CAD = (CC − PMP) × Z × 1000 mm";
export const AFD_FORMULA = "AFD = CAD × p";
export const KS_FAO56_DR_FORMULA = "Ks = (CAD − Dr) / (CAD − AFD) quando Dr > AFD";

export interface SoilReservoirLayerSummary {
  label: string;
  depthStartCm: number;
  depthEndCm: number;
  dtaMmPerCm: number;
  cadMm: number;
}

export interface SoilReservoirSummary {
  dtaMmPerCm: number;
  cadMm: number;
  afdMm: number;
  pFactor: number;
  rootDepthM: number;
  rootDepthCm: number;
  safetyMm: number;
  layers: SoilReservoirLayerSummary[];
  usesLayers: boolean;
}

/** DTA em mm/cm a partir de teores volumétricos (cm³/cm³). */
export function dtaFromVolumetric(fieldCapacity: number, wiltingPoint: number): number {
  return roundTo(Math.max(fieldCapacity - wiltingPoint, 0) * 10, 4);
}

/** DTA em mm/cm com CC/PMP em % em peso e densidade aparente (g/cm³). */
export function dtaFromGravimetricPercent(
  ccPercent: number,
  pmpPercent: number,
  bulkDensity: number,
): number {
  const diff = (ccPercent - pmpPercent) / 100;
  return roundTo(Math.max(diff * bulkDensity * 10, 0), 4);
}

/** Ks FAO-56 eq. 84 com Dr em mm (depleção no início do dia). */
export function ksFromDrMm(cadMm: number, afdMm: number, drMm: number): number {
  if (cadMm <= 0) return 1;
  const p = afdMm > 0 && cadMm > 0 ? afdMm / cadMm : 0.5;
  const depletionFraction = Math.min(Math.max(drMm / cadMm, 0), 1);
  return roundTo(calculateKs(depletionFraction, p, "linear", null), 3);
}

export function summarizeSoilReservoir(input: {
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveDepthM: number;
  rootDepthM: number;
  pFactor: number;
  layers?: SoilProfileLayer[];
}): SoilReservoirSummary {
  const rootDepthM = Math.max(input.rootDepthM, 0);
  const pFactor = Math.min(Math.max(input.pFactor, 0), 1);
  const usesLayers = input.layers != null && input.layers.length > 0;

  let cadMm: number;
  let layerSummaries: SoilReservoirLayerSummary[] = [];

  if (usesLayers && input.layers) {
    const clippedLayers = input.layers;
    cadMm = calculateADTFromLayers(clippedLayers, rootDepthM);
    for (const layer of clippedLayers) {
      if (layer.depth_end <= layer.depth_start) continue;
      if (layer.depth_start >= rootDepthM * 100) continue;
      const endCm = Math.min(layer.depth_end, rootDepthM * 100);
      const thickCm = endCm - layer.depth_start;
      const dta = dtaFromVolumetric(layer.field_capacity, layer.wilting_point);
      layerSummaries.push({
        label: `${layer.depth_start}–${endCm} cm`,
        depthStartCm: layer.depth_start,
        depthEndCm: endCm,
        dtaMmPerCm: dta,
        cadMm: roundTo(dta * thickCm, 2),
      });
    }
  } else {
    cadMm = calculateADT(
      input.fieldCapacity,
      input.wiltingPoint,
      rootDepthM,
      input.effectiveDepthM,
    );
  }

  const afdMm = calculateAFD(cadMm, pFactor);
  const dtaMmPerCm = usesLayers && layerSummaries.length > 0
    ? roundTo(cadMm / (rootDepthM * 100), 4)
    : dtaFromVolumetric(input.fieldCapacity, input.wiltingPoint);

  return {
    dtaMmPerCm,
    cadMm,
    afdMm,
    pFactor,
    rootDepthM: roundTo(rootDepthM, 3),
    rootDepthCm: roundTo(rootDepthM * 100, 1),
    safetyMm: roundTo(Math.max(cadMm - afdMm, 0), 2),
    layers: layerSummaries,
    usesLayers,
  };
}
