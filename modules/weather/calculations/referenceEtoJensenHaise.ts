export interface JensenHaiseInput {
  temperatureMeanC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  solarRadiationMjM2Day: number | null;
}

export interface JensenHaiseResult {
  etoMmDay: number | null;
  method: "jensen_haise_1963_simplified";
  formulaVersion: "jensen-haise-1963-simplified-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  temperatureMeanC: number | null;
  solarRadiationMjM2Day: number | null;
  solarRadiationEquivalentMmDay: number | null;
  missingFields: string[];
  warnings: string[];
}

/** Jensen-Haise simplificado: ETo = Rs(mm/d) × (0,025 T + 0,08). */
export function calculateReferenceEtoJensenHaise(
  input: JensenHaiseInput,
): JensenHaiseResult {
  const missingFields: string[] = [];
  let temperatureMeanC = input.temperatureMeanC;
  if (temperatureMeanC === null
    && input.temperatureMinC !== null
    && input.temperatureMaxC !== null
    && Number.isFinite(input.temperatureMinC)
    && Number.isFinite(input.temperatureMaxC)) {
    temperatureMeanC = (input.temperatureMinC + input.temperatureMaxC) / 2;
  }
  const rs = input.solarRadiationMjM2Day;
  if (temperatureMeanC === null || !Number.isFinite(temperatureMeanC)) {
    missingFields.push("temperatureMeanC");
  }
  if (rs === null || !Number.isFinite(rs) || rs < 0) {
    missingFields.push("solarRadiationMjM2Day");
  }

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "jensen_haise_1963_simplified",
      formulaVersion: "jensen-haise-1963-simplified-v1",
      qualityStatus: "missing",
      temperatureMeanC,
      solarRadiationMjM2Day: rs,
      solarRadiationEquivalentMmDay: null,
      missingFields,
      warnings: ["Jensen-Haise depende de temperatura média e radiação solar diária; ausência não é convertida em zero."],
    };
  }

  if (input.temperatureMinC !== null
    && input.temperatureMaxC !== null
    && input.temperatureMaxC < input.temperatureMinC) {
    return {
      etoMmDay: null,
      method: "jensen_haise_1963_simplified",
      formulaVersion: "jensen-haise-1963-simplified-v1",
      qualityStatus: "invalid",
      temperatureMeanC,
      solarRadiationMjM2Day: rs,
      solarRadiationEquivalentMmDay: null,
      missingFields: [],
      warnings: ["Temperatura máxima menor que a mínima; ETo não calculada."],
    };
  }

  const solarRadiationEquivalentMmDay = (rs as number) * 0.408;
  const etoRaw = solarRadiationEquivalentMmDay * (0.025 * (temperatureMeanC as number) + 0.08);
  const etoMmDay = Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null;

  return {
    etoMmDay,
    method: "jensen_haise_1963_simplified",
    formulaVersion: "jensen-haise-1963-simplified-v1",
    qualityStatus: etoMmDay === null ? "invalid" : "estimated",
    temperatureMeanC,
    solarRadiationMjM2Day: rs,
    solarRadiationEquivalentMmDay,
    missingFields: [],
    warnings: [
      "Forma simplificada desenvolvida para regiões áridas e semiáridas; exige validação local contra FAO-56.",
    ],
  };
}
