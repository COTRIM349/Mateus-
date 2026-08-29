/**
 * Depleção Dr e ARM.
 *
 * ARM = CTA − Dr
 * Na CC: Dr = 0. No PMP: Dr ≈ CTA.
 *
 * Dr_i = Dr_(i−1) − (P − RO) − Ief − CR + ETc_real + DP
 * com 0 ≤ Dr ≤ CTA.
 *
 * Excedente acima da CC vira DP (drenagem/percolação), nunca Dr negativo.
 */

import { traced, type TraceableValue } from "./trace";

export const ARM_FORMULA = "ARM = CTA − Dr";
export const DR_FORMULA = "Dr_i = Dr_(i−1) − Pe − Ief − CR + ETc_real + DP   (0 ≤ Dr ≤ CTA)";

export interface DepletionStepInput {
  drStartMm: number;
  ctaMm: number;
  etcRealMm: number;
  rainGrossMm: number;
  effectiveRainMm: number;
  effectiveIrrigationMm: number;
  capillaryRiseMm: number;
}

export interface DepletionStepResult {
  drEndMm: number;
  armMm: number;
  armPct: number;
  drPct: number;
  deepPercolationMm: number;
  runoffMm: number;
  formula: string;
}

export function applyDepletionStep(input: DepletionStepInput): DepletionStepResult {
  const cta = Math.max(input.ctaMm, 0);
  const dr0 = Math.min(Math.max(input.drStartMm, 0), cta > 0 ? cta : input.drStartMm);
  const pe = Math.max(input.effectiveRainMm, 0);
  const iEf = Math.max(input.effectiveIrrigationMm, 0);
  const cr = Math.max(input.capillaryRiseMm, 0);
  const etc = Math.max(input.etcRealMm, 0);
  const rain = Math.max(input.rainGrossMm, 0);
  const runoff = Math.max(rain - pe, 0);

  const raw = dr0 - pe - iEf - cr + etc;
  let drEnd: number;
  let dp = 0;
  if (cta <= 0) {
    drEnd = Math.max(raw, 0);
  } else if (raw < 0) {
    dp = -raw;
    drEnd = 0;
  } else if (raw > cta) {
    drEnd = cta;
  } else {
    drEnd = raw;
  }

  const arm = Math.max(cta - drEnd, 0);
  const armPct = cta > 0 ? (arm / cta) * 100 : 0;
  const drPct = cta > 0 ? (drEnd / cta) * 100 : 0;

  return {
    drEndMm: drEnd,
    armMm: arm,
    armPct,
    drPct,
    deepPercolationMm: dp,
    runoffMm: runoff,
    formula: `${DR_FORMULA} → ${dr0.toFixed(4)} − ${pe.toFixed(4)} − ${iEf.toFixed(4)} − ${cr.toFixed(4)} + ${etc.toFixed(4)} = ${raw.toFixed(4)} → Dr ${drEnd.toFixed(4)} mm, DP ${dp.toFixed(4)} mm`,
  };
}

export function armFromDr(ctaMm: number, drMm: number): TraceableValue {
  if (ctaMm <= 0) {
    return {
      value: null,
      unit: "mm",
      formula: ARM_FORMULA,
      inputs: { CTA: ctaMm, Dr: drMm },
      missing: ["CTA"],
      source: "balanço",
    };
  }
  const dr = Math.min(Math.max(drMm, 0), ctaMm);
  return traced(ctaMm - dr, "mm", ARM_FORMULA, { CTA: ctaMm, Dr: dr }, "balanço");
}

export function initialDrFromMoisture(input: {
  ctaMm: number;
  atFieldCapacity: boolean | null;
  moisturePct: number | null;
}): { drMm: number; source: string; missing: string[] } {
  if (input.ctaMm <= 0) return { drMm: 0, source: "inválido", missing: ["CTA"] };
  if (input.atFieldCapacity === true || input.atFieldCapacity == null) {
    return {
      drMm: 0,
      source: "parcela: umidade inicial = capacidade de campo",
      missing: [],
    };
  }
  if (input.moisturePct == null || !Number.isFinite(input.moisturePct)) {
    return {
      drMm: 0,
      source: "Dado ausente",
      missing: ["umidade inicial do solo (%)"],
    };
  }
  const frac = Math.min(Math.max(input.moisturePct / 100, 0), 1);
  return {
    drMm: input.ctaMm * (1 - frac),
    source: `parcela: umidade inicial ${input.moisturePct}% da CTA`,
    missing: [],
  };
}
