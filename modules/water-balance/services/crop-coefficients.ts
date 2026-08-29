/**
 * Coeficientes do manejo (Etapa E).
 *
 * ETc potencial = Kc × ETo (× KL se molhamento parcial)
 * ETc ajustada  = Ks × Kc × ETo     ← entra no balanço
 *
 * Ks: FAO-56 eq. 84 — Ks = 1 se Dr ≤ AFD; senão Ks = (CAD − Dr) / (CAD − AFD).
 *     ks_function=fao33 NÃO entra na lâmina — Ky é risco produtivo.
 * KL: default 1 em pivô central com molhamento pleno.
 * Ky: (1 − Ya/Ym) ≈ Ky × (1 − ETa/ETc). Não define lâmina diária.
 */

import { roundTo, clamp } from "@/utils/math";
import { type KsFunctionName } from "@/modules/assignment/services/parcel-motor-adapter";

export const DEFAULT_CENTER_PIVOT_KL = 1;

/** FAO-56 eq. 84 em milímetros operacionais (CAD = TAW, AFD = RAW, Dr = depleção). */
export const KS_FAO56_NO_STRESS = "Ks = 1  (Dr ≤ AFD)";
export const KS_FAO56_STRESS = "Ks = (CAD − Dr) / (CAD − AFD)";
export const KS_FAO56_FORMULA = `${KS_FAO56_NO_STRESS}; senão ${KS_FAO56_STRESS} (FAO-56 eq. 84)`;

export const ETC_POTENTIAL_FORMULA = "ETc_potencial = Kc × ETo";
export const ETC_FORMULA = "ETc_ajustada = Ks × Kc × ETo";

export interface Fao56KsResult {
  ks: number;
  stressed: boolean;
  formula: string;
  cadMm: number;
  afdMm: number;
  drMm: number;
}

/**
 * Coeficiente de estresse hídrico FAO-56 a partir do reservatório do dia.
 * Ks = 1 enquanto Dr ≤ AFD. Depois: Ks = (CAD − Dr) / (CAD − AFD), limitado a [0, 1].
 * Equivale a (TAW − Dr) / ((1 − p) × TAW). Não usar (CAD − AFD) / (CAD − Dr).
 */
export function calculateFao56Ks(input: {
  cadMm: number;
  afdMm: number;
  drMm: number;
}): Fao56KsResult {
  const cadMm = Number(input.cadMm);
  const afdMm = Number(input.afdMm);
  const rawDr = Number(input.drMm);
  const invalid =
    !Number.isFinite(cadMm) || cadMm <= 0 ||
    !Number.isFinite(afdMm) || afdMm < 0 ||
    !Number.isFinite(rawDr);
  if (invalid || afdMm >= cadMm) {
    return {
      ks: 1,
      stressed: false,
      formula: KS_FAO56_NO_STRESS,
      cadMm: Number.isFinite(cadMm) ? cadMm : 0,
      afdMm: Number.isFinite(afdMm) ? afdMm : 0,
      drMm: Number.isFinite(rawDr) ? rawDr : 0,
    };
  }

  const drMm = Math.min(Math.max(rawDr, 0), cadMm);
  if (drMm <= afdMm) {
    return { ks: 1, stressed: false, formula: KS_FAO56_NO_STRESS, cadMm, afdMm, drMm };
  }

  const ks = roundTo(Math.min(Math.max((cadMm - drMm) / (cadMm - afdMm), 0), 1), 3);
  return {
    ks,
    stressed: ks < 1,
    formula: `${KS_FAO56_STRESS} = (${roundTo(cadMm, 2)} − ${roundTo(drMm, 2)}) / (${roundTo(cadMm, 2)} − ${roundTo(afdMm, 2)})`,
    cadMm,
    afdMm,
    drMm,
  };
}

export function interpretFao56Ks(ks: number | null | undefined): string {
  if (ks == null || !Number.isFinite(ks)) return "Dado ausente: Ks";
  if (ks >= 0.999) {
    return "Ks = 1 — água facilmente disponível; não há limitação hídrica na transpiração.";
  }
  return `Ks = ${ks.toFixed(2)} — Dr ultrapassou a AFD; a ETc ajustada é reduzida. Ks menor não significa que a cultura precise de menos água.`;
}

const KS_FNS: KsFunctionName[] = ["linear", "fao33", "exponential", "sigmoid", "none"];

export function resolveManejoKl(input: {
  parcelOverride?: number | null;
  phaseKl?: number | null;
  cultureKl?: number | null;
}): number {
  const pick = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(v) || v <= 0) return null;
    return clamp(v, 0, 1);
  };
  return pick(input.parcelOverride) ?? pick(input.phaseKl) ?? pick(input.cultureKl) ?? DEFAULT_CENTER_PIVOT_KL;
}

export function resolveKsFunctionName(
  parcelOverride?: string | null,
  phaseFn?: string | null,
  cultureFn?: string | null,
): KsFunctionName {
  for (const v of [parcelOverride, phaseFn, cultureFn]) {
    if (v && (KS_FNS as string[]).includes(v)) return v as KsFunctionName;
  }
  return "linear";
}

/**
 * Função de Ks usada no ETc do dia. fao33 mistura Ky e não pode definir lâmina.
 */
export function ksFunctionForEtc(fn: KsFunctionName): Exclude<KsFunctionName, "fao33"> {
  return fn === "fao33" ? "linear" : fn;
}

export function computeKsForBalance(input: {
  depletionFraction: number;
  p: number;
  ksFunction?: string | null;
}): number {
  const fn = ksFunctionForEtc(resolveKsFunctionName(null, null, input.ksFunction));
  if (fn === "none") return 1;
  return calculateFao56Ks({
    cadMm: 1,
    afdMm: input.p,
    drMm: input.depletionFraction,
  }).ks;
}

export function resolvePhaseKy(
  phaseKy?: number | null,
  cultureKy?: number | null,
): number | null {
  if (phaseKy != null && Number.isFinite(phaseKy) && phaseKy >= 0) return phaseKy;
  if (cultureKy != null && Number.isFinite(cultureKy) && cultureKy >= 0) return cultureKy;
  return null;
}

/** FAO-33 diário: Ky × (1 − ETa/ETc) = Ky × (1 − Ks). Não entra na lâmina. */
export function yieldRiskFraction(ky: number | null, ks: number): number | null {
  if (ky == null || !Number.isFinite(ky)) return null;
  return roundTo(Math.max(0, ky * (1 - ks)), 3);
}

export function formatEtcFormula(et0: number, kc: number, kl: number, ks: number): string {
  if (kl !== 1) {
    return `ETc_ajustada = Ks × Kc × ETo × KL = ${ks} × ${kc} × ${et0} × ${kl}`;
  }
  return `${ETC_FORMULA} = ${ks} × ${kc} × ${et0}`;
}
