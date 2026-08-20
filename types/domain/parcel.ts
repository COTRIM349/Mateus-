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
  status: ParcelStatus;
}
