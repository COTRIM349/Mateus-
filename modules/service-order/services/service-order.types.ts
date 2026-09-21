/**
 * Modelo de domínio da Ordem de Serviço (OS) de retirada de insumos agrícolas.
 *
 * Reflete o layout da "Requisição para Retirada de Insumos Agrícolas" do TOTVS
 * (relatório cfgcen-011), usado nas fazendas para operações de pulverização.
 *
 * IMPORTANTE — responsabilidade agronômica:
 * A OS já carrega a decisão técnica tomada por quem a emitiu (produto, dose,
 * alvo, área). Este módulo NÃO inventa agronomia: ele apenas estrutura o que
 * a OS decidiu e deriva valores por regra fixa e determinística.
 */

/** Unidade de medida do insumo, conforme cadastro no ERP. */
export type InputUnit = "LT" | "KG" | "UN" | "ML" | "GR";

/** Operação agrícola vinculada à OS (código + descrição do ERP). */
export interface ServiceOrderOperation {
  /** Código da operação no ERP (ex.: "1040"). */
  code: string;
  /** Descrição da operação (ex.: "PULVERIZACAO HERBICIDAS"). */
  description: string;
}

/**
 * Linha de insumo da OS.
 *
 * Todos os valores numéricos já vêm normalizados (ponto decimal),
 * prontos para cálculo — o parsing do formato brasileiro acontece antes.
 */
export interface ServiceOrderInput {
  /** Código do insumo (ex.: "21800041"). */
  code: string;
  /** Descrição do insumo (ex.: "AURORA - CARFENTRAZONA"). */
  description: string;
  /** Código ERP do insumo (ex.: "021800041"). */
  erpCode: string;
  /** Unidade de medida. */
  unit: InputUnit;
  /** Quantidade a ser consumida na operação, na unidade do insumo. */
  consumedQuantity: number;
  /** Capacidade de cada embalagem, na unidade do insumo. */
  packageCapacity: number;
  /** Quantidade de embalagens a retirar. */
  packageCount: number;
  /** Quantidade total a ser retirada do estoque. */
  withdrawnQuantity: number;
  /** Previsão de sobra informada na OS (retirado − consumido). */
  expectedLeftover: number;
}

/** Local de aplicação da OS. */
export interface ServiceOrderLocation {
  /** Nome da fazenda (ex.: "FAZENDA KARITEL"). */
  farm: string;
  /** Identificação do pivô (ex.: "PIVO 24"). */
  pivot: string;
  /** Quadrante do pivô, quando informado (ex.: "24"). */
  quadrant: string | null;
  /** Área de aplicação em hectares. */
  area: number;
}

/**
 * Ordem de Serviço estruturada e normalizada, pronta para os cálculos.
 */
export interface ServiceOrder {
  /** Número da OS (ex.: "33284"). */
  number: string;
  /** Data da OS no formato ISO (YYYY-MM-DD), quando disponível. */
  date: string | null;
  /** Equipe responsável (ex.: "EQUIPE DE PULVERIZACAO KARITEL"). */
  team: string;
  /** Período de produção / safra (ex.: "SOJA 26/27"). */
  productionPeriod: string;
  /** Operação agrícola. */
  operation: ServiceOrderOperation;
  /** Insumos requisitados. */
  inputs: ServiceOrderInput[];
  /** Local de aplicação. */
  location: ServiceOrderLocation;
}
