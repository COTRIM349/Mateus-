// ============================================================================
// FAO-56 Penman-Monteith subdiario (30 min) — CLIMA 7 Shadow Mode
// ----------------------------------------------------------------------------
// Implementacao separada do motor diario referenceEtoFao56.ts.
// A equacao e avaliada como taxa horaria (FAO-56 eq. 53) e integrada pela
// duracao real do intervalo. Para 30 min, ET0_interval = ET0_mm_h * 0.5.
// ============================================================================

const SOLAR_CONSTANT_MJ_M2_MIN = 0.0820;
const STEFAN_BOLTZMANN_HOURLY = 4.903e-9 / 24;
const ALBEDO = 0.23;
const DEG_TO_RAD = Math.PI / 180;

export type SubdailyEtoQuality = "complete" | "estimated" | "partial" | "missing" | "invalid";

export interface ReferenceEtoSubdailyInput {
  intervalStart: string;
  intervalEnd: string;
  latitude: number;
  longitude: number;
  elevationM: number | null;
  timezone: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  dewPointC: number | null;
  surfacePressureKpa: number | null;
  windSpeed2mMs: number | null;
  solarRadiationWm2: number | null;
  // Para noite: deve vir de uma razao Rs/Rso diurna recente, nunca de um
  // default climatico silencioso.
  inheritedCloudinessRatio?: number | null;
}

export interface ReferenceEtoSubdailyResult {
  etoMmInterval: number | null;
  etoRateMmH: number | null;
  qualityStatus: SubdailyEtoQuality;
  missingFields: string[];
  warnings: string[];
  pressureEstimatedFromElevation: boolean;
  cloudinessInherited: boolean;
  isDaylight: boolean | null;
  intermediate: {
    intervalHours: number | null;
    solarRadiationMjM2Interval: number | null;
    solarRadiationMjM2H: number | null;
    extraterrestrialRadiationMjM2Interval: number | null;
    clearSkyRadiationMjM2Interval: number | null;
    cloudinessRatio: number | null;
    netShortwaveRadiationMjM2H: number | null;
    netLongwaveRadiationMjM2H: number | null;
    netRadiationMjM2H: number | null;
    soilHeatFluxMjM2H: number | null;
    atmosphericPressureKpa: number | null;
    psychrometricConstantKpaC: number | null;
    saturationVapourPressureKpa: number | null;
    actualVapourPressureKpa: number | null;
    vapourPressureDeficitKpa: number | null;
    saturationSlopeKpaC: number | null;
    radiationTerm: number | null;
    aerodynamicTerm: number | null;
  };
}

function saturationVapourPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

function saturationSlope(tempC: number): number {
  const es = saturationVapourPressure(tempC);
  return (4098 * es) / Math.pow(tempC + 237.3, 2);
}

function atmosphericPressureFromElevation(elevationM: number): number {
  return 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26);
}

function psychrometricConstant(pressureKpa: number): number {
  return 0.000665 * pressureKpa;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dayOfYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 0);
  return Math.floor((Date.UTC(y, date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
}

function timezoneClock(midpoint: Date, timezone: string): {
  localHour: number;
  localDateUtcProxy: Date;
  offsetHours: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(midpoint);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) {
    throw new Error(`timezone invalida ou nao resolvida: ${timezone}`);
  }
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetHours = (localAsUtc - midpoint.getTime()) / 3600000;
  return {
    localHour: hour + minute / 60 + second / 3600,
    localDateUtcProxy: new Date(Date.UTC(year, month - 1, day, 12, 0, 0)),
    offsetHours,
  };
}

function extraterrestrialRadiationForInterval(params: {
  midpoint: Date;
  intervalHours: number;
  latitude: number;
  longitude: number;
  timezone: string;
}): { ra: number; isDaylight: boolean } {
  const { localHour, localDateUtcProxy, offsetHours } = timezoneClock(params.midpoint, params.timezone);
  const j = dayOfYear(localDateUtcProxy);
  const phi = params.latitude * DEG_TO_RAD;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
  const ws = Math.acos(clamp(-Math.tan(phi) * Math.tan(decl), -1, 1));

  const b = (2 * Math.PI * (j - 81)) / 364;
  const sc = 0.1645 * Math.sin(2 * b) - 0.1255 * Math.cos(b) - 0.025 * Math.sin(b);

  // FAO-56 usa longitudes oeste positivas nas equacoes de tempo solar.
  const lmWest = -params.longitude;
  const lzWest = -15 * offsetHours;
  const solarTime = localHour + 0.06667 * (lzWest - lmWest) + sc;
  const omega = (Math.PI / 12) * (solarTime - 12);
  const half = (Math.PI * params.intervalHours) / 24;
  const omega1 = Math.max(-ws, omega - half);
  const omega2 = Math.min(ws, omega + half);

  if (omega2 <= omega1) return { ra: 0, isDaylight: false };

  const ra =
    ((12 * 60) / Math.PI) *
    SOLAR_CONSTANT_MJ_M2_MIN *
    dr *
    ((omega2 - omega1) * Math.sin(phi) * Math.sin(decl) +
      Math.cos(phi) * Math.cos(decl) * (Math.sin(omega2) - Math.sin(omega1)));

  return { ra: Math.max(ra, 0), isDaylight: ra > 1e-6 };
}

function emptyResult(
  qualityStatus: SubdailyEtoQuality,
  missingFields: string[],
  warnings: string[],
): ReferenceEtoSubdailyResult {
  return {
    etoMmInterval: null,
    etoRateMmH: null,
    qualityStatus,
    missingFields,
    warnings,
    pressureEstimatedFromElevation: false,
    cloudinessInherited: false,
    isDaylight: null,
    intermediate: {
      intervalHours: null,
      solarRadiationMjM2Interval: null,
      solarRadiationMjM2H: null,
      extraterrestrialRadiationMjM2Interval: null,
      clearSkyRadiationMjM2Interval: null,
      cloudinessRatio: null,
      netShortwaveRadiationMjM2H: null,
      netLongwaveRadiationMjM2H: null,
      netRadiationMjM2H: null,
      soilHeatFluxMjM2H: null,
      atmosphericPressureKpa: null,
      psychrometricConstantKpaC: null,
      saturationVapourPressureKpa: null,
      actualVapourPressureKpa: null,
      vapourPressureDeficitKpa: null,
      saturationSlopeKpaC: null,
      radiationTerm: null,
      aerodynamicTerm: null,
    },
  };
}

export function calculateReferenceEtoFao56Subdaily(
  input: ReferenceEtoSubdailyInput,
): ReferenceEtoSubdailyResult {
  const warnings: string[] = [];
  const missingFields: string[] = [];
  const start = new Date(input.intervalStart);
  const end = new Date(input.intervalEnd);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return emptyResult("invalid", ["interval"], ["intervalo temporal invalido"]);
  }

  const intervalHours = (end.getTime() - start.getTime()) / 3600000;
  if (Math.abs(intervalHours - 0.5) > 1e-6) {
    warnings.push(`CLIMA 7 foi desenhada para 30 min; intervalo recebido=${intervalHours.toFixed(3)} h.`);
  }

  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    return emptyResult("invalid", ["latitude"], ["latitude fora de -90..90"]);
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    return emptyResult("invalid", ["longitude"], ["longitude fora de -180..180"]);
  }

  const temperatureC = input.temperatureC;
  if (temperatureC === null || !Number.isFinite(temperatureC)) missingFields.push("temperatureC");
  if (input.windSpeed2mMs === null || !Number.isFinite(input.windSpeed2mMs) || input.windSpeed2mMs < 0) {
    missingFields.push("windSpeed2mMs");
  }
  if (input.solarRadiationWm2 === null || !Number.isFinite(input.solarRadiationWm2) || input.solarRadiationWm2 < 0) {
    missingFields.push("solarRadiationWm2");
  }

  let pressureKpa: number | null = null;
  let pressureEstimatedFromElevation = false;
  if (input.surfacePressureKpa !== null && Number.isFinite(input.surfacePressureKpa) && input.surfacePressureKpa > 0) {
    pressureKpa = input.surfacePressureKpa;
  } else if (input.elevationM !== null && Number.isFinite(input.elevationM)) {
    pressureKpa = atmosphericPressureFromElevation(input.elevationM);
    pressureEstimatedFromElevation = true;
    warnings.push("Pressao de superficie ausente; estimada pela elevacao (FAO-56 eq. 7).")
  } else {
    missingFields.push("surfacePressureKpa/elevationM");
  }

  let ea: number | null = null;
  if (input.dewPointC !== null && Number.isFinite(input.dewPointC)) {
    ea = saturationVapourPressure(input.dewPointC);
  } else if (
    temperatureC !== null && Number.isFinite(temperatureC) &&
    input.relativeHumidityPct !== null && Number.isFinite(input.relativeHumidityPct) &&
    input.relativeHumidityPct >= 0 && input.relativeHumidityPct <= 100
  ) {
    ea = saturationVapourPressure(temperatureC) * (input.relativeHumidityPct / 100);
    warnings.push("Ponto de orvalho ausente; ea derivada de temperatura e UR do intervalo.");
  } else {
    missingFields.push("dewPointC/relativeHumidityPct");
  }

  if (missingFields.length > 0 || temperatureC === null || pressureKpa === null || ea === null || input.windSpeed2mMs === null || input.solarRadiationWm2 === null) {
    const out = emptyResult("missing", missingFields, warnings);
    out.pressureEstimatedFromElevation = pressureEstimatedFromElevation;
    out.intermediate.intervalHours = intervalHours;
    out.intermediate.atmosphericPressureKpa = pressureKpa;
    out.intermediate.actualVapourPressureKpa = ea;
    return out;
  }

  const midpoint = new Date((start.getTime() + end.getTime()) / 2);
  let solar;
  try {
    solar = extraterrestrialRadiationForInterval({
      midpoint,
      intervalHours,
      latitude: input.latitude,
      longitude: input.longitude,
      timezone: input.timezone,
    });
  } catch (error) {
    return emptyResult("invalid", ["timezone"], [error instanceof Error ? error.message : String(error)]);
  }

  const rsInterval = (input.solarRadiationWm2 * intervalHours * 3600) / 1_000_000;
  const rsRate = rsInterval / intervalHours;
  const rsoInterval = (0.75 + 2e-5 * (input.elevationM ?? 0)) * solar.ra;

  let cloudinessRatio: number | null = null;
  let cloudinessInherited = false;
  if (solar.isDaylight && rsoInterval > 1e-6) {
    cloudinessRatio = clamp(rsInterval / rsoInterval, 0.3, 1);
    if (rsInterval / rsoInterval < 0.3) {
      warnings.push("Rs/Rso < 0,3; limitado a 0,3 conforme limite de cobertura total usado no FAO-56 subdiario.");
    }
    if (rsInterval / rsoInterval > 1) {
      warnings.push("Rs/Rso > 1; limitado a 1.");
    }
  } else {
    const inherited = input.inheritedCloudinessRatio;
    if (inherited !== null && inherited !== undefined && Number.isFinite(inherited)) {
      cloudinessRatio = clamp(inherited, 0.3, 1);
      cloudinessInherited = true;
      warnings.push("Periodo noturno: Rs/Rso herdado de periodo diurno anterior para estimar Rnl.");
    } else {
      const out = emptyResult("missing", ["inheritedCloudinessRatio"], [
        ...warnings,
        "Periodo noturno sem Rs/Rso diurno recente; ETo nao calculada para evitar suposicao climatica fixa.",
      ]);
      out.isDaylight = false;
      out.pressureEstimatedFromElevation = pressureEstimatedFromElevation;
      out.intermediate.intervalHours = intervalHours;
      out.intermediate.solarRadiationMjM2Interval = rsInterval;
      out.intermediate.extraterrestrialRadiationMjM2Interval = solar.ra;
      out.intermediate.clearSkyRadiationMjM2Interval = rsoInterval;
      return out;
    }
  }

  const es = saturationVapourPressure(temperatureC);
  const delta = saturationSlope(temperatureC);
  const gamma = psychrometricConstant(pressureKpa);
  const vpd = Math.max(es - ea, 0);

  const rnsRate = (1 - ALBEDO) * rsRate;
  const tempK4 = Math.pow(temperatureC + 273.16, 4);
  const cloudTerm = 1.35 * cloudinessRatio - 0.35;
  const rnlRate =
    STEFAN_BOLTZMANN_HOURLY *
    tempK4 *
    (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) *
    cloudTerm;
  const rnRate = rnsRate - rnlRate;
  const gRate = (solar.isDaylight ? 0.1 : 0.5) * rnRate;

  const radiationTerm = 0.408 * delta * (rnRate - gRate);
  const aerodynamicTerm = gamma * (37 / (temperatureC + 273)) * input.windSpeed2mMs * vpd;
  const denominator = delta + gamma * (1 + 0.34 * input.windSpeed2mMs);
  const etoRateRaw = denominator > 0 ? (radiationTerm + aerodynamicTerm) / denominator : NaN;
  const etoRate = Number.isFinite(etoRateRaw) ? Math.max(etoRateRaw, 0) : null;
  const etoInterval = etoRate === null ? null : etoRate * intervalHours;

  const qualityStatus: SubdailyEtoQuality =
    etoInterval === null
      ? "invalid"
      : pressureEstimatedFromElevation || cloudinessInherited || input.dewPointC === null
        ? "estimated"
        : "complete";

  return {
    etoMmInterval: etoInterval,
    etoRateMmH: etoRate,
    qualityStatus,
    missingFields,
    warnings,
    pressureEstimatedFromElevation,
    cloudinessInherited,
    isDaylight: solar.isDaylight,
    intermediate: {
      intervalHours,
      solarRadiationMjM2Interval: rsInterval,
      solarRadiationMjM2H: rsRate,
      extraterrestrialRadiationMjM2Interval: solar.ra,
      clearSkyRadiationMjM2Interval: rsoInterval,
      cloudinessRatio,
      netShortwaveRadiationMjM2H: rnsRate,
      netLongwaveRadiationMjM2H: rnlRate,
      netRadiationMjM2H: rnRate,
      soilHeatFluxMjM2H: gRate,
      atmosphericPressureKpa: pressureKpa,
      psychrometricConstantKpaC: gamma,
      saturationVapourPressureKpa: es,
      actualVapourPressureKpa: ea,
      vapourPressureDeficitKpa: vpd,
      saturationSlopeKpaC: delta,
      radiationTerm,
      aerodynamicTerm,
    },
  };
}
