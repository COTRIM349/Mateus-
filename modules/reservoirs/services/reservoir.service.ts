/**
 * Service de reservatórios.
 *
 * Cálculos de capacidade, autonomia e alertas de nível.
 */

import { roundTo, clamp } from "@/utils/math";

/**
 * Percentual de nível do reservatório.
 */
export function calculateLevelPercent(currentVolume: number, maxCapacity: number): number {
  if (maxCapacity <= 0) return 0;
  return clamp(roundTo((currentVolume / maxCapacity) * 100, 1), 0, 100);
}

/**
 * Autonomia estimada em horas.
 * autonomia = (volume atual - nível mín) / demanda por hora.
 */
export function calculateAutonomy(
  currentVolume: number,
  minOperationalLevel: number,
  demandPerHour: number,
): number {
  if (demandPerHour <= 0) return Infinity;
  const available = Math.max(currentVolume - minOperationalLevel, 0);
  return roundTo(available / demandPerHour, 1);
}

/**
 * Tempo de recarga até a capacidade máxima.
 * Resultado em horas.
 */
export function calculateRechargeTime(
  currentVolume: number,
  maxCapacity: number,
  rechargeRate: number,
): number {
  if (rechargeRate <= 0) return Infinity;
  const deficit = Math.max(maxCapacity - currentVolume, 0);
  return roundTo(deficit / rechargeRate, 1);
}
