export type ParcelStatus = "rascunho" | "ativa" | "encerrada" | "cancelada";

/** Unidade agronômica e temporal de manejo. Não pertence à ficha do pivô. */
export interface Parcel {
  id: string;
  name: string | null;
  pivotId: string;
  seasonId: string;
  cultureId: string;
  plantedAreaHa: number | null;
  plantingDate: string;
  /** Solo herdado do pivô no momento do ciclo. */
  soilId: string;
  /** Override de KL (0–1). Null = padrão 1 / perfil do solo. */
  klOverride: number | null;
  /** Ângulo inicial do quadrante (0° = norte, horário). Null = pivô inteiro. */
  startAngleDeg: number | null;
  /** Ângulo final do quadrante. Null = pivô inteiro. Geometria no centro/raio do pivô. */
  endAngleDeg: number | null;
  status: ParcelStatus;
}
