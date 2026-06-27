/**
 * Service de cálculos de custos e rateio.
 *
 * Isola toda a lógica de custo operacional e rateio entre pivôs/culturas.
 * Páginas NUNCA fazem estes cálculos diretamente.
 */

import { roundTo, sum } from "@/utils/math";

/**
 * Custo total de irrigação = custo de energia + custo de manutenção + outros.
 * Nesta etapa, o custo é simplificado para energia.
 */
export function calculateIrrigationCost(
  energyCost: number,
  maintenanceCost = 0,
  otherCosts = 0,
): number {
  return roundTo(energyCost + maintenanceCost + otherCosts, 2);
}

/**
 * Rateia um custo total entre pivôs proporcionalmente à área.
 * Retorna o mapa { pivotId: valor rateado }.
 */
export function apportionByArea(
  totalCost: number,
  pivots: Array<{ id: string; area: number }>,
): Record<string, number> {
  const totalArea = sum(pivots.map((p) => p.area));
  if (totalArea === 0) return {};

  const result: Record<string, number> = {};
  for (const pivot of pivots) {
    result[pivot.id] = roundTo((pivot.area / totalArea) * totalCost, 2);
  }
  return result;
}

/**
 * Rateia um custo total entre pivôs proporcionalmente ao volume consumido.
 */
export function apportionByVolume(
  totalCost: number,
  pivots: Array<{ id: string; volume: number }>,
): Record<string, number> {
  const totalVolume = sum(pivots.map((p) => p.volume));
  if (totalVolume === 0) return {};

  const result: Record<string, number> = {};
  for (const pivot of pivots) {
    result[pivot.id] = roundTo((pivot.volume / totalVolume) * totalCost, 2);
  }
  return result;
}

/**
 * Custo por hectare = custo total / área total.
 * Resultado em R$/ha.
 */
export function calculateCostPerHectare(totalCost: number, totalArea: number): number {
  if (totalArea <= 0) return 0;
  return roundTo(totalCost / totalArea, 2);
}
