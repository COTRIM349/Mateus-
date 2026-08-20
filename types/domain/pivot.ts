export type OperationalStatus = "irrigando" | "parado" | "manutencao" | "alerta";
export type Priority = "alta" | "media" | "baixa";

/**
 * Equipamento permanente (ficha técnica).
 * Cultura, cultivar, estádio, safra e Kc pertencem à parcela — não ao pivô.
 * Status operacional não é cadastro: deriva da operação.
 */
export interface Pivot {
  id: string;
  farmId: string;
  moduleId: string | null;
  soilId: string | null;
  name: string;
  code: string | null;
  /** Área irrigável em hectares. */
  area: number;
  /** Raio do pivô em metros. */
  radius: number;
  /** Vazão nominal em m³/h. */
  flowRate: number;
  /** Potência da bomba em CV. */
  pumpPower: number;
  /** Eficiência de aplicação — 0 a 1. Distinta do CUC. */
  efficiency: number;
  latitude: number;
  longitude: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PivotIrrigationRecommendation {
  pivotId: string;
  pivotName: string;
  moduleName: string;
  cultureName: string;
  cropStage: string;
  area: number;
  /** Déficit hídrico em mm. */
  deficit: number;
  /** Lâmina recomendada em mm. */
  recommendedDepth: number;
  /** Tempo de irrigação em horas. */
  irrigationTime: number;
  /** Volume necessário em m³. */
  volume: number;
  /** Energia estimada em kWh. */
  energy: number;
  /** Custo estimado em R$. */
  cost: number;
  priority: Priority;
  status: OperationalStatus;
  /** Risco produtivo de 0 a 100. */
  productiveRisk: number;
}
