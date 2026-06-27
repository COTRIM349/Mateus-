export interface WaterBalanceEntry {
  id: string;
  pivotId: string;
  date: Date;
  /** ET0 — evapotranspiração de referência (mm/dia). */
  et0: number;
  /** Kc — coeficiente da cultura. */
  kc: number;
  /** ETc — evapotranspiração da cultura (mm/dia). */
  etc: number;
  /** Precipitação efetiva (mm). */
  effectivePrecipitation: number;
  /** Lâmina irrigada aplicada (mm). */
  appliedDepth: number;
  /** Déficit hídrico acumulado (mm). */
  deficit: number;
  /** Capacidade de água disponível (mm). */
  cad: number;
  /** Água facilmente disponível (mm). */
  afd: number;
  /** Armazenamento atual no solo (mm). */
  soilStorage: number;
}

export interface WaterBalanceParams {
  pivotId: string;
  cultureId: string;
  soilId: string;
  cropStage: string;
  /** Profundidade efetiva das raízes (m). */
  rootDepth: number;
  /** Eficiência do sistema de irrigação (0-1). */
  systemEfficiency: number;
}
