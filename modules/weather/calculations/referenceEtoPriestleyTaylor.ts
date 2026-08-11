import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import type { EstimatedField, ReferenceEtoInput } from "./referenceEtoTypes";

export interface PriestleyTaylorEtoResult {
  etoMmDay: number | null;
  method: "priestley_taylor_1972";
  formulaVersion: "pt-1972-alpha-1.26-v1";
  alpha: number;
  qualityStatus: "estimated" | "missing";
  netRadiationMjM2Day: number | null;
  saturationSlopeKpaC: number | null;
  psychrometricConstantKpaC: number | null;
  missingFields: string[];
  estimatedFields: EstimatedField[];
  warnings: string[];
}

/** Priestley-Taylor diária, com G=0 e alpha clássico igual a 1,26. */
export function calculateReferenceEtoPriestleyTaylor(
  input: ReferenceEtoInput,
  alpha = 1.26,
): PriestleyTaylorEtoResult {
  const base = calculateReferenceEtoFao56(input);
  const rn = base.intermediateValues.netRadiationMjM2Day;
  const delta = base.intermediateValues.saturationSlopeKpaC;
  const gamma = base.intermediateValues.psychrometricConstantKpaC;
  const missingFields: string[] = [];

  if (rn === null) missingFields.push("netRadiationMjM2Day");
  if (delta === null) missingFields.push("saturationSlopeKpaC");
  if (gamma === null) missingFields.push("psychrometricConstantKpaC");
  if (!Number.isFinite(alpha) || alpha <= 0) missingFields.push("alpha");

  const etoRaw = missingFields.length === 0
    ? alpha * 0.408 * (delta as number) / ((delta as number) + (gamma as number)) * Math.max((rn as number), 0)
    : null;
  const etoMmDay = etoRaw !== null && Number.isFinite(etoRaw)
    ? Math.max(etoRaw, 0)
    : null;

  return {
    etoMmDay,
    method: "priestley_taylor_1972",
    formulaVersion: "pt-1972-alpha-1.26-v1",
    alpha,
    qualityStatus: etoMmDay === null ? "missing" : "estimated",
    netRadiationMjM2Day: rn,
    saturationSlopeKpaC: delta,
    psychrometricConstantKpaC: gamma,
    missingFields,
    estimatedFields: base.estimatedFields,
    warnings: [
      ...base.warnings,
      "Alpha=1,26 é o valor clássico de Priestley-Taylor e ainda exige calibração local para uso operacional.",
    ],
  };
}
