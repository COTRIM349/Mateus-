export type CostCategory =
  | "energia"
  | "manutencao"
  | "mao_de_obra"
  | "insumos"
  | "depreciacao"
  | "outros";

export interface CostCenter {
  id: string;
  farmId: string;
  name: string;
  description: string;
  active: boolean;
}

export interface CostEntry {
  id: string;
  farmId: string;
  costCenterId: string;
  pivotId: string | null;
  cultureId: string | null;
  category: CostCategory;
  description: string;
  amount: number;
  date: Date;
  seasonId: string;
}

export interface CostApportionment {
  id: string;
  costEntryId: string;
  pivotId: string;
  cultureId: string;
  /** Percentual rateado (0-100). */
  percentage: number;
  /** Valor rateado em R$. */
  amount: number;
}
