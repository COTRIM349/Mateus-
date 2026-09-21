/**
 * Mapeamento entre a recomendação de domínio e a linha da tabela service_orders.
 *
 * Funções puras (sem acesso ao banco) para manter o mapeamento testável. As
 * chamadas ao Supabase ficam na tela, no padrão do restante do app.
 */

import type { ServiceOrderRecommendation } from "./os-calculations";
import type { RawServiceOrder, RawServiceOrderInput } from "./os-parsing";
import type { ServiceOrder } from "./service-order.types";

/** Linha a inserir em service_orders (sem id/timestamps, gerados no banco). */
export interface ServiceOrderInsert {
  farm_id: string;
  os_number: string;
  os_date: string | null;
  team: string;
  production_period: string;
  operation_code: string;
  operation_description: string;
  os_farm_name: string;
  pivot_label: string;
  quadrant: string | null;
  area: number;
  order_data: ServiceOrder;
  application_rate: number | null;
  tank_capacity: number | null;
  whatsapp_message: string;
  warnings: ServiceOrderRecommendation["warnings"];
  created_by: string | null;
}

/** Linha completa lida de service_orders. */
export interface ServiceOrderRow extends ServiceOrderInsert {
  id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Monta a linha de inserção a partir da recomendação gerada.
 */
export function buildServiceOrderInsert(
  farmId: string,
  rec: ServiceOrderRecommendation,
  whatsappMessage: string,
  createdBy: string | null = null,
): ServiceOrderInsert {
  const { order, calda } = rec;
  return {
    farm_id: farmId,
    os_number: order.number,
    os_date: order.date,
    team: order.team,
    production_period: order.productionPeriod,
    operation_code: order.operation.code,
    operation_description: order.operation.description,
    os_farm_name: order.location.farm,
    pivot_label: order.location.pivot,
    quadrant: order.location.quadrant,
    area: order.location.area,
    order_data: order,
    application_rate: calda?.applicationRate ?? null,
    tank_capacity: calda?.tankCapacity ?? null,
    whatsapp_message: whatsappMessage,
    warnings: rec.warnings,
    created_by: createdBy,
  };
}

/** Converte um número para string no formato BR (vírgula decimal). */
function numberToBr(value: number): string {
  return String(value).replace(".", ",");
}

/**
 * Converte uma OS normalizada de volta ao formato cru do formulário,
 * para reabrir um registro salvo na tela.
 */
export function orderToRaw(order: ServiceOrder): RawServiceOrder {
  const inputs: RawServiceOrderInput[] = order.inputs.map((input) => ({
    code: input.code,
    description: input.description,
    erpCode: input.erpCode,
    unit: input.unit,
    consumedQuantity: numberToBr(input.consumedQuantity),
    packageCapacity: numberToBr(input.packageCapacity),
    packageCount: numberToBr(input.packageCount),
    withdrawnQuantity: numberToBr(input.withdrawnQuantity),
    expectedLeftover: numberToBr(input.expectedLeftover),
  }));

  return {
    number: order.number,
    date: order.date ? order.date.split("-").reverse().join("/") : "",
    team: order.team,
    productionPeriod: order.productionPeriod,
    operationCode: order.operation.code,
    operationDescription: order.operation.description,
    farm: order.location.farm,
    pivot: order.location.pivot,
    quadrant: order.location.quadrant ?? "",
    area: numberToBr(order.location.area),
    inputs,
  };
}
