export type CropStage =
  | "germinacao"
  | "vegetativo"
  | "floracao"
  | "enchimento"
  | "maturacao"
  | "colheita";

export interface Culture {
  id: string;
  name: string;
  scientificName: string;
  /** Coeficiente de cultura (Kc) por estágio fenológico. */
  kcByStage: Record<CropStage, number>;
  /** Profundidade efetiva das raízes em metros. */
  rootDepth: number;
  /** Fator de disponibilidade de água (p) — 0 a 1. */
  depletionFactor: number;
  /** Ciclo total em dias. */
  cycleDays: number;
}
