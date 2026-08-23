/**
 * Service de cálculos de irrigação.
 *
 * Todas as fórmulas agronômicas de balanço hídrico, lâmina,
 * volume e prioridade ficam isoladas aqui.
 * As páginas NUNCA fazem cálculos — apenas exibem o resultado.
 *
 * Referências: FAO-56, Embrapa, Allen et al. (1998).
 */

import { roundTo, clamp } from "@/utils/math";
import type { ET0Input } from "@/types/domain/weather";
import { calculateReferenceEtoFao56 } from "@/modules/weather/calculations/referenceEtoFao56";

/* ========================================================================== */
/*  ET0 — Evapotranspiração de referência (Penman-Monteith FAO-56)            */
/* ========================================================================== */

/**
 * Compatibilidade para consumidores legados.
 *
 * A implementação operacional é única: calculateReferenceEtoFao56.
 * O contrato legado informa dia-do-ano em vez de data; por isso construímos
 * uma data sintética no ano bissexto 2024 preservando exatamente o DOY.
 * Vento deste contrato já é esperado a 2 m.
 */
export function calculateET0(input: ET0Input): number {
  const { tempMax, tempMin, humidity, windSpeed, solarRadiation, altitude, latitude, dayOfYear } = input;
  const safeDoy = Math.min(Math.max(Math.trunc(dayOfYear), 1), 366);
  const synthetic = new Date(Date.UTC(2024, 0, safeDoy));
  const date = synthetic.toISOString().slice(0, 10);

  const result = calculateReferenceEtoFao56({
    date,
    latitude,
    elevationM: Number.isFinite(altitude) ? altitude : null,
    temperatureMinC: tempMin,
    temperatureMaxC: tempMax,
    temperatureMeanC: (tempMax + tempMin) / 2,
    relativeHumidityMinPct: null,
    relativeHumidityMaxPct: null,
    relativeHumidityMeanPct: humidity,
    actualVapourPressureKpa: null,
    windSpeedMs: windSpeed,
    windMeasurementHeightM: 2,
    solarRadiationMjM2Day: solarRadiation,
    surfacePressureKpa: null,
  });

  return result.etoMmDay == null ? 0 : roundTo(Math.max(result.etoMmDay, 0), 2);
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
