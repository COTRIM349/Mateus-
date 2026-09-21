/**
 * Parsing e normalização da Ordem de Serviço.
 *
 * A extração (foto/PDF do TOTVS) devolve valores como texto, no formato
 * brasileiro: "9,90000", "10,00000", "150,00", "1.234,56". Aqui esses valores
 * viram números de verdade e a OS crua é normalizada na estrutura tipada.
 *
 * Regra de ouro: nunca confiar cego na extração. Toda a normalização é
 * validada depois pelo motor de cálculo (ver os-calculations.ts).
 */

import type {
  InputUnit,
  ServiceOrder,
  ServiceOrderInput,
} from "./service-order.types";

const KNOWN_UNITS: InputUnit[] = ["LT", "KG", "UN", "ML", "GR"];

/**
 * Converte um número no formato brasileiro para `number`.
 *
 * - Vírgula é sempre o separador decimal ("9,90" → 9.9).
 * - Ponto é separador de milhar quando há vírgula ("1.234,56" → 1234.56).
 * - Sem vírgula, o ponto é tratado como decimal ("0.066" → 0.066).
 *
 * Retorna `null` quando a string não representa um número válido, para que
 * o chamador decida o que fazer (nunca assume zero silenciosamente).
 */
export function parseBrazilianNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let text = raw.trim();
  if (text === "") return null;

  // Remove símbolos de unidade/moeda e espaços, preservando dígitos e separadores.
  text = text.replace(/[^0-9.,-]/g, "");
  if (text === "" || text === "-") return null;

  const hasComma = text.includes(",");
  if (hasComma) {
    // Vírgula é decimal; pontos são milhar.
    text = text.replace(/\./g, "").replace(",", ".");
  }
  // Sem vírgula: o ponto (se houver) já é decimal.

  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Normaliza a unidade textual para um `InputUnit` conhecido (fallback: "UN"). */
export function normalizeUnit(raw: string | null | undefined): InputUnit {
  const upper = (raw ?? "").trim().toUpperCase();
  return KNOWN_UNITS.includes(upper as InputUnit) ? (upper as InputUnit) : "UN";
}

/**
 * Converte uma data "DD/MM/AAAA" (com hora opcional) para ISO "AAAA-MM-DD".
 * Retorna `null` se não reconhecer o formato.
 */
export function parseBrazilianDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  return `${year}-${month}-${day}`;
}

/** Formato cru de um insumo, como sai da extração (campos em texto). */
export interface RawServiceOrderInput {
  code?: string;
  description?: string;
  erpCode?: string;
  unit?: string;
  consumedQuantity?: string | number;
  packageCapacity?: string | number;
  packageCount?: string | number;
  withdrawnQuantity?: string | number;
  expectedLeftover?: string | number;
}

/** Formato cru da OS, como sai da extração (todos os campos em texto). */
export interface RawServiceOrder {
  number?: string;
  date?: string;
  team?: string;
  productionPeriod?: string;
  operationCode?: string;
  operationDescription?: string;
  inputs?: RawServiceOrderInput[];
  farm?: string;
  pivot?: string;
  quadrant?: string;
  area?: string | number;
}

/** Erro de normalização com o campo problemático. */
export class ServiceOrderParseError extends Error {
  constructor(
    message: string,
    /** Campo que faltou ou ficou inválido. */
    readonly field: string,
  ) {
    super(message);
    this.name = "ServiceOrderParseError";
  }
}

function requireNumber(raw: string | number | undefined, field: string): number {
  const value = parseBrazilianNumber(raw ?? null);
  if (value == null) {
    throw new ServiceOrderParseError(`Campo numérico ausente ou inválido: ${field}`, field);
  }
  return value;
}

function requireText(raw: string | undefined, field: string): string {
  const value = (raw ?? "").trim();
  if (value === "") {
    throw new ServiceOrderParseError(`Campo obrigatório ausente: ${field}`, field);
  }
  return value;
}

/**
 * Normaliza uma OS crua (texto) na estrutura tipada e numérica.
 *
 * Lança `ServiceOrderParseError` quando um campo essencial falta ou é inválido,
 * deixando claro ONDE a extração falhou — em vez de gerar uma recomendação
 * silenciosamente errada.
 */
export function normalizeServiceOrder(raw: RawServiceOrder): ServiceOrder {
  const rawInputs = raw.inputs ?? [];
  if (rawInputs.length === 0) {
    throw new ServiceOrderParseError("A OS não tem nenhum insumo.", "inputs");
  }

  const inputs: ServiceOrderInput[] = rawInputs.map((input, index) => {
    const label = input.description?.trim() || `insumo #${index + 1}`;
    return {
      code: requireText(input.code, `${label}: código`),
      description: requireText(input.description, `insumo #${index + 1}: descrição`),
      erpCode: (input.erpCode ?? "").trim(),
      unit: normalizeUnit(input.unit),
      consumedQuantity: requireNumber(input.consumedQuantity, `${label}: quantidade consumida`),
      packageCapacity: requireNumber(input.packageCapacity, `${label}: capacidade da embalagem`),
      packageCount: requireNumber(input.packageCount, `${label}: quantidade de embalagens`),
      withdrawnQuantity: requireNumber(input.withdrawnQuantity, `${label}: quantidade retirada`),
      expectedLeftover: parseBrazilianNumber(input.expectedLeftover ?? null) ?? 0,
    };
  });

  return {
    number: requireText(raw.number, "número da OS"),
    date: parseBrazilianDate(raw.date),
    team: requireText(raw.team, "equipe"),
    productionPeriod: (raw.productionPeriod ?? "").trim(),
    operation: {
      code: (raw.operationCode ?? "").trim(),
      description: requireText(raw.operationDescription, "operação"),
    },
    inputs,
    location: {
      farm: requireText(raw.farm, "fazenda"),
      pivot: requireText(raw.pivot, "pivô"),
      quadrant: raw.quadrant?.trim() || null,
      area: requireNumber(raw.area, "área"),
    },
  };
}
