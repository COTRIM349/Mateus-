export interface ThornthwaiteCamargoInput {
  date: string;
  latitude: number;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  climatologicalAnnualMeanTemperatureC: number | null;
}

export interface ThornthwaiteCamargoResult {
  etoMmDay: number | null;
  method: "thornthwaite_camargo_1999";
  formulaVersion: "thornthwaite-camargo-1999-b0.36-v1";
  qualityStatus: "estimated" | "missing" | "invalid";
  camargoParameter: 0.36;
  effectiveTemperatureC: number | null;
  annualHeatIndex: number | null;
  exponentA: number | null;
  photoperiodHours: number | null;
  missingFields: string[];
  warnings: string[];
}

function dayOfYear(dateIso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateIso) return null;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function photoperiodHours(date: string, latitude: number): number | null {
  const julianDay = dayOfYear(date);
  if (julianDay === null || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return null;
  }
  const latitudeRad = latitude * Math.PI / 180;
  const declination = 0.409 * Math.sin((2 * Math.PI / 365) * julianDay - 1.39);
  const sunsetArgument = Math.max(
    -1,
    Math.min(1, -Math.tan(latitudeRad) * Math.tan(declination)),
  );
  return 24 / Math.PI * Math.acos(sunsetArgument);
}

/**
 * Thornthwaite ajustado por Camargo et al. (1999), em base diária.
 * Tef = 0,36 (3 Tmax - Tmin). I é obtido da normal anual de temperatura.
 */
export function calculateReferenceEtoThornthwaiteCamargo(
  input: ThornthwaiteCamargoInput,
): ThornthwaiteCamargoResult {
  const missingFields: string[] = [];
  const tMin = input.temperatureMinC;
  const tMax = input.temperatureMaxC;
  const annualMean = input.climatologicalAnnualMeanTemperatureC;
  const daylight = photoperiodHours(input.date, input.latitude);

  if (tMin === null || !Number.isFinite(tMin)) missingFields.push("temperatureMinC");
  if (tMax === null || !Number.isFinite(tMax)) missingFields.push("temperatureMaxC");
  if (annualMean === null || !Number.isFinite(annualMean)) {
    missingFields.push("climatologicalAnnualMeanTemperatureC");
  }
  if (daylight === null) missingFields.push("dateOrLatitude");

  if (missingFields.length > 0) {
    return {
      etoMmDay: null,
      method: "thornthwaite_camargo_1999",
      formulaVersion: "thornthwaite-camargo-1999-b0.36-v1",
      qualityStatus: "missing",
      camargoParameter: 0.36,
      effectiveTemperatureC: null,
      annualHeatIndex: null,
      exponentA: null,
      photoperiodHours: daylight,
      missingFields,
      warnings: ["O método exige normal climatológica anual; poucos dias recentes não substituem essa entrada."],
    };
  }

  const minimumC = tMin as number;
  const maximumC = tMax as number;
  const normalC = annualMean as number;
  if (maximumC < minimumC || normalC <= 0) {
    return {
      etoMmDay: null,
      method: "thornthwaite_camargo_1999",
      formulaVersion: "thornthwaite-camargo-1999-b0.36-v1",
      qualityStatus: "invalid",
      camargoParameter: 0.36,
      effectiveTemperatureC: null,
      annualHeatIndex: null,
      exponentA: null,
      photoperiodHours: daylight,
      missingFields: [],
      warnings: ["Extremos diários ou normal anual incompatíveis com o método."],
    };
  }

  const effectiveTemperatureC = 0.36 * (3 * maximumC - minimumC);
  const annualHeatIndex = 12 * Math.pow(0.2 * normalC, 1.514);
  const exponentA = 0.49239
    + 0.01791 * annualHeatIndex
    - 7.71e-5 * annualHeatIndex ** 2
    + 6.75e-7 * annualHeatIndex ** 3;
  const standardMonthlyMm = effectiveTemperatureC <= 0
    ? 0
    : effectiveTemperatureC < 26.5
      ? 16 * Math.pow((10 * effectiveTemperatureC) / annualHeatIndex, exponentA)
      : -415.85 + 32.24 * effectiveTemperatureC - 0.43 * effectiveTemperatureC ** 2;
  const etoRaw = standardMonthlyMm / 30 * (daylight as number) / 12;
  const etoMmDay = Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null;

  return {
    etoMmDay,
    method: "thornthwaite_camargo_1999",
    formulaVersion: "thornthwaite-camargo-1999-b0.36-v1",
    qualityStatus: etoMmDay === null ? "invalid" : "estimated",
    camargoParameter: 0.36,
    effectiveTemperatureC,
    annualHeatIndex,
    exponentA,
    photoperiodHours: daylight,
    missingFields: [],
    warnings: [
      "Método empírico de temperatura; a normal anual vem do NASA POWER e o resultado permanece apenas diagnóstico.",
    ],
  };
}
