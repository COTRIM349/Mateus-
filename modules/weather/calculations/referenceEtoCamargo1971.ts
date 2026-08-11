import { extraterrestrialRadiationDaily } from "./referenceEtoHargreavesSamani";

export interface Camargo1971EtoInput {
  date: string;
  latitude: number;
  temperatureMeanC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  climatologicalAnnualMeanTemperatureC: number | null;
}

export interface Camargo1971EtoResult {
  etoMmDay: number | null;
  method: "camargo_1971";
  formulaVersion: "camargo-1971-k-by-annual-temperature-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  adjustmentK: number | null;
  extraterrestrialRadiationMjM2Day: number | null;
  extraterrestrialRadiationEquivalentMmDay: number | null;
  missingFields: string[];
  warnings: string[];
}

export function camargoAdjustmentK(annualMeanTemperatureC: number): number {
  if (annualMeanTemperatureC <= 23.5) return 0.01;
  if (annualMeanTemperatureC <= 24.5) return 0.0105;
  if (annualMeanTemperatureC <= 25.5) return 0.011;
  if (annualMeanTemperatureC <= 26.5) return 0.0115;
  if (annualMeanTemperatureC <= 27.5) return 0.012;
  return 0.013;
}

/** Camargo (1971): ETo = K × Ra(mm/d) × Tmed. */
export function calculateReferenceEtoCamargo1971(
  input: Camargo1971EtoInput,
): Camargo1971EtoResult {
  const missingFields: string[] = [];
  let temperatureMeanC = input.temperatureMeanC;
  if (temperatureMeanC === null
    && input.temperatureMinC !== null
    && input.temperatureMaxC !== null
    && Number.isFinite(input.temperatureMinC)
    && Number.isFinite(input.temperatureMaxC)) {
    temperatureMeanC = (input.temperatureMinC + input.temperatureMaxC) / 2;
  }
  const annualMean = input.climatologicalAnnualMeanTemperatureC;
  const radiation = extraterrestrialRadiationDaily(input.date, input.latitude);

  if (temperatureMeanC === null || !Number.isFinite(temperatureMeanC)) missingFields.push("temperatureMeanC");
  if (annualMean === null || !Number.isFinite(annualMean)) missingFields.push("climatologicalAnnualMeanTemperatureC");
  if (radiation === null) missingFields.push("dateOrLatitude");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "camargo_1971",
      formulaVersion: "camargo-1971-k-by-annual-temperature-v1",
      qualityStatus: "missing",
      adjustmentK: null,
      extraterrestrialRadiationMjM2Day: radiation,
      extraterrestrialRadiationEquivalentMmDay: radiation === null ? null : radiation * 0.408,
      missingFields,
      warnings: ["Camargo 1971 exige normal anual de temperatura; poucos dias recentes não substituem essa entrada."],
    };
  }

  if ((annualMean as number) <= 0) {
    return {
      etoMmDay: null,
      method: "camargo_1971",
      formulaVersion: "camargo-1971-k-by-annual-temperature-v1",
      qualityStatus: "invalid",
      adjustmentK: null,
      extraterrestrialRadiationMjM2Day: radiation,
      extraterrestrialRadiationEquivalentMmDay: (radiation as number) * 0.408,
      missingFields: [],
      warnings: ["Normal anual incompatível com a parametrização de Camargo 1971."],
    };
  }

  const adjustmentK = camargoAdjustmentK(annualMean as number);
  const radiationMmDay = (radiation as number) * 0.408;
  const etoRaw = adjustmentK * radiationMmDay * (temperatureMeanC as number);

  return {
    etoMmDay: Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null,
    method: "camargo_1971",
    formulaVersion: "camargo-1971-k-by-annual-temperature-v1",
    qualityStatus: Number.isFinite(etoRaw) ? "estimated" : "invalid",
    adjustmentK,
    extraterrestrialRadiationMjM2Day: radiation,
    extraterrestrialRadiationEquivalentMmDay: radiationMmDay,
    missingFields: [],
    warnings: ["Método empírico baseado em Thornthwaite; permanece somente diagnóstico."],
  };
}
