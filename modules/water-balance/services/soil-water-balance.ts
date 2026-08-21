/**
 * Núcleo do balanço hídrico no solo (Etapa F).
 *
 * ARM(t) = ARM(t−1) + Pe + I_ef − ETc    com 0 ≤ ARM ≤ CAD
 *
 * Unidades (não misturar):
 *   CC, PMP     cm³/cm³ (volumétrico)
 *   CAD, AFD, ARM, Pe, I, ETc, déficit, umidade de segurança   mm
 *   % da CC     100 × θ / θCC  (volumétrico, não % da CAD)
 *
 * Pe: USDA-SCS (mesma curva já usada no legado), depois limitada pelo
 * espaço até a CAD. Irrigação entra como lâmina bruta × eficiência.
 *
 * Umidade de segurança (mm) = CAD − AFD = ARM no limite da AFD.
 * Relaciona p, estádio (via AFD) e profundidade (via CAD).
 */

import { roundTo, clamp } from "@/utils/math";
import { calculateEffectivePrecipitation } from "@/modules/weather/services";
import {
  clipLayersToRootDepth,
  type SoilProfileLayer,
} from "@/modules/soil/services";

export const BALANCE_UNITS = {
  fieldCapacity: "cm³/cm³",
  wiltingPoint: "cm³/cm³",
  cad: "mm",
  afd: "mm",
  arm: "mm",
  deficit: "mm",
  rain: "mm",
  irrigation: "mm",
  etc: "mm",
  safetyMoisture: "mm",
  moisturePctCc: "% da CC (volumétrico)",
} as const;

export const ARM_FORMULA = "ARM = ARM₀ + Pe + I_ef − ETc  (0 ≤ ARM ≤ CAD)";
export const PE_METHOD = "USDA-SCS limitada pelo espaço até a CAD";

export function safetyMoistureMm(cad: number, afd: number): number {
  return roundTo(Math.max(cad - afd, 0), 2);
}

/**
 * θ atual = θPMP + (ARM/CAD)×(θCC−θPMP); %CC = 100×θ/θCC.
 * Não usa % da CAD nem umidade gravimétrica.
 */
export function moisturePercentOfFieldCapacity(
  armMm: number,
  cadMm: number,
  thetaCc: number,
  thetaPmp: number,
): number {
  if (cadMm <= 0 || thetaCc <= 0) return 0;
  const frac = clamp(armMm / cadMm, 0, 1);
  const theta = thetaPmp + frac * (thetaCc - thetaPmp);
  return roundTo(clamp((theta / thetaCc) * 100, 0, 100), 1);
}

/** % da CC no limite de segurança (ARM = CAD − AFD). */
export function safetyPercentOfFieldCapacity(
  thetaCc: number,
  thetaPmp: number,
  depletionFactor: number,
): number {
  if (thetaCc <= 0) return 0;
  const p = clamp(depletionFactor, 0, 1);
  const theta = thetaPmp + (1 - p) * (thetaCc - thetaPmp);
  return roundTo(clamp((theta / thetaCc) * 100, 0, 100), 1);
}

/** Preserva a fração ARM/CAD quando a raiz (e a CAD) cresce ou recua. */
export function scaleArmToNewCad(
  previousArm: number,
  previousCad: number,
  newCad: number,
): number {
  if (newCad <= 0) return 0;
  if (previousCad <= 0) return newCad;
  return roundTo(clamp(previousArm * (newCad / previousCad), 0, newCad), 2);
}

export function usdaScsEffectiveRain(precipitationMm: number): number {
  return calculateEffectivePrecipitation(Math.max(precipitationMm, 0));
}

/** % da CC persistida; linhas antigas caem em ARM/CAD (não misturar no rótulo). */
export function moisturePctCcForDisplay(
  moisturePctCc: number | null | undefined,
  armMm: number,
  cadMm: number,
): number {
  if (moisturePctCc != null && Number.isFinite(moisturePctCc)) return moisturePctCc;
  if (cadMm <= 0) return 0;
  return roundTo(clamp((armMm / cadMm) * 100, 0, 100), 1);
}

export function safetyPctCcForDisplay(
  safetyPctCc: number | null | undefined,
  cadMm: number,
  afdMm: number,
): number {
  if (safetyPctCc != null && Number.isFinite(safetyPctCc)) return safetyPctCc;
  if (cadMm <= 0) return 0;
  return roundTo(clamp(((cadMm - afdMm) / cadMm) * 100, 0, 100), 1);
}

/** PMP como % da CC (θPMP / θCC). Sem CC persistida, o gráfico não inventa 0% da CAD. */
export function pmpPctCcForDisplay(
  fieldCapacity: number | null | undefined,
  wiltingPoint: number | null | undefined,
): number {
  if (fieldCapacity == null || fieldCapacity <= 0) return 0;
  return roundTo(clamp(((wiltingPoint ?? 0) / fieldCapacity) * 100, 0, 100), 1);
}

export interface DailySoilBalanceInput {
  armStart: number;
  cad: number;
  precipitation: number;
  effectiveIrrigation: number;
  etc: number;
}

export interface DailySoilBalanceResult {
  arm: number;
  pe: number;
  peScs: number;
  surplus: number;
  deficit: number;
  peFormula: string;
  balanceFormula: string;
}

/**
 * Passo diário: Pe SCS entra com a irrigação efetiva; excedente acima da CAD
 * é drenagem (atribuída primeiro à chuva). ETc sai depois do preenchimento.
 */
export function applyDailySoilBalance(input: DailySoilBalanceInput): DailySoilBalanceResult {
  const cad = Math.max(input.cad, 0);
  const peScs = usdaScsEffectiveRain(input.precipitation);
  const iEf = Math.max(input.effectiveIrrigation, 0);
  const etc = Math.max(input.etc, 0);
  const arm0 = clamp(input.armStart, 0, cad > 0 ? cad : input.armStart);

  const preCap = arm0 + peScs + iEf - etc;
  const surplus = cad > 0 ? roundTo(Math.max(preCap - cad, 0), 2) : 0;
  const arm = roundTo(cad > 0 ? clamp(preCap, 0, cad) : Math.max(preCap, 0), 2);
  const pe = roundTo(Math.max(peScs - Math.min(surplus, peScs), 0), 2);
  const deficit = cad > 0 ? roundTo(Math.max(cad - arm, 0), 2) : 0;

  return {
    arm,
    pe,
    peScs,
    surplus,
    deficit,
    peFormula: `Pe = min(USDA-SCS(${roundTo(input.precipitation, 2)} mm) = ${peScs} mm; espaço na CAD)`,
    balanceFormula: `${ARM_FORMULA} → ${arm0} + ${peScs} + ${iEf} − ${etc} = ${roundTo(preCap, 2)} → ARM ${arm} mm`,
  };
}

/** CC e PMP volumétricos médios no intervalo radicular Z. */
export function profileCcPmp(
  homogeneous: { field_capacity: number; wilting_point: number },
  layers: SoilProfileLayer[] | undefined,
  rootDepthMeters: number,
): { fieldCapacity: number; wiltingPoint: number } {
  if (layers && layers.length > 0) {
    const clipped = clipLayersToRootDepth(layers, rootDepthMeters);
    let numCc = 0;
    let numPmp = 0;
    let thick = 0;
    for (const layer of clipped) {
      const t = layer.depth_end - layer.depth_start;
      numCc += layer.field_capacity * t;
      numPmp += layer.wilting_point * t;
      thick += t;
    }
    if (thick > 0) {
      return {
        fieldCapacity: roundTo(numCc / thick, 4),
        wiltingPoint: roundTo(numPmp / thick, 4),
      };
    }
  }
  return {
    fieldCapacity: homogeneous.field_capacity,
    wiltingPoint: homogeneous.wilting_point,
  };
}
