/**
 * Service de cálculos de irrigação.
 *
 * Todas as fórmulas agronômicas de balanço hídrico, lâmina,
 * volume e prioridade ficam isoladas aqui.
 * As páginas NUNCA fazem cálculos — apenas exibem o resultado.
 *
 * Referências: FAO-56, Embrapa, Allen et al. (1998).
 */

import {
  STEFAN_BOLTZMANN,
  LATENT_HEAT,
  REFERENCE_ALBEDO,
  SOLAR_CONSTANT,
} from "@/constants/agronomic";
import { degToRad, roundTo, clamp } from "@/utils/math";
import type { ET0Input } from "@/types/domain/weather";

/* ========================================================================== */
/*  ET0 — Evapotranspiração de referência (Penman-Monteith FAO-56)            */
/* ========================================================================== */

function saturationVaporPressure(temp: number): number {
  return 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
}

function slopeVaporPressureCurve(temp: number): number {
  const es = saturationVaporPressure(temp);
  return (4098 * es) / Math.pow(temp + 237.3, 2);
}

function psychrometricConstant(altitude: number): number {
  const P = 101.3 * Math.pow((293 - 0.0065 * altitude) / 293, 5.26);
  return 0.000665 * P;
}

/**
 * Calcula a ET0 diária pelo método de Penman-Monteith (FAO-56).
 * Resultado em mm/dia.
 */
export function calculateET0(input: ET0Input): number {
  const { tempMax, tempMin, humidity, windSpeed, solarRadiation, altitude, latitude, dayOfYear } = input;

  const tempMean = (tempMax + tempMin) / 2;
  const delta = slopeVaporPressureCurve(tempMean);
  const gamma = psychrometricConstant(altitude);

  const esMax = saturationVaporPressure(tempMax);
  const esMin = saturationVaporPressure(tempMin);
  const es = (esMax + esMin) / 2;
  const ea = es * (humidity / 100);

  const latRad = degToRad(latitude);
  const dr = 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * dayOfYear);
  const solarDeclination = 0.409 * Math.sin(((2 * Math.PI) / 365) * dayOfYear - 1.39);
  const ws = Math.acos(-Math.tan(latRad) * Math.tan(solarDeclination));

  const Ra =
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT *
    dr *
    (ws * Math.sin(latRad) * Math.sin(solarDeclination) +
      Math.cos(latRad) * Math.cos(solarDeclination) * Math.sin(ws));

  const Rso = (0.75 + 2e-5 * altitude) * Ra;
  const Rns = (1 - REFERENCE_ALBEDO) * solarRadiation;

  const tempMaxK = tempMax + 273.16;
  const tempMinK = tempMin + 273.16;
  const Rnl =
    STEFAN_BOLTZMANN *
    ((Math.pow(tempMaxK, 4) + Math.pow(tempMinK, 4)) / 2) *
    (0.34 - 0.14 * Math.sqrt(ea)) *
    (1.35 * (solarRadiation / Math.max(Rso, 0.01)) - 0.35);

  const Rn = Rns - Rnl;
  const G = 0;

  const numerator =
    0.408 * delta * (Rn - G) + gamma * (900 / (tempMean + 273)) * windSpeed * (es - ea);
  const denominator = delta + gamma * (1 + 0.34 * windSpeed);

  return roundTo(Math.max(numerator / denominator, 0), 2);
}

/* ========================================================================== */
/*  ETc — Evapotranspiração da cultura                                        */
/* ========================================================================== */

/**
 * ETc = ET0 × Kc
 * Resultado em mm/dia.
 */
export function calculateETc(et0: number, kc: number): number {
  return roundTo(Math.max(et0 * kc, 0), 2);
}

/* ========================================================================== */
/*  CAD — Capacidade de Água Disponível                                       */
/* ========================================================================== */

/**
 * CAD = (CC - PMP) × Z × 10
 * CC = capacidade de campo (cm³/cm³)
 * PMP = ponto de murcha permanente (cm³/cm³)
 * Z = profundidade efetiva das raízes (m)
 * Resultado em mm.
 */
export function calculateCAD(
  fieldCapacity: number,
  wiltingPoint: number,
  rootDepth: number,
): number {
  return roundTo((fieldCapacity - wiltingPoint) * rootDepth * 1000, 2);
}

/* ========================================================================== */
/*  AFD — Água Facilmente Disponível                                          */
/* ========================================================================== */

/**
 * AFD = CAD × p
 * p = fator de depleção da cultura (0-1).
 * Resultado em mm.
 */
export function calculateAvailableWater(cad: number, depletionFactor: number): number {
  return roundTo(cad * depletionFactor, 2);
}

/* ========================================================================== */
/*  Lâmina líquida e bruta de irrigação                                       */
/* ========================================================================== */

/**
 * Lâmina líquida = déficit acumulado (mm).
 * Lâmina bruta = lâmina líquida / eficiência do sistema.
 * Resultado em mm.
 */
export function calculateIrrigation(
  deficit: number,
  systemEfficiency: number,
): number {
  if (deficit <= 0) return 0;
  const eff = clamp(systemEfficiency, 0.1, 1);
  return roundTo(deficit / eff, 2);
}

/* ========================================================================== */
/*  Volume de água                                                            */
/* ========================================================================== */

/**
 * Volume = lâmina (mm) × área (ha) × 10.
 * Resultado em m³.
 */
export function calculateVolume(depthMm: number, areaHa: number): number {
  return roundTo(depthMm * areaHa * 10, 0);
}

/* ========================================================================== */
/*  Tempo de irrigação                                                        */
/* ========================================================================== */

/**
 * Tempo = volume (m³) / vazão (m³/h).
 * Resultado em horas.
 */
export function calculateIrrigationTime(volume: number, flowRate: number): number {
  if (flowRate <= 0) return 0;
  return roundTo(volume / flowRate, 1);
}

/* ========================================================================== */
/*  Prioridade de irrigação                                                   */
/* ========================================================================== */

/**
 * Classifica a prioridade com base no déficit relativo à AFD.
 * - deficit >= 80% da AFD → alta
 * - deficit >= 50% da AFD → media
 * - deficit < 50% → baixa
 */
export function calculatePriority(
  deficit: number,
  availableWater: number,
): "alta" | "media" | "baixa" {
  if (availableWater <= 0) return "alta";
  const ratio = deficit / availableWater;
  if (ratio >= 0.8) return "alta";
  if (ratio >= 0.5) return "media";
  return "baixa";
}

/**
 * Estima o risco produtivo (0-100) com base no déficit e no estágio da cultura.
 * Estágios reprodutivos (floração, enchimento) amplificam o risco.
 */
export function calculateProductiveRisk(
  deficit: number,
  availableWater: number,
  cropStage: string,
): number {
  if (availableWater <= 0) return 100;
  const ratio = clamp(deficit / availableWater, 0, 1);
  const stageMultiplier =
    cropStage === "floracao" || cropStage === "enchimento" ? 1.3 : 1.0;
  return clamp(Math.round(ratio * 100 * stageMultiplier), 0, 100);
}
