/**
 * Fator de disponibilidade (FD / p) — parâmetro de MANEJO, não é Ks.
 *
 * Modo automático (FAO-56):
 *   p_ajustado = p_tabela + 0,04 × (5 − ETc)
 *   limitado a 0,10 … 0,80
 *
 * ETc usada no ajuste é a ETc potencial do dia (evita circularidade com Ks).
 */

import { missingValue, traced, type TraceableValue } from "./trace";

export const FD_AUTO_FORMULA = "p_ajustado = p_tabela + 0,04 × (5 − ETc_pot)";
export const FD_LIMITS = { min: 0.1, max: 0.8 } as const;

export type FdMode = "fixed" | "auto";

export interface FdAdjustment {
  mode: FdMode;
  pOriginal: TraceableValue;
  pAdjusted: TraceableValue;
  etcUsedMm: TraceableValue;
}

export function calculateAdjustedFd(input: {
  mode: FdMode;
  pTable: number | null;
  etcPotentialMm: number | null;
}): FdAdjustment {
  const pOriginal = input.pTable == null || !Number.isFinite(input.pTable) || input.pTable <= 0 || input.pTable >= 1
    ? missingValue(["FD/p de tabela"], "adimensional", "p de tabela (cultura/fase)", "cultura")
    : traced(input.pTable, "adimensional", "p de tabela (FAO-56 / cadastro)", { p_tabela: input.pTable }, "cultura/fase");

  if (input.mode === "fixed") {
    return {
      mode: "fixed",
      pOriginal,
      pAdjusted: pOriginal,
      etcUsedMm: traced(0, "mm", "FD fixo — ETc não entra no ajuste", { modo: "fixed" }, "manejo"),
    };
  }

  const etcUsed = input.etcPotentialMm == null || !Number.isFinite(input.etcPotentialMm)
    ? missingValue(["ETc potencial"], "mm", FD_AUTO_FORMULA, "clima + cultura")
    : traced(input.etcPotentialMm, "mm", "ETc potencial usada no ajuste de p", { ETc_pot: input.etcPotentialMm }, "clima + cultura");

  if (pOriginal.value == null || etcUsed.value == null) {
    return {
      mode: "auto",
      pOriginal,
      pAdjusted: missingValue([...pOriginal.missing, ...etcUsed.missing], "adimensional", FD_AUTO_FORMULA, "manejo"),
      etcUsedMm: etcUsed,
    };
  }

  const raw = pOriginal.value + 0.04 * (5 - etcUsed.value);
  const adjusted = Math.min(Math.max(raw, FD_LIMITS.min), FD_LIMITS.max);
  return {
    mode: "auto",
    pOriginal,
    pAdjusted: traced(adjusted, "adimensional", FD_AUTO_FORMULA, {
      p_tabela: pOriginal.value,
      ETc_pot: etcUsed.value,
      p_bruto: raw,
      p_min: FD_LIMITS.min,
      p_max: FD_LIMITS.max,
    }, "FAO-56"),
    etcUsedMm: etcUsed,
  };
}
