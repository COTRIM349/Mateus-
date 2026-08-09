export interface LinacreEtoInput {
  latitude: number;
  elevationM: number | null;
  temperatureMeanC: number | null;
  relativeHumidityMeanPct: number | null;
}

export interface LinacreEtoResult {
  etoMmDay: number | null;
  method: "linacre_1977_vegetation";
  formulaVersion: "linacre-1977-vegetation-c500-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  dewPointTemperatureC: number | null;
  adjustedTemperatureC: number | null;
  missingFields: string[];
  warnings: string[];
}

function dewPointFromTemperatureAndHumidity(temperatureC: number, humidityPct: number): number {
  const gamma = Math.log(humidityPct / 100) + (17.27 * temperatureC) / (237.3 + temperatureC);
  return (237.3 * gamma) / (17.27 - gamma);
}

/** Linacre (1977) para vegetação (albedo 0,25), constante J=500. */
export function calculateReferenceEtoLinacre(input: LinacreEtoInput): LinacreEtoResult {
  const missingFields: string[] = [];
  const temperature = input.temperatureMeanC;
  const humidity = input.relativeHumidityMeanPct;
  const elevation = input.elevationM;

  if (temperature === null || !Number.isFinite(temperature)) missingFields.push("temperatureMeanC");
  if (humidity === null || !Number.isFinite(humidity)) missingFields.push("relativeHumidityMeanPct");
  if (elevation === null || !Number.isFinite(elevation)) missingFields.push("elevationM");
  if (!Number.isFinite(input.latitude)) missingFields.push("latitude");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "linacre_1977_vegetation",
      formulaVersion: "linacre-1977-vegetation-c500-v1",
      qualityStatus: "missing",
      dewPointTemperatureC: null,
      adjustedTemperatureC: null,
      missingFields,
      warnings: ["Linacre exige temperatura, umidade, latitude e altitude."],
    };
  }

  const latitudeAbsolute = Math.abs(input.latitude);
  if ((humidity as number) <= 0 || (humidity as number) > 100
    || latitudeAbsolute > 90 || (temperature as number) >= 80) {
    return {
      etoMmDay: null,
      method: "linacre_1977_vegetation",
      formulaVersion: "linacre-1977-vegetation-c500-v1",
      qualityStatus: "invalid",
      dewPointTemperatureC: null,
      adjustedTemperatureC: null,
      missingFields: [],
      warnings: ["Entrada fora do domínio físico da equação de Linacre."],
    };
  }

  const dewPointTemperatureC = dewPointFromTemperatureAndHumidity(
    temperature as number,
    humidity as number,
  );
  const adjustedTemperatureC = (temperature as number) + 0.006 * (elevation as number);
  const numerator = 500 * adjustedTemperatureC / (100 - latitudeAbsolute)
    + 15 * ((temperature as number) - dewPointTemperatureC);
  const etoRaw = numerator / (80 - (temperature as number));

  return {
    etoMmDay: Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null,
    method: "linacre_1977_vegetation",
    formulaVersion: "linacre-1977-vegetation-c500-v1",
    qualityStatus: Number.isFinite(etoRaw) ? "estimated" : "invalid",
    dewPointTemperatureC,
    adjustedTemperatureC,
    missingFields: [],
    warnings: ["Ponto de orvalho derivado de T e UR média; a incerteza diária de Linacre pode ser elevada."],
  };
}
