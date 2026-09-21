/**
 * Motor de cálculo determinístico da recomendação técnica de aplicação.
 *
 * Este módulo NÃO decide agronomia. Ele recebe a OS já decidida (produto, dose
 * total, área) e deriva, por regra fixa e auditável:
 *   - dose por hectare;
 *   - conferência da logística de embalagens (retirada × capacidade × sobra);
 *   - plano de calda, quando a taxa de aplicação (L/ha) é informada pelo operador.
 *
 * A decisão do que aplicar continua sendo do responsável técnico. Aqui só
 * organizamos e conferimos os números para evitar erro operacional no campo.
 */

import { roundTo } from "@/utils/math";
import type {
  ServiceOrder,
  ServiceOrderInput,
} from "./service-order.types";

/** Severidade de um aviso de validação. */
export type WarningLevel = "info" | "atencao" | "critico";

/** Aviso gerado ao conferir a coerência dos números da OS. */
export interface ValidationWarning {
  level: WarningLevel;
  /** Insumo relacionado (ou null quando é da OS como um todo). */
  inputCode: string | null;
  message: string;
}

/** Dose e conferência logística derivadas de um insumo. */
export interface InputRecommendation {
  code: string;
  description: string;
  unit: string;
  /** Dose por hectare = consumido / área. */
  doseByArea: number;
  /** Consumo total previsto (da OS). */
  consumed: number;
  /** Total a retirar do estoque (da OS). */
  withdrawn: number;
  /** Embalagens a retirar (da OS). */
  packageCount: number;
  /** Capacidade de cada embalagem (da OS). */
  packageCapacity: number;
  /** Sobra calculada = retirado − consumido. */
  leftover: number;
}

/** Plano de calda derivado da taxa de aplicação informada. */
export interface CaldaPlan {
  /** Taxa de aplicação informada pelo operador (L de calda por hectare). */
  applicationRate: number;
  /** Volume total de calda = taxa × área. */
  totalVolume: number;
  /** Capacidade do tanque informada (L), quando disponível. */
  tankCapacity: number | null;
  /** Nº de tanques cheios necessários (arredondado para cima). */
  tanksNeeded: number | null;
}

/** Recomendação técnica completa, pronta para virar mensagem ou PDF. */
export interface ServiceOrderRecommendation {
  order: ServiceOrder;
  inputs: InputRecommendation[];
  calda: CaldaPlan | null;
  warnings: ValidationWarning[];
  generatedAt: Date;
}

/** Parâmetros operacionais informados pelo operador (não vêm da OS). */
export interface OperationalParams {
  /** Taxa de aplicação de calda em L/ha. Sem ela, o plano de calda não é gerado. */
  applicationRate?: number;
  /** Capacidade do tanque do pulverizador em litros. */
  tankCapacity?: number;
}

/** Tolerância para conferência de igualdade entre valores da OS (arredondamento). */
const EQUALITY_TOLERANCE = 0.011;

function buildInputRecommendation(input: ServiceOrderInput, area: number): InputRecommendation {
  const doseByArea = area > 0 ? input.consumedQuantity / area : 0;
  const leftover = input.withdrawnQuantity - input.consumedQuantity;
  return {
    code: input.code,
    description: input.description,
    unit: input.unit,
    doseByArea: roundTo(doseByArea, 4),
    consumed: roundTo(input.consumedQuantity, 4),
    withdrawn: roundTo(input.withdrawnQuantity, 4),
    packageCount: input.packageCount,
    packageCapacity: roundTo(input.packageCapacity, 4),
    leftover: roundTo(leftover, 4),
  };
}

/** Confere a coerência dos números de um insumo e acumula avisos. */
function validateInput(input: ServiceOrderInput, warnings: ValidationWarning[]): void {
  const { code } = input;

  // Retirada deveria bater com capacidade × nº de embalagens.
  const expectedWithdrawn = input.packageCapacity * input.packageCount;
  if (Math.abs(expectedWithdrawn - input.withdrawnQuantity) > EQUALITY_TOLERANCE) {
    warnings.push({
      level: "atencao",
      inputCode: code,
      message: `Retirada (${input.withdrawnQuantity}) não bate com ${input.packageCount} embalagens de ${input.packageCapacity} (= ${roundTo(expectedWithdrawn, 4)}). Conferir na retirada.`,
    });
  }

  // Consumo não pode ser maior que o retirado.
  if (input.consumedQuantity > input.withdrawnQuantity + EQUALITY_TOLERANCE) {
    warnings.push({
      level: "critico",
      inputCode: code,
      message: `Consumo previsto (${input.consumedQuantity}) é maior que a retirada (${input.withdrawnQuantity}). Revisar a OS antes de aplicar.`,
    });
  }

  // Sobra calculada deveria bater com a previsão da OS.
  const computedLeftover = input.withdrawnQuantity - input.consumedQuantity;
  if (Math.abs(computedLeftover - input.expectedLeftover) > EQUALITY_TOLERANCE) {
    warnings.push({
      level: "info",
      inputCode: code,
      message: `Sobra calculada (${roundTo(computedLeftover, 4)}) difere da prevista na OS (${input.expectedLeftover}).`,
    });
  }
}

function buildCaldaPlan(area: number, params: OperationalParams): CaldaPlan | null {
  const rate = params.applicationRate;
  if (rate == null || rate <= 0) return null;

  const totalVolume = roundTo(rate * area, 1);
  const tankCapacity = params.tankCapacity && params.tankCapacity > 0 ? params.tankCapacity : null;
  const tanksNeeded = tankCapacity ? Math.ceil(totalVolume / tankCapacity) : null;

  return {
    applicationRate: rate,
    totalVolume,
    tankCapacity,
    tanksNeeded,
  };
}

/**
 * Gera a recomendação técnica determinística a partir da OS estruturada.
 *
 * @param order  OS já normalizada (ver os-parsing.ts).
 * @param params Parâmetros operacionais (taxa de calda, capacidade do tanque).
 */
export function buildRecommendation(
  order: ServiceOrder,
  params: OperationalParams = {},
): ServiceOrderRecommendation {
  const warnings: ValidationWarning[] = [];
  const { area } = order.location;

  if (area <= 0) {
    warnings.push({
      level: "critico",
      inputCode: null,
      message: "Área da OS é zero ou inválida — dose por hectare não pode ser calculada.",
    });
  }

  const inputs = order.inputs.map((input) => {
    validateInput(input, warnings);
    return buildInputRecommendation(input, area);
  });

  return {
    order,
    inputs,
    calda: buildCaldaPlan(area, params),
    warnings,
    generatedAt: new Date(),
  };
}
