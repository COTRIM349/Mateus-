import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import type { ReferenceEtoInput, ReferenceEtoResult } from "./referenceEtoTypes";

export interface AsceEwriEtoResult extends Omit<ReferenceEtoResult, "method"> {
  method: "asce_ewri_standardized_etos";
  formulaVersion: "asce-ewri-2005-etos-daily-v1";
  referenceSurface: "short_grass";
}

/**
 * ASCE-EWRI (2005), superfície curta ETos, passo diário.
 *
 * Para ETos diária, Cn=900 e Cd=0,34. Esses coeficientes e a superfície
 * curta coincidem com a equação diária FAO-56, por isso reutilizamos a
 * preparação auditada do motor FAO-56 e alteramos apenas a proveniência.
 */
export function calculateReferenceEtoAsceEwri(
  input: ReferenceEtoInput,
): AsceEwriEtoResult {
  const result = calculateReferenceEtoFao56(input);

  return {
    ...result,
    method: "asce_ewri_standardized_etos",
    formulaVersion: "asce-ewri-2005-etos-daily-v1",
    referenceSurface: "short_grass",
    warnings: [
      ...result.warnings,
      "ASCE-EWRI ETos diária usa Cn=900 e Cd=0,34; com a mesma preparação dos dados, coincide com FAO-56 ETo diária.",
    ],
  };
}
