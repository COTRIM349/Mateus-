/**
 * Ks FAO-56 (eq. 84) a partir de Dr, CTA e CRA.
 *
 * Dr ≤ CRA  →  Ks = 1
 * Dr > CRA  →  Ks = (CTA − Dr) / (CTA − CRA)
 * 0 ≤ Ks ≤ 1
 *
 * FD (p) NÃO é Ks. Ks descreve restrição atual da transpiração.
 */

import { missingValue, traced, type TraceableValue } from "./trace";

export const KS_FORMULA_NO_STRESS = "Ks = 1  (Dr ≤ CRA)";
export const KS_FORMULA_STRESS = "Ks = (CTA − Dr) / (CTA − CRA)";

export function calculateKsFromDr(input: {
  ctaMm: number | null;
  craMm: number | null;
  drMm: number | null;
}): TraceableValue {
  const missing: string[] = [];
  if (input.ctaMm == null || !Number.isFinite(input.ctaMm) || input.ctaMm <= 0) missing.push("CTA");
  if (input.craMm == null || !Number.isFinite(input.craMm)) missing.push("CRA");
  if (input.drMm == null || !Number.isFinite(input.drMm)) missing.push("Dr");
  if (missing.length > 0) {
    return missingValue(missing, "adimensional", KS_FORMULA_STRESS, "balanço");
  }

  const cta = input.ctaMm as number;
  const cra = input.craMm as number;
  const dr = Math.min(Math.max(input.drMm as number, 0), cta);

  if (cra >= cta) {
    return missingValue(["CRA < CTA"], "adimensional", KS_FORMULA_STRESS, "balanço");
  }

  if (dr <= cra) {
    return traced(1, "adimensional", KS_FORMULA_NO_STRESS, { CTA: cta, CRA: cra, Dr: dr }, "balanço");
  }

  const ks = (cta - dr) / (cta - cra);
  const clamped = Math.min(Math.max(ks, 0), 1);
  return traced(clamped, "adimensional", KS_FORMULA_STRESS, { CTA: cta, CRA: cra, Dr: dr }, "balanço");
}

export const KS_INTERPRETATION_FULL =
  "Ks = 1,00 — sem restrição hídrica segundo o balanço. A transpiração não está limitada pela água do solo.";

export const KS_INTERPRETATION_STRESS =
  "Ks < 1 — existe redução potencial da transpiração causada pela disponibilidade de água no solo. A cultura mantém a demanda potencial; o déficit limita a capacidade de transpirar. Ks menor NÃO significa que a planta precise de menos água.";

export function interpretKs(ks: number | null): string {
  if (ks == null || !Number.isFinite(ks)) return "Dado ausente: Ks";
  if (ks >= 0.999) return KS_INTERPRETATION_FULL;
  return `${KS_INTERPRETATION_STRESS} Ks atual = ${ks.toFixed(2)}.`;
}
