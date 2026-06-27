/**
 * Service de cálculos de energia.
 *
 * Isola toda a lógica de consumo energético e custo de bombeamento.
 * Páginas NUNCA fazem estes cálculos diretamente.
 */

import { CV_TO_KW } from "@/constants/agronomic";
import { roundTo } from "@/utils/math";
import type { EnergyCalculationInput } from "@/types/domain/energy";

/**
 * Consumo = (Potência_CV × 0.7355 / rendimento_motor) × tempo_horas.
 * Resultado em kWh.
 */
export function calculateEnergy(input: EnergyCalculationInput): number {
  const { pumpPower, irrigationTime, motorEfficiency } = input;
  const eff = motorEfficiency > 0 ? motorEfficiency : 0.85;
  const powerKW = (pumpPower * CV_TO_KW) / eff;
  return roundTo(powerKW * irrigationTime, 0);
}

/**
 * Custo = consumo_kWh × tarifa_R$/kWh.
 * Resultado em R$.
 */
export function calculateEnergyCost(
  consumptionKWh: number,
  tariffRate: number,
): number {
  return roundTo(consumptionKWh * tariffRate, 2);
}

/**
 * Calcula consumo e custo de uma vez.
 */
export function calculateEnergyAndCost(input: EnergyCalculationInput): {
  consumption: number;
  cost: number;
} {
  const consumption = calculateEnergy(input);
  const cost = calculateEnergyCost(consumption, input.tariffRate);
  return { consumption, cost };
}
