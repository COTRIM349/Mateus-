export interface TurcEtoInput {
  temperatureMeanC: number | null;
  relativeHumidityMeanPct: number | null;
  solarRadiationMjM2Day: number | null;
}

export interface TurcEtoResult {
  etoMmDay: number | null;
  method: "turc_1961";
  formulaVersion: "turc-1961-rh-corrected-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  humidityCorrectionFactor: number | null;
  missingFields: string[];
  warnings: string[];
}

/** Turc (1961), com Rs em MJ/m²/dia e correção para UR < 50%. */
export function calculateReferenceEtoTurc(input: TurcEtoInput): TurcEtoResult {
  const missingFields: string[] = [];
  const temperature = input.temperatureMeanC;
  const humidity = input.relativeHumidityMeanPct;
  const radiation = input.solarRadiationMjM2Day;

  if (temperature === null || !Number.isFinite(temperature)) missingFields.push("temperatureMeanC");
  if (humidity === null || !Number.isFinite(humidity)) missingFields.push("relativeHumidityMeanPct");
  if (radiation === null || !Number.isFinite(radiation)) missingFields.push("solarRadiationMjM2Day");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "turc_1961",
      formulaVersion: "turc-1961-rh-corrected-v1",
      qualityStatus: "missing",
      humidityCorrectionFactor: null,
      missingFields,
      warnings: ["Turc exige temperatura, umidade relativa e radiação solar diária."],
    };
  }

  if ((humidity as number) < 0 || (humidity as number) > 100
    || (radiation as number) < 0 || (temperature as number) <= -10) {
    return {
      etoMmDay: null,
      method: "turc_1961",
      formulaVersion: "turc-1961-rh-corrected-v1",
      qualityStatus: "invalid",
      humidityCorrectionFactor: null,
      missingFields: [],
      warnings: ["Entrada fora do domínio físico da equação de Turc."],
    };
  }

  const humidityCorrectionFactor = (humidity as number) >= 50
    ? 1
    : 1 + (50 - (humidity as number)) / 70;
  const etoRaw = 0.013
    * ((temperature as number) / ((temperature as number) + 15))
    * (23.8856 * (radiation as number) + 50)
    * humidityCorrectionFactor;

  return {
    etoMmDay: Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null,
    method: "turc_1961",
    formulaVersion: "turc-1961-rh-corrected-v1",
    qualityStatus: Number.isFinite(etoRaw) ? "estimated" : "invalid",
    humidityCorrectionFactor,
    missingFields: [],
    warnings: ["Método empírico desenvolvido para condições úmidas; exige validação local no Oeste da Bahia."],
  };
}
