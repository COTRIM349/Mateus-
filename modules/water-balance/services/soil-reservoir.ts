/**
 * Reservatório de solo — DTA / CAD (CTA) / AFD (CRA) e validação de Ks por Dr.
 */

import { roundTo } from "@/utils/math";
import {
  calculateADTFromLayers,
  type SoilProfileLayer,
} from "@/modules/soil/services";
import {
  calculateKsFromDr,
  calculateRootZoneStorage,
  type MoistureUnit,
} from "../agronomy";

export const DTA_FORMULA_VOLUMETRIC = "DTA = (CC − PMP) × 10 mm/cm";
export const CAD_FORMULA = "CAD = (CC − PMP) × Z × 1000 mm";
export const AFD_FORMULA = "AFD = CAD × p";
export const KS_FAO56_DR_FORMULA = "Ks = (CAD − Dr) / (CAD − AFD) quando Dr > AFD";

export interface SoilReservoirLayerSummary {
  label: string;
  depthStartCm: number;
  depthEndCm: number;
  exploredCm: number;
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
  return roundTo(Math.max(((ccPercent - pmpPercent) * bulkDensity) / 10, 0), 4);
}

/** Ks FAO-56 eq. 84 com Dr em mm (depleção no início do dia). */
export function ksFromDrMm(cadMm: number, afdMm: number, drMm: number): number {
  const ks = calculateKsFromDr({ ctaMm: cadMm, craMm: afdMm, drMm });
  return roundTo(ks.value ?? 1, 3);
}

export function summarizeSoilReservoir(input: {
  fieldCapacity: number;
  wiltingPoint: number;
  effectiveDepthM: number;
  rootDepthM: number;
  pFactor: number;
  layers?: SoilProfileLayer[];
  moistureUnit?: MoistureUnit;
  bulkDensity?: number | null;
}): SoilReservoirSummary {
  const unit = input.moistureUnit ?? "m3_m3";
  const zone = calculateRootZoneStorage({
    layers: (input.layers ?? []).map((layer) => ({
      depthStartCm: layer.depth_start,
      depthEndCm: layer.depth_end,
      cc: layer.field_capacity,
      pmp: layer.wilting_point,
      bulkDensity: layer.bulk_density ?? input.bulkDensity,
    })),
    unit,
    zrCm: input.rootDepthM * 100,
    zrMaxCm: input.effectiveDepthM * 100,
    zrMethod: "Zr efetiva no dia",
    fd: input.pFactor,
    homogeneous: {
      cc: input.fieldCapacity,
      pmp: input.wiltingPoint,
      bulkDensity: input.bulkDensity,
      effectiveDepthCm: input.effectiveDepthM * 100,
    },
  });

  const cadMm = zone.cta.value ?? 0;
  const afdMm = zone.cra.value ?? 0;

  return {
    dtaMmPerCm: zone.dtaMean.value ?? 0,
    cadMm: roundTo(cadMm, 2),
    afdMm: roundTo(afdMm, 2),
    pFactor: input.pFactor,
    rootDepthM: roundTo(input.rootDepthM, 3),
    rootDepthCm: roundTo(input.rootDepthM * 100, 1),
    safetyMm: roundTo(Math.max(cadMm - afdMm, 0), 2),
    layers: zone.layers
      .filter((l) => l.exploredCm > 0)
      .map((l) => ({
        label: l.label,
        depthStartCm: l.depthStartCm,
        depthEndCm: l.depthEndCm,
        exploredCm: l.exploredCm,
        dtaMmPerCm: l.dta.value ?? 0,
        cadMm: roundTo(l.cta.value ?? 0, 2),
      })),
    usesLayers: (input.layers?.length ?? 0) > 0,
  };
}

export { calculateADTFromLayers };
