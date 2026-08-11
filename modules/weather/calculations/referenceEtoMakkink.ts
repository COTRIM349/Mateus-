import { calculateReferenceEtoFao56 } from "./referenceEtoFao56";
import type { EstimatedField, ReferenceEtoInput } from "./referenceEtoTypes";

export interface MakkinkEtoResult {
  etoMmDay: number | null;
  method: "makkink_1957";
  formulaVersion: "makkink-1957-c0.61-v1";
  qualityStatus: "estimated" | "missing";
  coefficient: 0.61;
  solarRadiationMjM2Day: number | null;
  saturationSlopeKpaC: number | null;
  psychrometricConstantKpaC: number | null;
  missingFields: string[];
  estimatedFields: EstimatedField[];
  warnings: string[];
}

/** Makkink (1957): ETo = 0,61 × 0,408 × Δ/(Δ+γ) × Rs − 0,12. */
export function calculateReferenceEtoMakkink(
  input: ReferenceEtoInput,
): MakkinkEtoResult {
  const base = calculateReferenceEtoFao56(input);
  const rs = input.solarRadiationMjM2Day;
  const delta = base.intermediateValues.saturationSlopeKpaC;
  const gamma = base.intermediateValues.psychrometricConstantKpaC;
  const missingFields: string[] = [];

  if (rs === null || !Number.isFinite(rs) || rs < 0) missingFields.push("solarRadiationMjM2Day");
  if (delta === null) missingFields.push("saturationSlopeKpaC");
  if (gamma === null) missingFields.push("psychrometricConstantKpaC");

  const etoRaw = missingFields.length === 0
    ? 0.61 * 0.408 * (delta as number) / ((delta as number) + (gamma as number)) * (rs as number) - 0.12
    : null;
  const etoMmDay = etoRaw !== null && Number.isFinite(etoRaw)
    ? Math.max(etoRaw, 0)
    : null;

  return {
    etoMmDay,
    method: "makkink_1957",
    formulaVersion: "makkink-1957-c0.61-v1",
    qualityStatus: etoMmDay === null ? "missing" : "estimated",
    coefficient: 0.61,
    solarRadiationMjM2Day: rs,
    saturationSlopeKpaC: delta,
    psychrometricConstantKpaC: gamma,
    missingFields,
    estimatedFields: base.estimatedFields,
    warnings: [
      ...base.warnings,
      "Makkink é um método empírico de radiação e exige validação local contra FAO-56.",
    ],
  };
}
