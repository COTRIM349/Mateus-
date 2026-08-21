/**
 * Coeficientes do manejo (Etapa E).
 *
 * ETc potencial = ETo × Kc × KL
 * ETc ajustada  = ETc potencial × Ks     ← entra no balanço
 *
 * Ks: FAO-56 eq. 84 a partir da depleção no início do dia (Dr vs AFD).
 *     ks_function=fao33 NÃO entra na lâmina — Ky é risco produtivo.
 * KL: default 1 em pivô central com molhamento pleno.
 * Ky: (1 − Ya/Ym) ≈ Ky × (1 − ETa/ETc). Não define lâmina diária.
 */

import { roundTo, clamp } from "@/utils/math";
import {
  calculateKs,
  type KsFunctionName,
} from "@/modules/assignment/services/parcel-motor-adapter";

export const DEFAULT_CENTER_PIVOT_KL = 1;

export const KS_FAO56_FORMULA =
  "Ks = 1 se Dr ≤ AFD; senão Ks = (ADT − Dr) / ((1 − p) × ADT) (FAO-56 eq. 84)";

export const ETC_FORMULA = "ETc = ETo × Kc × KL × Ks";

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
  return roundTo(calculateKs(input.depletionFraction, input.p, fn, null), 3);
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
  return `${ETC_FORMULA} = ${et0} × ${kc} × ${kl} × ${ks}`;
}
