export type OperationalStatus = "irrigando" | "parado" | "manutencao" | "alerta";
export type Priority = "alta" | "media" | "baixa";

export interface Pivot {
  id: string;
  farmId: string;
  moduleId: string;
  seasonId: string;
  name: string;
  cultureId: string;
  soilId: string;
  cropStage: string;
  /** Área irrigada em hectares. */
  area: number;
  /** Raio do pivô em metros. */
  radius: number;
  /** Vazão nominal em m³/h. */
  flowRate: number;
  /** Potência da bomba em CV. */
  pumpPower: number;
  /** Eficiência do sistema de irrigação — 0 a 1. */
  efficiency: number;
  latitude: number;
  longitude: number;
  status: OperationalStatus;
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
