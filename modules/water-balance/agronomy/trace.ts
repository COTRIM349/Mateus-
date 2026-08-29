/**
 * Motor agronômico FAO-56 — tipos e rastreio.
 * Nenhum valor é inventado: parâmetro ausente entra em `missing`.
 */

export const ENGINE_VERSION = "fao56-wb-2.0";

/** Unidade da umidade cadastrada (CC/PMP). A fórmula de DTA muda com a unidade. */
export type MoistureUnit = "gravimetric_percent" | "volumetric_percent" | "m3_m3";

export const MOISTURE_UNIT_LABEL: Record<MoistureUnit, string> = {
  gravimetric_percent: "% em peso (gravimétrica)",
  volumetric_percent: "% volumétrica",
  m3_m3: "m³/m³ (cm³/cm³)",
};

export type DataKind = "observed" | "forecast";

export interface TraceableValue {
  value: number | null;
  unit: string;
  formula: string;
  inputs: Record<string, number | string | null>;
  missing: string[];
  source: string;
}

export function missingValue(params: string[], unit: string, formula: string, source: string): TraceableValue {
  return {
    value: null,
    unit,
    formula,
    inputs: {},
    missing: params,
    source,
  };
}

export function traced(
  value: number,
  unit: string,
  formula: string,
  inputs: Record<string, number | string | null>,
  source: string,
): TraceableValue {
  return { value, unit, formula, inputs, missing: [], source };
}

export function formatTraced(v: TraceableValue, digits = 2): string {
  if (v.value == null || v.missing.length > 0) {
    return `Dado ausente: ${v.missing.join(", ") || "parâmetro obrigatório"}`;
  }
  return `${v.value.toFixed(digits)} ${v.unit}`;
}

export function isPresent(v: TraceableValue): v is TraceableValue & { value: number } {
  return v.value != null && v.missing.length === 0 && Number.isFinite(v.value);
}
