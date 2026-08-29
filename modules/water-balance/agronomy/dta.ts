/**
 * DTA (mm/cm) conforme a unidade de CC/PMP.
 *
 * % em peso:     DTA = ((CC − PMP) × Da) / 10
 * % volumétrica: DTA = (CC − PMP) / 10
 * m³/m³:         DTA = (CC − PMP) × 10
 *
 * Densidade aparente só entra na forma gravimétrica.
 */

import { missingValue, traced, type MoistureUnit, type TraceableValue } from "./trace";

export const DTA_FORMULA: Record<MoistureUnit, string> = {
  gravimetric_percent: "DTA = ((CC − PMP) × Da) / 10",
  volumetric_percent: "DTA = (CC − PMP) / 10",
  m3_m3: "DTA = (CC − PMP) × 10",
};

export function calculateDtaMmPerCm(input: {
  cc: number | null | undefined;
  pmp: number | null | undefined;
  bulkDensity?: number | null;
  unit: MoistureUnit;
  source?: string;
}): TraceableValue {
  const source = input.source ?? "solo";
  const missing: string[] = [];
  if (input.cc == null || !Number.isFinite(input.cc)) missing.push("CC");
  if (input.pmp == null || !Number.isFinite(input.pmp)) missing.push("PMP");
  if (input.unit === "gravimetric_percent" && (input.bulkDensity == null || input.bulkDensity <= 0)) {
    missing.push("Da (densidade aparente)");
  }
  if (missing.length > 0) {
    return missingValue(missing, "mm/cm", DTA_FORMULA[input.unit], source);
  }

  const cc = input.cc as number;
  const pmp = input.pmp as number;
  if (cc <= pmp) {
    return missingValue(["CC > PMP"], "mm/cm", DTA_FORMULA[input.unit], source);
  }

  let value: number;
  if (input.unit === "gravimetric_percent") {
    value = ((cc - pmp) * (input.bulkDensity as number)) / 10;
  } else if (input.unit === "volumetric_percent") {
    value = (cc - pmp) / 10;
  } else {
    value = (cc - pmp) * 10;
  }

  if (value < 0 || !Number.isFinite(value)) {
    return missingValue(["DTA ≥ 0"], "mm/cm", DTA_FORMULA[input.unit], source);
  }

  return traced(value, "mm/cm", DTA_FORMULA[input.unit], {
    CC: cc,
    PMP: pmp,
    Da: input.unit === "gravimetric_percent" ? input.bulkDensity ?? null : null,
    unidade: input.unit,
  }, source);
}
