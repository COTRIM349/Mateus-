// ETo diaria por Hargreaves-Samani (1985).
// Ra e calculada pelas equacoes astronomicas FAO-56 e convertida de
// MJ/m2/dia para evaporacao equivalente em mm/dia pelo fator 0,408.

export interface HargreavesSamaniInput {
  date: string;
  latitude: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
}

export interface HargreavesSamaniResult {
  etoMmDay: number | null;
  method: "hargreaves_samani_1985";
  formulaVersion: "hs-1985-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  temperatureMeanC: number | null;
  temperatureRangeC: number | null;
  extraterrestrialRadiationMjM2Day: number | null;
  missingFields: string[];
  warnings: string[];
}

const SOLAR_CONSTANT_MJ_M2_MIN = 0.0820;
const MJ_M2_TO_MM = 0.408;

function dayOfYear(dateIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) return null;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function extraterrestrialRadiationDaily(
  date: string,
  latitude: number,
): number | null {
  const julianDay = dayOfYear(date);
  if (julianDay === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return null;
  }

  const latitudeRad = latitude * Math.PI / 180;
  const inverseDistance = 1 + 0.033 * Math.cos((2 * Math.PI / 365) * julianDay);
  const solarDeclination = 0.409 * Math.sin((2 * Math.PI / 365) * julianDay - 1.39);
  const sunsetArgument = Math.max(
    -1,
    Math.min(1, -Math.tan(latitudeRad) * Math.tan(solarDeclination)),
  );
  const sunsetHourAngle = Math.acos(sunsetArgument);

  return (24 * 60 / Math.PI)
    * SOLAR_CONSTANT_MJ_M2_MIN
    * inverseDistance
    * (
      sunsetHourAngle * Math.sin(latitudeRad) * Math.sin(solarDeclination)
      + Math.cos(latitudeRad) * Math.cos(solarDeclination) * Math.sin(sunsetHourAngle)
    );
}

export function calculateReferenceEtoHargreavesSamani(
  input: HargreavesSamaniInput,
): HargreavesSamaniResult {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  const tMin = input.temperatureMinC;
  const tMax = input.temperatureMaxC;
  const radiation = extraterrestrialRadiationDaily(input.date, input.latitude);

  if (tMin === null || !Number.isFinite(tMin)) missingFields.push("temperatureMinC");
  if (tMax === null || !Number.isFinite(tMax)) missingFields.push("temperatureMaxC");
  if (radiation === null) missingFields.push("dateOrLatitude");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "hargreaves_samani_1985",
      formulaVersion: "hs-1985-v1",
      qualityStatus: "missing",
      temperatureMeanC: null,
      temperatureRangeC: null,
      extraterrestrialRadiationMjM2Day: radiation,
      missingFields,
      warnings,
    };
  }

  const temperatureMinC = tMin as number;
  const temperatureMaxC = tMax as number;
  if (temperatureMaxC < temperatureMinC) {
    warnings.push("Temperatura maxima menor que a minima; ETo nao calculada.");
    return {
      etoMmDay: null,
      method: "hargreaves_samani_1985",
      formulaVersion: "hs-1985-v1",
      qualityStatus: "invalid",
      temperatureMeanC: null,
      temperatureRangeC: temperatureMaxC - temperatureMinC,
      extraterrestrialRadiationMjM2Day: radiation,
      missingFields: [],
      warnings,
    };
  }

  const temperatureMeanC = (temperatureMinC + temperatureMaxC) / 2;
  const temperatureRangeC = temperatureMaxC - temperatureMinC;
  const etoMmDay = Math.max(
    0,
    0.0023
      * MJ_M2_TO_MM
      * (radiation as number)
      * (temperatureMeanC + 17.8)
      * Math.sqrt(temperatureRangeC),
  );

  return {
    etoMmDay,
    method: "hargreaves_samani_1985",
    formulaVersion: "hs-1985-v1",
    qualityStatus: "estimated",
    temperatureMeanC,
    temperatureRangeC,
    extraterrestrialRadiationMjM2Day: radiation,
    missingFields: [],
    warnings: [
      "Metodo empirico baseado em temperatura; exige validacao local contra FAO-56 e/ou estacao fisica.",
    ],
  };
}
