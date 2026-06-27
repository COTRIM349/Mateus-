/**
 * Service de clima / meteorologia.
 *
 * Processa dados climáticos e calcula variáveis derivadas
 * necessárias pelo balanço hídrico e outros módulos.
 */

import { roundTo, average } from "@/utils/math";
import type { WeatherReading } from "@/types/domain/weather";

/**
 * Precipitação efetiva segundo o método USDA SCS.
 * Resultado em mm.
 */
export function calculateEffectivePrecipitation(precipitation: number): number {
  if (precipitation <= 0) return 0;
  if (precipitation <= 250) {
    return roundTo(precipitation * (125 - 0.2 * precipitation) / 125, 2);
  }
  return roundTo(125 + 0.1 * precipitation, 2);
}

/**
 * Retorna a média diária de temperatura para um período.
 */
export function averageTemperature(readings: WeatherReading[]): number {
  return roundTo(average(readings.map((r) => r.tempMean)), 1);
}

/**
 * Soma da precipitação de um período.
 */
export function totalPrecipitation(readings: WeatherReading[]): number {
  return roundTo(readings.reduce((s, r) => s + r.precipitation, 0), 1);
}
