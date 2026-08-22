/**
 * Núcleo diário do balanço hídrico no solo.
 *
 * ARM(t) = ARM(t−1) + P_arm + I_ef − ETc, com 0 ≤ ARM ≤ CAD.
 *
 * Regras importantes:
 * - CC/PMP são volumétricos (cm³/cm³); densidade não entra na CAD volumétrica.
 * - ausência de chuva/clima não é transformada em zero aqui; a camada de
 *   orquestração deve bloquear o dia antes de chamar este passo.
 * - para escala diária NÃO aplicamos a equação mensal USDA-SCS. A chuva do dia
 *   entra como água disponível e é limitada fisicamente pelo espaço na CAD;
 *   o excedente é drenagem profunda/escoamento não armazenado.
 */

import { roundTo, clamp } from "@/utils/math";
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

export const ARM_FORMULA = "ARM = ARM₀ + P_arm + I_ef − ETc  (0 ≤ ARM ≤ CAD)";
export const PE_METHOD = "Balanço diário: chuva armazenada limitada pelo espaço na CAD; excesso = drenagem/escoamento";

export type InitialMoistureUnit =
  | "field_capacity_fraction"
  | "weight_pct"
  | "volume_pct";

export function safetyMoistureMm(cad: number, afd: number): number {
  return roundTo(Math.max(cad - afd, 0), 2);
}

/**
 * θ atual = θPMP + (ARM/CAD)×(θCC−θPMP); %CC = 100×θ/θCC.
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

/** Preserva a fração ARM/CAD quando a profundidade radicular muda. */
export function scaleArmToNewCad(
  previousArm: number,
  previousCad: number,
  newCad: number,
): number {
  if (newCad <= 0) return 0;
  if (previousCad <= 0) return newCad;
  return roundTo(clamp(previousArm * (newCad / previousCad), 0, newCad), 2);
}

/**
 * Converte a condição inicial cadastrada para ARM (mm).
 * Retorna null quando o cadastro não permite inicialização confiável.
 */
export function initialArmFromMoisture(input: {
  cadMm: number;
  thetaCc: number;
  thetaPmp: number;
  bulkDensity: number | null | undefined;
  moisturePct: number | null | undefined;
  unit: InitialMoistureUnit | null | undefined;
  isFieldCapacity: boolean | null | undefined;
}): number | null {
  const { cadMm, thetaCc, thetaPmp } = input;
  if (cadMm <= 0 || thetaCc <= thetaPmp) return null;
  if (input.isFieldCapacity === true) return roundTo(cadMm, 2);
  if (input.moisturePct == null || !Number.isFinite(input.moisturePct)) return null;

  const pct = Math.max(input.moisturePct, 0);
  let theta: number;
  switch (input.unit ?? "field_capacity_fraction") {
    case "volume_pct":
      theta = pct / 100;
      break;
    case "weight_pct": {
      const da = input.bulkDensity;
      if (da == null || !Number.isFinite(da) || da <= 0) return null;
      theta = (pct / 100) * da;
      break;
    }
    case "field_capacity_fraction":
    default:
      theta = thetaCc * (pct / 100);
      break;
  }

  const availableFraction = clamp((theta - thetaPmp) / (thetaCc - thetaPmp), 0, 1);
  return roundTo(cadMm * availableFraction, 2);
}

/**
 * Alias legado mantido apenas para compatibilidade de imports antigos.
 * Não aplica mais a equação mensal USDA-SCS em dados diários.
 */
export function usdaScsEffectiveRain(precipitationMm: number): number {
  return roundTo(Math.max(precipitationMm, 0), 2);
}

/** % da CC persistida; fallback visual para registros antigos. */
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
  /** Chuva efetivamente armazenada no perfil. */
  pe: number;
  /** Campo legado: agora representa a chuva bruta disponível do dia. */
  peScs: number;
  surplus: number;
  deficit: number;
  peFormula: string;
  balanceFormula: string;
}

/**
 * Passo diário físico: chuva e irrigação entram no perfil, ETc sai; tudo que
 * excede a CAD é registrado como excesso. Não há redução empírica mensal da
 * chuva aplicada dia a dia.
 */
export function applyDailySoilBalance(input: DailySoilBalanceInput): DailySoilBalanceResult {
  const cad = Math.max(input.cad, 0);
  const rain = Math.max(input.precipitation, 0);
  const iEf = Math.max(input.effectiveIrrigation, 0);
  const etc = Math.max(input.etc, 0);
  const arm0 = clamp(input.armStart, 0, cad > 0 ? cad : input.armStart);

  const preCap = arm0 + rain + iEf - etc;
  const surplus = cad > 0 ? roundTo(Math.max(preCap - cad, 0), 2) : 0;
  const arm = roundTo(cad > 0 ? clamp(preCap, 0, cad) : Math.max(preCap, 0), 2);
  const rainStored = roundTo(Math.max(rain - Math.min(surplus, rain), 0), 2);
  const deficit = cad > 0 ? roundTo(Math.max(cad - arm, 0), 2) : 0;

  return {
    arm,
    pe: rainStored,
    peScs: roundTo(rain, 2),
    surplus,
    deficit,
    peFormula: `P_arm = P − excesso atribuível à chuva = ${roundTo(rain, 2)} − ${roundTo(Math.min(surplus, rain), 2)} = ${rainStored} mm`,
    balanceFormula: `${ARM_FORMULA} → ${arm0} + ${roundTo(rain, 2)} + ${iEf} − ${etc} = ${roundTo(preCap, 2)} → ARM ${arm} mm; excesso ${surplus} mm`,
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
