// ============================================================================
// modules/weather/calculations/referenceEtoFao56.ts
// ----------------------------------------------------------------------------
// Implementação isolada e determinística de ETo diária pelo método
// FAO-56 Penman-Monteith.
//
// Referências:
//   • Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). Crop
//     evapotranspiration — Guidelines for computing crop water requirements
//     — FAO Irrigation and drainage paper 56.
//
// IMPORTANTE:
//   • Este módulo NÃO substitui `calculateET0` em irrigation.service.ts.
//   • Não importa nem depende do cálculo atual — é comparável a ele nos
//     testes por chamadas paralelas com os mesmos inputs (Etapa 6).
//   • Preserva null e registra estimativas em estimatedFields.
// ============================================================================

import type {
  EstimatedField,
  EtoIntermediateValues,
  EtoMethod,
  ReferenceEtoInput,
  ReferenceEtoResult,
} from "./referenceEtoTypes";
import { adjustWindToTwoMeters } from "@/modules/weather/conversions/weatherUnits";

// Constantes físicas
const SOLAR_CONSTANT = 0.0820;        // MJ/m²/min
const STEFAN_BOLTZMANN = 4.903e-9;    // MJ K⁻⁴ m⁻² dia⁻¹
const REFERENCE_ALBEDO = 0.23;        // Superfície de referência (grama)

/** Pressão de saturação de vapor (kPa) para uma temperatura em °C (FAO-56 eq. 11). */
function saturationVapourPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/** Inclinação Δ da curva es(T) em kPa/°C (FAO-56 eq. 13). */
function saturationSlope(tempC: number): number {
  const es = saturationVapourPressure(tempC);
  return (4098 * es) / Math.pow(tempC + 237.3, 2);
}

/** Pressão atmosférica média (kPa) a partir da elevação (FAO-56 eq. 7). */
function atmosphericPressureFromElevation(elevationM: number): number {
  return 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26);
}

/** Constante psicrométrica γ (kPa/°C) a partir da pressão (FAO-56 eq. 8). */
function psychrometricConstant(atmosphericPressureKpa: number): number {
  return 0.000665 * atmosphericPressureKpa;
}

/** Dia do ano (1..366) para a data local YYYY-MM-DD. */
function dayOfYearFromISO(dateIso: string): number {
  // Fixa em 12:00 UTC para eliminar viés de fuso — o valor é usado só na
  // trigonometria solar (dr, δ), que é insensível a horários.
  const d = new Date(`${dateIso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida em referenceEtoFao56: ${dateIso}`);
  }
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * Cálculo isolado de ETo (mm/dia). Preserva null e registra estimativas.
 */
export function calculateReferenceEtoFao56(
  input: ReferenceEtoInput,
): ReferenceEtoResult {
  const warnings: string[] = [];
  const estimatedFields: EstimatedField[] = [];
  const missingFields: string[] = [];

  const empty: EtoIntermediateValues = {
    atmosphericPressureKpa: null,
    psychrometricConstantKpaC: null,
    saturationVapourPressureKpa: null,
    actualVapourPressureKpa: null,
    vapourPressureDeficitKpa: null,
    saturationSlopeKpaC: null,
    extraterrestrialRadiationMjM2Day: null,
    clearSkyRadiationMjM2Day: null,
    netShortwaveRadiationMjM2Day: null,
    netLongwaveRadiationMjM2Day: null,
    netRadiationMjM2Day: null,
    soilHeatFluxMjM2Day: null,
    windSpeed2mMs: null,
  };

  // ── 1. Temperaturas ────────────────────────────────────────────────────
  const tMin = input.temperatureMinC;
  const tMax = input.temperatureMaxC;
  if (tMin === null) missingFields.push("temperatureMinC");
  if (tMax === null) missingFields.push("temperatureMaxC");
  let tMean: number | null = input.temperatureMeanC;
  if (tMean === null && tMin !== null && tMax !== null) {
    tMean = (tMin + tMax) / 2;
    estimatedFields.push({
      field: "temperatureMeanC",
      method: "média de min/max",
      reason: "temperatureMeanC ausente; derivada dos extremos.",
    });
  }
  if (tMean === null) missingFields.push("temperatureMeanC");

  // ── 2. Vento a 2 m ─────────────────────────────────────────────────────
  let u2: number | null = null;
  if (input.windSpeedMs === null) {
    missingFields.push("windSpeedMs");
  } else if (input.windSpeedMs < 0) {
    warnings.push("windSpeedMs negativo — tratado como dado ausente.");
    missingFields.push("windSpeedMs");
  } else {
    u2 = adjustWindToTwoMeters(input.windSpeedMs, input.windMeasurementHeightM);
    if (input.windMeasurementHeightM !== 2) {
      warnings.push(
        `Vento ajustado de ${input.windMeasurementHeightM} m para 2 m (FAO-56 eq. 47).`,
      );
    }
  }

  // ── 3. Radiação solar (Rs) ─────────────────────────────────────────────
  const rs = input.solarRadiationMjM2Day;
  if (rs === null) missingFields.push("solarRadiationMjM2Day");
  else if (rs < 0) {
    warnings.push("solarRadiationMjM2Day negativa — tratada como ausente.");
    missingFields.push("solarRadiationMjM2Day");
  }

  // ── 4. Pressão atmosférica (P) e psicrométrica (γ) ────────────────────
  // Prioridade (decisão Etapa 2):
  //   a) surfacePressureKpa válida da fonte;
  //   b) calcular a partir da altitude (FAO-56 eq. 7), registrando estimativa;
  //   c) sem pressão nem altitude → ETo não é calculável (missing).
  let atmosphericPressureKpa: number | null = null;
  if (
    input.surfacePressureKpa !== null &&
    Number.isFinite(input.surfacePressureKpa) &&
    input.surfacePressureKpa > 0
  ) {
    atmosphericPressureKpa = input.surfacePressureKpa;
  } else {
    if (input.surfacePressureKpa !== null) {
      warnings.push("surfacePressureKpa inválida — tratada como ausente.");
    }
    if (input.elevationM !== null && Number.isFinite(input.elevationM)) {
      atmosphericPressureKpa = atmosphericPressureFromElevation(input.elevationM);
      estimatedFields.push({
        field: "atmosphericPressureKpa",
        method: "FAO-56 eq. 7 (a partir da elevação)",
        reason: "surfacePressureKpa ausente; estimada a partir de elevationM.",
      });
    } else {
      missingFields.push("surfacePressureKpa");
      missingFields.push("elevationM");
    }
  }
  const gamma =
    atmosphericPressureKpa !== null
      ? psychrometricConstant(atmosphericPressureKpa)
      : null;

  // ── 5. Pressão de saturação es (média de esMin/esMax) e Δ ─────────────
  let es: number | null = null;
  let delta: number | null = null;
  if (tMin !== null && tMax !== null && tMean !== null) {
    const esMin = saturationVapourPressure(tMin);
    const esMax = saturationVapourPressure(tMax);
    es = (esMin + esMax) / 2;
    delta = saturationSlope(tMean);
  }

  // ── 6. Pressão real de vapor ea ────────────────────────────────────────
  // Precedência: ea fornecido > (esMin/esMax com RHmax/RHmin) > es × RHmean.
  let ea: number | null = null;
  if (input.actualVapourPressureKpa !== null) {
    if (input.actualVapourPressureKpa < 0) {
      warnings.push("actualVapourPressureKpa negativa — tratada como ausente.");
    } else {
      ea = input.actualVapourPressureKpa;
    }
  }
  if (ea === null) {
    const rhMin = input.relativeHumidityMinPct;
    const rhMax = input.relativeHumidityMaxPct;
    const rhMean = input.relativeHumidityMeanPct;
    if (
      tMin !== null &&
      tMax !== null &&
      rhMin !== null &&
      rhMax !== null &&
      rhMin >= 0 && rhMin <= 100 &&
      rhMax >= 0 && rhMax <= 100
    ) {
      const esMin = saturationVapourPressure(tMin);
      const esMax = saturationVapourPressure(tMax);
      ea = (esMin * (rhMax / 100) + esMax * (rhMin / 100)) / 2;
    } else if (
      es !== null &&
      rhMean !== null &&
      rhMean >= 0 &&
      rhMean <= 100
    ) {
      ea = es * (rhMean / 100);
      estimatedFields.push({
        field: "actualVapourPressureKpa",
        method: "es × RHmean/100",
        reason: "RHmin/RHmax ausentes; usada RHmean (menos precisa).",
      });
    } else {
      missingFields.push("actualVapourPressureKpa");
    }
  }
  const vpd = es !== null && ea !== null ? Math.max(es - ea, 0) : null;

  // ── 7. Radiação extraterrestre (Ra) e de céu claro (Rso) ──────────────
  let ra: number | null = null;
  let rso: number | null = null;
  if (Number.isFinite(input.latitude)) {
    const latRad = input.latitude * DEG_TO_RAD;
    const j = dayOfYearFromISO(input.date);
    const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365);
    const decl = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
    // Clamp em [-1, 1] previne NaN em latitudes onde tan(δ)·tan(φ) > 1.
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(latRad) * Math.tan(decl))));
    ra =
      ((24 * 60) / Math.PI) *
      SOLAR_CONSTANT *
      dr *
      (ws * Math.sin(latRad) * Math.sin(decl) +
        Math.cos(latRad) * Math.cos(decl) * Math.sin(ws));
    // Rso (FAO-56 eq. 37) depende da altitude. Se elevationM ausente mas
    // pressão foi fornecida, usamos z=0 (nível do mar) e AVISAMOS —
    // Rso subestimado leve, mas fluxo continua auditável (I2).
    if (input.elevationM !== null && Number.isFinite(input.elevationM)) {
      rso = (0.75 + 2e-5 * input.elevationM) * ra;
    } else {
      rso = 0.75 * ra;
      warnings.push(
        "elevationM ausente; Rso calculado ao nível do mar (subestimativa possível).",
      );
    }
  }

  // ── 8. Radiação líquida (Rn) ──────────────────────────────────────────
  let rns: number | null = null;
  let rnl: number | null = null;
  let rn: number | null = null;
  if (rs !== null && rs >= 0) {
    rns = (1 - REFERENCE_ALBEDO) * rs;
  }
  if (rs !== null && rs >= 0 && ea !== null && rso !== null && tMin !== null && tMax !== null) {
    const tMaxK4 = Math.pow(tMax + 273.16, 4);
    const tMinK4 = Math.pow(tMin + 273.16, 4);
    // I1 (FAO-56 §3.5.2): Rs/Rso deve estar em [0, 1] antes do termo de
    // nuvens. Valor fora do intervalo indica erro de medição/integração —
    // limitamos e registramos aviso, sem descartar o registro.
    const rawRatio = rs / Math.max(rso, 0.01);
    const cloudRatio = Math.min(Math.max(rawRatio, 0), 1);
    if (rawRatio > 1) {
      warnings.push(
        `Rs/Rso = ${rawRatio.toFixed(3)} > 1 — limitado a 1.0 (FAO-56 §3.5.2).`,
      );
    } else if (rawRatio < 0) {
      warnings.push(`Rs/Rso = ${rawRatio.toFixed(3)} < 0 — limitado a 0.`);
    }
    const cloudTerm = 1.35 * cloudRatio - 0.35;
    rnl =
      STEFAN_BOLTZMANN *
      ((tMaxK4 + tMinK4) / 2) *
      (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) *
      cloudTerm;
  }
  if (rns !== null && rnl !== null) {
    rn = rns - rnl;
  }

  // ── 9. Aplicação da equação FAO-56 (eq. 6) ────────────────────────────
  const soilHeatFlux = 0; // G ≈ 0 na base diária FAO-56

  const intermediate: EtoIntermediateValues = {
    atmosphericPressureKpa,
    psychrometricConstantKpaC: gamma,
    saturationVapourPressureKpa: es,
    actualVapourPressureKpa: ea,
    vapourPressureDeficitKpa: vpd,
    saturationSlopeKpaC: delta,
    extraterrestrialRadiationMjM2Day: ra,
    clearSkyRadiationMjM2Day: rso,
    netShortwaveRadiationMjM2Day: rns,
    netLongwaveRadiationMjM2Day: rnl,
    netRadiationMjM2Day: rn,
    soilHeatFluxMjM2Day: rn !== null ? soilHeatFlux : null,
    windSpeed2mMs: u2,
  };

  // ── 10. Falha explícita se faltar essencial ───────────────────────────
  const essentialMissing = missingFields.filter((f) =>
    [
      "temperatureMinC",
      "temperatureMaxC",
      "solarRadiationMjM2Day",
      "windSpeedMs",
      "actualVapourPressureKpa",
    ].includes(f),
  );
  if (
    essentialMissing.length > 0 ||
    rn === null ||
    delta === null ||
    gamma === null ||
    tMean === null ||
    u2 === null ||
    es === null ||
    ea === null
  ) {
    return {
      etoMmDay: null,
      method: estimatedFields.length > 0 ? "fao_56_pm_estimated" : "fao_56_penman_monteith",
      qualityStatus: "missing",
      missingFields,
      warnings,
      estimatedFields,
      intermediateValues: intermediate,
    };
  }

  // ── 11. ETo (mm/dia) ──────────────────────────────────────────────────
  const numerator =
    0.408 * delta * (rn - soilHeatFlux) +
    gamma * (900 / (tMean + 273)) * u2 * (es - ea);
  const denominator = delta + gamma * (1 + 0.34 * u2);
  const etoRaw = numerator / denominator;
  const eto = Number.isFinite(etoRaw) ? Math.max(etoRaw, 0) : null;

  const method: EtoMethod =
    estimatedFields.length > 0 ? "fao_56_pm_estimated" : "fao_56_penman_monteith";

  const qualityStatus =
    eto === null
      ? "missing"
      : estimatedFields.length > 0
        ? "estimated"
        : missingFields.length > 0
          ? "partial"
          : "complete";

  return {
    etoMmDay: eto,
    method,
    qualityStatus,
    missingFields,
    warnings,
    estimatedFields,
    intermediateValues: intermediate,
  };
}
