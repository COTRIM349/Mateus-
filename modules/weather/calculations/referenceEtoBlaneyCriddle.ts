import { photoperiodHours } from "./referenceEtoThornthwaiteCamargo";

export interface BlaneyCriddleInput {
  date: string;
  latitude: number;
  temperatureMeanC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
}

export interface BlaneyCriddleResult {
  etoMmDay: number | null;
  method: "fao_24_blaney_criddle";
  formulaVersion: "fao-24-blaney-criddle-basic-daily-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  temperatureMeanC: number | null;
  photoperiodHours: number | null;
  daylightAnnualPercentagePerDay: number | null;
  missingFields: string[];
  warnings: string[];
}

/**
 * Blaney-Criddle básico: ETo = p (0,46 T + 8).
 * p é a porcentagem média diária das horas anuais de luz. A equação foi
 * concebida para médias mensais; o valor por data é somente diagnóstico.
 */
export function calculateReferenceEtoBlaneyCriddle(
  input: BlaneyCriddleInput,
): BlaneyCriddleResult {
  const missingFields: string[] = [];
  let temperatureMeanC = input.temperatureMeanC;
  if (temperatureMeanC === null
    && input.temperatureMinC !== null
    && input.temperatureMaxC !== null
    && Number.isFinite(input.temperatureMinC)
    && Number.isFinite(input.temperatureMaxC)) {
    temperatureMeanC = (input.temperatureMinC + input.temperatureMaxC) / 2;
  }
  const daylight = photoperiodHours(input.date, input.latitude);

  if (temperatureMeanC === null || !Number.isFinite(temperatureMeanC)) {
    missingFields.push("temperatureMeanC");
  }
  if (daylight === null) missingFields.push("dateOrLatitude");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "fao_24_blaney_criddle",
      formulaVersion: "fao-24-blaney-criddle-basic-daily-v1",
      qualityStatus: "missing",
      temperatureMeanC: null,
      photoperiodHours: daylight,
      daylightAnnualPercentagePerDay: null,
      missingFields,
      warnings: ["Blaney-Criddle foi desenvolvido para médias mensais; não substituir FAO-56 em decisão diária."],
    };
  }

  if (input.temperatureMinC !== null
    && input.temperatureMaxC !== null
    && input.temperatureMaxC < input.temperatureMinC) {
    return {
      etoMmDay: null,
      method: "fao_24_blaney_criddle",
      formulaVersion: "fao-24-blaney-criddle-basic-daily-v1",
      qualityStatus: "invalid",
      temperatureMeanC,
      photoperiodHours: daylight,
      daylightAnnualPercentagePerDay: null,
      missingFields: [],
      warnings: ["Temperatura máxima menor que a mínima; ETo não calculada."],
    };
  }

  // A duração média anual do dia é 12 h; 12 × 365 = 4.380 h/ano.
  const daylightAnnualPercentagePerDay = (daylight as number) / (12 * 365) * 100;
  const etoRaw = daylightAnnualPercentagePerDay * (0.46 * (temperatureMeanC as number) + 8);
  const etoMmDay = Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null;

  return {
    etoMmDay,
    method: "fao_24_blaney_criddle",
    formulaVersion: "fao-24-blaney-criddle-basic-daily-v1",
    qualityStatus: etoMmDay === null ? "invalid" : "estimated",
    temperatureMeanC,
    photoperiodHours: daylight,
    daylightAnnualPercentagePerDay,
    missingFields: [],
    warnings: [
      "Aplicação diária diagnóstica de uma equação desenvolvida para médias mensais; exige calibração local.",
    ],
  };
}
